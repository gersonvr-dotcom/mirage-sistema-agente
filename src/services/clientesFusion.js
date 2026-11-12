import { pool } from '../db/pool.js';
import { claveTexto, basesSimilares } from './proyectoNormalizer.js';
import { candidatosFusion } from './proyectosFusion.js';

export class FusionClienteError extends Error {
  constructor(message) {
    super(message);
    this.code = 'FUSION_INVALIDA';
  }
}

const MAX_CLIENTES_POR_FUSION = 20;
const LARGO_ALIAS = 190;
// Datos del cliente que el absorbido aporta solo si el matriz no los tiene.
const CAMPOS_RELLENABLES = ['ruc_nit', 'contacto', 'email', 'telefono', 'tipo'];

/** Clave con la que se compara el nombre de un cliente (sin tildes, mayúsculas, sin puntuación ni espacios de más). */
export const claveCliente = (nombre) => claveTexto(nombre).slice(0, LARGO_ALIAS);

/**
 * Resuelve el cliente de una fila del Excel Madre: primero por nombre (como siempre), luego por un alias guardado en una
 * fusión y, solo si no hay ninguno, lo crea. Devuelve { id, creado }.
 */
export async function resolverCliente(conn, nombre) {
  const [existentes] = await conn.query('SELECT id FROM clientes WHERE nombre = ?', [nombre]);
  if (existentes.length) return { id: existentes[0].id, creado: false };

  const [alias] = await conn.query('SELECT cliente_id FROM cliente_alias WHERE alias_normalizado = ?', [claveCliente(nombre)]);
  if (alias.length) return { id: alias[0].cliente_id, creado: false };

  const [res] = await conn.query('INSERT INTO clientes (nombre) VALUES (?)', [nombre]);
  return { id: res.insertId, creado: true };
}

const SQL_CLIENTES_CON_CONTEO = `
  SELECT c.id, c.nombre, c.ruc_nit, c.contacto, c.email, c.telefono, c.tipo,
         (SELECT COUNT(*) FROM ops o WHERE o.cliente_id = c.id) AS num_ops,
         (SELECT COUNT(*) FROM proyectos p WHERE p.cliente_id = c.id) AS num_proyectos,
         (SELECT COUNT(*) FROM cotizaciones q WHERE q.cliente_id = c.id) AS num_cotizaciones,
         (SELECT COUNT(*) FROM pedidos pe WHERE pe.cliente_id = c.id) AS num_pedidos
    FROM clientes c`;

/**
 * Agrupa clientes cuyo nombre probablemente es el mismo escrito de otra manera (tildes, mayúsculas, un typo).
 * Solo lectura: la decisión de fusionar la toma una persona. Confianza 'alta' = misma clave normalizada.
 */
export async function candidatosFusionClientes() {
  const [rows] = await pool.query(`${SQL_CLIENTES_CON_CONTEO} ORDER BY c.nombre`);
  const clientes = rows.map((r) => ({ ...r, clave: claveCliente(r.nombre) }));

  const padre = clientes.map((_, i) => i);
  const raiz = (i) => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
  for (let i = 0; i < clientes.length; i++) {
    for (let j = i + 1; j < clientes.length; j++) {
      if (basesSimilares(clientes[i].clave, clientes[j].clave)) padre[raiz(i)] = raiz(j);
    }
  }

  const porRaiz = new Map();
  clientes.forEach((c, i) => {
    const r = raiz(i);
    if (!porRaiz.has(r)) porRaiz.set(r, []);
    porRaiz.get(r).push(c);
  });

  const grupos = [];
  for (const miembros of porRaiz.values()) {
    if (miembros.length < 2) continue;
    const confianza = new Set(miembros.map((m) => m.clave)).size === 1 ? 'alta' : 'media';
    // Matriz sugerido: el que más OPs tiene (es el nombre que más se usa); a igualdad, el más antiguo.
    const matriz = [...miembros].sort((a, b) => b.num_ops - a.num_ops || a.id - b.id)[0];
    grupos.push({
      confianza,
      matriz_id: matriz.id,
      clientes: miembros.map(({ clave, ...c }) => ({ ...c, es_matriz: c.id === matriz.id })),
    });
  }
  grupos.sort((a, b) => (a.confianza === b.confianza ? a.clientes[0].nombre.localeCompare(b.clientes[0].nombre) : a.confianza === 'alta' ? -1 : 1));
  return {
    grupos,
    resumen: { grupos: grupos.length, clientes_afectados: grupos.reduce((s, g) => s + g.clientes.length, 0), clientes_total: rows.length },
  };
}

/**
 * Fusiona clientes duplicados dentro de un cliente matriz, todo en una transacción: mueve proyectos, cotizaciones, pedidos
 * y OPs; completa los datos vacíos del matriz con los del absorbido (RUC, contacto, correo, teléfono, tipo); guarda el
 * nombre del absorbido como alias para que el sync no lo recree; y borra los clientes absorbidos ya vacíos.
 * Los proyectos NO se fusionan aquí: si ahora un cliente tiene la misma obra con otro nombre, se devuelven en
 * `proyectos_por_revisar` para fusionarlos con "Normalizar proyectos". Con dryRun solo informa qué cambiaría.
 */
