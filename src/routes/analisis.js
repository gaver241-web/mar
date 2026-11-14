const router = require('express').Router({ mergeParams: true });
const XLSX = require('xlsx');
const { col } = require('../db');
const { necesita } = require('../auth');
const { wrap, bad, esFecha, esPeriodo, hoy, sumarDias, sumarMeses, finDeMes, r2 } = require('../util');
const { cargarBase, calcularSaldos, totalesPeriodo, estadoPendiente, efecto } = require('../services/saldos');
const { calcularBalance } = require('../services/banquito');

// ---------- Proyección ----------
async function proyectar(flujoId, { dias = 90, pctCobros = 100, pctPagos = 100 }) {
  const h = hoy();
  const limite = sumarDias(h, dias);
  const { cuentas, movs } = await cargarBase(flujoId);
  const saldos = calcularSaldos(cuentas.filter((c) => c.activa !== false), movs);
  const saldoActual = r2(saldos.reduce((a, c) => a + c.saldo, 0));
  const pend = await col('pendientes').find({ flujoId, anulado: { $ne: true } }).toArray();

  const eventos = [];
  for (const m of movs.filter((x) => x.estado === 'programado' && x.tipo !== 'transferencia')) {
    const f = m.fecha < h ? h : m.fecha;
    if (f > limite) continue;
    eventos.push({ fecha: f, origen: 'Programado', detalle: m.tercero || m.notas || '—', importe: m.tipo === 'ingreso' ? m.monto : -m.monto, atrasado: m.fecha < h });
  }
  for (const p of pend) {
    const { saldo } = estadoPendiente(p, h);
    if (saldo <= 0) continue;
    const f = p.vencimiento < h ? h : p.vencimiento;
    if (f > limite) continue;
    const factor = (p.tipo === 'cobrar' ? pctCobros : pctPagos) / 100;
    eventos.push({
      fecha: f, origen: p.tipo === 'cobrar' ? 'Por cobrar' : 'Por pagar', detalle: p.tercero,
      importe: r2((p.tipo === 'cobrar' ? saldo * factor : -saldo)), atrasado: p.vencimiento < h,
    });
  }
  eventos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  let s = saldoActual;
  let min = { saldo: saldoActual, fecha: h };
  let primerDeficit = saldoActual < 0 ? h : null;
  for (const e of eventos) {
    s = r2(s + e.importe);
    e.saldo = s;
    if (s < min.saldo) min = { saldo: s, fecha: e.fecha };
    if (s < 0 && !primerDeficit) primerDeficit = e.fecha;
  }
  // Serie semanal para el gráfico
  const serie = [{ fecha: h, saldo: saldoActual }];
  let idx = 0; let acum = saldoActual;
  for (let f = sumarDias(h, 7); f <= sumarDias(limite, 6); f = sumarDias(f, 7)) {
    while (idx < eventos.length && eventos[idx].fecha <= f) { acum = eventos[idx].saldo; idx++; }
    serie.push({ fecha: f > limite ? limite : f, saldo: acum });
  }
  return { hoy: h, limite, saldoActual, saldoFinal: s, minimo: min, primerDeficit, serie, eventos, supuestos: { dias, pctCobros, pctPagos } };
}

router.get('/proyeccion', wrap(async (req, res) => {
  const dias = [30, 60, 90, 180].includes(Number(req.query.dias)) ? Number(req.query.dias) : 90;
  const clamp = (v) => Math.min(Math.max(Number(v) || 100, 0), 150);
  res.json(await proyectar(req.flujoId, { dias, pctCobros: req.query.pctCobros === undefined ? 100 : clamp(req.query.pctCobros), pctPagos: 100 }));
}));

