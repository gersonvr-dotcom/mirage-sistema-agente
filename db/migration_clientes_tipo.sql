-- Tipo de cliente
-- Agrega clientes.tipo y marca como interno al cliente MIRAGE (material de mercadeo).
-- Seguro de correr más de una vez: cada cambio solo se aplica si todavía no existe.
-- Producción: correr en phpMyAdmin ANTES de reiniciar la app (la BD de Plesk no es accesible desde desarrollo).
-- Local: node scripts/aplicar_sql.mjs db/<este archivo>

SET NAMES utf8mb4;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'tipo'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE clientes ADD COLUMN tipo ENUM(''constructora'',''arquitecto'',''desarrollador'',''distribuidor'',''particular'',''interno'') NULL AFTER telefono',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE clientes SET tipo = 'interno' WHERE nombre = 'MIRAGE' AND tipo IS NULL;
