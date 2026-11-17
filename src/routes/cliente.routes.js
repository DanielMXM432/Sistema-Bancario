// Banca virtual del cliente. Toda consulta se filtra por el id del usuario en sesión:
// un cliente nunca puede ver ni operar cuentas de otro cliente.
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { requiereCliente } = require('../middlewares/auth');
const { AppError, asyncHandler } = require('../utils/errores');
const { transferir } = require('../services/operaciones');
const v = require('../utils/validaciones');

const router = express.Router();
router.use(requiereCliente);

const uid = (req) => req.session.usuario.id;

/** Devuelve la cuenta solo si pertenece al cliente en sesión. */
async function cuentaPropia(req, cuentaId) {
  const [filas] = await pool.query(
    'SELECT id, numero_cuenta, tipo, saldo, estado, fecha_apertura FROM cuentas WHERE id = ? AND usuario_id = ?',
    [cuentaId, uid(req)]
  );
  if (!filas.length) throw new AppError(404, 'La cuenta no existe o no le pertenece.');
  return filas[0];
}

// Resumen de cuentas del cliente (número, tipo, saldo, estado)
router.get('/cuentas', asyncHandler(async (req, res) => {
  const [cuentas] = await pool.query(
    'SELECT id, numero_cuenta, tipo, saldo, estado, fecha_apertura FROM cuentas WHERE usuario_id = ? ORDER BY id',
    [uid(req)]
  );
  res.json({ cuentas });
}));

// Detalle y saldo de una cuenta
router.get('/cuentas/:id', asyncHandler(async (req, res) => {
  res.json({ cuenta: await cuentaPropia(req, v.id(req.params.id, 'id de cuenta')) });
}));

// Historial de movimientos de una cuenta (con filtros opcionales)
router.get('/cuentas/:id/movimientos', asyncHandler(async (req, res) => {
  const cuenta = await cuentaPropia(req, v.id(req.params.id, 'id de cuenta'));
  const filtros = ['cuenta_id = ?'];
  const params = [cuenta.id];
  const tipo = v.enLista(req.query.tipo, v.TIPOS_MOVIMIENTO, 'tipo');
  const desde = v.fechaOpcional(req.query.desde, 'desde');
  const hasta = v.fechaOpcional(req.query.hasta, 'hasta');
  if (tipo) { filtros.push('tipo = ?'); params.push(tipo); }
  if (desde) { filtros.push('fecha >= ?'); params.push(`${desde} 00:00:00`); }
  if (hasta) { filtros.push('fecha <= ?'); params.push(`${hasta} 23:59:59`); }
  const limite = Math.min(Number(req.query.limite) || 100, 500);

  const [movimientos] = await pool.query(
    `SELECT id, fecha, tipo, canal, descripcion, valor, saldo_resultante
       FROM movimientos WHERE ${filtros.join(' AND ')}
      ORDER BY fecha DESC, id DESC LIMIT ?`,
    [...params, limite]
  );
  res.json({ cuenta, movimientos });
}));

// Verifica una cuenta destino antes de transferir (muestra el titular parcialmente)
router.get('/destino/:numero', asyncHandler(async (req, res) => {
  const numero = v.numeroCuenta(req.params.numero, 'número de cuenta destino');
  const [filas] = await pool.query(
    `SELECT c.numero_cuenta, c.tipo, c.estado, c.usuario_id, u.nombres, u.apellidos, u.estado AS usuario_estado
       FROM cuentas c JOIN usuarios u ON u.id = c.usuario_id WHERE c.numero_cuenta = ?`,
    [numero]
  );
  if (!filas.length) throw new AppError(404, `La cuenta ${numero} no existe.`);
  const c = filas[0];
  res.json({
    numero_cuenta: c.numero_cuenta,
    tipo: c.tipo,
    titular: `${c.nombres} ${c.apellidos.charAt(0)}.`,
    propia: c.usuario_id === uid(req),
    activa: c.estado === 'ACTIVO' && c.usuario_estado === 'ACTIVO',
  });
}));

// Transferencia a otra cuenta registrada
router.post('/transferencias', asyncHandler(async (req, res) => {
  const cuentaOrigenId = v.id(req.body.cuentaOrigenId, 'cuenta origen');
  const numeroDestino = v.numeroCuenta(req.body.numeroDestino, 'número de cuenta destino');
  const valor = v.valorMonetario(req.body.valor);
  const descripcion = v.opcional(req.body.descripcion, 'descripción', 100);

  const resultado = await transferir({ cuentaOrigenId, numeroDestino, valor, descripcion, usuarioId: uid(req) });
  res.status(201).json({ mensaje: 'Transferencia realizada con éxito.', ...resultado });
}));

// Información personal
router.get('/perfil', asyncHandler(async (req, res) => {
  const [filas] = await pool.query(
    `SELECT tipo_documento, documento, nombres, apellidos, email, telefono, direccion, ciudad,
            estado, ultimo_acceso, fecha_creacion
       FROM usuarios WHERE id = ?`,
    [uid(req)]
  );
  res.json({ perfil: filas[0] });
}));

// Modificación de datos permitidos del perfil: correo, teléfono, dirección y ciudad.
// Nombre, documento, rol, estado y saldo NO se pueden modificar desde aquí.
router.put('/perfil', asyncHandler(async (req, res) => {
  const email = v.email(req.body.email);
  const telefono = v.telefono(req.body.telefono);
  const direccion = v.opcional(req.body.direccion, 'dirección', 150);
  const ciudad = v.opcional(req.body.ciudad, 'ciudad', 80);

  const [dup] = await pool.query('SELECT id FROM usuarios WHERE email = ? AND id <> ?', [email, uid(req)]);
  if (dup.length) throw new AppError(409, 'Ese correo electrónico ya está registrado por otro usuario.');

  await pool.query(
    'UPDATE usuarios SET email = ?, telefono = ?, direccion = ?, ciudad = ? WHERE id = ?',
    [email, telefono, direccion, ciudad, uid(req)]
  );
  res.json({ mensaje: 'Datos actualizados correctamente.' });
}));

// Cambio de contraseña (exige la contraseña actual)
router.put('/password', asyncHandler(async (req, res) => {
  const actual = typeof req.body.actual === 'string' ? req.body.actual : '';
  const nueva = v.password(req.body.nueva, 'nueva contraseña');
  if (req.body.confirmacion !== nueva) throw new AppError(400, 'La confirmación no coincide con la nueva contraseña.');
  if (actual === nueva) throw new AppError(400, 'La nueva contraseña debe ser diferente a la actual.');

  const [filas] = await pool.query('SELECT password_hash FROM usuarios WHERE id = ?', [uid(req)]);
  if (!(await bcrypt.compare(actual, filas[0].password_hash))) {
    throw new AppError(400, 'La contraseña actual no es correcta.');
  }
  await pool.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [await bcrypt.hash(nueva, 10), uid(req)]);
  res.json({ mensaje: 'Contraseña actualizada correctamente.' });
}));

module.exports = router;
