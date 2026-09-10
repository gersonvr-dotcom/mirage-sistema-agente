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
