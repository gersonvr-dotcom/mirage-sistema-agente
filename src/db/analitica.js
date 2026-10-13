import { pool } from './pool.js';
import { TIPOS_CLIENTE } from './clienteTipos.js';

/**
 * Métricas de venta (ranking por m² y volumen vendido). Una sola implementación para el agente y para los
 * endpoints/Dashboard, para que nunca discrepen. Criterio acordado (Q6 del roadmap):
 *  - m² = solo líneas con unidad M2 (ML, PIEZAS y MAPPAS no se mezclan con m²);
 *  - la fecha es la de emisión de la OP; las ventas de stock cuentan;
 *  - se excluyen las OPs canceladas (ANULADO) y los clientes de tipo 'interno' (muestras, mercadeo).
 */
export const CRITERIO_VENTAS =
  'Solo líneas en M2 (ML, piezas y mapas no se suman como m²); fecha de emisión de la OP; incluye ventas de stock; ' +
  'excluye OPs anuladas/canceladas y clientes internos.';

export const CRITERIO_IMPORTE =
  'Suma el importe de todas las líneas con precio, en cualquier unidad (m², ML, piezas), neto de IVA y con el descuento aplicado; ' +
  'fecha de emisión de la OP; incluye ventas de stock; excluye OPs anuladas/canceladas y clientes internos; las líneas sin precio no se suman.';

const BASE_FROM = `
  FROM op_items oi
  JOIN ops o ON o.id = oi.op_id
  JOIN clientes c ON c.id = o.cliente_id
  JOIN proyectos p ON p.id = o.proyecto_id
  JOIN productos pr ON pr.id = oi.producto_id
  LEFT JOIN proveedores prov ON prov.id = oi.proveedor_id`;

const FILTROS_BASE = [`o.estado_general <> 'cancelada'`, `(c.tipo IS NULL OR c.tipo <> 'interno')`];
const ES_M2 = `UPPER(TRIM(pr.unidad_medida)) = 'M2'`;

/** Lista blanca: el texto que llega del agente NUNCA se interpola en la query, solo elige una de estas expresiones. */
const AGRUPACIONES = {
  cliente: 'c.nombre',
  proyecto: `CONCAT(c.nombre, ' / ', p.nombre)`,
  mes: `DATE_FORMAT(o.fecha_emision, '%Y-%m')`,
  linea_catalogo: 'pr.nombre',
  formato: `COALESCE(oi.formato, pr.formato, 'sin formato')`,
  proveedor: `COALESCE(prov.nombre, 'sin proveedor')`,
  tipo_cliente: `COALESCE(c.tipo, 'sin tipo')`,
};
export const AGRUPACIONES_VALIDAS = Object.keys(AGRUPACIONES);
export const METRICAS_VALIDAS = ['m2', 'importe'];

const redondear = (n) => Math.round(Number(n) * 100) / 100;
const limiteSeguro = (limite, porDefecto) => Math.min(Math.max(Math.trunc(Number(limite)) || porDefecto, 1), 100);

function fechaValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

/** Rango de fechas de emisión: desde un año completo o desde fechas AAAA-MM-DD (todas opcionales). */
function rangoDeFechas({ anio, fechaInicio, fechaFin }) {
  let desde = fechaInicio ?? null;
  let hasta = fechaFin ?? null;
  if (anio !== undefined && anio !== null && anio !== '') {
    const a = Number(anio);
    if (!Number.isInteger(a) || a < 2000 || a > 2100) return { error: 'El año debe ser un entero entre 2000 y 2100.' };
    desde = `${a}-01-01`;
    hasta = `${a}-12-31`;
  }
  if (desde && !fechaValida(desde)) return { error: 'fecha_inicio debe tener formato AAAA-MM-DD y ser una fecha real.' };
  if (hasta && !fechaValida(hasta)) return { error: 'fecha_fin debe tener formato AAAA-MM-DD y ser una fecha real.' };
  if (desde && hasta && desde > hasta) return { error: 'fecha_inicio no puede ser posterior a fecha_fin.' };
  return { desde, hasta };
}

function condicionesFecha({ desde, hasta }, where, params) {
  if (desde) { where.push('o.fecha_emision >= ?'); params.push(desde); }
  if (hasta) { where.push('o.fecha_emision <= ?'); params.push(hasta); }
}

/** OPs que las métricas por fecha no pueden ubicar (el Excel Madre trae fechas como 0 o 7 en algunas filas). */
async function advertenciasDeFecha() {
  const [filas] = await pool.query(
    `SELECT o.numero_op FROM ops o JOIN clientes c ON c.id = o.cliente_id
      WHERE o.fecha_emision < '2000-01-01' AND ${FILTROS_BASE.join(' AND ')} ORDER BY o.numero_op`
  );
  if (filas.length === 0) return undefined;
  return [`${filas.length} OP(s) con fecha de emisión inválida en el Excel Madre quedan fuera de los filtros por fecha: ${filas.map((f) => f.numero_op).join(', ')}. Hay que corregir la fecha en el Excel.`];
}

