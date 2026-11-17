// Crea (o recrea) la base de datos ejecutando database/database.sql.
// Uso: npm run db:init   (útil si no tiene el cliente "mysql" en la terminal)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mysql = require('mysql2/promise');

const archivo = path.join(__dirname, '..', 'database', 'database.sql');

async function confirmar() {
  if (process.argv.includes('--si')) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const r = await new Promise((res) => rl.question(
    'Esto ELIMINA y vuelve a crear la base de datos banco_horizonte con los datos de prueba. ¿Continuar? (s/n) ', res));
  rl.close();
  return /^(s|si|sí|y|yes)$/i.test(r.trim());
}

(async () => {
  if (!(await confirmar())) return console.log('Operación cancelada.');
  const sql = fs.readFileSync(archivo, 'utf8');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });
  try {
    await conn.query(sql);
    console.log('Base de datos banco_horizonte creada con los datos de prueba.');
    if (process.env.DB_NAME && process.env.DB_NAME !== 'banco_horizonte') {
      console.warn(`[aviso] DB_NAME en .env es "${process.env.DB_NAME}", pero el script crea "banco_horizonte".`);
    }
  } finally {
    await conn.end();
  }
})().catch((err) => {
  console.error('Error al crear la base de datos:', err.message);
  process.exit(1);
});
