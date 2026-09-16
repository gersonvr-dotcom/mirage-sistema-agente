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
    `SELECT c.id, c.nombre, c.ruc_nit, c.contacto, c.email, c.telefono, c.created_at,
            (SELECT COUNT(*) FROM proyectos p WHERE p.cliente_id = c.id) AS num_proyectos
       FROM clientes c
      ${q ? 'WHERE c.nombre LIKE ?' : ''}
      ORDER BY c.nombre ASC`,
    q ? [`%${q}%`] : []
  );
  return rows;
}

/** Un cliente por id. */
export async function obtenerCliente(id) {
  const [[cliente]] = await pool.query(
    `SELECT id, nombre, ruc_nit, contacto, email, telefono, created_at FROM clientes WHERE id = ?`,
    [id]
  );
  return cliente ?? null;
}

/** Crea un cliente y devuelve el registro creado. */
export async function crearCliente({ nombre, ruc_nit, contacto, email, telefono }) {
  const [result] = await pool.query(
    `INSERT INTO clientes (nombre, ruc_nit, contacto, email, telefono) VALUES (?, ?, ?, ?, ?)`,
    [nombre, ruc_nit || null, contacto || null, email || null, telefono || null]
  );
  return obtenerCliente(result.insertId);
}

/** Actualiza un cliente existente y devuelve el registro actualizado (o null si no existe). */
export async function actualizarCliente(id, { nombre, ruc_nit, contacto, email, telefono }) {
  const [result] = await pool.query(
    `UPDATE clientes SET nombre = ?, ruc_nit = ?, contacto = ?, email = ?, telefono = ? WHERE id = ?`,
    [nombre, ruc_nit || null, contacto || null, email || null, telefono || null, id]
  );
  if (result.affectedRows === 0) return null;
  return obtenerCliente(id);
}

/**
 * Elimina un cliente. Lanza un error con code 'TIENE_DEPENDENCIAS' si tiene proyectos,
 * OPs, cotizaciones o pedidos asociados.
 */
export async function eliminarCliente(id) {
  try {
    const [result] = await pool.query(`DELETE FROM clientes WHERE id = ?`, [id]);
    return result.affectedRows > 0;
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      const e = new Error('El cliente tiene proyectos, OPs, cotizaciones o pedidos asociados y no se puede eliminar.');
      e.code = 'TIENE_DEPENDENCIAS';
      throw e;
    }
    throw err;
  }
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

/** La conversación activa del agente para un usuario (una por usuario), o null si nunca chateó. */
export async function obtenerConversacion(usuarioId) {
  const [[conversacion]] = await pool.query(
    `SELECT id, provider, historial, tokens_input, tokens_output, updated_at
       FROM conversaciones_agente WHERE usuario_id = ?`,
    [usuarioId]
  );
  if (!conversacion) return null;
  return {
    ...conversacion,
    historial: conversacion.historial ? JSON.parse(conversacion.historial) : [],
  };
}

/** Crea o actualiza la conversación del agente de un usuario (upsert por usuario_id). */
export async function guardarConversacion({ usuarioId, provider, historial, tokensInput, tokensOutput }) {
  const [result] = await pool.query(
    `INSERT INTO conversaciones_agente (usuario_id, provider, historial, tokens_input, tokens_output)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       id = LAST_INSERT_ID(id),
       provider = VALUES(provider),
       historial = VALUES(historial),
       tokens_input = VALUES(tokens_input),
       tokens_output = VALUES(tokens_output)`,
    [usuarioId, provider, JSON.stringify(historial), tokensInput, tokensOutput]
  );
  return result.insertId;
}

/** Registra una acción de escritura ejecutada por el agente (auditoría). */
export async function registrarAccionAgente({ usuarioId, conversacionId, toolName, input, resultado }) {
  await pool.query(
    `INSERT INTO agente_acciones (usuario_id, conversacion_id, tool_name, input, resultado)
     VALUES (?, ?, ?, ?, ?)`,
    [usuarioId, conversacionId ?? null, toolName, JSON.stringify(input ?? null), JSON.stringify(resultado ?? null)]
  );
}

/** Últimas acciones del agente, para el panel de auditoría. */
export async function listarAccionesAgente({ limit = 50 } = {}) {
  const [rows] = await pool.query(
    `SELECT a.id, a.tool_name, a.input, a.resultado, a.created_at, u.nombre AS usuario
       FROM agente_acciones a
       JOIN usuarios u ON u.id = a.usuario_id
      ORDER BY a.created_at DESC
      LIMIT ?`,
    [Number(limit)]
  );
  return rows;
}

