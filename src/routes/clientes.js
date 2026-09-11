import { Router } from 'express';
import { listarClientes } from '../db/queries.js';

export const clientesRouter = Router();

clientesRouter.get('/', async (req, res) => {
  try {
    const clientes = await listarClientes();
    res.json({ clientes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo listar los clientes.', detail: err.message });
  }
});
