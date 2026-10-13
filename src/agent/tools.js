import {
  buscarPorOP,
  buscarPorCliente,
  buscarPorProducto,
  materialPendiente,
  estadoProyecto,
  listarClientes,
  listarProyectos,
  crearProyecto,
  actualizarProyecto,
  eliminarProyecto,
  buscarCotizaciones,
  lineasCotizacion,
  historialPreciosProducto,
} from '../db/queries.js';
import { obtenerFilasComerciales } from '../services/sharepoint.js';
import { rankingClientesPorM2, volumenTotalVendido, AGRUPACIONES_VALIDAS, METRICAS_VALIDAS } from '../db/analitica.js';
import { TIPOS_CLIENTE } from '../db/clienteTipos.js';
import { buscarProyectosSimilares } from '../services/proyectosSimilares.js';
import { puedeVerPrecios, sinCamposDePrecio } from '../services/permisosPrecios.js';

export { puedeVerPrecios, sinCamposDePrecio };

const SIN_PERMISO_PRECIOS = {
  error: 'sin_permiso',
  mensaje: 'El usuario no tiene permiso para ver precios ni montos (solo el rol administrador). Díselo con claridad y no estimes ni inventes valores.',
};

const MENSAJE_REQUIERE_CONFIRMACION =
  'Esta acción modifica datos reales y requiere confirmación explícita del usuario. ' +
  'Explícale con claridad qué vas a hacer (qué se crea/edita/elimina y con qué datos) y ' +
  'vuelve a llamar a esta misma tool con "confirmado": true solo después de que el usuario ' +
  'confirme explícitamente en un mensaje posterior.';

/** Busca clientes o proyectos por nombre parcial; ayuda a las tools de escritura a resolver
 * a qué registro se refiere el usuario, y a detectar ambigüedad quiere decir cuando hay
 * más de una coincidencia. */
async function resolverUno(candidatos, tipo, nombreBuscado) {
  if (candidatos.length === 0) {
    return { error: `No se encontró ningún ${tipo} que coincida con "${nombreBuscado}".` };
  }
  if (candidatos.length > 1) {
    return {
      ambiguo: true,
      mensaje: `Hay ${candidatos.length} ${tipo}s que coinciden con "${nombreBuscado}". Pídele al usuario que aclare cuál, mostrándole esta lista.`,
      candidatos,
    };
  }
  return { unico: candidatos[0] };
}

