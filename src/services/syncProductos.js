import { pool } from '../db/pool.js';
import { listarCarpetasOP, obtenerCotizacionYLineas } from './opFolders.js';

export function normTexto(s) {
  return String(s ?? '').trim().replace(/\s+/g, ' ');
}

export function codigoProducto(lineaCatalogo, codColor) {
  const linea = normTexto(lineaCatalogo);
  const cod = normTexto(codColor);
  return cod ? `${linea}-${cod}` : linea;
}

const FORMATO_MAX = 100;

/**
 * Empareja las líneas ya guardadas de una OP con las de su Excel para completarles el formato (las líneas
 * antiguas se cargaron sin él). Primero por posición (el sync las inserta en el orden de la hoja) si coinciden
 * en cantidad y en código; si no, por código + acabado + cantidad, y solo cuando el formato resulta único.
 * Devuelve [{ id, formato }]; las líneas dudosas no se tocan.
 */
export function emparejarFormatos(itemsBD, lineasXlsx) {
  const lineas = lineasXlsx.map((l) => ({
    codigo: codigoProducto(l.lineaCatalogo, l.codColor),
    acabado: normTexto(l.acabado),
    total: Number(l.total),
    formato: normTexto(l.formato).slice(0, FORMATO_MAX) || null,
  }));
  const mismoCodigo = (i, l) => i.codigo === l.codigo;

  if (itemsBD.length === lineas.length && itemsBD.every((i, k) => mismoCodigo(i, lineas[k]))) {
    return itemsBD.map((i, k) => ({ id: i.id, formato: lineas[k].formato })).filter((a) => a.formato);
  }

  const resultado = [];
  for (const i of itemsBD) {
    const candidatos = lineas.filter(
      (l) => mismoCodigo(i, l) && l.acabado === normTexto(i.acabado) && Math.abs(l.total - Number(i.cantidad)) < 0.011
    );
    const formatos = new Set(candidatos.map((l) => l.formato).filter(Boolean));
    if (formatos.size === 1) resultado.push({ id: i.id, formato: [...formatos][0] });
  }
  return resultado;
}

/**
 * Recorre las carpetas de OP en SharePoint (una por OP, con su archivo "OP-XXXX.xlsx") y,
 * para cada una que ya exista en la base: asigna/crea su cotización y, si la OP todavía no
 * tiene líneas de producto cargadas, crea los productos del catálogo que falten y las
 * inserta en op_items. No toca OPs que ya tengan productos, para no duplicar ni pisar
 * seguimiento de producción ya registrado a mano.
 */
