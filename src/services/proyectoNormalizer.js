// Normaliza nombres de proyecto del Excel Madre para separar la OBRA (proyecto matriz) del tipo de pedido:
// "ALESTE 137 PERFIL" -> obra "ALESTE 137" + tipo 'perfiles'.
// Lista de sufijos deliberadamente conservadora: ante la duda NO se separa (PAREDES, CAFETERIA, VITACER…
// pueden ser obras o fases distintas y las decide una persona en la pantalla de fusión).

const PERFILES = new Set(['PERFIL', 'PERFILES']);
const OTRO = new Set(['ENCHAPE', 'ENCHAPES', 'STOCK', 'ACTUALIZACION', 'URGENTE', 'SOBRE', 'SOBRES']);

export function quitarAcentos(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Clave comparable: mayúsculas, sin tildes, signos como espacio, espacios colapsados. */
export function claveTexto(s) {
  return quitarAcentos(s)
    .toUpperCase()
    .replace(/[-–—_/.,;:()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function distancia(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function esAdicional(palabra) {
  // Cubre ADICIONAL, ADICIONALES y typos como ADICIOANAL.
  return palabra === 'ADICIONAL' || (palabra.startsWith('ADI') && palabra.length >= 7 && palabra.length <= 10 && distancia(palabra, 'ADICIONAL') <= 2);
}

function clasificar(palabraClave) {
  if (esAdicional(palabraClave)) return 'adicional';
  if (PERFILES.has(palabraClave)) return 'perfiles';
  if (OTRO.has(palabraClave)) return 'otro';
  return null;
}

/**
 * @returns {{nombreBase: string, baseKey: string, tipoPedido: 'principal'|'adicional'|'perfiles'|'otro', aliasKey: string}}
 *  nombreBase: obra para mostrar (conserva tildes); baseKey: clave de comparación de la obra;
 *  aliasKey: clave del nombre completo tal como vino.
 */
export function normalizarProyecto(nombre) {
  const original = String(nombre ?? '').trim();
  const aliasKey = claveTexto(original);
  const palabras = original.split(/\s+/).filter(Boolean).map((w) => ({ w, tipo: clasificar(claveTexto(w)) }));

  // Si todo fueran sufijos (ej. 'STOCK ADICIONAL'), 'otro' cuenta como parte del nombre de la obra.
  let base = palabras.filter((p) => p.tipo === null);
  if (base.length === 0) base = palabras.filter((p) => p.tipo === 'otro');
  if (base.length === 0) base = palabras;

  const quitadas = palabras.filter((p) => !base.includes(p));
  let tipoPedido = 'principal';
  if (quitadas.some((p) => p.tipo === 'adicional')) tipoPedido = 'adicional';
  else if (quitadas.some((p) => p.tipo === 'perfiles')) tipoPedido = 'perfiles';
  else if (quitadas.length > 0) tipoPedido = 'otro';

  const nombreBase = base.map((p) => p.w).join(' ').replace(/[\s\-–,.]+$/g, '').trim() || original;
  return { nombreBase, baseKey: claveTexto(nombreBase), tipoPedido, aliasKey };
}

function tokensConDigitos(clave) {
  return clave.split(' ').filter((t) => /\d/.test(t)).sort().join('|');
}

/** ¿Dos obras (por baseKey) podrían ser la misma con un typo? Los números deben coincidir exactamente. */
export function basesSimilares(a, b) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 6) return false;
  if (tokensConDigitos(a) !== tokensConDigitos(b)) return false;
  const maximo = Math.max(a.length, b.length) >= 12 ? 2 : 1;
  return distancia(a, b) <= maximo;
}
