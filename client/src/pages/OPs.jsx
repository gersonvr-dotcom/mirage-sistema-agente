import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';

export function OPs() {
  const [ops, setOps] = useState([]);
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmandoId, setConfirmandoId] = useState(null);
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'administrador';

  const cargar = useCallback(async (filtros) => {
    setLoading(true);
    setError(null);
    try {
      const { ops } = await api.ops(filtros);
      setOps(ops);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar({});
  }, [cargar]);

  function handleSearch(e) {
    e.preventDefault();
    cargar({ q, estado });
  }

  async function handleDelete(id) {
    setError(null);
    try {
      await api.eliminarOP(id);
      setConfirmandoId(null);
      cargar({ q, estado });
    } catch (err) {
      setConfirmandoId(null);
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h1>Órdenes de producción</h1>

      <form onSubmit={handleSearch} className="filters">
        <input
          placeholder="Buscar por número, cliente o proyecto…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="abierta">Abierta</option>
          <option value="en_produccion">En producción</option>
          <option value="en_transito">En tránsito</option>
          <option value="cerrada">Cerrada</option>
          <option value="cancelada">Cancelada</option>
        </select>
        <button type="submit">Filtrar</button>
        <Link to="/ops/nueva" className="button-link">
          + Nueva OP
        </Link>
      </form>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Número</th>
              <th>Cliente</th>
              <th>Proyecto</th>
              <th>Líneas</th>
              <th>Estado</th>
              <th>Emisión</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ops.map((o) => (
              <tr key={o.id}>
                <td>{o.numero_op}</td>
                <td>{o.cliente}</td>
                <td>{o.proyecto}</td>
                <td>{o.num_items}</td>
                <td>
                  <span className={`badge badge-op-${o.estado_general}`}>{o.estado_general}</span>
                </td>
                <td>{new Date(o.fecha_emision).toLocaleDateString()}</td>
                <td>
                  <Link to={`/ops/${o.id}`}>Ver</Link>{' '}
                  {esAdmin &&
                    (confirmandoId === o.id ? (
                      <>
                        <span>¿Seguro?</span>{' '}
                        <button onClick={() => handleDelete(o.id)}>Sí, eliminar</button>{' '}
                        <button type="button" onClick={() => setConfirmandoId(null)}>
                          No
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirmandoId(o.id)}>
                        Eliminar
                      </button>
                    ))}
                </td>
              </tr>
            ))}
            {ops.length === 0 && (
              <tr>
                <td colSpan={7}>No hay OPs.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
