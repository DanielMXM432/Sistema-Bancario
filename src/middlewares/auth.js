// Middlewares de autenticación y autorización por rol.
const { pool } = require('../config/db');

/**
 * Exige una sesión de banca virtual / panel con el rol indicado.
 * En cada petición se vuelve a consultar el estado del usuario en MySQL: si el
 * administrador lo bloquea, la sesión deja de ser válida de inmediato.
 */
function requiereRol(rol) {
  return async (req, res, next) => {
    try {
      const sesion = req.session.usuario;
      if (!sesion) return res.status(401).json({ error: 'Debe iniciar sesión.' });
      if (sesion.rol !== rol) return res.status(403).json({ error: 'No tiene permisos para acceder a este recurso.' });

      const [filas] = await pool.query('SELECT estado FROM usuarios WHERE id = ?', [sesion.id]);
      if (!filas.length || filas[0].estado !== 'ACTIVO') {
        delete req.session.usuario;
        return res.status(401).json({ error: 'Su usuario no está activo. Comuníquese con el banco.' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Exige una sesión abierta en el cajero automático. */
function requiereCajero(req, res, next) {
  if (!req.session.cajero) return res.status(401).json({ error: 'Debe identificarse en el cajero.' });
  // La operación del cajero vence a los 3 minutos de inactividad, como en un cajero real.
  const inactivo = Date.now() - req.session.cajero.ultimaActividad > 3 * 60 * 1000;
  if (inactivo) {
    delete req.session.cajero;
    return res.status(401).json({ error: 'La operación expiró por inactividad. Identifíquese de nuevo.' });
  }
  req.session.cajero.ultimaActividad = Date.now();
  next();
}

module.exports = { requiereCliente: requiereRol('CLIENTE'), requiereAdmin: requiereRol('ADMIN'), requiereCajero };
