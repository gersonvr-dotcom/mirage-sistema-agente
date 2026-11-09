import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { hayBD, prepararBDPrueba, borrarBDPrueba } from './helpers/bdPrueba.js';

// Agregaciones de ventas (R4-04/R4-05) contra una BD desechable con datos sintéticos. Cada caso sale de una regla del
// criterio acordado (Q6): solo M2, sin anuladas ni internos, fecha de emisión, monedas separadas.
const FIXTURES = `
SET NAMES utf8mb4;
INSERT INTO clientes (id, nombre, tipo) VALUES
  (1, 'CONSTRUCTORA A', 'constructora'), (2, 'CONSTRUCTORA B', 'constructora'), (3, 'ESTUDIO C', 'arquitecto'),
  (4, 'MIRAGE', 'interno'), (5, 'SIN TIPO', NULL);
INSERT INTO proyectos (id, cliente_id, nombre) VALUES (1,1,'OBRA A1'), (2,1,'OBRA A2'), (3,2,'OBRA B1'), (4,3,'OBRA C1'), (5,4,'MERCADEO'), (6,5,'OBRA E1');
INSERT INTO productos (id, codigo, nombre, formato, unidad_medida) VALUES
  (1,'M2-1','SERIEX','60X120','M2'), (2,'ML-1','ZOCALO','10X60','ML'), (3,'M2-2','SERIEY','80X80',' m2 ');
INSERT INTO proveedores (id, nombre) VALUES (1, 'MIRAGE'), (2, 'HARMONY');
INSERT INTO ops (id, numero_op, proyecto_id, cliente_id, fecha_emision, estado_general) VALUES
  (1,'T-001',1,1,'2026-02-10','abierta'),
  (2,'T-002',2,1,'2026-05-01','abierta'),
  (3,'T-003',3,2,'2026-03-01','abierta'),
  (4,'T-004',3,2,'2026-03-05','cancelada'),
  (5,'T-005',4,3,'2026-06-01','abierta'),
  (6,'T-006',5,4,'2026-01-01','abierta'),
  (7,'T-007',1,1,'2025-12-31','abierta'),
  (8,'T-008',6,5,'2026-07-01','abierta'),
  (9,'T-009',6,5,'1900-01-01','abierta');
INSERT INTO op_items (op_id, producto_id, proveedor_id, cantidad, importe_total, moneda) VALUES
  (1,1,1,100,1000,'USD'), (1,2,1,50,200,'USD'),
  (2,3,2,30,300,'EUR'),
  (3,1,1,120,1200,'USD'),
  (4,1,1,500,5000,'USD'),
  (5,1,1,40,NULL,NULL),
  (6,1,1,999,9990,'USD'),
  (7,1,1,70,700,'USD'),
  (8,1,1,10,NULL,NULL),
  (9,1,1,5,NULL,NULL);
`;

let nombreBD;
let analitica;
let tools;
let pool;

before(async () => {
  if (!hayBD) return;
  nombreBD = await prepararBDPrueba(FIXTURES);
  analitica = await import('../src/db/analitica.js');
  tools = await import('../src/agent/tools.js');
  ({ pool } = await import('../src/db/pool.js'));
});

after(async () => {
  if (!hayBD) return;
  await pool.end();
  await borrarBDPrueba(nombreBD);
});

const saltar = { skip: hayBD ? false : 'sin credenciales de BD (usa npm run test:db)' };

test('ranking 2026: solo M2, sin anuladas ni internos, por fecha de emisión; cuenta OPs y proyectos', saltar, async () => {
  const r = await analitica.rankingClientesPorM2({ anio: 2026 });
  assert.deepEqual(r.ranking.map((f) => [f.cliente, f.m2_total, f.num_ops, f.num_proyectos]), [
    ['CONSTRUCTORA A', 130, 2, 2], // 100 + 30 (los 50 ML no cuentan; los 70 de 2025 tampoco)
    ['CONSTRUCTORA B', 120, 1, 1], // la OP cancelada (500) queda fuera
    ['ESTUDIO C', 40, 1, 1],
    ['SIN TIPO', 10, 1, 1], // la OP con fecha 1900 queda fuera del año
  ]);
  assert.equal(r.m2_total_general, 300);
  assert.ok(!r.ranking.some((f) => f.cliente === 'MIRAGE'), 'el cliente interno no entra');
  assert.equal(r.ranking[0].tipo_cliente, 'constructora');
  assert.equal(r.ranking[3].tipo_cliente, 'sin tipo');
  assert.equal(r.clientes_sin_tipo_en_el_universo, 1);
  assert.match(r.criterio, /Solo líneas en M2/);
});

