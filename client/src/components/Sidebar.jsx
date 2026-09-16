import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { LogoMirage } from './LogoMirage';

export function Sidebar() {
  const { usuario, logout } = useAuth();
  const esAdmin = usuario?.rol === 'administrador';
  const location = useLocation();

  const enClientes = location.pathname.startsWith('/clientes');
  const enProyectos = location.pathname.startsWith('/proyectos');
  const enOps = location.pathname.startsWith('/ops');

  const [abierto, setAbierto] = useState(enClientes || enProyectos || enOps);

  function link(to, label, activo) {
    return (
      <Link to={to} className={`sidebar-link${activo ? ' sidebar-link-active' : ''}`}>
        {label}
      </Link>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <LogoMirage className="sidebar-logo" />
      </div>

      <nav className="sidebar-nav">
        {link('/chat', 'Chat', location.pathname.startsWith('/chat'))}
        {link('/dashboard', 'Dashboard', location.pathname.startsWith('/dashboard'))}

        <div className={`sidebar-link sidebar-group${enClientes ? ' sidebar-link-active' : ''}`}>
          <Link to="/clientes" className="sidebar-group-label">
            Clientes
          </Link>
          <button
            type="button"
            className="sidebar-caret"
            onClick={() => setAbierto((v) => !v)}
            aria-label="Mostrar proyectos y OPs"
            aria-expanded={abierto}
          >
            {abierto ? '▾' : '▸'}
          </button>
        </div>

        {abierto && (
          <div className="sidebar-sub">
            {link('/proyectos', 'Proyectos', enProyectos)}
            <div className="sidebar-sub">{link('/ops', 'OPs', enOps)}</div>
          </div>
        )}

        {esAdmin && link('/usuarios', 'Usuarios', location.pathname.startsWith('/usuarios'))}
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-user">{usuario?.nombre}</span>
        <button type="button" onClick={logout}>
          Salir
        </button>
      </div>
    </aside>
  );
}
