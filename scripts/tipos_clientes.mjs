// Carga inicial de clientes.tipo (R4-01). Tres pasos:
//   1) exportar:  node --env-file=.env scripts/tipos_clientes.mjs exportar [clientes-tipos.csv]
//      Genera un CSV con todos los clientes (más metros vendidos primero) y, como ayuda, un tipo sugerido por el nombre.
//      Solo se prellena `tipo` con las sugerencias de confianza alta; el resto lo completa una persona.
//   2) completar el CSV (columna `tipo`: constructora, arquitecto, desarrollador, distribuidor, particular, interno).
//   3) importar:  node --env-file=.env scripts/tipos_clientes.mjs importar clientes-tipos.csv [--sql tipos.sql] [--aplicar]
//      Sin --aplicar solo muestra qué haría. --aplicar actualiza la BD local; --sql escribe el .sql para phpMyAdmin
//      (producción). En ambos casos solo se completan clientes sin tipo: nunca se pisa lo editado a mano.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pool } from '../src/db/pool.js';
import { filasConTipo, generarCsvClientes, generarSqlTipos, parsearCsv } from '../src/services/tiposCliente.js';

const [modo, archivo, ...resto] = process.argv.slice(2);
const opcion = (nombre) => {
  const i = resto.indexOf(nombre);
  return i >= 0 ? resto[i + 1] : undefined;
};

try {
  if (modo === 'exportar') {
    const salida = archivo ?? path.join(os.homedir(), 'Documents', 'clientes-tipos.csv');
    const [clientes] = await pool.query(
      `SELECT c.id, c.nombre, c.tipo, COUNT(DISTINCT o.id) AS ops,
              ROUND(COALESCE(SUM(CASE WHEN p.unidad_medida = 'M2' AND o.estado_general <> 'cancelada' THEN oi.cantidad END), 0)) AS m2
         FROM clientes c
         LEFT JOIN ops o ON o.cliente_id = c.id
         LEFT JOIN op_items oi ON oi.op_id = o.id
         LEFT JOIN productos p ON p.id = oi.producto_id
        GROUP BY c.id, c.nombre, c.tipo
        ORDER BY m2 DESC, c.nombre`
    );
    fs.writeFileSync(salida, generarCsvClientes(clientes));
    console.log(`${clientes.length} clientes (${clientes.filter((c) => c.tipo).length} ya tienen tipo) → ${salida}`);
  } else if (modo === 'importar' && archivo) {
    const { validas, errores } = filasConTipo(parsearCsv(fs.readFileSync(archivo, 'utf8')));
    if (errores.length) {
      console.error(errores.join('\n'));
      process.exitCode = 1;
    } else {
      const [existentes] = await pool.query('SELECT nombre, tipo FROM clientes');
      const porNombre = new Map();
      for (const c of existentes) porNombre.set(c.nombre, [...(porNombre.get(c.nombre) ?? []), c]);
      const sinCliente = validas.filter((v) => !porNombre.has(v.nombre));
      const yaTienen = validas.filter((v) => porNombre.get(v.nombre)?.every((c) => c.tipo));
      const porTipo = {};
      for (const v of validas) porTipo[v.tipo] = (porTipo[v.tipo] ?? 0) + 1;
      console.log(`Filas con tipo: ${validas.length} ${JSON.stringify(porTipo)}`);
      console.log(`Sin cliente con ese nombre en esta BD: ${sinCliente.length}${sinCliente.length ? ' → ' + sinCliente.map((v) => v.nombre).join(', ') : ''}`);
      console.log(`Clientes que ya tenían tipo (no se tocan): ${yaTienen.length}`);
      const sqlSalida = opcion('--sql');
      if (sqlSalida) {
        fs.writeFileSync(sqlSalida, generarSqlTipos(validas));
        console.log(`.sql para producción → ${sqlSalida}`);
      }
      if (resto.includes('--aplicar')) {
        let cambiados = 0;
        for (const v of validas) {
          const [r] = await pool.query('UPDATE clientes SET tipo = ? WHERE nombre = ? AND tipo IS NULL', [v.tipo, v.nombre]);
          cambiados += r.affectedRows;
        }
        console.log(`Aplicado en la BD local: ${cambiados} clientes actualizados.`);
      } else {
        console.log('(simulación: use --aplicar para escribir en la BD local)');
      }
    }
  } else {
    console.error('Uso: exportar [salida.csv]  |  importar <csv> [--sql salida.sql] [--aplicar]');
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