export const TOOL_DEFINITIONS = [
  {
    name: 'consultar_op',
    description: 'Busca una Orden de Producción (OP) por su número y devuelve cliente, proyecto y cada línea de producto (código, línea de catálogo, formato, acabado, cajas, m2 por caja, cantidad total, unidad de medida, notas, proveedor, fecha estimada, estado).',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        numero_op: { type: 'string', description: 'Número de OP, por ejemplo "OP-4521".' },
      },
      required: ['numero_op'],
    },
  },
  {
    name: 'consultar_cliente',
    description: 'Busca las OPs abiertas de un cliente por nombre (coincidencia parcial).',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        nombre_cliente: { type: 'string', description: 'Nombre completo o parcial del cliente.' },
      },
      required: ['nombre_cliente'],
    },
  },
  {
    name: 'consultar_producto',
    description: 'Busca en qué OPs, para qué clientes y proyectos viene un material, por código o nombre.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        producto: { type: 'string', description: 'Código o nombre (parcial) del producto/material.' },
      },
      required: ['producto'],
    },
  },
  {
    name: 'material_pendiente',
    description: 'Calcula cuánto material está pendiente de recibir (no entregado ni en bodega), filtrando opcionalmente por cliente y/o proyecto.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        cliente: { type: 'string', description: 'Nombre parcial del cliente (opcional).' },
        proyecto: { type: 'string', description: 'Nombre parcial del proyecto (opcional).' },
      },
    },
  },
  {
    name: 'estado_proyecto',
    description: 'Reconstruye el estado completo de un proyecto: cotizaciones, pedidos, OPs y cada línea con su historial de etapas (producción, embarque, aduana, bodega, entrega), señalando ítems atrasados.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        proyecto: { type: 'string', description: 'Nombre parcial del proyecto.' },
      },
      required: ['proyecto'],
    },
  },
  {
    name: 'ranking_clientes_por_proyectos',
    description:
      'Devuelve los clientes con más proyectos registrados, ordenados de mayor a menor ' +
      'cantidad. Úsala para preguntas de "top N clientes" o "qué clientes tienen más ' +
      'proyectos", en vez de decir que no es posible calcularlo. Cada proyecto es una OBRA: los pedidos ' +
      'adicionales, de perfiles o de enchape de una misma obra cuentan dentro de ella y no como proyectos nuevos. ' +
      'Excluye clientes internos. Para ranking por metros cuadrados usa ranking_clientes_por_m2.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        limite: {
          type: 'integer',
          description: 'Cantidad de clientes a devolver (por defecto 5, máximo 50).',
        },
      },
    },
  },
  {
    name: 'consultar_pedidos_comercial',
    description:
      'Consulta en vivo el Excel maestro del Departamento Comercial en SharePoint ' +
      '("EXCEL MADRE 2026.xlsm", hoja "PEDIDOS 2026"): fecha de pedido, número de OP, ' +
      'cotización, OC del cliente, cliente, proyecto, fecha pactada y observaciones. ' +
      'Es la fuente de datos del equipo comercial y puede tener filas más nuevas que ' +
      'la base de datos del sistema. Filtra opcionalmente por texto (coincidencia parcial ' +
      'en OP, cotización, cliente o proyecto); sin filtro devuelve solo un conteo total.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        q: {
          type: 'string',
          description: 'Texto a buscar (parcial) en OP, cotización, cliente o proyecto.',
        },
      },
    },
  },
  {
    name: 'ranking_clientes_por_m2',
    description:
      'Ranking de clientes por metros cuadrados (m²) comprados, de mayor a menor. Úsala para preguntas como ' +
      '"¿qué constructora compró más m² en 2026?". Criterio: solo líneas en M2 (ML, piezas y mapas no se suman como m²), ' +
      'por fecha de emisión de la OP, incluye ventas de stock y excluye OPs anuladas y clientes internos. ' +
      'Devuelve m² totales, número de OPs y de proyectos (obras) por cliente. Menciona siempre el criterio en la respuesta. ' +
      'Si los clientes no tienen tipo asignado, el filtro por tipo devuelve vacío: dilo en vez de inventar.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        anio: { type: 'integer', description: 'Año de emisión de la OP, por ejemplo 2026. Sin él cuenta todos los años.' },
        cliente_tipo: { type: 'string', enum: TIPOS_CLIENTE, description: 'Opcional: limitar a un tipo de cliente.' },
        limite: { type: 'integer', description: 'Cuántos clientes devolver (por defecto 10, máximo 100).' },
      },
    },
  },
  {
    name: 'volumen_total_vendido',
    description:
      'Volumen vendido en un período, agrupado por cliente, proyecto, mes, línea de catálogo, formato, proveedor o tipo de cliente, ' +
      'en m² (metrica "m2", disponible para todos) o en importe (metrica "importe", SOLO ADMINISTRADORES; devuelve un bloque por moneda, ' +
      'neto de IVA y con descuento, y nunca mezcla monedas). Mismo criterio que ranking_clientes_por_m2. ' +
      'Devuelve las primeras filas (por defecto 20) más el total general; los meses van en orden cronológico. ' +
      'Respeta las advertencias del resultado (por ejemplo OPs con fecha inválida) y menciona el criterio.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        fecha_inicio: { type: 'string', description: 'Fecha de emisión mínima, AAAA-MM-DD.' },
        fecha_fin: { type: 'string', description: 'Fecha de emisión máxima, AAAA-MM-DD.' },
        agrupado_por: { type: 'string', enum: AGRUPACIONES_VALIDAS, description: 'Cómo agrupar el volumen.' },
        metrica: { type: 'string', enum: METRICAS_VALIDAS, description: '"m2" (por defecto) o "importe" (solo administradores).' },
        limite: { type: 'integer', description: 'Cuántos grupos devolver (por defecto 20, máximo 100).' },
      },
      required: ['agrupado_por'],
    },
  },
  {
    name: 'consultar_precios_cotizacion',
    description: 'SOLO ADMINISTRADORES. Devuelve precios de una cotización: totales (gran total antes de descuento, descuento, subtotal, transporte, IVA, valor total, moneda, anticipo) y cada línea con precio unitario e importe. Busca por número exacto de cotización (ej. "2026-045-AN") o por cliente y/o proyecto (coincidencia parcial). Si hay varias cotizaciones coincidentes devuelve solo un resumen para que el usuario elija una por número.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        numero_cotizacion: { type: 'string', description: 'Número exacto de cotización, por ejemplo "2026-045-AN".' },
        cliente: { type: 'string', description: 'Nombre completo o parcial del cliente.' },
        proyecto: { type: 'string', description: 'Nombre completo o parcial del proyecto.' },
      },
    },
  },
  {
    name: 'historial_precios_producto',
    description: 'SOLO ADMINISTRADORES. Precios de venta unitarios de un producto (línea de catálogo + código/color, ej. "PALMIRA PB 04") en las cotizaciones, de la más reciente a la más antigua, opcionalmente filtrado por cliente. Cada fila trae su moneda: nunca sumes ni compares montos de monedas distintas.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        producto: { type: 'string', description: 'Línea y/o código del producto, por ejemplo "PALMIRA PB 04" o "SX01".' },
        cliente: { type: 'string', description: 'Opcional: limitar a un cliente (nombre parcial).' },
      },
      required: ['producto'],
    },
  },
  {
    name: 'crear_proyecto',
    description:
      'Crea un nuevo proyecto (una OBRA) para un cliente. Los pedidos adicionales, de perfiles o de enchape de una obra ' +
      'ya existente NO son proyectos nuevos sino OPs de esa obra: antes de crear, la herramienta busca obras similares del ' +
      'cliente y, si las hay, devuelve "similares" sin crear nada para que le preguntes al usuario si es un adicional. ' +
      'Solo si el usuario insiste en un proyecto aparte llámala de nuevo con "crear_igualmente": true. ' +
      'Acción sensible: la primera llamada debe ir con "confirmado": false (o sin el campo) para que el usuario confirme; ' +
      'solo se ejecuta de verdad cuando "confirmado" es true.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        cliente: { type: 'string', description: 'Nombre (parcial) del cliente dueño del proyecto.' },
        nombre: { type: 'string', description: 'Nombre del nuevo proyecto.' },
        descripcion: { type: 'string', description: 'Descripción del proyecto (opcional).' },
        confirmado: {
          type: 'boolean',
          description: 'true solo si el usuario ya confirmó explícitamente que se cree el proyecto.',
        },
        crear_igualmente: {
          type: 'boolean',
          description: 'true solo si el usuario, informado de las obras similares, pidió explícitamente crear un proyecto aparte.',
        },
      },
      required: ['cliente', 'nombre'],
    },
  },
  {
    name: 'editar_proyecto',
    description:
      'Edita el nombre, descripción y/o estado de un proyecto existente. Acción sensible: ' +
      'requiere "confirmado": true después de que el usuario confirme.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        proyecto: { type: 'string', description: 'Nombre parcial del proyecto a editar.' },
        nombre_nuevo: { type: 'string', description: 'Nuevo nombre (opcional, deja igual si no se indica).' },
        descripcion_nueva: { type: 'string', description: 'Nueva descripción (opcional).' },
        estado_nuevo: {
          type: 'string',
          enum: ['activo', 'en_pausa', 'cerrado'],
          description: 'Nuevo estado (opcional).',
        },
        confirmado: {
          type: 'boolean',
          description: 'true solo si el usuario ya confirmó explícitamente el cambio.',
        },
      },
      required: ['proyecto'],
    },
  },
  {
    name: 'eliminar_proyecto',
    description:
      'Elimina un proyecto. Si tiene cotizaciones, pedidos u OPs asociadas no se puede borrar ' +
      'y conviene sugerir cambiar su estado a "cerrado" en su lugar (usar editar_proyecto). ' +
      'Acción sensible e irreversible: requiere "confirmado": true después de que el usuario confirme.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        proyecto: { type: 'string', description: 'Nombre parcial del proyecto a eliminar.' },
        confirmado: {
          type: 'boolean',
          description: 'true solo si el usuario ya confirmó explícitamente la eliminación.',
        },
      },
      required: ['proyecto'],
    },
  },
];

