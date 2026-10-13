import ExcelJS from 'exceljs';
import { obtenerAccessToken, graphGet, graphDescargarContenido } from './sharepoint.js';
import { celdaTexto, celdaNumero } from './opFolders.js';
import { claveTexto } from './proyectoNormalizer.js';

const ARCHIVO_COTIZACION_RE = /^\d{4}-\d+-[A-Z]+.*\.xlsx$/i;
const NUMERO_EN_NOMBRE_RE = /^(\d{4}-\d+-[A-Z]+)/i;
const MAX_COLUMNAS = 30;

// Posiciones de respaldo (plantilla estándar) si no se encuentra el nombre de la columna en el encabezado.
const COLUMNAS_POR_DEFECTO = { area: 2, fabrica: 3, linea: 4, codigo: 5, acabado: 6, formato: 7, cantidad: 8, unidad: 11, cantidadFinal: 15 };
const ENCABEZADOS = {
  area: /^AREA$/,
  fabrica: /^FABRICA$/,
  linea: /^(LINEA|MODELO)\b/,
  codigo: /^CODIGO\b/,
  acabado: /^ACABADO\b/,
  formato: /^FORMATO\b/,
  cantidad: /^CANTIDAD$/,
  unidad: /^(U MEDIDA|UNIDAD)\b/,
  cantidadFinal: /^M2 PZ FINALES/,
};

const norm = (v) => claveTexto(celdaTexto(v) ?? '').replace(/\*/g, '').trim();

function aMoneda(texto) {
  const t = claveTexto(texto ?? '');
  if (/^(DOLAR|DOLARES|USD|US\$|\$)$/.test(t)) return 'USD';
  if (/^(COLON|COLONES|CRC)$/.test(t)) return 'CRC';
  if (/^(EUR|EURO|EUROS)$/.test(t)) return 'EUR';
  return null;
}

