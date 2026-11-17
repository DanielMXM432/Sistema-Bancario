// Pool de conexiones a MySQL. Las credenciales se leen de variables de entorno (.env).
// Acepta las variables propias del proyecto (DB_HOST, DB_USER...) o las que crea
// automáticamente Railway para su servicio MySQL (MYSQLHOST, MYSQLUSER...).
const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST || process.env.MYSQLHOST,
  port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
  user: process.env.DB_USER || process.env.MYSQLUSER,
  password: process.env.DB_PASSWORD ?? process.env.MYSQLPASSWORD ?? '',
  database: process.env.DB_NAME || 'banco_horizonte',
  // Zona horaria de las fechas guardadas (por defecto Colombia, UTC-5)
  timezone: process.env.DB_TIMEZONE || '-05:00',
};

if (!config.host || !config.user) {
  console.error('Faltan los datos de conexión a MySQL (DB_HOST y DB_USER). Copie .env.example como .env y complete los datos.');
  process.exit(1);
}
if (!/^\w+$/.test(config.database)) {
  console.error('DB_NAME solo puede contener letras, números y guion bajo.');
  process.exit(1);
}
if (!/^[+-]\d{2}:\d{2}$/.test(config.timezone)) {
  console.error('DB_TIMEZONE debe tener el formato -05:00.');
  process.exit(1);
}

const pool = mysql.createPool({
  host: config.host,
  port: config.port,
  user: config.user,
  password: config.password,
  database: config.database,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true, // DECIMAL -> number en JavaScript
  dateStrings: true,    // fechas como texto 'YYYY-MM-DD HH:MM:SS'
});

// Cada conexión usa la zona horaria configurada (NOW() y CURRENT_TIMESTAMP en hora local)
pool.pool.on('connection', (conn) => {
  conn.query(`SET time_zone = '${config.timezone}'`);
});

/**
 * Ejecuta una función dentro de una transacción.
 * Si la función lanza un error se hace ROLLBACK; si termina bien, COMMIT.
 */
async function enTransaccion(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const resultado = await fn(conn);
    await conn.commit();
    return resultado;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, enTransaccion, config };
