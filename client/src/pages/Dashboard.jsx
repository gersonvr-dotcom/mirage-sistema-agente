import { useEffect, useState } from 'react';
import { api } from '../api';

const ORDEN_PROYECTOS = ['activo', 'en_pausa', 'cerrado'];
const ORDEN_OPS = ['abierta', 'en_produccion', 'en_transito', 'cerrada', 'cancelada'];
const ORDEN_ITEMS = ['pendiente', 'en_produccion', 'embarcado', 'en_aduana', 'en_bodega', 'entregado', 'cancelado'];

const ETIQUETAS = {
  activo: 'Activo',
  en_pausa: 'En pausa',
  cerrado: 'Cerrado',
  abierta: 'Abierta',
  en_produccion: 'En producción',
  en_transito: 'En tránsito',
  cerrada: 'Cerrada',
  cancelada: 'Cancelada',
  pendiente: 'Pendiente',
  embarcado: 'Embarcado',
  en_aduana: 'En aduana',
  en_bodega: 'En bodega',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

const TERMINALES = new Set(['cancelada', 'cancelado']);

function normalizar(orden, rows, key) {
  const porClave = Object.fromEntries(rows.map((r) => [r[key], r.cantidad]));
  return orden.map((clave) => ({ clave, cantidad: porClave[clave] ?? 0 }));
}

function BarList({ titulo, filas, claseFill }) {
  const max = Math.max(1, ...filas.map((f) => f.cantidad));
  return (
    <section className="bar-list">
      <h2>{titulo}</h2>
      {filas.map((f) => (
        <div className="bar-row" key={f.clave} title={`${f.cantidad} ${ETIQUETAS[f.clave] ?? f.clave}`}>
          <span className="bar-label">{ETIQUETAS[f.clave] ?? f.clave}</span>
          <div className="bar-track">
            <div
              className={`bar-fill ${typeof claseFill === 'function' ? claseFill(f.clave) : claseFill}`}
              style={{ width: `${(f.cantidad / max) * 100}%` }}
            />
          </div>
          <span className="bar-value">{f.cantidad}</span>
        </div>
      ))}
    </section>
  );
}

const ACCION_LABELS = { crear_proyecto: 'Creó', editar_proyecto: 'Editó', eliminar_proyecto: 'Eliminó' };

function resumenAccion(accion) {
  const verbo = ACCION_LABELS[accion.tool_name] ?? accion.tool_name;
  const nombre = accion.resultado?.proyecto?.nombre ?? accion.input?.proyecto ?? accion.input?.nombre ?? '';
  return `${verbo} el proyecto "${nombre}"`;
}

const formatoM2 = new Intl.NumberFormat('es', { maximumFractionDigits: 2, useGrouping: 'always' });

function TopM2({ anio }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .rankingM2({ anio, limite: 5 })
      .then(setDatos)
      .catch((err) => setError(err.message));
  }, [anio]);

  return (
    <section className="bar-list" style={{ marginTop: 28 }}>
      <h2>Top 5 clientes por m² ({anio})</h2>
      {error && <p className="error">{error}</p>}
      {datos && datos.ranking.length === 0 && <p className="chat-empty">Todavía no hay ventas en m² registradas en {anio}.</p>}
      {datos && datos.ranking.length > 0 && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cliente</th>
                  <th>m²</th>
                  <th>OPs</th>
                  <th>Proyectos</th>
                </tr>
              </thead>
              <tbody>
                {datos.ranking.map((r) => (
                  <tr key={r.cliente}>
                    <td>{r.posicion}</td>
                    <td>{r.cliente}</td>
                    <td>{formatoM2.format(r.m2_total)}</td>
                    <td>{r.num_ops}</td>
                    <td>{r.num_proyectos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="chat-empty">
            Total {anio}: {formatoM2.format(datos.m2_total_general)} m² en {datos.total_clientes} clientes. {datos.criterio}
          </p>
          {datos.advertencias?.map((a) => (
            <p className="error" key={a}>{a}</p>
          ))}
        </>
      )}
    </section>
  );
}

export function Dashboard() {
  const [metricas, setMetricas] = useState(null);
  const [auditoria, setAuditoria] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .metricas()
      .then(setMetricas)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    api
      .auditoriaAgente()
      .then((data) => setAuditoria(data.acciones))
      .catch(() => {}); // no bloquea el resto del dashboard si falla
  }, []);

  return (
    <div className="page">
      <h1>Dashboard</h1>

      {error && <p className="error">{error}</p>}

      {loading || !metricas ? (
        <p>Cargando…</p>
      ) : (
        <>
          <div className="stat-row">
            <div className="stat-tile">
              <span className="stat-label">Proyectos</span>
              <span className="stat-value">{metricas.totales.proyectos}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Órdenes de producción</span>
              <span className="stat-value">{metricas.totales.ops}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Clientes</span>
              <span className="stat-value">{metricas.totales.clientes}</span>
            </div>
            <div className={`stat-tile${metricas.totales.items_atrasados > 0 ? ' stat-tile-critical' : ''}`}>
              <span className="stat-label">
                {metricas.totales.items_atrasados > 0 ? '⚠ Ítems atrasados' : 'Ítems atrasados'}
              </span>
              <span className="stat-value">{metricas.totales.items_atrasados}</span>
            </div>
          </div>

          <div className="bar-lists">
            <BarList
              titulo="Proyectos por estado"
              filas={normalizar(ORDEN_PROYECTOS, metricas.proyectos_por_estado, 'estado')}
              claseFill={(clave) => `estado-${clave}`}
            />
            <BarList
              titulo="OPs por estado"
              filas={normalizar(ORDEN_OPS, metricas.ops_por_estado, 'estado_general')}
              claseFill={(clave) => (TERMINALES.has(clave) ? 'estado-terminal' : 'estado-pipeline')}
            />
            <BarList
              titulo="Ítems de OP por estado"
              filas={normalizar(ORDEN_ITEMS, metricas.items_por_estado, 'estado')}
              claseFill={(clave) => (TERMINALES.has(clave) ? 'estado-terminal' : 'estado-pipeline')}
            />
          </div>

          <TopM2 anio={new Date().getFullYear()} />

          <section className="bar-list" style={{ marginTop: 28 }}>
            <h2>Últimas acciones del agente</h2>
            {auditoria.length === 0 ? (
              <p className="chat-empty">El agente todavía no ha creado, editado ni eliminado ningún proyecto.</p>
            ) : (
              <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Usuario</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {auditoria.map((a) => (
                    <tr key={a.id}>
                      <td>{new Date(a.created_at).toLocaleString('es')}</td>
                      <td>{a.usuario}</td>
                      <td>{resumenAccion(a)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