/** Métricas agregadas para el dashboard: totales y distribución por estado. */
export async function obtenerMetricas() {
  const [
    [[{ total_proyectos }]],
    [[{ total_ops }]],
    [[{ total_clientes }]],
    [[{ items_atrasados }]],
    [proyectosPorEstado],
    [opsPorEstado],
    [itemsPorEstado],
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total_proyectos FROM proyectos`),
    pool.query(`SELECT COUNT(*) AS total_ops FROM ops`),
    pool.query(`SELECT COUNT(*) AS total_clientes FROM clientes`),
    pool.query(
      `SELECT COUNT(*) AS items_atrasados FROM op_items
        WHERE fecha_estimada_entrega < CURDATE()
          AND estado NOT IN ('en_bodega', 'entregado', 'cancelado')`
    ),
    pool.query(`SELECT estado, COUNT(*) AS cantidad FROM proyectos GROUP BY estado`),
    pool.query(`SELECT estado_general, COUNT(*) AS cantidad FROM ops GROUP BY estado_general`),
    pool.query(`SELECT estado, COUNT(*) AS cantidad FROM op_items GROUP BY estado`),
  ]);

  return {
    totales: { proyectos: total_proyectos, ops: total_ops, clientes: total_clientes, items_atrasados },
    proyectos_por_estado: proyectosPorEstado,
    ops_por_estado: opsPorEstado,
    items_por_estado: itemsPorEstado,
  };
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

/** Lista de productos (para selects de líneas de OP), opcionalmente filtrada por texto. */
export async function listarProductos({ q } = {}) {
  const [rows] = await pool.query(
    `SELECT id, codigo, nombre, formato, unidad_medida FROM productos
      ${q ? 'WHERE codigo LIKE ? OR nombre LIKE ?' : ''}
      ORDER BY nombre ASC`,
    q ? [`%${q}%`, `%${q}%`] : []
  );
  return rows;
}

/** Lista de proveedores (para selects de líneas de OP), opcionalmente filtrada por texto. */
export async function listarProveedores({ q } = {}) {
  const [rows] = await pool.query(
    `SELECT id, nombre FROM proveedores ${q ? 'WHERE nombre LIKE ?' : ''} ORDER BY nombre ASC`,
    q ? [`%${q}%`] : []
  );
  return rows;
}

/** Lista de OPs con cliente y proyecto, filtrable por texto/estado/cliente/proyecto. */
export async function listarOPs({ q, estado, clienteId, proyectoId } = {}) {
  const where = [];
  const params = [];

  if (q) {
    where.push('(o.numero_op LIKE ? OR c.nombre LIKE ? OR p.nombre LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (estado) {
    where.push('o.estado_general = ?');
    params.push(estado);
  }
  if (clienteId) {
    where.push('o.cliente_id = ?');
    params.push(clienteId);
  }
  if (proyectoId) {
    where.push('o.proyecto_id = ?');
    params.push(proyectoId);
  }

  const [rows] = await pool.query(
    `SELECT o.id, o.numero_op, o.fecha_emision, o.estado_general, o.created_at,
            o.cliente_id, c.nombre AS cliente,
            o.proyecto_id, p.nombre AS proyecto,
            o.pedido_id,
            (SELECT COUNT(*) FROM op_items oi WHERE oi.op_id = o.id) AS num_items
       FROM ops o
       JOIN clientes c ON c.id = o.cliente_id
       JOIN proyectos p ON p.id = o.proyecto_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY o.created_at DESC`,
    params
  );
  return rows;
}

/** Una OP completa: cabecera + líneas (con producto/proveedor) + historial de etapas por línea. */
export async function obtenerOP(id) {
  const [[op]] = await pool.query(
    `SELECT o.id, o.numero_op, o.fecha_emision, o.estado_general, o.pedido_id,
            o.cliente_id, c.nombre AS cliente,
            o.proyecto_id, p.nombre AS proyecto
       FROM ops o
       JOIN clientes c ON c.id = o.cliente_id
       JOIN proyectos p ON p.id = o.proyecto_id
      WHERE o.id = ?`,
    [id]
  );
  if (!op) return null;

  const [items] = await pool.query(
    `SELECT oi.id, oi.producto_id, pr.codigo, pr.nombre AS producto, pr.formato,
            oi.proveedor_id, prov.nombre AS proveedor,
            oi.cantidad, oi.fecha_estimada_entrega, oi.estado,
            (oi.fecha_estimada_entrega < CURDATE()
              AND oi.estado NOT IN ('en_bodega', 'entregado', 'cancelado')) AS atrasado
       FROM op_items oi
       JOIN productos pr ON pr.id = oi.producto_id
       LEFT JOIN proveedores prov ON prov.id = oi.proveedor_id
      WHERE oi.op_id = ?
      ORDER BY oi.id ASC`,
    [id]
  );

  for (const item of items) {
    const [etapas] = await pool.query(
      `SELECT id, etapa, fecha_evento, nota FROM seguimiento_etapas
        WHERE op_item_id = ? ORDER BY fecha_evento ASC, id ASC`,
      [item.id]
    );
    item.atrasado = !!item.atrasado;
    item.historial = etapas;
  }

  return { ...op, items };
}

/** Crea una OP. El cliente se deriva del proyecto elegido (evita inconsistencias). */
export async function crearOP({ numero_op, proyecto_id, pedido_id, fecha_emision }) {
  const [[proyecto]] = await pool.query(`SELECT cliente_id FROM proyectos WHERE id = ?`, [proyecto_id]);
  if (!proyecto) {
    const e = new Error('El proyecto indicado no existe.');
    e.code = 'PROYECTO_INEXISTENTE';
    throw e;
  }
  try {
    const [result] = await pool.query(
      `INSERT INTO ops (numero_op, proyecto_id, cliente_id, pedido_id, fecha_emision)
       VALUES (?, ?, ?, ?, ?)`,
      [numero_op, proyecto_id, proyecto.cliente_id, pedido_id || null, fecha_emision]
    );
    return obtenerOP(result.insertId);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const e = new Error(`Ya existe una OP con el número "${numero_op}".`);
      e.code = 'NUMERO_OP_DUPLICADO';
      throw e;
    }
    throw err;
  }
}

/** Actualiza los campos de cabecera de una OP (no el proyecto/cliente). */
export async function actualizarOP(id, { numero_op, pedido_id, fecha_emision, estado_general }) {
  try {
    const [result] = await pool.query(
      `UPDATE ops SET numero_op = ?, pedido_id = ?, fecha_emision = ?, estado_general = ? WHERE id = ?`,
      [numero_op, pedido_id || null, fecha_emision, estado_general, id]
    );
    if (result.affectedRows === 0) return null;
    return obtenerOP(id);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const e = new Error(`Ya existe una OP con el número "${numero_op}".`);
      e.code = 'NUMERO_OP_DUPLICADO';
      throw e;
    }
    throw err;
  }
}

/** Elimina una OP y, en cascada, sus líneas y el historial de etapas de cada línea. */
export async function eliminarOP(id) {
  const [itemIds] = await pool.query(`SELECT id FROM op_items WHERE op_id = ?`, [id]);
  if (itemIds.length) {
    const ids = itemIds.map((r) => r.id);
    await pool.query(`DELETE FROM seguimiento_etapas WHERE op_item_id IN (?)`, [ids]);
    await pool.query(`DELETE FROM op_items WHERE op_id = ?`, [id]);
  }
  const [result] = await pool.query(`DELETE FROM ops WHERE id = ?`, [id]);
  return result.affectedRows > 0;
}

/** Agrega una línea (item) a una OP. */
export async function crearOPItem({ op_id, producto_id, proveedor_id, cantidad, fecha_estimada_entrega, estado }) {
  await pool.query(
    `INSERT INTO op_items (op_id, producto_id, proveedor_id, cantidad, fecha_estimada_entrega, estado)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [op_id, producto_id, proveedor_id || null, cantidad, fecha_estimada_entrega || null, estado || 'pendiente']
  );
  return obtenerOP(op_id);
}

