import fs from 'node:fs';
import mysql from 'mysql2/promise';

// BD desechable para pruebas que necesitan MariaDB: se crea `test_<DB_NAME>` desde db/schema.sql y se borra y recrea en
// cada corrida, así nunca toca los datos de desarrollo. Corre con `npm run test:db` (carga .env); sin credenciales en el
// entorno (como en `npm test`) las pruebas que la usan se saltan.
export const hayBD = Boolean(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);

const conexion = (database) =>
  mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    multipleStatements: true,
  });

/** Recrea la BD de prueba con el esquema actual y apunta DB_NAME hacia ella ANTES de importar src/db/pool.js. */
export async function prepararBDPrueba(fixturesSql) {
  const nombre = `test_${process.env.DB_NAME}`;
  if (!/^test_[A-Za-z0-9_]+$/.test(nombre)) throw new Error(`Nombre de BD de prueba no seguro: ${nombre}`);
  const admin = await conexion(undefined);
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${nombre}\``);
    await admin.query(`CREATE DATABASE \`${nombre}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.query(`USE \`${nombre}\``);
    await admin.query(fs.readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8'));
    if (fixturesSql) await admin.query(fixturesSql);
  } finally {
    await admin.end();
  }
  process.env.DB_NAME = nombre;
  return nombre;
}

export async function borrarBDPrueba(nombre) {
  if (!/^test_[A-Za-z0-9_]+$/.test(nombre)) return;
  const admin = await conexion(undefined);
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${nombre}\``);
  } finally {
    await admin.end();
  }
}
