// Pool de conexiones a MySQL. Las credenciales se leen de variables de entorno (.env).
const mysql = require('mysql2/promise');

const requeridas = ['DB_HOST', 'DB_USER', 'DB_NAME'];
for (const nombre of requeridas) {
  if (!process.env[nombre]) {
    console.error(`Falta la variable de entorno ${nombre}. Copie .env.example como .env y complete los datos.`);
    process.exit(1);
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true, // DECIMAL -> number en JavaScript
  dateStrings: true,    // fechas como texto 'YYYY-MM-DD HH:MM:SS'
  timezone: 'local',
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

module.exports = { pool, enTransaccion };
