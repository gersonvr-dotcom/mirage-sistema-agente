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

  clientes: () => request('/clientes'),

  usuarios: () => request('/usuarios'),
  crearUsuario: (data) => request('/usuarios', { method: 'POST', body: JSON.stringify(data) }),

  metricas: () => request('/dashboard'),

  conversacionAgente: () => request('/agent/conversacion'),
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
};
