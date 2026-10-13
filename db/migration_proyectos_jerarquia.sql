-- Jerarquía Cliente -> Proyecto matriz -> OPs
-- Agrega tipo_pedido/descripcion_pedido a `ops` y la tabla proyecto_alias.
-- Seguro de correr más de una vez: cada cambio solo se aplica si todavía no existe.
-- Producción: correr en phpMyAdmin ANTES de reiniciar la app (la BD de Plesk no es accesible desde desarrollo).
-- Local: node scripts/aplicar_sql.mjs db/<este archivo>

SET NAMES utf8mb4;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ops' AND COLUMN_NAME = 'tipo_pedido'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ops ADD COLUMN tipo_pedido ENUM(''principal'',''adicional'',''perfiles'',''otro'') NOT NULL DEFAULT ''principal'' AFTER cliente_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ops' AND COLUMN_NAME = 'descripcion_pedido'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ops ADD COLUMN descripcion_pedido VARCHAR(150) NULL AFTER tipo_pedido',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS proyecto_alias (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id         INT UNSIGNED NOT NULL,
  alias_normalizado  VARCHAR(190) NOT NULL,
  proyecto_id        INT UNSIGNED NOT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_proyecto_alias (cliente_id, alias_normalizado),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
