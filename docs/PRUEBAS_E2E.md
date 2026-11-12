# Verificación de punta a punta (TR-05)

Los 5 casos reales del requerimiento, como prueba manual repetible. Cada caso se prueba con
**administrador** y con **operador**, primero en local y luego en producción.

Cómo anotar: en la columna "Resultado" poner `OK`, `FALLA` o `N/A`, con fecha. Una diferencia
se registra como tarea nueva en el roadmap, no se arregla "de pasada".

Antes de empezar en producción: seguir [DESPLIEGUE.md](DESPLIEGUE.md) (migraciones, sync, PIs extraídas).

## Corrida local del 2026-11-12 (código al día, datos tras el sync real)

| Caso | Administrador | Operador |
|---|---|---|
| 1. Precios Constructora Izquierdo | OK — 1 llamada; 3 cotizaciones con subtotal, descuento y total | OK — sin permiso para ver precios |
| 2. PI vs OP 2026-001 | OK — 1 llamada; "coincide", tabla por línea | OK — sin permiso (las PIs son de administrador) |
| 3. Contacto RM Arquitectura | PARCIAL — dice que no hay CRM conectado y ofrece OPs/proyectos (2 búsquedas) | PARCIAL — igual (1 búsqueda) |
| 4. Constructora con más m² en 2026 | PARCIAL — avisa que los clientes no tienen tipo y da el ranking general con criterio (EVCO 22.291 m²) | PARCIAL — igual |
| 5. ALESTE 137 = 1 proyecto | OK tras fusionar los datos — Van der Laat y Jiménez: 2 obras (ALESTE 137 con 8 OPs y BLVD 201) | no se repitió tras la fusión final (antes de ella contaba las variantes de ALESTE 137 como obras aparte) |

Los casos 3 y 4 no pasan del todo por dependencias, no por el agente: el 3 espera el CRM (R3/D-04) y el 4 espera cargar
`clientes.tipo` (R4-01: `scripts/tipos_clientes.mjs`). Ningún flujo pasó de 2 llamadas a herramientas.

## Caso 1 — Precios cotizados a Constructora Izquierdo

- **Pregunta:** «¿Qué precios le hemos cotizado a Constructora Izquierdo?»
- **Esperado (admin):** usa `consultar_precios_cotizacion`; si el cliente tiene varias cotizaciones, pregunta cuál (no adivina); muestra precio por producto con moneda y unidad.
- **Esperado (operador):** responde que no tiene permiso para ver precios; no muestra ninguna cifra.
- **Criterio de fallo:** el operador ve algún precio o costo; el agente hace más de 2 llamadas para algo que es una consulta directa.

| Rol | Local (2026-11-09) | Producción |
|---|---|---|
| Administrador | OK — 1 llamada, pide elegir entre 2 cotizaciones | |
| Operador | OK — sin permiso | |

## Caso 2 — PI de MIRAGE contra una OP real

- **Pregunta:** «Compara la PI de la OP 2026-001 con la OP» (probar también 2026-065, que tiene PIs complementarias).
- **Esperado (admin):** una sola llamada a `validar_pi_vs_op`; tabla por producto (cajas y m² de PI vs OP) con estado; menciona PIs duplicadas (se cuentan una vez) y complementarias (REPO/RESERVA/ADICIONAL o sufijo -A/-E/-F: no se suman).
- **Esperado (operador):** sin permiso (las PIs solo las ve el administrador). La subida manual de una PI devuelve 403.
- **Criterio de fallo:** da "diferencia" por sumar copias o PIs complementarias; el operador recibe datos de la PI.
- **Nota:** solo se leen PIs en formato MIRAGE. HARMONY/Progress/Peronda responden "no concluyente" a propósito.

| Rol | Local (2026-11-09) | Producción |
|---|---|---|
| Administrador | OK — 1 llamada, tabla, menciona complementarias | |
| Operador | OK — sin permiso; subida de PI = 403 | |

## Caso 3 — Contacto de RM Arquitectura / Richard Müller Arquitectos

- **Pregunta:** «¿Cuál es el contacto de RM Arquitectura?»
- **Esperado hoy:** dice con claridad que el sistema no tiene datos de contacto (no hay CRM conectado) y ofrece lo que sí hay: OPs y proyectos del cliente. No inventa teléfonos ni correos y no hace búsquedas repetidas.
- **Esperado cuando exista R3 (Zoho):** devuelve el contacto desde el CRM.
- **Estado:** bloqueado por R3 / D-04 (credenciales del CRM). Hoy solo se verifica el mensaje honesto.

