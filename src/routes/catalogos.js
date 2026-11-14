const router = require('express').Router({ mergeParams: true });
const { col } = require('../db');
const { necesita } = require('../auth');
const { wrap, bad, oidReq, texto, r2, noEncontrado } = require('../util');
const { cargarBase, calcularSaldos } = require('../services/saldos');
const { auditar } = require('../services/auditoria');

// ---------- Cuentas ----------
router.get('/cuentas', wrap(async (req, res) => {
  const { cuentas, movs } = await cargarBase(req.flujoId);
  res.json(calcularSaldos(cuentas, movs));
}));

router.post('/cuentas', necesita('admin'), wrap(async (req, res) => {
  const nombre = texto(req.body.nombre, 60);
  if (!nombre) throw bad('Escribe el nombre de la cuenta');
  const tipo = ['caja', 'banco', 'billetera'].includes(req.body.tipo) ? req.body.tipo : 'caja';
  const saldoInicial = r2(req.body.saldoInicial);
  if (await col('cuentas').findOne({ flujoId: req.flujoId, nombre })) throw bad('Ya existe una cuenta con ese nombre');
  const r = await col('cuentas').insertOne({ flujoId: req.flujoId, nombre, tipo, saldoInicial, activa: true, creadoEn: new Date() });
  await auditar(req, req.flujoId, 'crear', 'cuenta', r.insertedId, `${nombre} (saldo inicial ${saldoInicial})`);
  res.status(201).json({ id: r.insertedId });
}));

router.put('/cuentas/:id', necesita('admin'), wrap(async (req, res) => {
  const _id = oidReq(req.params.id);
  const cuenta = await col('cuentas').findOne({ _id, flujoId: req.flujoId });
  if (!cuenta) throw noEncontrado('Cuenta no encontrada');
  const set = {};
  if (req.body.nombre !== undefined) set.nombre = texto(req.body.nombre, 60) || cuenta.nombre;
  if (req.body.tipo !== undefined && ['caja', 'banco', 'billetera'].includes(req.body.tipo)) set.tipo = req.body.tipo;
  if (req.body.activa !== undefined) set.activa = !!req.body.activa;
  if (req.body.saldoInicial !== undefined) set.saldoInicial = r2(req.body.saldoInicial);
  await col('cuentas').updateOne({ _id }, { $set: set });
  await auditar(req, req.flujoId, 'editar', 'cuenta', _id, JSON.stringify(set));
  res.json({ ok: true });
}));

// ---------- Categorías ----------
router.get('/categorias', wrap(async (req, res) => {
  res.json(await col('categorias').find({ flujoId: req.flujoId }).sort({ tipo: 1, nombre: 1 }).toArray()
    .then((l) => l.map((c) => ({ id: c._id, nombre: c.nombre, tipo: c.tipo, activa: c.activa !== false }))));
}));

router.post('/categorias', necesita('admin'), wrap(async (req, res) => {
  const nombre = texto(req.body.nombre, 60);
  const tipo = req.body.tipo === 'ingreso' ? 'ingreso' : 'egreso';
  if (!nombre) throw bad('Escribe el nombre de la categoría');
  if (await col('categorias').findOne({ flujoId: req.flujoId, nombre, tipo })) throw bad('Esa categoría ya existe');
  const r = await col('categorias').insertOne({ flujoId: req.flujoId, nombre, tipo, activa: true });
  await auditar(req, req.flujoId, 'crear', 'categoria', r.insertedId, `${nombre} (${tipo})`);
  res.status(201).json({ id: r.insertedId });
}));

router.put('/categorias/:id', necesita('admin'), wrap(async (req, res) => {
  const _id = oidReq(req.params.id);
  const set = {};
  if (req.body.nombre !== undefined) {
    set.nombre = texto(req.body.nombre, 60);
    if (!set.nombre) throw bad('El nombre no puede quedar vacío');
  }
  if (req.body.activa !== undefined) set.activa = !!req.body.activa;
  const r = await col('categorias').updateOne({ _id, flujoId: req.flujoId }, { $set: set });
  if (!r.matchedCount) throw noEncontrado('Categoría no encontrada');
  res.json({ ok: true });
}));

module.exports = router;
