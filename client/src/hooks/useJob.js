import { useCallback, useEffect, useRef, useState } from 'react';

const POLL_MS = 4000;

/**
 * Trabajo largo del servidor que corre en segundo plano (ver registrarJob en src/routes/config.js):
 * `iniciar` lo dispara y se consulta su estado cada pocos segundos hasta que termina. Si la página se recarga
 * con el trabajo todavía corriendo, retoma el seguimiento en vez de perderlo de vista.
 */
export function useJob(disparar, consultar) {
  const [ejecutando, setEjecutando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const intervalo = useRef(null);

  const detener = useCallback(() => {
    if (intervalo.current) {
      clearInterval(intervalo.current);
      intervalo.current = null;
    }
  }, []);

  const aplicar = useCallback(
    (estado) => {
      if (estado.estado === 'completado') {
        detener();
        setResultado(estado.resultado);
        setEjecutando(false);
      } else if (estado.estado === 'error') {
        detener();
        setError(estado.error);
        setEjecutando(false);
      } else if (estado.estado === 'corriendo') {
        setEjecutando(true);
      }
    },
    [detener]
  );

  const seguir = useCallback(() => {
    detener();
    intervalo.current = setInterval(async () => {
      try {
        aplicar(await consultar());
      } catch (err) {
        detener();
        setError(err.message);
        setEjecutando(false);
      }
    }, POLL_MS);
  }, [aplicar, consultar, detener]);

  useEffect(() => {
    consultar()
      .then((estado) => {
        aplicar(estado);
        if (estado.estado === 'corriendo') seguir();
      })
      .catch(() => {});
    return detener;
  }, [consultar, aplicar, seguir, detener]);

  const iniciar = useCallback(async () => {
    setError(null);
    setResultado(null);
    setEjecutando(true);
    try {
      const estado = await disparar();
      aplicar(estado);
      if (estado.estado === 'corriendo') seguir();
    } catch (err) {
      setError(err.message);
      setEjecutando(false);
    }
  }, [disparar, aplicar, seguir]);

  return { ejecutando, resultado, error, iniciar };
}
