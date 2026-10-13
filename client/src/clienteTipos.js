// Debe coincidir con TIPOS_CLIENTE de src/db/clienteTipos.js.
export const TIPOS_CLIENTE = [
  { valor: 'constructora', etiqueta: 'Constructora' },
  { valor: 'arquitecto', etiqueta: 'Arquitecto / diseñador' },
  { valor: 'desarrollador', etiqueta: 'Desarrollador' },
  { valor: 'distribuidor', etiqueta: 'Distribuidor' },
  { valor: 'particular', etiqueta: 'Particular' },
  { valor: 'interno', etiqueta: 'Interno' },
];

export const etiquetaTipoCliente = (valor) => TIPOS_CLIENTE.find((t) => t.valor === valor)?.etiqueta ?? '—';
