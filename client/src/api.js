const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  if (!res.ok) {
    let detail = null;
    try {
      detail = await res.json();
    } catch {
      // el body no era JSON
    }
    const err = new Error(detail?.error || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),

  clientes: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v))
    ).toString();
    return request(`/clientes${qs ? `?${qs}` : ''}`);
  },
  cliente: (id) => request(`/clientes/${id}`),
  crearCliente: (data) => request('/clientes', { method: 'POST', body: JSON.stringify(data) }),
  actualizarCliente: (id, data) =>
    request(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  eliminarCliente: (id) => request(`/clientes/${id}`, { method: 'DELETE' }),

  usuarios: () => request('/usuarios'),
  crearUsuario: (data) => request('/usuarios', { method: 'POST', body: JSON.stringify(data) }),

  metricas: () => request('/dashboard'),
  rankingM2: (params = {}) => request(`/analitica/ranking-m2?${new URLSearchParams(params)}`),

  conversacionAgente: () => request('/agent/conversacion'),
  nuevaConversacionAgente: () => request('/agent/conversacion/nueva', { method: 'POST' }),
  auditoriaAgente: () => request('/agent/auditoria'),
  chatAgente: (message, provider) =>
    request('/agent/chat', { method: 'POST', body: JSON.stringify({ message, provider }) }),

  proyectos: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v))
    ).toString();
    return request(`/proyectos${qs ? `?${qs}` : ''}`);
  },
  proyecto: (id) => request(`/proyectos/${id}`),
  candidatosFusion: () => request('/proyectos/candidatos-fusion'),
  proyectosSimilares: (params) => request(`/proyectos/similares?${new URLSearchParams(params)}`),
  fusionarProyectos: (data) => request('/proyectos/fusionar', { method: 'POST', body: JSON.stringify(data) }),
  crearProyecto: (data) => request('/proyectos', { method: 'POST', body: JSON.stringify(data) }),
  actualizarProyecto: (id, data) =>
    request(`/proyectos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  eliminarProyecto: (id) => request(`/proyectos/${id}`, { method: 'DELETE' }),

  productos: () => request('/productos'),
  proveedores: () => request('/proveedores'),

  ops: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v))
    ).toString();
    return request(`/ops${qs ? `?${qs}` : ''}`);
  },
  op: (id) => request(`/ops/${id}`),
  crearOP: (data) => request('/ops', { method: 'POST', body: JSON.stringify(data) }),
  actualizarOP: (id, data) => request(`/ops/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  eliminarOP: (id) => request(`/ops/${id}`, { method: 'DELETE' }),

  crearOPItem: (opId, data) => request(`/ops/${opId}/items`, { method: 'POST', body: JSON.stringify(data) }),
  actualizarOPItem: (itemId, data) =>
    request(`/ops/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) }),
  eliminarOPItem: (itemId) => request(`/ops/items/${itemId}`, { method: 'DELETE' }),
  agregarEtapa: (itemId, data) =>
    request(`/ops/items/${itemId}/etapas`, { method: 'POST', body: JSON.stringify(data) }),

  sincronizarExcelMadre: () => request('/config/sincronizar-excel', { method: 'POST' }),
  sincronizarProductosOps: () => request('/config/sincronizar-productos', { method: 'POST' }),
  estadoSincronizacionProductos: () => request('/config/sincronizar-productos/estado'),
  documentosOP: (id) => request(`/ops/${id}/documentos`),
  sincronizarDocumentos: () => request('/config/sincronizar-documentos', { method: 'POST' }),
  estadoSincronizacionDocumentos: () => request('/config/sincronizar-documentos/estado'),
  sincronizarCotizaciones: () => request('/config/sincronizar-cotizaciones', { method: 'POST' }),
  estadoSincronizacionCotizaciones: () => request('/config/sincronizar-cotizaciones/estado'),
};
