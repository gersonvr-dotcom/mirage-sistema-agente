/** Traduce los errores crudos de los SDKs de Gemini/Claude a mensajes claros en español,
 * en vez de exponer el JSON interno del proveedor tal cual al usuario final. */
export function normalizarErrorAgente(err) {
  // SDK de Anthropic: errores estructurados con .status y .error.error
  if (err?.status && err?.error?.error) {
    const { type, message } = err.error.error;
    if (type === 'invalid_request_error' && /credit balance/i.test(message ?? '')) {
      return 'El proveedor Claude no tiene crédito disponible en la cuenta de Anthropic. Usa Gemini o pide al administrador que cargue saldo.';
    }
    if (err.status === 429) {
      return 'El proveedor Claude alcanzó su límite de uso. Intenta de nuevo en unos minutos o cambia de proveedor.';
    }
    return `El proveedor Claude respondió con un error: ${message || 'desconocido'}.`;
  }

  // SDK de Gemini: suele lanzar el JSON del error como texto en err.message
  let cuerpo;
  try {
    cuerpo = JSON.parse(err?.message ?? '');
  } catch {
    cuerpo = null;
  }
  const errorGemini = cuerpo?.error;
  if (errorGemini) {
    if (errorGemini.status === 'RESOURCE_EXHAUSTED' || errorGemini.code === 429) {
      return 'El proveedor Gemini alcanzó su límite de uso gratuito por hoy (free tier). Intenta más tarde, activa facturación en el proyecto de Google, o cambia de proveedor.';
    }
    if (errorGemini.status === 'UNAVAILABLE' || errorGemini.code === 503) {
      return 'El modelo de Gemini está temporalmente saturado por alta demanda. Intenta de nuevo en unos segundos.';
    }
    return `El proveedor Gemini respondió con un error: ${errorGemini.message || 'desconocido'}.`;
  }

  return 'El agente no pudo procesar tu mensaje en este momento. Intenta de nuevo en unos segundos.';
}
