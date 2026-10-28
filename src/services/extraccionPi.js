// Parte "pura" de la lectura de PDFs de Proforma Invoice: el esquema que se le pide al modelo, la normalización de lo que
// devuelve y la validación determinística contra los totales que trae el propio documento. No importa SDKs ni la BD,
// así se prueba sin red. Lo que el modelo lee nunca se da por bueno: se acepta solo si cuadra con los totales del PDF.

export const VERSION_EXTRACCION = 1;

const NUM = { type: ['number', 'null'] };
const TXT = { type: ['string', 'null'] };

export const ESQUEMA_PI = {
  type: 'object',
  properties: {
    tipo_documento: {
      type: 'string',
      enum: ['proforma_invoice', 'recibo_o_pago', 'otro'],
      description: 'proforma_invoice = factura proforma de un proveedor; recibo_o_pago = recibo/anticipo emitido a un cliente.',
    },
    proveedor: { ...TXT, description: 'Quien emite el documento (vendedor).' },
    cliente: { ...TXT, description: 'A quien va dirigido (comprador).' },
    numero_documento: { ...TXT, description: 'Número de la proforma (ej. 22703 o P-26706/26), no la palabra "PROFORMA".' },
    fecha: { ...TXT, description: 'Fecha del documento en formato YYYY-MM-DD.' },
    referencia_pedido: { ...TXT, description: 'Referencia de pedido/orden que figura en el documento, tal cual.' },
    moneda: { ...TXT, description: 'Código ISO: EUR, USD, ...' },
    incoterm: TXT,
    lineas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          codigo: { ...TXT, description: 'Código/serie-color del producto tal cual figura.' },
          descripcion: TXT,
          acabado: { ...TXT, description: 'Acabado/superficie si figura (GRIP, MATT, ...).' },
          formato: { ...TXT, description: 'Formato/medida tal cual (ej. 60X120).' },
          unidad: { ...TXT, description: 'Unidad en que se cobra: M2, ML, EA, PZ, CAJA...' },
          cantidad: { ...NUM, description: 'Cantidad en esa unidad (la que se multiplica por el precio).' },
          cajas: { ...NUM, description: 'Número de cajas si el documento lo indica.' },
          m2: { ...NUM, description: 'Metros cuadrados de la línea si el documento los indica.' },
          precio_unitario: NUM,
          importe: { ...NUM, description: 'Importe de la línea.' },
          es_cargo: {
            type: 'boolean',
            description: 'true si NO es material: embalaje (packaging), flete/entrega (delivery), recargos, descuentos.',
          },
        },
        required: ['codigo', 'descripcion', 'unidad', 'cantidad', 'importe', 'es_cargo'],
      },
    },
    totales: {
      type: 'object',
      description: 'Totales impresos en el documento (normalmente en la última página). null si no figuran.',
      properties: { cajas: NUM, m2: NUM, importe: NUM },
      required: ['cajas', 'm2', 'importe'],
    },
  },
  required: ['tipo_documento', 'moneda', 'lineas', 'totales'],
};

export const PROMPT_EXTRACCION_PI = `Eres un extractor de datos de facturas proforma (Proforma Invoice) de proveedores de cerámica y perfiles.
Lee el PDF adjunto COMPLETO (todas sus páginas) y devuelve únicamente los datos pedidos, con estas reglas:
- Transcribe lo que está impreso; no inventes ni completes datos. Si un dato no figura, usa null.
- Los números deben ser números JSON (punto decimal, sin separador de miles). Los documentos pueden usar formato europeo: "4,320" significa 4.32 y "19.796,94" significa 19796.94.
- Incluye TODAS las líneas de todas las páginas, en el orden del documento, sin sumar ni agrupar líneas.
- Marca es_cargo=true en líneas que no son material (embalaje/packaging, delivery/flete, recargos, descuentos); su importe va igualmente en "importe".
- "totales" son los totales impresos en el documento (cajas, m2, importe), no los que tú calcules.
- Si el documento NO es una factura proforma de un proveedor (por ejemplo un recibo de anticipo emitido a un cliente), indícalo en tipo_documento.`;

/**
 * Convierte a número lo que el modelo devuelva: acepta números y textos. Con ambos separadores el último es el decimal;
 * con solo coma, la coma es decimal ("4,320" = 4.32, formato europeo de estas PIs); con solo punto, el punto es decimal.
 */
