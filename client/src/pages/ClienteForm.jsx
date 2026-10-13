import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { TIPOS_CLIENTE } from '../clienteTipos';

const FORM_INICIAL = { nombre: '', ruc_nit: '', contacto: '', email: '', telefono: '', tipo: '' };

export function ClienteForm() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(FORM_INICIAL);
  const [loading, setLoading] = useState(editando);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!editando) return;
    api
      .cliente(id)
      .then(({ cliente }) =>
        setForm({
          nombre: cliente.nombre,
          ruc_nit: cliente.ruc_nit ?? '',
          contacto: cliente.contacto ?? '',
          email: cliente.email ?? '',
          telefono: cliente.telefono ?? '',
          tipo: cliente.tipo ?? '',
        })
      )
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, editando]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editando) {
        await api.actualizarCliente(id, form);
        navigate(`/clientes/${id}`);
      } else {
        await api.crearCliente(form);
        navigate('/clientes');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <h1>{editando ? 'Editar cliente' : 'Nuevo cliente'}</h1>
      {loading ? (
        <p>Cargando…</p>
      ) : (
        <form onSubmit={handleSubmit} className="form">
          <label>
            Nombre
            <input value={form.nombre} onChange={(e) => update('nombre', e.target.value)} required />
          </label>
          <label>
            Tipo de cliente
            <select value={form.tipo} onChange={(e) => update('tipo', e.target.value)}>
              <option value="">Sin clasificar</option>
              {TIPOS_CLIENTE.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label>
            RUC/NIT
            <input value={form.ruc_nit} onChange={(e) => update('ruc_nit', e.target.value)} />
          </label>
          <label>
            Contacto
            <input value={form.contacto} onChange={(e) => update('contacto', e.target.value)} />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </label>
          <label>
            Teléfono
            <input value={form.telefono} onChange={(e) => update('telefono', e.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" onClick={() => navigate(editando ? `/clientes/${id}` : '/clientes')}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