export async function sincronizarProductosDesdeCarpetas() {
  const carpetas = await listarCarpetasOP();

  const stats = {
    carpetas_total: carpetas.length,
    ops_con_productos_nuevos: 0,
    ops_migradas_a_detalle_completo: 0,
    ops_ya_tenian_productos: 0,
    ops_no_encontradas: 0,
    carpetas_sin_archivo_op: 0,
    productos_creados: 0,
    cotizaciones_creadas: 0,
    lineas_insertadas: 0,
    formatos_completados: 0,
    errores: [],
  };

  const conn = await pool.getConnection();
  try {
    for (const carpeta of carpetas) {
      try {
        const [[op]] = await conn.query(
          `SELECT o.id, o.proyecto_id, o.cliente_id, o.fecha_emision,
                  (SELECT COUNT(*) FROM op_items WHERE op_id = o.id) AS num_items
             FROM ops o WHERE o.numero_op = ?`,
          [carpeta.numeroOp]
        );
        if (!op) {
          stats.ops_no_encontradas++;
          continue;
        }

        const datos = await obtenerCotizacionYLineas(carpeta);
        if (!datos) {
          stats.carpetas_sin_archivo_op++;
          continue;
        }

        await conn.beginTransaction();

        if (datos.numeroCotizacion) {
          const [existentes] = await conn.query(
            'SELECT id FROM cotizaciones WHERE numero_cotizacion = ?',
            [datos.numeroCotizacion]
          );
          let cotizacionId;
          if (existentes.length) {
            cotizacionId = existentes[0].id;
          } else {
            const [res] = await conn.query(
              `INSERT INTO cotizaciones (numero_cotizacion, proyecto_id, cliente_id, fecha, estado)
               VALUES (?, ?, ?, ?, 'aprobada')`,
              [datos.numeroCotizacion, op.proyecto_id, op.cliente_id, op.fecha_emision]
            );
            cotizacionId = res.insertId;
            stats.cotizaciones_creadas++;
          }
          await conn.query('UPDATE ops SET cotizacion_id = ? WHERE id = ?', [cotizacionId, op.id]);
        }

        let numItems = op.num_items;
        let migrada = false;
        if (numItems > 0) {
          const [items] = await conn.query('SELECT id, acabado FROM op_items WHERE op_id = ?', [op.id]);
          const esDetalleViejo = items.every((i) => i.acabado === null);
          let tieneSeguimiento = false;
          if (esDetalleViejo && items.length > 0) {
            const [[{ total }]] = await conn.query(
              `SELECT COUNT(*) AS total FROM seguimiento_etapas WHERE op_item_id IN (${items.map(() => '?').join(',')})`,
              items.map((i) => i.id)
            );
            tieneSeguimiento = total > 0;
          }
          if (esDetalleViejo && !tieneSeguimiento) {
            // Líneas de una sincronización anterior a que existieran estos campos, y sin
            // seguimiento de producción registrado todavía: es seguro reemplazarlas por la
            // versión completa en vez de dejarlas con acabado/cajas/notas vacíos para siempre.
            await conn.query('DELETE FROM op_items WHERE op_id = ?', [op.id]);
            numItems = 0;
            migrada = true;
          }
        }

        if (numItems > 0) {
          stats.ops_ya_tenian_productos++;
          // Completa el formato de las líneas antiguas sin tocar nada más (no pisa el seguimiento registrado).
          const [sinFormato] = await conn.query(
            `SELECT oi.id, pr.codigo, oi.acabado, oi.cantidad, oi.formato
               FROM op_items oi JOIN productos pr ON pr.id = oi.producto_id
              WHERE oi.op_id = ? ORDER BY oi.id`,
            [op.id]
          );
          if (sinFormato.some((i) => i.formato === null)) {
            for (const a of emparejarFormatos(sinFormato, datos.lineas)) {
              const previo = sinFormato.find((i) => i.id === a.id);
              if (previo.formato !== null) continue;
              await conn.query('UPDATE op_items SET formato = ? WHERE id = ?', [a.formato, a.id]);
              stats.formatos_completados++;
            }
          }
        } else if (datos.lineas.length > 0) {
          for (const linea of datos.lineas) {
            const codigo = codigoProducto(linea.lineaCatalogo, linea.codColor);
            const [existentes] = await conn.query('SELECT id FROM productos WHERE codigo = ?', [codigo]);
            let productoId;
            if (existentes.length) {
              productoId = existentes[0].id;
            } else {
              const [res] = await conn.query(
                `INSERT INTO productos (codigo, nombre, formato, unidad_medida) VALUES (?, ?, ?, ?)`,
                [codigo, normTexto(linea.lineaCatalogo), normTexto(linea.formato), normTexto(linea.unidadMedida) || 'unidad']
              );
              productoId = res.insertId;
              stats.productos_creados++;
            }

            await conn.query(
              `INSERT INTO op_items (op_id, producto_id, acabado, formato, cajas, m2_x_caja, cantidad, notas, estado)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')`,
              [
                op.id,
                productoId,
                normTexto(linea.acabado) || null,
                normTexto(linea.formato).slice(0, FORMATO_MAX) || null,
                linea.cajas,
                linea.m2xCaja,
                linea.total,
                normTexto(linea.notas) || null,
              ]
            );
            stats.lineas_insertadas++;
          }
          if (migrada) stats.ops_migradas_a_detalle_completo++;
          else stats.ops_con_productos_nuevos++;
        }

        await conn.commit();
      } catch (err) {
        await conn.rollback().catch(() => {});
        stats.errores.push({ op: carpeta.numeroOp, carpeta: carpeta.name, mensaje: err.message });
      }
    }
  } finally {
    conn.release();
  }

  return stats;
}
