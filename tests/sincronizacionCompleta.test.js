import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import {
  iniciarSincronizacionCompleta,
  estadoSincronizacionCompleta,
  esperarSincronizacionCompleta,
  reiniciarSincronizacionCompleta,
  resumirResultado,
} from '../src/services/sincronizacionCompleta.js';
import { crearSincronizacionCompletaRouter } from '../src/routes/sincronizacionCompleta.js';

// El secreto del JWT se lee al importar el módulo: se fija antes y se importa después.
process.env.JWT_SECRET = 'secreto-de-prueba';
const { signUserToken, COOKIE_NAME } = await import('../src/auth/jwt.js');
const { accesoAdminOToken, tokenValido } = await import('../src/middleware/accesoAdminOToken.js');

const silencio = () => {};
const TOKEN = 'token-de-prueba-con-largo-suficiente-123';

beforeEach(() => reiniciarSincronizacionCompleta());

test('resumirResultado deja los contadores, el tamaño de las listas y los primeros errores', () => {
  const r = resumirResultado({
    filas: 10,
    texto: 'ignorado',
    advertencias: [1, 2, 3],
    errores: ['a', { op: '2026-001', mensaje: 'x'.repeat(500) }, 'c', 'd', 'e', 'f', 'g'],
  });
  assert.equal(r.filas, 10);
  assert.equal(r.advertencias, 3);
  assert.equal(r.errores, 7);
  assert.equal(r.texto, undefined);
  assert.equal(r.primeros_errores.length, 5);
  assert.ok(r.primeros_errores[1].length <= 200);
  assert.deepEqual(resumirResultado(null), {});
});

test('corre los pasos en orden, uno tras otro, y termina completado', async () => {
  const orden = [];
  const paso = (clave, resultado) => ({
    clave,
    nombre: clave,
    ejecutar: async () => {
      orden.push(`${clave}:inicio`);
      await new Promise((r) => setTimeout(r, 5));
      orden.push(`${clave}:fin`);
      return resultado;
    },
  });
  const inicial = iniciarSincronizacionCompleta({ origen: 'programada', pasos: [paso('a', { n: 1 }), paso('b', { n: 2 })], log: silencio });
  assert.equal(inicial.estado, 'corriendo');
  assert.equal(inicial.origen, 'programada');
  await esperarSincronizacionCompleta();

  assert.deepEqual(orden, ['a:inicio', 'a:fin', 'b:inicio', 'b:fin']);
  const e = estadoSincronizacionCompleta();
  assert.equal(e.estado, 'completado');
  assert.equal(e.pasos_con_error, 0);
  assert.deepEqual(e.pasos.map((p) => [p.clave, p.estado, p.resumen.n]), [['a', 'completado', 1], ['b', 'completado', 2]]);
  assert.ok(e.terminadoEn);
});

test('un paso que falla no detiene los siguientes y queda anotado', async () => {
  const pasos = [
    { clave: 'a', nombre: 'A', ejecutar: async () => { throw new Error('SharePoint no responde'); } },
    { clave: 'b', nombre: 'B', ejecutar: async () => ({ n: 5 }) },
  ];
  iniciarSincronizacionCompleta({ pasos, log: silencio });
  await esperarSincronizacionCompleta();
  const e = estadoSincronizacionCompleta();
  assert.equal(e.estado, 'completado');
  assert.equal(e.pasos_con_error, 1);
  assert.equal(e.pasos[0].estado, 'error');
  assert.match(e.pasos[0].error, /SharePoint no responde/);
  assert.equal(e.pasos[1].estado, 'completado');
});

test('no lanza una segunda ejecución mientras hay una corriendo', async () => {
  let llamadas = 0;
  let liberar;
  const pasos = [{ clave: 'a', nombre: 'A', ejecutar: () => { llamadas++; return new Promise((r) => { liberar = r; }); } }];
  iniciarSincronizacionCompleta({ pasos, log: silencio });
  const segunda = iniciarSincronizacionCompleta({ pasos, log: silencio });
  assert.equal(segunda.estado, 'corriendo');
  assert.equal(llamadas, 1);
  liberar({});
  await esperarSincronizacionCompleta();
  assert.equal(estadoSincronizacionCompleta().estado, 'completado');
  // Terminada, sí se puede lanzar otra.
  iniciarSincronizacionCompleta({ pasos: [{ clave: 'a', nombre: 'A', ejecutar: async () => ({}) }], log: silencio });
  await esperarSincronizacionCompleta();
  assert.equal(estadoSincronizacionCompleta().pasos.length, 1);
});

