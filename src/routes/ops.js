import { Router } from 'express';
import {
  listarOPs,
  obtenerOP,
  crearOP,
  actualizarOP,
  eliminarOP,
  crearOPItem,
  actualizarOPItem,
  eliminarOPItem,
  agregarEtapaSeguimiento,
} from '../db/queries.js';
import { requireRole } from '../middleware/requireRole.js';

export const opsRouter = Router();

opsRouter.get('/', async (req, res) => {
  try {
    const { q, estado, cliente_id, proyecto_id } = req.query;
    const ops = await listarOPs({ q, estado, clienteId: cliente_id, proyectoId: proyecto_id });
    res.json({ ops });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo listar las OPs.', detail: err.message });
  }
});

opsRouter.get('/:id', async (req, res) => {
  try {
    const op = await obtenerOP(req.params.id);
    if (!op) return res.status(404).json({ error: 'OP no encontrada.' });
    res.json({ op });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo obtener la OP.', detail: err.message });
  }
});

opsRouter.post('/', async (req, res) => {
  const { numero_op, proyecto_id, pedido_id, fecha_emision } = req.body ?? {};
  if (!numero_op || !proyecto_id || !fecha_emision) {
    return res.status(400).json({ error: 'Faltan "numero_op", "proyecto_id" y/o "fecha_emision" en el body.' });
  }
  try {
    const op = await crearOP({ numero_op, proyecto_id, pedido_id, fecha_emision });
    res.status(201).json({ op });
  } catch (err) {
    if (err.code === 'NUMERO_OP_DUPLICADO' || err.code === 'PROYECTO_INEXISTENTE') {
      return res.status(409).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'No se pudo crear la OP.', detail: err.message });
  }
});

opsRouter.put('/:id', async (req, res) => {
  const { numero_op, pedido_id, fecha_emision, estado_general } = req.body ?? {};
  if (!numero_op || !fecha_emision || !estado_general) {
    return res.status(400).json({ error: 'Faltan "numero_op", "fecha_emision" y/o "estado_general" en el body.' });
  }
  try {
    const op = await actualizarOP(req.params.id, { numero_op, pedido_id, fecha_emision, estado_general });
    if (!op) return res.status(404).json({ error: 'OP no encontrada.' });
    res.json({ op });
  } catch (err) {
    if (err.code === 'NUMERO_OP_DUPLICADO') {
      return res.status(409).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'No se pudo actualizar la OP.', detail: err.message });
  }
});

opsRouter.delete('/:id', requireRole('administrador'), async (req, res) => {
  try {
    const eliminado = await eliminarOP(req.params.id);
    if (!eliminado) return res.status(404).json({ error: 'OP no encontrada.' });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo eliminar la OP.', detail: err.message });
  }
});

opsRouter.post('/:id/items', async (req, res) => {
  const { producto_id, proveedor_id, cantidad, fecha_estimada_entrega, estado } = req.body ?? {};
  if (!producto_id || !cantidad) {
    return res.status(400).json({ error: 'Faltan "producto_id" y/o "cantidad" en el body.' });
  }
  try {
    const op = await crearOPItem({ op_id: req.params.id, producto_id, proveedor_id, cantidad, fecha_estimada_entrega, estado });
    res.status(201).json({ op });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo agregar la línea.', detail: err.message });
  }
});

opsRouter.put('/items/:itemId', async (req, res) => {
  const { producto_id, proveedor_id, cantidad, fecha_estimada_entrega, estado } = req.body ?? {};
  if (!producto_id || !cantidad || !estado) {
    return res.status(400).json({ error: 'Faltan "producto_id", "cantidad" y/o "estado" en el body.' });
  }
  try {
    const op = await actualizarOPItem(req.params.itemId, { producto_id, proveedor_id, cantidad, fecha_estimada_entrega, estado });
    if (!op) return res.status(404).json({ error: 'Línea de OP no encontrada.' });
    res.json({ op });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo actualizar la línea.', detail: err.message });
  }
});

opsRouter.delete('/items/:itemId', async (req, res) => {
  try {
    const op = await eliminarOPItem(req.params.itemId);
    if (!op) return res.status(404).json({ error: 'Línea de OP no encontrada.' });
    res.json({ op });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo eliminar la línea.', detail: err.message });
  }
});

opsRouter.post('/items/:itemId/etapas', async (req, res) => {
  const { etapa, fecha_evento, nota } = req.body ?? {};
  if (!etapa || !fecha_evento) {
    return res.status(400).json({ error: 'Faltan "etapa" y/o "fecha_evento" en el body.' });
  }
  try {
    const op = await agregarEtapaSeguimiento({ op_item_id: req.params.itemId, etapa, fecha_evento, nota });
    res.status(201).json({ op });
  } catch (err) {
    if (err.code === 'ITEM_INEXISTENTE') {
      return res.status(404).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'No se pudo registrar la etapa.', detail: err.message });
  }
});
