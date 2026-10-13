-- Agrega op_items.formato: el formato de cada línea de OP. Antes solo existía productos.formato, que conserva
-- el primer formato visto para un código y por eso podía no ser el de la línea (ej. GLOCAL-GC 07 en 4 formatos).
-- Seguro de correr más de una vez. Las líneas ya cargadas se completan con "Cotizaciones y productos por OP"
-- (Configuración), que lee el formato de cada OP-XXXX.xlsx.

SET NAMES utf8mb4;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'formato'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE op_items ADD COLUMN formato VARCHAR(100) NULL AFTER acabado',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