// ---------- Panel principal ----------
router.get('/resumen', wrap(async (req, res) => {
  const h = hoy();
  const periodo = esPeriodo(req.query.periodo) ? req.query.periodo : h.slice(0, 7);
  const { cuentas, categorias, movs } = await cargarBase(req.flujoId);
  const activas = cuentas.filter((c) => c.activa !== false);
  const saldos = calcularSaldos(activas, movs);
  const saldoTotal = r2(saldos.reduce((a, c) => a + c.saldo, 0));
  const mes = totalesPeriodo(movs, `${periodo}-01`, finDeMes(periodo));
  const mesAnt = totalesPeriodo(movs, `${sumarMeses(periodo, -1)}-01`, finDeMes(sumarMeses(periodo, -1)));

  const serie = [];
  for (let i = 5; i >= 0; i--) {
    const p = sumarMeses(periodo, -i);
    const t = totalesPeriodo(movs, `${p}-01`, finDeMes(p));
    const sf = calcularSaldos(activas, movs, finDeMes(p)).reduce((a, c) => a + c.saldo, 0);
    serie.push({ periodo: p, ingresos: t.ingresos, egresos: t.egresos, saldo: r2(sf) });
  }

  const pend = (await col('pendientes').find({ flujoId: req.flujoId, anulado: { $ne: true } }).toArray())
    .map((p) => ({ p, ...estadoPendiente(p, h) })).filter((x) => x.estado !== 'pagado');
  const suma = (tipo, est) => r2(pend.filter((x) => x.p.tipo === tipo && (!est || x.estado === est)).reduce((a, x) => a + x.saldo, 0));
  const en7 = sumarDias(h, 7);
  const proximos = pend.filter((x) => x.p.vencimiento <= en7).sort((a, b) => (a.p.vencimiento < b.p.vencimiento ? -1 : 1)).slice(0, 6)
    .map((x) => ({ id: x.p._id, tipo: x.p.tipo, tercero: x.p.tercero, vencimiento: x.p.vencimiento, saldo: x.saldo, estado: x.estado }));

  const alertas = [];
  const vencidosCobrar = pend.filter((x) => x.p.tipo === 'cobrar' && x.estado === 'vencido').length;
  const vencidosPagar = pend.filter((x) => x.p.tipo === 'pagar' && x.estado === 'vencido').length;
  if (vencidosPagar) alertas.push({ nivel: 'alto', texto: `${vencidosPagar} pago(s) vencido(s) por ${flujoMoneda(req)} ${suma('pagar', 'vencido').toLocaleString('es-PE')}`, ruta: 'cobros' });
  if (vencidosCobrar) alertas.push({ nivel: 'medio', texto: `${vencidosCobrar} cobro(s) vencido(s) por ${flujoMoneda(req)} ${suma('cobrar', 'vencido').toLocaleString('es-PE')}`, ruta: 'cobros' });

  const proy = await proyectar(req.flujoId, { dias: 60 });
  if (proy.primerDeficit) alertas.unshift({ nivel: 'alto', texto: `Se proyecta saldo negativo desde el ${proy.primerDeficit}`, ruta: 'proyeccion' });

  const presup = await col('presupuestos').find({ flujoId: req.flujoId, periodo }).toArray();
  for (const p of presup) {
    const ejec = movs.filter((m) => m.estado === 'confirmado' && m.tipo === 'egreso' && String(m.categoriaId) === String(p.categoriaId) && m.fecha.slice(0, 7) === periodo)
      .reduce((a, m) => a + m.monto, 0);
    if (ejec >= p.monto * 0.9) {
      const nombre = categorias.find((c) => String(c._id) === String(p.categoriaId))?.nombre || 'Categoría';
      alertas.push({ nivel: ejec >= p.monto ? 'alto' : 'medio', texto: `${nombre}: ${Math.round((ejec / p.monto) * 100)}% del presupuesto`, ruta: 'presupuestos' });
    }
  }
  const programadosAtrasados = movs.filter((m) => m.estado === 'programado' && m.fecha < h).length;
  if (programadosAtrasados) alertas.push({ nivel: 'medio', texto: `${programadosAtrasados} movimiento(s) programado(s) esperan confirmación`, ruta: 'movimientos' });

  const mapaC = new Map(cuentas.map((c) => [String(c._id), c.nombre]));
  const mapaK = new Map(categorias.map((c) => [String(c._id), c.nombre]));
  const recientes = movs.filter((m) => m.estado !== 'anulado')
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : String(a._id) < String(b._id) ? 1 : -1)).slice(0, 8)
    .map((m) => ({ id: m._id, fecha: m.fecha, tipo: m.tipo, monto: m.monto, estado: m.estado, cuenta: mapaC.get(String(m.cuentaId)), categoria: mapaK.get(String(m.categoriaId)) || null, tercero: m.tercero || '' }));

  const out = {
    periodo, saldoTotal, cuentas: saldos.filter((c) => c.activa),
    mes, mesAnterior: mesAnt, serie,
    porCobrar: { total: suma('cobrar'), vencido: suma('cobrar', 'vencido') },
    porPagar: { total: suma('pagar'), vencido: suma('pagar', 'vencido') },
    proximos, alertas, recientes,
    proyeccion: { minimo: proy.minimo, saldoFinal: proy.saldoFinal, dias: 60 },
  };
  if (req.flujo.tipo === 'banquito') {
    const b = await calcularBalance(req.flujoId, null, 2);
    out.banquito = b ? { semana: b.semana, fecha: b.fecha, enCaja: b.enCaja, ahorro: b.ahorro, prestamosPorCobrar: b.prestamosPorCobrar, cajaChica: b.cajaChica } : null;
  }
  res.json(out);
}));
const flujoMoneda = (req) => req.flujo.moneda || 'S/';

