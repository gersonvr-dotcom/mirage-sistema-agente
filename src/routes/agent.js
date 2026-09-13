import { Router } from 'express';
import { runAgentChat } from '../agent/chat.js';
import { obtenerConversacion, listarAccionesAgente } from '../db/queries.js';
import { normalizarHistorial } from '../agent/normalizarHistorial.js';
import { normalizarErrorAgente } from '../agent/errors.js';

export const agentRouter = Router();

const LIMITE_TOKENS = Number(process.env.AGENT_TOKEN_LIMIT) || 200000;

agentRouter.get('/conversacion', async (req, res) => {
  try {
    const conversacion = await obtenerConversacion(req.user.sub);
    if (!conversacion) {
      return res.json({ provider: null, mensajes: [], usage: { tokensInput: 0, tokensOutput: 0, limit: LIMITE_TOKENS } });
    }
    res.json({
      provider: conversacion.provider,
      mensajes: normalizarHistorial(conversacion.provider, conversacion.historial),
      usage: {
        tokensInput: conversacion.tokens_input,
        tokensOutput: conversacion.tokens_output,
        limit: LIMITE_TOKENS,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo cargar la conversación.', detail: err.message });
  }
});

agentRouter.get('/auditoria', async (req, res) => {
  try {
    const acciones = await listarAccionesAgente({ limit: req.query.limit });
    res.json({ acciones });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo cargar la auditoría del agente.', detail: err.message });
  }
});

agentRouter.post('/chat', async (req, res) => {
  const { message, provider } = req.body ?? {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Falta "message" (string) en el body.' });
  }

  try {
    const { reply, toolCalls, usage, limitReached } = await runAgentChat(req.user.sub, message, provider);
    res.json({ reply, toolCalls, usage, limitReached: limitReached ?? false });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: normalizarErrorAgente(err) });
  }
});
