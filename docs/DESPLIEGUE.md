# Checklist de salida a producción

Producción es Plesk (mirage.gixacr.com), sin SSH, y su base de datos **no es accesible desde desarrollo**. Por eso todo
cambio de esquema viaja como un `.sql` idempotente que se corre a mano en phpMyAdmin, **antes** de reiniciar la app.
Copia esta lista en cada entrega y marca cada paso.

## 0. Antes de empezar
- [ ] `npm test` pasa (y `npm run test:db` si se tocaron consultas; usa una BD desechable `test_<DB_NAME>`, no toca datos).
- [ ] Los commits están en `main` y el `git push` lo hace una persona (Claude Code no puede).
- [ ] Si la entrega trae la migración `migration_proveedores_progress.sql` (borra el proveedor duplicado): exportar antes la
      BD desde phpMyAdmin (Exportar → Rápido). Es la única migración que no se puede deshacer.

## 1. Base de datos (phpMyAdmin → BD de Mirage → pestaña SQL)
1. [ ] Pegar y ejecutar `db/verificar_migraciones.sql` (solo lectura). Muestra por migración qué objetos ya existen:
   `aplicado = 0` en alguna fila → esa migración falta.
2. [ ] Ejecutar las migraciones que falten **en este orden** (todas son idempotentes; correr una de más no daña):

   | # | Archivo | Qué hace |
   |---|---------|----------|
   | 1 | `migration_ops_comercial.sql` | columnas comerciales de `ops` (cotización, fecha pactada, OC, observaciones) |
   | 2 | `migration_op_items_detalle.sql` | acabado, cajas, m²/caja y notas por línea de OP |
   | 3 | `migration_proyectos_jerarquia.sql` | tipo de pedido y `proyecto_alias` (obra matriz) |
   | 4 | `migration_financiero.sql` | precios, descuentos, importes y costos; `cotizacion_items` |
   | 5 | `migration_clientes_tipo.sql` | `clientes.tipo` (MIRAGE = interno) |
   | 6 | `migration_cotizaciones_transporte.sql` | `cotizaciones.transporte` |
   | 7 | `migration_op_items_formato.sql` | formato por línea de OP |
   | 8 | `migration_documentos_op.sql` | índice de documentos de SharePoint |
   | 9 | `migration_ops_fabrica.sql` | `ops.fabrica` |
   | 10 | `migration_proveedores_progress.sql` | unifica PROGRESS en PROGRESS PROFILE (**ajusta datos**) |
   | 11 | `migration_documentos_manuales.sql` | carga manual de PIs (`documentos_op.origen`, `documentos_op_archivos`) |

3. [ ] Volver a correr `db/verificar_migraciones.sql`: todas las filas en `1`.
4. Escribir siempre desde phpMyAdmin o con `utf8mb4` (un `mysql -e` crudo corrompe tildes y ñ).

## 2. Variables de entorno (Plesk → Node.js → Variables de entorno)
Requeridas (si falta alguna, el servidor o la función correspondiente falla):

| Variable | Para qué |
|----------|----------|
| `JWT_SECRET`, `JWT_EXPIRES_IN` | sesión |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | base de datos |
| `AGENT_PROVIDER` (`gemini` o `claude`), `AGENT_TOKEN_LIMIT` | agente y su límite de uso |
| `GEMINI_API_KEY`, `GEMINI_MODEL` / `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_MAX_TOKENS` | según el proveedor elegido |
| `SHAREPOINT_TENANT_ID`, `SHAREPOINT_CLIENT_ID`, `SHAREPOINT_CLIENT_SECRET`, `SHAREPOINT_SHARE_URL`, `SHAREPOINT_OPS_FOLDER_URL` | lectura de SharePoint (Excel Madre, carpetas de OP, PIs) |

Opcionales (tienen valor por defecto):

| Variable | Por defecto | Para qué |
|----------|-------------|----------|
| `EXTRACTOR_PROVIDER` | el de `AGENT_PROVIDER` | quién lee los PDF de PIs |
| `GEMINI_EXTRACTOR_MODEL` / `ANTHROPIC_EXTRACTOR_MODEL` | el modelo del agente | modelo de lectura de PIs |
| `EXTRACCION_ESPERA_MS` | 25000 | cuánto espera el agente una lectura de PI antes de decir "procesando" (menor que el timeout del proxy) |

- [ ] Variables nuevas de la entrega cargadas y guardadas. Nunca se pegan claves en chats ni en el repo.
- La lectura de PIs gasta cuota de la API del modelo, pero **no** cuenta contra `AGENT_TOKEN_LIMIT` (se registra en `meta.usage` de cada documento).

## 3. Código en Plesk
1. [ ] Git → **Pull ahora**.
2. [ ] Node.js → **NPM install** (el `postinstall` compila el cliente).
3. [ ] Node.js → **Restart App**.
4. [ ] `https://mirage.gixacr.com/api/health` responde `{"status":"ok"}` y el login funciona.

## 4. Sincronizaciones (Configuración, como administrador)
Cada botón corre en segundo plano y se consulta con polling: el proxy de Plesk corta con 504 las peticiones largas,
así que **no** hay que quedarse esperando una sola petición. En este orden, esperando a que cada una termine:
1. [ ] **Sincronización con Excel Madre 2026** → Sincronizar ahora (OPs, clientes, proyectos, anuladas).
2. [ ] **Cotizaciones y productos por OP** → Sincronizar ahora (líneas, formato, fábrica, proveedor por línea). Tarda varios minutos.
3. [ ] **Precios de cotizaciones** → Sincronizar ahora (precios, descuentos, monedas).
4. [ ] **Documentos de las OPs** → Indexar ahora (índice de PIs, facturas, etc.; no descarga nada). Las PIs se leen al
   preguntar al agente o al validarlas, no aquí.

Antes de dar por buenas las métricas, comprobar que la cantidad de OPs de la BD coincide con las carpetas de SharePoint
(ahí hay más carpetas que OPs si el Excel Madre aún no las trae: eso es esperable).

## 5. Verificación con una consulta real
- [ ] Como **administrador**, en el chat: «¿Qué constructora compró más m² en 2026?» → responde con el criterio (solo M2, sin
      anuladas ni internos) y coincide con el ranking del Dashboard.
- [ ] Como administrador: «Valida la PI de la OP 2026-001» → `coincide`, sin errores de lectura.
- [ ] Como **operador**: pedirle precios o PIs → responde que no tiene permiso (solo el administrador ve precios y costos).
- [ ] Detalle de una OP como administrador: aparece **Documentos** con **Subir PI (PDF)**; como operador, no.
- [ ] Revisar el log de la app en Plesk: sin errores `ER_BAD_FIELD_ERROR` (señal de una migración sin correr).

## 6. Si algo sale mal
- Las migraciones solo **agregan** columnas y tablas (salvo la 10): se puede volver al commit anterior sin deshacer la BD.
- Error `Unknown column ...` al arrancar o al abrir una pantalla → falta correr una migración (paso 1).
- `504` en una sincronización → ya corre en segundo plano; recargar Configuración y mirar el estado, no relanzarla.
- Después de cualquier despliegue hay que **reiniciar** la app: el código nuevo no se carga solo.

## Datos que no pertenecen al repositorio
No se suben PDFs de clientes ni de proveedores, CSV con clientes, ni archivos `.env`. Los CSV de carga inicial
(`scripts/tipos_clientes.mjs`) se generan fuera del repo.
