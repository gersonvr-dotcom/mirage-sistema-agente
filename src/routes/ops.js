import express, { Router } from 'express';
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
  listarDocumentosOP,
} from '../db/queries.js';
import { requireRole } from '../middleware/requireRole.js';
import { opSegunRol } from '../services/permisosPrecios.js';
import { TIPOS_PEDIDO } from '../db/pedidoTipos.js';
import { puedeVerPrecios } from '../services/permisosPrecios.js';
import { TIPOS_DOCUMENTO_VISIBLES_OPERADOR } from '../services/clasificadorDocumentos.js';
import {
  ErrorSubida,
  TAMANO_MAX_SUBIDA,
  eliminarDocumentoManual,
  guardarPiManual,
  obtenerArchivoManual,
} from '../services/documentosManuales.js';

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

// Los documentos financieros (cotizaciones, PIs, facturas, pagos…) traen montos y costos: solo el administrador los ve.
opsRouter.get('/:id/documentos', async (req, res) => {
  try {
    const tipos = puedeVerPrecios({ rol: req.user.rol }) ? undefined : TIPOS_DOCUMENTO_VISIBLES_OPERADOR;
    res.json({ documentos: await listarDocumentosOP(req.params.id, { tipos }) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudieron listar los documentos de la OP.', detail: err.message });
  }
});

// Carga manual de una PI (R2-05): el PDF viaja como cuerpo crudo (Content-Type application/pdf) y el nombre en ?nombre=.
// Solo administradores: las PIs traen costos de fábrica. Lo cargado se guarda en la BD, no en SharePoint.
opsRouter.post(
  '/:id/documentos',
  requireRole('administrador'),
  express.raw({ type: ['application/pdf', 'application/octet-stream'], limit: TAMANO_MAX_SUBIDA }),
  async (req, res) => {
    try {
      const documento = await guardarPiManual({
        opId: req.params.id,
        nombre: req.query.nombre,
        buffer: req.body,
        usuarioId: req.user.sub,
      });
      res.status(201).json({ documento });
    } catch (err) {
      if (err instanceof ErrorSubida) return res.status(err.status).json({ error: err.message });
      if (err.type === 'entity.too.large') return res.status(413).json({ error: 'El PDF pesa más de 10 MB.' });
      console.error(err);
      res.status(500).json({ error: 'No se pudo guardar el documento.', detail: err.message });
    }
  }
);

opsRouter.get('/documentos/:docId/archivo', requireRole('administrador'), async (req, res) => {
  try {
    const archivo = await obtenerArchivoManual(req.params.docId);
    if (!archivo) return res.status(404).json({ error: 'Documento no encontrado.' });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(archivo.nombre_archivo)}`,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(archivo.contenido);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo leer el documento.', detail: err.message });
  }
});

opsRouter.delete('/documentos/:docId', requireRole('administrador'), async (req, res) => {
  try {
    const eliminado = await eliminarDocumentoManual(req.params.docId);
    if (!eliminado) return res.status(404).json({ error: 'Documento no encontrado o no es una carga manual.' });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo eliminar el documento.', detail: err.message });
  }
});

opsRouter.get('/:id', async (req, res) => {
  try {
    const op = await obtenerOP(req.params.id);
    if (!op) return res.status(404).json({ error: 'OP no encontrada.' });
    res.json({ op: opSegunRol(op, req.user.rol) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo obtener la OP.', detail: err.message });
  }
});

opsRouter.post('/', async (req, res) => {
  const { numero_op, proyecto_id, pedido_id, fecha_emision, tipo_pedido, descripcion_pedido } = req.body ?? {};
  if (!numero_op || !proyecto_id || !fecha_emision) {
    return res.status(400).json({ error: 'Faltan "numero_op", "proyecto_id" y/o "fecha_emision" en el body.' });
  }
  if (tipo_pedido && !TIPOS_PEDIDO.includes(tipo_pedido)) {
    return res.status(400).json({ error: `tipo_pedido no válido. Valores permitidos: ${TIPOS_PEDIDO.join(', ')}.` });
  }
  try {
    const op = await crearOP({ numero_op, proyecto_id, pedido_id, fecha_emision, tipo_pedido, descripcion_pedido });
    res.status(201).json({ op: opSegunRol(op, req.user.rol) });
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
    res.json({ op: opSegunRol(op, req.user.rol) });
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
    res.status(201).json({ op: opSegunRol(op, req.user.rol) });
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
    res.json({ op: opSegunRol(op, req.user.rol) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo actualizar la línea.', detail: err.message });
  }
});

opsRouter.delete('/items/:itemId', async (req, res) => {
  try {
    const op = await eliminarOPItem(req.params.itemId);
    if (!op) return res.status(404).json({ error: 'Línea de OP no encontrada.' });
    res.json({ op: opSegunRol(op, req.user.rol) });
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
    res.status(201).json({ op: opSegunRol(op, req.user.rol) });
  } catch (err) {
    if (err.code === 'ITEM_INEXISTENTE') {
      return res.status(404).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'No se pudo registrar la etapa.', detail: err.message });
  }
});
