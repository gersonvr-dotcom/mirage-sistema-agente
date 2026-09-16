import { Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export function AdminRoute({ children }) {
  const { usuario } = useAuth();

  if (usuario === undefined) return <p style={{ padding: 24 }}>Cargando…</p>;
  if (usuario === null) return <Navigate to="/login" replace />;
  if (usuario.rol !== 'administrador') return <Navigate to="/chat" replace />;
  return children;
}
