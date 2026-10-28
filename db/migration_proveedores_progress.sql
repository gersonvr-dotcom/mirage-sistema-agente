-- PROGRESS y PROGRESS PROFILE son la misma fábrica: unifica en "PROGRESS PROFILE". Seguro de correr más de una vez.
-- Mueve las líneas de OP y el encabezado de las OPs al proveedor unificado y borra el duplicado cuando queda sin uso.

SET NAMES utf8mb4;

-- Si solo existe "PROGRESS", se renombra.
UPDATE proveedores SET nombre = 'PROGRESS PROFILE'
 WHERE UPPER(TRIM(nombre)) = 'PROGRESS'
   AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM proveedores WHERE UPPER(TRIM(nombre)) = 'PROGRESS PROFILE') t);

-- Si existen los dos, las líneas pasan al unificado y se elimina el duplicado.
UPDATE op_items oi
  JOIN proveedores a ON a.id = oi.proveedor_id AND UPPER(TRIM(a.nombre)) = 'PROGRESS'
  JOIN proveedores b ON UPPER(TRIM(b.nombre)) = 'PROGRESS PROFILE'
   SET oi.proveedor_id = b.id;

UPDATE ops SET fabrica = 'PROGRESS PROFILE' WHERE UPPER(TRIM(fabrica)) IN ('PROGRESS', 'PROGRESS PROFILES');

DELETE a FROM proveedores a
 WHERE UPPER(TRIM(a.nombre)) = 'PROGRESS'
   AND NOT EXISTS (SELECT 1 FROM op_items WHERE proveedor_id = a.id);
