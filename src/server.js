// Punto de entrada: carga variables de entorno, verifica MySQL e inicia el servidor.
require('dotenv').config();
const app = require('./app');
const { pool } = require('./config/db');

const PORT = Number(process.env.PORT || 3000);

(async () => {
  try {
    await pool.query('SELECT 1');
    console.log(`Conectado a MySQL (${process.env.DB_HOST}/${process.env.DB_NAME}).`);
  } catch (err) {
    console.error('No fue posible conectarse a MySQL:', err.message);
    console.error('Revise los datos de conexión en .env y que haya ejecutado database/database.sql (npm run db:init).');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Banco Horizonte en http://localhost:${PORT}`);
    console.log(`  Banca virtual:  http://localhost:${PORT}/login.html`);
    console.log(`  Panel admin:    http://localhost:${PORT}/login.html?modo=admin`);
    console.log(`  Cajero:         http://localhost:${PORT}/cajero.html`);
  });
})();
