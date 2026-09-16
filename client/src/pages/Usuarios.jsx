import { useEffect, useState } from 'react';
import { api } from '../api';

const FORM_INICIAL = { email: '', password: '', nombre: '', rol: 'operador' };

export function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      const { usuarios } = await api.usuarios();
      setUsuarios(usuarios);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.crearUsuario(form);
      setForm(FORM_INICIAL);
      cargar();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <h1>Usuarios</h1>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Creado</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>{u.nombre}</td>
                <td>{u.email}</td>
                <td>
                  <span className={`badge badge-${u.rol}`}>{u.rol}</span>
                </td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <h2 style={{ marginTop: 32 }}>Nuevo usuario</h2>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Nombre
          <input value={form.nombre} onChange={(e) => update('nombre', e.target.value)} required />
        </label>
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            required
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            minLength={8}
            required
          />
        </label>
        <label>
          Rol
          <select value={form.rol} onChange={(e) => update('rol', e.target.value)}>
            <option value="operador">Operador</option>
            <option value="administrador">Administrador</option>
          </select>
        </label>
        {formError && <p className="error">{formError}</p>}
        <div className="form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </div>
  );
}