// ---------- Reportes ----------
async function datosReporte(req) {
  const h = hoy();
  const desde = esFecha(req.query.desde) ? req.query.desde : `${h.slice(0, 7)}-01`;
  const hasta = esFecha(req.query.hasta) ? req.query.hasta : h;
  if (desde > hasta) throw bad('La fecha inicial no puede ser posterior a la final');
  const cuentaId = req.query.cuentaId || '';
  const { cuentas, categorias, movs } = await cargarBase(req.flujoId);
  const mapaC = new Map(cuentas.map((c) => [String(c._id), c.nombre]));
  const mapaK = new Map(categorias.map((c) => [String(c._id), c.nombre]));
  const enRango = movs.filter((m) => m.estado === 'confirmado' && m.fecha >= desde && m.fecha <= hasta
    && (!cuentaId || String(m.cuentaId) === cuentaId || String(m.cuentaDestinoId) === cuentaId));

  const efectivas = enRango.filter((m) => m.tipo !== 'transferencia' && (!cuentaId || String(m.cuentaId) === cuentaId));
  const ingresos = r2(efectivas.filter((m) => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0));
  const egresos = r2(efectivas.filter((m) => m.tipo === 'egreso').reduce((a, m) => a + m.monto, 0));

  const catMap = new Map();
  for (const m of efectivas) {
    const k = `${m.tipo}|${m.categoriaId}`;
    const f = catMap.get(k) || { tipo: m.tipo, categoria: mapaK.get(String(m.categoriaId)) || '—', total: 0, cantidad: 0 };
    f.total = r2(f.total + m.monto); f.cantidad++; catMap.set(k, f);
  }
  const porCategoria = [...catMap.values()].sort((a, b) => (a.tipo === b.tipo ? b.total - a.total : a.tipo < b.tipo ? 1 : -1));

  const mesMap = new Map();
  for (const m of efectivas) {
    const k = m.fecha.slice(0, 7);
    const f = mesMap.get(k) || { periodo: k, ingresos: 0, egresos: 0 };
    if (m.tipo === 'ingreso') f.ingresos = r2(f.ingresos + m.monto); else f.egresos = r2(f.egresos + m.monto);
    mesMap.set(k, f);
  }
  const porMes = [...mesMap.values()].sort((a, b) => (a.periodo < b.periodo ? -1 : 1)).map((f) => ({ ...f, neto: r2(f.ingresos - f.egresos) }));

  const cuentasSel = cuentas.filter((c) => !cuentaId || String(c._id) === cuentaId);
  const porCuenta = cuentasSel.map((c) => {
    const antes = c.saldoInicial + movs.filter((m) => m.estado === 'confirmado' && m.fecha < desde).reduce((a, m) => a + efecto(m, c._id), 0);
    const dentro = movs.filter((m) => m.estado === 'confirmado' && m.fecha >= desde && m.fecha <= hasta);
    const ent = dentro.reduce((a, m) => a + Math.max(efecto(m, c._id), 0), 0);
    const sal = dentro.reduce((a, m) => a + Math.min(efecto(m, c._id), 0), 0);
    return { cuenta: c.nombre, saldoInicial: r2(antes), entradas: r2(ent), salidas: r2(-sal), saldoFinal: r2(antes + ent + sal) };
  });

  const detalle = enRango.sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).map((m) => ({
    fecha: m.fecha, tipo: m.tipo, cuenta: mapaC.get(String(m.cuentaId)), cuentaDestino: m.cuentaDestinoId ? mapaC.get(String(m.cuentaDestinoId)) : '',
    categoria: mapaK.get(String(m.categoriaId)) || '', tercero: m.tercero || '', monto: m.monto, metodoPago: m.metodoPago || '', comprobante: m.comprobante || '', notas: m.notas || '',
  }));
  return { desde, hasta, resumen: { ingresos, egresos, neto: r2(ingresos - egresos), movimientos: enRango.length }, porCategoria, porMes, porCuenta, detalle };
}

