// Cajero automático virtual.
'use strict';

const $ = (id) => document.getElementById(id);
const MONTOS = [20000, 50000, 100000, 200000, 300000, 500000];
let pantallaActual = 'ingreso';
let campoActivo = null;

function mostrar(pantalla) {
  pantallaActual = pantalla;
  document.querySelectorAll('[data-pantalla]').forEach((p) => { p.hidden = p.dataset.pantalla !== pantalla; });
  mensaje('');
  const foco = { ingreso: $('in-cuenta').value.length === 10 ? 'in-pin' : 'in-cuenta', retiro: 'in-valor' }[pantalla];
  activarCampo(foco ? $(foco) : null);
}

function mensaje(texto, tipo = 'error') {
  const el = $('mensaje');
  el.textContent = texto;
  el.className = `atm-mensaje ${texto ? tipo : ''}`;
}

function activarCampo(input) {
  document.querySelectorAll('.campo-atm').forEach((c) => c.classList.toggle('campo-activo', c === input));
  campoActivo = input;
  if (input) input.focus({ preventScroll: true });
}
document.querySelectorAll('.campo-atm').forEach((c) => {
  c.addEventListener('focus', () => activarCampo(c));
  c.addEventListener('input', () => { c.value = c.value.replace(/\D/g, ''); });
});

// Si la sesión del cajero expira, vuelve a la identificación
function manejar(err) {
  if (err.status === 401) {
    $('form-ingreso').reset();
    mostrar('ingreso');
  }
  mensaje(err.message);
}

// ---------------------------------------------------------------- Teclado físico en pantalla
$('teclado').addEventListener('click', (e) => {
  const tecla = e.target.closest('[data-tecla]')?.dataset.tecla;
  if (!tecla) return;
  if (tecla === 'cancelar') return cancelar();
  if (tecla === 'aceptar') return aceptar();
  if (!campoActivo) return;
  if (tecla === 'borrar') campoActivo.value = campoActivo.value.slice(0, -1);
  else campoActivo.value = (campoActivo.value + tecla).slice(0, Number(campoActivo.maxLength));
  campoActivo.focus({ preventScroll: true });
  // Al completar el número de cuenta, pasa automáticamente al PIN
  if (campoActivo.id === 'in-cuenta' && campoActivo.value.length === 10) activarCampo($('in-pin'));
});

function cancelar() {
  if (pantallaActual === 'ingreso') {
    $('form-ingreso').reset();
    mostrar('ingreso');
  } else if (pantallaActual === 'menu' || pantallaActual === 'adios') {
    salir();
  } else {
    mostrar('menu');
  }
}

function aceptar() {
  if (pantallaActual === 'ingreso') ingresar();
  else if (pantallaActual === 'retiro') retirar($('in-valor').value);
}

// ---------------------------------------------------------------- Identificación
$('form-ingreso').addEventListener('submit', (e) => { e.preventDefault(); ingresar(); });
$('in-cuenta').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); activarCampo($('in-pin')); }
});

async function ingresar() {
  const numeroCuenta = $('in-cuenta').value.trim();
  const pin = $('in-pin').value.trim();
  if (!/^\d{10}$/.test(numeroCuenta)) { activarCampo($('in-cuenta')); return mensaje('El número de cuenta debe tener 10 dígitos.'); }
  if (!/^\d{4}$/.test(pin)) { activarCampo($('in-pin')); return mensaje('El PIN debe tener 4 dígitos.'); }
  mensaje('Verificando…', 'ok');
  try {
    const r = await api('/api/cajero/ingresar', { method: 'POST', body: { numeroCuenta, pin } });
    $('menu-saludo').textContent = r.mensaje;
    $('menu-cuenta').textContent = `Cuenta de ${r.cuenta.tipo === 'CORRIENTE' ? 'corriente' : 'ahorros'} N.° ${r.cuenta.numero_cuenta}`;
    $('form-ingreso').reset();
    mostrar('menu');
  } catch (err) {
    $('in-pin').value = '';
    activarCampo($('in-pin'));
    mensaje(err.message);
  }
}

// ---------------------------------------------------------------- Menú
document.addEventListener('click', (e) => {
  const ir = e.target.closest('[data-ir]')?.dataset.ir;
  if (ir) {
    if (ir === 'saldo') return consultarSaldo();
    if (ir === 'movimientos') return consultarMovimientos();
    if (ir === 'retiro') { $('in-valor').value = ''; return mostrar('retiro'); }
    return mostrar(ir);
  }
  if (e.target.closest('[data-accion="salir"]')) salir();
});

async function consultarSaldo() {
  try {
    const r = await api('/api/cajero/saldo');
    $('saldo-cuenta').textContent = `Cuenta ${r.numero_cuenta}`;
    $('saldo-valor').textContent = pesos(r.saldo);
    mostrar('saldo');
  } catch (err) { manejar(err); }
}

async function consultarMovimientos() {
  try {
    const r = await api('/api/cajero/movimientos');
    $('mov-cuenta').textContent = `Cuenta ${r.numero_cuenta}`;
    $('mov-lista').innerHTML = r.movimientos.length
      ? r.movimientos.map((m) => `<tr>
          <td>${fecha(m.fecha, false)}</td>
          <td>${esc(TIPOS_MOV[m.tipo]?.texto || m.tipo)}</td>
          <td class="text-end fw-bold" style="color:${m.valor >= 0 ? '#9ff0c0' : '#ff9b9b'}">${pesosConSigno(m.valor)}</td>
          <td class="text-end" style="color:#9fc3e6">${pesos(m.saldo_resultante)}</td></tr>`).join('')
      : '<tr><td class="text-center">No hay movimientos.</td></tr>';
    mostrar('movimientos');
  } catch (err) { manejar(err); }
}

// ---------------------------------------------------------------- Retiro
$('montos-rapidos').innerHTML = MONTOS.map((m) =>
  `<button class="atm-opcion justify-content-center" data-monto="${m}">${pesos(m)}</button>`).join('');
$('montos-rapidos').addEventListener('click', (e) => {
  const b = e.target.closest('[data-monto]');
  if (b) retirar(b.dataset.monto);
});
$('form-retiro').addEventListener('submit', (e) => { e.preventDefault(); retirar($('in-valor').value); });

let retirando = false;
async function retirar(valorTexto) {
  if (retirando) return;
  const valor = Number(valorTexto);
  if (!valorTexto || !(valor > 0)) return mensaje('Ingrese un valor mayor que cero.');
  if (valor % 10000 !== 0) return mensaje('El cajero solo entrega montos múltiplos de $10.000.');
  retirando = true;
  mensaje('Procesando retiro…', 'ok');
  try {
    const r = await api('/api/cajero/retiro', { method: 'POST', body: { valor } });
    $('res-valor').textContent = pesos(r.valor);
    $('res-saldo').textContent = pesos(r.saldoNuevo);
    mostrar('resultado');
    const billetes = $('billetes');
    billetes.classList.remove('salir');
    void billetes.offsetWidth; // reinicia la animación
    billetes.classList.add('salir');
  } catch (err) {
    manejar(err);
  } finally {
    retirando = false;
  }
}

// ---------------------------------------------------------------- Salir
async function salir() {
  await api('/api/cajero/salir', { method: 'POST' }).catch(() => {});
  $('billetes').classList.remove('salir');
  mostrar('adios');
  setTimeout(() => { if (pantallaActual === 'adios') mostrar('ingreso'); }, 4000);
}

// Teclas del teclado físico de la computadora
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cancelar();
});

mostrar('ingreso');