export async function ejecutarTool(name, input, ctx = {}) {
  switch (name) {
    case 'consultar_op': {
      const lineas = await buscarPorOP(input.numero_op);
      return puedeVerPrecios(ctx) ? lineas : sinCamposDePrecio(lineas);
    }
    case 'consultar_precios_cotizacion':
      return puedeVerPrecios(ctx) ? consultarPreciosCotizacion(input) : SIN_PERMISO_PRECIOS;
    case 'ranking_clientes_por_m2':
      return rankingClientesPorM2({ anio: input.anio, clienteTipo: input.cliente_tipo, limite: input.limite });
    case 'volumen_total_vendido':
      if (input.metrica === 'importe' && !puedeVerPrecios(ctx)) return SIN_PERMISO_PRECIOS;
      return volumenTotalVendido({
        fechaInicio: input.fecha_inicio,
        fechaFin: input.fecha_fin,
        agruparPor: input.agrupado_por,
        metrica: input.metrica,
        limite: input.limite,
      });
    case 'historial_precios_producto':
      return puedeVerPrecios(ctx) ? historialPreciosProducto(input) : SIN_PERMISO_PRECIOS;
    case 'consultar_cliente':
      return buscarPorCliente(input.nombre_cliente);
    case 'consultar_producto':
      return buscarPorProducto(input.producto);
    case 'material_pendiente':
      return materialPendiente({ cliente: input.cliente, proyecto: input.proyecto });
    case 'estado_proyecto':
      return estadoProyecto(input.proyecto);
    case 'ranking_clientes_por_proyectos':
      return rankingClientesPorProyectos(input.limite);
    case 'consultar_pedidos_comercial':
      return consultarPedidosComercial(input.q);
    case 'crear_proyecto':
      return crearProyectoPorNombre(input);
    case 'editar_proyecto':
      return editarProyectoPorNombre(input);
    case 'eliminar_proyecto':
      return eliminarProyectoPorNombre(input);
    default:
      throw new Error(`Tool desconocida: ${name}`);
  }
}

