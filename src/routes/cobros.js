const router = require('express').Router({ mergeParams: true });
const { ObjectId } = require('mongodb');
const { col } = require('../db');
const { necesita } = require('../auth');
const { wrap, bad, oidReq, texto, monto, esFecha, hoy, noEncontrado, r2 } = require('../util');
const { estadoPendiente } = require('../services/saldos');
const { auditar } = require('../services/auditoria');

const vista = (p, h) => ({
  id: p._id, tipo: p.tipo, tercero: p.tercero, concepto: p.concepto, monto: p.monto,
  fechaEmision: p.fechaEmision, vencimiento: p.vencimiento, categoriaId: p.categoriaId || null,
  pagos: (p.pagos || []).map((x) => ({ id: x.id, fecha: x.fecha, monto: x.monto, cuentaId: x.cuentaId, movimientoId: x.movimientoId })),
  ...estadoPendiente(p, h),
});

router.get('/', wrap(async (req, res) => {
  const h = hoy();
  const filtro = { flujoId: req.flujoId, anulado: { $ne: true } };
  if (['cobrar', 'pagar'].includes(req.query.tipo)) filtro.tipo = req.query.tipo;
  const lista = (await col('pendientes').find(filtro).sort({ vencimiento: 1 }).toArray()).map((p) => vista(p, h));
  const resumen = { cobrar: { pendiente: 0, vencido: 0 }, pagar: { pendiente: 0, vencido: 0 } };
  for (const p of lista) {
    if (p.estado === 'pagado') continue;
    resumen[p.tipo].pendiente = r2(resumen[p.tipo].pendiente + p.saldo);
    if (p.estado === 'vencido') resumen[p.tipo].vencido = r2(resumen[p.tipo].vencido + p.saldo);
  }
  res.json({ resumen, items: lista });
}));

router.post('/', necesita('editor'), wrap(async (req, res) => {
  const b = req.body;
  if (!['cobrar', 'pagar'].includes(b.tipo)) throw bad('Elige si es por cobrar o por pagar');
  const tercero = texto(b.tercero, 100);
  if (!tercero) throw bad(b.tipo === 'cobrar' ? 'Escribe el nombre del cliente' : 'Escribe el nombre del proveedor');
  const fechaEmision = esFecha(b.fechaEmision) ? b.fechaEmision : hoy();
  if (!esFecha(b.vencimiento)) throw bad('La fecha de vencimiento no es válida');
  if (b.vencimiento < fechaEmision) throw bad('El vencimiento no puede ser anterior a la emisión');
  const doc = {
    flujoId: req.flujoId, tipo: b.tipo, tercero, concepto: texto(b.concepto, 200),
    monto: monto(b.monto), fechaEmision, vencimiento: b.vencimiento, pagos: [],
    categoriaId: b.categoriaId ? oidReq(b.categoriaId, 'categoría') : null,
    creadoPor: req.user._id, creadoEn: new Date(),
  };
  const r = await col('pendientes').insertOne(doc);
  await auditar(req, req.flujoId, 'crear', 'pendiente', r.insertedId, `${b.tipo} ${tercero} ${doc.monto}`);
  res.status(201).json({ id: r.insertedId });
}));

router.put('/:id', necesita('editor'), wrap(async (req, res) => {
  const _id = oidReq(req.params.id);
  const p = await col('pendientes').findOne({ _id, flujoId: req.flujoId });
  if (!p) throw noEncontrado();
  const set = {};
  if (req.body.tercero !== undefined) set.tercero = texto(req.body.tercero, 100) || p.tercero;
  if (req.body.concepto !== undefined) set.concepto = texto(req.body.concepto, 200);
  if (req.body.vencimiento !== undefined) {
    if (!esFecha(req.body.vencimiento)) throw bad('La fecha de vencimiento no es válida');
    set.vencimiento = req.body.vencimiento;
  }
  if (req.body.monto !== undefined) {
    const nuevo = monto(req.body.monto);
    const pagado = (p.pagos || []).reduce((a, x) => a + x.monto, 0);
    if (nuevo < pagado) throw bad('El monto no puede ser menor a lo ya pagado');
    set.monto = nuevo;
  }
  await col('pendientes').updateOne({ _id }, { $set: set });
  await auditar(req, req.flujoId, 'editar', 'pendiente', _id, JSON.stringify(set));
  res.json({ ok: true });
}));

