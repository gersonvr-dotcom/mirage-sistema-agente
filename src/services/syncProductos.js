import { pool } from '../db/pool.js';
import { listarCarpetasOP, obtenerCotizacionYLineas } from './opFolders.js';

function normTexto(s) {
  return String(s ?? '').trim().replace(/\s+/g, ' ');
}

function codigoProducto(lineaCatalogo, codColor) {
  const linea = normTexto(lineaCatalogo);
  const cod = normTexto(codColor);
  return cod ? `${linea}-${cod}` : linea;
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
              `INSERT INTO op_items (op_id, producto_id, acabado, cajas, m2_x_caja, cantidad, notas, estado)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente')`,
              [
                op.id,
                productoId,
                normTexto(linea.acabado) || null,
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
