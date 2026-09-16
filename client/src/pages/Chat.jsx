import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { TopBar } from '../components/TopBar';

export function Chat() {
  const [mensajes, setMensajes] = useState([]);
  const [provider, setProvider] = useState('gemini');
  const [usage, setUsage] = useState({ tokensInput: 0, tokensOutput: 0, limit: 200000 });
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [limitReached, setLimitReached] = useState(false);
  const finRef = useRef(null);
  // Recuerda a qué proveedor pertenece el límite cargado: cambiar de proveedor arranca una
  // conversación nueva (ver chat.js), así que el bloqueo no debe seguir aplicando en ese caso.
  const limiteProviderRef = useRef(null);

  useEffect(() => {
    api
      .conversacionAgente()
      .then((data) => {
        setMensajes(data.mensajes);
        setUsage(data.usage);
        if (data.provider) setProvider(data.provider);
        const alcanzado = data.usage.tokensInput + data.usage.tokensOutput >= data.usage.limit;
        if (alcanzado) {
          limiteProviderRef.current = data.provider ?? 'gemini';
          setLimitReached(true);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  async function enviar(e) {
    e.preventDefault();
    const mensaje = texto.trim();
    if (!mensaje || enviando) return;

    setMensajes((m) => [...m, { role: 'user', text: mensaje }]);
    setTexto('');
    setEnviando(true);
    setError(null);

    try {
      const res = await api.chatAgente(mensaje, provider);
      setMensajes((m) => [...m, { role: 'model', text: res.reply }]);
      setUsage(res.usage);
      setLimitReached(res.limitReached);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const totalTokens = usage.tokensInput + usage.tokensOutput;
  const porcentajeUso = Math.min(100, (totalTokens / usage.limit) * 100);
  const cercaDelLimite = porcentajeUso >= 90;

  return (
    <div className="page chat-page">
      <TopBar title="Chat del agente" />

      <div className="chat-meta">
        <select
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value);
            setLimitReached(e.target.value === limiteProviderRef.current);
          }}
        >
          <option value="gemini">Gemini</option>
          <option value="claude">Claude</option>
        </select>
        <div className="chat-usage" title={`${totalTokens.toLocaleString('es')} / ${usage.limit.toLocaleString('es')} tokens usados en esta conversación`}>
          <div className="bar-track chat-usage-track">
            <div
              className={`bar-fill ${cercaDelLimite ? 'estado-terminal' : 'estado-pipeline'}`}
              style={{ width: `${porcentajeUso}%` }}
            />
          </div>
          <span className="chat-usage-label">{totalTokens.toLocaleString('es')} / {usage.limit.toLocaleString('es')} tokens</span>
        </div>
      </div>

      <div className="chat-messages">
        {cargando ? (
          <p>Cargando…</p>
        ) : mensajes.length === 0 ? (
          <p className="chat-empty">Escríbele al agente para empezar — puede consultar OPs, clientes, proyectos y material pendiente, y también crear o editar proyectos.</p>
        ) : (
          mensajes.map((m, i) => (
            <div key={i} className={`chat-bubble chat-bubble-${m.role}`}>
              {m.text}
            </div>
          ))
        )}
        {enviando && <div className="chat-bubble chat-bubble-model chat-bubble-loading">Pensando…</div>}
        <div ref={finRef} />
      </div>

      {error && <p className="error">{error}</p>}
      {limitReached && (
        <p className="error">
          Esta conversación alcanzó su límite de uso. Cambia de proveedor arriba (Gemini/Claude) para empezar una conversación nueva.
        </p>
      )}

      <form onSubmit={enviar} className="chat-input-row">
        <input
          placeholder="Escribe tu mensaje…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={enviando || limitReached}
        />
        <button type="submit" disabled={enviando || limitReached || !texto.trim()}>
          Enviar
        </button>
      </form>
    </div>
  );
}
