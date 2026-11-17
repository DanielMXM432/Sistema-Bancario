// Error de negocio con código HTTP y mensaje claro para el usuario.
class AppError extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

// Envuelve controladores async para que los errores lleguen al manejador central.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { AppError, asyncHandler };
