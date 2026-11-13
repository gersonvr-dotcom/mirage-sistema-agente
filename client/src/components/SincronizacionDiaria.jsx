import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';

const POLL_MS = 4000;
const ESTADO_PASO = { pendiente: 'Pendiente', corriendo: 'Corriendo…', completado: 'Listo', error: 'Falló' };

const cuando = (iso) => (iso ? new Date(iso).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica', dateStyle: 'medium', timeStyle: 'short' }) : '—');

// Contadores del resultado de un paso, en una línea (las listas largas ya vienen reducidas a su tamaño).
const detalle = (resumen) =>
  Object.entries(resumen ?? {})
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
    .join(' · ');

/**
 * Las cuatro sincronizaciones juntas. La tarea programada de Plesk las corre cada mañana (docs/DESPLIEGUE.md §4b);
 * aquí se ve cómo salió la última vez y se pueden lanzar a mano. El estado vive en el servidor (en memoria): un reinicio
 * de la app lo borra y entonces se muestra "sin ejecuciones desde el último reinicio".
 */
export function SincronizacionDiaria() {
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState(null);
  const intervalo = useRef(null);

  const detener = useCallback(() => {
    if (intervalo.current) {
      clearInterval(intervalo.current);
      intervalo.current = null;
    }
  }, []);

  const aplicar = useCallback(
    (e) => {
      setEstado(e);
      if (e.estado !== 'corriendo') detener();
    },
    [detener]
  );

  const seguir = useCallback(() => {
    detener();
    intervalo.current = setInterval(async () => {
      try {
        aplicar(await api.estadoSincronizarTodo());
      } catch (err) {
        detener();
        setError(err.message);
      }
    }, POLL_MS);
  }, [aplicar, detener]);

  useEffect(() => {
    api
      .estadoSincronizarTodo()
      .then((e) => {
        aplicar(e);
        if (e.estado === 'corriendo') seguir();
      })
      .catch((err) => setError(err.message));
    return detener;
  }, [aplicar, seguir, detener]);

  async function lanzar() {
    setError(null);
    try {
      const e = await api.sincronizarTodo();
      aplicar(e);
      if (e.estado === 'corriendo') seguir();
    } catch (err) {
      setError(err.message);
    }
  }

  const corriendo = estado?.estado === 'corriendo';
  const sinEjecuciones = !estado || estado.estado === 'inactivo';

  return (
    <>
      <h2>Sincronización automática diaria</h2>
      <p className="chat-empty">
        Corre las cuatro sincronizaciones de esta página, en orden (Excel Madre, cotizaciones y productos, precios y documentos),
        sin usar el modelo de IA. La tarea programada del servidor la lanza todas las mañanas; aquí ves cómo salió la última y
        también puedes ejecutarla ahora. Si un paso falla, los siguientes igual se ejecutan.
      </p>

      <div className="form-actions" style={{ margin: '16px 0' }}>
        <button type="button" onClick={lanzar} disabled={corriendo}>
          {corriendo ? 'Ejecutando… (puede tardar varios minutos)' : 'Ejecutar todo ahora'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {sinEjecuciones && !error && <p className="chat-empty">Sin ejecuciones desde el último reinicio de la aplicación.</p>}

      {!sinEjecuciones && (
        <>
          <p className="chat-empty">
            {corriendo ? 'En curso desde' : 'Última ejecución:'} {cuando(estado.iniciadoEn)} ({estado.origen === 'programada' ? 'automática' : 'manual'})
            {!corriendo && ` · terminó ${cuando(estado.terminadoEn)}`}
            {!corriendo && (estado.pasos_con_error > 0 ? ` · ${estado.pasos_con_error} paso(s) con error` : ' · sin errores')}
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Paso</th>
                  <th>Estado</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {estado.pasos.map((p) => (
                  <tr key={p.clave}>
                    <td>{p.nombre}</td>
                    <td>{ESTADO_PASO[p.estado] ?? p.estado}</td>
                    <td>{p.estado === 'error' ? <span className="error">{p.error}</span> : detalle(p.resumen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
