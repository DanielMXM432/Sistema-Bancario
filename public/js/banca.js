// Banca virtual del cliente.
'use strict';

const estado = { cuentas: [], cuentaSeleccionada: null, destinoVerificado: null };
const $ = (id) => document.getElementById(id);
const fallo = (err) => manejarError(err, '/login.html');

// ---------------------------------------------------------------- Navegación
const menu = bootstrap.Offcanvas.getOrCreateInstance($('menu'));

function mostrarSeccion(nombre) {
  if (!$(`sec-${nombre}`)) nombre = 'inicio';
  document.querySelectorAll('.seccion').forEach((s) => s.classList.toggle('visible', s.id === `sec-${nombre}`));
  document.querySelectorAll('.sidebar .nav-link').forEach((a) => a.classList.toggle('active', a.dataset.seccion === nombre));
  menu.hide();
  window.scrollTo(0, 0);
  const cargadores = { inicio: cargarCuentas, movimientos: irAMovimientos, transferir: prepararTransferencia, perfil: cargarPerfil };
  if (cargadores[nombre]) cargadores[nombre]().catch(fallo);
}

document.addEventListener('click', (e) => {
  const enlace = e.target.closest('[data-seccion]');
  if (!enlace) return;
  e.preventDefault();
  history.replaceState(null, '', `#${enlace.dataset.seccion}`);
  mostrarSeccion(enlace.dataset.seccion);
});

$('btn-salir').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.href = '/login.html';
});

// ---------------------------------------------------------------- Cuentas
async function obtenerCuentas() {
  const { cuentas } = await api('/api/cliente/cuentas');
  estado.cuentas = cuentas;
  if (!estado.cuentaSeleccionada || !cuentas.some((c) => c.id === estado.cuentaSeleccionada)) {
    estado.cuentaSeleccionada = cuentas[0]?.id || null;
  }
  return cuentas;
}

function filaMovimiento(m, conCanal = false) {
  const clase = m.valor >= 0 ? 'valor-pos' : 'valor-neg';
  return `<tr>
    <td data-label="Fecha" class="text-nowrap">${fecha(m.fecha)}</td>
    <td data-label="Tipo">${etiquetaTipo(m.tipo)}</td>
    <td data-label="Descripción">${esc(m.descripcion)}</td>
    ${conCanal ? `<td data-label="Canal">${esc(CANALES[m.canal] || m.canal)}</td>` : ''}
    <td data-label="Valor" class="text-end ${clase}">${pesosConSigno(m.valor)}</td>
    <td data-label="Saldo resultante" class="text-end fw-semibold">${pesos(m.saldo_resultante)}</td>
  </tr>`;
}

async function cargarCuentas() {
  const cuentas = await obtenerCuentas();
  $('lista-cuentas').innerHTML = cuentas.length
    ? cuentas.map((c) => `
      <div class="col-md-6 col-xl-4">
        <div class="cuenta-card ${c.tipo === 'CORRIENTE' ? 'corriente' : ''} ${c.id === estado.cuentaSeleccionada ? 'seleccionada' : ''}"
             data-cuenta="${c.id}" role="button" tabindex="0" aria-label="Ver cuenta ${esc(c.numero_cuenta)}">
          <div class="d-flex justify-content-between align-items-start">
            <span class="tipo">Cuenta de ${c.tipo === 'CORRIENTE' ? 'corriente' : 'ahorros'}</span>
            ${c.estado !== 'ACTIVO' ? etiquetaEstado(c.estado) : '<i class="bi bi-wifi" style="transform:rotate(90deg);opacity:.6"></i>'}
          </div>
          <div class="saldo">${pesos(c.saldo)}</div>
          <div class="saldo-label">Saldo disponible</div>
          <div class="numero mt-3">N.° ${esc(c.numero_cuenta)}</div>
        </div>
      </div>`).join('')
    : `<div class="col-12">${estadoVacio('No tienes cuentas asociadas.')}</div>`;
  await cargarUltimos();
}

