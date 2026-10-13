import { pool } from '../db/pool.js';
import { normalizarProyecto, basesSimilares } from './proyectoNormalizer.js';

/**
 * Proyectos (obras) del mismo cliente que podrían ser la misma que `nombre` (mismo normalizador que la fusión):
 * "ALESTE 137 ADICIONAL" y "ALESTE 137" comparten la obra "ALESTE 137". Sirve para avisar antes de crear un proyecto
 * huérfano: un pedido adicional debe ser una OP de la obra matriz, no un proyecto nuevo.
 */
export async function buscarProyectosSimilares({ clienteId, nombre, excluirId } = {}) {
  const norma = normalizarProyecto(nombre);
  if (!clienteId || !norma.baseKey) return { nombreBase: norma.nombreBase, tipoPedido: norma.tipoPedido, similares: [] };

  const [proyectos] = await pool.query(
    `SELECT p.id, p.nombre, p.estado, (SELECT COUNT(*) FROM ops o WHERE o.proyecto_id = p.id) AS num_ops
       FROM proyectos p WHERE p.cliente_id = ? ORDER BY p.nombre`,
    [clienteId]
  );
  const similares = proyectos
    .filter((p) => p.id !== Number(excluirId))
    .filter((p) => basesSimilares(norma.baseKey, normalizarProyecto(p.nombre).baseKey))
    .map((p) => ({ id: p.id, nombre: p.nombre, estado: p.estado, num_ops: Number(p.num_ops) }));

  return { nombreBase: norma.nombreBase, tipoPedido: norma.tipoPedido, similares };
}
