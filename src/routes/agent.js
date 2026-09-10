import { Router } from 'express';
import { runAgentChat } from '../agent/chat.js';

export const agentRouter = Router();

agentRouter.post('/chat', async (req, res) => {
  const { message, history, provider } = req.body ?? {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Falta "message" (string) en el body.' });
  }

  try {
    const { reply, toolCalls, history: updatedHistory } = await runAgentChat(
      message,
      Array.isArray(history) ? history : [],
      provider,
    );
    res.json({ reply, toolCalls, history: updatedHistory });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'El agente no pudo procesar la conversación.', detail: err.message });
  }
});
