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
  total               DECIMAL(14,2),
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  numero_op         VARCHAR(40) NOT NULL UNIQUE,
  pedido_id         INT UNSIGNED,
  proyecto_id       INT UNSIGNED NOT NULL,
  cliente_id        INT UNSIGNED NOT NULL,
  fecha_emision     DATE NOT NULL,
  estado_general    ENUM('abierta','en_produccion','en_transito','cerrada','cancelada') NOT NULL DEFAULT 'abierta',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Línea de OP: Producto -> Código -> Formato -> Cantidad -> Proveedor -> Fecha -> Estado
CREATE TABLE op_items (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  op_id                 INT UNSIGNED NOT NULL,
  producto_id           INT UNSIGNED NOT NULL,
  proveedor_id          INT UNSIGNED,
  cantidad              DECIMAL(14,2) NOT NULL,
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
