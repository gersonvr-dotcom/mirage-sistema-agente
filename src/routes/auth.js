import { Router } from 'express';
import { buscarUsuarioPorEmail } from '../db/queries.js';
import { verifyPassword } from '../auth/password.js';
import { COOKIE_NAME, signUserToken } from '../auth/jwt.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const authRouter = Router();

const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000;

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Faltan "email" y/o "password" en el body.' });
  }

  try {
    const usuario = await buscarUsuarioPorEmail(email);
    const passwordOk = usuario ? await verifyPassword(password, usuario.password_hash) : false;
    if (!passwordOk) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const token = signUserToken(usuario);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAX_AGE_MS,
    });
    res.json({ usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo procesar el login.', detail: err.message });
  }
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ usuario: { id: req.user.sub, email: req.user.email, nombre: req.user.nombre, rol: req.user.rol } });
});
