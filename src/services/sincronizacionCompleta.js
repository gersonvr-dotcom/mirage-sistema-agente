import { sincronizarDesdeExcelMadre } from './syncComercial.js';
import { sincronizarProductosDesdeCarpetas } from './syncProductos.js';
import { sincronizarCotizacionesDesdeCarpetas } from './syncCotizaciones.js';
import { sincronizarDocumentosDesdeCarpetas } from './syncDocumentos.js';

/**
 * Las cuatro sincronizaciones de Configuración, en el orden en que dependen una de otra (ver docs/DESPLIEGUE.md §4):
 * primero las OPs, clientes y proyectos del Excel Madre; luego las carpetas de SharePoint. Ninguna usa el modelo de IA.
 */
export const PASOS_POR_DEFECTO = [
  { clave: 'excel', nombre: 'Excel Madre 2026', ejecutar: sincronizarDesdeExcelMadre },
  { clave: 'productos', nombre: 'Cotizaciones y productos por OP', ejecutar: sincronizarProductosDesdeCarpetas },
  { clave: 'cotizaciones', nombre: 'Precios de cotizaciones', ejecutar: sincronizarCotizacionesDesdeCarpetas },
  { clave: 'documentos', nombre: 'Documentos de las OPs', ejecutar: sincronizarDocumentosDesdeCarpetas },
];

const MAX_ERRORES_VISIBLES = 5;
const LARGO_ERROR = 200;

const ahoraISO = () => new Date().toISOString();

/**
 * Reduce el resultado de una sincronización a lo que se muestra: los contadores tal cual, el tamaño de las listas
 * (errores, advertencias…) y los primeros errores. Así el estado en memoria no guarda listas enormes.
 */
export function resumirResultado(resultado) {
  if (!resultado || typeof resultado !== 'object') return {};
  const resumen = {};
  for (const [clave, valor] of Object.entries(resultado)) {
    if (typeof valor === 'number') resumen[clave] = valor;
    else if (Array.isArray(valor)) resumen[clave] = valor.length;
  }
  if (Array.isArray(resultado.errores) && resultado.errores.length > 0) {
    resumen.primeros_errores = resultado.errores
      .slice(0, MAX_ERRORES_VISIBLES)
      .map((e) => (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, LARGO_ERROR));
  }
  return resumen;
}

const estadoInicial = () => ({ estado: 'inactivo', origen: null, iniciadoEn: null, terminadoEn: null, pasos: [], pasos_con_error: 0 });

let job = estadoInicial();
let ejecucion = null;

export const estadoSincronizacionCompleta = () => job;

/** Solo para tests y para apagar limpio: la promesa de la ejecución en curso (o null). */
export const esperarSincronizacionCompleta = () => ejecucion;

/** Vuelve al estado inicial. Solo para tests. */
export function reiniciarSincronizacionCompleta() {
  job = estadoInicial();
  ejecucion = null;
}

/**
 * Lanza las sincronizaciones una tras otra en segundo plano y responde de inmediato con el estado (el proxy de Plesk
 * corta las peticiones largas). Si ya hay una corriendo no lanza otra. Un paso que falla no detiene los siguientes:
 * queda anotado con su error y la ejecución termina igual como `completado` con `pasos_con_error > 0`.
 */
export function iniciarSincronizacionCompleta({ origen = 'manual', pasos = PASOS_POR_DEFECTO, log = console.log } = {}) {
  if (job.estado === 'corriendo') return job;

  job = {
    estado: 'corriendo',
    origen,
    iniciadoEn: ahoraISO(),
    terminadoEn: null,
    pasos: pasos.map((p) => ({ clave: p.clave, nombre: p.nombre, estado: 'pendiente', iniciadoEn: null, terminadoEn: null, resumen: null, error: null })),
    pasos_con_error: 0,
  };
  log(`[sincronización completa] inicio (${origen})`);

  const actualizarPaso = (i, cambios) => {
    job = { ...job, pasos: job.pasos.map((p, j) => (j === i ? { ...p, ...cambios } : p)) };
  };

  ejecucion = (async () => {
    for (let i = 0; i < pasos.length; i++) {
      actualizarPaso(i, { estado: 'corriendo', iniciadoEn: ahoraISO() });
      try {
        const resultado = await pasos[i].ejecutar();
        actualizarPaso(i, { estado: 'completado', terminadoEn: ahoraISO(), resumen: resumirResultado(resultado) });
        log(`[sincronización completa] ${pasos[i].nombre}: listo`);
      } catch (err) {
        actualizarPaso(i, { estado: 'error', terminadoEn: ahoraISO(), error: String(err?.message ?? err).slice(0, 500) });
        log(`[sincronización completa] ${pasos[i].nombre}: FALLÓ - ${err?.message ?? err}`);
      }
    }
    job = { ...job, estado: 'completado', terminadoEn: ahoraISO(), pasos_con_error: job.pasos.filter((p) => p.estado === 'error').length };
    log(`[sincronización completa] fin, pasos con error: ${job.pasos_con_error}`);
  })();

  return job;
}
