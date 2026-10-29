import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nombreSeguro, validarPdfSubido, ErrorSubida, TAMANO_MAX_SUBIDA } from '../src/services/documentosManuales.js';

test('nombreSeguro: quita rutas y caracteres de control y deja extensión .pdf', () => {
  assert.equal(nombreSeguro('PI 22703 OP 2025-001.PDF'), 'PI 22703 OP 2025-001.pdf');
  assert.equal(nombreSeguro('../../etc/passwd'), 'passwd.pdf');
  assert.equal(nombreSeguro('C:\\docs\\pi.pdf'), 'pi.pdf');
  assert.equal(nombreSeguro('a\u0000b\nc.pdf'), 'abc.pdf');
  assert.equal(nombreSeguro(''), 'PI.pdf');
  assert.equal(nombreSeguro(undefined), 'PI.pdf');
  assert.ok(nombreSeguro('x'.repeat(500)).length <= 300);
});

test('validarPdfSubido: acepta PDFs y rechaza vacíos, otros formatos y archivos enormes', () => {
  assert.doesNotThrow(() => validarPdfSubido(Buffer.from('%PDF-1.7\n...')));
  const codigo = (buf) => {
    try {
      validarPdfSubido(buf);
    } catch (e) {
      assert.ok(e instanceof ErrorSubida);
      return `${e.codigo}:${e.status}`;
    }
    return 'ok';
  };
  assert.equal(codigo(Buffer.alloc(0)), 'sin_archivo:400');
  assert.equal(codigo(undefined), 'sin_archivo:400');
  assert.equal(codigo({}), 'sin_archivo:400'); // body sin parsear (otro Content-Type)
  assert.equal(codigo(Buffer.from('<html>no soy pdf</html>')), 'no_es_pdf:415');
  assert.equal(codigo(Buffer.from('PK\u0003\u0004 zip')), 'no_es_pdf:415');
  const grande = Buffer.alloc(TAMANO_MAX_SUBIDA + 1);
  grande.write('%PDF-');
  assert.equal(codigo(grande), 'muy_grande:413');
});
