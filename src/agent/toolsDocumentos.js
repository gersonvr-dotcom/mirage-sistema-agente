import { documentosDeOPPorNumero, lineasOPParaValidacion } from '../db/queries.js';
import { compararPiConOp, TOLERANCIA_CAJAS_DEFECTO } from '../services/validarPi.js';
import { TIPOS_DOCUMENTO, TIPOS_DOCUMENTO_VISIBLES_OPERADOR } from '../services/clasificadorDocumentos.js';
import { TIPOS_EXTRAIBLES, obtenerExtraccionDocumento } from '../services/pdfExtractor.js';
import { puedeVerPrecios } from '../services/permisosPrecios.js';
import {
  candidatosNumeroOP,
  filtrarPorNombre,
  compactarLectura,
  MAX_DOCUMENTOS_LISTADOS,
  MAX_DOCUMENTOS_LEIDOS,
} from '../services/documentosAgente.js';

// Si la lectura tarda más que esto, la tool responde "procesando" y el trabajo sigue en segundo plano (queda en caché):
// así el chat no se queda colgado ni choca con el timeout del proxy.
const esperaMs = () => Number(process.env.EXTRACCION_ESPERA_MS) || 25000;

const SIN_PERMISO_DOCUMENTO = {
  error: 'sin_permiso',
  mensaje: 'Las proformas (PI) traen costos y solo las puede leer el rol administrador. Díselo con claridad al usuario y no inventes su contenido.',
};


/**
 * Lee (o toma de la caché) varios PDFs a la vez. Espera hasta EXTRACCION_ESPERA_MS; los que no terminen a tiempo
 * quedan con hecho=false y siguen leyéndose en segundo plano (la próxima llamada los encuentra en caché).
 */
async function leerEnParalelo(docs) {
  const estados = docs.map((doc) => ({ doc, hecho: false }));
  const todas = Promise.all(
    estados.map((e) =>
      obtenerExtraccionDocumento(e.doc.id).then(
        (res) => { e.res = res; },
        (err) => { e.err = err; }
      ).finally(() => { e.hecho = true; })
    )
  );
  let timer;
  await Promise.race([todas, new Promise((resolve) => { timer = setTimeout(resolve, esperaMs()); })]);
  clearTimeout(timer);
  return { estados };
}

const noEncontrada = (numero) => ({ error: `No se encontró la OP "${numero}".` });

export async function listarDocumentosOP({ numero_op, tipo }, ctx) {
  const admin = puedeVerPrecios(ctx);
  if (tipo && !TIPOS_DOCUMENTO.includes(tipo)) {
    return { error: `Tipo de documento inválido. Usa uno de: ${TIPOS_DOCUMENTO.join(', ')}.` };
  }
  if (tipo && !admin && !TIPOS_DOCUMENTO_VISIBLES_OPERADOR.includes(tipo)) {
    return { error: 'sin_permiso', mensaje: `Tu rol solo puede ver documentos de tipo: ${TIPOS_DOCUMENTO_VISIBLES_OPERADOR.join(', ')}.` };
  }
  const tipos = tipo ? [tipo] : admin ? undefined : TIPOS_DOCUMENTO_VISIBLES_OPERADOR;
  const r = await documentosDeOPPorNumero(candidatosNumeroOP(numero_op), { tipos });
  if (!r) return noEncontrada(numero_op);

  const por_tipo = {};
  for (const d of r.documentos) por_tipo[d.tipo] = (por_tipo[d.tipo] ?? 0) + 1;
  const documentos = r.documentos.slice(0, MAX_DOCUMENTOS_LISTADOS).map((d) => ({
    tipo: d.tipo,
    nombre: d.nombre_archivo,
    ...(d.subcarpeta ? { subcarpeta: d.subcarpeta } : {}),
    fecha: d.modificado,
    enlace: d.web_url,
    ...(d.extraido ? { leido: true } : {}),
  }));
  const salida = { numero_op: r.numero_op, total: r.documentos.length, por_tipo, documentos };
  if (!r.documentos.length) salida.mensaje = 'No hay documentos indexados de esta OP (puede que SharePoint aún no se haya indexado).';
  if (r.documentos.length > documentos.length) salida.mensaje = `Solo se listan los primeros ${documentos.length}; pide un tipo concreto para ver el resto.`;
  return salida;
}

