import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Clientes } from './pages/Clientes';
import { ClienteForm } from './pages/ClienteForm';
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
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/clientes/nuevo" element={<ClienteForm />} />
            <Route path="/clientes/:id" element={<ClienteForm />} />
            <Route path="/proyectos" element={<Proyectos />} />
            <Route path="/proyectos/nuevo" element={<ProyectoForm />} />
            <Route path="/proyectos/:id" element={<ProyectoForm />} />
            <Route path="/ops" element={<OPs />} />
            <Route path="/ops/nueva" element={<OPForm />} />
            <Route path="/ops/:id" element={<OPDetail />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/chat" element={<Chat />} />
            <Route
              path="/usuarios"
              element={
                <AdminRoute>
                  <Usuarios />
                </AdminRoute>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
