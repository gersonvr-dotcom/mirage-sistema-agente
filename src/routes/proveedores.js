import { Router } from 'express';
import { listarProveedores } from '../db/queries.js';

export const proveedoresRouter = Router();

proveedoresRouter.get('/', async (req, res) => {
  try {
    const proveedores = await listarProveedores({ q: req.query.q });
    res.json({ proveedores });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo listar los proveedores.', detail: err.message });
  }
});
