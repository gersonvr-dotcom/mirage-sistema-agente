-- Crea documentos_op: índice de los archivos de cada carpeta de OP en SharePoint (tipo, nombre, enlace, etag y la caché
-- de extracción de PDFs). Seguro de correr más de una vez: solo crea la tabla si no existe. Se llena con el botón
-- "Documentos de las OPs" de Configuración.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS documentos_op (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  op_id           INT UNSIGNED NOT NULL,
  tipo            VARCHAR(20) NOT NULL,
  extension       VARCHAR(10) NOT NULL DEFAULT '',
  nombre_archivo  VARCHAR(300) NOT NULL,
  carpeta         VARCHAR(255) NOT NULL,
  subcarpeta      VARCHAR(255) NULL,
  drive_id        VARCHAR(150) NOT NULL,
  item_id         VARCHAR(100) NOT NULL,
  web_url         VARCHAR(1000) NULL,
  tamano          BIGINT UNSIGNED NULL,
  modificado_en   DATETIME NULL,
  etag            VARCHAR(100) NULL,
  extraido_en     DATETIME NULL,
  extraccion_json LONGTEXT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_documentos_op_item (drive_id, item_id),
  KEY idx_documentos_op_op (op_id, tipo),
  FOREIGN KEY (op_id) REFERENCES ops(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
