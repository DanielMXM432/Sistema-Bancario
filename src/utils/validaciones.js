// Validaciones del lado del servidor. Todas lanzan AppError(400) con un mensaje claro.
const { AppError } = require('./errores');

const texto = (v) => (typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v).trim());

function requerido(valor, campo) {
  const v = texto(valor);
  if (!v) throw new AppError(400, `El campo "${campo}" es obligatorio.`);
  return v;
}

function longitud(valor, campo, min, max) {
  if (valor.length < min || valor.length > max) {
    throw new AppError(400, `El campo "${campo}" debe tener entre ${min} y ${max} caracteres.`);
  }
  return valor;
}

function nombre(valor, campo) {
  const v = longitud(requerido(valor, campo), campo, 2, 80);
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]+$/.test(v)) {
    throw new AppError(400, `El campo "${campo}" solo puede contener letras y espacios.`);
  }
  return v.replace(/\s+/g, ' ');
}

function email(valor) {
  const v = requerido(valor, 'correo electrónico').toLowerCase();
  if (v.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
    throw new AppError(400, 'El correo electrónico no es válido.');
  }
  return v;
}

function documento(valor) {
  const v = requerido(valor, 'número de documento');
  if (!/^[0-9A-Za-z]{5,20}$/.test(v)) {
    throw new AppError(400, 'El documento debe tener entre 5 y 20 caracteres alfanuméricos, sin espacios ni puntos.');
  }
  return v.toUpperCase();
}

function tipoDocumento(valor) {
  const v = texto(valor) || 'CC';
  if (!['CC', 'CE', 'TI', 'PASAPORTE'].includes(v)) throw new AppError(400, 'Tipo de documento no válido.');
  return v;
}

function telefono(valor) {
  const v = texto(valor);
  if (!v) return null;
  if (!/^[0-9+ ]{7,20}$/.test(v)) throw new AppError(400, 'El teléfono debe tener entre 7 y 20 dígitos.');
  return v;
}

function opcional(valor, campo, max) {
  const v = texto(valor);
  if (!v) return null;
  if (v.length > max) throw new AppError(400, `El campo "${campo}" admite máximo ${max} caracteres.`);
  return v;
}

function password(valor, campo = 'contraseña') {
  const v = typeof valor === 'string' ? valor : '';
  if (v.length < 8 || v.length > 64) throw new AppError(400, `La ${campo} debe tener entre 8 y 64 caracteres.`);
  if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) {
    throw new AppError(400, `La ${campo} debe contener al menos una letra y un número.`);
  }
  return v;
}

function pin(valor) {
  const v = texto(valor);
  if (!/^[0-9]{4}$/.test(v)) throw new AppError(400, 'El PIN debe tener exactamente 4 dígitos.');
  return v;
}

function numeroCuenta(valor, campo = 'número de cuenta') {
  const v = requerido(valor, campo).replace(/[\s-]/g, '');
  if (!/^[0-9]{10}$/.test(v)) throw new AppError(400, `El ${campo} debe tener 10 dígitos.`);
  return v;
}

function tipoCuenta(valor) {
  const v = texto(valor) || 'AHORROS';
  if (!['AHORROS', 'CORRIENTE'].includes(v)) throw new AppError(400, 'Tipo de cuenta no válido.');
  return v;
}

function estado(valor) {
  const v = texto(valor);
  if (!['ACTIVO', 'INACTIVO', 'BLOQUEADO'].includes(v)) throw new AppError(400, 'Estado no válido.');
  return v;
}

const VALOR_MAXIMO = 1_000_000_000; // tope de seguridad por operación

/** Valor monetario: número > 0, máximo 2 decimales. */
function valorMonetario(valor, campo = 'valor') {
  const crudo = texto(valor).replace(/[$\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(crudo)) {
    throw new AppError(400, `El ${campo} debe ser un número mayor que cero (use punto para decimales).`);
  }
  const n = Number(crudo);
  if (!(n > 0)) throw new AppError(400, `El ${campo} debe ser mayor que cero.`);
  if (n > VALOR_MAXIMO) throw new AppError(400, `El ${campo} supera el máximo permitido por operación.`);
  return Math.round(n * 100) / 100;
}

function id(valor, campo = 'identificador') {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(400, `El ${campo} no es válido.`);
  return n;
}

/** Fecha opcional en formato AAAA-MM-DD (filtros). */
function fechaOpcional(valor, campo) {
  const v = texto(valor);
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
    throw new AppError(400, `La fecha "${campo}" no es válida.`);
  }
  return v;
}

/** Valor opcional que debe pertenecer a una lista permitida (filtros). */
function enLista(valor, lista, campo) {
  const v = texto(valor);
  if (!v) return null;
  if (!lista.includes(v)) throw new AppError(400, `El filtro "${campo}" no es válido.`);
  return v;
}

const TIPOS_MOVIMIENTO = ['CONSIGNACION', 'RETIRO_CAJERO', 'TRANSFERENCIA_ENVIADA', 'TRANSFERENCIA_RECIBIDA'];
const CANALES = ['BANCA_VIRTUAL', 'CAJERO', 'OFICINA'];

module.exports = {
  fechaOpcional, enLista, TIPOS_MOVIMIENTO, CANALES,
  texto, requerido, nombre, email, documento, tipoDocumento, telefono, opcional,
  password, pin, numeroCuenta, tipoCuenta, estado, valorMonetario, id,
};
