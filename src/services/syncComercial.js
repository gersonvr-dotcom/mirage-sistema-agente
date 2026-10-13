import { pool } from '../db/pool.js';
import { obtenerFilasComerciales } from './sharepoint.js';
import { normalizarProyecto, claveTexto } from './proyectoNormalizer.js';

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
 * Decide a qué obra (proyecto matriz) pertenece el texto de PROYECTO de una fila:
 *  1) un alias guardado por una fusión manual (proyecto_alias), por nombre completo y luego por obra;
 *  2) un proyecto del cliente que ya se llama como la obra;
 *  3) si no hay ninguno, se crea la obra con el nombre sin sufijos.
 * Devuelve { id, key } con la clave normalizada del nombre del proyecto elegido.
 */
async function resolverObra(conn, clienteId, norma, stats, proyectosPorCliente) {
  const [alias] = await conn.query(
    `SELECT a.proyecto_id, p.nombre
       FROM proyecto_alias a JOIN proyectos p ON p.id = a.proyecto_id
      WHERE a.cliente_id = ? AND a.alias_normalizado IN (?, ?)
      ORDER BY (a.alias_normalizado = ?) DESC
      LIMIT 1`,
    [clienteId, norma.aliasKey, norma.baseKey, norma.aliasKey]
  );
  if (alias.length) return { id: alias[0].proyecto_id, key: claveTexto(alias[0].nombre) };

  if (!proyectosPorCliente.has(clienteId)) {
    const [filas] = await conn.query('SELECT id, nombre FROM proyectos WHERE cliente_id = ? ORDER BY id', [clienteId]);
    proyectosPorCliente.set(clienteId, filas.map((p) => ({ id: p.id, key: claveTexto(p.nombre) })));
  }
  const delCliente = proyectosPorCliente.get(clienteId);
  const existente = delCliente.find((p) => p.key === norma.baseKey);
  if (existente) return existente;

  const [res] = await conn.query('INSERT INTO proyectos (cliente_id, nombre) VALUES (?, ?)', [clienteId, norma.nombreBase]);
  stats.proyectos_creados++;
  const nueva = { id: res.insertId, key: norma.baseKey };
  delCliente.push(nueva);
  return nueva;
}

/**
 * ¿La observación comercial dice que la OP fue anulada? Se compara cada fragmento completo (las observaciones
 * se unen con " | ") contra ANULADO/ANULADA, para no marcar como cancelada una nota que solo contiene la palabra.
 */
export function esOpAnulada(observaciones) {
  return String(observaciones ?? '')
    .split('|')
    .some((parte) => /^ANULAD[OA]$/i.test(parte.trim()));
}

/**
 * Trae en vivo el Excel Madre 2026 desde SharePoint y sincroniza clientes, proyectos,
 * cotizaciones y OPs contra la base de datos: crea lo que no existe y actualiza (por
 * numero_op) lo que ya existía, para reflejar ediciones hechas en el Excel después de la
 * primera importación. No toca `estado_general` de una OP existente, ya que ese campo lo
 * gestiona el flujo de producción dentro del sistema, con una sola excepción: si el Excel comercial dice
 * ANULADO la OP pasa a 'cancelada' (para que no cuente en rankings ni métricas). Nunca se revierte: si más
 * tarde se quita la nota, la cancelación se queda y se corrige a mano.
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
    ops_reasignadas_a_obra: 0,
    ops_marcadas_canceladas: 0,
    errores: [],
  };

  const clienteCache = new Map();
  const proyectoCache = new Map();
  const cotizacionCache = new Map();
  const proyectosPorCliente = new Map();

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

        // El texto de PROYECTO del Excel puede traer sufijos ("ALESTE 137 PERFIL"): la OP cuelga de la obra
        // (proyecto matriz) y el sufijo queda como tipo_pedido/descripcion_pedido de la OP.
        const norma = normalizarProyecto(r.proyecto);
        const proyectoKey = `${clienteId}::${norma.aliasKey}`;
        let obra = proyectoCache.get(proyectoKey);
        if (!obra) {
          obra = await resolverObra(conn, clienteId, norma, stats, proyectosPorCliente);
          proyectoCache.set(proyectoKey, obra);
        }
        const proyectoId = obra.id;
        const tipoPedido = norma.tipoPedido;
        const descripcionPedido = norma.aliasKey !== obra.key ? String(r.proyecto).trim().slice(0, 150) : null;

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

        const anulada = esOpAnulada(observaciones);
        const [opExistente] = await conn.query('SELECT id, proyecto_id, estado_general FROM ops WHERE numero_op = ?', [r.op]);
        if (opExistente.length) {
          await conn.query(
            `UPDATE ops
                SET cotizacion_id = ?, proyecto_id = ?, cliente_id = ?, tipo_pedido = ?, descripcion_pedido = ?,
                    fecha_emision = ?, fecha_pactada = ?, oc_cliente = ?, observaciones_comercial = ?,
                    estado_general = IF(?, 'cancelada', estado_general)
              WHERE id = ?`,
            [cotizacionId, proyectoId, clienteId, tipoPedido, descripcionPedido, r.fecha_pedido, fechaPactada, ocCliente, observaciones, anulada, opExistente[0].id]
          );
          stats.ops_actualizadas++;
          if (anulada && opExistente[0].estado_general !== 'cancelada') stats.ops_marcadas_canceladas++;
          if (opExistente[0].proyecto_id !== proyectoId) stats.ops_reasignadas_a_obra++;
        } else {
          await conn.query(
            `INSERT INTO ops
               (numero_op, cotizacion_id, proyecto_id, cliente_id, tipo_pedido, descripcion_pedido, fecha_emision, fecha_pactada, oc_cliente, observaciones_comercial, estado_general)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [r.op, cotizacionId, proyectoId, clienteId, tipoPedido, descripcionPedido, r.fecha_pedido, fechaPactada, ocCliente, observaciones, anulada ? 'cancelada' : 'abierta']
          );
          stats.ops_creadas++;
          if (anulada) stats.ops_marcadas_canceladas++;
        }

        await conn.commit();
      } catch (err) {
        await conn.rollback();
        // Los cachés pudieron guardar ids creados dentro de la transacción que acaba de deshacerse.
        clienteCache.clear();
        proyectoCache.clear();
        cotizacionCache.clear();
        proyectosPorCliente.clear();
        stats.errores.push({ fila_excel: r.fila_excel, op: r.op, mensaje: err.message });
      }
    }
  } finally {
    conn.release();
  }

  return stats;
}
