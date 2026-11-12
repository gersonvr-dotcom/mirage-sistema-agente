# Permisos de la app de Azure (TR-03)

La app de Azure ("Mirage Project Point") solo **lee** SharePoint: descarga el Excel Madre, lista carpetas de OP, lee archivos
y baja PDFs de proformas. Todas las llamadas a Microsoft Graph son `GET`; las PIs subidas a mano (R2-05) se guardan en la
base de datos, no en SharePoint. Por eso la app no necesita ningún permiso de escritura.

## Qué llamadas usa

| Para qué | Llamada de Graph |
|----------|------------------|
| Excel Madre y carpeta raíz de OPs | `GET /shares/{enlace}/driveItem` |
| Listar carpetas y archivos de una OP | `GET /drives/{drive}/items/{id}/children` |
| Descargar Excel y PDFs | `GET /drives/{drive}/items/{id}/content` |

## Estado verificado (2026-11-12)

El token de la app trae únicamente: `Sites.Selected`, `Sites.Read.All`, `Files.Read.All`. No hay `Sites.FullControl.All`,
`Sites.ReadWrite.All`, `Files.ReadWrite.All` ni `Sites.Manage.All`: la reducción mínima pedida en TR-03 ya está hecha. Con esos
permisos funcionan las tres integraciones (Excel Madre, índice de documentos y lectura de PDFs).

Se comprueba con:

```bash
node --env-file=.env scripts/verificar_sharepoint.mjs
```

Es de solo lectura: muestra los permisos del token, lee el Excel, lista las carpetas de OP y descarga un PDF (sin guardarlo).
Termina con error si el token trae algún permiso de escritura o administración, o si falla alguna integración.

> En producción hay que confirmar que `SHAREPOINT_CLIENT_ID` (Plesk → Variables de entorno) es la misma app. Si es otra,
> revisar también sus permisos y correr el verificador con sus variables.

## Paso opcional: dejar solo `Sites.Selected`

`Sites.Read.All` y `Files.Read.All` dan lectura sobre **todos** los sitios del tenant. Para limitarla al sitio General:

1. **Dar acceso de lectura al sitio** (lo hace un administrador de Microsoft 365; la app en sí no puede darse este permiso):
   `POST https://graph.microsoft.com/v1.0/sites/{id-del-sitio}/permissions` con
   `{"roles": ["read"], "grantedToIdentities": [{"application": {"id": "<SHAREPOINT_CLIENT_ID>", "displayName": "Mirage Project Point"}}]}`,
   o con PnP PowerShell: `Grant-PnPAzureADAppSitePermission -AppId <SHAREPOINT_CLIENT_ID> -DisplayName "Mirage Project Point" -Site <URL del sitio> -Permissions Read`.
2. En Azure → Registros de aplicaciones → la app → Permisos de API: quitar `Sites.Read.All` y `Files.Read.All` y dejar
   `Sites.Selected` (con consentimiento de administrador).
3. Esperar unos minutos (el token anterior puede seguir vigente hasta una hora) y correr el verificador.
4. **Si falla** el paso 2 del verificador (`/shares/.../driveItem`) con `Sites.Selected`: volver a agregar `Sites.Read.All` y
   `Files.Read.All` y dar de nuevo el consentimiento. Es reversible y no toca datos.

Hacerlo en un momento tranquilo: si algo queda mal, el sync y la lectura de PDFs dejan de funcionar hasta revertir.

## Secreto de cliente

Rotarlo si alguna vez se compartió por chat o por correo (Azure → Certificados y secretos → nuevo secreto, actualizar
`SHAREPOINT_CLIENT_SECRET` en Plesk, reiniciar, y recién entonces borrar el anterior). Anotar su fecha de vencimiento: al
vencer, el sync falla con un error de autenticación.
