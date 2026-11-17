/**
 * Operaciones financieras del banco.
 *
 * Todas se ejecutan dentro de una transacción de MySQL y bloquean las filas
 * de las cuentas involucradas (SELECT ... FOR UPDATE) para que dos operaciones
 * simultáneas no puedan dejar un saldo inconsistente. El saldo SOLO se modifica
 * aquí, en el backend, y cada cambio de saldo genera su movimiento.
 */
const { enTransaccion } = require('../config/db');
const { AppError } = require('../utils/errores');

const ESTADO_TXT = { INACTIVO: 'inactiva', BLOQUEADO: 'bloqueada' };

/** Bloquea y devuelve las cuentas indicadas junto con el estado del titular. */
async function bloquearCuentas(conn, campo, valores) {
  // Se ordena por id para que las transacciones siempre bloqueen en el mismo orden (evita deadlocks).
  const [filas] = await conn.query(
    `SELECT c.id, c.numero_cuenta, c.usuario_id, c.tipo, c.saldo, c.estado,
            u.estado AS usuario_estado, u.nombres, u.apellidos
       FROM cuentas c
       JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.${campo} IN (?)
      ORDER BY c.id
      FOR UPDATE`,
    [valores]
  );
  return filas;
}

/** Verifica que la cuenta y su titular estén activos. */
function verificarOperable(cuenta, rotulo = 'La cuenta') {
  if (cuenta.estado !== 'ACTIVO') {
    throw new AppError(403, `${rotulo} ${cuenta.numero_cuenta} está ${ESTADO_TXT[cuenta.estado] || cuenta.estado.toLowerCase()} y no puede realizar operaciones.`);
  }
  if (cuenta.usuario_estado !== 'ACTIVO') {
    throw new AppError(403, `El titular de la cuenta ${cuenta.numero_cuenta} está ${ESTADO_TXT[cuenta.usuario_estado] === 'bloqueada' ? 'bloqueado' : 'inactivo'} y la cuenta no puede realizar operaciones.`);
  }
}

