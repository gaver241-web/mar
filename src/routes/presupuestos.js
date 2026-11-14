const router = require('express').Router({ mergeParams: true });
const { col } = require('../db');
const { necesita } = require('../auth');
const { wrap, bad, oidReq, esPeriodo, monto, hoy, finDeMes, r2 } = require('../util');
const { estadoPendiente } = require('../services/saldos');
const { auditar } = require('../services/auditoria');

// Presupuesto del período: aprobado, ejecutado (confirmado) y comprometido (programado + por pagar), por separado.
router.get('/', wrap(async (req, res) => {
  const periodo = esPeriodo(req.query.periodo) ? req.query.periodo : hoy().slice(0, 7);
  const desde = `${periodo}-01`;
  const hasta = finDeMes(periodo);
  const [cats, pres, movs, pend] = await Promise.all([
    col('categorias').find({ flujoId: req.flujoId, tipo: 'egreso' }).sort({ nombre: 1 }).toArray(),
    col('presupuestos').find({ flujoId: req.flujoId, periodo }).toArray(),
    col('movimientos').find({ flujoId: req.flujoId, tipo: 'egreso', fecha: { $gte: desde, $lte: hasta } }).toArray(),
    col('pendientes').find({ flujoId: req.flujoId, tipo: 'pagar', anulado: { $ne: true }, vencimiento: { $gte: desde, $lte: hasta } }).toArray(),
  ]);
  const h = hoy();
  const filas = cats.filter((c) => c.activa !== false || pres.some((p) => String(p.categoriaId) === String(c._id))).map((c) => {
    const p = pres.find((x) => String(x.categoriaId) === String(c._id));
    const key = String(c._id);
    const ejecutado = r2(movs.filter((m) => m.estado === 'confirmado' && String(m.categoriaId) === key).reduce((a, m) => a + m.monto, 0));
    const progr = movs.filter((m) => m.estado === 'programado' && String(m.categoriaId) === key).reduce((a, m) => a + m.monto, 0);
    const porPagar = pend.filter((x) => String(x.categoriaId) === key).reduce((a, x) => a + estadoPendiente(x, h).saldo, 0);
    const aprobado = p ? p.monto : 0;
    return {
      categoriaId: c._id, categoria: c.nombre, aprobado, ejecutado, comprometido: r2(progr + porPagar),
      restante: r2(aprobado - ejecutado),
      porcentaje: aprobado > 0 ? Math.round((ejecutado / aprobado) * 100) : null,
    };
  });
  const sinPresupuesto = movs.filter((m) => m.estado === 'confirmado' && !cats.some((c) => String(c._id) === String(m.categoriaId)));
  res.json({
    periodo, filas,
    totales: {
      aprobado: r2(filas.reduce((a, f) => a + f.aprobado, 0)),
      ejecutado: r2(filas.reduce((a, f) => a + f.ejecutado, 0)),
      comprometido: r2(filas.reduce((a, f) => a + f.comprometido, 0)),
    },
    sinCategoria: r2(sinPresupuesto.reduce((a, m) => a + m.monto, 0)),
  });
}));

router.put('/', necesita('admin'), wrap(async (req, res) => {
  const { periodo, categoriaId } = req.body;
  if (!esPeriodo(periodo)) throw bad('El período no es válido');
  const catId = oidReq(categoriaId, 'categoría');
  const cat = await col('categorias').findOne({ _id: catId, flujoId: req.flujoId, tipo: 'egreso' });
  if (!cat) throw bad('La categoría de gasto no existe');
  if (Number(req.body.monto) === 0) {
    await col('presupuestos').deleteOne({ flujoId: req.flujoId, periodo, categoriaId: catId });
  } else {
    const m = monto(req.body.monto, 'El presupuesto');
    const filtro = { flujoId: req.flujoId, periodo, categoriaId: catId };
    if (await col('presupuestos').findOne(filtro)) await col('presupuestos').updateOne(filtro, { $set: { monto: m } });
    else await col('presupuestos').insertOne({ ...filtro, monto: m });
  }
  await auditar(req, req.flujoId, 'editar', 'presupuesto', catId, `${periodo} ${cat.nombre}: ${req.body.monto}`);
  res.json({ ok: true });
}));

// Copia los límites de un período a otro (para no digitar todo cada mes).
router.post('/copiar', necesita('admin'), wrap(async (req, res) => {
  const { desde, hacia } = req.body;
  if (!esPeriodo(desde) || !esPeriodo(hacia)) throw bad('Los períodos no son válidos');
  const origen = await col('presupuestos').find({ flujoId: req.flujoId, periodo: desde }).toArray();
  for (const o of origen) {
    const filtro = { flujoId: req.flujoId, periodo: hacia, categoriaId: o.categoriaId };
    if (!(await col('presupuestos').findOne(filtro))) await col('presupuestos').insertOne({ ...filtro, monto: o.monto });
  }
  res.json({ copiados: origen.length });
}));

module.exports = router;
