// Punto de entrada: carga variables de entorno, verifica MySQL e inicia el servidor.
require('dotenv').config();
const app = require('./app');
const { pool, config } = require('./config/db');
const { baseExiste, crearBaseDeDatos } = require('./config/inicializar');

const PORT = Number(process.env.PORT || 3000);

(async () => {
  try {
    // Si la base de datos aún no existe (por ejemplo, la primera vez en el hosting),
    // se crea automáticamente con los datos de prueba.
    if (!(await baseExiste())) {
      console.log(`La base de datos ${config.database} no existe. Creándola con los datos de prueba...`);
      await crearBaseDeDatos();
      console.log('Base de datos creada.');
    }
    await pool.query('SELECT 1');
    console.log(`Conectado a MySQL (${config.host}/${config.database}).`);
  } catch (err) {
    console.error('No fue posible conectarse a MySQL:', err.message);
    console.error('Revise los datos de conexión en .env y que MySQL esté encendido.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Banco Horizonte en http://localhost:${PORT}`);
    console.log(`  Banca virtual:  http://localhost:${PORT}/login.html`);
    console.log(`  Panel admin:    http://localhost:${PORT}/login.html?modo=admin`);
    console.log(`  Cajero:         http://localhost:${PORT}/cajero.html`);
  });
})();
