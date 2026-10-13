import { useState } from 'react';
import { api } from '../api';
import { useJob } from '../hooks/useJob';
import { NormalizarProyectos } from '../components/NormalizarProyectos';

export function Configuracion() {
  const [sincronizandoExcel, setSincronizandoExcel] = useState(false);
  const [resultadoExcel, setResultadoExcel] = useState(null);
  const [errorExcel, setErrorExcel] = useState(null);

  const productos = useJob(api.sincronizarProductosOps, api.estadoSincronizacionProductos);
  const cotizaciones = useJob(api.sincronizarCotizaciones, api.estadoSincronizacionCotizaciones);
  const { ejecutando: sincronizandoProductos, resultado: resultadoProductos, error: errorProductos } = productos;
  const sincronizarProductos = productos.iniciar;

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
            <div className="stat-tile">
              <span className="stat-label">OPs reasignadas a su obra</span>
              <span className="stat-value">{resultadoExcel.ops_reasignadas_a_obra}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">OPs marcadas como canceladas (ANULADO)</span>
              <span className="stat-value">{resultadoExcel.ops_marcadas_canceladas}</span>
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

      <h2 style={{ marginTop: 32 }}>Precios de cotizaciones</h2>
      <p className="chat-empty">
        Lee el XLSX de cotización de cada carpeta de OP en SharePoint y guarda en la base las líneas con su precio, el descuento,
        el IVA, el transporte y el total, la fecha real y el anticipo; después copia el precio de venta y el proveedor (fábrica)
        a las líneas de cada OP. Reemplaza las líneas de cotización en cada corrida; no modifica estados ni seguimiento de producción.
        Puede tardar unos minutos: recorre una carpeta a la vez.
      </p>

      <div className="form-actions" style={{ margin: '16px 0' }}>
        <button type="button" onClick={cotizaciones.iniciar} disabled={cotizaciones.ejecutando}>
          {cotizaciones.ejecutando ? 'Sincronizando… (puede tardar unos minutos)' : 'Sincronizar ahora'}
        </button>
      </div>

      {cotizaciones.error && <p className="error">{cotizaciones.error}</p>}

      {cotizaciones.resultado && (
        <>
          <div className="stat-row">
            {[
              ['Carpetas revisadas', cotizaciones.resultado.carpetas_total],
              ['Cotizaciones actualizadas', cotizaciones.resultado.cotizaciones_actualizadas],
              ['Cotizaciones creadas', cotizaciones.resultado.cotizaciones_creadas],
              ['Líneas de cotización guardadas', cotizaciones.resultado.lineas_guardadas],
              ['Líneas de OP con precio', cotizaciones.resultado.items_con_precio],
              ['Con varios precios posibles (sin precio)', cotizaciones.resultado.items_precio_ambiguo],
              ['Sin línea equivalente en la cotización', cotizaciones.resultado.items_sin_coincidencia],
              ['Líneas de OP con proveedor asignado', cotizaciones.resultado.items_con_proveedor],
              ['Carpetas sin XLSX de cotización', cotizaciones.resultado.carpetas_sin_xlsx],
              ['Cotizaciones que no se pudieron leer', cotizaciones.resultado.cotizaciones_sin_datos],
              ['OPs no encontradas en la BD', cotizaciones.resultado.ops_no_encontradas],
            ].map(([etiqueta, valor]) => (
              <div className="stat-tile" key={etiqueta}>
                <span className="stat-label">{etiqueta}</span>
                <span className="stat-value">{valor}</span>
              </div>
            ))}
          </div>

          {cotizaciones.resultado.advertencias.length > 0 && (
            <>
              <h2>Para revisar ({cotizaciones.resultado.advertencias.length})</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>OP</th>
                      <th>Cotización</th>
                      <th>Aviso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cotizaciones.resultado.advertencias.map((a, i) => (
                      <tr key={i}>
                        <td>{a.op}</td>
                        <td>{a.cotizacion}</td>
                        <td>{a.mensaje}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {cotizaciones.resultado.errores.length > 0 && (
            <>
              <h2>Carpetas con error ({cotizaciones.resultado.errores.length})</h2>
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
                    {cotizaciones.resultado.errores.map((e, i) => (
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

      <h2 style={{ marginTop: 32 }}>Normalizar proyectos (obras duplicadas)</h2>
      <p className="chat-empty">
        Una misma obra puede haber quedado registrada como varios proyectos (por ejemplo "ALESTE 137", "ALESTE 137 ADICIONAL" y
        "ALESTE 137 PERFIL"). Aquí se revisan y se fusionan: las OPs pasan a la obra principal como pedidos adicionales, sin perder
        ninguna OP ni cotización. Conviene sincronizar con el Excel Madre antes de normalizar.
      </p>
      <NormalizarProyectos />
    </div>
  );
}
