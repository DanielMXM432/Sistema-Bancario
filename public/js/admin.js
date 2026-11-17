// Panel administrativo del banco.
'use strict';

const $ = (id) => document.getElementById(id);
const fallo = (err) => manejarError(err, '/login.html?modo=admin');
let clienteActual = null;

// ---------------------------------------------------------------- Navegación
const menu = bootstrap.Offcanvas.getOrCreateInstance($('menu'));
const cargadores = {
  dashboard: cargarDashboard,
  clientes: cargarClientes,
  cuentas: cargarCuentas,
  movimientos: cargarMovimientos,
  consignar: async () => {},
};

function mostrarSeccion(nombre) {
  if (!$(`sec-${nombre}`)) nombre = 'dashboard';
  document.querySelectorAll('.seccion').forEach((s) => s.classList.toggle('visible', s.id === `sec-${nombre}`));
  document.querySelectorAll('.sidebar .nav-link').forEach((a) => a.classList.toggle('active', a.dataset.seccion === nombre));
  menu.hide();
  window.scrollTo(0, 0);
  cargadores[nombre]().catch(fallo);
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
  location.href = '/login.html?modo=admin';
});

const parametros = (form) => {
  const p = new URLSearchParams();
  Object.entries(datosFormulario(form)).forEach(([k, val]) => { if (val.trim()) p.set(k, val.trim()); });
  return p;
};

// ---------------------------------------------------------------- Dashboard
async function cargarDashboard() {
  const d = await api('/api/admin/dashboard');
  $('k-clientes').textContent = d.clientes.total;
  $('k-activos').textContent = d.clientes.activos;
  $('k-bloqueados').textContent = d.clientes.bloqueados;
  $('k-saldo').textContent = pesos(d.cuentas.saldo_total);
  $('k-cuentas-activas').textContent = `${d.cuentas.activas} de ${d.cuentas.total} cuentas activas`;
  $('k-cuentas-bloq').textContent = `${d.cuentas.bloqueadas} cuenta(s) bloqueada(s)`;
  $('k-hoy').innerHTML = `
    <dt>Movimientos</dt><dd>${d.hoy.movimientos}</dd>
    <dt>Consignado</dt><dd class="valor-pos">${pesos(d.hoy.consignado)}</dd>
    <dt>Retirado en cajero</dt><dd class="valor-neg">${pesos(d.hoy.retirado)}</dd>
    <dt>Clientes inactivos</dt><dd>${d.clientes.inactivos}</dd>`;
  $('tabla-actividad').innerHTML = d.ultimos.length
    ? d.ultimos.map((m) => `<tr>
        <td data-label="Fecha" class="text-nowrap">${fecha(m.fecha)}</td>
        <td data-label="Cuenta"><span class="mono">${esc(m.numero_cuenta)}</span><div class="small text-secondary">${esc(m.titular)}</div></td>
        <td data-label="Tipo">${etiquetaTipo(m.tipo)}</td>
        <td data-label="Valor" class="text-end ${m.valor >= 0 ? 'valor-pos' : 'valor-neg'}">${pesosConSigno(m.valor)}</td></tr>`).join('')
    : `<tr><td colspan="4" class="sin-label">${estadoVacio('Sin movimientos registrados.')}</td></tr>`;
}

// ---------------------------------------------------------------- Clientes
async function cargarClientes() {
  const { clientes } = await api(`/api/admin/clientes?${parametros($('form-buscar-clientes'))}`);
  $('tabla-clientes').innerHTML = clientes.length
    ? clientes.map((c) => `<tr>
        <td data-label="Cliente" class="fw-semibold">${esc(c.nombres)} ${esc(c.apellidos)}</td>
        <td data-label="Documento"><span class="text-secondary small">${esc(c.tipo_documento)}</span> <span class="mono">${esc(c.documento)}</span></td>
        <td data-label="Contacto"><div>${esc(c.email)}</div><div class="small text-secondary">${esc(c.telefono || '')}</div></td>
        <td data-label="Cuentas" class="text-center">${c.num_cuentas}</td>
        <td data-label="Saldo total" class="text-end fw-semibold">${pesos(c.saldo_total)}</td>
        <td data-label="Estado">${etiquetaEstado(c.estado)}</td>
        <td class="text-end sin-label"><button class="btn btn-sm btn-outline-primary" data-ver-cliente="${c.id}"><i class="bi bi-eye me-1"></i>Ver</button></td>
      </tr>`).join('')
    : `<tr><td colspan="7" class="sin-label">${estadoVacio('No se encontraron clientes.', 'bi-person-x')}</td></tr>`;
}
$('form-buscar-clientes').addEventListener('submit', (e) => { e.preventDefault(); cargarClientes().catch(fallo); });

