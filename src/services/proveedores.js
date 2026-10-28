import { claveTexto, distancia } from './proyectoNormalizer.js';

// Sin espacios: "PROGRESS PROFILE" y "PROGRESSPROFILE" son el mismo nombre.
const compacta = (s) => claveTexto(s ?? '').replace(/\s+/g, '');

/** Reutiliza un proveedor existente si el nombre es igual o casi igual (typo o letras cambiadas de lugar: MIRGAE ≈ MIRAGE). */
export function buscarProveedorParecido(nombre, proveedores) {
  const k = compacta(nombre);
  const letras = (x) => [...x].sort().join('');
  return (
    proveedores.find((p) => {
      const pk = compacta(p.nombre);
      if (pk === k) return true;
      if (Math.min(pk.length, k.length) < 5) return false;
      return letras(pk) === letras(k) || distancia(pk, k) <= 1;
    }) ?? null
  );
}

// Nombres que en las OPs y cotizaciones designan a la misma fábrica (confirmado por el negocio).
const ALIAS_FABRICA = { PROGRESS: 'PROGRESS PROFILE', 'PROGRESS PROFILES': 'PROGRESS PROFILE' };

const VARIAS_FABRICAS_RE = /[\/,;+&]|\sY\s/i;

/**
 * Nombre de fábrica listo para guardar (mayúsculas, espacios normalizados, alias unificados), o null si está vacío o es un marcador sin
 * valor ("N/A", "-", "PENDIENTE"). Con varias fábricas juntas ("MIRAGE / PROGRESS") devuelve el texto igual: sirve
 * para mostrarlo, pero no para asignar a líneas (ver fabricaUnica).
 */
export function normalizarFabrica(texto) {
  const t = String(texto ?? '').trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 150);
  if (!t || /^(N\/?A|-+|\.+|PENDIENTES?|POR DEFINIR|TBD)$/.test(t)) return null;
  return ALIAS_FABRICA[t] ?? t;
}

/** La fábrica solo si es una sola; con varias a la vez no se puede saber a cuál pertenece cada línea. */
export function fabricaUnica(texto) {
  const f = normalizarFabrica(texto);
  return f && !VARIAS_FABRICAS_RE.test(f) ? f : null;
}

/**
 * Resuelve nombres de fábrica a proveedores.id con una conexión (idealmente dentro de la transacción en curso):
 * reutiliza el proveedor existente de nombre igual o casi igual y crea el que falte. Guarda lo resuelto en memoria;
 * si se deshace una transacción hay que llamar a reiniciar() porque pudo guardar ids que ya no existen.
 */
export function crearResolvedorProveedores(conn) {
  const cache = new Map();
  let existentes = null;
  return {
    async resolver(nombre) {
      const fabrica = normalizarFabrica(nombre);
      if (!fabrica) return null;
      if (cache.has(fabrica)) return cache.get(fabrica);
      existentes ??= (await conn.query('SELECT id, nombre FROM proveedores'))[0];
      let id = buscarProveedorParecido(fabrica, existentes)?.id;
      if (!id) {
        id = (await conn.query('INSERT INTO proveedores (nombre) VALUES (?)', [fabrica]))[0].insertId;
        existentes.push({ id, nombre: fabrica });
      }
      cache.set(fabrica, id);
      return id;
    },
    reiniciar() {
      cache.clear();
      existentes = null;
    },
  };
}
