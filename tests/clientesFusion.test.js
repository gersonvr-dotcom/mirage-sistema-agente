import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { hayBD, prepararBDPrueba, borrarBDPrueba } from './helpers/bdPrueba.js';

// Fusión de clientes duplicados y alias (R5-10) contra una BD desechable. El escenario es el caso real: "VAN DE LAT Y
// JIMENEZ" (error de tipeo del Excel) y "VAN DER LAAT Y JIMENEZ", cada uno con su versión de la obra ALESTE 137.
const FIXTURES = `
SET NAMES utf8mb4;
INSERT INTO clientes (id, nombre, ruc_nit, contacto, tipo) VALUES
  (1, 'VAN DER LAAT Y JIMENEZ', NULL, NULL, NULL),
  (2, 'VAN DE LAT Y JIMENEZ', '3-101-555', 'Ana', 'constructora'),
  (3, 'Otro Cliente', NULL, NULL, NULL),
  (4, 'Constructora Peña', NULL, NULL, NULL),
  (5, 'CONSTRUCTORA PENA', NULL, NULL, NULL);
INSERT INTO proyectos (id, cliente_id, nombre) VALUES (1,1,'ALESTE 137'), (2,2,'ALESTE 137 ADICIONAL'), (3,3,'OBRA X');
INSERT INTO cotizaciones (id, numero_cotizacion, proyecto_id, cliente_id, fecha) VALUES (1,'2026-1-AN',1,1,'2026-02-01'), (2,'2026-2-AN',2,2,'2026-02-02');
INSERT INTO ops (id, numero_op, proyecto_id, cliente_id, fecha_emision) VALUES
  (1,'T-001',1,1,'2026-02-10'), (2,'T-002',1,1,'2026-02-11'), (3,'T-003',2,2,'2026-03-01'), (4,'T-004',3,3,'2026-03-02');
INSERT INTO proyecto_alias (cliente_id, alias_normalizado, proyecto_id) VALUES (2, 'VITACER', 2);
`;

let nombreBD;
let fusion;
let pool;

before(async () => {
  if (!hayBD) return;
  nombreBD = await prepararBDPrueba(FIXTURES);
  fusion = await import('../src/services/clientesFusion.js');
  ({ pool } = await import('../src/db/pool.js'));
});

after(async () => {
  if (!hayBD) return;
  await pool.end();
  await borrarBDPrueba(nombreBD);
});

const saltar = { skip: hayBD ? false : 'sin credenciales de BD (usa npm run test:db)' };
const contar = async (tabla, donde) => (await pool.query(`SELECT COUNT(*) AS n FROM \`${tabla}\` WHERE ${donde}`))[0][0].n;

test('candidatos: agrupa nombres parecidos y marca alta confianza solo si difieren en tildes/mayúsculas', saltar, async () => {
  const { grupos } = await fusion.candidatosFusionClientes();
  const nombres = (g) => g.clientes.map((c) => c.nombre).sort();
  const vdl = grupos.find((g) => nombres(g).includes('VAN DE LAT Y JIMENEZ'));
  assert.deepEqual(nombres(vdl), ['VAN DE LAT Y JIMENEZ', 'VAN DER LAAT Y JIMENEZ']);
  assert.equal(vdl.confianza, 'media');
  assert.equal(vdl.matriz_id, 1, 'el matriz sugerido es el que tiene más OPs');
  const pena = grupos.find((g) => nombres(g).includes('CONSTRUCTORA PENA'));
  assert.equal(pena.confianza, 'alta');
  assert.ok(!grupos.some((g) => nombres(g).includes('Otro Cliente')));
});

test('dry_run informa el plan y no cambia nada', saltar, async () => {
  const r = await fusion.fusionarClientes({ matrizId: 1, clienteIds: [2], dryRun: true });
  assert.equal(r.dry_run, true);
  assert.equal(r.ops_a_mover, 1);
  assert.equal(r.proyectos_a_mover, 1);
  assert.equal(r.cotizaciones_a_mover, 1);
  assert.deepEqual(r.alias_a_guardar, ['VAN DE LAT Y JIMENEZ']);
  assert.deepEqual(r.datos_que_completa_el_matriz, { ruc_nit: '3-101-555', contacto: 'Ana', tipo: 'constructora' });
  assert.equal(await contar('clientes', 'id = 2'), 1);
  assert.equal(await contar('ops', 'cliente_id = 2'), 1);
});

test('valida la petición', saltar, async () => {
  await assert.rejects(fusion.fusionarClientes({ matrizId: 1, clienteIds: [] }), { code: 'FUSION_INVALIDA' });
  await assert.rejects(fusion.fusionarClientes({ matrizId: 1, clienteIds: [1] }), { code: 'FUSION_INVALIDA' });
  await assert.rejects(fusion.fusionarClientes({ matrizId: 1, clienteIds: [999] }), { code: 'FUSION_INVALIDA' });
});

