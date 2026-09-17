import { Router } from 'express';
import { sincronizarDesdeExcelMadre } from '../services/syncComercial.js';
import { sincronizarProductosDesdeCarpetas } from '../services/syncProductos.js';

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

// Estado en memoria del job de sincronización de productos: recorre 267 carpetas de
// SharePoint y puede tardar varios minutos, más de lo que aguanta el proxy de Plesk delante
// del Node. Por eso corre en segundo plano: el POST solo lo dispara y responde al toque, y
// el navegador consulta el progreso con el GET de abajo.
let jobProductos = { estado: 'inactivo', resultado: null, error: null, iniciadoEn: null, terminadoEn: null };

configRouter.post('/sincronizar-productos', (req, res) => {
  if (jobProductos.estado === 'corriendo') {
    return res.status(202).json(jobProductos);
  }

  jobProductos = { estado: 'corriendo', resultado: null, error: null, iniciadoEn: new Date().toISOString(), terminadoEn: null };
  res.status(202).json(jobProductos);

  sincronizarProductosDesdeCarpetas()
    .then((resultado) => {
      jobProductos = { ...jobProductos, estado: 'completado', resultado, terminadoEn: new Date().toISOString() };
    })
    .catch((err) => {
      console.error(err);
      jobProductos = { ...jobProductos, estado: 'error', error: err.message, terminadoEn: new Date().toISOString() };
    });
});

configRouter.get('/sincronizar-productos/estado', (req, res) => {
  res.json(jobProductos);
});