async function registrarMovimiento(conn, m) {
  const [r] = await conn.query(
    `INSERT INTO movimientos
       (cuenta_id, tipo, canal, descripcion, valor, saldo_resultante, transferencia_id, realizado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [m.cuentaId, m.tipo, m.canal, m.descripcion, m.valor, m.saldoResultante, m.transferenciaId || null, m.realizadoPor || null]
  );
  return r.insertId;
}

async function actualizarSaldo(conn, cuentaId, nuevoSaldo) {
  await conn.query('UPDATE cuentas SET saldo = ? WHERE id = ?', [nuevoSaldo, cuentaId]);
}

const redondear = (n) => Math.round(n * 100) / 100;

/** Consignación realizada por un administrador (canal OFICINA). */
function consignar({ numeroCuenta, valor, descripcion, adminId }) {
  return enTransaccion(async (conn) => {
    const [cuenta] = await bloquearCuentas(conn, 'numero_cuenta', [numeroCuenta]);
    if (!cuenta) throw new AppError(404, `La cuenta ${numeroCuenta} no existe.`);
    verificarOperable(cuenta);

    const nuevoSaldo = redondear(cuenta.saldo + valor);
    await actualizarSaldo(conn, cuenta.id, nuevoSaldo);
    const movimientoId = await registrarMovimiento(conn, {
      cuentaId: cuenta.id,
      tipo: 'CONSIGNACION',
      canal: 'OFICINA',
      descripcion: descripcion ? `Consignación - ${descripcion}` : 'Consignación en oficina',
      valor,
      saldoResultante: nuevoSaldo,
      realizadoPor: adminId,
    });

    return {
      movimientoId,
      numeroCuenta: cuenta.numero_cuenta,
      titular: `${cuenta.nombres} ${cuenta.apellidos}`,
      valor,
      saldoAnterior: cuenta.saldo,
      saldoNuevo: nuevoSaldo,
    };
  });
}

/** Retiro desde el cajero automático. */
function retirar({ cuentaId, valor, usuarioId }) {
  return enTransaccion(async (conn) => {
    const [cuenta] = await bloquearCuentas(conn, 'id', [cuentaId]);
    if (!cuenta) throw new AppError(404, 'La cuenta no existe.');
    verificarOperable(cuenta);
    if (valor > cuenta.saldo) {
      throw new AppError(400, 'Saldo insuficiente para realizar el retiro.');
    }

    const nuevoSaldo = redondear(cuenta.saldo - valor);
    await actualizarSaldo(conn, cuenta.id, nuevoSaldo);
    const movimientoId = await registrarMovimiento(conn, {
      cuentaId: cuenta.id,
      tipo: 'RETIRO_CAJERO',
      canal: 'CAJERO',
      descripcion: 'Retiro cajero',
      valor: -valor,
      saldoResultante: nuevoSaldo,
      realizadoPor: usuarioId,
    });

    return { movimientoId, numeroCuenta: cuenta.numero_cuenta, valor, saldoAnterior: cuenta.saldo, saldoNuevo: nuevoSaldo };
  });
}

/** Transferencia entre dos cuentas del banco, realizada por el titular de la cuenta origen. */
function transferir({ cuentaOrigenId, numeroDestino, valor, descripcion, usuarioId }) {
  return enTransaccion(async (conn) => {
    // Se identifica primero la cuenta destino para poder bloquear ambas en orden.
    const [destinoInfo] = await conn.query('SELECT id FROM cuentas WHERE numero_cuenta = ?', [numeroDestino]);
    if (!destinoInfo.length) throw new AppError(404, `La cuenta destino ${numeroDestino} no existe.`);
    const destinoId = destinoInfo[0].id;

    const cuentas = await bloquearCuentas(conn, 'id', [cuentaOrigenId, destinoId]);
    const origen = cuentas.find((c) => c.id === cuentaOrigenId);
    const destino = cuentas.find((c) => c.id === destinoId);

    // Mismo mensaje en ambos casos para no revelar cuentas de otros clientes.
    if (!origen || origen.usuario_id !== usuarioId) throw new AppError(404, 'La cuenta origen no existe o no le pertenece.');
    if (!destino) throw new AppError(404, `La cuenta destino ${numeroDestino} no existe.`);
    if (origen.id === destino.id) throw new AppError(400, 'La cuenta origen y la cuenta destino no pueden ser la misma.');

    verificarOperable(origen, 'La cuenta origen');
    verificarOperable(destino, 'La cuenta destino');
    if (valor > origen.saldo) throw new AppError(400, 'Saldo insuficiente para realizar la transferencia.');

    const saldoOrigen = redondear(origen.saldo - valor);
    const saldoDestino = redondear(destino.saldo + valor);

    // 1. Descontar de origen y 2. incrementar destino
    await actualizarSaldo(conn, origen.id, saldoOrigen);
    await actualizarSaldo(conn, destino.id, saldoDestino);

    const [t] = await conn.query(
      `INSERT INTO transferencias (cuenta_origen_id, cuenta_destino_id, valor, descripcion, realizado_por)
       VALUES (?, ?, ?, ?, ?)`,
      [origen.id, destino.id, valor, descripcion || null, usuarioId]
    );
    const transferenciaId = t.insertId;
    const sufijo = descripcion ? ` - ${descripcion}` : '';

    // 3. Movimiento en origen y 4. movimiento en destino
    await registrarMovimiento(conn, {
      cuentaId: origen.id,
      tipo: 'TRANSFERENCIA_ENVIADA',
      canal: 'BANCA_VIRTUAL',
      descripcion: `Transferencia a cuenta ${destino.numero_cuenta}${sufijo}`.slice(0, 150),
      valor: -valor,
      saldoResultante: saldoOrigen,
      transferenciaId,
      realizadoPor: usuarioId,
    });
    await registrarMovimiento(conn, {
      cuentaId: destino.id,
      tipo: 'TRANSFERENCIA_RECIBIDA',
      canal: 'BANCA_VIRTUAL',
      descripcion: `Transferencia de cuenta ${origen.numero_cuenta}${sufijo}`.slice(0, 150),
      valor,
      saldoResultante: saldoDestino,
      transferenciaId,
      realizadoPor: usuarioId,
    });

    return {
      transferenciaId,
      cuentaOrigen: origen.numero_cuenta,
      cuentaDestino: destino.numero_cuenta,
      titularDestino: `${destino.nombres} ${destino.apellidos.charAt(0)}.`,
      valor,
      saldoNuevo: saldoOrigen,
    };
  });
}

/** Genera un número de cuenta único de 10 dígitos (prefijo 400 ahorros / 500 corriente). */
async function generarNumeroCuenta(conn, tipo) {
  const prefijo = tipo === 'CORRIENTE' ? '500' : '400';
  for (let i = 0; i < 20; i++) {
    const numero = prefijo + String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
    const [existe] = await conn.query('SELECT 1 FROM cuentas WHERE numero_cuenta = ?', [numero]);
    if (!existe.length) return numero;
  }
  throw new AppError(500, 'No fue posible generar un número de cuenta. Intente de nuevo.');
}

module.exports = { consignar, retirar, transferir, generarNumeroCuenta, registrarMovimiento };
