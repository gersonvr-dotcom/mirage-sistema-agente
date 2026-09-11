import { Router } from 'express';
import { listarUsuarios, crearUsuario } from '../db/queries.js';
import { hashPassword } from '../auth/password.js';

export const usuariosRouter = Router();

const ROLES_VALIDOS = ['administrador', 'operador'];

usuariosRouter.get('/', async (req, res) => {
  try {
    const usuarios = await listarUsuarios();
    res.json({ usuarios });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo listar los usuarios.', detail: err.message });
  }
});

usuariosRouter.post('/', async (req, res) => {
  const { email, password, nombre, rol } = req.body ?? {};
  if (!email || !password || !nombre || !rol) {
    return res.status(400).json({ error: 'Faltan "email", "password", "nombre" y/o "rol" en el body.' });
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return res.status(400).json({ error: `"rol" debe ser uno de: ${ROLES_VALIDOS.join(', ')}.` });
  }

  try {
    const password_hash = await hashPassword(password);
    const usuario = await crearUsuario({ email, password_hash, nombre, rol });
    res.status(201).json({ usuario });
  } catch (err) {
    if (err.code === 'EMAIL_DUPLICADO') {
      return res.status(409).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'No se pudo crear el usuario.', detail: err.message });
  }
});