/** Ranking de clientes por m² comprados. anio y clienteTipo son opcionales; sin año cuenta todos los años. */
export async function rankingClientesPorM2({ anio, clienteTipo, limite } = {}) {
  const fechas = rangoDeFechas({ anio });
  if (fechas.error) return { error: fechas.error };
  if (clienteTipo && !TIPOS_CLIENTE.includes(clienteTipo)) {
    return { error: `Tipo de cliente no válido. Valores permitidos: ${TIPOS_CLIENTE.join(', ')}.` };
  }

  const where = [...FILTROS_BASE, ES_M2];
  const params = [];
  condicionesFecha(fechas, where, params);
  if (clienteTipo) { where.push('c.tipo = ?'); params.push(clienteTipo); }

  const [filas] = await pool.query(
    `SELECT c.id AS cliente_id, c.nombre AS cliente, c.tipo AS tipo_cliente,
            SUM(oi.cantidad) AS m2_total, COUNT(DISTINCT o.id) AS num_ops, COUNT(DISTINCT p.id) AS num_proyectos
       ${BASE_FROM}
      WHERE ${where.join(' AND ')}
      GROUP BY c.id, c.nombre, c.tipo
      ORDER BY m2_total DESC, c.nombre ASC`,
    params
  );
  const n = limiteSeguro(limite, 10);
  return {
    criterio: CRITERIO_VENTAS,
    filtros: { anio: anio ?? 'todos', tipo_cliente: clienteTipo ?? 'todos' },
    total_clientes: filas.length,
    m2_total_general: redondear(filas.reduce((s, f) => s + Number(f.m2_total), 0)),
    ranking: filas.slice(0, n).map((f, i) => ({
      posicion: i + 1,
      cliente: f.cliente,
      tipo_cliente: f.tipo_cliente ?? 'sin tipo',
      m2_total: redondear(f.m2_total),
      num_ops: Number(f.num_ops),
      num_proyectos: Number(f.num_proyectos),
    })),
    clientes_sin_tipo_en_el_universo: clienteTipo ? undefined : filas.filter((f) => !f.tipo_cliente).length,
    advertencias: await advertenciasDeFecha(),
  };
}

/**
 * Volumen vendido agrupado. metrica 'm2' suma cantidades en M2; 'importe' suma importe_total (neto de IVA, con el
 * descuento aplicado) y devuelve un bloque por moneda, sin mezclarlas. El llamador decide si el rol puede ver importes.
 */
export async function volumenTotalVendido({ fechaInicio, fechaFin, agruparPor, metrica = 'm2', limite } = {}) {
  if (!AGRUPACIONES[agruparPor]) {
    return { error: `agrupado_por no válido. Valores permitidos: ${AGRUPACIONES_VALIDAS.join(', ')}.` };
  }
  if (!METRICAS_VALIDAS.includes(metrica)) {
    return { error: `metrica no válida. Valores permitidos: ${METRICAS_VALIDAS.join(', ')}.` };
  }
  const fechas = rangoDeFechas({ fechaInicio, fechaFin });
  if (fechas.error) return { error: fechas.error };

  const esImporte = metrica === 'importe';
  const where = [...FILTROS_BASE, esImporte ? 'oi.importe_total IS NOT NULL' : ES_M2];
  const params = [];
  condicionesFecha(fechas, where, params);

  const valor = esImporte ? 'oi.importe_total' : 'oi.cantidad';
  const [filas] = await pool.query(
    `SELECT ${AGRUPACIONES[agruparPor]} AS grupo, ${esImporte ? 'oi.moneda' : 'NULL'} AS moneda, SUM(${valor}) AS valor
       ${BASE_FROM}
      WHERE ${where.join(' AND ')}
      GROUP BY 1, 2`,
    params
  );

  const n = limiteSeguro(limite, 20);
  const cuerpo = (lista) => {
    const ordenadas = [...lista].sort(
      agruparPor === 'mes' ? (a, b) => String(a.grupo).localeCompare(String(b.grupo)) : (a, b) => b.valor - a.valor
    );
    return {
      total_general: redondear(lista.reduce((s, f) => s + Number(f.valor), 0)),
      grupos_totales: lista.length,
      resultados: ordenadas.slice(0, n).map((f) => ({ grupo: f.grupo, valor: redondear(f.valor) })),
    };
  };

  const salida = {
    criterio: esImporte ? CRITERIO_IMPORTE : CRITERIO_VENTAS,
    metrica,
    agrupado_por: agruparPor,
    fecha_inicio: fechas.desde ?? 'sin límite',
    fecha_fin: fechas.hasta ?? 'sin límite',
    advertencias: await advertenciasDeFecha(),
  };
  if (!esImporte) return { ...salida, unidad: 'm2', ...cuerpo(filas) };

  const porMoneda = new Map();
  for (const f of filas) {
    const m = f.moneda ?? 'sin moneda';
    if (!porMoneda.has(m)) porMoneda.set(m, []);
    porMoneda.get(m).push(f);
  }
  const [[{ sin_precio }]] = await pool.query(
    `SELECT COUNT(*) AS sin_precio ${BASE_FROM} WHERE ${[...FILTROS_BASE, 'oi.importe_total IS NULL'].join(' AND ')}${
      fechas.desde ? ' AND o.fecha_emision >= ?' : ''}${fechas.hasta ? ' AND o.fecha_emision <= ?' : ''}`,
    [fechas.desde, fechas.hasta].filter(Boolean)
  );
  return {
    ...salida,
    nota: 'Importes netos de IVA y con el descuento aplicado. Cada moneda va por separado: nunca se suman monedas distintas.',
    por_moneda: [...porMoneda.entries()].map(([moneda, lista]) => ({ moneda, ...cuerpo(lista) })),
    lineas_sin_precio_excluidas: Number(sin_precio),
  };
}
