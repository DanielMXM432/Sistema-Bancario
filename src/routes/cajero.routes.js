// Cajero automático virtual. El cliente se identifica con número de cuenta + PIN.
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { requiereCajero } = require('../middlewares/auth');
const { AppError, asyncHandler } = require('../utils/errores');
const { retirar } = require('../services/operaciones');
const v = require('../utils/validaciones');

const router = express.Router();

const MAX_INTENTOS_PIN = 3;
const MULTIPLO_RETIRO = 10000;     // el cajero entrega billetes de $10.000 en adelante
const MAXIMO_RETIRO = 3000000;     // tope por operación

async function cuentaConTitular(where, valor) {
  const [filas] = await pool.query(
    `SELECT c.id, c.numero_cuenta, c.tipo, c.saldo, c.estado, c.pin_hash, c.intentos_pin_fallidos, c.usuario_id,
            u.nombres, u.apellidos, u.estado AS usuario_estado
       FROM cuentas c JOIN usuarios u ON u.id = c.usuario_id WHERE c.${where} = ?`,
    [valor]
  );
  return filas[0];
}

function verificarActiva(cuenta) {
  if (cuenta.estado === 'BLOQUEADO') throw new AppError(403, 'La cuenta está bloqueada. Comuníquese con el banco.');
  if (cuenta.estado !== 'ACTIVO') throw new AppError(403, 'La cuenta está inactiva. Comuníquese con el banco.');
  if (cuenta.usuario_estado !== 'ACTIVO') throw new AppError(403, 'El titular de la cuenta no está habilitado. Comuníquese con el banco.');
}

router.post('/ingresar', asyncHandler(async (req, res) => {
  const numero = v.numeroCuenta(req.body.numeroCuenta);
  const pin = v.pin(req.body.pin);

  const cuenta = await cuentaConTitular('numero_cuenta', numero);
  if (!cuenta) throw new AppError(404, 'La cuenta no existe.');
  verificarActiva(cuenta);

  if (!(await bcrypt.compare(pin, cuenta.pin_hash))) {
    const intentos = cuenta.intentos_pin_fallidos + 1;
    if (intentos >= MAX_INTENTOS_PIN) {
      await pool.query("UPDATE cuentas SET intentos_pin_fallidos = ?, estado = 'BLOQUEADO' WHERE id = ?", [intentos, cuenta.id]);
      throw new AppError(403, 'PIN incorrecto. Superó el número de intentos y la cuenta fue bloqueada. Comuníquese con el banco.');
    }
    await pool.query('UPDATE cuentas SET intentos_pin_fallidos = ? WHERE id = ?', [intentos, cuenta.id]);
    const restantes = MAX_INTENTOS_PIN - intentos;
    throw new AppError(401, `PIN incorrecto. Le queda${restantes === 1 ? '' : 'n'} ${restantes} intento${restantes === 1 ? '' : 's'}.`);
  }

  await pool.query('UPDATE cuentas SET intentos_pin_fallidos = 0 WHERE id = ?', [cuenta.id]);
  req.session.cajero = {
    cuentaId: cuenta.id,
    usuarioId: cuenta.usuario_id,
    numero: cuenta.numero_cuenta,
    titular: `${cuenta.nombres} ${cuenta.apellidos}`,
    ultimaActividad: Date.now(),
  };
  res.json({
    mensaje: `Bienvenido(a), ${cuenta.nombres}.`,
    cuenta: { numero_cuenta: cuenta.numero_cuenta, tipo: cuenta.tipo, titular: req.session.cajero.titular },
  });
}));

router.get('/saldo', requiereCajero, asyncHandler(async (req, res) => {
  const cuenta = await cuentaConTitular('id', req.session.cajero.cuentaId);
  verificarActiva(cuenta);
  res.json({ numero_cuenta: cuenta.numero_cuenta, tipo: cuenta.tipo, saldo: cuenta.saldo });
}));

router.get('/movimientos', requiereCajero, asyncHandler(async (req, res) => {
  const cuenta = await cuentaConTitular('id', req.session.cajero.cuentaId);
  verificarActiva(cuenta);
  const [movimientos] = await pool.query(
    `SELECT fecha, tipo, descripcion, valor, saldo_resultante
       FROM movimientos WHERE cuenta_id = ? ORDER BY fecha DESC, id DESC LIMIT 5`,
    [cuenta.id]
  );
  res.json({ numero_cuenta: cuenta.numero_cuenta, movimientos });
}));

router.post('/retiro', requiereCajero, asyncHandler(async (req, res) => {
  const valor = v.valorMonetario(req.body.valor);
  if (valor % MULTIPLO_RETIRO !== 0) {
    throw new AppError(400, 'El cajero solo entrega montos múltiplos de $10.000.');
  }
  if (valor > MAXIMO_RETIRO) {
    throw new AppError(400, 'El monto máximo por retiro en cajero es $3.000.000.');
  }
  // retirar() comprueba existencia, estado y saldo suficiente dentro de la transacción.
  const resultado = await retirar({
    cuentaId: req.session.cajero.cuentaId,
    valor,
    usuarioId: req.session.cajero.usuarioId,
  });
  res.status(201).json({ mensaje: 'Retiro realizado con éxito. Retire su dinero.', ...resultado });
}));

router.post('/salir', (req, res) => {
  delete req.session.cajero;
  res.json({ mensaje: 'Operación finalizada. Gracias por usar nuestro cajero.' });
});

module.exports = router;
