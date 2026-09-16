import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';

const ESTADOS_OP = ['abierta', 'en_produccion', 'en_transito', 'cerrada', 'cancelada'];
const ESTADOS_ITEM = ['pendiente', 'en_produccion', 'embarcado', 'en_aduana', 'en_bodega', 'entregado', 'cancelado'];
const ETAPAS = ['produccion', 'embarque', 'aduana', 'bodega', 'entrega'];

function fechaInput(iso) {
  return iso ? String(iso).slice(0, 10) : '';
}

export function OPDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'administrador';

  const [op, setOp] = useState(null);
  const [productos, setProductos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editandoHeader, setEditandoHeader] = useState(false);
  const [headerForm, setHeaderForm] = useState(null);

  const [mostrarNuevaLinea, setMostrarNuevaLinea] = useState(false);
  const [nuevaLinea, setNuevaLinea] = useState({ producto_id: '', proveedor_id: '', cantidad: '', fecha_estimada_entrega: '', estado: 'pendiente' });

  const [editandoItemId, setEditandoItemId] = useState(null);
  const [itemForm, setItemForm] = useState(null);

  const [etapaItemId, setEtapaItemId] = useState(null);
  const [etapaForm, setEtapaForm] = useState({ etapa: 'produccion', fecha_evento: '', nota: '' });

  const [confirmandoBorrarOP, setConfirmandoBorrarOP] = useState(false);

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      const { op } = await api.op(id);
      setOp(op);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
    api.productos().then(({ productos }) => setProductos(productos)).catch(() => {});
    api.proveedores().then(({ proveedores }) => setProveedores(proveedores)).catch(() => {});
  }, [id]);

  function abrirEditarHeader() {
    setHeaderForm({
      numero_op: op.numero_op,
      fecha_emision: fechaInput(op.fecha_emision),
      estado_general: op.estado_general,
    });
    setEditandoHeader(true);
  }

  async function guardarHeader(e) {
    e.preventDefault();
    setError(null);
    try {
      const { op: actualizada } = await api.actualizarOP(id, headerForm);
      setOp(actualizada);
      setEditandoHeader(false);
    } catch (err) {
      setError(err.message);
    }
  }

  async function borrarOP() {
    setError(null);
    try {
      await api.eliminarOP(id);
      navigate('/ops');
    } catch (err) {
      setError(err.message);
      setConfirmandoBorrarOP(false);
    }
  }

  async function agregarLinea(e) {
    e.preventDefault();
    setError(null);
    try {
      const { op: actualizada } = await api.crearOPItem(id, nuevaLinea);
      setOp(actualizada);
      setNuevaLinea({ producto_id: '', proveedor_id: '', cantidad: '', fecha_estimada_entrega: '', estado: 'pendiente' });
      setMostrarNuevaLinea(false);
    } catch (err) {
      setError(err.message);
    }
  }

  function abrirEditarItem(item) {
    setItemForm({
      producto_id: item.producto_id,
      proveedor_id: item.proveedor_id ?? '',
      cantidad: item.cantidad,
      fecha_estimada_entrega: fechaInput(item.fecha_estimada_entrega),
      estado: item.estado,
    });
    setEditandoItemId(item.id);
  }

  async function guardarItem(e, itemId) {
    e.preventDefault();
    setError(null);
    try {
      const { op: actualizada } = await api.actualizarOPItem(itemId, itemForm);
      setOp(actualizada);
      setEditandoItemId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function borrarItem(itemId) {
    setError(null);
    try {
      const { op: actualizada } = await api.eliminarOPItem(itemId);
      setOp(actualizada);
    } catch (err) {
      setError(err.message);
    }
  }

  async function registrarEtapa(e, itemId) {
    e.preventDefault();
    setError(null);
    try {
      const { op: actualizada } = await api.agregarEtapa(itemId, etapaForm);
      setOp(actualizada);
      setEtapaItemId(null);
      setEtapaForm({ etapa: 'produccion', fecha_evento: '', nota: '' });
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <p style={{ padding: 24 }}>Cargando…</p>;
  if (!op) return <p style={{ padding: 24 }}>{error || 'OP no encontrada.'}</p>;

  return (
    <div className="page">
      <h1>{op.numero_op}</h1>

      {error && <p className="error">{error}</p>}

      {!editandoHeader ? (
        <div className="op-header-card">
          <div>
            <span className="stat-label">Cliente</span>
            <p>{op.cliente}</p>
          </div>
          <div>
            <span className="stat-label">Proyecto</span>
            <p>{op.proyecto}</p>
          </div>
          <div>
            <span className="stat-label">Emisión</span>
            <p>{new Date(op.fecha_emision).toLocaleDateString()}</p>
          </div>
          <div>
            <span className="stat-label">Estado</span>
            <p>
              <span className={`badge badge-op-${op.estado_general}`}>{op.estado_general}</span>
            </p>
          </div>
          <div className="op-header-actions">
            <button type="button" onClick={abrirEditarHeader}>
              Editar
            </button>
            {esAdmin &&
              (confirmandoBorrarOP ? (
                <>
                  <button onClick={borrarOP}>Sí, eliminar OP</button>
                  <button type="button" onClick={() => setConfirmandoBorrarOP(false)}>
                    No
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmandoBorrarOP(true)}>
                  Eliminar OP
                </button>
              ))}
          </div>
        </div>
      ) : (
        <form onSubmit={guardarHeader} className="form" style={{ marginBottom: 24 }}>
          <label>
            Número de OP
            <input
              value={headerForm.numero_op}
              onChange={(e) => setHeaderForm((f) => ({ ...f, numero_op: e.target.value }))}
              required
            />
          </label>
          <label>
            Fecha de emisión
            <input
              type="date"
              value={headerForm.fecha_emision}
              onChange={(e) => setHeaderForm((f) => ({ ...f, fecha_emision: e.target.value }))}
              required
            />
          </label>
          <label>
            Estado
            <select
              value={headerForm.estado_general}
              onChange={(e) => setHeaderForm((f) => ({ ...f, estado_general: e.target.value }))}
            >
              {ESTADOS_OP.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button type="submit">Guardar</button>
            <button type="button" onClick={() => setEditandoHeader(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <h2 style={{ marginTop: 32 }}>Líneas</h2>

      {op.items.length === 0 && <p className="chat-empty">Esta OP todavía no tiene líneas.</p>}

      {op.items.map((item) => (
        <div className="op-item-card" key={item.id}>
          {editandoItemId === item.id ? (
            <form onSubmit={(e) => guardarItem(e, item.id)} className="form">
              <label>
                Producto
                <select
                  value={itemForm.producto_id}
                  onChange={(e) => setItemForm((f) => ({ ...f, producto_id: e.target.value }))}
                  required
                >
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} — {p.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Proveedor
                <select
                  value={itemForm.proveedor_id}
                  onChange={(e) => setItemForm((f) => ({ ...f, proveedor_id: e.target.value }))}
                >
                  <option value="">Sin definir</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cantidad
                <input
                  type="number"
                  step="0.01"
                  value={itemForm.cantidad}
                  onChange={(e) => setItemForm((f) => ({ ...f, cantidad: e.target.value }))}
                  required
                />
              </label>
              <label>
                Fecha estimada de entrega
                <input
                  type="date"
                  value={itemForm.fecha_estimada_entrega}
                  onChange={(e) => setItemForm((f) => ({ ...f, fecha_estimada_entrega: e.target.value }))}
                />
              </label>
              <label>
                Estado
                <select
                  value={itemForm.estado}
                  onChange={(e) => setItemForm((f) => ({ ...f, estado: e.target.value }))}
                >
                  {ESTADOS_ITEM.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-actions">
                <button type="submit">Guardar</button>
                <button type="button" onClick={() => setEditandoItemId(null)}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="op-item-head">
                <div>
                  <b>
                    {item.codigo} — {item.producto}
                  </b>{' '}
                  <span className="chat-empty">({item.formato})</span>
                </div>
                <span className={`badge badge-item-${item.estado}`}>
                  {item.atrasado ? '⚠ ' : ''}
                  {item.estado}
                </span>
              </div>
              <p className="chat-empty">
                Cantidad: {item.cantidad} · Proveedor: {item.proveedor ?? '—'} · Entrega estimada:{' '}
                {item.fecha_estimada_entrega ? new Date(item.fecha_estimada_entrega).toLocaleDateString() : '—'}
              </p>

              {item.historial.length > 0 && (
                <ul className="op-item-historial">
                  {item.historial.map((h) => (
                    <li key={h.id}>
                      <span className="chat-empty">{new Date(h.fecha_evento).toLocaleDateString()}</span> — {h.etapa}
                      {h.nota ? `: ${h.nota}` : ''}
                    </li>
                  ))}
                </ul>
              )}

              <div className="op-item-actions">
                <button type="button" onClick={() => abrirEditarItem(item)}>
                  Editar
                </button>
                <button type="button" onClick={() => setEtapaItemId(etapaItemId === item.id ? null : item.id)}>
                  + Registrar etapa
                </button>
                <button type="button" onClick={() => borrarItem(item.id)}>
                  Eliminar
                </button>
              </div>

              {etapaItemId === item.id && (
                <form onSubmit={(e) => registrarEtapa(e, item.id)} className="form op-etapa-form">
                  <label>
                    Etapa
                    <select
                      value={etapaForm.etapa}
                      onChange={(e) => setEtapaForm((f) => ({ ...f, etapa: e.target.value }))}
                    >
                      {ETAPAS.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Fecha
                    <input
                      type="date"
                      value={etapaForm.fecha_evento}
                      onChange={(e) => setEtapaForm((f) => ({ ...f, fecha_evento: e.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Nota (opcional)
                    <input
                      value={etapaForm.nota}
                      onChange={(e) => setEtapaForm((f) => ({ ...f, nota: e.target.value }))}
                    />
                  </label>
                  <div className="form-actions">
                    <button type="submit">Registrar</button>
                    <button type="button" onClick={() => setEtapaItemId(null)}>
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      ))}

      {!mostrarNuevaLinea ? (
        <button type="button" onClick={() => setMostrarNuevaLinea(true)} style={{ marginTop: 12 }}>
          + Agregar línea
        </button>
      ) : (
        <form onSubmit={agregarLinea} className="form" style={{ marginTop: 16 }}>
          <label>
            Producto
            <select
              value={nuevaLinea.producto_id}
              onChange={(e) => setNuevaLinea((f) => ({ ...f, producto_id: e.target.value }))}
              required
            >
              <option value="" disabled>
                Selecciona un producto
              </option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Proveedor
            <select
              value={nuevaLinea.proveedor_id}
              onChange={(e) => setNuevaLinea((f) => ({ ...f, proveedor_id: e.target.value }))}
            >
              <option value="">Sin definir</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cantidad
            <input
              type="number"
              step="0.01"
              value={nuevaLinea.cantidad}
              onChange={(e) => setNuevaLinea((f) => ({ ...f, cantidad: e.target.value }))}
              required
            />
          </label>
          <label>
            Fecha estimada de entrega
            <input
              type="date"
              value={nuevaLinea.fecha_estimada_entrega}
              onChange={(e) => setNuevaLinea((f) => ({ ...f, fecha_estimada_entrega: e.target.value }))}
            />
          </label>
          <div className="form-actions">
            <button type="submit">Agregar</button>
            <button type="button" onClick={() => setMostrarNuevaLinea(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