function aFechaISO(valor) {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  const m = String(celdaTexto(valor) ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const redondear = (n, d = 2) => (n === null || n === undefined ? null : Math.round(n * 10 ** d) / 10 ** d);

/**
 * Extrae líneas, precios y totales de una hoja con la plantilla de cotización (ver tarea D-02 del roadmap).
 * Reglas aprendidas de cotizaciones reales: el encabezado cae en filas distintas (14/16/18) y se detecta por el
 * texto "PRECIO…"; las columnas se leen por nombre sin tildes; las líneas terminan en "GRAN TOTAL" (columna del
 * precio) y las filas de sección o de plantilla vacía (sin precio numérico) se saltan; el pie (GRAN TOTAL,
 * DESCUENTO, SUBTOTAL, I.V.A, VALOR TOTAL) es una lista vertical etiqueta/valor en las columnas de precio/total.
 */
export function extraerCotizacion(ws, nombreArchivo = '') {
  const advertencias = [];
  const val = (r, c) => ws.getRow(r).getCell(c).value;
  const texto = (r, c) => celdaTexto(val(r, c));
  const num = (r, c) => celdaNumero(val(r, c));

  let hdr = null;
  let precioCol = null;
  for (let r = 1; r <= Math.min(ws.rowCount, 40) && !hdr; r++) {
    for (let c = 1; c <= MAX_COLUMNAS; c++) {
      if (/^PRECIO/.test(norm(val(r, c)))) {
        hdr = r;
        precioCol = c;
        break;
      }
    }
  }
  if (!hdr) return { error: 'No se encontró el encabezado de precios en la hoja.', advertencias };
  const totalCol = precioCol + 1;
  const concepto = /\bMO\b/.test(norm(val(hdr, precioCol))) ? 'mano_obra' : 'material';

  const col = { ...COLUMNAS_POR_DEFECTO };
  const hallados = new Set();
  for (let c = 1; c <= MAX_COLUMNAS; c++) {
    const t = norm(val(hdr, c));
    for (const [clave, re] of Object.entries(ENCABEZADOS)) {
      if (!hallados.has(clave) && re.test(t)) {
        col[clave] = c;
        hallados.add(clave);
      }
    }
  }

  const lineas = [];
  let sumaLineas = 0;
  for (let r = hdr + 1; r <= ws.rowCount; r++) {
    if (norm(val(r, precioCol)).startsWith('GRAN TOTAL')) break;
    const precio = num(r, precioCol);
    const importe = num(r, totalCol);
    if (precio === null || importe === null) {
      const encabezadoPago = [1, 2, 3].some((c) => norm(val(r, c)).includes('FORMA DE PAGO'));
      if (encabezadoPago) break;
      continue;
    }
    let linea = texto(r, col.linea);
    let codigo = texto(r, col.codigo);
    let formato = texto(r, col.formato);
    let descripcion = null;
    // Ítem a medida (sobres, muebles): la descripción viene repetida en varias columnas combinadas.
    if (linea && linea === codigo) {
      descripcion = linea;
      linea = null;
      codigo = null;
      if (formato === descripcion) formato = null;
    }
    const cantidad = num(r, col.cantidad);
    const cantidadFinal = num(r, col.cantidadFinal) ?? cantidad;
    const orden = num(r, 1);
    sumaLineas += importe;
    lineas.push({
      orden: orden !== null && Number.isInteger(orden) ? orden : lineas.length + 1,
      area: texto(r, col.area),
      fabrica: texto(r, col.fabrica),
      lineaCatalogo: linea,
      codColor: codigo,
      acabado: texto(r, col.acabado),
      formato,
      descripcion,
      cantidad,
      unidad: (texto(r, col.unidad) ?? '').toUpperCase() || null,
      cantidadFinal,
      precioUnitario: precio,
      conceptoPrecio: concepto,
      importe,
    });
  }

  const pie = { granTotal: null, descuento: null, subtotal: null, iva: null, transporte: null, valorTotal: null };
  let moneda = null;
  let monedaTexto = null;
  let anticipoPct = null;
  for (let r = hdr + 1; r <= ws.rowCount; r++) {
    const etiqueta = norm(val(r, precioCol));
    const valor = num(r, totalCol);
    if (etiqueta.startsWith('GRAN TOTAL')) pie.granTotal = valor;
    else if (etiqueta.startsWith('DESCUENTO')) pie.descuento = valor;
    else if (/^SUB ?TOTAL/.test(etiqueta)) pie.subtotal = valor;
    else if (/^(I V A|IVA)\b/.test(etiqueta)) pie.iva = valor ?? (/EXONERAD/.test(norm(val(r, totalCol))) ? 0 : null);
    else if (/^(TRANSPORTE|FLETE)\b/.test(etiqueta)) pie.transporte = valor;
    else if (etiqueta.startsWith('VALOR TOTAL')) pie.valorTotal = valor;

    for (let c = 1; c <= MAX_COLUMNAS; c++) {
      const t = norm(val(r, c));
      if (t === 'MONEDA' && moneda === null) {
        monedaTexto = texto(r + 1, c);
        moneda = aMoneda(monedaTexto);
      } else if (t === 'ANTICIPO' && anticipoPct === null) {
        const a = num(r + 1, c);
        if (a !== null) anticipoPct = a <= 1 ? a * 100 : a;
      }
    }
  }

  let numeroCotizacion = null;
  let fecha = null;
  for (let r = 1; r <= hdr && numeroCotizacion === null; r++) {
    for (let c = 1; c <= MAX_COLUMNAS; c++) {
      if (norm(val(r, c)).startsWith('COTIZACION N')) {
        numeroCotizacion = texto(r + 1, c);
        for (let f = 1; f <= MAX_COLUMNAS; f++) {
          if (norm(val(r, f)) === 'FECHA') fecha = aFechaISO(val(r + 1, f));
        }
        break;
      }
    }
  }
  if (!numeroCotizacion) numeroCotizacion = nombreArchivo.match(NUMERO_EN_NOMBRE_RE)?.[1]?.toUpperCase() ?? null;

  if (lineas.length === 0) advertencias.push('La cotización no tiene líneas con precio.');
  if (pie.granTotal !== null && Math.abs(pie.granTotal - sumaLineas) > 0.011) {
    advertencias.push(`El GRAN TOTAL (${pie.granTotal}) no coincide con la suma de las líneas (${redondear(sumaLineas)}).`);
  }
  // El renglón SUBTOTAL a veces va antes y a veces después del TRANSPORTE, así que no se usa para validar:
  // el total debe ser (gran total - descuento) + transporte + IVA.
  if (pie.valorTotal !== null && pie.granTotal !== null) {
    const esperado = pie.granTotal - (pie.descuento ?? 0) + (pie.transporte ?? 0) + (pie.iva ?? 0);
    if (Math.abs(pie.valorTotal - esperado) > 0.011) {
      advertencias.push(`El VALOR TOTAL (${pie.valorTotal}) no coincide con gran total - descuento + transporte + IVA (${redondear(esperado)}).`);
    }
  }
  if (monedaTexto && !moneda) advertencias.push(`Moneda no reconocida: "${monedaTexto}".`);
  if (!monedaTexto) advertencias.push('No se encontró la moneda.');

  return { numeroCotizacion, fecha, moneda, anticipoPct, lineas, sumaLineas: redondear(sumaLineas), pie, advertencias };
}

/** Busca en la carpeta de una OP el XLSX de cotización (si hay varios, prefiere el "ACTUALIZ…") y lo extrae. */
export async function obtenerCotizacionXlsx(carpeta) {
  const token = await obtenerAccessToken();
  const hijos = await graphGet(`/drives/${carpeta.driveId}/items/${carpeta.id}/children?$top=100&$select=id,name`, token);
  const candidatos = hijos.value.filter((h) => ARCHIVO_COTIZACION_RE.test(h.name));
  if (candidatos.length === 0) return null;
  const archivo = candidatos.find((h) => /ACTUALIZ/i.test(h.name)) ?? candidatos[0];

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await graphDescargarContenido(carpeta.driveId, archivo.id, token));
  const ws = wb.worksheets[0];
  if (!ws) return { archivo: archivo.name, error: 'El archivo no tiene hojas.', advertencias: [] };
  return { archivo: archivo.name, ...extraerCotizacion(ws, archivo.name) };
}
