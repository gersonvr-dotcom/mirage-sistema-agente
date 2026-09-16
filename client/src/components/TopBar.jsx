import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { LogoMirage } from './LogoMirage';

/** Menú anidado Clientes -> Proyectos -> OPs: pasar el mouse sobre "Clientes" despliega los
 * 3 niveles juntos; hacer clic en cualquiera de los tres navega a su página. */
function ClientesMenu() {
  const location = useLocation();
  const enClientes = location.pathname.startsWith('/clientes');
  const enProyectos = location.pathname.startsWith('/proyectos');
  const enOps = location.pathname.startsWith('/ops');

  const [hover, setHover] = useState(false);

  return (
    <div
      className="clientes-menu"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Link to="/clientes" className={enClientes ? 'nav-active' : ''}>
        Clientes
      </Link>

      {hover && (
        <div className="clientes-dropdown">
          <Link to="/proyectos" className={enProyectos ? 'nav-active' : ''}>
            Proyectos
          </Link>
          <div className="nested-nav-sub">
            <Link to="/ops" className={enOps ? 'nav-active' : ''}>
              OPs
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function TopBar({ title }) {
  const { usuario, logout } = useAuth();
  const esAdmin = usuario?.rol === 'administrador';
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <header className="topbar">
      <div className="topbar-row">
        <button
          type="button"
          className="menu-toggle"
          onClick={() => setMenuAbierto((v) => !v)}
          aria-label="Mostrar menú"
          aria-expanded={menuAbierto}
        >
          ☰
        </button>
        <div className="topbar-brand">
          <LogoMirage className="topbar-logo" />
          <h1>{title}</h1>
        </div>
        <div className="topbar-account">
          <span>{usuario?.nombre}</span>
          <button onClick={logout}>Salir</button>
        </div>
      </div>

      {menuAbierto && (
        <nav className="topbar-menu">
          <ClientesMenu />
          <Link to="/chat">Chat</Link>
          <Link to="/dashboard">Dashboard</Link>
          {esAdmin && <Link to="/usuarios">Usuarios</Link>}
        </nav>
      )}
    </header>
  );
}
