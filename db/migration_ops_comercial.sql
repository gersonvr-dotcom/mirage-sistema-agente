-- Agrega a `ops` las columnas necesarias para los datos del Departamento Comercial
-- (EXCEL MADRE 2026.xlsm, columnas A-H). Correr esto ANTES de db/import_pedidos_2026.sql.
-- Seguro de correr mas de una vez: cada ALTER solo se aplica si la columna/FK no existe.

SET NAMES utf8mb4;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ops' AND COLUMN_NAME = 'cotizacion_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ops ADD COLUMN cotizacion_id INT UNSIGNED NULL AFTER pedido_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ops' AND COLUMN_NAME = 'fecha_pactada'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ops ADD COLUMN fecha_pactada DATE NULL AFTER fecha_emision',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ops' AND COLUMN_NAME = 'oc_cliente'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ops ADD COLUMN oc_cliente VARCHAR(60) NULL AFTER fecha_pactada',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ops' AND COLUMN_NAME = 'observaciones_comercial'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ops ADD COLUMN observaciones_comercial VARCHAR(500) NULL AFTER oc_cliente',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ops' AND COLUMN_NAME = 'cotizacion_id'
    AND REFERENCED_TABLE_NAME = 'cotizaciones'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE ops ADD FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
