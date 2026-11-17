// Configuración de la aplicación Express.
const path = require('path');
const express = require('express');
const session = require('express-session');

const authRoutes = require('./routes/auth.routes');
const clienteRoutes = require('./routes/cliente.routes');
const adminRoutes = require('./routes/admin.routes');
const cajeroRoutes = require('./routes/cajero.routes');

const app = express();

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) {
  console.warn('[aviso] SESSION_SECRET no está definida o es muy corta. Defina una cadena larga en .env.');
}

app.disable('x-powered-by');
// Detrás del proxy HTTPS del hosting (Railway, Render...) para que las cookies seguras funcionen
app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));

// Cabeceras básicas de seguridad
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use(session({
  name: 'banco.sid',
  secret: process.env.SESSION_SECRET || 'cambie-esta-clave-en-el-archivo-env',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: 'auto', // solo HTTPS cuando la página se abre por HTTPS
    maxAge: 30 * 60 * 1000, // 30 minutos
  },
  rolling: true, // la sesión se renueva con cada petición; vence tras 30 min sin actividad
}));

// Las respuestas de la API nunca se guardan en caché (siempre muestran datos actuales de MySQL)
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/cliente', clienteRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cajero', cajeroRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Recurso no encontrado.' }));

// Librerías de frontend servidas desde node_modules (funciona sin conexión a Internet)
const modulos = path.join(__dirname, '..', 'node_modules');
app.use('/vendor/bootstrap', express.static(path.join(modulos, 'bootstrap', 'dist')));
app.use('/vendor/bootstrap-icons', express.static(path.join(modulos, 'bootstrap-icons', 'font')));
app.use('/vendor/fuente', express.static(path.join(modulos, '@fontsource-variable', 'plus-jakarta-sans')));

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

// Manejador central de errores: mensajes claros, sin exponer detalles internos.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Los datos enviados no tienen un formato válido.' });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos.' });
  }
  if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || err.code === 'ER_CONSTRAINT_FAILED') {
    return res.status(400).json({ error: 'La operación viola una regla del banco y no se realizó.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Ocurrió un error interno. Intente de nuevo más tarde.' });
});

module.exports = app;
