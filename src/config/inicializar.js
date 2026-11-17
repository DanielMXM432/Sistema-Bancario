// Creación de la base de datos a partir de database/database.sql.
// La usan "npm run db:init" y el arranque del servidor (cuando la base aún no existe,
// por ejemplo la primera vez que se publica en un hosting).
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { config } = require('./db');

const ARCHIVO_SQL = path.join(__dirname, '..', '..', 'database', 'database.sql');

function conexionSinBase(opciones = {}) {
  return mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    ...opciones,
  });
}

/** Ejecuta database.sql (elimina y recrea la base con los datos de prueba). */
async function crearBaseDeDatos() {
  // El script usa el nombre banco_horizonte; se reemplaza por DB_NAME si es distinto.
  const sql = fs.readFileSync(ARCHIVO_SQL, 'utf8').replace(/\bbanco_horizonte\b/g, config.database);
  const conn = await conexionSinBase({ multipleStatements: true });
  try {
    await conn.query(`SET time_zone = '${config.timezone}'`);
    await conn.query(sql);
  } finally {
    await conn.end();
  }
}

/** Indica si la base ya tiene las tablas del banco. */
async function baseExiste() {
  const conn = await conexionSinBase();
  try {
    const [filas] = await conn.query(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = 'usuarios'",
      [config.database]
    );
    return filas[0].n > 0;
  } finally {
    await conn.end();
  }
}

module.exports = { crearBaseDeDatos, baseExiste };