router.get('/reportes', wrap(async (req, res) => {
  const d = await datosReporte(req);
  res.json({ ...d, detalle: d.detalle.slice(-300) });
}));

router.get('/reportes/exportar', wrap(async (req, res) => {
  const d = await datosReporte(req);
  const wb = XLSX.utils.book_new();
  const hoja = (nombre, filas) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas.length ? filas : [{ Aviso: 'Sin datos' }]), nombre);
  hoja('Resumen', [{ Desde: d.desde, Hasta: d.hasta, Ingresos: d.resumen.ingresos, Egresos: d.resumen.egresos, 'Flujo neto': d.resumen.neto }]);
  hoja('Movimientos', d.detalle.map((m) => ({ Fecha: m.fecha, Tipo: m.tipo, Cuenta: m.cuenta, 'Cuenta destino': m.cuentaDestino, Categoría: m.categoria, Tercero: m.tercero, Monto: m.monto, 'Método de pago': m.metodoPago, Comprobante: m.comprobante, Notas: m.notas })));
  hoja('Por categoría', d.porCategoria.map((f) => ({ Tipo: f.tipo, Categoría: f.categoria, Total: f.total, Movimientos: f.cantidad })));
  hoja('Por mes', d.porMes.map((f) => ({ Mes: f.periodo, Ingresos: f.ingresos, Egresos: f.egresos, 'Flujo neto': f.neto })));
  hoja('Por cuenta', d.porCuenta.map((f) => ({ Cuenta: f.cuenta, 'Saldo inicial': f.saldoInicial, Entradas: f.entradas, Salidas: f.salidas, 'Saldo final': f.saldoFinal })));
  const formato = req.query.formato === 'csv' ? 'csv' : 'xlsx';
  const nombre = `reporte_${d.desde}_${d.hasta}`;
  if (formato === 'csv') {
    const csv = '\uFEFF' + XLSX.utils.sheet_to_csv(wb.Sheets['Movimientos']);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}.csv"`);
    return res.send(csv);
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}.xlsx"`);
  res.send(buf);
}));

// ---------- Auditoría ----------
router.get('/auditoria', necesita('admin'), wrap(async (req, res) => {
  const lista = await col('auditoria').find({ flujoId: req.flujoId }).sort({ fecha: -1 }).limit(200).toArray();
  res.json(lista.map((a) => ({ id: a._id, fecha: a.fecha, usuario: a.usuario, accion: a.accion, entidad: a.entidad, detalle: a.detalle })));
}));

module.exports = router;
