import { pool } from '../db/pool.js';
import { listarCarpetasOP } from './opFolders.js';
import { obtenerCotizacionXlsx } from './cotizacionFolders.js';
import { codigoProducto, normTexto } from './syncProductos.js';
import { claveTexto, distancia } from './proyectoNormalizer.js';

const TOLERANCIA_CANTIDAD = 0.011;
const MAX_ADVERTENCIAS = 60;

const redondear = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
// Sin espacios: la OP escribe "EY 01" y la cotización "EY01" para el mismo código.
const compacta = (s) => claveTexto(s ?? '').replace(/\s+/g, '');
export const claveItem = (codigoOTexto, acabado) => `${compacta(codigoOTexto)}|${compacta(acabado)}`;
// Los textos de una cotización a medida pueden superar el tamaño de la columna.
const corta = (valor, max) => (valor === null || valor === undefined ? null : String(valor).slice(0, max));

/** Reutiliza un proveedor existente si el nombre es igual o casi igual (typo o letras cambiadas de lugar: MIRGAE ≈ MIRAGE). */
export function buscarProveedorParecido(nombre, proveedores) {
  const k = compacta(nombre);
  const letras = (x) => [...x].sort().join('');
  return (
    proveedores.find((p) => {
      const pk = compacta(p.nombre);
      if (pk === k) return true;
      if (Math.min(pk.length, k.length) < 5) return false;
      return letras(pk) === letras(k) || distancia(pk, k) <= 1;
    }) ?? null
  );
}

/**
 * Empareja las líneas de una OP (op_items) con las líneas de su cotización para copiarles el precio.
 * op_items no guarda el formato (productos.formato solo conserva el primero visto), así que la clave es
 * código de producto + acabado, y lo que desambigua es la cantidad en m²:
 *  1) una línea de cotización sin usar cuya cantidad final coincide con la del ítem;
 *  2) si no, un precio único entre las candidatas (aunque haya varias líneas);
 *  3) si no, queda 'ambiguo' y no se asigna ningún precio.
 * @param items [{id, cantidad, clave, claveSinAcabado}] en orden de id
 * @param lineas [{clave, claveSinAcabado, cantidadFinal, precioUnitario, ...}]
 */
export function emparejarPrecios(items, lineas) {
  const pares = new Map();
  const ambiguos = [];
  const sinCoincidencia = [];
  const usadas = new Set();

  for (const item of items) {
    let candidatas = lineas.filter((l) => l.clave === item.clave);
    if (candidatas.length === 0) candidatas = lineas.filter((l) => l.claveSinAcabado === item.claveSinAcabado);
    if (candidatas.length === 0) {
      sinCoincidencia.push(item.id);
      continue;
    }
    const porCantidad = candidatas.find((l) => !usadas.has(l) && Math.abs(l.cantidadFinal - item.cantidad) <= TOLERANCIA_CANTIDAD);
    if (porCantidad) {
      usadas.add(porCantidad);
      pares.set(item.id, porCantidad);
    } else if (new Set(candidatas.map((l) => l.precioUnitario)).size === 1) {
      pares.set(item.id, candidatas[0]);
    } else {
      ambiguos.push(item.id);
    }
  }
  return { pares, ambiguos, sinCoincidencia };
}

/**
 * Recorre las carpetas de OP de SharePoint, lee el XLSX de cotización de cada una y guarda en la base:
 *  - cotizaciones: fecha real, moneda, gran total, descuento, subtotal, IVA, total (con IVA) y anticipo;
 *  - cotizacion_items: las líneas con su precio unitario e importe (se reemplazan en cada corrida);
 *  - op_items: precio de venta, moneda, descuento e importe de las líneas de esa OP, y el proveedor (FÁBRICA)
 *    cuando el ítem no tenía uno. No toca estados ni seguimiento de producción.
 */
