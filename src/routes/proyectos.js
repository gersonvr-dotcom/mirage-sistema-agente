import { Router } from 'express';
import {
  listarProyectos,
  obtenerProyecto,
  crearProyecto,
  actualizarProyecto,
  eliminarProyecto,
  registrarAccionAgente,
} from '../db/queries.js';
import { requireRole } from '../middleware/requireRole.js';
import { candidatosFusion, fusionarProyectos } from '../services/proyectosFusion.js';
import { buscarProyectosSimilares } from '../services/proyectosSimilares.js';

export const proyectosRouter = Router();

// Las rutas fijas van antes de '/:id' para que no se interpreten como un id.
proyectosRouter.get('/similares', async (req, res) => {
  const { cliente_id, nombre, excluir_id } = req.query;
  if (!cliente_id || !nombre) return res.status(400).json({ error: 'Faltan "cliente_id" y/o "nombre" en la consulta.' });
  try {
    res.json(await buscarProyectosSimilares({ clienteId: Number(cliente_id), nombre: String(nombre), excluirId: excluir_id }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo buscar proyectos similares.', detail: err.message });
  }
});

proyectosRouter.get('/candidatos-fusion', requireRole('administrador'), async (req, res) => {
  try {
    res.json(await candidatosFusion());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo analizar los proyectos.', detail: err.message });
  }
});

proyectosRouter.post('/fusionar', requireRole('administrador'), async (req, res) => {
  const { matriz_id, proyecto_ids, nombre_final, dry_run } = req.body ?? {};
  if (!matriz_id || !Array.isArray(proyecto_ids) || proyecto_ids.length === 0) {
    return res.status(400).json({ error: 'Faltan "matriz_id" y/o "proyecto_ids" (lista) en el body.' });
  }
  try {
    const resultado = await fusionarProyectos({
      matrizId: matriz_id,
      proyectoIds: proyecto_ids,
      nombreFinal: nombre_final,
      dryRun: Boolean(dry_run),
    });
    if (!resultado.dry_run) {
      // La fusión ya está confirmada: un fallo al registrar la auditoría no debe presentarse como error de la fusión.
      try {
        await registrarAccionAgente({
          usuarioId: req.user.sub,
          toolName: 'fusionar_proyectos',
          input: { matriz_id, proyecto_ids, nombre_final },
          resultado,
        });
      } catch (errAuditoria) {
        console.error('No se pudo registrar la auditoría de la fusión:', errAuditoria.message);
      }
    }
    res.json(resultado);
  } catch (err) {
    if (err.code === 'FUSION_INVALIDA') return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'No se pudo fusionar los proyectos.', detail: err.message });
  }
});

proyectosRouter.get('/', async (req, res) => {
  try {
    const { q, estado, cliente_id } = req.query;
    const proyectos = await listarProyectos({ q, estado, clienteId: cliente_id });
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
