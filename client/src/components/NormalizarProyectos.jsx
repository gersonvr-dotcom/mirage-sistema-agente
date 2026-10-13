import { useState } from 'react';
import { api } from '../api';

const payloadDe = (g) => ({
  matriz_id: g.matriz_id,
  proyecto_ids: g.proyectos.filter((p) => p.id !== g.matriz_id).map((p) => p.id),
  nombre_final: g.nombre_final,
});

function Tile({ etiqueta, valor }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{etiqueta}</span>
      <span className="stat-value">{valor}</span>
    </div>
  );
}

export function NormalizarProyectos() {
  const [grupos, setGrupos] = useState(null);
  const [sinOps, setSinOps] = useState([]);
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState(null);
  const [vista, setVista] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [manual, setManual] = useState(null);

  async function cargarAnalisis() {
    const [{ grupos: gs }, { proyectos }] = await Promise.all([api.candidatosFusion(), api.proyectos()]);
    setGrupos(gs.map((g) => ({ ...g, key: `g-${g.matriz_id}`, seleccionado: false, manual: false })));
    setSinOps(proyectos.filter((p) => p.num_ops === 0));
  }

  async function analizar() {
    setAnalizando(true);
    setError(null);
    setVista(null);
    setConfirmando(false);
    setResultado(null);
    try {
      await cargarAnalisis();
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalizando(false);
    }
  }

  const cambiar = (key, patch) => setGrupos((gs) => gs.map((g) => (g.key === key ? { ...g, ...patch } : g)));

  function elegirMatriz(g, id) {
    const elegido = g.proyectos.find((p) => p.id === id);
    cambiar(g.key, {
      matriz_id: id,
      nombre_final: elegido.nombre,
      proyectos: g.proyectos.map((p) => ({ ...p, es_matriz: p.id === id })),
    });
    setVista(null);
  }

  function seleccionarAltas() {
    setGrupos((gs) => gs.map((g) => ({ ...g, seleccionado: g.confianza === 'alta' })));
    setVista(null);
  }

  const seleccionados = (grupos ?? []).filter((g) => g.seleccionado);

  async function vistaPrevia() {
    setError(null);
    setConfirmando(false);
    try {
      const total = { grupos: 0, ops: 0, cotizaciones: 0, proyectos: 0 };
      for (const g of seleccionados) {
        const r = await api.fusionarProyectos({ ...payloadDe(g), dry_run: true });
        total.grupos++;
        total.ops += r.ops_a_mover;
        total.cotizaciones += r.cotizaciones_a_mover;
        total.proyectos += r.absorbidos.length;
      }
      setVista(total);
    } catch (err) {
      setError(err.message);
    }
  }

  async function aplicar() {
    setAplicando(true);
    setConfirmando(false);
    setError(null);
    setVista(null);
    const res = { fusionados: 0, ops: 0, cotizaciones: 0, eliminados: 0, errores: [] };
    for (const g of seleccionados) {
      try {
        const r = await api.fusionarProyectos(payloadDe(g));
        res.fusionados++;
        res.ops += r.ops_movidas;
        res.cotizaciones += r.cotizaciones_movidas;
        res.eliminados += r.proyectos_eliminados;
      } catch (err) {
        res.errores.push({ cliente: g.cliente, nombre: g.nombre_final, mensaje: err.message });
      }
    }
    setResultado(res);
    try {
      await cargarAnalisis();
    } catch (err) {
      setError(err.message);
    }
    setAplicando(false);
  }

  async function abrirManual() {
    setManual({ clienteId: '', proyectos: [], elegidos: [], matrizId: null, nombreFinal: '' });
    if (clientes.length === 0) {
      try {
        setClientes((await api.clientes()).clientes);
      } catch (err) {
        setError(err.message);
      }
    }
  }

  async function elegirClienteManual(clienteId) {
    setManual((m) => ({ ...m, clienteId, proyectos: [], elegidos: [], matrizId: null, nombreFinal: '' }));
    if (!clienteId) return;
    try {
      const { proyectos } = await api.proyectos({ cliente_id: clienteId });
      setManual((m) => ({ ...m, proyectos }));
    } catch (err) {
      setError(err.message);
    }
  }

  function agregarManual() {
    const cliente = clientes.find((c) => String(c.id) === String(manual.clienteId));
    const elegidos = manual.proyectos.filter((p) => manual.elegidos.includes(p.id));
    setGrupos((gs) => [
      {
        key: `m-${Date.now()}`,
        cliente_id: cliente.id,
        cliente: cliente.nombre,
        confianza: 'manual',
        matriz_id: manual.matrizId,
        nombre_final: manual.nombreFinal,
        proyectos: elegidos.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          num_ops: p.num_ops,
          num_cotizaciones: null,
          tipo_pedido: null,
          es_matriz: p.id === manual.matrizId,
        })),
        seleccionado: true,
        manual: true,
      },
      ...(gs ?? []),
    ]);
    setManual(null);
    setVista(null);
  }

  const manualValido = manual && manual.elegidos.length >= 2 && manual.matrizId && manual.elegidos.includes(manual.matrizId) && manual.nombreFinal.trim();
  const altas = (grupos ?? []).filter((g) => g.confianza === 'alta').length;

  return (
    <>
      <div className="form-actions" style={{ margin: '16px 0' }}>
        <button type="button" onClick={analizar} disabled={analizando || aplicando}>
          {analizando ? 'Analizando…' : grupos ? 'Volver a analizar' : 'Analizar proyectos'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {resultado && (
        <div className="stat-row">
          <Tile etiqueta="Grupos fusionados" valor={resultado.fusionados} />
          <Tile etiqueta="OPs movidas a su obra" valor={resultado.ops} />
          <Tile etiqueta="Cotizaciones movidas" valor={resultado.cotizaciones} />
          <Tile etiqueta="Proyectos eliminados" valor={resultado.eliminados} />
        </div>
      )}
      {resultado?.errores.length > 0 && (
        <p className="error">
          No se pudo fusionar: {resultado.errores.map((e) => `${e.cliente} (${e.nombre}): ${e.mensaje}`).join(' · ')}
        </p>
      )}

      {grupos && (
        <>
          <p className="chat-empty">
            {grupos.length === 0
              ? 'No hay proyectos duplicados por revisar.'
              : `${grupos.length} grupo(s) de proyectos que parecen la misma obra (${altas} de confianza alta). Elegí cuál es la obra principal de cada grupo y marcá los que querés fusionar: sus OPs pasan a la obra como pedidos adicionales y los proyectos duplicados se eliminan.`}
          </p>

          <div className="fusion-acciones">
            <button type="button" className="btn-row-action" onClick={seleccionarAltas} disabled={altas === 0}>
              Seleccionar todos los de confianza alta ({altas})
            </button>
            <button
              type="button"
              className="btn-row-action"
              onClick={() => setGrupos((gs) => gs.map((g) => ({ ...g, seleccionado: false })))}
              disabled={seleccionados.length === 0}
            >
              Quitar selección
            </button>
            <button type="button" className="btn-row-action" onClick={abrirManual} disabled={Boolean(manual)}>
              + Juntar proyectos a mano
            </button>
          </div>

          {manual && (
            <div className="fusion-manual">
              <label>
                Cliente
                <select value={manual.clienteId} onChange={(e) => elegirClienteManual(e.target.value)}>
                  <option value="">Elegí un cliente</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
              {manual.proyectos.length > 0 && (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Fusionar</th>
                        <th>Obra principal</th>
                        <th>Proyecto</th>
                        <th>OPs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manual.proyectos.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Incluir ${p.nombre}`}
                              checked={manual.elegidos.includes(p.id)}
                              onChange={() =>
                                setManual((m) => ({
                                  ...m,
                                  elegidos: m.elegidos.includes(p.id) ? m.elegidos.filter((x) => x !== p.id) : [...m.elegidos, p.id],
                                }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="radio"
                              name="matriz-manual"
                              aria-label={`${p.nombre} es la obra principal`}
                              checked={manual.matrizId === p.id}
                              disabled={!manual.elegidos.includes(p.id)}
                              onChange={() => setManual((m) => ({ ...m, matrizId: p.id, nombreFinal: p.nombre }))}
                            />
                          </td>
                          <td>{p.nombre}</td>
                          <td>{p.num_ops}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <label>
                Nombre final de la obra
                <input value={manual.nombreFinal} onChange={(e) => setManual((m) => ({ ...m, nombreFinal: e.target.value }))} />
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

          {grupos.map((g) => (
            <div className="fusion-grupo" key={g.key}>
              <div className="fusion-grupo-head">
                <span className="fusion-check">
                  <input
                    type="checkbox"
                    aria-label={`Fusionar el grupo de ${g.cliente}`}
                    checked={g.seleccionado}
                    onChange={(e) => {
                      cambiar(g.key, { seleccionado: e.target.checked });
                      setVista(null);
                    }}
                  />
                  <b>{g.cliente}</b>
                </span>
                <span className={`badge ${g.confianza === 'alta' ? 'badge-activo' : g.confianza === 'media' ? 'badge-en_pausa' : ''}`}>
                  {g.confianza}
                </span>
                <label>
                  Nombre final de la obra
                  <input value={g.nombre_final} onChange={(e) => cambiar(g.key, { nombre_final: e.target.value })} />
                </label>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Obra principal</th>
                      <th>Proyecto</th>
                      <th>OPs</th>
                      <th>Cotizaciones</th>
                      <th>Quedará como pedido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.proyectos.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <input
                            type="radio"
                            name={`matriz-${g.key}`}
                            aria-label={`${p.nombre} es la obra principal`}
                            checked={p.id === g.matriz_id}
                            onChange={() => elegirMatriz(g, p.id)}
                          />
                        </td>
                        <td>{p.nombre}</td>
                        <td>{p.num_ops}</td>
                        <td>{p.num_cotizaciones ?? '—'}</td>
                        <td>{p.id === g.matriz_id ? '—' : (p.tipo_pedido ?? 'según el nombre')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {seleccionados.length > 0 && (
            <div className="fusion-acciones">
              <button type="button" onClick={vistaPrevia} disabled={aplicando}>
                Ver qué cambiaría ({seleccionados.length})
              </button>
              {!confirmando ? (
                <button type="button" onClick={() => setConfirmando(true)} disabled={aplicando}>
                  {aplicando ? 'Fusionando…' : `Fusionar seleccionados (${seleccionados.length})`}
                </button>
              ) : (
                <span className="row-actions-confirm">
                  ¿Seguro? Se fusionan {seleccionados.length} grupo(s) y se eliminan los proyectos duplicados.
                  <button type="button" className="btn-row-action btn-row-action-danger" onClick={aplicar}>
                    Sí, fusionar
                  </button>
                  <button type="button" className="btn-row-action" onClick={() => setConfirmando(false)}>
                    No
                  </button>
                </span>
              )}
            </div>
          )}

          {vista && (
            <div className="stat-row">
              <Tile etiqueta="Grupos" valor={vista.grupos} />
              <Tile etiqueta="Proyectos que se eliminan" valor={vista.proyectos} />
              <Tile etiqueta="OPs que se mueven" valor={vista.ops} />
              <Tile etiqueta="Cotizaciones que se mueven" valor={vista.cotizaciones} />
            </div>
          )}

          {sinOps.length > 0 && (
            <>
              <h2 style={{ marginTop: 24 }}>Proyectos sin OPs ({sinOps.length})</h2>
              <p className="chat-empty">
                No tienen ninguna OP: suelen ser restos de un proyecto cuyas OPs ya pasaron a su obra. Si corresponde, juntalos con su obra desde "Juntar proyectos a mano".
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Proyecto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sinOps.map((p) => (
                      <tr key={p.id}>
                        <td>{p.cliente}</td>
                        <td>{p.nombre}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