export async function leerDocumentoOP({ numero_op, tipo = 'pi', nombre }, ctx) {
  if (!puedeVerPrecios(ctx)) return SIN_PERMISO_DOCUMENTO;
  if (!TIPOS_EXTRAIBLES.includes(tipo)) {
    return { error: 'tipo_no_soportado', mensaje: `Solo se pueden leer documentos de tipo: ${TIPOS_EXTRAIBLES.join(', ')}. Para otros usa listar_documentos_op y comparte el enlace.` };
  }
  const r = await documentosDeOPPorNumero(candidatosNumeroOP(numero_op), { tipos: [tipo] });
  if (!r) return noEncontrada(numero_op);
  const candidatos = filtrarPorNombre(r.documentos.filter((d) => d.extension === 'pdf'), nombre);
  if (!candidatos.length) {
    return { numero_op: r.numero_op, error: nombre ? `La OP no tiene un PDF de tipo "${tipo}" cuyo nombre contenga "${nombre}".` : `La OP no tiene PDFs de tipo "${tipo}" indexados.` };
  }
  const elegidos = candidatos.slice(0, MAX_DOCUMENTOS_LEIDOS);

  const { estados } = await leerEnParalelo(elegidos);

  const documentos = [];
  const errores = [];
  const pendientes = [];
  for (const e of estados) {
    if (!e.hecho) pendientes.push(e.doc.nombre_archivo);
    else if (e.err) errores.push({ documento: e.doc.nombre_archivo, error: 'No se pudo leer el PDF en este momento.' });
    else if (e.res.error) errores.push({ documento: e.doc.nombre_archivo, error: e.res.mensaje ?? e.res.error });
    else documentos.push(compactarLectura(e.res, e.doc));
  }
  const salida = { numero_op: r.numero_op, tipo, documentos };
  if (candidatos.length > elegidos.length) salida.mensaje = `La OP tiene ${candidatos.length} documentos de este tipo; se leyeron los primeros ${elegidos.length}. Pide uno por nombre para ver los demás.`;
  else if (candidatos.length > 1) salida.nota_varias = 'La OP tiene varias PIs (pueden ser parciales): muéstralas todas y no asumas que una sola cubre el pedido.';
  if (pendientes.length) {
    salida.procesando = pendientes;
    salida.mensaje_procesando = 'Estos PDFs siguen leyéndose. Dile al usuario que pida lo mismo en un minuto.';
  }
  if (errores.length) salida.errores = errores;
  return salida;
}

export async function validarPiVsOp({ numero_op, tolerancia_cajas }, ctx) {
  if (!puedeVerPrecios(ctx)) return SIN_PERMISO_DOCUMENTO;
  const r = await documentosDeOPPorNumero(candidatosNumeroOP(numero_op), { tipos: ['pi'] });
  if (!r) return noEncontrada(numero_op);
  const pdfs = r.documentos.filter((d) => d.extension === 'pdf');
  if (!pdfs.length) return { numero_op: r.numero_op, estado: 'no_concluyente', motivo: 'La OP no tiene PIs (PDF) indexadas.' };
  if (pdfs.length > MAX_DOCUMENTOS_LEIDOS) {
    return { numero_op: r.numero_op, error: `La OP tiene ${pdfs.length} PIs y se pueden validar como máximo ${MAX_DOCUMENTOS_LEIDOS} a la vez.` };
  }

  const { estados } = await leerEnParalelo(pdfs);
  const pendientes = estados.filter((e) => !e.hecho).map((e) => e.doc.nombre_archivo);
  if (pendientes.length) {
    // Con PIs sin leer la comparación quedaría incompleta y podría dar un resultado engañoso: se espera a tenerlas todas.
    return {
      numero_op: r.numero_op,
      procesando: pendientes,
      mensaje_procesando: 'Algunas PIs siguen leyéndose; la validación se hará cuando estén todas. Dile al usuario que repita la pregunta en un minuto.',
    };
  }
  const errores = [];
  const pis = [];
  for (const e of estados) {
    if (e.err) errores.push({ documento: e.doc.nombre_archivo, error: 'No se pudo leer el PDF en este momento.' });
    else if (e.res.error) errores.push({ documento: e.doc.nombre_archivo, error: e.res.mensaje ?? e.res.error });
    else pis.push({ documento: e.doc.nombre_archivo, extraccion: e.res.extraccion, validacion: e.res.validacion });
  }
  if (errores.length) return { numero_op: r.numero_op, estado: 'no_concluyente', motivo: 'No se pudieron leer todas las PIs; la comparación sería incompleta.', errores };

  const tolerancia = Number.isFinite(Number(tolerancia_cajas)) && Number(tolerancia_cajas) >= 0 ? Number(tolerancia_cajas) : TOLERANCIA_CAJAS_DEFECTO;
  const resultado = compararPiConOp({ itemsOP: await lineasOPParaValidacion(r.id), pis, toleranciaCajas: tolerancia });
  return { numero_op: r.numero_op, tolerancia_cajas: tolerancia, ...resultado };
}
