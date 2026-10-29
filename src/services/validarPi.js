// Comparación determinística de las Proforma Invoice (PI) de un proveedor contra las líneas de una OP. La hacen estas
// reglas, no el modelo: el agente solo redacta el resultado. Las reglas salen de revisar PIs reales de MIRAGE:
//  - la PI agrupa lo que la OP tiene en varias líneas (194 + 31 cajas en la OP = 225 en la PI), por eso se suma
//    cada lado por clave (color + formato + acabado) antes de comparar;
//  - una OP puede tener varias PIs parciales: se suman todas y, si falta material, es "parcial", no "diferencia";
//  - la clave de color de la PI sale de la descripción ("EY 02 NAT SQ 60X120"), la de la OP del código ("ELYSIAN-EY 02");
//  - el acabado se escribe distinto (PI "NAT SQ", OP "NAT R10") y una discrepancia solo se marca para revisar.

export const TOLERANCIA_CAJAS_DEFECTO = 1;
const TOLERANCIA_M2_BASE = 0.05;

const COLOR_RE = /\b([A-Z]{2,3})\s?(\d{2})\b/;
const ALIAS_ACABADO = { GP: 'GRIP', SLK: 'SILK', NATURAL: 'NAT', STRUCTURED: 'ST' };
const redondear = (n) => Math.round(n * 1000) / 1000;
const mayus = (t) => String(t ?? '').toUpperCase();

/** Clave de color ("EY02") dentro de un texto: dos o tres letras y dos dígitos ("EY 02", "MD 03 DAWN" → "MD03"). */
export function claveColor(texto) {
  const m = mayus(texto).match(COLOR_RE);
  return m ? `${m[1]}${m[2]}` : null;
}

