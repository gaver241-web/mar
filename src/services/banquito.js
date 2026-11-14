const { col } = require('../db');
const { r2 } = require('../util');

const CAMPOS = ['ahorro', 'cajaChica', 'multa', 'prestamo', 'devolucion', 'interes'];

const suma = (lista, campo) => r2(lista.reduce((a, x) => a + (x[campo] || 0), 0));

async function cargar(flujoId) {
  const [socios, semanas, registros] = await Promise.all([
    col('bq_socios').find({ flujoId }).sort({ nro: 1 }).toArray(),
    col('bq_semanas').find({ flujoId }).sort({ nro: 1 }).toArray(),
    col('bq_registros').find({ flujoId }).toArray(),
  ]);
  return { socios, semanas, registros };
}

function semanaActual(semanas, registros, pedida) {
  if (pedida && semanas.some((s) => s.nro === Number(pedida))) return Number(pedida);
  const conDatos = registros.map((r) => r.semana);
  const max = conDatos.length ? Math.max(...conDatos) : null;
  return max ?? (semanas.length ? semanas[semanas.length - 1].nro : null);
}

// Balance como en la hoja BALANCE: tipo 1 = solo la semana, tipo 2 = hasta la semana.
async function calcularBalance(flujoId, semanaPedida, tipo = 1) {
  const { semanas, registros } = await cargar(flujoId);
  const semana = semanaActual(semanas, registros, semanaPedida);
  if (semana === null) return null;
  const sel = registros.filter((r) => (Number(tipo) === 2 ? r.semana <= semana : r.semana === semana));
  const hasta = registros.filter((r) => r.semana <= semana);
  const ahorro = suma(sel, 'ahorro');
  const devolucion = suma(sel, 'devolucion');
  const interes = suma(sel, 'interes');
  const efectivo = r2(ahorro + devolucion + interes);
  const prestamo = suma(sel, 'prestamo');
  const info = semanas.find((s) => s.nro === semana);
  return {
    semana, fecha: info?.fecha || null, tipo: Number(tipo) === 2 ? 2 : 1,
    ahorro, devolucion, interes, efectivo, prestamo, enCaja: r2(efectivo - prestamo),
    cajaChica: suma(sel, 'cajaChica'), multas: suma(sel, 'multa'),
    prestamosPorCobrar: r2(suma(hasta, 'prestamo') - suma(hasta, 'devolucion')),
    interesSobreAhorro: ahorro > 0 ? r2(interes / ahorro) : 0,
  };
}

// Devoluciones a socios (hoja Hoja1): ahorro + interés ganado - préstamo - interés que debe.
async function calcularLiquidacion(flujoId, semanaPedida, porcOverride) {
  const { socios, semanas, registros } = await cargar(flujoId);
  const flujo = await col('flujos').findOne({ _id: flujoId });
  const semana = semanaActual(semanas, registros, semanaPedida);
  if (semana === null) return null;
  const hasta = registros.filter((r) => r.semana <= semana);
  const totalAhorro = suma(hasta, 'ahorro');
  const totalInteres = suma(hasta, 'interes');
  const sugerido = totalAhorro > 0 ? Math.round((totalInteres / totalAhorro) * 10000) / 10000 : 0;
  const porc = porcOverride !== undefined && porcOverride !== null && porcOverride !== '' ? Number(porcOverride) : (flujo.config?.porcInteres || 0);

  const filas = socios.filter((s) => s.activo !== false || hasta.some((r) => String(r.socioId) === String(s._id))).map((s) => {
    const mios = hasta.filter((r) => String(r.socioId) === String(s._id));
    const ahorro = suma(mios, 'ahorro');
    const interesGanado = r2(ahorro * porc);
    const prestamo = Math.max(r2(suma(mios, 'prestamo') - suma(mios, 'devolucion')), 0);
    const intDebe = r2(s.intDebe || 0);
    return {
      socioId: s._id, nro: s.nro, nombre: s.nombre, ahorro, interesGanado, prestamo, intDebe,
      total: r2(ahorro + interesGanado - prestamo - intDebe),
      cajaChicaMulta: r2(suma(mios, 'cajaChica') + suma(mios, 'multa')),
    };
  });
  const tot = (c) => r2(filas.reduce((a, f) => a + f[c], 0));
  return {
    semana, porcInteres: porc, porcSugerido: sugerido, filas,
    totales: { ahorro: tot('ahorro'), interesGanado: tot('interesGanado'), prestamo: tot('prestamo'), intDebe: tot('intDebe'), total: tot('total'), cajaChicaMulta: tot('cajaChicaMulta') },
  };
}

async function siguienteNroRegistro(flujoId) {
  const ult = await col('bq_registros').find({ flujoId }).sort({ nroRegistro: -1 }).limit(1).toArray();
  return (ult[0]?.nroRegistro || 0) + 1;
}

module.exports = { CAMPOS, cargar, semanaActual, calcularBalance, calcularLiquidacion, siguienteNroRegistro, suma };