// Campos de datos personales (compartidos por crear y editar)
const CAMPOS_PERSONALES = `
  <div class="col-md-4"><label class="form-label">Tipo de documento</label>
    <select class="form-select" name="tipo_documento"><option value="CC">Cédula de ciudadanía</option><option value="CE">Cédula de extranjería</option>
    <option value="TI">Tarjeta de identidad</option><option value="PASAPORTE">Pasaporte</option></select></div>
  <div class="col-md-4"><label class="form-label">Número de documento</label>
    <input class="form-control mono" name="documento" pattern="[0-9A-Za-z]{5,20}" maxlength="20" required>
    <div class="invalid-feedback">Entre 5 y 20 caracteres, sin puntos ni espacios.</div></div>
  <div class="col-md-4"><label class="form-label">Teléfono</label>
    <input class="form-control" name="telefono" pattern="[0-9+ ]{7,20}" maxlength="20">
    <div class="invalid-feedback">Entre 7 y 20 dígitos.</div></div>
  <div class="col-md-6"><label class="form-label">Nombres</label>
    <input class="form-control" name="nombres" minlength="2" maxlength="80" pattern="[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .\\-]{2,80}" required>
    <div class="invalid-feedback">Solo letras (2 a 80 caracteres).</div></div>
  <div class="col-md-6"><label class="form-label">Apellidos</label>
    <input class="form-control" name="apellidos" minlength="2" maxlength="80" pattern="[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .\\-]{2,80}" required>
    <div class="invalid-feedback">Solo letras (2 a 80 caracteres).</div></div>
  <div class="col-md-6"><label class="form-label">Correo electrónico</label>
    <input class="form-control" name="email" type="email" maxlength="120" required>
    <div class="invalid-feedback">Ingrese un correo válido.</div></div>
  <div class="col-md-6"><label class="form-label">Ciudad</label><input class="form-control" name="ciudad" maxlength="80"></div>
  <div class="col-12"><label class="form-label">Dirección</label><input class="form-control" name="direccion" maxlength="150"></div>`;
document.querySelectorAll('[data-campos-personales]').forEach((el) => { el.innerHTML = CAMPOS_PERSONALES; });

// Crear cliente
const modalCrear = new bootstrap.Modal($('modal-crear'));
function abrirCrear() {
  const f = $('form-crear');
  f.reset();
  f.classList.remove('was-validated');
  alerta($('crear-mensaje'), '');
  modalCrear.show();
}
$('btn-nuevo-cliente').addEventListener('click', abrirCrear);
$('btn-nuevo-cliente-dash').addEventListener('click', abrirCrear);

$('form-crear').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  alerta($('crear-mensaje'), '');
  if (!formularioValido(f)) return alerta($('crear-mensaje'), 'Revise los campos marcados en rojo.');
  await conCarga(f.querySelector('[type=submit]'), async () => {
    try {
      const r = await api('/api/admin/clientes', { method: 'POST', body: datosFormulario(f) });
      modalCrear.hide();
      notificar(r.mensaje);
      mostrarSeccion('clientes');
      abrirDetalle(r.clienteId);
    } catch (err) {
      if (err.status === 401) return fallo(err);
      alerta($('crear-mensaje'), err.message);
    }
  });
});

