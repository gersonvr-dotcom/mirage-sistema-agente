import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(undefined); // undefined = cargando, null = sin sesión

  useEffect(() => {
    api
      .me()
      .then(({ usuario }) => setUsuario(usuario))
      .catch(() => setUsuario(null));
  }, []);

  async function login(email, password) {
    const { usuario } = await api.login(email, password);
    setUsuario(usuario);
  }

  async function logout() {
    await api.logout();
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
