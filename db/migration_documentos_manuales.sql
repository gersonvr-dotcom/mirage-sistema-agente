-- Permite cargar PIs a mano desde el detalle de la OP (R2-05): documentos_op.origen distingue los archivos indexados desde
-- SharePoint de los subidos por un administrador, cuyo contenido (PDF, máx. 10 MB) se guarda en documentos_op_archivos.
-- No se escribe nada en SharePoint. Seguro de correr más de una vez.

SET NAMES utf8mb4;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documentos_op' AND COLUMN_NAME = 'origen'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE documentos_op ADD COLUMN origen VARCHAR(12) NOT NULL DEFAULT ''sharepoint'' AFTER tipo',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS documentos_op_archivos (
  documento_id INT UNSIGNED NOT NULL PRIMARY KEY,
  sha256       CHAR(64) NOT NULL,
  contenido    LONGBLOB NOT NULL,
  subido_por   INT UNSIGNED NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_documentos_op_archivos_sha (sha256),
  FOREIGN KEY (documento_id) REFERENCES documentos_op(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
