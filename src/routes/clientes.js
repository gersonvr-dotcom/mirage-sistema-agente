import { Router } from 'express';
import {
  listarClientes,
  obtenerCliente,
  crearCliente,
  actualizarCliente,
  eliminarCliente,
  registrarAccionAgente,
} from '../db/queries.js';
import { requireRole } from '../middleware/requireRole.js';
import { TIPOS_CLIENTE } from '../db/clienteTipos.js';
import { candidatosFusionClientes, fusionarClientes } from '../services/clientesFusion.js';

export const clientesRouter = Router();

const tipoInvalido = (tipo) => Boolean(tipo) && !TIPOS_CLIENTE.includes(tipo);
const ERROR_TIPO = { error: `"tipo" debe ser uno de: ${TIPOS_CLIENTE.join(', ')}.` };

clientesRouter.get('/', async (req, res) => {
  try {
    if (tipoInvalido(req.query.tipo)) return res.status(400).json(ERROR_TIPO);
    const clientes = await listarClientes({ q: req.query.q, tipo: req.query.tipo });
    res.json({ clientes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo listar los clientes.', detail: err.message });
  }
});

// Las rutas fijas van antes de '/:id' para que no se interpreten como un id.
clientesRouter.get('/candidatos-fusion', requireRole('administrador'), async (req, res) => {
  try {
    res.json(await candidatosFusionClientes());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo analizar los clientes.', detail: err.message });
  }
});

clientesRouter.post('/fusionar', requireRole('administrador'), async (req, res) => {
  const { matriz_id, cliente_ids, dry_run } = req.body ?? {};
  if (!matriz_id || !Array.isArray(cliente_ids) || cliente_ids.length === 0) {
    return res.status(400).json({ error: 'Faltan "matriz_id" y/o "cliente_ids" (lista) en el body.' });
  }
  try {
    const resultado = await fusionarClientes({ matrizId: matriz_id, clienteIds: cliente_ids, dryRun: Boolean(dry_run) });
    if (!resultado.dry_run) {
      // La fusión ya está confirmada: un fallo al registrar la auditoría no debe presentarse como error de la fusión.
      try {
        await registrarAccionAgente({
          usuarioId: req.user.sub,
          toolName: 'fusionar_clientes',
          input: { matriz_id, cliente_ids },
          resultado,
        });
      } catch (errAuditoria) {
        console.error('No se pudo registrar la auditoría de la fusión:', errAuditoria.message);
      }
    }
    res.json(resultado);
  } catch (err) {
    if (err.code === 'FUSION_INVALIDA') return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'No se pudo fusionar los clientes.', detail: err.message });
  }
});

clientesRouter.get('/:id', async (req, res) => {
  try {
    const cliente = await obtenerCliente(req.params.id);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });
    res.json({ cliente });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo obtener el cliente.', detail: err.message });
  }
});

clientesRouter.post('/', async (req, res) => {
  const { nombre, ruc_nit, contacto, email, telefono, tipo } = req.body ?? {};
  if (!nombre) {
    return res.status(400).json({ error: 'Falta "nombre" en el body.' });
  }
  if (tipoInvalido(tipo)) return res.status(400).json(ERROR_TIPO);
  try {
    const cliente = await crearCliente({ nombre, ruc_nit, contacto, email, telefono, tipo });
    res.status(201).json({ cliente });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo crear el cliente.', detail: err.message });
  }
});

clientesRouter.put('/:id', async (req, res) => {
  const { nombre, ruc_nit, contacto, email, telefono, tipo } = req.body ?? {};
  if (!nombre) {
    return res.status(400).json({ error: 'Falta "nombre" en el body.' });
  }
  if (tipoInvalido(tipo)) return res.status(400).json(ERROR_TIPO);
  try {
    const cliente = await actualizarCliente(req.params.id, { nombre, ruc_nit, contacto, email, telefono, tipo });
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });
    res.json({ cliente });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo actualizar el cliente.', detail: err.message });
  }
});

clientesRouter.delete('/:id', requireRole('administrador'), async (req, res) => {
  try {
    const eliminado = await eliminarCliente(req.params.id);
    if (!eliminado) return res.status(404).json({ error: 'Cliente no encontrado.' });
    res.status(204).end();
  } catch (err) {
    if (err.code === 'TIENE_DEPENDENCIAS') {
      return res.status(409).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'No se pudo eliminar el cliente.', detail: err.message });
  }
});
