import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';

export function Chat() {
  const [mensajes, setMensajes] = useState([]);
  const [provider, setProvider] = useState('gemini');
  const [usage, setUsage] = useState({ tokensInput: 0, tokensOutput: 0, limit: 200000 });
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [limitReached, setLimitReached] = useState(false);
  const { usuario, logout } = useAuth();
  const finRef = useRef(null);

  useEffect(() => {
    api
      .conversacionAgente()
      .then((data) => {
        setMensajes(data.mensajes);
        setUsage(data.usage);
        if (data.provider) setProvider(data.provider);
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
      <header className="topbar">
        <h1>Chat del agente</h1>
        <div>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/proyectos">Proyectos</Link>
          {usuario?.rol === 'administrador' && <Link to="/usuarios">Usuarios</Link>}
          <span>{usuario?.nombre}</span>
          <button onClick={logout}>Salir</button>
        </div>
      </header>

      <div className="chat-meta">
        <select value={provider} onChange={(e) => setProvider(e.target.value)}>
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
      {limitReached && <p className="error">Esta conversación alcanzó su límite de uso. Puedes seguir hablando con el agente después de que un administrador la reinicie.</p>}

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
