import ExcelJS from 'exceljs';

export const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const HOJA_COMERCIAL = 'PEDIDOS 2026';
const CACHE_TTL_MS = 5 * 60 * 1000;

let tokenCache = { value: null, expiresAt: 0 };
let filasCache = { value: null, expiresAt: 0 };

export function encodeSharingUrl(url) {
  const base64 = Buffer.from(url, 'utf8').toString('base64');
  return 'u!' + base64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
}

export async function obtenerAccessToken() {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt) return tokenCache.value;

  const { SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET } = process.env;
  if (!SHAREPOINT_TENANT_ID || !SHAREPOINT_CLIENT_ID || !SHAREPOINT_CLIENT_SECRET) {
    throw new Error('Faltan las variables SHAREPOINT_TENANT_ID / SHAREPOINT_CLIENT_ID / SHAREPOINT_CLIENT_SECRET.');
  }

  const res = await fetch(`https://login.microsoftonline.com/${SHAREPOINT_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: SHAREPOINT_CLIENT_ID,
      client_secret: SHAREPOINT_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`No se pudo autenticar contra Microsoft Graph: ${JSON.stringify(data)}`);

  tokenCache = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return tokenCache.value;
}

async function descargarExcel() {
  const shareUrl = process.env.SHAREPOINT_SHARE_URL;
  if (!shareUrl) throw new Error('Falta la variable SHAREPOINT_SHARE_URL.');

  const token = await obtenerAccessToken();
  const shareId = encodeSharingUrl(shareUrl);

  const itemRes = await fetch(`${GRAPH_BASE}/shares/${shareId}/driveItem`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const item = await itemRes.json();
  if (!itemRes.ok) throw new Error(`No se pudo ubicar el archivo en SharePoint: ${JSON.stringify(item)}`);

  const contentRes = await fetch(
    `${GRAPH_BASE}/drives/${item.parentReference.driveId}/items/${item.id}/content`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!contentRes.ok) {
    throw new Error(`No se pudo descargar el archivo de SharePoint: ${contentRes.status}`);
  }
  return Buffer.from(await contentRes.arrayBuffer());
}

export async function graphGet(path, token) {
  const res = await fetch(`${GRAPH_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`Graph GET ${path} -> ${JSON.stringify(data)}`);
  return data;
}

export async function graphDescargarContenido(driveId, itemId, token) {
  const res = await fetch(`${GRAPH_BASE}/drives/${driveId}/items/${itemId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`No se pudo descargar el archivo de SharePoint: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function celdaTexto(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'object' && valor instanceof Date) return valor;
  if (typeof valor === 'object' && 'text' in valor) return String(valor.text).trim() || null;
  if (typeof valor === 'object' && 'result' in valor) return valor.result;
  const s = String(valor).trim();
  return s === '' ? null : s;
}

function celdaFecha(valor) {
  const v = celdaTexto(valor);
  if (v === null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function parsearFilas(buffer) {
  const workbook = new ExcelJS.Workbook();
  return workbook.xlsx.load(buffer).then(() => {
    const sheet = workbook.getWorksheet(HOJA_COMERCIAL);
    if (!sheet) throw new Error(`No se encontró la hoja "${HOJA_COMERCIAL}" en el Excel.`);

    const filas = [];
    for (let i = 3; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const op = celdaTexto(row.getCell(2).value);
      const cliente = celdaTexto(row.getCell(5).value);
      if (!op && !cliente) continue;

      filas.push({
        fila_excel: i,
        fecha_pedido: celdaFecha(row.getCell(1).value),
        op,
        cotizacion: celdaTexto(row.getCell(3).value),
        oc: celdaTexto(row.getCell(4).value),
        cliente,
        proyecto: celdaTexto(row.getCell(6).value),
        fecha_pactada: celdaFecha(row.getCell(7).value),
        observaciones: celdaTexto(row.getCell(8).value),
      });
    }
    return filas;
  });
}

/** Filas del Departamento Comercial (columnas A-H) del Excel maestro en SharePoint, con caché
 * en memoria de unos minutos para no descargar y re-parsear el archivo en cada mensaje. */
export async function obtenerFilasComerciales({ forzarRecarga = false } = {}) {
  if (!forzarRecarga && filasCache.value && Date.now() < filasCache.expiresAt) {
    return filasCache.value;
  }

  const buffer = await descargarExcel();
  const filas = await parsearFilas(buffer);
  filasCache = { value: filas, expiresAt: Date.now() + CACHE_TTL_MS };
  return filas;
}
