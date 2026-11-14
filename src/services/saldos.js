const { col } = require('../db');
const { r2 } = require('../util');

// Efecto de un movimiento confirmado sobre una cuenta.
function efecto(m, cuentaId) {
  const id = String(cuentaId);
  if (m.tipo === 'ingreso' && String(m.cuentaId) === id) return m.monto;
  if (m.tipo === 'egreso' && String(m.cuentaId) === id) return -m.monto;
  if (m.tipo === 'transferencia') {
    if (String(m.cuentaId) === id) return -m.monto;
    if (String(m.cuentaDestinoId) === id) return m.monto;
  }
  return 0;
}

async function cargarBase(flujoId) {
  const [cuentas, categorias, movs] = await Promise.all([
    col('cuentas').find({ flujoId }).sort({ nombre: 1 }).toArray(),
    col('categorias').find({ flujoId }).sort({ nombre: 1 }).toArray(),
    col('movimientos').find({ flujoId }).toArray(),
  ]);
  return { cuentas, categorias, movs };
}

// Saldo de cada cuenta contando solo movimientos confirmados (hasta una fecha opcional).
function calcularSaldos(cuentas, movs, hasta) {
  const conf = movs.filter((m) => m.estado === 'confirmado' && (!hasta || m.fecha <= hasta));
  return cuentas.map((c) => {
    let ingresos = 0, egresos = 0, entradas = 0, salidas = 0;
    for (const m of conf) {
      if (m.tipo === 'ingreso' && String(m.cuentaId) === String(c._id)) ingresos += m.monto;
      else if (m.tipo === 'egreso' && String(m.cuentaId) === String(c._id)) egresos += m.monto;
      else if (m.tipo === 'transferencia') {
        if (String(m.cuentaId) === String(c._id)) salidas += m.monto;
        if (String(m.cuentaDestinoId) === String(c._id)) entradas += m.monto;
      }
    }
    return {
      id: c._id, nombre: c.nombre, tipo: c.tipo, activa: c.activa !== false,
      saldoInicial: r2(c.saldoInicial), ingresos: r2(ingresos), egresos: r2(egresos),
      transferenciasEntrada: r2(entradas), transferenciasSalida: r2(salidas),
      saldo: r2(c.saldoInicial + ingresos - egresos + entradas - salidas),
    };
  });
}

const ordenCrono = (a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : String(a._id) < String(b._id) ? -1 : 1);

// Saldo acumulado después de cada movimiento confirmado (global o por cuenta).
function saldosAcumulados(cuentas, movs, cuentaId) {
  const mapa = new Map();
  const conf = movs.filter((m) => m.estado === 'confirmado').sort(ordenCrono);
  if (cuentaId) {
    const c = cuentas.find((x) => String(x._id) === String(cuentaId));
    let s = c ? c.saldoInicial : 0;
    for (const m of conf) {
      const e = efecto(m, cuentaId);
      if (e !== 0) { s += e; mapa.set(String(m._id), r2(s)); }
    }
  } else {
    let s = cuentas.reduce((a, c) => a + (c.saldoInicial || 0), 0);
    for (const m of conf) {
      if (m.tipo === 'ingreso') s += m.monto;
      else if (m.tipo === 'egreso') s -= m.monto;
      mapa.set(String(m._id), r2(s));
    }
  }
  return mapa;
}

// Movimientos de efectivo del período (las transferencias no cuentan como ingreso ni gasto).
function totalesPeriodo(movs, desde, hasta) {
  let ingresos = 0, egresos = 0;
  for (const m of movs) {
    if (m.estado !== 'confirmado' || m.tipo === 'transferencia') continue;
    if (desde && m.fecha < desde) continue;
    if (hasta && m.fecha > hasta) continue;
    if (m.tipo === 'ingreso') ingresos += m.monto; else egresos += m.monto;
  }
  return { ingresos: r2(ingresos), egresos: r2(egresos), neto: r2(ingresos - egresos) };
}

// Estado calculado de una cuenta por cobrar / pagar.
function estadoPendiente(p, hoy) {
  const pagado = r2((p.pagos || []).reduce((a, x) => a + x.monto, 0));
  const saldo = r2(p.monto - pagado);
  let estado = 'pendiente';
  if (saldo <= 0) estado = 'pagado';
  else if (p.vencimiento < hoy) estado = 'vencido';
  else if (pagado > 0) estado = 'parcial';
  return { pagado, saldo: Math.max(saldo, 0), estado };
}

module.exports = { efecto, cargarBase, calcularSaldos, saldosAcumulados, totalesPeriodo, estadoPendiente };