// Detalle de cliente
const modalDetalle = new bootstrap.Modal($('modal-detalle'));
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ver-cliente]');
  if (!b) return;
  e.preventDefault();
  abrirDetalle(Number(b.dataset.verCliente));
});

async function abrirDetalle(id, mantenerPestana = false) {
  try {
    const { cliente: c, cuentas, movimientos } = await api(`/api/admin/clientes/${id}`);
    clienteActual = c;
    $('titulo-detalle').textContent = `${c.nombres} ${c.apellidos}`;
    $('detalle-sub').innerHTML = `${esc(c.tipo_documento)} ${esc(c.documento)} · ${etiquetaEstado(c.estado)}`;
    $('detalle-datos').innerHTML = `
      <dt>Correo</dt><dd>${esc(c.email)}</dd>
      <dt>Teléfono</dt><dd>${esc(c.telefono || '—')}</dd>
      <dt>Dirección</dt><dd>${esc(c.direccion || '—')}</dd>
      <dt>Ciudad</dt><dd>${esc(c.ciudad || '—')}</dd>
      <dt>Cliente desde</dt><dd>${fecha(c.fecha_creacion, false)}</dd>
      <dt>Último acceso</dt><dd>${c.ultimo_acceso ? fecha(c.ultimo_acceso) : 'Nunca'}</dd>
      <dt>Saldo total</dt><dd class="fs-6">${pesos(cuentas.reduce((s, x) => s + x.saldo, 0))}</dd>`;
    $('detalle-cuentas').innerHTML = cuentas.length
      ? cuentas.map((x) => `<tr>
          <td data-label="Cuenta" class="mono">${esc(x.numero_cuenta)}</td>
          <td data-label="Tipo">${x.tipo === 'CORRIENTE' ? 'Corriente' : 'Ahorros'}</td>
          <td data-label="Saldo" class="text-end fw-semibold">${pesos(x.saldo)}</td>
          <td data-label="Estado">${etiquetaEstado(x.estado)}${x.intentos_pin_fallidos ? `<div class="small text-danger">${x.intentos_pin_fallidos} intento(s) PIN fallido(s)</div>` : ''}</td>
          <td data-label="Acciones" class="text-nowrap">
            ${x.estado === 'ACTIVO'
              ? `<button class="btn btn-sm btn-outline-danger" data-cuenta-estado="BLOQUEADO" data-cuenta-id="${x.id}">Bloquear</button>`
              : `<button class="btn btn-sm btn-outline-success" data-cuenta-estado="ACTIVO" data-cuenta-id="${x.id}">Habilitar</button>`}
            <button class="btn btn-sm btn-outline-secondary" data-cambiar-pin="${x.id}">PIN</button>
          </td></tr>
          <tr class="d-none" id="fila-pin-${x.id}"><td colspan="5" class="sin-label">
            <form class="d-flex gap-2 justify-content-end" data-form-pin="${x.id}" novalidate>
              <input class="form-control form-control-sm mono" style="max-width:160px" name="pin" placeholder="Nuevo PIN" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required aria-label="Nuevo PIN">
              <button class="btn btn-sm btn-primary">Guardar PIN</button>
            </form></td></tr>`).join('')
      : `<tr><td colspan="5" class="sin-label">${estadoVacio('Sin cuentas.')}</td></tr>`;
    $('detalle-movimientos').innerHTML = movimientos.length
      ? movimientos.map((m) => `<tr>
          <td data-label="Fecha" class="text-nowrap">${fecha(m.fecha)}</td>
          <td data-label="Cuenta" class="mono">${esc(m.numero_cuenta)}</td>
          <td data-label="Tipo">${etiquetaTipo(m.tipo)}</td>
          <td data-label="Valor" class="text-end ${m.valor >= 0 ? 'valor-pos' : 'valor-neg'}">${pesosConSigno(m.valor)}</td>
          <td data-label="Saldo" class="text-end">${pesos(m.saldo_resultante)}</td></tr>`).join('')
      : `<tr><td colspan="5" class="sin-label">${estadoVacio('Sin movimientos.')}</td></tr>`;

    // Formulario de edición precargado
    const f = $('form-editar');
    f.classList.remove('was-validated');
    ['tipo_documento', 'documento', 'nombres', 'apellidos', 'email', 'telefono', 'direccion', 'ciudad']
      .forEach((k) => { f.elements[k].value = c[k] || ''; });
    alerta($('editar-mensaje'), '');
    $('estado-actual').innerHTML = etiquetaEstado(c.estado);
    document.querySelectorAll('[data-estado]').forEach((b) => { b.disabled = b.dataset.estado === c.estado; });

    if (!mantenerPestana) bootstrap.Tab.getOrCreateInstance(document.querySelector('[data-bs-target="#tab-resumen"]')).show();
    modalDetalle.show();
  } catch (err) {
    fallo(err);
  }
}

