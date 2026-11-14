// Uso: npm run reset-clave -- Maribel NuevaClave123
require('dotenv').config();
const { conectar, col } = require('../src/db');
const { hashClave } = require('../src/auth');

(async () => {
  const [usuario, clave] = process.argv.slice(2);
  if (!usuario || !clave || clave.length < 8) {
    console.log('Uso: npm run reset-clave -- USUARIO NUEVA_CLAVE (mínimo 8 caracteres)');
    process.exit(1);
  }
  await conectar();
  const r = await col('users').updateOne({ usuarioLower: usuario.toLowerCase() }, { $set: { passwordHash: await hashClave(clave), activo: true } });
  console.log(r.matchedCount ? 'Contraseña actualizada.' : 'No existe ese usuario.');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
