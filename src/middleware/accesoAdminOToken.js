import { timingSafeEqual } from 'node:crypto';
import { requireAuth } from './requireAuth.js';
import { requireRole } from './requireRole.js';

export const LARGO_MINIMO_TOKEN = 24;
export const ENCABEZADO_TOKEN = 'x-cron-token';

/** Compara en tiempo constante. Un token ausente o más corto que el mínimo nunca es válido (acceso por token desactivado). */
export function tokenValido(recibido, esperado) {
  if (typeof recibido !== 'string' || typeof esperado !== 'string' || esperado.length < LARGO_MINIMO_TOKEN) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Para las rutas que además de un administrador con sesión puede llamar la tarea programada de Plesk:
 * con el encabezado X-Cron-Token se valida contra CRON_TOKEN; sin el encabezado, sesión de administrador como siempre.
 * Si CRON_TOKEN no está definido (o es corto) el acceso por token queda desactivado.
 */
export function accesoAdminOToken(req, res, next) {
  const recibido = req.get(ENCABEZADO_TOKEN);
  if (recibido === undefined) return requireAuth(req, res, () => requireRole('administrador')(req, res, next));

  if (!tokenValido(recibido, process.env.CRON_TOKEN)) return res.status(401).json({ error: 'Token inválido.' });
  req.user = { rol: 'administrador', via: 'token' };
  next();
}
