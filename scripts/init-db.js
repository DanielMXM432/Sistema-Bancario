// Crea (o recrea) la base de datos ejecutando database/database.sql.
// Uso: npm run db:init   (útil si no tiene el cliente "mysql" en la terminal)
require('dotenv').config();
const readline = require('readline');
const { config } = require('../src/config/db');
const { crearBaseDeDatos } = require('../src/config/inicializar');

async function confirmar() {
  if (process.argv.includes('--si')) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const r = await new Promise((res) => rl.question(
    `Esto ELIMINA y vuelve a crear la base de datos ${config.database} con los datos de prueba. ¿Continuar? (s/n) `, res));
  rl.close();
  return /^(s|si|sí|y|yes)$/i.test(r.trim());
}

(async () => {
  if (!(await confirmar())) {
    console.log('Operación cancelada.');
    process.exit(0);
  }
  await crearBaseDeDatos();
  console.log(`Base de datos ${config.database} creada con los datos de prueba.`);
  process.exit(0);
})().catch((err) => {
  console.error('Error al crear la base de datos:', err.message);
  process.exit(1);
});
