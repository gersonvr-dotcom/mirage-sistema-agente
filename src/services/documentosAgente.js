// Lógica pura de las tools de documentos del agente: normalizar el número de OP que escribe el usuario y reducir la
// extracción de una PI a lo mínimo útil. Lo que devuelve una tool queda guardado en el historial de la conversación
// (conversaciones_agente), por eso los resultados se mantienen chicos: sin campos nulos, líneas y avisos acotados.

export const MAX_LINEAS_POR_DOCUMENTO = 40;
export const MAX_AVISOS = 5;
export const MAX_DOCUMENTOS_LISTADOS = 25;
export const MAX_DOCUMENTOS_LEIDOS = 6;

/**
 * Formas en que puede estar guardado el número que dijo el usuario ("OP 2026-1", "op-2026-001", "2026001", "OP-4521").
 * Devuelve candidatos en orden de preferencia, sin repetir.
 */
export function candidatosNumeroOP(texto) {
  const crudo = String(texto ?? '').trim().toUpperCase();
  if (!crudo) return [];
  const candidatos = [crudo];
  const sinPrefijo = crudo.replace(/^OP[\s._-]*/, '');
  const m = sinPrefijo.match(/^(\d{4})[\s._-]*(\d{1,4})(?:[\s._-]*([A-Z]{1,3}))?$/);
  if (m) candidatos.push(`${m[1]}-${m[2].padStart(3, '0')}${m[3] ? `-${m[3]}` : ''}`);
  candidatos.push(sinPrefijo, `OP-${sinPrefijo}`);
  return [...new Set(candidatos)];
}

const sinNulos = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== ''));

/** Documentos de la OP cuyo nombre contiene el texto dado (sin distinguir mayúsculas); sin texto, todos. */
export function filtrarPorNombre(documentos, nombre) {
  const buscado = String(nombre ?? '').trim().toLowerCase();
  if (!buscado) return documentos;
  return documentos.filter((d) => d.nombre_archivo.toLowerCase().includes(buscado));
}

/** Registro completo de pdfExtractor → versión compacta para el modelo. */
export function compactarLectura(registro, doc) {
  const { extraccion: e, validacion: v } = registro;
  const lineas = e.lineas.slice(0, MAX_LINEAS_POR_DOCUMENTO).map((l) =>
    sinNulos({
      codigo: l.codigo,
      descripcion: l.descripcion?.slice(0, 60),
      acabado: l.acabado,
      formato: l.formato,
      unidad: l.unidad,
      cantidad: l.cantidad,
      cajas: l.cajas,
      m2: l.m2,
      precio_unitario: l.precio_unitario,
      importe: l.importe,
      es_cargo: l.es_cargo ? true : null,
    })
  );
  const salida = sinNulos({
    documento: doc.nombre_archivo,
    enlace: doc.web_url,
    estado_validacion: v.estado,
    proveedor: e.proveedor,
    numero_documento: e.numero_documento,
    fecha: e.fecha,
    moneda: e.moneda,
    incoterm: e.incoterm,
    totales: sinNulos(e.totales),
    lineas,
    lineas_omitidas: e.lineas.length > lineas.length ? e.lineas.length - lineas.length : null,
    avisos: v.avisos.length ? v.avisos.slice(0, MAX_AVISOS) : null,
  });
  if (v.estado === 'requiere_revision') {
    salida.nota = 'Estos datos NO cuadran con los totales del documento o el documento no es una proforma: adviértelo al usuario y no los des por correctos.';
  } else if (v.estado === 'sin_control') {
    salida.nota = 'El documento no trae totales con los que comprobar la lectura: indícalo.';
  }
  return salida;
}
