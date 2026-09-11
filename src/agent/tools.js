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
} from '../db/queries.js';

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
    description: 'Busca una Orden de Producción (OP) por su número y devuelve cliente, proyecto y cada línea (producto, código, formato, cantidad, proveedor, fecha estimada, estado).',
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
    name: 'crear_proyecto',
    description:
      'Crea un nuevo proyecto para un cliente. Acción sensible: la primera llamada debe ir con ' +
      '"confirmado": false (o sin el campo) para que el usuario confirme; solo se ejecuta de ' +
      'verdad cuando "confirmado" es true.',
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

export async function ejecutarTool(name, input) {
  switch (name) {
    case 'consultar_op':
      return buscarPorOP(input.numero_op);
    case 'consultar_cliente':
      return buscarPorCliente(input.nombre_cliente);
    case 'consultar_producto':
      return buscarPorProducto(input.producto);
    case 'material_pendiente':
      return materialPendiente({ cliente: input.cliente, proyecto: input.proyecto });
    case 'estado_proyecto':
      return estadoProyecto(input.proyecto);
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

async function crearProyectoPorNombre({ cliente, nombre, descripcion, confirmado }) {
  if (!confirmado) return { requiereConfirmacion: true, mensaje: MENSAJE_REQUIERE_CONFIRMACION };

  const clientes = await listarClientes({ q: cliente });
  const resuelto = await resolverUno(clientes, 'cliente', cliente);
  if (!resuelto.unico) return resuelto;

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
