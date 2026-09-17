import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

const POLL_MS = 4000;

export function Configuracion() {
  const [sincronizandoExcel, setSincronizandoExcel] = useState(false);
  const [resultadoExcel, setResultadoExcel] = useState(null);
  const [errorExcel, setErrorExcel] = useState(null);

  const [sincronizandoProductos, setSincronizandoProductos] = useState(false);
  const [resultadoProductos, setResultadoProductos] = useState(null);
  const [errorProductos, setErrorProductos] = useState(null);
  const intervaloRef = useRef(null);

  function detenerPolling() {
    if (intervaloRef.current) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
  }

  function aplicarEstadoProductos(estado) {
    if (estado.estado === 'completado') {
      detenerPolling();
      setResultadoProductos(estado.resultado);
      setSincronizandoProductos(false);
    } else if (estado.estado === 'error') {
      detenerPolling();
      setErrorProductos(estado.error);
      setSincronizandoProductos(false);
    } else if (estado.estado === 'corriendo') {
      setSincronizandoProductos(true);
    }
  }

  function iniciarPolling() {
    detenerPolling();
    intervaloRef.current = setInterval(async () => {
      try {
        const estado = await api.estadoSincronizacionProductos();
        aplicarEstadoProductos(estado);
      } catch (err) {
        detenerPolling();
        setErrorProductos(err.message);
        setSincronizandoProductos(false);
      }
    }, POLL_MS);
  }

  useEffect(() => {
    // Si la app se recargó mientras el sync seguía corriendo, retoma el estado en vez de
    // perder de vista un job que sigue vivo en el servidor.
    api
      .estadoSincronizacionProductos()
      .then((estado) => {
        aplicarEstadoProductos(estado);
        if (estado.estado === 'corriendo') iniciarPolling();
      })
      .catch(() => {});
    return detenerPolling;
  }, []);

  async function sincronizarExcel() {
    setSincronizandoExcel(true);
    setErrorExcel(null);
    setResultadoExcel(null);
    try {
      const data = await api.sincronizarExcelMadre();
      setResultadoExcel(data);
    } catch (err) {
      setErrorExcel(err.message);
    } finally {
      setSincronizandoExcel(false);
    }
  }

  async function sincronizarProductos() {
    setErrorProductos(null);
    setResultadoProductos(null);
    setSincronizandoProductos(true);
    try {
      const estado = await api.sincronizarProductosOps();
      aplicarEstadoProductos(estado);
      if (estado.estado === 'corriendo') iniciarPolling();
    } catch (err) {
      setErrorProductos(err.message);
      setSincronizandoProductos(false);
    }
  }

  return (
    <div className="page">
      <h1>Configuración</h1>

      <h2>Sincronización con Excel Madre 2026</h2>
      <p className="chat-empty">
        Trae en vivo el Excel Madre 2026 desde SharePoint y actualiza clientes, proyectos,
        cotizaciones y OPs en la base de datos: crea lo que falte y actualiza (por número de
        OP) lo que ya existía, para reflejar los cambios hechos en el Excel.
      </p>

      <div className="form-actions" style={{ margin: '16px 0' }}>
        <button type="button" onClick={sincronizarExcel} disabled={sincronizandoExcel}>
          {sincronizandoExcel ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
      </div>

      {errorExcel && <p className="error">{errorExcel}</p>}

      {resultadoExcel && (
        <>
          <div className="stat-row">
            <div className="stat-tile">
              <span className="stat-label">Filas en el Excel</span>
              <span className="stat-value">{resultadoExcel.filas_excel}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Procesadas</span>
              <span className="stat-value">{resultadoExcel.filas_procesadas}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Excluidas</span>
              <span className="stat-value">{resultadoExcel.filas_excluidas}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Clientes creados</span>
              <span className="stat-value">{resultadoExcel.clientes_creados}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Proyectos creados</span>
              <span className="stat-value">{resultadoExcel.proyectos_creados}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Cotizaciones creadas</span>
              <span className="stat-value">{resultadoExcel.cotizaciones_creadas}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">OPs creadas</span>
              <span className="stat-value">{resultadoExcel.ops_creadas}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">OPs actualizadas</span>
              <span className="stat-value">{resultadoExcel.ops_actualizadas}</span>
            </div>
          </div>

          {resultadoExcel.errores.length > 0 && (
            <>
              <h2>Filas con error ({resultadoExcel.errores.length})</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Fila Excel</th>
                      <th>OP</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultadoExcel.errores.map((e, i) => (
                      <tr key={i}>
                        <td>{e.fila_excel}</td>
                        <td>{e.op}</td>
                        <td>{e.mensaje}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <h2 style={{ marginTop: 32 }}>Cotizaciones y productos por OP</h2>
      <p className="chat-empty">
        Recorre las carpetas de OP en SharePoint (cada una con su archivo "OP-XXXX.xlsx") y
        asigna la cotización a cada OP; si la OP todavía no tiene productos cargados, crea el
        catálogo que falte y agrega sus líneas. No modifica OPs que ya tengan productos.
        Puede tardar varios minutos: recorre una carpeta a la vez.
      </p>

      <div className="form-actions" style={{ margin: '16px 0' }}>
        <button type="button" onClick={sincronizarProductos} disabled={sincronizandoProductos}>
          {sincronizandoProductos ? 'Sincronizando… (puede tardar varios minutos)' : 'Sincronizar ahora'}
        </button>
      </div>

      {errorProductos && <p className="error">{errorProductos}</p>}

      {resultadoProductos && (
        <>
          <div className="stat-row">
            <div className="stat-tile">
              <span className="stat-label">Carpetas revisadas</span>
              <span className="stat-value">{resultadoProductos.carpetas_total}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">OPs con productos nuevos</span>
              <span className="stat-value">{resultadoProductos.ops_con_productos_nuevos}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">OPs que ya tenían productos</span>
              <span className="stat-value">{resultadoProductos.ops_ya_tenian_productos}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">OPs no encontradas en la BD</span>
              <span className="stat-value">{resultadoProductos.ops_no_encontradas}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Carpetas sin archivo OP</span>
              <span className="stat-value">{resultadoProductos.carpetas_sin_archivo_op}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Cotizaciones creadas</span>
              <span className="stat-value">{resultadoProductos.cotizaciones_creadas}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Productos creados</span>
              <span className="stat-value">{resultadoProductos.productos_creados}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Líneas insertadas</span>
              <span className="stat-value">{resultadoProductos.lineas_insertadas}</span>
            </div>
          </div>

          {resultadoProductos.errores.length > 0 && (
            <>
              <h2>Carpetas con error ({resultadoProductos.errores.length})</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>OP</th>
                      <th>Carpeta</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultadoProductos.errores.map((e, i) => (
                      <tr key={i}>
                        <td>{e.op}</td>
                        <td>{e.carpeta}</td>
                        <td>{e.mensaje}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