test('ranking: filtro por tipo, por año, límite y sin año', saltar, async () => {
  const c = await analitica.rankingClientesPorM2({ anio: 2026, clienteTipo: 'constructora' });
  assert.deepEqual(c.ranking.map((f) => f.cliente), ['CONSTRUCTORA A', 'CONSTRUCTORA B']);
  assert.equal(c.clientes_sin_tipo_en_el_universo, undefined);
  assert.equal((await analitica.rankingClientesPorM2({ anio: 2026, limite: 1 })).ranking.length, 1);
  assert.deepEqual((await analitica.rankingClientesPorM2({ anio: 2025 })).ranking.map((f) => [f.cliente, f.m2_total]), [['CONSTRUCTORA A', 70]]);
  const todos = await analitica.rankingClientesPorM2({});
  assert.equal(todos.ranking.find((f) => f.cliente === 'CONSTRUCTORA A').m2_total, 200);
  assert.equal((await analitica.rankingClientesPorM2({ anio: 2026, clienteTipo: 'distribuidor' })).ranking.length, 0);
});

test('OPs con fecha inválida se avisan y quedan fuera de los filtros por fecha', saltar, async () => {
  const sinFiltro = await analitica.rankingClientesPorM2({});
  assert.equal(sinFiltro.ranking.find((f) => f.cliente === 'SIN TIPO').m2_total, 15); // 10 + 5 de la fecha 1900
  assert.match(sinFiltro.advertencias[0], /T-009/);
});

test('volumen por mes, tipo de cliente y proveedor (m²)', saltar, async () => {
  const mes = await analitica.volumenTotalVendido({ agruparPor: 'mes', fechaInicio: '2026-01-01', fechaFin: '2026-12-31' });
  assert.deepEqual(mes.resultados.map((f) => [f.grupo, f.valor]), [['2026-02', 100], ['2026-03', 120], ['2026-05', 30], ['2026-06', 40], ['2026-07', 10]]);
  assert.equal(mes.total_general, 300);
  const tipo = await analitica.volumenTotalVendido({ agruparPor: 'tipo_cliente', fechaInicio: '2026-01-01', fechaFin: '2026-12-31' });
  assert.deepEqual(tipo.resultados.map((f) => [f.grupo, f.valor]), [['constructora', 250], ['arquitecto', 40], ['sin tipo', 10]]);
  const prov = await analitica.volumenTotalVendido({ agruparPor: 'proveedor', fechaInicio: '2026-01-01', fechaFin: '2026-12-31' });
  assert.deepEqual(prov.resultados.map((f) => [f.grupo, f.valor]), [['MIRAGE', 270], ['HARMONY', 30]]); // ' m2 ' (con espacios) cuenta como M2
});

test('volumen por importe: cada moneda por separado, todas las unidades, líneas sin precio contadas aparte', saltar, async () => {
  const r = await analitica.volumenTotalVendido({ agruparPor: 'cliente', metrica: 'importe', fechaInicio: '2026-01-01', fechaFin: '2026-12-31' });
  const por = Object.fromEntries(r.por_moneda.map((m) => [m.moneda, m]));
  assert.deepEqual(Object.keys(por).sort(), ['EUR', 'USD']);
  assert.equal(por.USD.total_general, 2400); // 1000 + 200 (ML sí cuenta en importe) + 1200; sin cancelada ni interno
  assert.equal(por.EUR.total_general, 300);
  assert.equal(r.lineas_sin_precio_excluidas, 2); // ESTUDIO C y SIN TIPO (la de 1900 queda fuera del rango)
});

test('el agente y el panel dan el mismo resultado (una sola implementación)', saltar, async () => {
  const deTool = await tools.ejecutarTool('ranking_clientes_por_m2', { anio: 2026 }, { rol: 'operador' });
  const directo = await analitica.rankingClientesPorM2({ anio: 2026 });
  assert.deepEqual(deTool.ranking, directo.ranking);
  const sinPermiso = await tools.ejecutarTool('volumen_total_vendido', { agrupado_por: 'cliente', metrica: 'importe' }, { rol: 'operador' });
  assert.equal(sinPermiso.error, 'sin_permiso');
});
