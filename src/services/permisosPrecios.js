/** Decisión de producto (Q3 del roadmap): solo el administrador ve precios, costos y montos. */
export const puedeVerPrecios = (ctx) => ctx?.rol === 'administrador';

export const CAMPOS_PRECIO = ['precio_unitario', 'moneda', 'descuento_pct', 'importe_total', 'costo_unitario', 'costo_moneda'];

export function sinCamposDePrecio(filas) {
  return filas.map((fila) => {
    const limpia = { ...fila };
    for (const campo of CAMPOS_PRECIO) delete limpia[campo];
    return limpia;
  });
}

/** Devuelve la OP tal cual para el administrador y sin los campos de precio de sus líneas para los demás roles. */
export function opSegunRol(op, rol) {
  if (!op || puedeVerPrecios({ rol })) return op;
  return { ...op, items: sinCamposDePrecio(op.items ?? []) };
}