export function normalizarNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  let s = String(valor).replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const iPunto = s.lastIndexOf('.');
  const iComa = s.lastIndexOf(',');
  if (iPunto >= 0 && iComa >= 0) {
    s = iComa > iPunto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (iComa >= 0) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Sinónimos de unidad que aparecen en las PIs (MQ = metro cuadrado en italiano, SQM en inglés).
const UNIDADES = { MQ: 'M2', SQM: 'M2', MTQ: 'M2', 'M²': 'M2', 'M^2': 'M2', MT: 'ML', MTL: 'ML', PCS: 'PZ', PC: 'PZ', EACH: 'EA' };

const texto = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

function normalizarUnidad(valor) {
  const u = texto(valor)?.toUpperCase().replace(/\.$/, '') ?? null;
  return u === null ? null : UNIDADES[u] ?? u;
}

/** Deja la extracción en un formato estable: textos recortados, números reales, unidad y moneda en mayúsculas. */
export function normalizarExtraccion(bruta) {
  const b = bruta && typeof bruta === 'object' ? bruta : {};
  const lineas = (Array.isArray(b.lineas) ? b.lineas : []).map((l) => ({
    codigo: texto(l?.codigo),
    descripcion: texto(l?.descripcion),
    acabado: texto(l?.acabado),
    formato: texto(l?.formato),
    unidad: normalizarUnidad(l?.unidad),
    cantidad: normalizarNumero(l?.cantidad),
    cajas: normalizarNumero(l?.cajas),
    m2: normalizarNumero(l?.m2),
    precio_unitario: normalizarNumero(l?.precio_unitario),
    importe: normalizarNumero(l?.importe),
    es_cargo: l?.es_cargo === true,
  }));
  const t = b.totales ?? {};
  return {
    tipo_documento: texto(b.tipo_documento) ?? 'otro',
    proveedor: texto(b.proveedor),
    cliente: texto(b.cliente),
    numero_documento: texto(b.numero_documento),
    fecha: texto(b.fecha),
    referencia_pedido: texto(b.referencia_pedido),
    moneda: texto(b.moneda)?.toUpperCase() ?? null,
    incoterm: texto(b.incoterm),
    lineas,
    totales: { cajas: normalizarNumero(t.cajas), m2: normalizarNumero(t.m2), importe: normalizarNumero(t.importe) },
  };
}

const redondear = (n) => Math.round(n * 1000) / 1000;
const suma = (valores) => redondear(valores.reduce((a, v) => a + v, 0));

/** m² de una línea: el campo m2 si viene; si no, la cantidad cuando la unidad ya es M2. */
function m2DeLinea(l) {
  if (l.m2 !== null) return l.m2;
  return l.unidad === 'M2' ? l.cantidad : null;
}

/**
 * Valida una extracción normalizada contra los totales del documento y contra su propia aritmética.
 * estado: 'verificada' (cuadra y hubo al menos un total comparado) | 'sin_control' (el PDF no trae totales con los que
 * comparar) | 'requiere_revision' (algo no cuadra o no se pudo leer: no debe usarse sin que una persona lo mire).
 */
export function validarExtraccion(ext) {
  const controles = [];
  const avisos = [];
  const control = (nombre, esperado, calculado, tolerancia) => {
    const ok = Math.abs(esperado - calculado) <= tolerancia;
    controles.push({ nombre, ok, esperado, calculado });
    if (!ok) avisos.push(`${nombre}: el documento dice ${esperado} y las líneas suman ${calculado}`);
  };

  if (ext.tipo_documento !== 'proforma_invoice') {
    avisos.push(`El documento no es una proforma de proveedor (tipo detectado: ${ext.tipo_documento})`);
    return { estado: 'requiere_revision', controles, avisos };
  }
  if (!ext.lineas.length) {
    avisos.push('No se leyó ninguna línea');
    return { estado: 'requiere_revision', controles, avisos };
  }
  if (!ext.moneda) avisos.push('No se identificó la moneda');

  // Aritmética de cada línea: cantidad × precio ≈ importe (el precio unitario viene redondeado a centavos).
  let lineasInconsistentes = 0;
  for (const l of ext.lineas) {
    if (l.cantidad === null || l.precio_unitario === null || l.importe === null) continue;
    const tol = Math.max(0.05, Math.abs(l.importe) * 0.005);
    if (Math.abs(l.cantidad * l.precio_unitario - l.importe) > tol) {
      lineasInconsistentes++;
      avisos.push(`Línea ${l.codigo ?? '?'}: ${l.cantidad} × ${l.precio_unitario} no da ${l.importe}`);
    }
  }
  controles.push({ nombre: 'aritmetica_de_lineas', ok: lineasInconsistentes === 0, inconsistentes: lineasInconsistentes });

  const t = ext.totales;
  const material = ext.lineas.filter((l) => !l.es_cargo);

  if (t.importe !== null) {
    const importes = ext.lineas.map((l) => l.importe);
    if (importes.every((v) => v !== null)) {
      const total = suma(importes);
      control('importe_total', t.importe, total, Math.max(0.05, Math.abs(t.importe) * 0.0005));
    } else {
      avisos.push('Hay líneas sin importe: no se puede comprobar el importe total');
    }
  }
  if (t.cajas !== null) {
    const cajas = material.map((l) => l.cajas);
    if (cajas.every((v) => v !== null)) control('cajas_total', t.cajas, suma(cajas), 0.5);
    else avisos.push('Hay líneas de material sin cajas: no se puede comprobar el total de cajas');
  }
  if (t.m2 !== null) {
    const m2 = material.map(m2DeLinea);
    if (m2.every((v) => v !== null)) control('m2_total', t.m2, suma(m2), 0.05);
    else avisos.push('Hay líneas de material sin m²: no se puede comprobar el total de m²');
  }

  const comparados = controles.filter((c) => c.nombre.endsWith('_total'));
  const fallo = controles.some((c) => !c.ok) || (t.importe !== null && !comparados.some((c) => c.nombre === 'importe_total'));
  if (fallo) return { estado: 'requiere_revision', controles, avisos };
  if (!comparados.length) {
    avisos.push('El documento no trae totales con los que comparar');
    return { estado: 'sin_control', controles, avisos };
  }
  return { estado: 'verificada', controles, avisos };
}
