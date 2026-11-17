// Módulo administrativo del banco. Solo accesible con rol ADMIN.
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool, enTransaccion } = require('../config/db');
const { requiereAdmin } = require('../middlewares/auth');
const { AppError, asyncHandler } = require('../utils/errores');
const { consignar, generarNumeroCuenta, registrarMovimiento } = require('../services/operaciones');
const v = require('../utils/validaciones');

const router = express.Router();
router.use(requiereAdmin);

const adminId = (req) => req.session.usuario.id;

// ---------------------------------------------------------------- Dashboard
router.get('/dashboard', asyncHandler(async (req, res) => {
  const [[clientes]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(estado = 'ACTIVO'), 0)    AS activos,
            COALESCE(SUM(estado = 'INACTIVO'), 0)  AS inactivos,
            COALESCE(SUM(estado = 'BLOQUEADO'), 0) AS bloqueados
       FROM usuarios WHERE rol = 'CLIENTE'`
  );
  const [[cuentas]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(estado = 'ACTIVO'), 0)    AS activas,
            COALESCE(SUM(estado = 'BLOQUEADO'), 0) AS bloqueadas,
            COALESCE(SUM(saldo), 0)                AS saldo_total
       FROM cuentas`
  );
  const [[hoy]] = await pool.query(
    `SELECT COUNT(*) AS movimientos,
            COALESCE(SUM(CASE WHEN valor > 0 AND tipo = 'CONSIGNACION' THEN valor END), 0) AS consignado,
            COALESCE(SUM(CASE WHEN tipo = 'RETIRO_CAJERO' THEN -valor END), 0) AS retirado
       FROM movimientos WHERE DATE(fecha) = CURDATE()`
  );
  const [ultimos] = await pool.query(
    `SELECT m.id, m.fecha, m.tipo, m.canal, m.descripcion, m.valor, m.saldo_resultante,
            c.numero_cuenta, CONCAT(u.nombres, ' ', u.apellidos) AS titular
       FROM movimientos m
       JOIN cuentas c ON c.id = m.cuenta_id
       JOIN usuarios u ON u.id = c.usuario_id
      ORDER BY m.fecha DESC, m.id DESC LIMIT 8`
  );
  res.json({ clientes, cuentas, hoy, ultimos });
}));

