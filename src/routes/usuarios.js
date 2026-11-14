const router = require('express').Router();
const { col } = require('../db');
const { hashClave } = require('../auth');
const { wrap, bad, oidReq, texto, noEncontrado } = require('../util');

const vista = (u, flujos) => ({
  id: u._id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, activo: u.activo,
  ultimoAcceso: u.ultimoAcceso || null,
  flujos: flujos.filter((f) => (f.miembros || []).some((m) => String(m.userId) === String(u._id)))
    .map((f) => ({ id: f._id, nombre: f.nombre, rol: f.miembros.find((m) => String(m.userId) === String(u._id)).rol })),
});

router.get('/', wrap(async (req, res) => {
  const [users, flujos] = await Promise.all([
    col('users').find({}).sort({ usuarioLower: 1 }).toArray(),
    col('flujos').find({ activo: { $ne: false } }).toArray(),
  ]);
  res.json(users.map((u) => vista(u, flujos)));
}));

router.post('/', wrap(async (req, res) => {
  const usuario = texto(req.body.usuario, 40);
  const nombre = texto(req.body.nombre, 80) || usuario;
  const clave = String(req.body.clave || '');
  const rol = req.body.rol === 'admin' ? 'admin' : 'usuario';
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(usuario)) throw bad('El usuario debe tener de 3 a 40 letras, números, punto o guion, sin espacios');
  if (clave.length < 8) throw bad('La contraseña debe tener al menos 8 caracteres');
  if (await col('users').findOne({ usuarioLower: usuario.toLowerCase() })) throw bad('Ese usuario ya existe');
  const doc = {
    usuario, usuarioLower: usuario.toLowerCase(), nombre, rol, activo: true,
    passwordHash: await hashClave(clave), creadoEn: new Date(),
  };
  const r = await col('users').insertOne(doc);
  // Asignación opcional de flujos al crear: [{flujoId, rol}]
  for (const a of Array.isArray(req.body.flujos) ? req.body.flujos : []) {
    const fid = oidReq(a.flujoId, 'flujo');
    const rolF = ['admin', 'editor', 'lector'].includes(a.rol) ? a.rol : 'editor';
    await col('flujos').updateOne({ _id: fid }, { $push: { miembros: { userId: r.insertedId, rol: rolF } } });
  }
  res.status(201).json({ id: r.insertedId });
}));

router.put('/:id', wrap(async (req, res) => {
  const _id = oidReq(req.params.id);
  const user = await col('users').findOne({ _id });
  if (!user) throw noEncontrado('Usuario no encontrado');
  const set = {};
  if (req.body.nombre !== undefined) set.nombre = texto(req.body.nombre, 80) || user.usuario;
  if (req.body.rol !== undefined) set.rol = req.body.rol === 'admin' ? 'admin' : 'usuario';
  if (req.body.activo !== undefined) set.activo = !!req.body.activo;
  if (req.body.clave) {
    if (String(req.body.clave).length < 8) throw bad('La contraseña debe tener al menos 8 caracteres');
    set.passwordHash = await hashClave(String(req.body.clave));
  }
  if (String(_id) === String(req.user._id) && (set.activo === false || (set.rol && set.rol !== 'admin'))) {
    throw bad('No puedes desactivarte ni quitarte el rol de administrador a ti mismo');
  }
  await col('users').updateOne({ _id }, { $set: set });
  res.json({ ok: true });
}));

module.exports = router;
