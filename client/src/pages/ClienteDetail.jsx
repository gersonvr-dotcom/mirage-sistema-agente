import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';

export function ClienteDetail() {
  const { id } = useParams();
  const [cliente, setCliente] = useState(null);
  const [proyectos, setProyectos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ cliente }, { proyectos }] = await Promise.all([
        api.cliente(id),
        api.proyectos({ cliente_id: id }),
      ]);
      setCliente(cliente);
      setProyectos(proyectos);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (loading) return <p style={{ padding: 24 }}>Cargando…</p>;
  if (!cliente) return <p style={{ padding: 24 }}>{error || 'Cliente no encontrado.'}</p>;

  return (
    <div className="page">
      <h1>{cliente.nombre}</h1>

      {error && <p className="error">{error}</p>}

      <div className="op-header-card">
        <div>
          <span className="stat-label">RUC/NIT</span>
          <p>{cliente.ruc_nit || '—'}</p>
        </div>
        <div>
          <span className="stat-label">Contacto</span>
          <p>{cliente.contacto || '—'}</p>
        </div>
        <div>
          <span className="stat-label">Email</span>
          <p>{cliente.email || '—'}</p>
        </div>
        <div>
          <span className="stat-label">Teléfono</span>
          <p>{cliente.telefono || '—'}</p>
        </div>
        <div className="op-header-actions">
          <Link to={`/clientes/${id}/editar`} className="btn-row-action">
            Editar cliente
          </Link>
        </div>
      </div>

      <h2>Proyectos</h2>
      <div className="filters">
        <Link to={`/proyectos/nuevo?cliente_id=${id}`} className="button-link">
          + Nuevo proyecto
        </Link>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Estado</th>
              <th>OPs</th>
              <th>Creado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {proyectos.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/proyectos/${p.id}`}>{p.nombre}</Link>
                </td>
                <td>
                  <span className={`badge badge-${p.estado}`}>{p.estado}</span>
                </td>
                <td>{p.num_ops}</td>
                <td>{new Date(p.created_at).toLocaleDateString()}</td>
                <td>
                  <div className="row-actions">
                    <Link to={`/proyectos/${p.id}`} className="btn-row-action">
                      Ver
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {proyectos.length === 0 && (
              <tr>
                <td colSpan={5}>Este cliente no tiene proyectos.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