async function cargarUltimos() {
  if (!estado.cuentaSeleccionada) { $('tabla-ultimos').innerHTML = ''; return; }
  const { cuenta, movimientos } = await api(`/api/cliente/cuentas/${estado.cuentaSeleccionada}/movimientos?limite=6`);
  $('ultimos-cuenta').textContent = `· cuenta ${cuenta.numero_cuenta}`;
  $('tabla-ultimos').innerHTML = movimientos.length
    ? movimientos.map((m) => filaMovimiento(m)).join('')
    : `<tr><td colspan="5" class="sin-label">${estadoVacio('Aún no hay movimientos en esta cuenta.')}</td></tr>`;
}

$('lista-cuentas').addEventListener('click', (e) => {
  const card = e.target.closest('[data-cuenta]');
  if (!card) return;
  estado.cuentaSeleccionada = Number(card.dataset.cuenta);
  document.querySelectorAll('.cuenta-card').forEach((c) => c.classList.toggle('seleccionada', c === card));
  cargarUltimos().catch(fallo);
});
$('lista-cuentas').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-cuenta]')) e.target.click();
});

// ---------------------------------------------------------------- Movimientos
function opcionesCuentas(select, seleccion) {
  select.innerHTML = estado.cuentas.map((c) =>
    `<option value="${c.id}" ${c.id === seleccion ? 'selected' : ''}>${c.tipo === 'CORRIENTE' ? 'Corriente' : 'Ahorros'} · ${esc(c.numero_cuenta)}</option>`).join('');
}

async function irAMovimientos() {
  await obtenerCuentas();
  opcionesCuentas($('f-cuenta'), estado.cuentaSeleccionada);
  return cargarMovimientos();
}

async function cargarMovimientos() {
  if (!estado.cuentas.length) await obtenerCuentas();
  const select = $('f-cuenta');
  if (!select.options.length) opcionesCuentas(select, estado.cuentaSeleccionada);
  const id = Number(select.value) || estado.cuentaSeleccionada;
  if (!id) return;
  estado.cuentaSeleccionada = id;

  const f = datosFormulario($('form-filtros'));
  const params = new URLSearchParams({ limite: 300 });
  if (f.tipo) params.set('tipo', f.tipo);
  if (f.desde) params.set('desde', f.desde);
  if (f.hasta) params.set('hasta', f.hasta);

  const { cuenta, movimientos } = await api(`/api/cliente/cuentas/${id}/movimientos?${params}`);
  $('mov-saldo').textContent = pesos(cuenta.saldo);
  $('mov-cuenta').textContent = `${cuenta.tipo === 'CORRIENTE' ? 'Corriente' : 'Ahorros'} ${cuenta.numero_cuenta}`;
  $('tabla-movimientos').innerHTML = movimientos.length
    ? movimientos.map((m) => filaMovimiento(m, true)).join('')
    : `<tr><td colspan="6" class="sin-label">${estadoVacio('No hay movimientos con esos filtros.')}</td></tr>`;
}

$('form-filtros').addEventListener('submit', (e) => { e.preventDefault(); cargarMovimientos().catch(fallo); });
$('f-cuenta').addEventListener('change', () => cargarMovimientos().catch(fallo));

// ---------------------------------------------------------------- Transferencias
const formT = $('form-transferir');
const modalConfirmar = new bootstrap.Modal($('modal-confirmar'));

async function prepararTransferencia() {
  await obtenerCuentas();
  const activas = estado.cuentas.filter((c) => c.estado === 'ACTIVO');
  const select = $('t-origen');
  const anterior = Number(select.value) || estado.cuentaSeleccionada;
  select.innerHTML = activas.length
    ? activas.map((c) => `<option value="${c.id}" ${c.id === anterior ? 'selected' : ''}>${c.tipo === 'CORRIENTE' ? 'Corriente' : 'Ahorros'} · ${esc(c.numero_cuenta)}</option>`).join('')
    : '<option value="">No tienes cuentas activas</option>';
  mostrarDisponible();
}

function mostrarDisponible() {
  const c = estado.cuentas.find((x) => x.id === Number($('t-origen').value));
  $('t-disponible').textContent = c ? `Disponible: ${pesos(c.saldo)}` : '';
}
$('t-origen').addEventListener('change', mostrarDisponible);

