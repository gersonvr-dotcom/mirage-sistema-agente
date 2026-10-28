-- Agrega ops.fabrica: la "Fábrica" del encabezado del OP-XXXX.xlsx. Sirve de respaldo para asignar el proveedor de las
-- líneas que la cotización no trae con FÁBRICA. Seguro de correr más de una vez. Se completa con
-- "Cotizaciones y productos por OP" (Configuración).

SET NAMES utf8mb4;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ops' AND COLUMN_NAME = 'fabrica'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ops ADD COLUMN fabrica VARCHAR(150) NULL AFTER descripcion_pedido',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
