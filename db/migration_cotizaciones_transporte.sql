-- Agrega cotizaciones.transporte (cargo de transporte que algunas cotizaciones traen entre el SUBTOTAL y el VALOR TOTAL).
-- Seguro de correr más de una vez: el cambio solo se aplica si todavía no existe.
-- Producción: correr en phpMyAdmin ANTES de reiniciar la app (la BD de Plesk no es accesible desde desarrollo).
-- Local: node scripts/aplicar_sql.mjs db/migration_cotizaciones_transporte.sql

SET NAMES utf8mb4;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'transporte'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE cotizaciones ADD COLUMN transporte DECIMAL(14,2) NULL AFTER impuesto',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