| Rol | Local (2026-11-09) | Producción |
|---|---|---|
| Administrador | PARCIAL — dice que no hay CRM; antes de la regla nueva hizo 5 búsquedas | |
| Operador | | |

## Caso 4 — Constructora con más m² en 2026

- **Pregunta:** «¿Qué constructora ha comprado más m² en 2026?»
- **Esperado:** `ranking_clientes_por_m2` filtrando por tipo "constructora", con el criterio a la vista (período, unidad, qué se excluyó, OPs canceladas).
- **Si no hay tipos cargados:** lo avisa y da el ranking general sin filtrar (no inventa la clasificación).
- **Dependencia de datos:** cargar `clientes.tipo` (R4-01: `scripts/tipos_clientes.mjs`). Local: 151 de 152 clientes sin tipo.

| Rol | Local (2026-11-09) | Producción |
|---|---|---|
| Administrador | PARCIAL — ranking general con aviso de que no hay tipos; EVCO 22.291 m² | |
| Operador | OK — el ranking funciona (no expone precios) | |

## Caso 5 — ALESTE 137 cuenta como 1 proyecto

- **Pregunta:** «¿Cuántos proyectos tiene Van der Laat y Jiménez?» y «¿cuántas OPs tiene el proyecto ALESTE 137?»
- **Esperado:** ALESTE 137 aparece como **un** proyecto con todas sus OPs.
- **Estado local:** OK tras fusionar los datos (2026-11-10). Antes fallaba por datos (el agente contaba bien lo que había): 3 proyectos:

  | id | proyecto | cliente |
  |---|---|---|
  | 184 | ALESTE 137 | 80 VAN DER LAAT Y JIMENEZ |
  | 211 | LADRILLO ALESTE 137 | 80 VAN DER LAAT Y JIMENEZ |
  | 93 | ALESTE 137 VITACER | 75 VAN DE LAT Y JIMENEZ (duplicado con error de tipeo) |

- **Arreglo en producción (R5-10):** correr `db/migration_cliente_alias.sql` antes de reiniciar; luego, en Configuración → Normalizar clientes, buscar "VAN DE LAT Y JIMENEZ", dejar como cliente que se queda "VAN DER LAAT Y JIMENEZ", ver qué cambiaría y fusionar; después, en Normalizar proyectos, juntar a mano las variantes de ALESTE 137 (por ejemplo "ALESTE 137 VITACER": el sistema no reconoce VITACER como sufijo, así que no lo sugiere solo). Las IDs pueden diferir: buscar por nombre.
- **El sync ya no lo deshace:** el nombre del cliente fusionado se guarda como alias (`cliente_alias`) y el sync lo consulta antes de crear clientes. Verificado en local el 2026-11-12 con el sync real: el sync reprodujo el duplicado antes de fusionar; tras fusionar desde la pantalla, un segundo sync dio `clientes_creados: 0` y la OP 2026-105 siguió con ALESTE 137.
- **Resultado local tras fusionar (2026-11-12):** el sync real trajo variantes nuevas ("ALESTE 137 VITACER", "ALESTE 137 GRIGLIAS", una OP nueva) y se juntaron con "Normalizar proyectos". Un tercer sync no creó ni reasignó nada y el agente responde: 2 proyectos (ALESTE 137 con 8 OPs y BLVD 201).
- **Orden que funciona en producción:** primero clientes (para que el alias exista), luego proyectos; si se juntan los proyectos antes, el sync puede recrear la variante bajo el cliente duplicado.

| Rol | Local (2026-11-09) | Producción |
|---|---|---|
| Administrador | OK (2026-11-10) — 1 proyecto, 7 OPs, tras fusionar datos | |
| Operador | | |

## Condiciones transversales

- Ningún flujo debe pasar de 6 rondas de herramientas (`MAX_TOOL_ROUNDS`); en local el máximo fue 5.
- Las respuestas con cifras dejan a la vista el criterio aplicado.
- Cuando un dato no existe, el agente lo dice en una frase y ofrece lo que sí hay.
