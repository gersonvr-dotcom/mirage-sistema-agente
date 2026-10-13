// Aplica un archivo .sql (como db/migration_*.sql) a la BD configurada en .env.
// Sirve para probar en local el MISMO archivo que se correrá en phpMyAdmin en producción.
// Uso: node scripts/aplicar_sql.mjs db/migration_financiero.sql
import 'dotenv/config';
import fs from 'node:fs';
import mysql from 'mysql2/promise';

const archivo = process.argv[2];
if (!archivo) {
  console.error('Uso: node scripts/aplicar_sql.mjs <archivo.sql>');
  process.exit(1);
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: 'utf8mb4',
  multipleStatements: true,
});

try {
  await conn.query(fs.readFileSync(archivo, 'utf8'));
  console.log(`OK: ${archivo} aplicado a ${process.env.DB_NAME}`);
} catch (err) {
  console.error(`ERROR aplicando ${archivo}:`, err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
