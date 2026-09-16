import 'dotenv/config';
import { pool } from '../src/db/pool.js';

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].c > 0;
}

async function main() {
  if (!(await columnExists('ops', 'cotizacion_id'))) {
    await pool.query(`ALTER TABLE ops ADD COLUMN cotizacion_id INT UNSIGNED NULL AFTER pedido_id`);
    console.log('added cotizacion_id');
  }
  if (!(await columnExists('ops', 'fecha_pactada'))) {
    await pool.query(`ALTER TABLE ops ADD COLUMN fecha_pactada DATE NULL AFTER fecha_emision`);
    console.log('added fecha_pactada');
  }
  if (!(await columnExists('ops', 'oc_cliente'))) {
    await pool.query(`ALTER TABLE ops ADD COLUMN oc_cliente VARCHAR(60) NULL AFTER fecha_pactada`);
    console.log('added oc_cliente');
  }
  if (!(await columnExists('ops', 'observaciones_comercial'))) {
    await pool.query(`ALTER TABLE ops ADD COLUMN observaciones_comercial VARCHAR(500) NULL AFTER oc_cliente`);
    console.log('added observaciones_comercial');
  }

  const [fks] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ops' AND COLUMN_NAME = 'cotizacion_id' AND REFERENCED_TABLE_NAME = 'cotizaciones'`
  );
  if (fks[0].c === 0) {
    await pool.query(`ALTER TABLE ops ADD FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id)`);
    console.log('added FK cotizacion_id -> cotizaciones(id)');
  }

  console.log('done');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
