import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { Login } from './pages/Login';
import { Proyectos } from './pages/Proyectos';
import { ProyectoForm } from './pages/ProyectoForm';
import { Usuarios } from './pages/Usuarios';
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/proyectos"
            element={
              <ProtectedRoute>
                <Proyectos />
              </ProtectedRoute>
            }
          />
          <Route
            path="/proyectos/nuevo"
            element={
              <ProtectedRoute>
                <ProyectoForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/proyectos/:id"
            element={
              <ProtectedRoute>
                <ProyectoForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/usuarios"
            element={
              <AdminRoute>
                <Usuarios />
              </AdminRoute>
            }
          />
          <Route path="*" element={<Navigate to="/proyectos" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
