import { createHash, randomUUID } from 'crypto';
import { pool } from '../db/pool.js';

// PIs cargadas a mano desde el detalle de la OP. El PDF se guarda en la BD (documentos_op_archivos) y se indexa en
// documentos_op con origen 'manual'; así lo ven el listado, el agente y validar_pi_vs_op igual que uno de SharePoint.
// No se escribe nada en SharePoint (decisión Q7).
export const TAMANO_MAX_SUBIDA = 10 * 1024 * 1024;
export const CARPETA_MANUAL = 'Carga manual';

export class ErrorSubida extends Error {
  constructor(codigo, mensaje, status = 400) {
    super(mensaje);
    this.codigo = codigo;
    this.status = status;
  }
}

/** Nombre seguro para guardar: sin rutas ni caracteres de control, con extensión .pdf y a lo sumo 300 caracteres. */
export function nombreSeguro(nombre) {
  let n = String(nombre ?? '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim();
  n = n.replace(/\.pdf$/i, '').trim() || 'PI';
  return `${n.slice(0, 295)}.pdf`;
}

/** Comprueba que el cuerpo sea un PDF de tamaño razonable (por el contenido, no por lo que diga el nombre). */
export function validarPdfSubido(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ErrorSubida('sin_archivo', 'No se recibió ningún archivo.');
  if (buffer.length > TAMANO_MAX_SUBIDA) throw new ErrorSubida('muy_grande', `El PDF pesa más de ${TAMANO_MAX_SUBIDA / 1024 / 1024} MB.`, 413);
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new ErrorSubida('no_es_pdf', 'El archivo no es un PDF.', 415);
}

/** Guarda una PI subida a mano en la OP. Devuelve el documento ya indexado. */
export async function guardarPiManual({ opId, nombre, buffer, usuarioId }) {
  validarPdfSubido(buffer);
  const hash = createHash('sha256').update(buffer).digest('hex');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[op]] = await conn.query('SELECT id FROM ops WHERE id = ?', [opId]);
    if (!op) throw new ErrorSubida('op_inexistente', 'OP no encontrada.', 404);
    const [[repetido]] = await conn.query(
      `SELECT d.id, d.nombre_archivo FROM documentos_op d JOIN documentos_op_archivos a ON a.documento_id = d.id
        WHERE d.op_id = ? AND a.sha256 = ? LIMIT 1`,
      [opId, hash]
    );
    if (repetido) throw new ErrorSubida('duplicado', `Ese PDF ya está cargado en la OP como "${repetido.nombre_archivo}".`, 409);

    const nombreFinal = nombreSeguro(nombre);
    const [r] = await conn.query(
      `INSERT INTO documentos_op (op_id, tipo, origen, extension, nombre_archivo, carpeta, drive_id, item_id, tamano, modificado_en, etag)
       VALUES (?, 'pi', 'manual', 'pdf', ?, ?, 'manual', ?, ?, NOW(), ?)`,
      [opId, nombreFinal, CARPETA_MANUAL, randomUUID(), buffer.length, hash.slice(0, 32)]
    );
    await conn.query('INSERT INTO documentos_op_archivos (documento_id, sha256, contenido, subido_por) VALUES (?, ?, ?, ?)', [
      r.insertId, hash, buffer, usuarioId ?? null,
    ]);
    await conn.commit();
    return { id: r.insertId, tipo: 'pi', origen: 'manual', extension: 'pdf', nombre_archivo: nombreFinal, tamano: buffer.length };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

/** Contenido y nombre de un documento subido a mano, o null si no existe o no es manual. */
export async function obtenerArchivoManual(documentoId) {
  const [[fila]] = await pool.query(
    `SELECT d.nombre_archivo, a.contenido FROM documentos_op d JOIN documentos_op_archivos a ON a.documento_id = d.id
      WHERE d.id = ? AND d.origen = 'manual'`,
    [documentoId]
  );
  return fila ?? null;
}

/** Borra un documento subido a mano (nunca uno de SharePoint). Devuelve false si no existe o no es manual. */
export async function eliminarDocumentoManual(documentoId) {
  const [r] = await pool.query("DELETE FROM documentos_op WHERE id = ? AND origen = 'manual'", [documentoId]);
  return r.affectedRows > 0;
}
