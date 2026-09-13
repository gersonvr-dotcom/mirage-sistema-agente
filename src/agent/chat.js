import { runGeminiChat } from './providers/gemini.js';
import { runClaudeChat } from './providers/claude.js';
import { obtenerConversacion, guardarConversacion, registrarAccionAgente } from '../db/queries.js';

const PROVIDERS = {
  gemini: runGeminiChat,
  claude: runClaudeChat,
};

const DEFAULT_PROVIDER = process.env.AGENT_PROVIDER || 'gemini';
const LIMITE_TOKENS = Number(process.env.AGENT_TOKEN_LIMIT) || 200000;

const ACCIONES_ESCRITURA = new Set(['crear_proyecto', 'editar_proyecto', 'eliminar_proyecto']);

function fueEjecutada(toolCall) {
  const r = toolCall.result;
  return r && (r.creado === true || r.editado === true || r.eliminado === true);
}

/**
 * Despacha el chat del agente al proveedor indicado ('gemini' o 'claude'), recuperando y
 * guardando la conversación del usuario en MariaDB (memoria persistente entre sesiones),
 * acumulando su consumo de tokens (con límite duro por conversación) y registrando en
 * auditoría cada acción de escritura que el agente ejecutó de verdad.
 */
export async function runAgentChat(usuarioId, userMessage, providerSolicitado) {
  const previa = await obtenerConversacion(usuarioId);

  // El historial de Gemini y Claude no son compatibles entre sí: si el usuario cambia de
  // proveedor, se arranca una conversación nueva en vez de romper con un formato mixto.
  const continuaConversacion = previa && (!providerSolicitado || providerSolicitado === previa.provider);
  const provider = providerSolicitado || previa?.provider || DEFAULT_PROVIDER;

  const run = PROVIDERS[provider];
  if (!run) {
    throw new Error(`Proveedor de agente desconocido: "${provider}". Usa "gemini" o "claude".`);
  }

  const tokensPrevios = continuaConversacion ? previa.tokens_input + previa.tokens_output : 0;
  if (tokensPrevios >= LIMITE_TOKENS) {
    return {
      reply:
        `Esta conversación alcanzó su límite de uso (${LIMITE_TOKENS.toLocaleString('es')} tokens) ` +
        'para evitar sobrecostos. Puedes seguir usando el agente en una conversación nueva.',
      toolCalls: [],
      limitReached: true,
      usage: { tokensInput: previa.tokens_input, tokensOutput: previa.tokens_output, limit: LIMITE_TOKENS },
    };
  }

  const historialPrevio = continuaConversacion ? previa.historial : [];
  const { reply, toolCalls, history, usage } = await run(userMessage, historialPrevio);

  const tokensInputTotal = (continuaConversacion ? previa.tokens_input : 0) + (usage?.inputTokens ?? 0);
  const tokensOutputTotal = (continuaConversacion ? previa.tokens_output : 0) + (usage?.outputTokens ?? 0);

  const conversacionId = await guardarConversacion({
    usuarioId,
    provider,
    historial: history,
    tokensInput: tokensInputTotal,
    tokensOutput: tokensOutputTotal,
  });

  for (const toolCall of toolCalls) {
    if (ACCIONES_ESCRITURA.has(toolCall.name) && fueEjecutada(toolCall)) {
      await registrarAccionAgente({
        usuarioId,
        conversacionId,
        toolName: toolCall.name,
        input: toolCall.input,
        resultado: toolCall.result,
      });
    }
  }

  return {
    reply,
    toolCalls,
    usage: { tokensInput: tokensInputTotal, tokensOutput: tokensOutputTotal, limit: LIMITE_TOKENS },
  };
}
