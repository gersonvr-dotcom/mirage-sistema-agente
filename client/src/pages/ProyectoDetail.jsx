import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';

export function ProyectoDetail() {
  const { id } = useParams();
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'administrador';

  const [proyecto, setProyecto] = useState(null);
  const [ops, setOps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmandoId, setConfirmandoId] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ proyecto }, { ops }] = await Promise.all([
        api.proyecto(id),
        api.ops({ proyecto_id: id }),
      ]);
      setProyecto(proyecto);
      setOps(ops);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function handleDelete(opId) {
    setError(null);
    try {
      await api.eliminarOP(opId);
      setConfirmandoId(null);
      cargar();
    } catch (err) {
      setConfirmandoId(null);
      setError(err.message);
    }
  }

  if (loading) return <p style={{ padding: 24 }}>Cargando…</p>;
  if (!proyecto) return <p style={{ padding: 24 }}>{error || 'Proyecto no encontrado.'}</p>;

  return (
    <div className="page">
      <h1>{proyecto.nombre}</h1>

      {error && <p className="error">{error}</p>}

      <div className="op-header-card">
        <div>
          <span className="stat-label">Cliente</span>
          <p>
            <Link to={`/clientes/${proyecto.cliente_id}`}>{proyecto.cliente}</Link>
          </p>
        </div>
        <div>
          <span className="stat-label">Estado</span>
          <p>
            <span className={`badge badge-${proyecto.estado}`}>{proyecto.estado}</span>
          </p>
        </div>
        <div>
          <span className="stat-label">Descripción</span>
          <p>{proyecto.descripcion || '—'}</p>
        </div>
        <div>
          <span className="stat-label">Creado</span>
          <p>{new Date(proyecto.created_at).toLocaleDateString()}</p>
        </div>
        <div className="op-header-actions">
          <Link to={`/proyectos/${id}/editar`} className="btn-row-action">
            Editar proyecto
          </Link>
        </div>
      </div>

      <h2>Órdenes de producción</h2>
      <div className="filters">
        <Link to={`/ops/nueva?proyecto_id=${id}`} className="button-link">
          + Nueva OP
        </Link>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Número</th>
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
                <td>{o.num_items}</td>
                <td>
                  <span className={`badge badge-op-${o.estado_general}`}>{o.estado_general}</span>
                </td>
                <td>{new Date(o.fecha_emision).toLocaleDateString()}</td>
                <td>
                  <div className="row-actions">
                    <Link to={`/ops/${o.id}`} className="btn-row-action">
                      Ver
                    </Link>
                    {esAdmin &&
                      (confirmandoId === o.id ? (
                        <span className="row-actions-confirm">
                          ¿Seguro?
                          <button className="btn-row-action btn-row-action-danger" onClick={() => handleDelete(o.id)}>
                            Sí, eliminar
                          </button>
                          <button
                            type="button"
                            className="btn-row-action"
                            onClick={() => setConfirmandoId(null)}
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn-row-action btn-row-action-danger"
                          onClick={() => setConfirmandoId(o.id)}
                        >
                          Eliminar
                        </button>
                      ))}
                  </div>
                </td>
              </tr>
            ))}
            {ops.length === 0 && (
              <tr>
                <td colSpan={5}>Este proyecto no tiene OPs.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
