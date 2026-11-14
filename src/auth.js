const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cfg = require('./config');
const { col } = require('./db');
const { HttpError, prohibido, noEncontrado, oid, wrap } = require('./util');

const COOKIE = 'gaver_sesion';
const NIVEL = { lector: 1, editor: 2, admin: 3 };

function emitirSesion(req, res, userId) {
  const token = jwt.sign({ uid: String(userId) }, cfg.jwtSecret, { expiresIn: '12h' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
}
function cerrarSesion(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

// Carga al usuario de la cookie y confirma que sigue activo.
const requireAuth = wrap(async (req, res, next) => {
  const token = req.cookies?.[COOKIE];
  if (!token) throw new HttpError(401, 'Inicia sesión para continuar');
  let payload;
  try { payload = jwt.verify(token, cfg.jwtSecret); } catch { throw new HttpError(401, 'Tu sesión venció, vuelve a ingresar'); }
  const user = await col('users').findOne({ _id: oid(payload.uid) });
  if (!user || !user.activo) throw new HttpError(401, 'Tu usuario no está activo');
  req.user = user;
  next();
});

const requireAdmin = (req, res, next) => {
  if (req.user?.rol !== 'admin') return next(prohibido('Solo el administrador puede hacer esto'));
  next();
};

// Exige el header que solo envía nuestra app (defensa extra contra CSRF).
function exigirHeaderApp(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'fetch') return next(prohibido('Solicitud no permitida'));
  next();
}

// Carga el flujo y calcula el rol del usuario dentro de él.
const cargarFlujo = wrap(async (req, res, next) => {
  const _id = oid(req.params.fid);
  if (!_id) throw noEncontrado('Flujo no encontrado');
  const flujo = await col('flujos').findOne({ _id, activo: { $ne: false } });
  if (!flujo) throw noEncontrado('Flujo no encontrado');
  let rol = null;
  if (req.user.rol === 'admin') rol = 'admin';
  else {
    const m = (flujo.miembros || []).find((x) => String(x.userId) === String(req.user._id));
    rol = m?.rol || null;
  }
  if (!rol) throw prohibido('No tienes acceso a este flujo');
  req.flujo = flujo;
  req.flujoId = flujo._id;
  req.rolFlujo = rol;
  next();
});

const necesita = (nivel) => (req, res, next) => {
  if (NIVEL[req.rolFlujo] < NIVEL[nivel]) return next(prohibido('Tu rol en este flujo no permite esta acción'));
  next();
};

async function hashClave(clave) { return bcrypt.hash(clave, 11); }
async function validarClave(clave, hash) { return bcrypt.compare(clave, hash); }

// Crea al administrador inicial si todavía no existe.
async function asegurarAdmin() {
  const usuario = cfg.adminUsuario;
  const existe = await col('users').findOne({ usuarioLower: usuario.toLowerCase() });
  if (existe) return;
  if (!cfg.adminClave) {
    console.warn('⚠ No existe el usuario administrador y falta ADMIN_PASSWORD en las variables de entorno.');
    return;
  }
  await col('users').insertOne({
    usuario,
    usuarioLower: usuario.toLowerCase(),
    nombre: usuario,
    passwordHash: await hashClave(cfg.adminClave),
    rol: 'admin',
    activo: true,
    creadoEn: new Date(),
  });
  console.log(`✔ Usuario administrador "${usuario}" creado`);
}

module.exports = {
  emitirSesion, cerrarSesion, requireAuth, requireAdmin, exigirHeaderApp,
  cargarFlujo, necesita, hashClave, validarClave, asegurarAdmin, NIVEL,
};
