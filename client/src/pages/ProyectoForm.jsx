import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';

const ESTADO_INICIAL = { cliente_id: '', nombre: '', descripcion: '', estado: 'activo' };

export function ProyectoForm() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navigate = useNavigate();

  const [clientes, setClientes] = useState([]);
  const [form, setForm] = useState(ESTADO_INICIAL);
  const [loading, setLoading] = useState(editando);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.clientes().then(({ clientes }) => setClientes(clientes)).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!editando) return;
    api
      .proyecto(id)
      .then(({ proyecto }) =>
        setForm({
          cliente_id: proyecto.cliente_id,
          nombre: proyecto.nombre,
          descripcion: proyecto.descripcion ?? '',
          estado: proyecto.estado,
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
        await api.actualizarProyecto(id, form);
      } else {
        await api.crearProyecto(form);
      }
      navigate('/proyectos');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p style={{ padding: 24 }}>Cargando…</p>;

  return (
    <div className="page">
      <h1>{editando ? 'Editar proyecto' : 'Nuevo proyecto'}</h1>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Cliente
          <select
            value={form.cliente_id}
            onChange={(e) => update('cliente_id', e.target.value)}
            required
          >
            <option value="" disabled>
              Selecciona un cliente
            </option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nombre
          <input value={form.nombre} onChange={(e) => update('nombre', e.target.value)} required />
        </label>
        <label>
          Descripción
          <textarea value={form.descripcion} onChange={(e) => update('descripcion', e.target.value)} />
        </label>
        {editando && (
          <label>
            Estado
            <select value={form.estado} onChange={(e) => update('estado', e.target.value)}>
              <option value="activo">Activo</option>
              <option value="en_pausa">En pausa</option>
              <option value="cerrado">Cerrado</option>
            </select>
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" onClick={() => navigate('/proyectos')}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
