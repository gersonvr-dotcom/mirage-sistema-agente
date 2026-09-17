import { useState } from 'react';
import { api } from '../api';

export function Configuracion() {
  const [sincronizando, setSincronizando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);

  async function sincronizar() {
    setSincronizando(true);
    setError(null);
    setResultado(null);
    try {
      const data = await api.sincronizarExcelMadre();
      setResultado(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSincronizando(false);
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
        <button type="button" onClick={sincronizar} disabled={sincronizando}>
          {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {resultado && (
        <>
          <div className="stat-row">
            <div className="stat-tile">
              <span className="stat-label">Filas en el Excel</span>
              <span className="stat-value">{resultado.filas_excel}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Procesadas</span>
              <span className="stat-value">{resultado.filas_procesadas}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Excluidas</span>
              <span className="stat-value">{resultado.filas_excluidas}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Clientes creados</span>
              <span className="stat-value">{resultado.clientes_creados}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Proyectos creados</span>
              <span className="stat-value">{resultado.proyectos_creados}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Cotizaciones creadas</span>
              <span className="stat-value">{resultado.cotizaciones_creadas}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">OPs creadas</span>
              <span className="stat-value">{resultado.ops_creadas}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">OPs actualizadas</span>
              <span className="stat-value">{resultado.ops_actualizadas}</span>
            </div>
          </div>

          {resultado.errores.length > 0 && (
            <>
              <h2>Filas con error ({resultado.errores.length})</h2>
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
                    {resultado.errores.map((e, i) => (
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
    </div>
  );
}