// ---------------------------------------------------------------- Clientes
router.get('/clientes', asyncHandler(async (req, res) => {
  const filtros = ["u.rol = 'CLIENTE'"];
  const params = [];
  const q = v.texto(req.query.q);
  const estado = v.enLista(req.query.estado, ['ACTIVO', 'INACTIVO', 'BLOQUEADO'], 'estado');
  if (q) {
    filtros.push(`(u.documento LIKE ? OR u.email LIKE ? OR CONCAT(u.nombres, ' ', u.apellidos) LIKE ?
                   OR EXISTS (SELECT 1 FROM cuentas c2 WHERE c2.usuario_id = u.id AND c2.numero_cuenta LIKE ?))`);
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (estado) { filtros.push('u.estado = ?'); params.push(estado); }

  const [clientes] = await pool.query(
    `SELECT u.id, u.tipo_documento, u.documento, u.nombres, u.apellidos, u.email, u.telefono, u.ciudad,
            u.estado, u.fecha_creacion,
            COUNT(c.id) AS num_cuentas, COALESCE(SUM(c.saldo), 0) AS saldo_total
       FROM usuarios u
       LEFT JOIN cuentas c ON c.usuario_id = u.id
      WHERE ${filtros.join(' AND ')}
      GROUP BY u.id
      ORDER BY u.apellidos, u.nombres`,
    params
  );
  res.json({ clientes });
}));

async function obtenerCliente(id) {
  const [filas] = await pool.query(
    `SELECT id, tipo_documento, documento, nombres, apellidos, email, telefono, direccion, ciudad,
            estado, ultimo_acceso, fecha_creacion, fecha_actualizacion
       FROM usuarios WHERE id = ? AND rol = 'CLIENTE'`,
    [id]
  );
  if (!filas.length) throw new AppError(404, 'El cliente no existe.');
  return filas[0];
}

router.get('/clientes/:id', asyncHandler(async (req, res) => {
  const cliente = await obtenerCliente(v.id(req.params.id, 'id de cliente'));
  const [cuentas] = await pool.query(
    `SELECT id, numero_cuenta, tipo, saldo, estado, intentos_pin_fallidos, fecha_apertura
       FROM cuentas WHERE usuario_id = ? ORDER BY id`,
    [cliente.id]
  );
  const [movimientos] = await pool.query(
    `SELECT m.id, m.fecha, m.tipo, m.canal, m.descripcion, m.valor, m.saldo_resultante, c.numero_cuenta
       FROM movimientos m JOIN cuentas c ON c.id = m.cuenta_id
      WHERE c.usuario_id = ?
      ORDER BY m.fecha DESC, m.id DESC LIMIT 15`,
    [cliente.id]
  );
  res.json({ cliente, cuentas, movimientos });
}));

/** Lee y valida los datos personales comunes a crear/editar cliente. */
function datosPersonales(body) {
  return {
    tipo_documento: v.tipoDocumento(body.tipo_documento),
    documento: v.documento(body.documento),
    nombres: v.nombre(body.nombres, 'nombres'),
    apellidos: v.nombre(body.apellidos, 'apellidos'),
    email: v.email(body.email),
    telefono: v.telefono(body.telefono),
    direccion: v.opcional(body.direccion, 'dirección', 150),
    ciudad: v.opcional(body.ciudad, 'ciudad', 80),
  };
}

async function verificarDuplicados(conn, datos, excluirId = 0) {
  const [dup] = await conn.query(
    'SELECT documento, email FROM usuarios WHERE (documento = ? OR email = ?) AND id <> ?',
    [datos.documento, datos.email, excluirId]
  );
  if (dup.some((d) => d.documento === datos.documento)) throw new AppError(409, 'Ya existe un usuario con ese número de documento.');
  if (dup.length) throw new AppError(409, 'Ya existe un usuario con ese correo electrónico.');
}

// Crear cliente con su primera cuenta (y consignación inicial opcional)
router.post('/clientes', asyncHandler(async (req, res) => {
  const datos = datosPersonales(req.body);
  const password = v.password(req.body.password);
  const tipoCuenta = v.tipoCuenta(req.body.tipo_cuenta);
  const pin = v.pin(req.body.pin);
  const saldoInicial = v.texto(req.body.saldo_inicial) && Number(req.body.saldo_inicial) !== 0
    ? v.valorMonetario(req.body.saldo_inicial, 'saldo inicial')
    : 0;

  const passwordHash = await bcrypt.hash(password, 10);
  const pinHash = await bcrypt.hash(pin, 10);

  const resultado = await enTransaccion(async (conn) => {
    await verificarDuplicados(conn, datos);
    const [u] = await conn.query(
      `INSERT INTO usuarios (tipo_documento, documento, nombres, apellidos, email, telefono, direccion, ciudad, password_hash, rol, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CLIENTE', 'ACTIVO')`,
      [datos.tipo_documento, datos.documento, datos.nombres, datos.apellidos, datos.email,
        datos.telefono, datos.direccion, datos.ciudad, passwordHash]
    );
    const numero = await generarNumeroCuenta(conn, tipoCuenta);
    const [c] = await conn.query(
      'INSERT INTO cuentas (numero_cuenta, usuario_id, tipo, saldo, pin_hash) VALUES (?, ?, ?, ?, ?)',
      [numero, u.insertId, tipoCuenta, saldoInicial, pinHash]
    );
    if (saldoInicial > 0) {
      await registrarMovimiento(conn, {
        cuentaId: c.insertId, tipo: 'CONSIGNACION', canal: 'OFICINA',
        descripcion: 'Consignación inicial de apertura', valor: saldoInicial,
        saldoResultante: saldoInicial, realizadoPor: adminId(req),
      });
    }
    return { clienteId: u.insertId, numeroCuenta: numero };
  });

  res.status(201).json({
    mensaje: `Cliente creado correctamente. Cuenta ${tipoCuenta.toLowerCase()} N.° ${resultado.numeroCuenta}.`,
    ...resultado,
  });
}));

// Editar información del cliente (no modifica saldo, rol ni movimientos)
router.put('/clientes/:id', asyncHandler(async (req, res) => {
  const cliente = await obtenerCliente(v.id(req.params.id, 'id de cliente'));
  const datos = datosPersonales(req.body);
  await verificarDuplicados(pool, datos, cliente.id);
  await pool.query(
    `UPDATE usuarios SET tipo_documento = ?, documento = ?, nombres = ?, apellidos = ?, email = ?,
            telefono = ?, direccion = ?, ciudad = ? WHERE id = ?`,
    [datos.tipo_documento, datos.documento, datos.nombres, datos.apellidos, datos.email,
      datos.telefono, datos.direccion, datos.ciudad, cliente.id]
  );
  res.json({ mensaje: 'Información del cliente actualizada.' });
}));

// Habilitar / inactivar / bloquear cliente
router.patch('/clientes/:id/estado', asyncHandler(async (req, res) => {
  const cliente = await obtenerCliente(v.id(req.params.id, 'id de cliente'));
  const estado = v.estado(req.body.estado);
  await pool.query('UPDATE usuarios SET estado = ? WHERE id = ?', [estado, cliente.id]);
  const acciones = { ACTIVO: 'habilitado', INACTIVO: 'inactivado', BLOQUEADO: 'bloqueado' };
  res.json({ mensaje: `Cliente ${cliente.nombres} ${cliente.apellidos} ${acciones[estado]}.` });
}));

// Restablecer contraseña de un cliente
router.put('/clientes/:id/password', asyncHandler(async (req, res) => {
  const cliente = await obtenerCliente(v.id(req.params.id, 'id de cliente'));
  const nueva = v.password(req.body.password, 'nueva contraseña');
  await pool.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [await bcrypt.hash(nueva, 10), cliente.id]);
  res.json({ mensaje: 'Contraseña restablecida. Entréguela al cliente de forma segura.' });
}));

