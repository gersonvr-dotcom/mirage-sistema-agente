import { pool } from '../db/pool.js';
import { normalizarProyecto, claveTexto, basesSimilares } from './proyectoNormalizer.js';

export class FusionError extends Error {
  constructor(message) {
    super(message);
    this.code = 'FUSION_INVALIDA';
  }
}

const MAX_PROYECTOS_POR_FUSION = 50;

/**
 * Detecta grupos de proyectos de un mismo cliente que probablemente son la misma obra
 * (ej. 'ALESTE 137' / 'ALESTE 137 ADICIONAL' / 'ALESTE 137 PERFIL'). Solo lectura: la decisión
 * de fusionar siempre la toma una persona.
 *  - confianza 'alta': todos comparten exactamente la misma obra normalizada.
 *  - confianza 'media': hay que juntarlos por similitud (typos), revisar con más cuidado.
 */
export async function candidatosFusion() {
  const [rows] = await pool.query(
    `SELECT p.id, p.cliente_id, c.nombre AS cliente, p.nombre, p.estado,
            (SELECT COUNT(*) FROM ops o WHERE o.proyecto_id = p.id) AS num_ops,
            (SELECT COUNT(*) FROM cotizaciones q WHERE q.proyecto_id = p.id) AS num_cotizaciones,
            (SELECT COUNT(*) FROM pedidos pe WHERE pe.proyecto_id = p.id) AS num_pedidos
       FROM proyectos p JOIN clientes c ON c.id = p.cliente_id
      ORDER BY c.nombre, p.nombre`
  );

  const porCliente = new Map();
  for (const r of rows) {
    if (!porCliente.has(r.cliente_id)) porCliente.set(r.cliente_id, []);
    porCliente.get(r.cliente_id).push({ ...r, norma: normalizarProyecto(r.nombre) });
  }

  const grupos = [];
  for (const proyectos of porCliente.values()) {
    const padre = proyectos.map((_, i) => i);
    const raiz = (i) => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
    const unir = (a, b) => {
      padre[raiz(a)] = raiz(b);
    };
    for (let i = 0; i < proyectos.length; i++) {
      for (let j = i + 1; j < proyectos.length; j++) {
        if (basesSimilares(proyectos[i].norma.baseKey, proyectos[j].norma.baseKey)) unir(i, j);
      }
    }

    const porRaiz = new Map();
    proyectos.forEach((p, i) => {
      const r = raiz(i);
      if (!porRaiz.has(r)) porRaiz.set(r, []);
      porRaiz.get(r).push(p);
    });

    for (const miembros of porRaiz.values()) {
      if (miembros.length < 2) continue;
      const confianza = new Set(miembros.map((m) => m.norma.baseKey)).size === 1 ? 'alta' : 'media';

      // Matriz sugerido: el que ya se llama como la obra (sin sufijo); si no, el que más OPs tiene.
      const limpios = miembros.filter((m) => m.norma.aliasKey === m.norma.baseKey);
      const elegibles = limpios.length ? limpios : miembros;
      const matriz = [...elegibles].sort(
        (a, b) => b.num_ops - a.num_ops || a.nombre.length - b.nombre.length || a.id - b.id
      )[0];
      const renombrar = matriz.norma.aliasKey !== matriz.norma.baseKey;

      grupos.push({
        cliente_id: matriz.cliente_id,
        cliente: matriz.cliente,
        confianza,
        matriz_id: matriz.id,
        nombre_final: renombrar ? matriz.norma.nombreBase : matriz.nombre,
        renombrar,
        proyectos: miembros.map((m) => ({
          id: m.id,
          nombre: m.nombre,
          estado: m.estado,
          num_ops: m.num_ops,
          num_cotizaciones: m.num_cotizaciones,
          num_pedidos: m.num_pedidos,
          tipo_pedido: m.norma.tipoPedido,
          es_matriz: m.id === matriz.id,
        })),
      });
    }
  }

  grupos.sort((a, b) => (a.confianza === b.confianza ? a.cliente.localeCompare(b.cliente) : a.confianza === 'alta' ? -1 : 1));
  return {
    grupos,
    resumen: {
      grupos: grupos.length,
      proyectos_afectados: grupos.reduce((s, g) => s + g.proyectos.length, 0),
      proyectos_total: rows.length,
    },
  };
}

function datosPedido(nombreOrigen, claveFinal) {
  const n = normalizarProyecto(nombreOrigen);
  return {
    tipo: n.tipoPedido,
    descripcion: n.aliasKey !== claveFinal ? String(nombreOrigen).trim().slice(0, 150) : null,
    claves: [...new Set([n.aliasKey, n.baseKey])].filter((k) => k && k !== claveFinal).map((k) => k.slice(0, 190)),
  };
}

/**
 * Fusiona proyectos de un mismo cliente dentro de un proyecto matriz (la obra), todo en una
 * transacción: mueve OPs, cotizaciones y pedidos; deja en cada OP el tipo de pedido y el nombre
 * original del proyecto absorbido; registra alias para que el sync no recree los huérfanos; y
 * borra los proyectos absorbidos ya vacíos. Con dryRun solo informa qué cambiaría.
 */
