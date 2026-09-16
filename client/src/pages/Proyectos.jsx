import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';

export function Proyectos() {
  const [proyectos, setProyectos] = useState([]);
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
      const { proyectos } = await api.proyectos(filtros);
      setProyectos(proyectos);
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
      await api.eliminarProyecto(id);
      setConfirmandoId(null);
      cargar({ q, estado });
    } catch (err) {
      setConfirmandoId(null);
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h1>Proyectos</h1>

      <form onSubmit={handleSearch} className="filters">
        <input
          placeholder="Buscar por nombre o cliente…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="en_pausa">En pausa</option>
          <option value="cerrado">Cerrado</option>
        </select>
        <button type="submit">Filtrar</button>
        <Link to="/proyectos/nuevo" className="button-link">
          + Nuevo proyecto
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
              <th>Nombre</th>
              <th>Cliente</th>
              <th>Estado</th>
              <th>Creado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {proyectos.map((p) => (
              <tr key={p.id}>
                <td>{p.nombre}</td>
                <td>{p.cliente}</td>
                <td>
                  <span className={`badge badge-${p.estado}`}>{p.estado}</span>
                </td>
                <td>{new Date(p.created_at).toLocaleDateString()}</td>
                <td>
                  <Link to={`/proyectos/${p.id}`}>Editar</Link>{' '}
                  {esAdmin &&
                    (confirmandoId === p.id ? (
                      <>
                        <span>¿Seguro?</span>{' '}
                        <button onClick={() => handleDelete(p.id)}>Sí, eliminar</button>{' '}
                        <button type="button" onClick={() => setConfirmandoId(null)}>
                          No
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirmandoId(p.id)}>
                        Eliminar
                      </button>
                    ))}
                </td>
              </tr>
            ))}
            {proyectos.length === 0 && (
              <tr>
                <td colSpan={5}>No hay proyectos.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
