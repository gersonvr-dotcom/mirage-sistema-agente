import { pool } from '../db/pool.js';
import { obtenerFilasComerciales } from './sharepoint.js';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function esFechaValida(fecha) {
  return typeof fecha === 'string' && FECHA_RE.test(fecha);
}

/** Una fila del Excel entra al sync solo si trae OP, cliente, proyecto y una fecha de
 * pedido real (no vacía, ni texto tipo "VENTA DE STOCK" en la columna equivocada). */
function filaValida(f) {
  return Boolean(f.op) && Boolean(f.cliente) && Boolean(f.proyecto) && esFechaValida(f.fecha_pedido);
}

function normOc(oc) {
  if (oc === null || oc === undefined) return null;
  const s = String(oc).trim();
  if (s === '' || s.toUpperCase() === 'N/A' || s === '0') return null;
  return s;
}

function normObservaciones(obs) {
  if (!obs) return null;
  const s = String(obs).trim();
  return s === '' ? null : s;
}

function normFechaPactada(raw, observaciones) {
  if (!raw) return { fechaPactada: null, observaciones };
  const s = String(raw).trim();
  if (FECHA_RE.test(s)) return { fechaPactada: s, observaciones };
  const nota = s.toUpperCase() === 'N/A' ? null : s;
  if (!nota) return { fechaPactada: null, observaciones };
  if (observaciones && observaciones.toUpperCase() === nota.toUpperCase()) {
    return { fechaPactada: null, observaciones };
  }
  const merged = observaciones ? `${observaciones} | ${nota}` : nota;
  return { fechaPactada: null, observaciones: merged };
}

/**
 * Trae en vivo el Excel Madre 2026 desde SharePoint y sincroniza clientes, proyectos,
 * cotizaciones y OPs contra la base de datos: crea lo que no existe y actualiza (por
 * numero_op) lo que ya existía, para reflejar ediciones hechas en el Excel después de la
 * primera importación. Nunca toca `estado_general` de una OP existente, ya que ese campo
 * lo gestiona el flujo de producción dentro del sistema, no el Excel comercial.
 */
export async function sincronizarDesdeExcelMadre() {
  const filas = await obtenerFilasComerciales({ forzarRecarga: true });
  const validas = filas.filter(filaValida);

  const stats = {
    filas_excel: filas.length,
    filas_excluidas: filas.length - validas.length,
    filas_procesadas: validas.length,
    clientes_creados: 0,
    proyectos_creados: 0,
    cotizaciones_creadas: 0,
    ops_creadas: 0,
    ops_actualizadas: 0,
    errores: [],
  };

  const clienteCache = new Map();
  const proyectoCache = new Map();
  const cotizacionCache = new Map();

  const conn = await pool.getConnection();
  try {
    for (const r of validas) {
      await conn.beginTransaction();
      try {
        let clienteId = clienteCache.get(r.cliente);
        if (!clienteId) {
          const [existentes] = await conn.query('SELECT id FROM clientes WHERE nombre = ?', [r.cliente]);
          if (existentes.length) {
            clienteId = existentes[0].id;
          } else {
            const [res] = await conn.query('INSERT INTO clientes (nombre) VALUES (?)', [r.cliente]);
            clienteId = res.insertId;
            stats.clientes_creados++;
          }
          clienteCache.set(r.cliente, clienteId);
        }

        const proyectoKey = `${clienteId}::${r.proyecto}`;
        let proyectoId = proyectoCache.get(proyectoKey);
        if (!proyectoId) {
          const [existentes] = await conn.query(
            'SELECT id FROM proyectos WHERE cliente_id = ? AND nombre = ?',
            [clienteId, r.proyecto]
          );
          if (existentes.length) {
            proyectoId = existentes[0].id;
          } else {
            const [res] = await conn.query(
              'INSERT INTO proyectos (cliente_id, nombre) VALUES (?, ?)',
              [clienteId, r.proyecto]
            );
            proyectoId = res.insertId;
            stats.proyectos_creados++;
          }
          proyectoCache.set(proyectoKey, proyectoId);
        }

        const numeroCotizacion = normOc(r.cotizacion);
        let cotizacionId = null;
        if (numeroCotizacion) {
          cotizacionId = cotizacionCache.get(numeroCotizacion);
          if (!cotizacionId) {
            const [existentes] = await conn.query(
              'SELECT id FROM cotizaciones WHERE numero_cotizacion = ?',
              [numeroCotizacion]
            );
            if (existentes.length) {
              cotizacionId = existentes[0].id;
            } else {
              const [res] = await conn.query(
                `INSERT INTO cotizaciones (numero_cotizacion, proyecto_id, cliente_id, fecha, estado)
                 VALUES (?, ?, ?, ?, 'aprobada')`,
                [numeroCotizacion, proyectoId, clienteId, r.fecha_pedido]
              );
              cotizacionId = res.insertId;
              stats.cotizaciones_creadas++;
            }
            cotizacionCache.set(numeroCotizacion, cotizacionId);
          }
        }

        const { fechaPactada, observaciones } = normFechaPactada(r.fecha_pactada, normObservaciones(r.observaciones));
        const ocCliente = normOc(r.oc);

        const [opExistente] = await conn.query('SELECT id FROM ops WHERE numero_op = ?', [r.op]);
        if (opExistente.length) {
          await conn.query(
            `UPDATE ops
                SET cotizacion_id = ?, proyecto_id = ?, cliente_id = ?, fecha_emision = ?,
                    fecha_pactada = ?, oc_cliente = ?, observaciones_comercial = ?
              WHERE id = ?`,
            [cotizacionId, proyectoId, clienteId, r.fecha_pedido, fechaPactada, ocCliente, observaciones, opExistente[0].id]
          );
          stats.ops_actualizadas++;
        } else {
          await conn.query(
            `INSERT INTO ops
               (numero_op, cotizacion_id, proyecto_id, cliente_id, fecha_emision, fecha_pactada, oc_cliente, observaciones_comercial, estado_general)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'abierta')`,
            [r.op, cotizacionId, proyectoId, clienteId, r.fecha_pedido, fechaPactada, ocCliente, observaciones]
          );
          stats.ops_creadas++;
        }

        await conn.commit();
      } catch (err) {
        await conn.rollback();
        stats.errores.push({ fila_excel: r.fila_excel, op: r.op, mensaje: err.message });
      }
    }
  } finally {
    conn.release();
  }

  return stats;
}