/** Formato sin espesor ni unidades y sin orientación: "60X120X9", "120X60", "60X60X20MM" → "60X120", "60X120", "60X60". */
export function claveFormato(texto) {
  const m = mayus(texto).match(/(\d+(?:[.,]\d+)?)\s*X\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const dims = [m[1], m[2]].map((d) => Number(d.replace(',', '.'))).sort((a, b) => a - b);
  return `${dims[0]}X${dims[1]}`;
}

/** Primer token de un acabado ("NAT SQ" → "NAT", "NAT (R10)" → "NAT") con alias (GP = GRIP, SLK = SILK). */
export function claveAcabado(texto) {
  const t = mayus(texto).replace(/[()]/g, ' ').trim().split(/\s+/)[0];
  if (!t || /^R\d+$/.test(t)) return null;
  return ALIAS_ACABADO[t] ?? t;
}

/** Acabado de una línea de PI: el que sigue al código de color en la descripción (más fiable que el campo, que el modelo
 * a veces transcribe distinto en cada página), o el campo "acabado" si la descripción no lo da. */
function acabadoDePI(linea) {
  const desc = mayus(linea.descripcion);
  const m = desc.match(COLOR_RE);
  if (m) {
    const resto = desc.slice(m.index + m[0].length).trim().split(/\s+/)[0];
    if (resto && /^[A-Z]+$/.test(resto) && resto !== 'SQ') return claveAcabado(resto);
  }
  return claveAcabado(linea.acabado);
}

const numero = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const sumaOpcional = (acc, v) => (v === null ? acc : (acc ?? 0) + v);

function agregar(mapa, clave, base, aporte) {
  const g = mapa.get(clave) ?? { ...base, cajas: null, m2: null, cantidad: null, lineas: 0, faltaCajas: false, faltaM2: false, fuentes: new Set() };
  g.cajas = sumaOpcional(g.cajas, aporte.cajas);
  g.m2 = sumaOpcional(g.m2, aporte.m2);
  g.cantidad = sumaOpcional(g.cantidad, aporte.cantidad);
  // Si alguna línea del grupo no trae cajas (o m²), esa suma quedaría corta y comparar con ella daría una falsa diferencia.
  if (aporte.cajas === null) g.faltaCajas = true;
  if (aporte.m2 === null) g.faltaM2 = true;
  g.lineas++;
  if (aporte.fuente) g.fuentes.add(aporte.fuente);
  mapa.set(clave, g);
}

const claveGrupo = (color, formato, acabado) => `${color}|${formato ?? '?'}|${acabado ?? '?'}`;

/** Agrupa las líneas de las PIs (sin cargos). Las líneas sin código de color reconocible van aparte. */
function agruparPI(pis) {
  const grupos = new Map();
  const sinClave = [];
  for (const pi of pis) {
    for (const l of pi.extraccion.lineas) {
      if (l.es_cargo) continue;
      const color = claveColor(l.descripcion);
      const formato = claveFormato(l.formato) ?? claveFormato(l.descripcion);
      if (!color) {
        sinClave.push({ documento: pi.documento, descripcion: l.descripcion, unidad: l.unidad, cantidad: l.cantidad, cajas: l.cajas });
        continue;
      }
      const m2 = l.m2 ?? (l.unidad === 'M2' ? l.cantidad : null);
      const acabado = acabadoDePI(l);
      agregar(grupos, claveGrupo(color, formato, acabado), { color, formato, acabado }, { cajas: numero(l.cajas), m2: numero(m2), cantidad: numero(l.cantidad), fuente: pi.documento });
    }
  }
  return { grupos, sinClave };
}

/** Agrupa las líneas de la OP (las del proveedor de la PI). */
function agruparOP(items) {
  const grupos = new Map();
  for (const i of items) {
    const color = claveColor(i.codigo) ?? mayus(i.codigo).replace(/\s+/g, '');
    const formato = claveFormato(i.formato);
    const acabado = claveAcabado(i.acabado);
    const esM2 = mayus(i.unidad) === 'M2';
    agregar(grupos, claveGrupo(color, formato, acabado), { color, formato, acabado }, {
      cajas: numero(i.cajas),
      m2: esM2 ? numero(i.cantidad) : null,
      cantidad: numero(i.cantidad),
    });
  }
  return grupos;
}

/** ¿El proveedor de una línea de OP es el que emite la PI? "MIRAGE" cabe en "MIRAGE GRANITO CERAMICO S.p.A.". */
export function mismoProveedor(nombreOP, nombrePI) {
  const compacto = (t) => mayus(t).replace(/[^A-Z0-9]/g, '');
  const a = compacto(nombreOP);
  const b = compacto(nombrePI);
  return a.length >= 4 && b.length >= 4 && (b.includes(a) || a.includes(b));
}

/** Compara dos cantidades ya sumadas. Devuelve { estado, delta_cajas, delta_m2 }. */
function compararCantidades(opGrupo, piGrupo, toleranciaCajas) {
  const completo = (g) => ({ ...g, cajas: g.faltaCajas ? null : g.cajas, m2: g.faltaM2 ? null : g.m2 });
  const op = completo(opGrupo);
  const pi = completo(piGrupo);
  const m2PorCaja = op.cajas && op.m2 ? op.m2 / op.cajas : null;
  let delta;
  let tolerancia;
  let campo;
  if (op.cajas !== null && pi.cajas !== null) {
    delta = pi.cajas - op.cajas;
    tolerancia = toleranciaCajas;
    campo = 'cajas';
  } else if (op.m2 !== null && pi.m2 !== null) {
    delta = pi.m2 - op.m2;
    tolerancia = TOLERANCIA_M2_BASE + toleranciaCajas * (m2PorCaja ?? 0);
    campo = 'm2';
  } else if (op.cantidad !== null && pi.cantidad !== null) {
    delta = pi.cantidad - op.cantidad;
    tolerancia = TOLERANCIA_M2_BASE;
    campo = 'cantidad';
  } else {
    return { estado: 'sin_cantidad_comparable' };
  }
  const salida = {
    delta_cajas: op.cajas !== null && pi.cajas !== null ? redondear(pi.cajas - op.cajas) : null,
    delta_m2: op.m2 !== null && pi.m2 !== null ? redondear(pi.m2 - op.m2) : null,
    comparado_en: campo,
  };
  if (Math.abs(delta) < 1e-9) {
    // Mismas cajas pero m² distintos más allá del redondeo: no es un "ok" limpio.
    const m2Raro = campo === 'cajas' && salida.delta_m2 !== null && Math.abs(salida.delta_m2) > TOLERANCIA_M2_BASE + 0.01 * (op.m2 ?? 0);
    return { ...salida, estado: m2Raro ? 'diferencia' : 'ok' };
  }
  if (Math.abs(delta) <= tolerancia + 1e-9) return { ...salida, estado: 'diferencia_menor' };
  return { ...salida, estado: delta < 0 ? 'parcial' : 'diferencia' };
}

const resumenCantidad = (g) => ({
  ...(g.cajas !== null && !g.faltaCajas ? { cajas: redondear(g.cajas) } : {}),
  ...(g.m2 !== null && !g.faltaM2 ? { m2: redondear(g.m2) } : {}),
  lineas: g.lineas,
});

/**
 * @param itemsOP  líneas de la OP: { codigo, acabado, formato, cajas, cantidad, unidad, proveedor }
 * @param pis      PIs leídas: { documento, extraccion, validacion } (de pdfExtractor)
 * @returns { estado, resumen, grupos[], sin_clave[], advertencias[] }
 *   estado: coincide | parcial | con_diferencias | no_concluyente
 */
export function compararPiConOp({ itemsOP, pis, toleranciaCajas = TOLERANCIA_CAJAS_DEFECTO }) {
  const advertencias = [];
  const ignoradas = [];

  const utilizables = [];
  for (const pi of pis) {
    if (pi.extraccion.tipo_documento !== 'proforma_invoice') {
      ignoradas.push({ documento: pi.documento, motivo: 'no es una proforma de proveedor' });
    } else if (pi.validacion.estado === 'requiere_revision') {
      ignoradas.push({ documento: pi.documento, motivo: 'la lectura no cuadra con sus propios totales' });
    } else if (!pi.extraccion.lineas.some((l) => !l.es_cargo && claveColor(l.descripcion))) {
      ignoradas.push({ documento: pi.documento, motivo: 'ninguna línea trae un código de color reconocible (formato de proforma no soportado para comparar, p. ej. de otro proveedor)' });
    } else {
      utilizables.push(pi);
    }
  }
  for (const i of ignoradas) advertencias.push(`Se excluyó "${i.documento}": ${i.motivo}.`);

  const salidaVacia = (estado, motivo) => ({ estado, motivo, resumen: {}, grupos: [], sin_clave: [], advertencias, pis_excluidas: ignoradas });
  if (!itemsOP.length) return salidaVacia('no_concluyente', 'La OP no tiene líneas cargadas.');
  if (!utilizables.length) return salidaVacia('no_concluyente', 'No hay ninguna PI utilizable para comparar.');

  // Solo las líneas de OP del proveedor que emite la PI (una OP puede mezclar fábricas).
  const proveedoresPI = [...new Set(utilizables.map((p) => p.extraccion.proveedor).filter(Boolean))];
  let delProveedor = itemsOP.filter((i) => proveedoresPI.some((p) => mismoProveedor(i.proveedor, p)));
  if (!delProveedor.length) {
    delProveedor = itemsOP;
    advertencias.push(`Ninguna línea de la OP tiene como proveedor a "${proveedoresPI.join(' / ')}": se compararon todas las líneas.`);
  } else if (delProveedor.length < itemsOP.length) {
    advertencias.push(`Se compararon ${delProveedor.length} de ${itemsOP.length} líneas de la OP (las del proveedor de la PI).`);
  }

  const { grupos: gPI, sinClave } = agruparPI(utilizables);
  const gOP = agruparOP(delProveedor);

  const resultados = [];
  const piPendientes = new Map(gPI);
  const opPendientes = new Map(gOP);

  // 1) clave exacta: color + formato + acabado
  for (const [clave, op] of gOP) {
    const pi = gPI.get(clave);
    if (!pi) continue;
    resultados.push({ color: op.color, formato: op.formato, acabado: op.acabado, op: resumenCantidad(op), pi: { ...resumenCantidad(pi), documentos: [...pi.fuentes] }, ...compararCantidades(op, pi, toleranciaCajas) });
    piPendientes.delete(clave);
    opPendientes.delete(clave);
  }
  // 2) mismo color y formato con acabado distinto: se empareja pero se marca para revisar
  for (const [claveOP, op] of [...opPendientes]) {
    const hallada = [...piPendientes].find(([, pi]) => pi.color === op.color && pi.formato === op.formato);
    if (!hallada) continue;
    const [clavePI, pi] = hallada;
    resultados.push({
      color: op.color, formato: op.formato, acabado: op.acabado, acabado_pi: pi.acabado,
      op: resumenCantidad(op), pi: { ...resumenCantidad(pi), documentos: [...pi.fuentes] },
      ...compararCantidades(op, pi, toleranciaCajas),
      revisar_acabado: true,
    });
    piPendientes.delete(clavePI);
    opPendientes.delete(claveOP);
  }
  for (const op of opPendientes.values()) {
    resultados.push({ color: op.color, formato: op.formato, acabado: op.acabado, op: resumenCantidad(op), estado: 'solo_en_op' });
  }
  for (const pi of piPendientes.values()) {
    resultados.push({ color: pi.color, formato: pi.formato, acabado: pi.acabado, pi: { ...resumenCantidad(pi), documentos: [...pi.fuentes] }, estado: 'solo_en_pi' });
  }

  const cuenta = (e) => resultados.filter((r) => r.estado === e).length;
  const resumen = {
    grupos_comparados: resultados.length,
    ok: cuenta('ok'),
    diferencia_menor: cuenta('diferencia_menor'),
    parcial: cuenta('parcial'),
    diferencia: cuenta('diferencia'),
    solo_en_pi: cuenta('solo_en_pi') + sinClave.length,
    solo_en_op: cuenta('solo_en_op'),
    revisar_acabado: resultados.filter((r) => r.revisar_acabado).length,
    pis_utilizadas: utilizables.length,
  };

  let estado = 'coincide';
  if (resumen.diferencia || resumen.solo_en_pi || resumen.revisar_acabado || resumen.diferencia_menor) estado = 'con_diferencias';
  else if (resumen.parcial || resumen.solo_en_op) estado = 'parcial';
  if (resultados.some((r) => r.estado === 'sin_cantidad_comparable')) estado = 'con_diferencias';
  if (ignoradas.length && estado === 'coincide') estado = 'no_concluyente';

  return { estado, resumen, grupos: resultados, sin_clave: sinClave, advertencias, pis_excluidas: ignoradas };
}
