const router = require('express').Router();
const { col } = require('../db');
const { requireAdmin, cargarFlujo, necesita } = require('../auth');
const { wrap, bad, oidReq, texto, hoy } = require('../util');
const { auditar } = require('../services/auditoria');

const CATEGORIAS_INICIALES = {
  ingreso: ['Ventas', 'Cobros de clientes', 'Préstamos recibidos', 'Intereses ganados', 'Otros ingresos'],
  egreso: ['Compras y mercadería', 'Servicios', 'Sueldos y honorarios', 'Alquiler', 'Impuestos', 'Transporte',
    'Alimentación', 'Pago de préstamos', 'Mantenimiento', 'Otros gastos'],
};

const resumenFlujo = (f, rol) => ({
  id: f._id, nombre: f.nombre, descripcion: f.descripcion || '', tipo: f.tipo, moneda: f.moneda || 'S/', rol,
});

router.get('/', wrap(async (req, res) => {
  const todos = await col('flujos').find({ activo: { $ne: false } }).sort({ nombre: 1 }).toArray();
  const lista = [];
  for (const f of todos) {
    if (req.user.rol === 'admin') lista.push(resumenFlujo(f, 'admin'));
    else {
      const m = (f.miembros || []).find((x) => String(x.userId) === String(req.user._id));
      if (m) lista.push(resumenFlujo(f, m.rol));
    }
  }
  res.json(lista);
}));

router.post('/', requireAdmin, wrap(async (req, res) => {
  const nombre = texto(req.body.nombre, 80);
  if (!nombre) throw bad('Escribe un nombre para el flujo de caja');
  const tipo = req.body.tipo === 'banquito' ? 'banquito' : 'general';
  const doc = {
    nombre, descripcion: texto(req.body.descripcion, 300), tipo,
    moneda: texto(req.body.moneda, 5) || 'S/', activo: true,
    miembros: [], config: tipo === 'banquito' ? { porcInteres: 0, cajaChicaDefault: 3 } : {},
    creadoPor: req.user._id, creadoEn: new Date(),
  };
  const r = await col('flujos').insertOne(doc);
  const flujoId = r.insertedId;
  await col('cuentas').insertOne({ flujoId, nombre: 'Caja', tipo: 'caja', saldoInicial: 0, activa: true, creadoEn: new Date() });
  const cats = [];
  for (const [t, nombres] of Object.entries(CATEGORIAS_INICIALES)) nombres.forEach((n) => cats.push({ flujoId, nombre: n, tipo: t, activa: true }));
  await col('categorias').insertMany(cats);
  await auditar(req, flujoId, 'crear', 'flujo', flujoId, nombre);
  res.status(201).json({ id: flujoId });
}));

router.get('/:fid', cargarFlujo, wrap(async (req, res) => {
  const f = req.flujo;
  const out = { ...resumenFlujo(f, req.rolFlujo), config: f.config || {}, hoy: hoy() };
  if (req.rolFlujo === 'admin') {
    const users = await col('users').find({ activo: true }).sort({ usuarioLower: 1 }).toArray();
    out.miembros = (f.miembros || []).map((m) => {
      const u = users.find((x) => String(x._id) === String(m.userId));
      return u ? { userId: u._id, usuario: u.usuario, nombre: u.nombre, rol: m.rol } : null;
    }).filter(Boolean);
    out.usuariosDisponibles = users.filter((u) => u.rol !== 'admin').map((u) => ({ id: u._id, usuario: u.usuario, nombre: u.nombre }));
  }
  res.json(out);
}));

router.put('/:fid', cargarFlujo, necesita('admin'), wrap(async (req, res) => {
  const set = {};
  if (req.body.nombre !== undefined) {
    set.nombre = texto(req.body.nombre, 80);
    if (!set.nombre) throw bad('El nombre no puede quedar vacío');
  }
  if (req.body.descripcion !== undefined) set.descripcion = texto(req.body.descripcion, 300);
  if (req.body.moneda !== undefined) set.moneda = texto(req.body.moneda, 5) || 'S/';
  await col('flujos').updateOne({ _id: req.flujoId }, { $set: set });
  await auditar(req, req.flujoId, 'editar', 'flujo', req.flujoId, JSON.stringify(set));
  res.json({ ok: true });
}));

router.put('/:fid/miembros', cargarFlujo, necesita('admin'), wrap(async (req, res) => {
  const entrada = Array.isArray(req.body.miembros) ? req.body.miembros : [];
  const miembros = [];
  for (const m of entrada) {
    const userId = oidReq(m.userId, 'usuario');
    const user = await col('users').findOne({ _id: userId, activo: true });
    if (!user) throw bad('Uno de los usuarios no existe o está desactivado');
    miembros.push({ userId, rol: ['admin', 'editor', 'lector'].includes(m.rol) ? m.rol : 'lector' });
  }
  await col('flujos').updateOne({ _id: req.flujoId }, { $set: { miembros } });
  await auditar(req, req.flujoId, 'editar', 'miembros', null, `${miembros.length} miembro(s)`);
  res.json({ ok: true });
}));

router.delete('/:fid', requireAdmin, cargarFlujo, wrap(async (req, res) => {
  await col('flujos').updateOne({ _id: req.flujoId }, { $set: { activo: false } });
  await auditar(req, req.flujoId, 'archivar', 'flujo', req.flujoId, req.flujo.nombre);
  res.json({ ok: true });
}));

module.exports = router;
