// Debe coincidir con TIPOS_PEDIDO de src/db/pedidoTipos.js.
export const TIPOS_PEDIDO = [
  { valor: 'principal', etiqueta: 'Principal' },
  { valor: 'adicional', etiqueta: 'Adicional' },
  { valor: 'perfiles', etiqueta: 'Perfiles' },
  { valor: 'otro', etiqueta: 'Otro (stock, enchape…)' },
];

export const etiquetaTipoPedido = (valor) => TIPOS_PEDIDO.find((t) => t.valor === valor)?.etiqueta ?? valor ?? '—';
