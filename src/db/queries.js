import { pool } from './pool.js';

const OP_ITEMS_ABIERTOS = ['pendiente', 'en_produccion', 'embarcado', 'en_aduana'];

/** Busca un usuario por email para el login (incluye el hash para verificar contraseña). */
export async function buscarUsuarioPorEmail(email) {
  const [[usuario]] = await pool.query(
    `SELECT id, email, password_hash, nombre, rol FROM usuarios WHERE email = ? LIMIT 1`,
    [email]
  );
  return usuario ?? null;
}

/** Lista de usuarios (sin el hash de password), para el panel de administración. */
export async function listarUsuarios() {
  const [rows] = await pool.query(
    `SELECT id, email, nombre, rol, created_at FROM usuarios ORDER BY created_at ASC`
  );
  return rows;
}

/** Crea un usuario y devuelve el registro (sin el hash). Lanza code 'EMAIL_DUPLICADO' si ya existe. */
export async function crearUsuario({ email, password_hash, nombre, rol }) {
  try {
    const [result] = await pool.query(
      `INSERT INTO usuarios (email, password_hash, nombre, rol) VALUES (?, ?, ?, ?)`,
      [email, password_hash, nombre, rol]
    );
    const [[usuario]] = await pool.query(
      `SELECT id, email, nombre, rol, created_at FROM usuarios WHERE id = ?`,
      [result.insertId]
    );
    return usuario;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const e = new Error(`Ya existe un usuario con el email "${email}".`);
      e.code = 'EMAIL_DUPLICADO';
      throw e;
    }
    throw err;
  }
}

/** OP -> Cliente -> Proyecto -> líneas (Producto, Código, Formato, Cantidad, Proveedor, Fecha, Estado) */
export async function buscarPorOP(numeroOp) {
  const [rows] = await pool.query(
    `SELECT o.numero_op, o.fecha_emision, o.estado_general,
            c.nombre AS cliente, p.nombre AS proyecto,
            pr.codigo, pr.nombre AS producto, pr.formato,
            oi.cantidad, oi.fecha_estimada_entrega, oi.estado AS estado_item,
            prov.nombre AS proveedor
       FROM ops o
       JOIN clientes c ON c.id = o.cliente_id
       JOIN proyectos p ON p.id = o.proyecto_id
       JOIN op_items oi ON oi.op_id = o.id
       JOIN productos pr ON pr.id = oi.producto_id
       LEFT JOIN proveedores prov ON prov.id = oi.proveedor_id
      WHERE o.numero_op = ?`,
    [numeroOp]
  );
  return rows;
}

