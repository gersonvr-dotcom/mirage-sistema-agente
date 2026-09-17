import ExcelJS from 'exceljs';
import { obtenerAccessToken, encodeSharingUrl, graphGet, graphDescargarContenido } from './sharepoint.js';

const OP_EN_NOMBRE_RE = /^OP[-\s]+(\d{4}-\d+)/i;
const ARCHIVO_OP_RE = /^OP[-\s].*\.xlsx$/i;

function celdaTexto(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'object' && 'text' in valor) return String(valor.text).trim() || null;
  if (typeof valor === 'object' && 'result' in valor) return celdaTexto(valor.result);
  const s = String(valor).trim();
  return s === '' ? null : s;
}

function celdaNumero(valor) {
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

  let numeroCotizacion = null;
  for (let i = 1; i <= Math.min(sheet.rowCount, 20); i++) {
    const valores = sheet.getRow(i).values;
    const idxLabel = valores.findIndex((v) => typeof v === 'string' && v.trim().toUpperCase().startsWith('COTIZACI'));
    if (idxLabel === -1) continue;
    for (let j = idxLabel + 1; j < valores.length; j++) {
      const v = celdaTexto(valores[j]);
      if (v) {
        numeroCotizacion = v;
        break;
      }
    }
    break;
  }

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

  return { numeroCotizacion, lineas };
}
