-- Agrega a `op_items` las columnas de detalle que trae cada línea del Excel de la OP
-- (acabado, cajas, m2 por caja, notas). Seguro de correr más de una vez: cada ALTER solo se
-- aplica si la columna no existe todavía.

SET NAMES utf8mb4;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'acabado'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE op_items ADD COLUMN acabado VARCHAR(60) NULL AFTER proveedor_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'cajas'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE op_items ADD COLUMN cajas DECIMAL(10,2) NULL AFTER acabado',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'm2_x_caja'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE op_items ADD COLUMN m2_x_caja DECIMAL(10,4) NULL AFTER cajas',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'notas'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE op_items ADD COLUMN notas VARCHAR(255) NULL AFTER cantidad',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
