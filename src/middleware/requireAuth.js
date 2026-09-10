import { COOKIE_NAME, verifyUserToken } from '../auth/jwt.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  try {
    req.user = verifyUserToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Sesión inválida o expirada.' });
  }
}
