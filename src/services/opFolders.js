import ExcelJS from 'exceljs';
import { obtenerAccessToken, encodeSharingUrl, graphGet, graphDescargarContenido } from './sharepoint.js';

const OP_EN_NOMBRE_RE = /^OP[-\s]+(\d{4}-\d+)/i;
const ARCHIVO_OP_RE = /^OP[-\s].*\.xlsx$/i;

export function celdaTexto(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'object' && Array.isArray(valor.richText)) return valor.richText.map((t) => t.text).join('').trim() || null;
  if (typeof valor === 'object' && 'text' in valor) return String(valor.text).trim() || null;
  if (typeof valor === 'object' && 'result' in valor) return celdaTexto(valor.result);
  const s = String(valor).trim();
  return s === '' ? null : s;
}

export function celdaNumero(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'object' && 'result' in valor) return celdaNumero(valor.result);
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Lista todas las carpetas de OP dentro de la carpeta fija de SharePoint (paginando),
 * extrayendo el número de OP (formato "AAAA-NNN") del nombre de cada carpeta. */
export async function listarCarpetasOP() {
  const folderUrl = process.env.SHAREPOINT_OPS_FOLDER_URL;
  if (!folderUrl) throw new Error('Falta la variable SHAREPOINT_OPS_FOLDER_URL.');

  const token = await obtenerAccessToken();
  const shareId = encodeSharingUrl(folderUrl);
  const raiz = await graphGet(`/shares/${shareId}/driveItem`, token);
  const driveId = raiz.parentReference.driveId;

  const carpetas = [];
  let path = `/drives/${driveId}/items/${raiz.id}/children?$top=200&$select=id,name,folder`;
  while (path) {
    const pagina = await graphGet(path, token);
    for (const item of pagina.value) {
      if (!item.folder) continue;
      const match = item.name.match(OP_EN_NOMBRE_RE);
      if (!match) continue;
      carpetas.push({ id: item.id, name: item.name, numeroOp: match[1], driveId });
    }
    const next = pagina['@odata.nextLink'];
    path = next ? next.replace('https://graph.microsoft.com/v1.0', '') : null;
  }
  return carpetas;
}

/**
 * Valor de un rótulo del encabezado ("Fábrica:", "Cotización") en las filas de la hoja: la primera celda con texto
 * a la derecha del rótulo que no sea el propio rótulo repetido. Las celdas combinadas repiten el valor en varias columnas, por eso se toma solo la primera.
 */
export function valorDeRotulo(filas, esRotulo) {
  for (const valores of filas) {
    const idx = valores.findIndex((v) => typeof v === 'string' && esRotulo(v.trim().toUpperCase()));
    if (idx === -1) continue;
    for (let j = idx + 1; j < valores.length; j++) {
      const v = celdaTexto(valores[j]);
      // Un rótulo combinado ("Fábrica:" en dos columnas) se repite: no es el valor.
      if (v && !(typeof v === 'string' && esRotulo(v.trim().toUpperCase()))) return v;
    }
    return null;
  }
  return null;
}

export const esRotuloFabrica = (t) => /^F[AÁ]BRICA\b/.test(t);

/** Dentro de una carpeta de OP, busca el archivo "OP-XXXX.xlsx", extrae el número de
 * cotización y las líneas de producto (tabla que arranca en la fila "LINEA" y termina en
 * "TOTALES"). Devuelve null si la carpeta no tiene ese archivo. */
export async function obtenerCotizacionYLineas(carpeta) {
  const token = await obtenerAccessToken();
  const hijos = await graphGet(`/drives/${carpeta.driveId}/items/${carpeta.id}/children?$top=60&$select=id,name`, token);
  const archivo = hijos.value.find((i) => ARCHIVO_OP_RE.test(i.name));
  if (!archivo) return null;

  const buffer = await graphDescargarContenido(carpeta.driveId, archivo.id, token);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('OP') || workbook.worksheets[0];
  if (!sheet) return null;

  return extraerOP(sheet);
}

/** Parte pura de la lectura del OP-XXXX.xlsx (hoja ya cargada): encabezado (cotización, fábrica) y líneas de producto. */
export function extraerOP(sheet) {
  const encabezado = [];
  for (let i = 1; i <= Math.min(sheet.rowCount, 20); i++) encabezado.push(sheet.getRow(i).values);
  const numeroCotizacion = valorDeRotulo(encabezado, (t) => t.startsWith('COTIZACI'));
  const fabrica = valorDeRotulo(encabezado, esRotuloFabrica);

  let filaHeader = null;
  for (let i = 1; i <= Math.min(sheet.rowCount, 40); i++) {
    const valores = sheet.getRow(i).values;
    if (valores.some((v) => typeof v === 'string' && v.trim().toUpperCase() === 'LINEA')) {
      filaHeader = i;
      break;
    }
  }

  const lineas = [];
  if (filaHeader) {
    for (let i = filaHeader + 1; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const valores = row.values;
      if (valores.some((v) => typeof v === 'string' && v.trim().toUpperCase().startsWith('TOTALES'))) break;
      if (valores.every((v) => v === null || v === undefined)) break;

      const lineaCatalogo = celdaTexto(row.getCell(3).value);
      const codColor = celdaTexto(row.getCell(6).value);
      const acabado = celdaTexto(row.getCell(7).value);
      const formato = celdaTexto(row.getCell(8).value);
      const cajas = celdaNumero(row.getCell(10).value);
      const m2xCaja = celdaNumero(row.getCell(11).value);
      const total = celdaNumero(row.getCell(12).value);
      const unidadMedida = celdaTexto(row.getCell(13).value);
      const notas = celdaTexto(row.getCell(14).value);

      if (!lineaCatalogo || total === null) continue;
      lineas.push({ lineaCatalogo, codColor, acabado, formato, cajas, m2xCaja, total, unidadMedida, notas });
    }
  }

  return { numeroCotizacion, fabrica, lineas };
}
