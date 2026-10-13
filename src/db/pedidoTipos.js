// Valores permitidos de ops.tipo_pedido (ver db/migration_proyectos_jerarquia.sql). Un proyecto es una OBRA; sus
// pedidos adicionales, de perfiles o de enchape son OPs de la misma obra con otro tipo, no proyectos nuevos.
export const TIPOS_PEDIDO = ['principal', 'adicional', 'perfiles', 'otro'];
