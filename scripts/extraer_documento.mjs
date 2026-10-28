// Lee una PI de documentos_op con el modelo y muestra el resultado y su validación (solo para pruebas manuales).
// Uso: node --env-file=.env scripts/extraer_documento.mjs <documento_id> [--forzar]
import { pool } from '../src/db/pool.js';
import { obtenerExtraccionDocumento } from '../src/services/pdfExtractor.js';

const id = Number(process.argv[2]);
if (!id) {
  console.error('Uso: node --env-file=.env scripts/extraer_documento.mjs <documento_id> [--forzar]');
  process.exit(1);
}
try {
  const r = await obtenerExtraccionDocumento(id, { forzar: process.argv.includes('--forzar') });
  console.log(JSON.stringify(r, null, 2));
} finally {
  await pool.end();
}
