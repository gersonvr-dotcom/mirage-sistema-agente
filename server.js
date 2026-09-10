import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { agentRouter } from './src/routes/agent.js';
import { authRouter } from './src/routes/auth.js';
import { requireAuth } from './src/middleware/requireAuth.js';

const app = express();
app.use(express.json());
app.use(cookieParser());

app.get('/', (req, res) => {
  res.type('html').send('<h1>Mirage</h1><p>Sistema agente en línea.</p>');
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/agent', requireAuth, agentRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