test('tokenValido: igual y largo suficiente; rechaza vacío, corto, distinto o sin configurar', () => {
  assert.equal(tokenValido(TOKEN, TOKEN), true);
  assert.equal(tokenValido(TOKEN + 'x', TOKEN), false);
  assert.equal(tokenValido('otro-token-de-prueba-con-largo-suficiente', TOKEN), false);
  assert.equal(tokenValido('', ''), false);
  assert.equal(tokenValido('corto', 'corto'), false);
  assert.equal(tokenValido(TOKEN, undefined), false);
  assert.equal(tokenValido(undefined, TOKEN), false);
});

// --- Ruta completa con el middleware, sobre un servidor real en un puerto libre ---
let server;
let base;
const tokenDe = (rol) => signUserToken({ id: 1, email: 'x@x.com', rol, nombre: 'Prueba' });
const pasosFalsos = [
  { clave: 'a', nombre: 'A', ejecutar: async () => ({ n: 1 }) },
  { clave: 'b', nombre: 'B', ejecutar: async () => ({ n: 2 }) },
];

async function levantar() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/config/sincronizar-todo', accesoAdminOToken, crearSincronizacionCompletaRouter({ pasos: pasosFalsos, log: silencio }));
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api/config/sincronizar-todo`;
}

afterEach(async () => {
  if (server) await new Promise((r) => server.close(r));
  server = null;
  delete process.env.CRON_TOKEN;
});

test('HTTP: sin credenciales 401, operador 403, token inválido 401', async () => {
  process.env.CRON_TOKEN = TOKEN;
  await levantar();
  assert.equal((await fetch(base, { method: 'POST' })).status, 401);
  assert.equal((await fetch(`${base}/estado`)).status, 401);
  const operador = await fetch(base, { method: 'POST', headers: { Cookie: `${COOKIE_NAME}=${tokenDe('operador')}` } });
  assert.equal(operador.status, 403);
  const malo = await fetch(base, { method: 'POST', headers: { 'X-Cron-Token': 'incorrecto' } });
  assert.equal(malo.status, 401);
  assert.equal(estadoSincronizacionCompleta().estado, 'inactivo');
});

test('HTTP: si CRON_TOKEN no está configurado, el token no abre nada', async () => {
  delete process.env.CRON_TOKEN;
  await levantar();
  const r = await fetch(base, { method: 'POST', headers: { 'X-Cron-Token': 'cualquier-cosa-de-largo-suficiente-123' } });
  assert.equal(r.status, 401);
  assert.equal(estadoSincronizacionCompleta().estado, 'inactivo');
});

test('HTTP: token válido responde 202 y lanza la ejecución como programada', async () => {
  process.env.CRON_TOKEN = TOKEN;
  await levantar();
  const r = await fetch(base, { method: 'POST', headers: { 'X-Cron-Token': TOKEN } });
  assert.equal(r.status, 202);
  const cuerpo = await r.json();
  assert.equal(cuerpo.estado, 'corriendo');
  assert.equal(cuerpo.origen, 'programada');
  assert.equal(cuerpo.pasos.length, 2);
  await esperarSincronizacionCompleta();
  assert.equal(estadoSincronizacionCompleta().estado, 'completado');
});

test('HTTP: administrador con sesión puede lanzar y consultar', async () => {
  process.env.CRON_TOKEN = TOKEN;
  await levantar();
  const cookie = { Cookie: `${COOKIE_NAME}=${tokenDe('administrador')}` };
  const r = await fetch(base, { method: 'POST', headers: cookie });
  assert.equal(r.status, 202);
  assert.equal((await r.json()).origen, 'manual');
  await esperarSincronizacionCompleta();
  const e = await fetch(`${base}/estado`, { headers: cookie });
  assert.equal(e.status, 200);
  assert.equal((await e.json()).estado, 'completado');
});
