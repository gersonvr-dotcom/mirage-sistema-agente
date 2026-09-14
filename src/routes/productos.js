import { Router } from 'express';
import { listarProductos } from '../db/queries.js';

export const productosRouter = Router();

productosRouter.get('/', async (req, res) => {
  try {
    const productos = await listarProductos({ q: req.query.q });
    res.json({ productos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo listar los productos.', detail: err.message });
  }
});
