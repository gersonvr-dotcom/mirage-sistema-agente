import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { LogoMirage } from './LogoMirage';

/** Menú anidado Clientes -> Proyectos -> OPs: cada nivel navega al hacer clic en su nombre,
 * y tiene su propia flechita para desplegar/cerrar el siguiente nivel sin salir de la página. */
function ClientesMenu() {
  const location = useLocation();
  const enClientes = location.pathname.startsWith('/clientes');
  const enProyectos = location.pathname.startsWith('/proyectos');
  const enOps = location.pathname.startsWith('/ops');

  const [abierto, setAbierto] = useState(false);
  const [abiertoProyectos, setAbiertoProyectos] = useState(false);

  return (
    <div className="clientes-menu">
      <div className="nested-nav-row">
        <Link to="/clientes" className={enClientes ? 'nav-active' : ''}>
          Clientes
        </Link>
        <button
          type="button"
          className="nav-caret"
          onClick={() => setAbierto((v) => !v)}
          aria-label="Mostrar proyectos"
          aria-expanded={abierto}
        >
          {abierto ? '▾' : '▸'}
        </button>
      </div>

      {abierto && (
        <div className="clientes-dropdown">
          <div className="nested-nav-row">
            <Link to="/proyectos" className={enProyectos ? 'nav-active' : ''}>
              Proyectos
            </Link>
            <button
              type="button"
              className="nav-caret"
              onClick={() => setAbiertoProyectos((v) => !v)}
              aria-label="Mostrar OPs"
              aria-expanded={abiertoProyectos}
            >
              {abiertoProyectos ? '▾' : '▸'}
            </button>
          </div>

          {abiertoProyectos && (
            <div className="nested-nav-sub">
              <Link to="/ops" className={enOps ? 'nav-active' : ''}>
                OPs
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TopBar({ title }) {
  const { usuario, logout } = useAuth();
  const esAdmin = usuario?.rol === 'administrador';

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <LogoMirage className="topbar-logo" />
        <h1>{title}</h1>
      </div>
      <div className="topbar-nav">
        <ClientesMenu />
        <Link to="/chat">Chat</Link>
        <Link to="/dashboard">Dashboard</Link>
        {esAdmin && <Link to="/usuarios">Usuarios</Link>}
        <span>{usuario?.nombre}</span>
        <button onClick={logout}>Salir</button>
      </div>
    </header>
  );
}