async function consultarPreciosCotizacion({ numero_cotizacion, cliente, proyecto }) {
  if (!numero_cotizacion && !cliente && !proyecto) {
    return { error: 'Indica el número de cotización, o el cliente y/o el proyecto.' };
  }
  const candidatas = await buscarCotizaciones({ numero: numero_cotizacion, cliente, proyecto });
  if (candidatas.length === 0) return { error: 'No se encontró ninguna cotización con esos datos.' };
  if (candidatas.length > 1) {
    return {
      ambiguo: true,
      mensaje: 'Hay varias cotizaciones coincidentes. Muéstrale este resumen al usuario y pídele el número de la que quiere ver.',
      cotizaciones: candidatas.map(({ id, ...resto }) => resto),
    };
  }
  const { id, ...cabecera } = candidatas[0];
  return { cotizacion: cabecera, lineas: await lineasCotizacion(id) };
}

async function rankingClientesPorProyectos(limite) {
  const clientes = await listarClientes({});
  const n = Math.min(Math.max(Number(limite) || 5, 1), 50);
  const ordenados = clientes
    .filter((c) => c.tipo !== 'interno')
    .sort((a, b) => b.num_proyectos - a.num_proyectos || a.nombre.localeCompare(b.nombre))
    .slice(0, n);
  return {
    ranking: ordenados.map((c) => ({ cliente: c.nombre, num_proyectos: c.num_proyectos })),
  };
}

const LIMITE_FILAS_COMERCIAL = 25;

