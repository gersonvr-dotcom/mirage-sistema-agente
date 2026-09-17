import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';

export function OPForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const proyectoPreseleccionado = searchParams.get('proyecto_id') || '';
  const [proyectos, setProyectos] = useState([]);
  const [form, setForm] = useState({ numero_op: '', proyecto_id: proyectoPreseleccionado, fecha_emision: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.proyectos().then(({ proyectos }) => setProyectos(proyectos)).catch((err) => setError(err.message));
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { op } = await api.crearOP(form);
      navigate(`/ops/${op.id}`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <h1>Nueva OP</h1>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Número de OP
          <input
            value={form.numero_op}
            onChange={(e) => update('numero_op', e.target.value)}
            placeholder="OP-4600"
            required
          />
        </label>
        <label>
          Proyecto
          <select value={form.proyecto_id} onChange={(e) => update('proyecto_id', e.target.value)} required>
            <option value="" disabled>
              Selecciona un proyecto
            </option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} — {p.cliente}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fecha de emisión
          <input
            type="date"
            value={form.fecha_emision}
            onChange={(e) => update('fecha_emision', e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Creando…' : 'Crear OP'}
          </button>
          <button
            type="button"
            onClick={() => navigate(proyectoPreseleccionado ? `/proyectos/${proyectoPreseleccionado}` : '/ops')}
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
