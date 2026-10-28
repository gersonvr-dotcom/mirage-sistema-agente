import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db/pool.js';
import { obtenerAccessToken, graphDescargarContenido } from './sharepoint.js';
import {
  ESQUEMA_PI,
  PROMPT_EXTRACCION_PI,
  VERSION_EXTRACCION,
  normalizarExtraccion,
  validarExtraccion,
} from './extraccionPi.js';

// Tipos de documento que se saben leer (el esquema es el de la Proforma Invoice) y tope de tamaño: los PDFs viajan
// en línea (base64) al modelo, cuyo límite de petición ronda los 20 MB.
export const TIPOS_EXTRAIBLES = ['pi'];
const TAMANO_MAX = 15 * 1024 * 1024;
const MAX_TOKENS_SALIDA = 16000;

// El consumo de la extracción NO cuenta contra el límite de tokens del chat: se guarda en meta.usage de cada documento.
const proveedorExtractor = () => (process.env.EXTRACTOR_PROVIDER || process.env.AGENT_PROVIDER || 'gemini').toLowerCase();

async function extraerConGemini(pdf) {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const modelo = process.env.GEMINI_EXTRACTOR_MODEL || process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const response = await client.models.generateContent({
    model: modelo,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: pdf.toString('base64') } },
          { text: PROMPT_EXTRACCION_PI },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: ESQUEMA_PI,
      temperature: 0,
      maxOutputTokens: MAX_TOKENS_SALIDA,
    },
  });
  const um = response.usageMetadata ?? {};
  return {
    bruta: JSON.parse(response.text),
    proveedor: 'gemini',
    modelo,
    usage: {
      inputTokens: um.promptTokenCount ?? 0,
      outputTokens: (um.candidatesTokenCount ?? 0) + (um.thoughtsTokenCount ?? 0),
    },
  };
}

async function extraerConClaude(pdf) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const modelo = process.env.ANTHROPIC_EXTRACTOR_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
  const response = await client.messages.create({
    model: modelo,
    max_tokens: MAX_TOKENS_SALIDA,
    temperature: 0,
    tools: [
      {
        name: 'registrar_extraccion',
        description: 'Registra los datos leídos de la proforma invoice.',
        input_schema: ESQUEMA_PI,
      },
    ],
    tool_choice: { type: 'tool', name: 'registrar_extraccion' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
          { type: 'text', text: PROMPT_EXTRACCION_PI },
        ],
      },
    ],
  });
  const bloque = response.content.find((b) => b.type === 'tool_use');
  if (!bloque) throw new Error('El modelo no devolvió datos estructurados');
  return {
    bruta: bloque.input,
    proveedor: 'claude',
    modelo,
    usage: { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 },
  };
}

/** Lee un PDF de proforma con el modelo configurado y devuelve extracción normalizada + validación contra sus totales. */
export async function extraerPiDePdf(pdf) {
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('El archivo no es un PDF');
  const leido = proveedorExtractor() === 'claude' ? await extraerConClaude(pdf) : await extraerConGemini(pdf);
  const extraccion = normalizarExtraccion(leido.bruta);
  return {
    extraccion,
    validacion: validarExtraccion(extraccion),
    meta: { proveedor: leido.proveedor, modelo: leido.modelo, usage: leido.usage },
  };
}

const enCurso = new Map(); // documentoId -> Promise: evita leer dos veces el mismo PDF si llegan pedidos simultáneos

/**
 * Datos leídos de un documento de OP (PI). Usa la caché de documentos_op.extraccion_json; esa columna se vacía sola
 * cuando la sincronización detecta otro etag, así que lo cacheado siempre corresponde a la versión actual del archivo.
 * Si no hay caché descarga el PDF de SharePoint (solo en memoria, no se escribe a disco), lo lee y guarda el resultado.
 * Un fallo del modelo no se cachea. Devuelve { ...registro, desde_cache }.
 */
export function obtenerExtraccionDocumento(documentoId, { forzar = false } = {}) {
  const id = Number(documentoId);
  if (!enCurso.has(id)) {
    const p = leerYGuardar(id, forzar).finally(() => enCurso.delete(id));
    enCurso.set(id, p);
  }
  return enCurso.get(id);
}

async function leerYGuardar(id, forzar) {
  const [[doc]] = await pool.query(
    `SELECT id, op_id, tipo, extension, nombre_archivo, drive_id, item_id, tamano, etag, extraccion_json
       FROM documentos_op WHERE id = ?`,
    [id]
  );
  if (!doc) return { error: 'documento_no_encontrado', mensaje: `No existe el documento ${id}` };
  if (!TIPOS_EXTRAIBLES.includes(doc.tipo) || doc.extension !== 'pdf') {
    return {
      error: 'tipo_no_soportado',
      mensaje: `Solo se leen PDFs de proforma invoice; este documento es de tipo "${doc.tipo}" (${doc.extension || 'sin extensión'})`,
    };
  }
  if (!forzar && doc.extraccion_json) return { ...JSON.parse(doc.extraccion_json), desde_cache: true };
  if (doc.tamano && Number(doc.tamano) > TAMANO_MAX) {
    return { error: 'archivo_muy_grande', mensaje: `El PDF pesa más de ${TAMANO_MAX / 1024 / 1024} MB` };
  }

  const token = await obtenerAccessToken();
  const pdf = await graphDescargarContenido(doc.drive_id, doc.item_id, token);
  const leido = await extraerPiDePdf(pdf);
  const registro = {
    version: VERSION_EXTRACCION,
    documento: { id: doc.id, op_id: doc.op_id, nombre_archivo: doc.nombre_archivo },
    meta: { ...leido.meta, extraido_en: new Date().toISOString(), etag: doc.etag },
    extraccion: leido.extraccion,
    validacion: leido.validacion,
  };
  // Si la sincronización cambió el etag mientras se leía, ese resultado ya es de un archivo viejo: no se guarda.
  await pool.query(
    'UPDATE documentos_op SET extraccion_json = ?, extraido_en = NOW() WHERE id = ? AND etag <=> ?',
    [JSON.stringify(registro), doc.id, doc.etag]
  );
  return { ...registro, desde_cache: false };
}