// Abrir una cuenta adicional a un cliente existente
router.post('/clientes/:id/cuentas', asyncHandler(async (req, res) => {
  const cliente = await obtenerCliente(v.id(req.params.id, 'id de cliente'));
  const tipo = v.tipoCuenta(req.body.tipo);
  const pinHash = await bcrypt.hash(v.pin(req.body.pin), 10);
  const numero = await enTransaccion(async (conn) => {
    const n = await generarNumeroCuenta(conn, tipo);
    await conn.query(
      'INSERT INTO cuentas (numero_cuenta, usuario_id, tipo, saldo, pin_hash) VALUES (?, ?, ?, 0, ?)',
      [n, cliente.id, tipo, pinHash]
    );
    return n;
  });
  res.status(201).json({ mensaje: `Cuenta ${tipo.toLowerCase()} N.° ${numero} creada.`, numeroCuenta: numero });
}));

// ---------------------------------------------------------------- Cuentas
router.get('/cuentas', asyncHandler(async (req, res) => {
  const filtros = ['1 = 1'];
  const params = [];
  const q = v.texto(req.query.q);
  const tipo = v.enLista(req.query.tipo, ['AHORROS', 'CORRIENTE'], 'tipo');
  const estado = v.enLista(req.query.estado, ['ACTIVO', 'INACTIVO', 'BLOQUEADO'], 'estado');
  if (q) {
    filtros.push(`(c.numero_cuenta LIKE ? OR u.documento LIKE ? OR CONCAT(u.nombres, ' ', u.apellidos) LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (tipo) { filtros.push('c.tipo = ?'); params.push(tipo); }
  if (estado) { filtros.push('c.estado = ?'); params.push(estado); }

  const [cuentas] = await pool.query(
    `SELECT c.id, c.numero_cuenta, c.tipo, c.saldo, c.estado, c.intentos_pin_fallidos, c.fecha_apertura,
            u.id AS cliente_id, u.documento, CONCAT(u.nombres, ' ', u.apellidos) AS titular, u.estado AS cliente_estado
       FROM cuentas c JOIN usuarios u ON u.id = c.usuario_id
      WHERE ${filtros.join(' AND ')}
      ORDER BY c.numero_cuenta`,
    params
  );
  res.json({ cuentas });
}));

router.get('/cuentas/numero/:numero', asyncHandler(async (req, res) => {
  const numero = v.numeroCuenta(req.params.numero);
  const [filas] = await pool.query(
    `SELECT c.id, c.numero_cuenta, c.tipo, c.saldo, c.estado, u.documento,
            CONCAT(u.nombres, ' ', u.apellidos) AS titular, u.estado AS cliente_estado
       FROM cuentas c JOIN usuarios u ON u.id = c.usuario_id WHERE c.numero_cuenta = ?`,
    [numero]
  );
  if (!filas.length) throw new AppError(404, `La cuenta ${numero} no existe.`);
  res.json({ cuenta: filas[0] });
}));

router.patch('/cuentas/:id/estado', asyncHandler(async (req, res) => {
  const id = v.id(req.params.id, 'id de cuenta');
  const estado = v.estado(req.body.estado);
  // Al habilitar la cuenta se reinician los intentos fallidos de PIN.
  const [r] = await pool.query(
    `UPDATE cuentas SET estado = ?, intentos_pin_fallidos = IF(? = 'ACTIVO', 0, intentos_pin_fallidos) WHERE id = ?`,
    [estado, estado, id]
  );
  if (!r.affectedRows) throw new AppError(404, 'La cuenta no existe.');
  res.json({ mensaje: `Estado de la cuenta actualizado a ${estado}.` });
}));

router.put('/cuentas/:id/pin', asyncHandler(async (req, res) => {
  const id = v.id(req.params.id, 'id de cuenta');
  const pinHash = await bcrypt.hash(v.pin(req.body.pin), 10);
  const [r] = await pool.query('UPDATE cuentas SET pin_hash = ?, intentos_pin_fallidos = 0 WHERE id = ?', [pinHash, id]);
  if (!r.affectedRows) throw new AppError(404, 'La cuenta no existe.');
  res.json({ mensaje: 'PIN del cajero actualizado.' });
}));

// ---------------------------------------------------------------- Consignaciones
router.post('/consignaciones', asyncHandler(async (req, res) => {
  const numeroCuenta = v.numeroCuenta(req.body.numeroCuenta);
  const valor = v.valorMonetario(req.body.valor);
  const descripcion = v.opcional(req.body.descripcion, 'descripción', 100);
  const resultado = await consignar({ numeroCuenta, valor, descripcion, adminId: adminId(req) });
  res.status(201).json({ mensaje: 'Consignación realizada con éxito.', ...resultado });
}));

// ---------------------------------------------------------------- Movimientos (historial general)
router.get('/movimientos', asyncHandler(async (req, res) => {
  const filtros = ['1 = 1'];
  const params = [];
  const cuenta = v.texto(req.query.cuenta);
  const tipo = v.enLista(req.query.tipo, v.TIPOS_MOVIMIENTO, 'tipo');
  const canal = v.enLista(req.query.canal, v.CANALES, 'canal');
  const desde = v.fechaOpcional(req.query.desde, 'desde');
  const hasta = v.fechaOpcional(req.query.hasta, 'hasta');
  if (cuenta) { filtros.push('c.numero_cuenta LIKE ?'); params.push(`%${cuenta}%`); }
  if (tipo) { filtros.push('m.tipo = ?'); params.push(tipo); }
  if (canal) { filtros.push('m.canal = ?'); params.push(canal); }
  if (desde) { filtros.push('m.fecha >= ?'); params.push(`${desde} 00:00:00`); }
  if (hasta) { filtros.push('m.fecha <= ?'); params.push(`${hasta} 23:59:59`); }
  const limite = Math.min(Number(req.query.limite) || 200, 1000);

  const [movimientos] = await pool.query(
    `SELECT m.id, m.fecha, m.tipo, m.canal, m.descripcion, m.valor, m.saldo_resultante, m.transferencia_id,
            c.numero_cuenta, CONCAT(u.nombres, ' ', u.apellidos) AS titular,
            CONCAT(r.nombres, ' ', r.apellidos) AS realizado_por
       FROM movimientos m
       JOIN cuentas c ON c.id = m.cuenta_id
       JOIN usuarios u ON u.id = c.usuario_id
       LEFT JOIN usuarios r ON r.id = m.realizado_por
      WHERE ${filtros.join(' AND ')}
      ORDER BY m.fecha DESC, m.id DESC LIMIT ?`,
    [...params, limite]
  );
  res.json({ movimientos });
}));

module.exports = router;