// Refresca el detalle y la lista de fondo después de un cambio
async function refrescar() {
  await abrirDetalle(clienteActual.id, true);
  const visible = document.querySelector('.seccion.visible').id.replace('sec-', '');
  cargadores[visible]().catch(() => {});
}

$('form-editar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  alerta($('editar-mensaje'), '');
  if (!formularioValido(f)) return;
  await conCarga(f.querySelector('[type=submit]'), async () => {
    try {
      const r = await api(`/api/admin/clientes/${clienteActual.id}`, { method: 'PUT', body: datosFormulario(f) });
      notificar(r.mensaje);
      await refrescar();
    } catch (err) {
      if (err.status === 401) return fallo(err);
      alerta($('editar-mensaje'), err.message);
    }
  });
});

document.querySelectorAll('[data-estado]').forEach((b) => b.addEventListener('click', () => conCarga(b, async () => {
  try {
    const r = await api(`/api/admin/clientes/${clienteActual.id}/estado`, { method: 'PATCH', body: { estado: b.dataset.estado } });
    notificar(r.mensaje, b.dataset.estado === 'ACTIVO' ? 'exito' : 'info');
    await refrescar();
  } catch (err) { fallo(err); }
})));

$('form-reset').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  if (!formularioValido(f)) return notificar('La contraseña debe tener mínimo 8 caracteres con letras y números.', 'error');
  try {
    const r = await api(`/api/admin/clientes/${clienteActual.id}/password`, { method: 'PUT', body: datosFormulario(f) });
    notificar(r.mensaje);
    f.reset();
    f.classList.remove('was-validated');
  } catch (err) { fallo(err); }
});

$('form-nueva-cuenta').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  if (!formularioValido(f)) return notificar('El PIN debe tener 4 dígitos.', 'error');
  try {
    const r = await api(`/api/admin/clientes/${clienteActual.id}/cuentas`, { method: 'POST', body: datosFormulario(f) });
    notificar(r.mensaje);
    f.reset();
    f.classList.remove('was-validated');
    await refrescar();
  } catch (err) { fallo(err); }
});

// Acciones sobre cuentas (detalle del cliente y listado de cuentas)
document.addEventListener('click', async (e) => {
  const bEstado = e.target.closest('[data-cuenta-estado]');
  if (bEstado) {
    try {
      const r = await api(`/api/admin/cuentas/${bEstado.dataset.cuentaId}/estado`, { method: 'PATCH', body: { estado: bEstado.dataset.cuentaEstado } });
      notificar(r.mensaje, bEstado.dataset.cuentaEstado === 'ACTIVO' ? 'exito' : 'info');
      if (clienteActual && $('modal-detalle').classList.contains('show')) await refrescar();
      else cargarCuentas().catch(fallo);
    } catch (err) { fallo(err); }
    return;
  }
  const bPin = e.target.closest('[data-cambiar-pin]');
  if (bPin) $(`fila-pin-${bPin.dataset.cambiarPin}`).classList.toggle('d-none');
  const bConsignar = e.target.closest('[data-consignar]');
  if (bConsignar) {
    mostrarSeccion('consignar');
    history.replaceState(null, '', '#consignar');
    $('cs-cuenta').value = bConsignar.dataset.consignar;
    consultarCuenta();
    $('cs-valor').focus();
  }
});

