// Utilidades compartidas por todas las pantallas.
'use strict';

/** Llamada a la API. Lanza Error con el mensaje del servidor si la respuesta no es exitosa. */
async function api(url, opciones = {}) {
  const config = { method: opciones.method || 'GET', headers: {}, credentials: 'same-origin' };
  if (opciones.body !== undefined) {
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(opciones.body);
  }
  let res;
  try {
    res = await fetch(url, config);
  } catch {
    throw new Error('No hay conexión con el servidor.');
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(datos.error || 'Ocurrió un error inesperado.');
    err.status = res.status;
    throw err;
  }
  return datos;
}

const formatoPesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const pesos = (n) => formatoPesos.format(Number(n) || 0);
const pesosConSigno = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + pesos(Math.abs(n));

function fecha(texto, conHora = true) {
  if (!texto) return '—';
  const d = new Date(texto.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return texto;
  const opciones = { day: '2-digit', month: 'short', year: 'numeric' };
  if (conHora) Object.assign(opciones, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('es-CO', opciones);
}

/** Escapa texto antes de insertarlo como HTML (previene XSS). */
function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const TIPOS_MOV = {
  CONSIGNACION: { texto: 'Consignación', icono: 'bi-box-arrow-in-down', clase: 'mov-ingreso' },
  RETIRO_CAJERO: { texto: 'Retiro cajero', icono: 'bi-cash-stack', clase: 'mov-egreso' },
  TRANSFERENCIA_ENVIADA: { texto: 'Transferencia enviada', icono: 'bi-arrow-up-right', clase: 'mov-egreso' },
  TRANSFERENCIA_RECIBIDA: { texto: 'Transferencia recibida', icono: 'bi-arrow-down-left', clase: 'mov-ingreso' },
};
const CANALES = { BANCA_VIRTUAL: 'Banca virtual', CAJERO: 'Cajero', OFICINA: 'Oficina' };

function etiquetaTipo(tipo) {
  const t = TIPOS_MOV[tipo] || { texto: tipo, icono: 'bi-dot', clase: '' };
  return `<span class="tipo-mov ${t.clase}"><i class="bi ${t.icono}"></i>${esc(t.texto)}</span>`;
}

function etiquetaEstado(estado) {
  const clases = { ACTIVO: 'estado-activo', INACTIVO: 'estado-inactivo', BLOQUEADO: 'estado-bloqueado' };
  return `<span class="estado ${clases[estado] || ''}">${esc(estado)}</span>`;
}

/** Notificación flotante (éxito / error / info). */
function notificar(mensaje, tipo = 'exito') {
  let zona = document.getElementById('zona-toasts');
  if (!zona) {
    zona = document.createElement('div');
    zona.id = 'zona-toasts';
    zona.className = 'toast-container position-fixed top-0 end-0 p-3';
    zona.setAttribute('aria-live', 'polite');
    document.body.appendChild(zona);
  }
  const iconos = { exito: 'bi-check-circle-fill', error: 'bi-exclamation-octagon-fill', info: 'bi-info-circle-fill' };
  const el = document.createElement('div');
  el.className = `toast aviso-${tipo} border-0`;
  el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  el.innerHTML = `<div class="d-flex align-items-start gap-2 p-3">
      <i class="bi ${iconos[tipo]} fs-5"></i>
      <div class="flex-grow-1">${esc(mensaje)}</div>
      <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Cerrar"></button>
    </div>`;
  zona.appendChild(el);
  const toast = new bootstrap.Toast(el, { delay: tipo === 'error' ? 6000 : 4000 });
  toast.show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

/** Muestra un mensaje dentro de un contenedor (alerta en línea). */
function alerta(contenedor, mensaje, tipo = 'danger') {
  if (!contenedor) return;
  contenedor.innerHTML = mensaje
    ? `<div class="alert alert-${tipo} d-flex gap-2 align-items-start mb-0" role="alert">
         <i class="bi ${tipo === 'success' ? 'bi-check-circle' : 'bi-exclamation-triangle'}"></i><div>${esc(mensaje)}</div></div>`
    : '';
}

/** Deshabilita un botón mientras se ejecuta una acción. */
async function conCarga(boton, accion) {
  const original = boton.innerHTML;
  boton.disabled = true;
  boton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Procesando…';
  try {
    return await accion();
  } finally {
    boton.disabled = false;
    boton.innerHTML = original;
  }
}

/** Convierte un formulario en objeto. */
const datosFormulario = (form) => Object.fromEntries(new FormData(form).entries());

/** Validación HTML5 con estilos de Bootstrap. Devuelve true si es válido. */
function formularioValido(form) {
  form.classList.add('was-validated');
  return form.checkValidity();
}

/** Si la sesión expiró (401), redirige al inicio de sesión. */
function manejarError(err, destino) {
  if (err.status === 401) {
    notificar(err.message, 'error');
    setTimeout(() => { location.href = destino || '/login.html'; }, 1200);
    return;
  }
  notificar(err.message, 'error');
}

const estadoVacio = (texto, icono = 'bi-inbox') =>
  `<div class="vacio"><i class="bi ${icono}"></i><p>${esc(texto)}</p></div>`;