test('fusionar mueve OPs, proyectos y cotizaciones, completa datos, guarda alias y borra el duplicado', saltar, async () => {
  const r = await fusion.fusionarClientes({ matrizId: 1, clienteIds: [2] });
  assert.equal(r.dry_run, false);
  assert.equal(r.ops_movidas, 1);
  assert.equal(r.proyectos_movidos, 1);
  assert.equal(r.cotizaciones_movidas, 1);
  assert.equal(r.clientes_eliminados, 1);
  // 'ALESTE 137' y 'ALESTE 137 ADICIONAL' ahora cuelgan del mismo cliente: se avisa, no se fusionan solas.
  assert.equal(r.proyectos_por_revisar.length, 1);
  assert.deepEqual(r.proyectos_por_revisar[0].proyectos.map((p) => p.nombre).sort(), ['ALESTE 137', 'ALESTE 137 ADICIONAL']);

  assert.equal(await contar('clientes', 'id = 2'), 0);
  assert.equal(await contar('ops', 'cliente_id = 1'), 3);
  assert.equal(await contar('proyectos', 'cliente_id = 1'), 2);
  assert.equal(await contar('cotizaciones', 'cliente_id = 1'), 2);
  assert.equal(await contar('proyecto_alias', 'cliente_id = 1'), 1, 'el alias de proyecto pasa al matriz');
  const [[c]] = await pool.query('SELECT ruc_nit, contacto, tipo FROM clientes WHERE id = 1');
  assert.deepEqual({ ...c }, { ruc_nit: '3-101-555', contacto: 'Ana', tipo: 'constructora' });
  assert.equal(await contar('cliente_alias', "cliente_id = 1 AND alias_normalizado = 'VAN DE LAT Y JIMENEZ'"), 1);
  assert.equal(await contar('cliente_alias', 'cliente_id = 2'), 0);
});

test('fusionar clientes no fusiona proyectos por su cuenta', saltar, async () => {
  assert.equal(await contar('proyectos', 'cliente_id = 1'), 2);
});

test('el matriz no pierde datos propios al fusionar', saltar, async () => {
  await pool.query("UPDATE clientes SET ruc_nit = 'PROPIO' WHERE id = 4");
  await pool.query("UPDATE clientes SET ruc_nit = 'AJENO', email = 'a@b.c' WHERE id = 5");
  await fusion.fusionarClientes({ matrizId: 4, clienteIds: [5] });
  const [[c]] = await pool.query('SELECT ruc_nit, email FROM clientes WHERE id = 4');
  assert.deepEqual({ ...c }, { ruc_nit: 'PROPIO', email: 'a@b.c' });
  assert.equal(await contar('cliente_alias', "alias_normalizado = 'CONSTRUCTORA PENA'"), 0, 'una variante solo de mayúsculas/tildes no necesita alias');
});

test('resolverCliente: por nombre, por alias de una fusión y crea solo si no hay ninguno', saltar, async () => {
  const conn = await pool.getConnection();
  try {
    // El nombre mal escrito del Excel apunta al cliente que quedó, aunque venga con otras mayúsculas o puntuación.
    assert.deepEqual(await fusion.resolverCliente(conn, 'VAN DE LAT Y JIMENEZ'), { id: 1, creado: false });
    assert.deepEqual(await fusion.resolverCliente(conn, 'Van de Lat y Jiménez.'), { id: 1, creado: false });
    // Nombre exacto existente: igual que antes.
    assert.deepEqual(await fusion.resolverCliente(conn, 'Otro Cliente'), { id: 3, creado: false });
    // Desconocido: se crea.
    const nuevo = await fusion.resolverCliente(conn, 'CLIENTE NUEVO');
    assert.equal(nuevo.creado, true);
    assert.equal(await contar('clientes', "nombre = 'VAN DE LAT Y JIMENEZ'"), 0, 'no se recrea el duplicado');
  } finally {
    conn.release();
  }
});

test('borrar el cliente matriz borra sus alias (ON DELETE CASCADE)', saltar, async () => {
  await pool.query('DELETE FROM ops WHERE cliente_id = 1');
  await pool.query('DELETE FROM cotizaciones WHERE cliente_id = 1');
  await pool.query('DELETE FROM proyecto_alias WHERE cliente_id = 1');
  await pool.query('DELETE FROM proyectos WHERE cliente_id = 1');
  await pool.query('DELETE FROM clientes WHERE id = 1');
  assert.equal(await contar('cliente_alias', 'cliente_id = 1'), 0);
});