/** Actualiza una línea de OP. */
export async function actualizarOPItem(itemId, { producto_id, proveedor_id, cantidad, fecha_estimada_entrega, estado }) {
  const [[item]] = await pool.query(`SELECT op_id FROM op_items WHERE id = ?`, [itemId]);
  if (!item) return null;
  await pool.query(
    `UPDATE op_items SET producto_id = ?, proveedor_id = ?, cantidad = ?, fecha_estimada_entrega = ?, estado = ?
      WHERE id = ?`,
    [producto_id, proveedor_id || null, cantidad, fecha_estimada_entrega || null, estado, itemId]
  );
  return obtenerOP(item.op_id);
}

/** Elimina una línea de OP y su historial de etapas. */
export async function eliminarOPItem(itemId) {
  const [[item]] = await pool.query(`SELECT op_id FROM op_items WHERE id = ?`, [itemId]);
  if (!item) return null;
  await pool.query(`DELETE FROM seguimiento_etapas WHERE op_item_id = ?`, [itemId]);
  await pool.query(`DELETE FROM op_items WHERE id = ?`, [itemId]);
  return obtenerOP(item.op_id);
}

/** Registra un evento de seguimiento en una línea de OP (y sincroniza su estado actual). */
export async function agregarEtapaSeguimiento({ op_item_id, etapa, fecha_evento, nota }) {
  const [[item]] = await pool.query(`SELECT op_id FROM op_items WHERE id = ?`, [op_item_id]);
  if (!item) {
    const e = new Error('La línea de OP indicada no existe.');
    e.code = 'ITEM_INEXISTENTE';
    throw e;
  }

  const ESTADO_POR_ETAPA = {
    produccion: 'en_produccion',
    embarque: 'embarcado',
    aduana: 'en_aduana',
    bodega: 'en_bodega',
    entrega: 'entregado',
  };

  await pool.query(
    `INSERT INTO seguimiento_etapas (op_item_id, etapa, fecha_evento, nota) VALUES (?, ?, ?, ?)`,
    [op_item_id, etapa, fecha_evento, nota || null]
  );
  if (ESTADO_POR_ETAPA[etapa]) {
    await pool.query(`UPDATE op_items SET estado = ? WHERE id = ?`, [ESTADO_POR_ETAPA[etapa], op_item_id]);
  }
  return obtenerOP(item.op_id);
}
