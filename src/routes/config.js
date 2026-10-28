import { Router } from 'express';
import { sincronizarDesdeExcelMadre } from '../services/syncComercial.js';
import { sincronizarProductosDesdeCarpetas } from '../services/syncProductos.js';
import { sincronizarCotizacionesDesdeCarpetas } from '../services/syncCotizaciones.js';
import { sincronizarDocumentosDesdeCarpetas } from '../services/syncDocumentos.js';

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

/**
 * Trabajo en segundo plano con su estado en memoria. Recorrer las carpetas de SharePoint tarda varios minutos,
 * más de lo que aguanta el proxy de Plesk delante del Node (504): el POST solo dispara el trabajo y responde al
 * toque, y el navegador consulta el progreso con el GET de /estado. El estado vive en memoria: un reinicio lo corta.
 */
function registrarJob(ruta, ejecutar, mensajeError) {
  let job = { estado: 'inactivo', resultado: null, error: null, iniciadoEn: null, terminadoEn: null };

  configRouter.post(ruta, (req, res) => {
    if (job.estado === 'corriendo') return res.status(202).json(job);

    job = { estado: 'corriendo', resultado: null, error: null, iniciadoEn: new Date().toISOString(), terminadoEn: null };
    res.status(202).json(job);

    ejecutar()
      .then((resultado) => {
        job = { ...job, estado: 'completado', resultado, terminadoEn: new Date().toISOString() };
      })
      .catch((err) => {
        console.error(mensajeError, err);
        job = { ...job, estado: 'error', error: err.message, terminadoEn: new Date().toISOString() };
      });
  });

  configRouter.get(`${ruta}/estado`, (req, res) => res.json(job));
}

registrarJob('/sincronizar-productos', sincronizarProductosDesdeCarpetas, 'Falló la sincronización de productos:');
registrarJob('/sincronizar-cotizaciones', sincronizarCotizacionesDesdeCarpetas, 'Falló la sincronización de cotizaciones:');
registrarJob('/sincronizar-documentos', sincronizarDocumentosDesdeCarpetas, 'Falló la indexación de documentos:');