router.delete('/:id', necesita('editor'), wrap(async (req, res) => {
  const _id = oidReq(req.params.id);
  const p = await col('pendientes').findOne({ _id, flujoId: req.flujoId });
  if (!p) throw noEncontrado();
  if ((p.pagos || []).length) throw bad('Tiene pagos registrados. Anula primero esos pagos.');
  await col('pendientes').updateOne({ _id }, { $set: { anulado: true } });
  await auditar(req, req.flujoId, 'anular', 'pendiente', _id, `${p.tipo} ${p.tercero} ${p.monto}`);
  res.json({ ok: true });
}));

// Cobro o pago (total o parcial): crea el movimiento de efectivo y reduce el saldo pendiente.
router.post('/:id/pagos', necesita('editor'), wrap(async (req, res) => {
  const _id = oidReq(req.params.id);
  const p = await col('pendientes').findOne({ _id, flujoId: req.flujoId, anulado: { $ne: true } });
  if (!p) throw noEncontrado();
  const { saldo } = estadoPendiente(p, hoy());
  if (saldo <= 0) throw bad('Esta cuenta ya está saldada');
  const m = monto(req.body.monto, 'El importe');
  if (m > saldo + 0.001) throw bad(`El importe supera el saldo pendiente (${saldo})`);
  const fecha = esFecha(req.body.fecha) ? req.body.fecha : hoy();
  const cuentaId = oidReq(req.body.cuentaId, 'cuenta');
  const cuenta = await col('cuentas').findOne({ _id: cuentaId, flujoId: req.flujoId });
  if (!cuenta || cuenta.activa === false) throw bad('La cuenta no existe o está archivada');

  const tipoMov = p.tipo === 'cobrar' ? 'ingreso' : 'egreso';
  let categoriaId = p.categoriaId;
  if (!categoriaId) {
    const nombreCat = p.tipo === 'cobrar' ? 'Cobros de clientes' : 'Compras y mercadería';
    const cat = (await col('categorias').findOne({ flujoId: req.flujoId, tipo: tipoMov, nombre: nombreCat }))
      || (await col('categorias').findOne({ flujoId: req.flujoId, tipo: tipoMov }));
    if (!cat) throw bad('Crea primero una categoría para registrar este movimiento');
    categoriaId = cat._id;
  }
  const mov = {
    flujoId: req.flujoId, tipo: tipoMov, fecha, monto: m, cuentaId, categoriaId,
    tercero: p.tercero, metodoPago: texto(req.body.metodoPago, 30), comprobante: '',
    notas: texto(req.body.notas || `${p.tipo === 'cobrar' ? 'Cobro' : 'Pago'}: ${p.concepto}`, 400),
    estado: 'confirmado', origen: 'pendiente', pendienteId: _id,
    creadoPor: req.user._id, creadoPorNombre: req.user.usuario, creadoEn: new Date(),
  };
  const r = await col('movimientos').insertOne(mov);
  await col('pendientes').updateOne({ _id }, { $push: { pagos: { id: new ObjectId().toString(), fecha, monto: m, cuentaId, movimientoId: r.insertedId } } });
  await auditar(req, req.flujoId, p.tipo === 'cobrar' ? 'cobro' : 'pago', 'pendiente', _id, `${p.tercero} ${m}`);
  res.status(201).json({ ok: true, movimientoId: r.insertedId });
}));

module.exports = router;