async function verificarDestino() {
  const numero = $('t-destino').value.trim();
  estado.destinoVerificado = null;
  if (!/^\d{10}$/.test(numero)) {
    $('t-titular').innerHTML = '<span class="text-danger">El número de cuenta debe tener 10 dígitos.</span>';
    return null;
  }
  try {
    const d = await api(`/api/cliente/destino/${numero}`);
    if (!d.activa) {
      $('t-titular').innerHTML = '<span class="text-danger"><i class="bi bi-x-circle"></i> La cuenta destino no está activa y no puede recibir transferencias.</span>';
      return null;
    }
    const origen = estado.cuentas.find((x) => x.id === Number($('t-origen').value));
    if (origen && origen.numero_cuenta === d.numero_cuenta) {
      $('t-titular').innerHTML = '<span class="text-danger">La cuenta destino no puede ser la misma cuenta origen.</span>';
      return null;
    }
    estado.destinoVerificado = d;
    $('t-titular').innerHTML = `<span class="text-success"><i class="bi bi-check-circle"></i> Cuenta ${d.tipo === 'CORRIENTE' ? 'corriente' : 'de ahorros'} de <b>${esc(d.titular)}</b>${d.propia ? ' (cuenta propia)' : ''}</span>`;
    return d;
  } catch (err) {
    $('t-titular').innerHTML = `<span class="text-danger">${esc(err.message)}</span>`;
    return null;
  }
}

$('btn-verificar').addEventListener('click', verificarDestino);
$('t-destino').addEventListener('input', () => { estado.destinoVerificado = null; $('t-titular').textContent = ''; });

formT.addEventListener('submit', async (e) => {
  e.preventDefault();
  alerta($('t-mensaje'), '');
  if (!formularioValido(formT)) return;
  const datos = datosFormulario(formT);
  const origen = estado.cuentas.find((c) => c.id === Number(datos.cuentaOrigenId));
  const valor = Number(datos.valor);
  if (!origen) return alerta($('t-mensaje'), 'Seleccione una cuenta origen activa.');
  if (!(valor > 0)) return alerta($('t-mensaje'), 'El valor debe ser mayor que cero.');
  if (valor > origen.saldo) return alerta($('t-mensaje'), `Saldo insuficiente. Disponible: ${pesos(origen.saldo)}.`);
  const destino = estado.destinoVerificado || (await verificarDestino());
  if (!destino) return alerta($('t-mensaje'), 'Verifique la cuenta destino antes de continuar.');

  $('confirmar-datos').innerHTML = `
    <dt>Desde</dt><dd class="mono">${esc(origen.numero_cuenta)}</dd>
    <dt>Para</dt><dd><span class="mono">${esc(destino.numero_cuenta)}</span><br><small class="text-secondary">${esc(destino.titular)}</small></dd>
    <dt>Valor</dt><dd class="fs-5">${pesos(valor)}</dd>
    ${datos.descripcion ? `<dt>Descripción</dt><dd>${esc(datos.descripcion)}</dd>` : ''}
    <dt>Saldo después</dt><dd>${pesos(origen.saldo - valor)}</dd>`;
  modalConfirmar.show();
});

$('btn-confirmar').addEventListener('click', (e) => conCarga(e.currentTarget, async () => {
  try {
    const r = await api('/api/cliente/transferencias', { method: 'POST', body: datosFormulario(formT) });
    modalConfirmar.hide();
    notificar(r.mensaje);
    $('t-comprobante').innerHTML = `
      <div class="text-center mb-3"><i class="bi bi-check-circle-fill text-success" style="font-size:2.4rem"></i>
        <div class="fw-bold mt-1">Transferencia exitosa</div><div class="small text-secondary">Comprobante N.° ${r.transferenciaId}</div></div>
      <div class="comprobante"><dl>
        <dt>Fecha</dt><dd>${new Date().toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</dd>
        <dt>Cuenta origen</dt><dd class="mono">${esc(r.cuentaOrigen)}</dd>
        <dt>Cuenta destino</dt><dd class="mono">${esc(r.cuentaDestino)}</dd>
        <dt>Titular destino</dt><dd>${esc(r.titularDestino)}</dd>
        <dt>Valor</dt><dd>${pesos(r.valor)}</dd>
        <dt>Nuevo saldo</dt><dd class="text-success">${pesos(r.saldoNuevo)}</dd>
      </dl></div>`;
    formT.reset();
    formT.classList.remove('was-validated');
    $('t-titular').textContent = '';
    estado.destinoVerificado = null;
    await prepararTransferencia();
  } catch (err) {
    modalConfirmar.hide();
    if (err.status === 401) return fallo(err);
    alerta($('t-mensaje'), err.message);
  }
}));

