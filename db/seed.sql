-- Datos de ejemplo para probar el agente localmente.
-- Incluye un caso de atraso real (item de OP-4521) para probar la detección de pendientes/atrasos.

-- Usuario de prueba para el login: admin@mirage.com / Mirage2026!
INSERT INTO usuarios (id, email, password_hash, nombre, rol) VALUES
  (1, 'admin@mirage.com', '$2b$10$LqjvdwBS5TGWJtB2OJizouKygE2B2GmFPz1yt9G.HHXtpyI3j60pq', 'Administrador Mirage', 'administrador');

INSERT INTO clientes (id, nombre, ruc_nit, contacto, email, telefono) VALUES
  (1, 'Constructora Andina S.A.', '20100200301', 'Marcela Ríos', 'compras@andina.com', '+51 999 111 222'),
  (2, 'Grupo Metalúrgico Norte', '20100455621', 'Jorge Salas', 'proyectos@metalnorte.com', '+51 999 333 444');

INSERT INTO proveedores (id, nombre, contacto, email, telefono) VALUES
  (1, 'Aceros del Pacífico', 'Luis Vera', 'ventas@acerospacifico.com', '+51 998 111 000'),
  (2, 'Importadora Continental', 'Diana Cabrera', 'comercial@continental-imp.com', '+51 998 222 333');

INSERT INTO proyectos (id, cliente_id, nombre, descripcion, estado) VALUES
  (1, 1, 'Torre Mirage - Fase 2', 'Suministro de tubería y válvulas para instalaciones del edificio.', 'activo'),
  (2, 2, 'Planta Norte Ampliación', 'Ampliación de línea de producción con estructura de acero.', 'activo');

INSERT INTO productos (id, codigo, nombre, formato, unidad_medida) VALUES
  (1, 'TUB-100', 'Tubería galvanizada 4in', 'Barra 6m', 'unidad'),
  (2, 'VLV-220', 'Válvula de bola 2in bridada', 'Bridada', 'unidad'),
  (3, 'PLC-500', 'Placa de acero A36', '1.2 x 2.4 m', 'unidad');

INSERT INTO cotizaciones (id, numero_cotizacion, proyecto_id, cliente_id, fecha, estado, total) VALUES
  (1, 'COT-2026-014', 1, 1, '2026-07-10', 'aprobada', 45000.00);

INSERT INTO pedidos (id, numero_pedido, cotizacion_id, proyecto_id, cliente_id, fecha, estado) VALUES
  (1, 'PED-2026-021', 1, 1, 1, '2026-07-15', 'en_proceso'),
  (2, 'PED-2026-030', NULL, 2, 2, '2026-08-01', 'abierto');

INSERT INTO ops (id, numero_op, pedido_id, proyecto_id, cliente_id, fecha_emision, estado_general) VALUES
  (1, 'OP-4521', 1, 1, 1, '2026-07-20', 'en_transito'),
  (2, 'OP-4560', 2, 2, 2, '2026-08-05', 'abierta');

INSERT INTO op_items (id, op_id, producto_id, proveedor_id, cantidad, fecha_estimada_entrega, estado) VALUES
  (1, 1, 1, 1, 500,  '2026-08-25', 'en_bodega'),
  (2, 1, 2, 2, 80,   '2026-08-30', 'en_aduana'),
  (3, 1, 3, 1, 120,  '2026-09-15', 'en_produccion'),
  (4, 2, 1, 1, 200,  '2026-09-20', 'pendiente');

INSERT INTO seguimiento_etapas (op_item_id, etapa, fecha_evento, nota) VALUES
  (1, 'produccion', '2026-07-25', 'Inicio de producción en planta del proveedor.'),
  (1, 'embarque',   '2026-08-05', 'Embarcado desde puerto de origen.'),
  (1, 'aduana',     '2026-08-15', 'Liberado de aduana sin observaciones.'),
  (1, 'bodega',     '2026-08-24', 'Ingresado a bodega central.'),

  (2, 'produccion', '2026-07-28', 'Producción completada.'),
  (2, 'embarque',   '2026-08-10', 'Embarcado desde puerto de origen.'),
  (2, 'aduana',     '2026-08-20', 'En proceso de nacionalización, pendiente de documentación adicional.'),

  (3, 'produccion', '2026-08-20', 'En planta de producción, sin novedades.');
