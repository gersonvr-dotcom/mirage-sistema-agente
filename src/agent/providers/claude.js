import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, ejecutarTool } from '../tools.js';
import { SYSTEM_PROMPT, MAX_TOOL_ROUNDS } from '../prompt.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const MAX_TOKENS = Number(process.env.ANTHROPIC_MAX_TOKENS) || 1024;

const CLAUDE_TOOLS = TOOL_DEFINITIONS.map(({ name, description, parametersJsonSchema }) => ({
  name,
  description,
  input_schema: parametersJsonSchema,
}));

/**
 * Corre el loop del agente para un único mensaje de usuario (con historial opcional en formato
 * MessageParam[] de Anthropic) y devuelve la respuesta final más la traza de tools ejecutadas.
 */
export async function runClaudeChat(userMessage, history = []) {
  const messages = [...history, { role: 'user', content: userMessage }];
  const toolCalls = [];

  const request = () =>
    client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: CLAUDE_TOOLS,
      messages,
    });

  let response = await request();

  for (let round = 0; round < MAX_TOOL_ROUNDS && response.stop_reason === 'tool_use'; round++) {
    messages.push({ role: 'assistant', content: response.content });

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      let result;
      try {
        result = await ejecutarTool(block.name, block.input);
      } catch (err) {
        result = { error: err.message };
      }
      toolCalls.push({ name: block.name, input: block.input, result });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: 'user', content: toolResults });

    response = await request();
  }

  messages.push({ role: 'assistant', content: response.content });
  const reply = response.content.find((block) => block.type === 'text')?.text ?? '';

  return { reply, toolCalls, history: messages };
}
