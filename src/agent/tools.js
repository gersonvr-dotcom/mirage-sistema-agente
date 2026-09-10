import { buscarPorOP, buscarPorCliente, buscarPorProducto, materialPendiente, estadoProyecto } from '../db/queries.js';

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
    default:
      throw new Error(`Tool desconocida: ${name}`);
  }
}
