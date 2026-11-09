-- Solo lectura: indica qué migraciones de db/ ya están aplicadas en la BD donde se corra (phpMyAdmin en producción).
-- Cada fila es un objeto que crea una migración: aplicado = 1 si existe, 0 si falta. Una migración está completa si todas
-- sus filas valen 1; las que tengan algún 0 hay que correrlas, en el orden de abajo. Las migraciones son idempotentes:
-- correr de más no hace daño.
-- Sin fila propia: migration_proveedores_progress.sql (solo ajusta datos: unifica PROGRESS en PROGRESS PROFILE); córrela
-- siempre después de migration_ops_fabrica.sql. db/seed.sql y db/import_pedidos_2026.sql NO son migraciones de despliegue.

SELECT migracion, objeto, aplicado FROM (
  SELECT 0 AS orden, 'migration_ops_comercial.sql' AS migracion, 'ops.cotizacion_id' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ops' AND COLUMN_NAME = 'cotizacion_id') AS aplicado
UNION ALL
  SELECT 1 AS orden, 'migration_ops_comercial.sql' AS migracion, 'ops.fecha_pactada' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ops' AND COLUMN_NAME = 'fecha_pactada') AS aplicado
UNION ALL
  SELECT 2 AS orden, 'migration_ops_comercial.sql' AS migracion, 'ops.oc_cliente' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ops' AND COLUMN_NAME = 'oc_cliente') AS aplicado
UNION ALL
  SELECT 3 AS orden, 'migration_ops_comercial.sql' AS migracion, 'ops.observaciones_comercial' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ops' AND COLUMN_NAME = 'observaciones_comercial') AS aplicado
UNION ALL
  SELECT 4 AS orden, 'migration_op_items_detalle.sql' AS migracion, 'op_items.acabado' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'acabado') AS aplicado
UNION ALL
  SELECT 5 AS orden, 'migration_op_items_detalle.sql' AS migracion, 'op_items.cajas' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'cajas') AS aplicado
UNION ALL
  SELECT 6 AS orden, 'migration_op_items_detalle.sql' AS migracion, 'op_items.m2_x_caja' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'm2_x_caja') AS aplicado
UNION ALL
  SELECT 7 AS orden, 'migration_op_items_detalle.sql' AS migracion, 'op_items.notas' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'notas') AS aplicado
UNION ALL
  SELECT 8 AS orden, 'migration_proyectos_jerarquia.sql' AS migracion, 'ops.tipo_pedido' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ops' AND COLUMN_NAME = 'tipo_pedido') AS aplicado
UNION ALL
  SELECT 9 AS orden, 'migration_proyectos_jerarquia.sql' AS migracion, 'ops.descripcion_pedido' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ops' AND COLUMN_NAME = 'descripcion_pedido') AS aplicado
UNION ALL
  SELECT 10 AS orden, 'migration_proyectos_jerarquia.sql' AS migracion, 'tabla proyecto_alias' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proyecto_alias') AS aplicado
UNION ALL
  SELECT 11 AS orden, 'migration_financiero.sql' AS migracion, 'cotizaciones.moneda' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'moneda') AS aplicado
UNION ALL
  SELECT 12 AS orden, 'migration_financiero.sql' AS migracion, 'cotizaciones.gran_total' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'gran_total') AS aplicado
UNION ALL
  SELECT 13 AS orden, 'migration_financiero.sql' AS migracion, 'cotizaciones.descuento_total' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'descuento_total') AS aplicado
UNION ALL
  SELECT 14 AS orden, 'migration_financiero.sql' AS migracion, 'cotizaciones.descuento_pct' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'descuento_pct') AS aplicado
UNION ALL
  SELECT 15 AS orden, 'migration_financiero.sql' AS migracion, 'cotizaciones.subtotal' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'subtotal') AS aplicado
UNION ALL
  SELECT 16 AS orden, 'migration_financiero.sql' AS migracion, 'cotizaciones.impuesto' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'impuesto') AS aplicado
UNION ALL
  SELECT 17 AS orden, 'migration_financiero.sql' AS migracion, 'cotizaciones.anticipo_pct' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'anticipo_pct') AS aplicado
UNION ALL
  SELECT 18 AS orden, 'migration_financiero.sql' AS migracion, 'op_items.precio_unitario' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'precio_unitario') AS aplicado
UNION ALL
  SELECT 19 AS orden, 'migration_financiero.sql' AS migracion, 'op_items.moneda' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'moneda') AS aplicado
UNION ALL
  SELECT 20 AS orden, 'migration_financiero.sql' AS migracion, 'op_items.descuento_pct' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'descuento_pct') AS aplicado
UNION ALL
  SELECT 21 AS orden, 'migration_financiero.sql' AS migracion, 'op_items.importe_total' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'importe_total') AS aplicado
UNION ALL
  SELECT 22 AS orden, 'migration_financiero.sql' AS migracion, 'op_items.costo_unitario' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'costo_unitario') AS aplicado
UNION ALL
  SELECT 23 AS orden, 'migration_financiero.sql' AS migracion, 'op_items.costo_moneda' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'costo_moneda') AS aplicado
UNION ALL
  SELECT 24 AS orden, 'migration_financiero.sql' AS migracion, 'tabla cotizacion_items' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizacion_items') AS aplicado
UNION ALL
  SELECT 25 AS orden, 'migration_clientes_tipo.sql' AS migracion, 'clientes.tipo' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'tipo') AS aplicado
UNION ALL
  SELECT 26 AS orden, 'migration_cotizaciones_transporte.sql' AS migracion, 'cotizaciones.transporte' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'transporte') AS aplicado
UNION ALL
  SELECT 27 AS orden, 'migration_op_items_formato.sql' AS migracion, 'op_items.formato' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_items' AND COLUMN_NAME = 'formato') AS aplicado
UNION ALL
  SELECT 28 AS orden, 'migration_documentos_op.sql' AS migracion, 'tabla documentos_op' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documentos_op') AS aplicado
UNION ALL
  SELECT 29 AS orden, 'migration_ops_fabrica.sql' AS migracion, 'ops.fabrica' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ops' AND COLUMN_NAME = 'fabrica') AS aplicado
UNION ALL
  SELECT 30 AS orden, 'migration_documentos_manuales.sql' AS migracion, 'documentos_op.origen' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documentos_op' AND COLUMN_NAME = 'origen') AS aplicado
UNION ALL
  SELECT 31 AS orden, 'migration_documentos_manuales.sql' AS migracion, 'tabla documentos_op_archivos' AS objeto, (SELECT COUNT(*) > 0 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documentos_op_archivos') AS aplicado
) v ORDER BY orden;
