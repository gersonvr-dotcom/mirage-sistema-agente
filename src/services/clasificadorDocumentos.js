import { claveTexto } from './proyectoNormalizer.js';

/**
 * Tipos de documento que se guardan en documentos_op. El tipo se decide por el NOMBRE del archivo (no hace falta
 * descargarlo); las reglas salen de los nombres reales de las carpetas de OP en SharePoint.
 */
export const TIPOS_DOCUMENTO = ['cotizacion', 'op', 'pi', 'factura', 'nota_credito', 'boleta', 'pago', 'orden_compra', 'imagen', 'otro'];

/**
 * Tipos que traen montos o costos (precios de venta, costo de fábrica, pagos): solo los ve el administrador, igual
 * que el resto de precios. El operador solo ve la OP, la boleta de entrega y las imágenes.
 */
export const TIPOS_DOCUMENTO_VISIBLES_OPERADOR = ['op', 'boleta', 'imagen'];

const EXTENSIONES_IMAGEN = new Set(['jpg', 'jpeg', 'png', 'heic', 'gif', 'webp']);

export function extensionDe(nombre) {
  const m = String(nombre ?? '').match(/\.([A-Za-z0-9]{1,5})$/);
  return m ? m[1].toLowerCase() : '';
}

/**
 * @param {string} nombre nombre del archivo
 * @param {{subcarpeta?: string|null}} opciones  nombre de la subcarpeta donde vive (si no está en la raíz de la OP)
 * @returns {string} uno de TIPOS_DOCUMENTO
 */
export function clasificarDocumento(nombre, { subcarpeta = null } = {}) {
  const n = claveTexto(String(nombre ?? '').replace(/\.[A-Za-z0-9]{1,5}$/, ''));
  const ext = extensionDe(nombre);

  if (/^PI\b/.test(n) || /^PROFORMA\b/.test(n)) return 'pi';
  if (subcarpeta && /\bPROFORMA\b/.test(claveTexto(subcarpeta)) && ext === 'pdf') return 'pi';
  if (/^FAC/.test(n)) return 'factura';
  if (/^NC\b/.test(n) || /^NOTA DE CREDITO/.test(n)) return 'nota_credito';
  if (/^BOLETA/.test(n)) return 'boleta';
  if (/^OP\b/.test(n)) return 'op';
  if (/^\d{4} \d+ [A-Z]+/.test(n) || /^COTIZACION/.test(n)) return 'cotizacion';
  if (/^(VALIDACION|PAGO|COMPROBANTE|ADELANTO|REC|RECIBO|BNCR)\b/.test(n)) return 'pago';
  if (/^(OC|ORDEN|ORDENES|REPORTEORDENCOMPRA|ADDENDUM|PORCELANATOS ITALIANOS)\b/.test(n) || /^\d+ PORCELANATOS ITALIANOS/.test(n)) {
    return 'orden_compra';
  }
  if (EXTENSIONES_IMAGEN.has(ext) || /^(WHATSAPP|PHOTO|IMG|CAMSCANNER)\b/.test(n)) return 'imagen';
  return 'otro';
}
