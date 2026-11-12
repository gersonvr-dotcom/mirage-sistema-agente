import { useState } from 'react';
import { api } from '../api';

const payloadDe = (g) => ({
  matriz_id: g.matriz_id,
  cliente_ids: g.clientes.filter((c) => c.id !== g.matriz_id && c.incluido).map((c) => c.id),
});

const conGrupo = (g, i) => ({
  ...g,
  key: `g-${g.matriz_id}-${i}`,
  clientes: g.clientes.map((c) => ({ ...c, incluido: true })),
});

function Tile({ etiqueta, valor }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{etiqueta}</span>
      <span className="stat-value">{valor}</span>
    </div>
  );
}

/** Clientes duplicados (el mismo cliente escrito de dos maneras): se revisan y se fusionan con vista previa (R5-10). */
export function NormalizarClientes() {
  const [grupos, setGrupos] = useState(null);
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState(null);
  const [vista, setVista] = useState(null); // { key, plan }
  const [confirmando, setConfirmando] = useState(null); // key del grupo
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [todos, setTodos] = useState([]);
  const [manual, setManual] = useState(null);

  async function cargarAnalisis() {
    const { grupos: gs } = await api.candidatosFusionClientes();
    setGrupos(gs.map(conGrupo));
  }

  async function analizar() {
    setAnalizando(true);
    setError(null);
    setVista(null);
    setConfirmando(null);
    setResultado(null);
    try {
      await cargarAnalisis();
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalizando(false);
    }
  }

  const cambiar = (key, fn) => {
    setGrupos((gs) => gs.map((g) => (g.key === key ? fn(g) : g)));
    setVista(null);
    setConfirmando(null);
  };

  const elegirMatriz = (key, id) => cambiar(key, (g) => ({ ...g, matriz_id: id, clientes: g.clientes.map((c) => ({ ...c, es_matriz: c.id === id })) }));
  const alternar = (key, id) => cambiar(key, (g) => ({ ...g, clientes: g.clientes.map((c) => (c.id === id ? { ...c, incluido: !c.incluido } : c)) }));

  async function verPrevia(g) {
    setError(null);
    setConfirmando(null);
    try {
      setVista({ key: g.key, plan: await api.fusionarClientes({ ...payloadDe(g), dry_run: true }) });
    } catch (err) {
      setError(err.message);
    }
  }

  async function aplicar(g) {
    setAplicando(true);
    setConfirmando(null);
    setError(null);
    setVista(null);
    try {
      setResultado(await api.fusionarClientes(payloadDe(g)));
      await cargarAnalisis();
    } catch (err) {
      setError(err.message);
    } finally {
      setAplicando(false);
    }
  }

  async function abrirManual() {
    setManual({ matrizId: '', absorbidoId: '' });
    if (todos.length === 0) {
      try {
        setTodos((await api.clientes()).clientes);
      } catch (err) {
        setError(err.message);
      }
    }
  }

  function agregarManual() {
    const matriz = todos.find((c) => String(c.id) === String(manual.matrizId));
    const absorbido = todos.find((c) => String(c.id) === String(manual.absorbidoId));
    setGrupos((gs) => [
      {
        key: `m-${Date.now()}`,
        confianza: 'manual',
        matriz_id: matriz.id,
        clientes: [
          { ...matriz, es_matriz: true, incluido: true },
          { ...absorbido, es_matriz: false, incluido: true },
        ],
      },
      ...(gs ?? []),
    ]);
    setManual(null);
  }

  const manualValido = manual && manual.matrizId && manual.absorbidoId && manual.matrizId !== manual.absorbidoId;

  return (
    <>
      <div className="form-actions" style={{ margin: '16px 0' }}>
        <button type="button" onClick={analizar} disabled={analizando || aplicando}>
          {analizando ? 'Analizando…' : grupos ? 'Volver a analizar' : 'Buscar clientes duplicados'}
        </button>
        <button type="button" className="btn-row-action" onClick={abrirManual} disabled={Boolean(manual)}>
          + Juntar dos clientes a mano
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {manual && (
        <div className="fusion-manual">
          <label>
            Cliente que se queda
            <select value={manual.matrizId} onChange={(e) => setManual((m) => ({ ...m, matrizId: e.target.value }))}>
              <option value="">Elegí un cliente</option>
              {todos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cliente duplicado (desaparece)
            <select value={manual.absorbidoId} onChange={(e) => setManual((m) => ({ ...m, absorbidoId: e.target.value }))}>
              <option value="">Elegí un cliente</option>
              {todos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button type="button" onClick={agregarManual} disabled={!manualValido}>
              Agregar a la lista
            </button>
            <button type="button" onClick={() => setManual(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {resultado && (
        <>
          <div className="stat-row">
            <Tile etiqueta="Clientes fusionados" valor={resultado.clientes_eliminados} />
            <Tile etiqueta="OPs movidas" valor={resultado.ops_movidas} />
            <Tile etiqueta="Proyectos movidos" valor={resultado.proyectos_movidos} />
            <Tile etiqueta="Cotizaciones movidas" valor={resultado.cotizaciones_movidas} />
          </div>
          {resultado.proyectos_por_revisar.length > 0 && (
            <p className="chat-empty">
              {resultado.matriz.nombre} ahora tiene obras que parecen la misma ({resultado.proyectos_por_revisar
                .map((g) => g.proyectos.map((p) => p.nombre).join(' / '))
                .join('; ')}
              ). Fusionalas abajo, en "Normalizar proyectos".
            </p>
          )}
        </>
      )}

      {grupos && (
        <p className="chat-empty">
          {grupos.length === 0
            ? 'No hay clientes duplicados por revisar.'
            : `${grupos.length} grupo(s) de clientes que parecen el mismo escrito de otra manera. Elegí cuál se queda en cada grupo (conserva su nombre) y qué clientes se fusionan en él: sus OPs, proyectos y cotizaciones pasan al cliente que se queda, y el nombre del duplicado se recuerda para que la sincronización con el Excel Madre no lo vuelva a crear.`}
        </p>
      )}

      {grupos?.map((g) => {
        const plan = vista?.key === g.key ? vista.plan : null;
        const incluidos = g.clientes.filter((c) => c.id !== g.matriz_id && c.incluido).length;
        return (
          <div className="fusion-grupo" key={g.key}>
            <div className="fusion-grupo-head">
              <b>{g.clientes.find((c) => c.id === g.matriz_id)?.nombre}</b>
              <span className={`badge ${g.confianza === 'alta' ? 'badge-activo' : g.confianza === 'media' ? 'badge-en_pausa' : ''}`}>
                {g.confianza}
              </span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Se queda</th>
                    <th>Fusionar</th>
                    <th>Cliente</th>
                    <th>OPs</th>
                    <th>Proyectos</th>
                    <th>Cotizaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {g.clientes.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <input
                          type="radio"
                          name={`matriz-${g.key}`}
                          aria-label={`${c.nombre} es el cliente que se queda`}
                          checked={c.id === g.matriz_id}
                          onChange={() => elegirMatriz(g.key, c.id)}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Fusionar ${c.nombre}`}
                          checked={c.id !== g.matriz_id && c.incluido}
                          disabled={c.id === g.matriz_id}
                          onChange={() => alternar(g.key, c.id)}
                        />
                      </td>
                      <td>{c.nombre}</td>
                      <td>{c.num_ops ?? '—'}</td>
                      <td>{c.num_proyectos ?? '—'}</td>
                      <td>{c.num_cotizaciones ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="fusion-acciones">
              <button type="button" onClick={() => verPrevia(g)} disabled={aplicando || incluidos === 0}>
                Ver qué cambiaría
              </button>
              {confirmando !== g.key ? (
                <button type="button" onClick={() => setConfirmando(g.key)} disabled={aplicando || incluidos === 0}>
                  {aplicando ? 'Fusionando…' : 'Fusionar'}
                </button>
              ) : (
                <span className="row-actions-confirm">
                  ¿Seguro? Se fusionan {incluidos} cliente(s) en {g.clientes.find((c) => c.id === g.matriz_id)?.nombre} y los duplicados se eliminan.
                  <button type="button" className="btn-row-action btn-row-action-danger" onClick={() => aplicar(g)}>
                    Sí, fusionar
                  </button>
                  <button type="button" className="btn-row-action" onClick={() => setConfirmando(null)}>
                    No
                  </button>
                </span>
              )}
            </div>

            {plan && (
              <>
                <div className="stat-row">
                  <Tile etiqueta="Clientes que se eliminan" valor={plan.absorbidos.length} />
                  <Tile etiqueta="OPs que se mueven" valor={plan.ops_a_mover} />
                  <Tile etiqueta="Proyectos que se mueven" valor={plan.proyectos_a_mover} />
                  <Tile etiqueta="Cotizaciones que se mueven" valor={plan.cotizaciones_a_mover} />
                </div>
                {Object.keys(plan.datos_que_completa_el_matriz).length > 0 && (
                  <p className="chat-empty">
                    El cliente que se queda completa con datos del duplicado:{' '}
                    {Object.entries(plan.datos_que_completa_el_matriz)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' · ')}
                    .
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
