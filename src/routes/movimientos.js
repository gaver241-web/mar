const router = require('express').Router({ mergeParams: true });
const { col } = require('../db');
const { necesita } = require('../auth');
const { wrap, bad, oidReq, texto, monto, esFecha, hoy, noEncontrado, HttpError } = require('../util');
const { cargarBase, saldosAcumulados } = require('../services/saldos');
const { auditar } = require('../services/auditoria');

const METODOS = ['Efectivo', 'Transferencia', 'Yape', 'Plin', 'Depósito', 'Tarjeta', 'Cheque', 'Otro'];

function vista(m, mapas, saldos) {
  return {
    id: m._id, fecha: m.fecha, tipo: m.tipo, monto: m.monto, estado: m.estado,
    cuentaId: m.cuentaId, cuenta: mapas.cuentas.get(String(m.cuentaId)) || '—',
    cuentaDestinoId: m.cuentaDestinoId || null,
    cuentaDestino: m.cuentaDestinoId ? mapas.cuentas.get(String(m.cuentaDestinoId)) || '—' : null,
    categoriaId: m.categoriaId || null,
    categoria: m.categoriaId ? mapas.categorias.get(String(m.categoriaId)) || '—' : null,
    tercero: m.tercero || '', metodoPago: m.metodoPago || '', comprobante: m.comprobante || '', notas: m.notas || '',
    origen: m.origen || 'manual', pendienteId: m.pendienteId || null,
    saldo: saldos ? saldos.get(String(m._id)) ?? null : null,
    creadoPor: m.creadoPorNombre || '', motivoAnulacion: m.motivoAnulacion || '',
    anuladoPor: m.anuladoPorNombre || '',
  };
}

async function validarCuerpo(req, existente) {
  const b = req.body;
  const tipo = existente ? existente.tipo : b.tipo;
  if (!['ingreso', 'egreso', 'transferencia'].includes(tipo)) throw bad('Elige si es ingreso, egreso o transferencia');
  const fecha = b.fecha ?? existente?.fecha;
  if (!esFecha(fecha)) throw bad('La fecha no es válida');
  const m = monto(b.monto ?? existente?.monto);
  const cuentaId = oidReq(b.cuentaId ?? existente?.cuentaId, 'cuenta');
  const cuenta = await col('cuentas').findOne({ _id: cuentaId, flujoId: req.flujoId });
  if (!cuenta || cuenta.activa === false) throw bad('La cuenta no existe o está archivada');
  const doc = {
    tipo, fecha, monto: m, cuentaId,
    tercero: texto(b.tercero ?? existente?.tercero, 100),
    metodoPago: METODOS.includes(b.metodoPago) ? b.metodoPago : texto(existente?.metodoPago, 30),
    comprobante: texto(b.comprobante ?? existente?.comprobante, 120),
    notas: texto(b.notas ?? existente?.notas, 400),
  };
  if (tipo === 'transferencia') {
    const destId = oidReq(b.cuentaDestinoId ?? existente?.cuentaDestinoId, 'cuenta destino');
    if (String(destId) === String(cuentaId)) throw bad('La cuenta de origen y la de destino deben ser distintas');
    const dest = await col('cuentas').findOne({ _id: destId, flujoId: req.flujoId });
    if (!dest || dest.activa === false) throw bad('La cuenta destino no existe o está archivada');
    doc.cuentaDestinoId = destId;
  } else {
    const catId = oidReq(b.categoriaId ?? existente?.categoriaId, 'categoría');
    const cat = await col('categorias').findOne({ _id: catId, flujoId: req.flujoId });
    if (!cat) throw bad('La categoría no existe');
    if (cat.tipo !== tipo) throw bad(`La categoría "${cat.nombre}" es de ${cat.tipo}, no de ${tipo}`);
    doc.categoriaId = catId;
  }
  return doc;
}

router.get('/', wrap(async (req, res) => {
  const { cuentas, categorias, movs } = await cargarBase(req.flujoId);
  const mapas = {
    cuentas: new Map(cuentas.map((c) => [String(c._id), c.nombre])),
    categorias: new Map(categorias.map((c) => [String(c._id), c.nombre])),
  };
  const q = req.query;
  const cuentaFiltro = q.cuentaId || '';
  const saldos = saldosAcumulados(cuentas, movs, cuentaFiltro || null);
  const texto_ = String(q.q || '').toLowerCase().trim();
  let lista = movs.filter((m) => {
    if (q.desde && m.fecha < q.desde) return false;
    if (q.hasta && m.fecha > q.hasta) return false;
    if (q.tipo && m.tipo !== q.tipo) return false;
    if (q.estado && m.estado !== q.estado) return false;
    if (q.categoriaId && String(m.categoriaId) !== q.categoriaId) return false;
    if (cuentaFiltro && String(m.cuentaId) !== cuentaFiltro && String(m.cuentaDestinoId) !== cuentaFiltro) return false;
    if (texto_) {
      const hay = `${m.tercero} ${m.notas} ${m.comprobante} ${mapas.categorias.get(String(m.categoriaId)) || ''}`.toLowerCase();
      if (!hay.includes(texto_)) return false;
    }
    return true;
  });
  lista.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : String(a._id) < String(b._id) ? 1 : -1));
  let ingresos = 0, egresos = 0;
  for (const m of lista) {
    if (m.estado !== 'confirmado' || m.tipo === 'transferencia') continue;
    if (m.tipo === 'ingreso') ingresos += m.monto; else egresos += m.monto;
  }
  const limite = Math.min(Number(q.limite) || 50, 200);
  const pagina = Math.max(Number(q.pagina) || 1, 1);
  const total = lista.length;
  lista = lista.slice((pagina - 1) * limite, pagina * limite);
  res.json({
    total, pagina, limite,
    totales: { ingresos: Math.round(ingresos * 100) / 100, egresos: Math.round(egresos * 100) / 100 },
    items: lista.map((m) => vista(m, mapas, saldos)),
  });
}));

