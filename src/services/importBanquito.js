const XLSX = require('xlsx');
const { bad } = require('../util');

const limpiar = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const clave = (s) => limpiar(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const num = (v) => { const n = Number(v); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };

function fechaISO(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null;
}

// Lee un Excel del banquito (hojas SOCIOS, BASE_DE_REGISTROS, DATOS_CONF y Hoja1).
function parsearExcel(buffer) {
  let wb;
  try { wb = XLSX.read(buffer, { type: 'buffer' }); } catch { throw bad('No se pudo leer el archivo. Sube el Excel del banquito (.xlsx o .xlsm)'); }
  // Algunas hojas empiezan en la columna B; se normaliza para que el índice 0 sea siempre la columna A.
  const hoja = (n) => {
    const ws = wb.Sheets[n];
    if (!ws || !ws['!ref']) return null;
    const rango = XLSX.utils.decode_range(ws['!ref']);
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: rango.e });
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  };
  const base = hoja('BASE_DE_REGISTROS');
  const sociosHoja = hoja('SOCIOS');
  if (!base || !sociosHoja) throw bad('El archivo debe tener las hojas SOCIOS y BASE_DE_REGISTROS');

  // En SOCIOS el nro 1 es "-- TODOS --"; los socios reales van desde el 2 y se renumeran desde 1.
  const socios = [];
  const porNroExcel = new Map();
  for (let i = 3; i < sociosHoja.length; i++) {
    const [, nro, nombre, dni] = sociosHoja[i];
    if (!nro || !limpiar(nombre) || /TODOS/i.test(String(nombre))) continue;
    const s = { nro: socios.length + 1, nombre: limpiar(nombre), dni: limpiar(dni), intDebe: 0, activo: true };
    socios.push(s);
    porNroExcel.set(Number(nro), s);
  }

  const registros = [];
  const omitidos = [];
  for (let i = 3; i < base.length; i++) {
    const [, nroReg, nroSocio, , , semana, fecha, ahorro, cajaChica, multa, prestamo, devolucion, interes] = base[i];
    if (!nroReg) continue;
    // Se asigna por nombre primero: el Excel tiene filas con el nro de socio equivocado.
    // Si el nombre no coincide con ningún socio, se usa el número.
    const socio = socios.find((x) => clave(x.nombre) === clave(base[i][3])) || porNroExcel.get(Number(nroSocio));
    if (!socio) { omitidos.push(Number(nroReg)); continue; }
    registros.push({
      nroRegistro: Number(nroReg), socioNro: socio.nro, semana: Number(semana),
      fecha: fechaISO(fecha), ahorro: num(ahorro), cajaChica: num(cajaChica), multa: num(multa),
      prestamo: num(prestamo), devolucion: num(devolucion), interes: num(interes),
    });
  }
  if (!registros.length) throw bad('No se encontraron registros en BASE_DE_REGISTROS');

  const semanas = new Map();
  const conf = hoja('DATOS_CONF');
  if (conf) for (let i = 2; i < conf.length; i++) {
    const [, nro, f] = conf[i];
    if (Number.isInteger(nro) && fechaISO(f)) semanas.set(nro, fechaISO(f));
  }
  for (const r of registros) if (!semanas.has(r.semana) && r.fecha) semanas.set(r.semana, r.fecha);

  // Hoja1: porcentaje de interés (E1) e interés que debe cada socio (columna F, por nro de socio).
  let porcInteres = 0;
  const h1 = hoja('Hoja1');
  if (h1) {
    porcInteres = num(h1[0]?.[4]);
    for (let i = 2; i < h1.length; i++) {
      const s = socios.find((x) => x.nro === Number(h1[i][0]));
      if (s && h1[i][5]) s.intDebe = num(h1[i][5]);
    }
  }
  return {
    socios, registros, porcInteres, omitidos,
    semanas: [...semanas.entries()].sort((a, b) => a[0] - b[0]).map(([nro, fecha]) => ({ nro, fecha })),
  };
}

module.exports = { parsearExcel };
