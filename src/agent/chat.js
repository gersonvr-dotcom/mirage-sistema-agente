import { runGeminiChat } from './providers/gemini.js';
import { runClaudeChat } from './providers/claude.js';

const PROVIDERS = {
  gemini: runGeminiChat,
  claude: runClaudeChat,
};

const DEFAULT_PROVIDER = process.env.AGENT_PROVIDER || 'gemini';

/**
 * Despacha el chat del agente al proveedor de modelo indicado ('gemini' o 'claude'),
 * cada uno con su propio formato de historial. No mezclar historiales entre proveedores.
 */
export async function runAgentChat(userMessage, history = [], provider = DEFAULT_PROVIDER) {
  const run = PROVIDERS[provider];
  if (!run) {
    throw new Error(`Proveedor de agente desconocido: "${provider}". Usa "gemini" o "claude".`);
  }
  return run(userMessage, history);
}