document.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-form-pin]');
  if (!f) return;
  e.preventDefault();
  if (!formularioValido(f)) return notificar('El PIN debe tener 4 dígitos.', 'error');
  try {
    const r = await api(`/api/admin/cuentas/${f.dataset.formPin}/pin`, { method: 'PUT', body: datosFormulario(f) });
    notificar(r.mensaje);
    await refrescar();
  } catch (err) { fallo(err); }
});

// ---------------------------------------------------------------- Cuentas
async function cargarCuentas() {
  const { cuentas } = await api(`/api/admin/cuentas?${parametros($('form-buscar-cuentas'))}`);
  $('tabla-cuentas').innerHTML = cuentas.length
    ? cuentas.map((c) => `<tr>
        <td data-label="Cuenta" class="mono fw-semibold">${esc(c.numero_cuenta)}</td>
        <td data-label="Tipo">${c.tipo === 'CORRIENTE' ? 'Corriente' : 'Ahorros'}</td>
        <td data-label="Titular"><a href="#" class="text-decoration-none" data-ver-cliente="${c.cliente_id}">${esc(c.titular)}</a>
          ${c.cliente_estado !== 'ACTIVO' ? `<div class="small text-danger">Cliente ${esc(c.cliente_estado.toLowerCase())}</div>` : ''}</td>
        <td data-label="Saldo" class="text-end fw-bold">${pesos(c.saldo)}</td>
        <td data-label="Estado">${etiquetaEstado(c.estado)}</td>
        <td data-label="Apertura" class="text-nowrap">${fecha(c.fecha_apertura, false)}</td>
        <td class="text-end text-nowrap sin-label">
          <button class="btn btn-sm btn-outline-primary" data-consignar="${esc(c.numero_cuenta)}" ${c.estado !== 'ACTIVO' ? 'disabled' : ''}>Consignar</button>
          ${c.estado === 'ACTIVO'
            ? `<button class="btn btn-sm btn-outline-danger" data-cuenta-estado="BLOQUEADO" data-cuenta-id="${c.id}">Bloquear</button>`
            : `<button class="btn btn-sm btn-outline-success" data-cuenta-estado="ACTIVO" data-cuenta-id="${c.id}">Habilitar</button>`}
        </td></tr>`).join('')
    : `<tr><td colspan="7" class="sin-label">${estadoVacio('No se encontraron cuentas.')}</td></tr>`;
  $('total-cuentas').textContent = pesos(cuentas.reduce((s, c) => s + c.saldo, 0));
}
$('form-buscar-cuentas').addEventListener('submit', (e) => { e.preventDefault(); cargarCuentas().catch(fallo); });

// ---------------------------------------------------------------- Consignaciones
async function consultarCuenta() {
  const numero = $('cs-cuenta').value.trim();
  if (!/^\d{10}$/.test(numero)) {
    $('cs-info').innerHTML = '<span class="text-danger small">El número de cuenta debe tener 10 dígitos.</span>';
    return null;
  }
  try {
    const { cuenta: c } = await api(`/api/admin/cuentas/numero/${numero}`);
    const operable = c.estado === 'ACTIVO' && c.cliente_estado === 'ACTIVO';
    $('cs-info').innerHTML = `<div class="alert ${operable ? 'alert-success' : 'alert-warning'} py-2 mb-0 small">
      <b>${esc(c.titular)}</b> · ${esc(c.documento)} · ${c.tipo === 'CORRIENTE' ? 'Corriente' : 'Ahorros'}<br>
      Saldo actual: <b>${pesos(c.saldo)}</b> · Cuenta ${etiquetaEstado(c.estado)} · Cliente ${etiquetaEstado(c.cliente_estado)}
      ${operable ? '' : '<div class="mt-1">Esta cuenta no puede recibir operaciones.</div>'}</div>`;
    return c;
  } catch (err) {
    if (err.status === 401) return fallo(err);
    $('cs-info').innerHTML = `<span class="text-danger small">${esc(err.message)}</span>`;
    return null;
  }
}
$('btn-buscar-cuenta').addEventListener('click', consultarCuenta);
$('cs-cuenta').addEventListener('change', consultarCuenta);

