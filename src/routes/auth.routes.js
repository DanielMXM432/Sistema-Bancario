// Inicio y cierre de sesión para clientes (banca virtual) y administradores (panel).
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { AppError, asyncHandler } = require('../utils/errores');
const v = require('../utils/validaciones');

const router = express.Router();

router.post('/login', asyncHandler(async (req, res) => {
  const usuario = v.requerido(req.body.usuario, 'correo o documento').toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!password) throw new AppError(400, 'Ingrese su contraseña.');

  const [filas] = await pool.query(
    'SELECT id, nombres, apellidos, email, rol, estado, password_hash FROM usuarios WHERE email = ? OR documento = ? LIMIT 1',
    [usuario, usuario.toUpperCase()]
  );
  const u = filas[0];
  // Mismo mensaje si el usuario no existe o la clave es incorrecta (no se revela cuál falló).
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    throw new AppError(401, 'Usuario o contraseña incorrectos.');
  }
  if (u.estado === 'BLOQUEADO') throw new AppError(403, 'Su usuario está bloqueado. Comuníquese con el banco.');
  if (u.estado !== 'ACTIVO') throw new AppError(403, 'Su usuario está inactivo. Comuníquese con el banco.');

  await pool.query('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?', [u.id]);

  // Se regenera la sesión para evitar fijación de sesión.
  await new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
  req.session.usuario = { id: u.id, nombre: `${u.nombres} ${u.apellidos}`, rol: u.rol };
  res.json({
    mensaje: `Bienvenido(a), ${u.nombres}.`,
    usuario: req.session.usuario,
    redireccion: u.rol === 'ADMIN' ? '/admin.html' : '/banca.html',
  });
}));

router.post('/logout', (req, res) => {
  delete req.session.usuario;
  res.json({ mensaje: 'Sesión cerrada correctamente.' });
});

router.get('/sesion', (req, res) => {
  res.json({ usuario: req.session.usuario || null });
});

module.exports = router;
