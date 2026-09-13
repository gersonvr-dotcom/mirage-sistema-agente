/** Convierte el historial crudo de un proveedor (Gemini o Claude) en una lista simple
 * [{ role: 'user' | 'model', text }] para mostrar en el chat, ocultando la plomería interna
 * de llamadas a tools (function calls / tool_use / tool_result). */
export function normalizarHistorial(provider, historial = []) {
  return provider === 'claude' ? normalizarClaude(historial) : normalizarGemini(historial);
}

function normalizarGemini(historial) {
  const mensajes = [];
  for (const turno of historial) {
    const textoPart = turno.parts?.find((p) => typeof p.text === 'string');
    if (!textoPart) continue; // turno de puro functionCall/functionResponse: se omite
    mensajes.push({ role: turno.role === 'model' ? 'model' : 'user', text: textoPart.text });
  }
  return mensajes;
}

function normalizarClaude(historial) {
  const mensajes = [];
  for (const turno of historial) {
    if (typeof turno.content === 'string') {
      mensajes.push({ role: turno.role === 'assistant' ? 'model' : 'user', text: turno.content });
      continue;
    }
    const textoBloque = Array.isArray(turno.content)
      ? turno.content.find((b) => b.type === 'text')
      : null;
    if (!textoBloque) continue; // turno de puro tool_use/tool_result: se omite
    mensajes.push({ role: turno.role === 'assistant' ? 'model' : 'user', text: textoBloque.text });
  }
  return mensajes;
}
