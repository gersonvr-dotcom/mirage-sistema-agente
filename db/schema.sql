-- Esquema MariaDB — Inteligencia de OP / Cliente / Proyecto / Producto
-- Cadena modelada: Cotización -> Pedido -> OP -> Producción -> Embarque -> Aduana -> Bodega -> Entrega

SET NAMES utf8mb4;

CREATE TABLE clientes (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(150) NOT NULL,
  ruc_nit       VARCHAR(30),
  contacto      VARCHAR(150),
  email         VARCHAR(150),
  telefono      VARCHAR(50),
  -- Tipo de cliente para filtrar rankings; 'interno' = la propia empresa/mercadeo, se excluye de métricas de venta.
  tipo          ENUM('constructora','arquitecto','desarrollador','distribuidor','particular','interno') NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE usuarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nombre        VARCHAR(150) NOT NULL,
  rol           ENUM('administrador','operador') NOT NULL DEFAULT 'operador',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE proveedores (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(150) NOT NULL,
  contacto      VARCHAR(150),
  email         VARCHAR(150),
  telefono      VARCHAR(50),
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE proyectos (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id    INT UNSIGNED NOT NULL,
  nombre        VARCHAR(150) NOT NULL,
  descripcion   TEXT,
  estado        ENUM('activo','en_pausa','cerrado') NOT NULL DEFAULT 'activo',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Memoria de fusiones y equivalencias de nombre: "ALESTE 137 PERFIL" -> proyecto matriz "ALESTE 137".
-- Evita que la sincronización con el Excel Madre vuelva a crear proyectos huérfanos.
CREATE TABLE proyecto_alias (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id         INT UNSIGNED NOT NULL,
  alias_normalizado  VARCHAR(190) NOT NULL,
  proyecto_id        INT UNSIGNED NOT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_proyecto_alias (cliente_id, alias_normalizado),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE productos (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo        VARCHAR(60) NOT NULL UNIQUE,
  nombre        VARCHAR(200) NOT NULL,
  formato       VARCHAR(100),
  unidad_medida VARCHAR(30) DEFAULT 'unidad',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cotizaciones (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  numero_cotizacion   VARCHAR(40) NOT NULL UNIQUE,
  proyecto_id         INT UNSIGNED NOT NULL,
  cliente_id          INT UNSIGNED NOT NULL,
  fecha               DATE NOT NULL,
  estado              ENUM('borrador','enviada','aprobada','rechazada') NOT NULL DEFAULT 'borrador',
  -- `total` = VALOR TOTAL de la cotización (lo que paga el cliente: subtotal + impuesto).
  total               DECIMAL(14,2),
  moneda              CHAR(3) NULL,            -- ISO: USD, CRC, EUR ('DOLARES' en el XLSX = USD)
  gran_total          DECIMAL(14,2) NULL,      -- suma de líneas antes de descuento
  descuento_total     DECIMAL(14,2) NULL,      -- monto de descuento global (la plantilla lo da como monto)
  descuento_pct       DECIMAL(5,2) NULL,       -- descuento_total / gran_total * 100
  subtotal            DECIMAL(14,2) NULL,      -- gran_total - descuento_total
  impuesto            DECIMAL(14,2) NULL,      -- I.V.A (13% en las cotizaciones vistas; 0 si dice EXONERADO)
  transporte          DECIMAL(14,2) NULL,      -- cargo de transporte entre el SUBTOTAL y el VALOR TOTAL (algunas cotizaciones)
  anticipo_pct        DECIMAL(5,2) NULL,       -- ej. 50.00 (anticipo 50% / previo a entrega 50%)
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Líneas de una cotización (precio de VENTA al cliente). El importe de línea = precio_unitario x cantidad_final
-- (m2/pz finales tras redondear a cajas), no x la cantidad pedida.
CREATE TABLE cotizacion_items (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cotizacion_id     INT UNSIGNED NOT NULL,
  orden             INT UNSIGNED NOT NULL,
  area              VARCHAR(150) NULL,
  fabrica           VARCHAR(80) NULL,
  producto_id       INT UNSIGNED NULL,         -- NULL en ítems a medida (ej. sobres/muebles de baño)
  linea_catalogo    VARCHAR(150) NULL,
  cod_color         VARCHAR(80) NULL,
  acabado           VARCHAR(60) NULL,
  formato           VARCHAR(100) NULL,
  descripcion       VARCHAR(255) NULL,
  cantidad          DECIMAL(14,2) NULL,
  unidad_medida     VARCHAR(30) NULL,
  cantidad_final    DECIMAL(14,2) NULL,
  precio_unitario   DECIMAL(14,4) NULL,
  concepto_precio   VARCHAR(20) NOT NULL DEFAULT 'material',  -- 'material' | 'mano_obra' (columna "PRECIO MO")
  importe           DECIMAL(14,2) NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE,
  FOREIGN KEY (producto_id) REFERENCES productos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_cotizacion_items_cot ON cotizacion_items(cotizacion_id);

CREATE TABLE pedidos (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  numero_pedido     VARCHAR(40) NOT NULL UNIQUE,
  cotizacion_id     INT UNSIGNED,
  proyecto_id       INT UNSIGNED NOT NULL,
  cliente_id        INT UNSIGNED NOT NULL,
  fecha             DATE NOT NULL,
  estado            ENUM('abierto','en_proceso','cerrado','cancelado') NOT NULL DEFAULT 'abierto',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id),
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Orden de Producción: hub central de la cadena OP -> Cliente -> Proyecto
CREATE TABLE ops (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  numero_op               VARCHAR(40) NOT NULL UNIQUE,
  pedido_id               INT UNSIGNED,
  cotizacion_id           INT UNSIGNED,
  proyecto_id             INT UNSIGNED NOT NULL,   -- siempre la obra MATRIZ; los adicionales son OPs de la obra
  cliente_id              INT UNSIGNED NOT NULL,
  tipo_pedido             ENUM('principal','adicional','perfiles','otro') NOT NULL DEFAULT 'principal',
  descripcion_pedido      VARCHAR(150) NULL,       -- texto original de PROYECTO en el Excel (ej. 'ALESTE 137 PERFIL')
  fecha_emision           DATE NOT NULL,
  fecha_pactada           DATE,
  oc_cliente              VARCHAR(60),
  observaciones_comercial VARCHAR(500),
  estado_general          ENUM('abierta','en_produccion','en_transito','cerrada','cancelada') NOT NULL DEFAULT 'abierta',
  created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
  FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id),
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Línea de OP: Producto -> Código -> Formato -> Cantidad -> Proveedor -> Fecha -> Estado
CREATE TABLE op_items (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  op_id                 INT UNSIGNED NOT NULL,
  producto_id           INT UNSIGNED NOT NULL,
  proveedor_id          INT UNSIGNED,
  acabado               VARCHAR(60),
  formato               VARCHAR(100) NULL,        -- formato de ESTA línea; productos.formato solo guarda el primero visto
  cajas                 DECIMAL(10,2),
  m2_x_caja             DECIMAL(10,4),
  cantidad              DECIMAL(14,2) NOT NULL,
  notas                 VARCHAR(255),
  -- Precio de VENTA (copiado de la línea de cotización equivalente). importe_total = neto de IVA y con el descuento aplicado.
  precio_unitario       DECIMAL(14,4) NULL,
  moneda                CHAR(3) NULL,
  descuento_pct         DECIMAL(5,2) NULL,
  importe_total         DECIMAL(14,2) NULL,
  -- COSTO de fábrica (de la Proforma Invoice del proveedor); nunca se mezcla con el precio de venta.
  costo_unitario        DECIMAL(14,4) NULL,
  costo_moneda          CHAR(3) NULL,
  fecha_estimada_entrega DATE,
  estado                ENUM('pendiente','en_produccion','embarcado','en_aduana','en_bodega','entregado','cancelado') NOT NULL DEFAULT 'pendiente',
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (op_id) REFERENCES ops(id),
  FOREIGN KEY (producto_id) REFERENCES productos(id),
  FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Bitácora de etapas por línea de OP: permite reconstruir Producción -> Embarque -> Aduana -> Bodega -> Entrega
CREATE TABLE seguimiento_etapas (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  op_item_id    INT UNSIGNED NOT NULL,
  etapa         ENUM('produccion','embarque','aduana','bodega','entrega') NOT NULL,
  fecha_evento  DATE NOT NULL,
  nota          VARCHAR(255),
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (op_item_id) REFERENCES op_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Índice de los archivos de cada carpeta de OP en SharePoint (no guarda el contenido: solo nombre, tipo, enlace y
-- metadatos). `extraccion_json`/`extraido_en` son la caché de lo que el agente lea de un PDF (PI, cotización PDF);
-- se invalida sola cuando cambia el etag del archivo. La clave (drive_id, item_id) evita duplicados al re-sincronizar.
CREATE TABLE documentos_op (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  op_id           INT UNSIGNED NOT NULL,
  tipo            VARCHAR(20) NOT NULL,          -- cotizacion | op | pi | factura | nota_credito | boleta | pago | orden_compra | imagen | otro
  extension       VARCHAR(10) NOT NULL DEFAULT '',
  nombre_archivo  VARCHAR(300) NOT NULL,
  carpeta         VARCHAR(255) NOT NULL,         -- nombre de la carpeta de OP (hay números de OP con dos carpetas)
  subcarpeta      VARCHAR(255) NULL,
  drive_id        VARCHAR(150) NOT NULL,
  item_id         VARCHAR(100) NOT NULL,
  web_url         VARCHAR(1000) NULL,
  tamano          BIGINT UNSIGNED NULL,
  modificado_en   DATETIME NULL,
  etag            VARCHAR(100) NULL,
  extraido_en     DATETIME NULL,
  extraccion_json LONGTEXT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_documentos_op_item (drive_id, item_id),
  KEY idx_documentos_op_op (op_id, tipo),
  FOREIGN KEY (op_id) REFERENCES ops(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Memoria de conversación del agente: una conversación activa por usuario, con el historial
-- crudo del proveedor (Gemini o Claude) y el consumo acumulado de tokens.
CREATE TABLE conversaciones_agente (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT UNSIGNED NOT NULL UNIQUE,
  provider      VARCHAR(20) NOT NULL,
  historial     LONGTEXT,
  tokens_input  INT UNSIGNED NOT NULL DEFAULT 0,
  tokens_output INT UNSIGNED NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Auditoría: qué acción de escritura ejecutó el agente, quién la pidió y con qué datos.
CREATE TABLE agente_acciones (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id        INT UNSIGNED NOT NULL,
  conversacion_id   INT UNSIGNED,
  tool_name         VARCHAR(60) NOT NULL,
  input             JSON,
  resultado         JSON,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (conversacion_id) REFERENCES conversaciones_agente(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_op_items_op ON op_items(op_id);
CREATE INDEX idx_op_items_producto ON op_items(producto_id);
CREATE INDEX idx_ops_cliente ON ops(cliente_id);
CREATE INDEX idx_ops_proyecto ON ops(proyecto_id);
CREATE INDEX idx_seguimiento_item ON seguimiento_etapas(op_item_id);
CREATE INDEX idx_agente_acciones_fecha ON agente_acciones(created_at);
