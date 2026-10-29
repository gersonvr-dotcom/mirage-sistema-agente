import { TIPOS_CLIENTE } from '../db/clienteTipos.js';
import { claveTexto } from './proyectoNormalizer.js';

// Carga inicial de clientes.tipo (R4-01). El tipo lo decide una persona: aquí solo se sugiere por palabras del nombre
// (confianza "alta" = palabra inequívoca, "media" = pista débil) y se convierte un CSV revisado en un .sql idempotente
// para correr en phpMyAdmin (la BD de producción no es accesible desde desarrollo). Nunca se asigna un tipo sin revisión.

// El orden importa: gana la primera regla que coincide (p. ej. "CONSTRUTICA DISEÑO Y CONSTRUCION" es constructora).
const REGLAS = [
  { tipo: 'interno', confianza: 'alta', re: /^MIRAGE$/ },
  { tipo: 'constructora', confianza: 'alta', re: /\bCONSTRU\w*|\bBUILDERS?\b|\bBUILDS\b|\bINGENIERIA\b|\bCONSTRUCTION\b/ },
  { tipo: 'arquitecto', confianza: 'alta', re: /\bARQUITECT\w*|\bSTUDIO\b|\bESTUDIO\b|\bINTERIORS?\b|\bDESIGN\b|\bDISENO\b|\bTALLER\b/ },
  { tipo: 'desarrollador', confianza: 'media', re: /\bINMOBILIARIA\b|\bDESARROLL\w*|\bHOLDING\b|\bVILLAGE\b|\bVILLAS\b|\bPARK\b|\bCLUB\b|\bRESIDENCIA\b|\bPROJECTS?\b|\bZONA FRANCA\b|\bFREE ZONE\b|\bLOTE\b/ },
];

/** @returns {{tipo: string, confianza: 'alta'|'media', motivo: string}|null} */
export function sugerirTipo(nombre) {
  const clave = claveTexto(nombre);
  for (const r of REGLAS) {
    const m = clave.match(r.re);
    if (m) return { tipo: r.tipo, confianza: r.confianza, motivo: m[0] };
  }
  return null;
}

const celda = (v) => {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV (separador ";", con BOM para que Excel lo abra en UTF-8) listo para completar. `tipo` viene relleno solo con las
 * sugerencias de confianza alta; las medias quedan en `sugerido` para que alguien las confirme. */
export function generarCsvClientes(clientes) {
  const cab = ['id', 'nombre', 'ops', 'm2_total', 'tipo', 'sugerido', 'confianza', 'motivo'];
  const filas = clientes.map((c) => {
    const s = sugerirTipo(c.nombre);
    const tipo = c.tipo ?? (s?.confianza === 'alta' ? s.tipo : '');
    return [c.id, c.nombre, c.ops ?? '', c.m2 ?? '', tipo, s?.tipo ?? '', s?.confianza ?? '', s?.motivo ?? ''];
  });
  return `﻿${[cab, ...filas].map((f) => f.map(celda).join(';')).join('\r\n')}\r\n`;
}

/** Lee un CSV (separador ";" o ","; comillas dobles) y devuelve objetos por cabecera. */
export function parsearCsv(texto) {
  const t = String(texto).replace(/^﻿/, '');
  const sep = (t.split(/\r?\n/, 1)[0].match(/;/g) ?? []).length >= (t.split(/\r?\n/, 1)[0].match(/,/g) ?? []).length ? ';' : ',';
  const filas = [];
  let fila = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some((c) => c.trim() !== '')) filas.push(fila);
      fila = [];
    } else campo += ch;
  }
  if (campo !== '' || fila.length) { fila.push(campo); if (fila.some((c) => c.trim() !== '')) filas.push(fila); }
  const [cab, ...datos] = filas;
  if (!cab) return [];
  const nombres = cab.map((c) => c.trim().toLowerCase());
  return datos.map((f) => Object.fromEntries(nombres.map((n, i) => [n, (f[i] ?? '').trim()])));
}

/** Valida las filas del CSV: devuelve { validas: [{nombre, tipo}], errores: [string] }. Las filas sin tipo se omiten. */
export function filasConTipo(filas) {
  const validas = [];
  const errores = [];
  filas.forEach((f, i) => {
    const tipo = (f.tipo ?? '').toLowerCase();
    if (!tipo) return;
    if (!f.nombre) errores.push(`Fila ${i + 2}: falta el nombre.`);
    else if (!TIPOS_CLIENTE.includes(tipo)) errores.push(`Fila ${i + 2} (${f.nombre}): tipo "${f.tipo}" no válido; use ${TIPOS_CLIENTE.join(', ')}.`);
    else validas.push({ nombre: f.nombre, tipo });
  });
  return { validas, errores };
}

const sqlTexto = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;

/** .sql idempotente: solo completa clientes SIN tipo (no pisa lo que ya se editó a mano), emparejando por nombre. */
export function generarSqlTipos(validas, { fecha = new Date().toISOString().slice(0, 10) } = {}) {
  const lineas = [
    '-- Carga inicial de clientes.tipo (R4-01). Solo completa clientes que todavía no tienen tipo; seguro de correr más de',
    `-- una vez. Generado el ${fecha} desde el CSV revisado. Producción: correr en phpMyAdmin (requiere migration_clientes_tipo.sql).`,
    '',
    'SET NAMES utf8mb4;',
    '',
    ...validas.map((v) => `UPDATE clientes SET tipo = ${sqlTexto(v.tipo)} WHERE nombre = ${sqlTexto(v.nombre)} AND tipo IS NULL;`),
    '',
  ];
  return lineas.join('\n');
}
