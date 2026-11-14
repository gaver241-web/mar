const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cfg = require('./src/config');
const { conectar } = require('./src/db');
const { asegurarAdmin } = require('./src/auth');
const { HttpError } = require('./src/util');

async function iniciar() {
  if (!cfg.jwtSecret || cfg.jwtSecret.length < 24) throw new Error('Falta JWT_SECRET (mínimo 24 caracteres)');
  await conectar();
  await asegurarAdmin();

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:'],
        'upgrade-insecure-requests': null,
      },
    },
  }));
  app.use(compression());
  app.use(cookieParser());
  // El importador de Excel necesita el cuerpo sin procesar, por eso JSON se aplica solo a su tipo.
  app.use(express.json({ limit: '1mb' }));

  app.get('/salud', (req, res) => res.json({ ok: true }));
  app.use('/api', require('./src/routes'));

  app.use(express.static(path.join(__dirname, 'public'), { maxAge: cfg.prod ? '1h' : 0, etag: true }));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Los datos enviados no son válidos' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'El archivo es demasiado grande' });
    if (err.code === 11000) return res.status(409).json({ error: 'Ya existe un registro igual' });
    console.error(err);
    res.status(500).json({ error: 'Ocurrió un error inesperado. Inténtalo de nuevo.' });
  });

  app.listen(cfg.puerto, () => console.log(`Gaver Flujo de Caja en el puerto ${cfg.puerto}`));
}

iniciar().catch((e) => { console.error('No se pudo iniciar:', e.message); process.exit(1); });