$('form-consignar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  alerta($('cs-mensaje'), '');
  if (!formularioValido(f)) return;
  if (!(Number(f.valor.value) > 0)) return alerta($('cs-mensaje'), 'El valor debe ser mayor que cero.');
  await conCarga(f.querySelector('[type=submit]'), async () => {
    try {
      const r = await api('/api/admin/consignaciones', { method: 'POST', body: datosFormulario(f) });
      notificar(r.mensaje);
      $('cs-comprobante').innerHTML = `
        <div class="text-center mb-3"><i class="bi bi-check-circle-fill text-success" style="font-size:2.4rem"></i>
          <div class="fw-bold mt-1">Consignación exitosa</div><div class="small text-secondary">Movimiento N.° ${r.movimientoId}</div></div>
        <div class="comprobante"><dl>
          <dt>Cuenta</dt><dd class="mono">${esc(r.numeroCuenta)}</dd>
          <dt>Titular</dt><dd>${esc(r.titular)}</dd>
          <dt>Valor</dt><dd class="valor-pos">${pesos(r.valor)}</dd>
          <dt>Saldo anterior</dt><dd>${pesos(r.saldoAnterior)}</dd>
          <dt>Nuevo saldo</dt><dd class="text-success fs-6">${pesos(r.saldoNuevo)}</dd>
        </dl></div>`;
      f.reset();
      f.classList.remove('was-validated');
      $('cs-info').innerHTML = '';
    } catch (err) {
      if (err.status === 401) return fallo(err);
      alerta($('cs-mensaje'), err.message);
    }
  });
});

// ---------------------------------------------------------------- Movimientos
async function cargarMovimientos() {
  const { movimientos } = await api(`/api/admin/movimientos?${parametros($('form-buscar-mov'))}`);
  const ingresos = movimientos.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0);
  const egresos = movimientos.filter((m) => m.valor < 0).reduce((s, m) => s + m.valor, 0);
  $('mov-resumen').innerHTML = `${movimientos.length} movimiento(s) · Ingresos <span class="valor-pos">${pesos(ingresos)}</span> · Egresos <span class="valor-neg">${pesos(Math.abs(egresos))}</span>`;
  $('tabla-movimientos').innerHTML = movimientos.length
    ? movimientos.map((m) => `<tr>
        <td data-label="Fecha" class="text-nowrap">${fecha(m.fecha)}</td>
        <td data-label="Cuenta" class="mono">${esc(m.numero_cuenta)}</td>
        <td data-label="Titular">${esc(m.titular)}</td>
        <td data-label="Tipo">${etiquetaTipo(m.tipo)}</td>
        <td data-label="Descripción">${esc(m.descripcion)}</td>
        <td data-label="Canal">${esc(CANALES[m.canal] || m.canal)}</td>
        <td data-label="Valor" class="text-end ${m.valor >= 0 ? 'valor-pos' : 'valor-neg'}">${pesosConSigno(m.valor)}</td>
        <td data-label="Saldo result." class="text-end">${pesos(m.saldo_resultante)}</td></tr>`).join('')
    : `<tr><td colspan="8" class="sin-label">${estadoVacio('No hay movimientos con esos filtros.')}</td></tr>`;
}
$('form-buscar-mov').addEventListener('submit', (e) => { e.preventDefault(); cargarMovimientos().catch(fallo); });

// ---------------------------------------------------------------- Inicio
(async () => {
  try {
    const { usuario } = await api('/api/auth/sesion');
    if (!usuario || usuario.rol !== 'ADMIN') { location.href = '/login.html?modo=admin'; return; }
    $('nombre-usuario').textContent = usuario.nombre;
    mostrarSeccion(location.hash.slice(1) || 'dashboard');
  } catch (err) {
    fallo(err);
  }
})();