export async function sincronizarCotizacionesDesdeCarpetas() {
  const carpetas = await listarCarpetasOP();
  const stats = {
    carpetas_total: carpetas.length,
    ops_no_encontradas: 0,
    carpetas_sin_xlsx: 0,
    cotizaciones_sin_datos: 0,
    cotizaciones_creadas: 0,
    cotizaciones_actualizadas: 0,
    lineas_guardadas: 0,
    items_con_precio: 0,
    items_precio_ambiguo: 0,
    items_sin_coincidencia: 0,
    items_con_proveedor: 0,
    advertencias: [],
    errores: [],
  };
  const advertir = (op, cotizacion, mensaje) => {
    if (stats.advertencias.length < MAX_ADVERTENCIAS) stats.advertencias.push({ op, cotizacion, mensaje });
  };

  const productoCache = new Map();
  const proveedorCache = new Map();
  const conn = await pool.getConnection();
  try {
    const [proveedoresExistentes] = await conn.query('SELECT id, nombre FROM proveedores');
    for (const carpeta of carpetas) {
      try {
        const [[op]] = await conn.query('SELECT id, proyecto_id, cliente_id, fecha_emision, cotizacion_id FROM ops WHERE numero_op = ?', [carpeta.numeroOp]);
        if (!op) {
          stats.ops_no_encontradas++;
          continue;
        }

        const cot = await obtenerCotizacionXlsx(carpeta);
        if (!cot) {
          stats.carpetas_sin_xlsx++;
          continue;
        }
        if (cot.error || !cot.numeroCotizacion || cot.lineas.length === 0) {
          stats.cotizaciones_sin_datos++;
          advertir(carpeta.numeroOp, cot.numeroCotizacion ?? cot.archivo, cot.error ?? 'Sin número de cotización o sin líneas con precio.');
          continue;
        }
        for (const a of cot.advertencias) advertir(carpeta.numeroOp, cot.numeroCotizacion, a);

        const gran = cot.pie.granTotal ?? cot.sumaLineas;
        const descuento = cot.pie.descuento ?? null;
        const descuentoPct = descuento && gran ? redondear((descuento / gran) * 100) : null;
        // subtotal = gran total - descuento, siempre: el renglón SUBTOTAL del XLSX a veces ya incluye el transporte.
        const subtotal = redondear(gran - (descuento ?? 0));
        const iva = cot.pie.iva ?? null;
        const transporte = cot.pie.transporte ?? null;
        const total = cot.pie.valorTotal ?? redondear(subtotal + (transporte ?? 0) + (iva ?? 0));

        await conn.beginTransaction();

        const [existente] = await conn.query('SELECT id FROM cotizaciones WHERE numero_cotizacion = ?', [cot.numeroCotizacion]);
        let cotizacionId;
        if (existente.length) {
          cotizacionId = existente[0].id;
          stats.cotizaciones_actualizadas++;
        } else {
          const [res] = await conn.query(
            `INSERT INTO cotizaciones (numero_cotizacion, proyecto_id, cliente_id, fecha, estado) VALUES (?, ?, ?, ?, 'aprobada')`,
            [cot.numeroCotizacion, op.proyecto_id, op.cliente_id, cot.fecha ?? op.fecha_emision]
          );
          cotizacionId = res.insertId;
          stats.cotizaciones_creadas++;
        }
        await conn.query(
          `UPDATE cotizaciones
              SET fecha = COALESCE(?, fecha), moneda = ?, gran_total = ?, descuento_total = ?, descuento_pct = ?,
                  subtotal = ?, impuesto = ?, transporte = ?, total = ?, anticipo_pct = ?
            WHERE id = ?`,
          [cot.fecha, cot.moneda, gran, descuento, descuentoPct, subtotal, iva, transporte, total, cot.anticipoPct, cotizacionId]
        );
        if (!op.cotizacion_id) await conn.query('UPDATE ops SET cotizacion_id = ? WHERE id = ?', [cotizacionId, op.id]);

        await conn.query('DELETE FROM cotizacion_items WHERE cotizacion_id = ?', [cotizacionId]);
        const lineasEmparejables = [];
        for (const l of cot.lineas) {
          const codigo = l.lineaCatalogo ? codigoProducto(l.lineaCatalogo, l.codColor) : null;
          let productoId = null;
          if (codigo) {
            if (!productoCache.has(codigo)) {
              const [p] = await conn.query('SELECT id FROM productos WHERE codigo = ?', [codigo]);
              productoCache.set(codigo, p.length ? p[0].id : null);
            }
            productoId = productoCache.get(codigo);
          }
          await conn.query(
            `INSERT INTO cotizacion_items
               (cotizacion_id, orden, area, fabrica, producto_id, linea_catalogo, cod_color, acabado, formato, descripcion,
                cantidad, unidad_medida, cantidad_final, precio_unitario, concepto_precio, importe)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [cotizacionId, l.orden, corta(l.area, 150), corta(l.fabrica, 80), productoId, corta(l.lineaCatalogo, 150), corta(l.codColor, 80),
              corta(l.acabado, 60), corta(l.formato, 100), corta(l.descripcion, 255), l.cantidad, corta(l.unidad, 30), l.cantidadFinal,
              l.precioUnitario, l.conceptoPrecio, l.importe]
          );
          stats.lineas_guardadas++;
          const texto = codigo ?? l.descripcion;
          lineasEmparejables.push({
            ...l,
            clave: claveItem(texto, l.acabado),
            claveSinAcabado: claveItem(texto, ''),
            cantidadFinal: l.cantidadFinal ?? l.cantidad ?? 0,
          });
        }

        const [items] = await conn.query(
          `SELECT oi.id, oi.cantidad, oi.acabado, oi.proveedor_id, p.codigo
             FROM op_items oi JOIN productos p ON p.id = oi.producto_id
            WHERE oi.op_id = ? ORDER BY oi.id`,
          [op.id]
        );
        const paraEmparejar = items.map((i) => ({
          id: i.id,
          cantidad: Number(i.cantidad),
          clave: claveItem(i.codigo, i.acabado),
          claveSinAcabado: claveItem(i.codigo, ''),
        }));
        const { pares, ambiguos, sinCoincidencia } = emparejarPrecios(paraEmparejar, lineasEmparejables);
        stats.items_precio_ambiguo += ambiguos.length;
        stats.items_sin_coincidencia += sinCoincidencia.length;
        if (sinCoincidencia.length) advertir(carpeta.numeroOp, cot.numeroCotizacion, `${sinCoincidencia.length} línea(s) de la OP no figuran en la cotización (producto o acabado distinto): sin precio asignado.`);
        if (ambiguos.length) advertir(carpeta.numeroOp, cot.numeroCotizacion, `${ambiguos.length} línea(s) de la OP con varios precios posibles: sin precio asignado.`);

        for (const item of items) {
          const linea = pares.get(item.id);
          if (!linea) continue;
          const importe = redondear(linea.precioUnitario * Number(item.cantidad) * (1 - (descuentoPct ?? 0) / 100));
          await conn.query('UPDATE op_items SET precio_unitario = ?, moneda = ?, descuento_pct = ?, importe_total = ? WHERE id = ?', [
            linea.precioUnitario, cot.moneda, descuentoPct, importe, item.id,
          ]);
          stats.items_con_precio++;

          const fabrica = normTexto(linea.fabrica).toUpperCase().slice(0, 150);
          if (fabrica && !item.proveedor_id) {
            if (!proveedorCache.has(fabrica)) {
              const parecido = buscarProveedorParecido(fabrica, proveedoresExistentes);
              if (parecido) proveedorCache.set(fabrica, parecido.id);
              else {
                const nuevoId = (await conn.query('INSERT INTO proveedores (nombre) VALUES (?)', [fabrica]))[0].insertId;
                proveedoresExistentes.push({ id: nuevoId, nombre: fabrica });
                proveedorCache.set(fabrica, nuevoId);
              }
            }
            await conn.query('UPDATE op_items SET proveedor_id = ? WHERE id = ?', [proveedorCache.get(fabrica), item.id]);
            stats.items_con_proveedor++;
          }
        }

        await conn.commit();
      } catch (err) {
        await conn.rollback().catch(() => {});
        // Los cachés pudieron guardar ids creados dentro de la transacción que se deshizo.
        productoCache.clear();
        proveedorCache.clear();
        proveedoresExistentes.length = 0;
        proveedoresExistentes.push(...(await conn.query('SELECT id, nombre FROM proveedores'))[0]);
        stats.errores.push({ op: carpeta.numeroOp, carpeta: carpeta.name, mensaje: err.message });
      }
    }
  } finally {
    conn.release();
  }
  return stats;
}
