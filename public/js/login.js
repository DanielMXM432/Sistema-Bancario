// Pantalla de inicio de sesión (clientes y administradores).
'use strict';

const esAdmin = new URLSearchParams(location.search).get('modo') === 'admin';
const form = document.getElementById('form-login');
const mensaje = document.getElementById('mensaje');

const PRUEBA = esAdmin
  ? [{ etiqueta: 'Administrador', usuario: 'admin@bancohorizonte.com', password: 'Admin123*' }]
  : [
      { etiqueta: 'Laura', usuario: 'laura.gomez@correo.com', password: 'Cliente123*' },
      { etiqueta: 'Carlos', usuario: 'carlos.ramirez@correo.com', password: 'Cliente123*' },
      { etiqueta: 'Ana', usuario: 'ana.martinez@correo.com', password: 'Cliente123*' },
      { etiqueta: 'Pedro (bloqueado)', usuario: 'pedro.rojas@correo.com', password: 'Cliente123*' },
    ];

if (esAdmin) {
  document.title = 'Panel administrativo | Banco Horizonte';
  document.getElementById('lateral').classList.add('admin');
  document.getElementById('lateral-sub').textContent = 'Panel administrativo';
  document.getElementById('lateral-titulo').textContent = 'Toda la operación del banco en un solo panel.';
  document.getElementById('lateral-texto').textContent = 'Gestiona clientes y cuentas, realiza consignaciones y supervisa cada movimiento.';
  document.getElementById('titulo').textContent = 'Acceso administrativo';
  document.getElementById('subtitulo').textContent = 'Solo personal autorizado del banco.';
}

const contenedorPrueba = document.getElementById('usuarios-prueba');
PRUEBA.forEach((u) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn-outline-secondary btn-sm';
  b.textContent = u.etiqueta;
  b.addEventListener('click', () => {
    form.usuario.value = u.usuario;
    form.password.value = u.password;
  });
  contenedorPrueba.appendChild(b);
});

document.getElementById('ver-password').addEventListener('click', (e) => {
  const input = form.password;
  input.type = input.type === 'password' ? 'text' : 'password';
  e.currentTarget.innerHTML = `<i class="bi ${input.type === 'password' ? 'bi-eye' : 'bi-eye-slash'}"></i>`;
});

// Si ya hay sesión, ir directo al módulo correspondiente
api('/api/auth/sesion').then(({ usuario }) => {
  if (usuario) location.href = usuario.rol === 'ADMIN' ? '/admin.html' : '/banca.html';
}).catch(() => {});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  alerta(mensaje, '');
  if (!formularioValido(form)) return;
  const boton = document.getElementById('btn-ingresar');
  await conCarga(boton, async () => {
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: datosFormulario(form) });
      alerta(mensaje, r.mensaje, 'success');
      location.href = r.redireccion;
    } catch (err) {
      alerta(mensaje, err.message);
    }
  });
});
