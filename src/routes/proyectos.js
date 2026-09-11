import { Router } from 'express';
import {
  listarProyectos,
  obtenerProyecto,
  crearProyecto,
  actualizarProyecto,
  eliminarProyecto,
} from '../db/queries.js';
import { requireRole } from '../middleware/requireRole.js';

export const proyectosRouter = Router();

proyectosRouter.get('/', async (req, res) => {
  try {
    const { q, estado } = req.query;
    const proyectos = await listarProyectos({ q, estado });
    res.json({ proyectos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo listar los proyectos.', detail: err.message });
  }
});

proyectosRouter.get('/:id', async (req, res) => {
  try {
    const proyecto = await obtenerProyecto(req.params.id);
    if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado.' });
    res.json({ proyecto });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo obtener el proyecto.', detail: err.message });
  }
});

proyectosRouter.post('/', async (req, res) => {
  const { cliente_id, nombre, descripcion, estado } = req.body ?? {};
  if (!cliente_id || !nombre) {
    return res.status(400).json({ error: 'Faltan "cliente_id" y/o "nombre" en el body.' });
  }
  try {
    const proyecto = await crearProyecto({ cliente_id, nombre, descripcion, estado });
    res.status(201).json({ proyecto });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo crear el proyecto.', detail: err.message });
  }
});

proyectosRouter.put('/:id', async (req, res) => {
  const { cliente_id, nombre, descripcion, estado } = req.body ?? {};
  if (!cliente_id || !nombre || !estado) {
    return res.status(400).json({ error: 'Faltan "cliente_id", "nombre" y/o "estado" en el body.' });
  }
  try {
    const proyecto = await actualizarProyecto(req.params.id, { cliente_id, nombre, descripcion, estado });
    if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado.' });
    res.json({ proyecto });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo actualizar el proyecto.', detail: err.message });
  }
});

proyectosRouter.delete('/:id', requireRole('administrador'), async (req, res) => {
  try {
    const eliminado = await eliminarProyecto(req.params.id);
    if (!eliminado) return res.status(404).json({ error: 'Proyecto no encontrado.' });
    res.status(204).end();
  } catch (err) {
    if (err.code === 'TIENE_DEPENDENCIAS') {
      return res.status(409).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'No se pudo eliminar el proyecto.', detail: err.message });
  }
});
