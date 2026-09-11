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
};
