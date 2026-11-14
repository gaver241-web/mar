require('dotenv').config();

const prod = process.env.NODE_ENV === 'production';

module.exports = {
  prod,
  puerto: process.env.PORT || 3000,
  mongoUri: process.env.MONGODB_URI,
  dbNombre: process.env.DB_NAME || 'gaver_flujo',
  jwtSecret: process.env.JWT_SECRET,
  adminUsuario: process.env.ADMIN_USER || 'Maribel',
  adminClave: process.env.ADMIN_PASSWORD,
  zona: process.env.TZ_APP || 'America/Lima',
};
