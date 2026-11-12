-- Alias de clientes (R5-10): recuerda qué nombres de cliente se fusionaron en otro, para que el sync con el Excel Madre
-- no vuelva a crear el cliente duplicado. Solo crea una tabla; seguro de correr más de una vez.
-- Producción: correr en phpMyAdmin ANTES de reiniciar la app (la BD de Plesk no es accesible desde desarrollo).
-- Local: node scripts/aplicar_sql.mjs db/<este archivo>

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS cliente_alias (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  alias_normalizado  VARCHAR(190) NOT NULL,
  cliente_id         INT UNSIGNED NOT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cliente_alias (alias_normalizado),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