export async function fusionarClientes({ matrizId, clienteIds, dryRun = false }) {
  const ids = [...new Set((clienteIds ?? []).map(Number))];
  if (!Number.isInteger(Number(matrizId)) || ids.length === 0 || ids.some((i) => !Number.isInteger(i))) {
    throw new FusionClienteError('Indica "matriz_id" y al menos un cliente a fusionar.');
  }
  if (ids.length > MAX_CLIENTES_POR_FUSION) throw new FusionClienteError(`Máximo ${MAX_CLIENTES_POR_FUSION} clientes por fusión.`);
  if (ids.includes(Number(matrizId))) throw new FusionClienteError('El cliente matriz no puede estar entre los que se fusionan.');

  const todos = [Number(matrizId), ...ids];
  const [clientes] = await pool.query(`${SQL_CLIENTES_CON_CONTEO} WHERE c.id IN (${todos.map(() => '?').join(',')})`, todos);
  if (clientes.length !== todos.length) throw new FusionClienteError('Algún cliente indicado no existe.');

  const matriz = clientes.find((c) => c.id === Number(matrizId));
  // Se respeta el orden en que se indicaron los absorbidos: el primero que traiga un dato es el que lo aporta.
  const absorbidos = ids.map((id) => clientes.find((c) => c.id === id));
  const suma = (campo) => absorbidos.reduce((s, c) => s + c[campo], 0);

  const rellenos = {};
  for (const campo of CAMPOS_RELLENABLES) {
    if (matriz[campo]) continue;
    const aporta = absorbidos.find((c) => c[campo]);
    if (aporta) rellenos[campo] = aporta[campo];
  }
  const alias = [...new Set(absorbidos.map((c) => claveCliente(c.nombre)).filter((k) => k && k !== claveCliente(matriz.nombre)))];

  const plan = {
    matriz: { id: matriz.id, nombre: matriz.nombre },
    absorbidos: absorbidos.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      ops: c.num_ops,
      proyectos: c.num_proyectos,
      cotizaciones: c.num_cotizaciones,
      pedidos: c.num_pedidos,
    })),
    ops_a_mover: suma('num_ops'),
    proyectos_a_mover: suma('num_proyectos'),
    cotizaciones_a_mover: suma('num_cotizaciones'),
    pedidos_a_mover: suma('num_pedidos'),
    datos_que_completa_el_matriz: rellenos,
    alias_a_guardar: alias,
  };
  if (dryRun) return { dry_run: true, ...plan };

  const marcas = ids.map(() => '?').join(',');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const movidos = {};
    for (const tabla of ['ops', 'proyectos', 'cotizaciones', 'pedidos']) {
      const [r] = await conn.query(`UPDATE \`${tabla}\` SET cliente_id = ? WHERE cliente_id IN (${marcas})`, [matriz.id, ...ids]);
      movidos[tabla] = r.affectedRows;
    }

    // Los alias de proyecto y de cliente que apuntaban a un absorbido pasan al matriz. Si el matriz ya tiene el mismo alias
    // (UNIQUE), UPDATE IGNORE deja la fila del absorbido y se borra: así el cliente queda libre de referencias.
    await conn.query(`UPDATE IGNORE proyecto_alias SET cliente_id = ? WHERE cliente_id IN (${marcas})`, [matriz.id, ...ids]);
    await conn.query(`DELETE FROM proyecto_alias WHERE cliente_id IN (${marcas})`, ids);
    await conn.query(`UPDATE IGNORE cliente_alias SET cliente_id = ? WHERE cliente_id IN (${marcas})`, [matriz.id, ...ids]);
    await conn.query(`DELETE FROM cliente_alias WHERE cliente_id IN (${marcas})`, ids);
    for (const clave of alias) {
      await conn.query(
        `INSERT INTO cliente_alias (alias_normalizado, cliente_id) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE cliente_id = VALUES(cliente_id)`,
        [clave, matriz.id]
      );
    }

    const campos = Object.keys(rellenos);
    if (campos.length) {
      await conn.query(`UPDATE clientes SET ${campos.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`, [...campos.map((c) => rellenos[c]), matriz.id]);
    }

    const [del] = await conn.query(`DELETE FROM clientes WHERE id IN (${marcas})`, ids);
    await conn.commit();

    // Fuera de la transacción: solo lectura, para avisar de obras que ahora comparten cliente y se parecen.
    let proyectosPorRevisar = [];
    try {
      proyectosPorRevisar = (await candidatosFusion()).grupos.filter((g) => g.cliente_id === matriz.id);
    } catch {
      /* el aviso es opcional */
    }

    return {
      dry_run: false,
      ...plan,
      ops_movidas: movidos.ops,
      proyectos_movidos: movidos.proyectos,
      cotizaciones_movidas: movidos.cotizaciones,
      pedidos_movidos: movidos.pedidos,
      clientes_eliminados: del.affectedRows,
      proyectos_por_revisar: proyectosPorRevisar,
    };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}