export async function fusionarProyectos({ matrizId, proyectoIds, nombreFinal, dryRun = false }) {
  const ids = [...new Set((proyectoIds ?? []).map(Number))];
  if (!Number.isInteger(Number(matrizId)) || ids.length === 0 || ids.some((i) => !Number.isInteger(i))) {
    throw new FusionError('Indica "matriz_id" y al menos un proyecto a fusionar.');
  }
  if (ids.length > MAX_PROYECTOS_POR_FUSION) throw new FusionError(`Máximo ${MAX_PROYECTOS_POR_FUSION} proyectos por fusión.`);
  if (ids.includes(Number(matrizId))) throw new FusionError('El proyecto matriz no puede estar entre los que se fusionan.');

  const todos = [Number(matrizId), ...ids];
  const [proyectos] = await pool.query(
    `SELECT p.id, p.cliente_id, p.nombre,
            (SELECT COUNT(*) FROM ops o WHERE o.proyecto_id = p.id) AS num_ops,
            (SELECT COUNT(*) FROM cotizaciones q WHERE q.proyecto_id = p.id) AS num_cotizaciones,
            (SELECT COUNT(*) FROM pedidos pe WHERE pe.proyecto_id = p.id) AS num_pedidos
       FROM proyectos p WHERE p.id IN (${todos.map(() => '?').join(',')})`,
    todos
  );
  if (proyectos.length !== todos.length) throw new FusionError('Algún proyecto indicado no existe.');
  if (new Set(proyectos.map((p) => p.cliente_id)).size !== 1) {
    throw new FusionError('Solo se pueden fusionar proyectos del mismo cliente.');
  }

  const matriz = proyectos.find((p) => p.id === Number(matrizId));
  const absorbidos = proyectos.filter((p) => p.id !== matriz.id);
  const nombreResultante = String(nombreFinal ?? '').trim() || matriz.nombre;
  const renombra = nombreResultante !== matriz.nombre;
  const claveFinal = claveTexto(nombreResultante);

  const plan = {
    matriz: { id: matriz.id, nombre_actual: matriz.nombre, nombre_final: nombreResultante },
    absorbidos: absorbidos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      tipo_pedido: datosPedido(p.nombre, claveFinal).tipo,
      ops: p.num_ops,
      cotizaciones: p.num_cotizaciones,
      pedidos: p.num_pedidos,
    })),
    ops_a_mover: absorbidos.reduce((s, p) => s + p.num_ops, 0),
    cotizaciones_a_mover: absorbidos.reduce((s, p) => s + p.num_cotizaciones, 0),
    pedidos_a_mover: absorbidos.reduce((s, p) => s + p.num_pedidos, 0),
  };
  if (dryRun) return { dry_run: true, ...plan };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let opsMovidas = 0;
    let cotizacionesMovidas = 0;
    let pedidosMovidos = 0;
    const alias = new Map();

    const aplicarTipoYDescripcion = async (origen) => {
      const d = datosPedido(origen.nombre, claveFinal);
      const [r] = await conn.query(
        `UPDATE ops SET proyecto_id = ?,
                        tipo_pedido = IF(tipo_pedido = 'principal', ?, tipo_pedido),
                        descripcion_pedido = COALESCE(descripcion_pedido, ?)
          WHERE proyecto_id = ?`,
        [matriz.id, d.tipo, d.descripcion, origen.id]
      );
      d.claves.forEach((k) => alias.set(k, true));
      return r.affectedRows;
    };

    if (renombra) await aplicarTipoYDescripcion(matriz);
    for (const p of absorbidos) {
      opsMovidas += await aplicarTipoYDescripcion(p);
      const [c] = await conn.query('UPDATE cotizaciones SET proyecto_id = ? WHERE proyecto_id = ?', [matriz.id, p.id]);
      const [pe] = await conn.query('UPDATE pedidos SET proyecto_id = ? WHERE proyecto_id = ?', [matriz.id, p.id]);
      cotizacionesMovidas += c.affectedRows;
      pedidosMovidos += pe.affectedRows;
    }

    // Los alias de los proyectos absorbidos apuntaban a ellos: re-apuntar al matriz antes de borrarlos.
    await conn.query(`UPDATE proyecto_alias SET proyecto_id = ? WHERE proyecto_id IN (${absorbidos.map(() => '?').join(',')})`, [
      matriz.id,
      ...absorbidos.map((p) => p.id),
    ]);
    for (const clave of alias.keys()) {
      await conn.query(
        `INSERT INTO proyecto_alias (cliente_id, alias_normalizado, proyecto_id) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE proyecto_id = VALUES(proyecto_id)`,
        [matriz.cliente_id, clave, matriz.id]
      );
    }

    const [del] = await conn.query(`DELETE FROM proyectos WHERE id IN (${absorbidos.map(() => '?').join(',')})`, absorbidos.map((p) => p.id));
    if (renombra) await conn.query('UPDATE proyectos SET nombre = ? WHERE id = ?', [nombreResultante, matriz.id]);

    await conn.commit();
    return {
      dry_run: false,
      ...plan,
      ops_movidas: opsMovidas,
      cotizaciones_movidas: cotizacionesMovidas,
      pedidos_movidos: pedidosMovidos,
      proyectos_eliminados: del.affectedRows,
    };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}
