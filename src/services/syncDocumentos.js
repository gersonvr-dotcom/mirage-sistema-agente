import { pool } from '../db/pool.js';
import { listarCarpetasOP } from './opFolders.js';
import { obtenerAccessToken, graphGet } from './sharepoint.js';
import { clasificarDocumento, extensionDe } from './clasificadorDocumentos.js';

const CONCURRENCIA = 4;
const SELECT_HIJOS = '$select=id,name,size,file,folder,lastModifiedDateTime,eTag,webUrl';
const OP_EN_SUBCARPETA_RE = /^OP[-\s]+\d{4}-\d+/i;

const corta = (texto, max) => (texto == null ? null : String(texto).slice(0, max));

async function listarHijos(driveId, itemId, token) {
  const hijos = [];
  let path = `/drives/${driveId}/items/${itemId}/children?$top=200&${SELECT_HIJOS}`;
  while (path) {
    const pagina = await graphGet(path, token);
    hijos.push(...pagina.value);
    path = pagina['@odata.nextLink']?.replace('https://graph.microsoft.com/v1.0', '') ?? null;
  }
  return hijos;
}

/**
 * Archivos de una carpeta de OP: los de la raíz y los de un nivel de subcarpetas con contenido. Se omiten las subcarpetas
 * vacías (en SharePoint son marcas de estado de cobro como "FACTURADO Y CANCELADO 100%") y las que son OTRAS OPs anidadas
 * (ej. OP-2026-310 dentro de OP-2026-006), que no pertenecen a esta.
 */
async function archivosDeCarpeta(carpeta, token, stats) {
  const archivos = [];
  const hijos = await listarHijos(carpeta.driveId, carpeta.id, token);
  for (const h of hijos) {
    if (h.file) {
      archivos.push({ ...h, subcarpeta: null });
    } else if (h.folder?.childCount > 0) {
      if (OP_EN_SUBCARPETA_RE.test(h.name)) {
        stats.subcarpetas_de_otra_op_omitidas++;
        continue;
      }
      for (const sub of await listarHijos(carpeta.driveId, h.id, token)) {
        if (sub.file) archivos.push({ ...sub, subcarpeta: h.name });
      }
    }
  }
  return archivos;
}

/**
 * Recorre las carpetas de OP en SharePoint SIN descargar nada y registra cada archivo en documentos_op con su tipo
 * (por nombre), enlace y etag. Idempotente: la clave es (drive_id, item_id); si un archivo cambia de etag se borra su
 * caché de extracción; los archivos que ya no están en SharePoint se quitan del índice.
 */
export async function sincronizarDocumentosDesdeCarpetas() {
  const carpetas = await listarCarpetasOP();
  const token = await obtenerAccessToken();
  const [ops] = await pool.query('SELECT id, numero_op FROM ops');
  const opPorNumero = new Map(ops.map((o) => [o.numero_op, o.id]));

  const stats = {
    carpetas_total: carpetas.length,
    carpetas_sin_op_en_la_base: 0,
    carpetas_procesadas: 0,
    documentos_nuevos: 0,
    documentos_actualizados: 0,
    documentos_sin_cambios: 0,
    documentos_eliminados_del_indice: 0,
    subcarpetas_de_otra_op_omitidas: 0,
    por_tipo: {},
    errores: [],
  };

  const procesar = async (carpeta) => {
    const opId = opPorNumero.get(carpeta.numeroOp);
    if (!opId) {
      stats.carpetas_sin_op_en_la_base++;
      return;
    }
    const archivos = await archivosDeCarpeta(carpeta, token, stats);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Lo que ya está indexado de esta carpeta, para contar nuevos/cambiados/sin cambios y no reescribir lo que no cambió.
      const [existentes] = await conn.query(
        'SELECT item_id, etag, tipo, nombre_archivo, subcarpeta FROM documentos_op WHERE op_id = ? AND carpeta = ?',
        [opId, carpeta.name]
      );
      const previo = new Map(existentes.map((e) => [e.item_id, e]));

      for (const a of archivos) {
        const tipo = clasificarDocumento(a.name, { subcarpeta: a.subcarpeta });
        stats.por_tipo[tipo] = (stats.por_tipo[tipo] ?? 0) + 1;

        const antes = previo.get(a.id);
        const igual =
          antes && antes.etag === corta(a.eTag, 100) && antes.tipo === tipo && antes.nombre_archivo === corta(a.name, 300) &&
          (antes.subcarpeta ?? null) === corta(a.subcarpeta, 255);
        if (igual) {
          stats.documentos_sin_cambios++;
          continue;
        }

        await conn.query(
          // extraccion_json/extraido_en van ANTES de etag: MySQL evalúa las asignaciones de izquierda a derecha y
          // así comparan contra el etag guardado, no contra el nuevo.
          `INSERT INTO documentos_op
             (op_id, tipo, extension, nombre_archivo, carpeta, subcarpeta, drive_id, item_id, web_url, tamano, modificado_en, etag)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             extraccion_json = IF(etag <=> VALUES(etag), extraccion_json, NULL),
             extraido_en     = IF(etag <=> VALUES(etag), extraido_en, NULL),
             op_id = VALUES(op_id), tipo = VALUES(tipo), extension = VALUES(extension),
             nombre_archivo = VALUES(nombre_archivo), carpeta = VALUES(carpeta), subcarpeta = VALUES(subcarpeta),
             web_url = VALUES(web_url), tamano = VALUES(tamano), modificado_en = VALUES(modificado_en), etag = VALUES(etag)`,
          [
            opId, tipo, extensionDe(a.name), corta(a.name, 300), corta(carpeta.name, 255), corta(a.subcarpeta, 255),
            carpeta.driveId, a.id, corta(a.webUrl, 1000), a.size ?? null,
            a.lastModifiedDateTime ? a.lastModifiedDateTime.slice(0, 19).replace('T', ' ') : null,
            corta(a.eTag, 100),
          ]
        );
        if (antes) stats.documentos_actualizados++;
        else stats.documentos_nuevos++;
      }

      // Lo que ya no está en la carpeta (borrado o movido en SharePoint) sale del índice.
      const vigentes = archivos.map((a) => a.id);
      const [borrados] = vigentes.length
        ? await conn.query('DELETE FROM documentos_op WHERE op_id = ? AND carpeta = ? AND item_id NOT IN (?)', [opId, carpeta.name, vigentes])
        : await conn.query('DELETE FROM documentos_op WHERE op_id = ? AND carpeta = ?', [opId, carpeta.name]);
      stats.documentos_eliminados_del_indice += borrados.affectedRows;

      await conn.commit();
      stats.carpetas_procesadas++;
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  };

  // Pocas carpetas a la vez: acelera el listado sin exponerse a la limitación (429) de Graph.
  const cola = [...carpetas];
  await Promise.all(
    Array.from({ length: CONCURRENCIA }, async () => {
      while (cola.length) {
        const carpeta = cola.shift();
        try {
          await procesar(carpeta);
        } catch (err) {
          stats.errores.push({ carpeta: carpeta.name, mensaje: err.message });
        }
      }
    })
  );

  return stats;
}
