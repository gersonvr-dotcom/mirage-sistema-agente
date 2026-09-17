import { Router } from 'express';
import { sincronizarDesdeExcelMadre } from '../services/syncComercial.js';

export const configRouter = Router();

configRouter.post('/sincronizar-excel', async (req, res) => {
  try {
    const resultado = await sincronizarDesdeExcelMadre();
    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo sincronizar desde el Excel Madre.', detail: err.message });
  }
});