/** ¿A qué cliente pertenece la OP / qué OPs abiertas tiene un cliente? */
export async function buscarPorCliente(nombreCliente, { soloAbiertas = true } = {}) {
  const params = [`%${nombreCliente}%`];
  let sql = `SELECT o.numero_op, o.fecha_emision, o.estado_general,
                    c.nombre AS cliente, p.nombre AS proyecto
               FROM ops o
               JOIN clientes c ON c.id = o.cliente_id
               JOIN proyectos p ON p.id = o.proyecto_id
              WHERE c.nombre LIKE ?`;
  if (soloAbiertas) {
    sql += ` AND o.estado_general NOT IN ('cerrada', 'cancelada')`;
  }
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** ¿En cuál OP viene determinado material? */
export async function buscarPorProducto(codigoONombre) {
  const like = `%${codigoONombre}%`;
  const [rows] = await pool.query(
    `SELECT o.numero_op, c.nombre AS cliente, p.nombre AS proyecto,
            pr.codigo, pr.nombre AS producto,
            oi.cantidad, oi.estado AS estado_item, oi.fecha_estimada_entrega
       FROM op_items oi
       JOIN ops o ON o.id = oi.op_id
       JOIN clientes c ON c.id = o.cliente_id
       JOIN proyectos p ON p.id = o.proyecto_id
       JOIN productos pr ON pr.id = oi.producto_id
      WHERE pr.codigo LIKE ? OR pr.nombre LIKE ?`,
    [like, like]
  );
  return rows;
}

/** Material pendiente de recibir, filtrado por cliente y/o proyecto. */
export async function materialPendiente({ cliente, proyecto } = {}) {
  const where = [`oi.estado IN (${OP_ITEMS_ABIERTOS.map(() => '?').join(',')})`];
  const params = [...OP_ITEMS_ABIERTOS];

  if (cliente) {
    where.push('c.nombre LIKE ?');
    params.push(`%${cliente}%`);
  }
  if (proyecto) {
    where.push('p.nombre LIKE ?');
    params.push(`%${proyecto}%`);
  }

  const [rows] = await pool.query(
    `SELECT pr.codigo, pr.nombre AS producto, oi.estado AS estado_item,
            SUM(oi.cantidad) AS cantidad_pendiente,
            c.nombre AS cliente, p.nombre AS proyecto
       FROM op_items oi
       JOIN ops o ON o.id = oi.op_id
       JOIN clientes c ON c.id = o.cliente_id
       JOIN proyectos p ON p.id = o.proyecto_id
       JOIN productos pr ON pr.id = oi.producto_id
      WHERE ${where.join(' AND ')}
      GROUP BY pr.id, oi.estado, c.id, p.id`,
    params
  );
  return rows;
}

/** Lista de clientes (para selects/formularios), opcionalmente filtrada por nombre parcial. */
export async function listarClientes({ q } = {}) {
  const [rows] = await pool.query(
    `SELECT id, nombre FROM clientes ${q ? 'WHERE nombre LIKE ?' : ''} ORDER BY nombre ASC`,
    q ? [`%${q}%`] : []
  );
  return rows;
}

/** Lista de proyectos con el nombre del cliente, filtrable por texto y/o estado. */
export async function listarProyectos({ q, estado } = {}) {
  const where = [];
  const params = [];

  if (q) {
    where.push('(p.nombre LIKE ? OR c.nombre LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (estado) {
    where.push('p.estado = ?');
    params.push(estado);
  }

  const [rows] = await pool.query(
    `SELECT p.id, p.nombre, p.descripcion, p.estado, p.created_at,
            p.cliente_id, c.nombre AS cliente
       FROM proyectos p
       JOIN clientes c ON c.id = p.cliente_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY p.created_at DESC`,
    params
  );
  return rows;
}

/** Un proyecto por id, con el nombre del cliente. */
export async function obtenerProyecto(id) {
  const [[proyecto]] = await pool.query(
    `SELECT p.id, p.nombre, p.descripcion, p.estado, p.created_at,
            p.cliente_id, c.nombre AS cliente
       FROM proyectos p
       JOIN clientes c ON c.id = p.cliente_id
      WHERE p.id = ?`,
    [id]
  );
  return proyecto ?? null;
}

/** Crea un proyecto y devuelve el registro creado. */
export async function crearProyecto({ cliente_id, nombre, descripcion, estado }) {
  const [result] = await pool.query(
    `INSERT INTO proyectos (cliente_id, nombre, descripcion, estado) VALUES (?, ?, ?, ?)`,
    [cliente_id, nombre, descripcion ?? null, estado || 'activo']
  );
  return obtenerProyecto(result.insertId);
}

/** Actualiza un proyecto existente y devuelve el registro actualizado (o null si no existe). */
export async function actualizarProyecto(id, { cliente_id, nombre, descripcion, estado }) {
  const [result] = await pool.query(
    `UPDATE proyectos SET cliente_id = ?, nombre = ?, descripcion = ?, estado = ? WHERE id = ?`,
    [cliente_id, nombre, descripcion ?? null, estado, id]
  );
  if (result.affectedRows === 0) return null;
  return obtenerProyecto(id);
}

/**
 * Elimina un proyecto. Lanza un error con code 'TIENE_DEPENDENCIAS' si hay cotizaciones,
 * pedidos u OPs asociadas (la baja en ese caso es cambiar el estado a "cerrado").
 */
export async function eliminarProyecto(id) {
  try {
    const [result] = await pool.query(`DELETE FROM proyectos WHERE id = ?`, [id]);
    return result.affectedRows > 0;
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      const e = new Error('El proyecto tiene cotizaciones, pedidos u OPs asociadas y no se puede eliminar.');
      e.code = 'TIENE_DEPENDENCIAS';
      throw e;
    }
    throw err;
  }
}

/** Reconstruye el estado completo de un proyecto: cotizaciones, pedidos, OPs, items y atrasos. */
export async function estadoProyecto(nombreProyecto) {
  const [[proyecto]] = await pool.query(
    `SELECT p.id, p.nombre, p.estado, c.nombre AS cliente
       FROM proyectos p JOIN clientes c ON c.id = p.cliente_id
      WHERE p.nombre LIKE ?
      LIMIT 1`,
    [`%${nombreProyecto}%`]
  );
  if (!proyecto) return null;

  const [cotizaciones, pedidos, ops] = await Promise.all([
    pool.query(
      `SELECT numero_cotizacion, fecha, estado, total FROM cotizaciones WHERE proyecto_id = ?`,
      [proyecto.id]
    ).then(([r]) => r),
    pool.query(
      `SELECT numero_pedido, fecha, estado FROM pedidos WHERE proyecto_id = ?`,
      [proyecto.id]
    ).then(([r]) => r),
    pool.query(
      `SELECT id, numero_op, fecha_emision, estado_general FROM ops WHERE proyecto_id = ?`,
      [proyecto.id]
    ).then(([r]) => r),
  ]);

  for (const op of ops) {
    const [items] = await pool.query(
      `SELECT oi.id, pr.codigo, pr.nombre AS producto, oi.cantidad,
              oi.fecha_estimada_entrega, oi.estado AS estado_item,
              prov.nombre AS proveedor,
              (oi.fecha_estimada_entrega < CURDATE()
                AND oi.estado NOT IN ('en_bodega', 'entregado', 'cancelado')) AS atrasado
         FROM op_items oi
         JOIN productos pr ON pr.id = oi.producto_id
         LEFT JOIN proveedores prov ON prov.id = oi.proveedor_id
        WHERE oi.op_id = ?`,
      [op.id]
    );

    for (const item of items) {
      const [etapas] = await pool.query(
        `SELECT etapa, fecha_evento, nota FROM seguimiento_etapas
          WHERE op_item_id = ? ORDER BY fecha_evento ASC`,
        [item.id]
      );
      item.atrasado = !!item.atrasado;
      item.historial = etapas;
    }
    op.items = items;
    delete op.id;
  }

  return { proyecto: { nombre: proyecto.nombre, cliente: proyecto.cliente, estado: proyecto.estado }, cotizaciones, pedidos, ops };
}