router.post('/', necesita('editor'), wrap(async (req, res) => {
  const doc = await validarCuerpo(req, null);
  const programar = req.body.estado === 'programado' || doc.fecha > hoy();
  Object.assign(doc, {
    flujoId: req.flujoId, estado: programar ? 'programado' : 'confirmado', origen: 'manual',
    creadoPor: req.user._id, creadoPorNombre: req.user.usuario, creadoEn: new Date(),
  });
  const r = await col('movimientos').insertOne(doc);
  await auditar(req, req.flujoId, 'crear', 'movimiento', r.insertedId, `${doc.tipo} ${doc.monto} (${doc.fecha}) ${doc.estado}`);
  res.status(201).json({ id: r.insertedId, estado: doc.estado });
}));

router.put('/:id', necesita('editor'), wrap(async (req, res) => {
  const _id = oidReq(req.params.id);
  const m = await col('movimientos').findOne({ _id, flujoId: req.flujoId });
  if (!m) throw noEncontrado('Movimiento no encontrado');
  if (m.estado === 'anulado') throw bad('Un movimiento anulado no se puede modificar');
  let set;
  if (m.estado === 'programado') {
    set = await validarCuerpo(req, m);
  } else {
    // Confirmado: solo datos descriptivos. Para cambiar importe, fecha o cuenta se anula y se registra uno nuevo.
    const cat = req.body.categoriaId && m.tipo !== 'transferencia'
      ? await col('categorias').findOne({ _id: oidReq(req.body.categoriaId, 'categoría'), flujoId: req.flujoId }) : null;
    if (cat && cat.tipo !== m.tipo) throw bad('La categoría no corresponde al tipo de movimiento');
    set = {
      tercero: texto(req.body.tercero ?? m.tercero, 100),
      notas: texto(req.body.notas ?? m.notas, 400),
      comprobante: texto(req.body.comprobante ?? m.comprobante, 120),
      metodoPago: METODOS.includes(req.body.metodoPago) ? req.body.metodoPago : m.metodoPago,
    };
    if (cat) set.categoriaId = cat._id;
  }
  await col('movimientos').updateOne({ _id }, { $set: { ...set, editadoPor: req.user.usuario, editadoEn: new Date() } });
  await auditar(req, req.flujoId, 'editar', 'movimiento', _id, `${m.tipo} ${m.monto}`);
  res.json({ ok: true });
}));

router.post('/:id/confirmar', necesita('editor'), wrap(async (req, res) => {
  const _id = oidReq(req.params.id);
  const m = await col('movimientos').findOne({ _id, flujoId: req.flujoId });
  if (!m) throw noEncontrado('Movimiento no encontrado');
  if (m.estado !== 'programado') throw bad('Solo se pueden confirmar movimientos programados');
  const fecha = req.body.fecha && esFecha(req.body.fecha) ? req.body.fecha : (m.fecha > hoy() ? hoy() : m.fecha);
  await col('movimientos').updateOne({ _id }, { $set: { estado: 'confirmado', fecha, confirmadoPor: req.user.usuario, confirmadoEn: new Date() } });
  await auditar(req, req.flujoId, 'confirmar', 'movimiento', _id, `${m.tipo} ${m.monto}`);
  res.json({ ok: true });
}));

// Reversión: el movimiento queda en el libro como anulado, con motivo y responsable.
router.post('/:id/anular', necesita('editor'), wrap(async (req, res) => {
  const _id = oidReq(req.params.id);
  const motivo = texto(req.body.motivo, 200);
  if (motivo.length < 3) throw bad('Escribe el motivo de la anulación');
  const m = await col('movimientos').findOne({ _id, flujoId: req.flujoId });
  if (!m) throw noEncontrado('Movimiento no encontrado');
  if (m.estado === 'anulado') throw bad('Este movimiento ya está anulado');
  await col('movimientos').updateOne({ _id }, {
    $set: { estado: 'anulado', motivoAnulacion: motivo, anuladoPor: req.user._id, anuladoPorNombre: req.user.usuario, anuladoEn: new Date() },
  });
  if (m.pendienteId) {
    await col('pendientes').updateOne({ _id: m.pendienteId }, { $pull: { pagos: { movimientoId: _id } } });
  }
  await auditar(req, req.flujoId, 'anular', 'movimiento', _id, `${m.tipo} ${m.monto} (${m.fecha}) — ${motivo}`);
  res.json({ ok: true });
}));

router.delete('/:id', necesita('editor'), wrap(async (req, res) => {
  const _id = oidReq(req.params.id);
  const m = await col('movimientos').findOne({ _id, flujoId: req.flujoId });
  if (!m) throw noEncontrado('Movimiento no encontrado');
  if (m.estado !== 'programado') throw new HttpError(409, 'Solo se eliminan movimientos programados. Los confirmados se anulan.');
  await col('movimientos').deleteOne({ _id });
  await auditar(req, req.flujoId, 'eliminar', 'movimiento', _id, `programado ${m.tipo} ${m.monto}`);
  res.json({ ok: true });
}));

module.exports = router;
