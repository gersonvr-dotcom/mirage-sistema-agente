import { Router } from 'express';
import { PASOS_POR_DEFECTO, estadoSincronizacionCompleta, iniciarSincronizacionCompleta } from '../services/sincronizacionCompleta.js';

/**
 * Las cuatro sincronizaciones juntas (Excel Madre, cotizaciones y productos, precios, documentos).
 * La tarea programada de Plesk la dispara cada mañana con el encabezado X-Cron-Token; el administrador la puede
 * lanzar y consultar desde Configuración. Se monta con `accesoAdminOToken` (ver server.js).
 * `pasos` y `log` se pueden inyectar (los tests usan pasos falsos para no tocar SharePoint ni la base).
 */
export function crearSincronizacionCompletaRouter({ pasos = PASOS_POR_DEFECTO, log = console.log } = {}) {
  const router = Router();

  router.post('/', (req, res) => {
    const origen = req.user?.via === 'token' ? 'programada' : 'manual';
    res.status(202).json(iniciarSincronizacionCompleta({ origen, pasos, log }));
  });

  router.get('/estado', (req, res) => {
    res.json(estadoSincronizacionCompleta());
  });

  return router;
}

export const sincronizacionCompletaRouter = crearSincronizacionCompletaRouter();
