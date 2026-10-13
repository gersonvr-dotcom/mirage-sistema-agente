import { Router } from 'express';
import { rankingClientesPorM2, volumenTotalVendido } from '../db/analitica.js';
import { puedeVerPrecios } from '../services/permisosPrecios.js';

export const analiticaRouter = Router();

/** Mismas funciones que usa el agente (src/db/analitica.js): el panel y el chat nunca discrepan. */
function responder(res, resultado) {
  if (resultado.error) return res.status(400).json({ error: resultado.error });
  res.json(resultado);
}

analiticaRouter.get('/ranking-m2', async (req, res) => {
  try {
    const { anio, cliente_tipo, limite } = req.query;
    responder(res, await rankingClientesPorM2({ anio, clienteTipo: cliente_tipo, limite }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo calcular el ranking por m².', detail: err.message });
  }
});

analiticaRouter.get('/volumen', async (req, res) => {
  const { fecha_inicio, fecha_fin, agrupado_por, metrica = 'm2', limite } = req.query;
  if (metrica === 'importe' && !puedeVerPrecios({ rol: req.user.rol })) {
    return res.status(403).json({ error: 'Solo el administrador puede consultar importes.' });
  }
  try {
    responder(res, await volumenTotalVendido({ fechaInicio: fecha_inicio, fechaFin: fecha_fin, agruparPor: agrupado_por, metrica, limite }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo calcular el volumen vendido.', detail: err.message });
  }
});
