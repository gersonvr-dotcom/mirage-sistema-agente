import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { Login } from './pages/Login';
import { Proyectos } from './pages/Proyectos';
import { ProyectoForm } from './pages/ProyectoForm';
import { Usuarios } from './pages/Usuarios';
import { Dashboard } from './pages/Dashboard';
import { Chat } from './pages/Chat';
import { OPs } from './pages/OPs';
import { OPForm } from './pages/OPForm';
import { OPDetail } from './pages/OPDetail';
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
            path="/ops"
            element={
              <ProtectedRoute>
                <OPs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ops/nueva"
            element={
              <ProtectedRoute>
                <OPForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ops/:id"
            element={
              <ProtectedRoute>
                <OPDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Chat />
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
