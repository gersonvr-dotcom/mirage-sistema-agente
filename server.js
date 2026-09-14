import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { agentRouter } from './src/routes/agent.js';
import { authRouter } from './src/routes/auth.js';
import { proyectosRouter } from './src/routes/proyectos.js';
import { clientesRouter } from './src/routes/clientes.js';
import { usuariosRouter } from './src/routes/usuarios.js';
import { dashboardRouter } from './src/routes/dashboard.js';
import { opsRouter } from './src/routes/ops.js';
import { productosRouter } from './src/routes/productos.js';
import { proveedoresRouter } from './src/routes/proveedores.js';
import { requireAuth } from './src/middleware/requireAuth.js';
import { requireRole } from './src/middleware/requireRole.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, 'client', 'dist');

const app = express();
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/agent', requireAuth, agentRouter);
app.use('/api/proyectos', requireAuth, proyectosRouter);
app.use('/api/clientes', requireAuth, clientesRouter);
app.use('/api/usuarios', requireAuth, requireRole('administrador'), usuariosRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/ops', requireAuth, opsRouter);
app.use('/api/productos', requireAuth, productosRouter);
app.use('/api/proveedores', requireAuth, proveedoresRouter);

if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.type('html').send('<h1>Mirage</h1><p>Sistema agente en línea.</p>');
  });
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
