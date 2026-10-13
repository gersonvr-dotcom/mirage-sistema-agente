-- Modelo financiero: precios de venta, descuentos e importes
-- Columnas financieras en `cotizaciones` y `op_items`, y tabla cotizacion_items.
-- Seguro de correr más de una vez: cada cambio solo se aplica si todavía no existe.
-- Producción: correr en phpMyAdmin ANTES de reiniciar la app (la BD de Plesk no es accesible desde desarrollo).
-- Local: node scripts/aplicar_sql.mjs db/<este archivo>

SET NAMES utf8mb4;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'moneda'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE cotizaciones ADD COLUMN moneda CHAR(3) NULL AFTER total',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'gran_total'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE cotizaciones ADD COLUMN gran_total DECIMAL(14,2) NULL AFTER moneda',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'descuento_total'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE cotizaciones ADD COLUMN descuento_total DECIMAL(14,2) NULL AFTER gran_total',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'descuento_pct'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE cotizaciones ADD COLUMN descuento_pct DECIMAL(5,2) NULL AFTER descuento_total',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'subtotal'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE cotizaciones ADD COLUMN subtotal DECIMAL(14,2) NULL AFTER descuento_pct',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'impuesto'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE cotizaciones ADD COLUMN impuesto DECIMAL(14,2) NULL AFTER subtotal',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'anticipo_pct'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE cotizaciones ADD COLUMN anticipo_pct DECIMAL(5,2) NULL AFTER impuesto',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS cotizacion_items (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cotizacion_id     INT UNSIGNED NOT NULL,
  orden             INT UNSIGNED NOT NULL,
  area              VARCHAR(150) NULL,
  fabrica           VARCHAR(80) NULL,
  producto_id       INT UNSIGNED NULL,
  linea_catalogo    VARCHAR(150) NULL,
  cod_color         VARCHAR(80) NULL,
  acabado           VARCHAR(60) NULL,
  formato           VARCHAR(100) NULL,
  descripcion       VARCHAR(255) NULL,
  cantidad          DECIMAL(14,2) NULL,
  unidad_medida     VARCHAR(30) NULL,
  cantidad_final    DECIMAL(14,2) NULL,
  precio_unitario   DECIMAL(14,4) NULL,
  concepto_precio   VARCHAR(20) NOT NULL DEFAULT 'material',
  importe           DECIMAL(14,2) NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cotizacion_items_cot (cotizacion_id),
  FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE,
  FOREIGN KEY (producto_id) REFERENCES productos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'precio_unitario'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE op_items ADD COLUMN precio_unitario DECIMAL(14,4) NULL AFTER notas',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'moneda'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE op_items ADD COLUMN moneda CHAR(3) NULL AFTER precio_unitario',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'descuento_pct'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE op_items ADD COLUMN descuento_pct DECIMAL(5,2) NULL AFTER moneda',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'importe_total'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE op_items ADD COLUMN importe_total DECIMAL(14,2) NULL AFTER descuento_pct',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'costo_unitario'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE op_items ADD COLUMN costo_unitario DECIMAL(14,4) NULL AFTER importe_total',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'costo_moneda'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE op_items ADD COLUMN costo_moneda CHAR(3) NULL AFTER costo_unitario',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
