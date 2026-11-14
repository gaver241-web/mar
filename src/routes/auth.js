const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { col } = require('../db');
const { emitirSesion, cerrarSesion, requireAuth, hashClave, validarClave } = require('../auth');
const { wrap, bad, HttpError, texto } = require('../util');

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo otra vez.' },
});

const publico = (u) => ({ id: u._id, usuario: u.usuario, nombre: u.nombre, rol: u.rol });

router.post('/login', limiteLogin, wrap(async (req, res) => {
  const usuario = texto(req.body.usuario, 60).toLowerCase();
  const clave = String(req.body.clave || '');
  if (!usuario || !clave) throw bad('Escribe tu usuario y contraseña');
  const user = await col('users').findOne({ usuarioLower: usuario });
  const ok = user && user.activo && (await validarClave(clave, user.passwordHash));
  if (!ok) throw new HttpError(401, 'Usuario o contraseña incorrectos');
  emitirSesion(req, res, user._id);
  await col('users').updateOne({ _id: user._id }, { $set: { ultimoAcceso: new Date() } });
  res.json({ usuario: publico(user) });
}));

router.post('/logout', (req, res) => {
  cerrarSesion(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => res.json({ usuario: publico(req.user) }));

router.post('/cambiar-clave', requireAuth, wrap(async (req, res) => {
  const { actual, nueva } = req.body;
  if (!(await validarClave(String(actual || ''), req.user.passwordHash))) throw bad('La contraseña actual no es correcta');
  if (String(nueva || '').length < 8) throw bad('La nueva contraseña debe tener al menos 8 caracteres');
  await col('users').updateOne({ _id: req.user._id }, { $set: { passwordHash: await hashClave(String(nueva)) } });
  res.json({ ok: true });
}));

module.exports = router;
