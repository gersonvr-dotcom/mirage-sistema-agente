import { Router } from 'express';
import { obtenerMetricas } from '../db/queries.js';

export const dashboardRouter = Router();

dashboardRouter.get('/', async (req, res) => {
  try {
    const metricas = await obtenerMetricas();
    res.json(metricas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudieron calcular las métricas.', detail: err.message });
  }
});
