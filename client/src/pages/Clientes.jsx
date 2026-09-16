import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';

export function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmandoId, setConfirmandoId] = useState(null);
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'administrador';

  const cargar = useCallback(async (filtros) => {
    setLoading(true);
    setError(null);
    try {
      const { clientes } = await api.clientes(filtros);
      setClientes(clientes);
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
    cargar({ q });
  }

  async function handleDelete(id) {
    setError(null);
    try {
      await api.eliminarCliente(id);
      setConfirmandoId(null);
      cargar({ q });
    } catch (err) {
      setConfirmandoId(null);
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h1>Clientes</h1>

      <form onSubmit={handleSearch} className="filters">
        <input
          placeholder="Buscar por nombre…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit">Filtrar</button>
        <Link to="/clientes/nuevo" className="button-link">
          + Nuevo cliente
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
              <th>RUC/NIT</th>
              <th>Contacto</th>
              <th>Email</th>
              <th>Teléfono</th>
              <th>Proyectos</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <td>{c.nombre}</td>
                <td>{c.ruc_nit ?? '—'}</td>
                <td>{c.contacto ?? '—'}</td>
                <td>{c.email ?? '—'}</td>
                <td>{c.telefono ?? '—'}</td>
                <td>{c.num_proyectos}</td>
                <td>
                  <Link to={`/clientes/${c.id}`}>Editar</Link>{' '}
                  {esAdmin &&
                    (confirmandoId === c.id ? (
                      <>
                        <span>¿Seguro?</span>{' '}
                        <button onClick={() => handleDelete(c.id)}>Sí, eliminar</button>{' '}
                        <button type="button" onClick={() => setConfirmandoId(null)}>
                          No
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirmandoId(c.id)}>
                        Eliminar
                      </button>
                    ))}
                </td>
              </tr>
            ))}
            {clientes.length === 0 && (
              <tr>
                <td colSpan={7}>No hay clientes.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
