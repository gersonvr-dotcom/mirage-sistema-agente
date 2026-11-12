// Verifica la conexión con SharePoint (Microsoft Graph) con los permisos que tenga HOY la app de Azure (TR-03).
// Solo lectura: no escribe ni guarda nada. Se corre antes y después de reducir los permisos de la app, para comprobar que
// el sync del Excel Madre, el índice de documentos y la lectura de PDFs siguen funcionando.
// Uso: node --env-file=.env scripts/verificar_sharepoint.mjs
import { obtenerAccessToken, obtenerFilasComerciales, graphGet, graphDescargarContenido } from '../src/services/sharepoint.js';
import { listarCarpetasOP } from '../src/services/opFolders.js';

// Permisos de aplicación (roles del token) que dejan ESCRIBIR o administrar; la app solo necesita leer.
const ROLES_DE_ESCRITURA = /(ReadWrite|FullControl|Manage|Write)/i;
const ROLES_SOLO_LECTURA_ACEPTABLES = ['Sites.Selected', 'Files.Read.All', 'Sites.Read.All'];

let fallos = 0;
const ok = (msg) => console.log(`  OK     ${msg}`);
const falla = (msg) => {
  fallos++;
  console.log(`  FALLA  ${msg}`);
};

async function paso(titulo, fn) {
  console.log(`\n${titulo}`);
  try {
    await fn();
  } catch (err) {
    falla(String(err.message).slice(0, 300));
  }
}

function rolesDelToken(token) {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  return payload.roles ?? [];
}

let token;
let carpetas = [];

await paso('1. Autenticación y permisos del token', async () => {
  token = await obtenerAccessToken();
  ok('token obtenido');
  const roles = rolesDelToken(token);
  console.log(`         permisos de aplicación: ${roles.length ? roles.join(', ') : '(ninguno)'}`);
  const escritura = roles.filter((r) => ROLES_DE_ESCRITURA.test(r));
  if (escritura.length) falla(`la app tiene permisos de escritura/administración que no usa: ${escritura.join(', ')}`);
  else ok('sin permisos de escritura ni administración');
  if (!roles.some((r) => ROLES_SOLO_LECTURA_ACEPTABLES.includes(r))) falla('no tiene ningún permiso de lectura de SharePoint');
  if (roles.includes('Sites.Selected')) console.log('         (Sites.Selected: solo funciona sobre los sitios a los que se les concedió acceso explícito)');
});

await paso('2. Sync del Excel Madre (hoja PEDIDOS 2026)', async () => {
  const filas = await obtenerFilasComerciales({ forzarRecarga: true });
  if (filas.length > 0) ok(`${filas.length} filas leídas`);
  else falla('el Excel se descargó pero no trajo filas');
});

await paso('3. Carpetas de OP (índice de documentos)', async () => {
  carpetas = await listarCarpetasOP();
  if (carpetas.length > 0) ok(`${carpetas.length} carpetas de OP listadas`);
  else falla('no se encontró ninguna carpeta de OP');
});

await paso('4. Archivos dentro de una carpeta de OP y lectura de un PDF', async () => {
  if (carpetas.length === 0) return falla('sin carpetas no se puede probar (ver el paso 3)');
  const select = '$select=id,name,size,file';
  let pdf = null;
  let revisadas = 0;
  for (const carpeta of carpetas.slice(-15).reverse()) {
    revisadas++;
    const { value } = await graphGet(`/drives/${carpeta.driveId}/items/${carpeta.id}/children?$top=100&${select}`, token);
    const candidato = value.find((h) => h.file && /\.pdf$/i.test(h.name) && h.size < 5 * 1024 * 1024);
    if (candidato) {
      pdf = { ...candidato, driveId: carpeta.driveId, carpeta: carpeta.name };
      break;
    }
  }
  if (!pdf) return falla(`ninguna de las ${revisadas} carpetas revisadas tiene un PDF pequeño para probar`);
  ok(`listó los archivos de ${pdf.carpeta}`);
  const bytes = await graphDescargarContenido(pdf.driveId, pdf.id, token);
  if (bytes.subarray(0, 4).toString('latin1') === '%PDF') ok(`descargó un PDF (${bytes.length} bytes; no se guarda en disco)`);
  else falla('el archivo descargado no parece un PDF');
});

console.log(fallos === 0 ? '\nTodo en orden.' : `\n${fallos} comprobación(es) con problemas.`);
process.exit(fallos === 0 ? 0 : 1);
