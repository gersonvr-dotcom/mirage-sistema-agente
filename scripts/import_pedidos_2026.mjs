import 'dotenv/config';
import fs from 'node:fs';
import { pool } from '../src/db/pool.js';

const BAD_ROWS = new Set([5, 74, 136, 190, 225, 226, 245, 269, 274, 275, 276, 279, 281]);

function normOc(oc) {
  if (oc === null || oc === undefined) return null;
  const s = String(oc).trim();
  if (s === '' || s.toUpperCase() === 'N/A' || s === '0') return null;
  return s;
}

function normObservaciones(obs) {
  if (!obs) return null;
  const s = String(obs).trim();
  return s === '' ? null : s;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normFechaPactada(raw, observaciones) {
  if (!raw) return { fechaPactada: null, observaciones };
  const s = String(raw).trim();
  if (DATE_RE.test(s)) return { fechaPactada: s, observaciones };
  const nota = s.toUpperCase() === 'N/A' ? null : s;
  if (!nota) return { fechaPactada: null, observaciones };
  if (observaciones && observaciones.toUpperCase() === nota.toUpperCase()) {
    return { fechaPactada: null, observaciones };
  }
  const merged = observaciones ? `${observaciones} | ${nota}` : nota;
  return { fechaPactada: null, observaciones: merged };
}

async function findOrCreateCliente(conn, nombre) {
  const [rows] = await conn.query('SELECT id FROM clientes WHERE nombre = ?', [nombre]);
  if (rows.length) return rows[0].id;
  const [res] = await conn.query('INSERT INTO clientes (nombre) VALUES (?)', [nombre]);
  return res.insertId;
}

async function findOrCreateProyecto(conn, clienteId, nombre) {
  const [rows] = await conn.query(
    'SELECT id FROM proyectos WHERE cliente_id = ? AND nombre = ?',
    [clienteId, nombre]
  );
  if (rows.length) return rows[0].id;
  const [res] = await conn.query(
    'INSERT INTO proyectos (cliente_id, nombre) VALUES (?, ?)',
    [clienteId, nombre]
  );
  return res.insertId;
}

async function findOrCreateCotizacion(conn, numero, proyectoId, clienteId, fecha) {
  if (!numero) return null;
  const [rows] = await conn.query('SELECT id FROM cotizaciones WHERE numero_cotizacion = ?', [numero]);
  if (rows.length) return rows[0].id;
  const [res] = await conn.query(
    `INSERT INTO cotizaciones (numero_cotizacion, proyecto_id, cliente_id, fecha, estado)
     VALUES (?, ?, ?, ?, 'aprobada')`,
    [numero, proyectoId, clienteId, fecha]
  );
  return res.insertId;
}

async function main() {
  const data = JSON.parse(fs.readFileSync('/tmp/pedidos_2026.json', 'utf8'));
  const rows = data.filter((r) => !BAD_ROWS.has(r.row));

  const stats = { clientesCreados: 0, proyectosCreados: 0, cotizacionesCreadas: 0, opsInsertadas: 0, opsExistentes: 0 };
  const clienteCache = new Map();
  const proyectoCache = new Map();
  const cotizacionCache = new Map();

  const conn = await pool.getConnection();
  try {
    for (const r of rows) {
      await conn.beginTransaction();
      try {
        let clienteId = clienteCache.get(r.cliente);
        if (!clienteId) {
          const before = await conn.query('SELECT id FROM clientes WHERE nombre = ?', [r.cliente]);
          clienteId = await findOrCreateCliente(conn, r.cliente);
          if (before[0].length === 0) stats.clientesCreados++;
          clienteCache.set(r.cliente, clienteId);
        }

        const proyectoKey = `${clienteId}::${r.proyecto}`;
        let proyectoId = proyectoCache.get(proyectoKey);
        if (!proyectoId) {
          const before = await conn.query(
            'SELECT id FROM proyectos WHERE cliente_id = ? AND nombre = ?',
            [clienteId, r.proyecto]
          );
          proyectoId = await findOrCreateProyecto(conn, clienteId, r.proyecto);
          if (before[0].length === 0) stats.proyectosCreados++;
          proyectoCache.set(proyectoKey, proyectoId);
        }

        const numeroCotizacion = normOc(r.cotizacion);
        let cotizacionId = null;
        if (numeroCotizacion) {
          cotizacionId = cotizacionCache.get(numeroCotizacion);
          if (!cotizacionId) {
            const before = await conn.query('SELECT id FROM cotizaciones WHERE numero_cotizacion = ?', [numeroCotizacion]);
            cotizacionId = await findOrCreateCotizacion(conn, numeroCotizacion, proyectoId, clienteId, r.fecha_pedido);
            if (before[0].length === 0) stats.cotizacionesCreadas++;
            cotizacionCache.set(numeroCotizacion, cotizacionId);
          }
        }

        const [existing] = await conn.query('SELECT id FROM ops WHERE numero_op = ?', [r.op]);
        if (existing.length) {
          stats.opsExistentes++;
        } else {
          const { fechaPactada, observaciones } = normFechaPactada(
            r.fecha_pactada,
            normObservaciones(r.observaciones)
          );
          await conn.query(
            `INSERT INTO ops
               (numero_op, cotizacion_id, proyecto_id, cliente_id, fecha_emision, fecha_pactada, oc_cliente, observaciones_comercial, estado_general)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'abierta')`,
            [
              r.op,
              cotizacionId,
              proyectoId,
              clienteId,
              r.fecha_pedido,
              fechaPactada,
              normOc(r.oc),
              observaciones,
            ]
          );
          stats.opsInsertadas++;
        }

        await conn.commit();
      } catch (err) {
        await conn.rollback();
        console.error(`Error en fila ${r.row} (OP ${r.op}):`, err.message);
        throw err;
      }
    }
  } finally {
    conn.release();
  }

  console.log('Filas excluidas:', BAD_ROWS.size);
  console.log('Filas procesadas:', rows.length);
  console.log(stats);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
