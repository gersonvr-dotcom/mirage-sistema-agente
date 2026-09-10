import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

export const COOKIE_NAME = 'mirage_token';

export function signUserToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, rol: user.rol, nombre: user.nombre }, SECRET, {
    expiresIn: EXPIRES_IN,
  });
}

export function verifyUserToken(token) {
  return jwt.verify(token, SECRET);
}
