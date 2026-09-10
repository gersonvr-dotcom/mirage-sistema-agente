import { GoogleGenAI, FunctionCallingConfigMode } from '@google/genai';
import { TOOL_DEFINITIONS, ejecutarTool } from '../tools.js';
import { SYSTEM_PROMPT, MAX_TOOL_ROUNDS } from '../prompt.js';

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

/**
 * Corre el loop del agente para un único mensaje de usuario (con historial opcional en formato
 * Content[] de Gemini) y devuelve la respuesta final más la traza de tools ejecutadas (auditoría).
 */
export async function runGeminiChat(userMessage, history = []) {
  const chat = client.chats.create({
    model: MODEL,
    history,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations: TOOL_DEFINITIONS }],
      toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
    },
  });

  const toolCalls = [];
  let response = await chat.sendMessage({ message: userMessage });

  for (let round = 0; round < MAX_TOOL_ROUNDS && response.functionCalls?.length; round++) {
    const responseParts = [];
    for (const fc of response.functionCalls) {
      let result;
      try {
        result = await ejecutarTool(fc.name, fc.args);
      } catch (err) {
        result = { error: err.message };
      }
      toolCalls.push({ name: fc.name, input: fc.args, result });
      responseParts.push({ functionResponse: { id: fc.id, name: fc.name, response: { result } } });
    }
    response = await chat.sendMessage({ message: responseParts });
  }

  return { reply: response.text, toolCalls, history: chat.getHistory() };
}