// ---------------------------------------------------------------- Perfil
const DOCS = { CC: 'Cédula de ciudadanía', CE: 'Cédula de extranjería', TI: 'Tarjeta de identidad', PASAPORTE: 'Pasaporte' };

async function cargarPerfil() {
  const { perfil: p } = await api('/api/cliente/perfil');
  $('perfil-datos').innerHTML = `
    <dt>Nombre</dt><dd>${esc(p.nombres)} ${esc(p.apellidos)}</dd>
    <dt>Documento</dt><dd>${esc(DOCS[p.tipo_documento] || p.tipo_documento)}<br><span class="mono">${esc(p.documento)}</span></dd>
    <dt>Correo</dt><dd>${esc(p.email)}</dd>
    <dt>Teléfono</dt><dd>${esc(p.telefono || '—')}</dd>
    <dt>Dirección</dt><dd>${esc(p.direccion || '—')}</dd>
    <dt>Ciudad</dt><dd>${esc(p.ciudad || '—')}</dd>
    <dt>Estado</dt><dd>${etiquetaEstado(p.estado)}</dd>
    <dt>Cliente desde</dt><dd>${fecha(p.fecha_creacion, false)}</dd>`;
  const f = $('form-perfil');
  f.email.value = p.email;
  f.telefono.value = p.telefono || '';
  f.direccion.value = p.direccion || '';
  f.ciudad.value = p.ciudad || '';
}

$('form-perfil').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  alerta($('p-mensaje'), '');
  if (!formularioValido(form)) return;
  await conCarga(form.querySelector('button[type=submit]'), async () => {
    try {
      const r = await api('/api/cliente/perfil', { method: 'PUT', body: datosFormulario(form) });
      notificar(r.mensaje);
      form.classList.remove('was-validated');
      await cargarPerfil();
    } catch (err) {
      if (err.status === 401) return fallo(err);
      alerta($('p-mensaje'), err.message);
    }
  });
});

// ---------------------------------------------------------------- Contraseña
const formP = $('form-password');
formP.confirmacion.addEventListener('input', () => {
  formP.confirmacion.setCustomValidity(formP.confirmacion.value === formP.nueva.value ? '' : 'No coincide');
});
formP.nueva.addEventListener('input', () => formP.confirmacion.dispatchEvent(new Event('input')));

formP.addEventListener('submit', async (e) => {
  e.preventDefault();
  alerta($('c-mensaje'), '');
  if (!formularioValido(formP)) return;
  await conCarga(formP.querySelector('button[type=submit]'), async () => {
    try {
      const r = await api('/api/cliente/password', { method: 'PUT', body: datosFormulario(formP) });
      alerta($('c-mensaje'), r.mensaje, 'success');
      formP.reset();
      formP.classList.remove('was-validated');
    } catch (err) {
      if (err.status === 401) return fallo(err);
      alerta($('c-mensaje'), err.message);
    }
  });
});

// ---------------------------------------------------------------- Inicio
(async () => {
  try {
    const { usuario } = await api('/api/auth/sesion');
    if (!usuario || usuario.rol !== 'CLIENTE') { location.href = '/login.html'; return; }
    $('nombre-usuario').textContent = usuario.nombre;
    $('saludo').textContent = `Hola, ${usuario.nombre.split(' ')[0]}`;
    mostrarSeccion(location.hash.slice(1) || 'inicio');
  } catch (err) {
    fallo(err);
  }
})();