async function consultarPedidosComercial(q) {
  const filas = await obtenerFilasComerciales();

  if (!q) {
    return {
      total_filas: filas.length,
      mensaje: `Hay ${filas.length} pedidos en el Excel comercial. Indica un término de búsqueda (OP, cotización, cliente o proyecto) para ver el detalle.`,
    };
  }

  const qLower = q.toLowerCase();
  const coincidencias = filas.filter((f) =>
    [f.op, f.cotizacion, f.cliente, f.proyecto].some((v) => v && v.toLowerCase().includes(qLower))
  );

  return {
    total_coincidencias: coincidencias.length,
    filas: coincidencias.slice(0, LIMITE_FILAS_COMERCIAL),
    truncado: coincidencias.length > LIMITE_FILAS_COMERCIAL,
  };
}

async function crearProyectoPorNombre({ cliente, nombre, descripcion, confirmado, crear_igualmente }) {
  // Resolver el cliente y buscar obras similares son lecturas: se hacen antes de pedir confirmación para no
  // pedirle al usuario que confirme la creación de un proyecto que en realidad es un adicional.
  const clientes = await listarClientes({ q: cliente });
  const resuelto = await resolverUno(clientes, 'cliente', cliente);
  if (!resuelto.unico) return resuelto;

  if (!crear_igualmente) {
    const { nombreBase, tipoPedido, similares } = await buscarProyectosSimilares({ clienteId: resuelto.unico.id, nombre });
    if (similares.length > 0) {
      return {
        similares,
        tipo_pedido_detectado: tipoPedido,
        obra_detectada: nombreBase,
        mensaje:
          `No se creó nada. El cliente "${resuelto.unico.nombre}" ya tiene ${similares.length === 1 ? 'una obra similar' : 'obras similares'} ` +
          `a "${nombre}": ${similares.map((p) => `"${p.nombre}" (${p.num_ops} OPs)`).join(', ')}. Un pedido adicional, de perfiles o ` +
          'de enchape es una OP de la obra existente, no un proyecto nuevo. Explícale esto al usuario y pregúntale si se trata de ' +
          'un adicional de esa obra (en ese caso no hay que crear ningún proyecto) o si de verdad quiere un proyecto aparte; ' +
          'solo en ese último caso vuelve a llamar con "crear_igualmente": true.',
      };
    }
  }

  if (!confirmado) return { requiereConfirmacion: true, mensaje: MENSAJE_REQUIERE_CONFIRMACION };

  const proyecto = await crearProyecto({ cliente_id: resuelto.unico.id, nombre, descripcion });
  return { creado: true, proyecto };
}

async function editarProyectoPorNombre({ proyecto, nombre_nuevo, descripcion_nueva, estado_nuevo, confirmado }) {
  if (!confirmado) return { requiereConfirmacion: true, mensaje: MENSAJE_REQUIERE_CONFIRMACION };

  const proyectos = await listarProyectos({ q: proyecto });
  const resuelto = await resolverUno(proyectos, 'proyecto', proyecto);
  if (!resuelto.unico) return resuelto;

  const actual = resuelto.unico;
  const actualizado = await actualizarProyecto(actual.id, {
    cliente_id: actual.cliente_id,
    nombre: nombre_nuevo || actual.nombre,
    descripcion: descripcion_nueva ?? actual.descripcion,
    estado: estado_nuevo || actual.estado,
  });
  return { editado: true, proyecto: actualizado };
}

async function eliminarProyectoPorNombre({ proyecto, confirmado }) {
  if (!confirmado) return { requiereConfirmacion: true, mensaje: MENSAJE_REQUIERE_CONFIRMACION };

  const proyectos = await listarProyectos({ q: proyecto });
  const resuelto = await resolverUno(proyectos, 'proyecto', proyecto);
  if (!resuelto.unico) return resuelto;

  try {
    await eliminarProyecto(resuelto.unico.id);
    return { eliminado: true, proyecto: resuelto.unico };
  } catch (err) {
    if (err.code === 'TIENE_DEPENDENCIAS') {
      return {
        error: err.message,
        sugerencia:
          'No se puede eliminar porque tiene cotizaciones, pedidos u OPs asociadas. ' +
          'Sugiérele al usuario cambiar el estado del proyecto a "cerrado" con editar_proyecto en su lugar.',
      };
    }
    throw err;
  }
}
