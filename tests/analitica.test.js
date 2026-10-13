import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db/pool.js';
import { volumenTotalVendido, rankingClientesPorM2, AGRUPACIONES_VALIDAS } from '../src/db/analitica.js';
import { ejecutarTool } from '../src/agent/tools.js';

after(() => pool.end());

test('agrupado_por solo acepta la lista blanca: un intento de inyección se rechaza sin tocar la BD', async () => {
  for (const malo of ["cliente; DROP TABLE ops", 'c.nombre) UNION SELECT 1 --', '', undefined]) {
    const r = await volumenTotalVendido({ agruparPor: malo });
    assert.match(r.error, /agrupado_por no válido/);
  }
  assert.deepEqual(AGRUPACIONES_VALIDAS.sort(), ['cliente', 'formato', 'linea_catalogo', 'mes', 'proveedor', 'proyecto', 'tipo_cliente']);
});

test('valida métrica, fechas y rango antes de consultar', async () => {
  assert.match((await volumenTotalVendido({ agruparPor: 'mes', metrica: 'x' })).error, /metrica no válida/);
  assert.match((await volumenTotalVendido({ agruparPor: 'mes', fechaInicio: '2026-13-01' })).error, /AAAA-MM-DD/);
  assert.match((await volumenTotalVendido({ agruparPor: 'mes', fechaFin: '26/10/2026' })).error, /AAAA-MM-DD/);
  assert.match((await volumenTotalVendido({ agruparPor: 'mes', fechaInicio: '2026-12-01', fechaFin: '2026-01-01' })).error, /posterior/);
  assert.match((await rankingClientesPorM2({ anio: 'abc' })).error, /año/);
  assert.match((await rankingClientesPorM2({ clienteTipo: 'inventado' })).error, /Tipo de cliente/);
});

test('metrica importe es solo para administradores (se rechaza antes de consultar la BD)', async () => {
  const sinPermiso = await ejecutarTool('volumen_total_vendido', { agrupado_por: 'mes', metrica: 'importe' }, { rol: 'operador' });
  assert.equal(sinPermiso.error, 'sin_permiso');
  assert.equal((await ejecutarTool('volumen_total_vendido', { agrupado_por: 'mes', metrica: 'importe' })).error, 'sin_permiso');
});
