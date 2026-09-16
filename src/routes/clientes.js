import { Router } from 'express';
import {
  listarClientes,
  obtenerCliente,
  crearCliente,
  actualizarCliente,
  eliminarCliente,
} from '../db/queries.js';
import { requireRole } from '../middleware/requireRole.js';

export const clientesRouter = Router();

clientesRouter.get('/', async (req, res) => {
  try {
    const clientes = await listarClientes({ q: req.query.q });
    res.json({ clientes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo listar los clientes.', detail: err.message });
  }
});

clientesRouter.get('/:id', async (req, res) => {
  try {
    const cliente = await obtenerCliente(req.params.id);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });
    res.json({ cliente });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo obtener el cliente.', detail: err.message });
  }
});

clientesRouter.post('/', async (req, res) => {
  const { nombre, ruc_nit, contacto, email, telefono } = req.body ?? {};
  if (!nombre) {
    return res.status(400).json({ error: 'Falta "nombre" en el body.' });
  }
  try {
    const cliente = await crearCliente({ nombre, ruc_nit, contacto, email, telefono });
    res.status(201).json({ cliente });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo crear el cliente.', detail: err.message });
  }
});

clientesRouter.put('/:id', async (req, res) => {
  const { nombre, ruc_nit, contacto, email, telefono } = req.body ?? {};
  if (!nombre) {
    return res.status(400).json({ error: 'Falta "nombre" en el body.' });
  }
  try {
    const cliente = await actualizarCliente(req.params.id, { nombre, ruc_nit, contacto, email, telefono });
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });
    res.json({ cliente });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo actualizar el cliente.', detail: err.message });
  }
});

clientesRouter.delete('/:id', requireRole('administrador'), async (req, res) => {
  try {
    const eliminado = await eliminarCliente(req.params.id);
    if (!eliminado) return res.status(404).json({ error: 'Cliente no encontrado.' });
    res.status(204).end();
  } catch (err) {
    if (err.code === 'TIENE_DEPENDENCIAS') {
      return res.status(409).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'No se pudo eliminar el cliente.', detail: err.message });
  }
});
