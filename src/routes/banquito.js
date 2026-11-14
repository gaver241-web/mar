const router = require('express').Router({ mergeParams: true });
const express = require('express');
const XLSX = require('xlsx');
const { ObjectId } = require('mongodb');
const { col } = require('../db');
const { necesita } = require('../auth');
const { wrap, bad, oidReq, texto, montoCero, esFecha, hoy, sumarDias, noEncontrado, HttpError, r2 } = require('../util');
const { CAMPOS, cargar, calcularBalance, calcularLiquidacion, siguienteNroRegistro, suma } = require('../services/banquito');
const { parsearExcel } = require('../services/importBanquito');
const { auditar } = require('../services/auditoria');

// Todas las rutas del banquito exigen que el flujo sea de tipo banquito.
router.use((req, res, next) => {
  if (req.flujo.tipo !== 'banquito') return next(bad('Este flujo no es un banquito'));
  next();
});

// ---------- Socios ----------
router.get('/socios', wrap(async (req, res) => {
  const { socios, registros } = await cargar(req.flujoId);
  res.json(socios.map((s) => {
    const mios = registros.filter((r) => String(r.socioId) === String(s._id));
    return {
      id: s._id, nro: s.nro, nombre: s.nombre, dni: s.dni || '', activo: s.activo !== false, intDebe: s.intDebe || 0,
      ahorro: suma(mios, 'ahorro'), prestamoPendiente: Math.max(r2(suma(mios, 'prestamo') - suma(mios, 'devolucion')), 0),
      semanasRegistradas: mios.length,
    };
  }));
}));

router.post('/socios', necesita('editor'), wrap(async (req, res) => {
  const nombre = texto(req.body.nombre, 100);
  if (!nombre) throw bad('Escribe el nombre del socio');
  const ult = await col('bq_socios').find({ flujoId: req.flujoId }).sort({ nro: -1 }).limit(1).toArray();
  const r = await col('bq_socios').insertOne({
    flujoId: req.flujoId, nro: (ult[0]?.nro || 0) + 1, nombre, dni: texto(req.body.dni, 20), intDebe: 0, activo: true, creadoEn: new Date(),
  });
  await auditar(req, req.flujoId, 'crear', 'socio', r.insertedId, nombre);
  res.status(201).json({ id: r.insertedId });
}));

router.put('/socios/:id', necesita('editor'), wrap(async (req, res) => {
  const _id = oidReq(req.params.id);
  const set = {};
  if (req.body.nombre !== undefined) { set.nombre = texto(req.body.nombre, 100); if (!set.nombre) throw bad('El nombre no puede quedar vacío'); }
  if (req.body.dni !== undefined) set.dni = texto(req.body.dni, 20);
  if (req.body.activo !== undefined) set.activo = !!req.body.activo;
  if (req.body.intDebe !== undefined) set.intDebe = montoCero(req.body.intDebe, 'El interés que debe');
  const r = await col('bq_socios').updateOne({ _id, flujoId: req.flujoId }, { $set: set });
  if (!r.matchedCount) throw noEncontrado('Socio no encontrado');
  await auditar(req, req.flujoId, 'editar', 'socio', _id, JSON.stringify(set));
  res.json({ ok: true });
}));

router.get('/socios/:id/historial', wrap(async (req, res) => {
  const _id = oidReq(req.params.id);
  const socio = await col('bq_socios').findOne({ _id, flujoId: req.flujoId });
  if (!socio) throw noEncontrado('Socio no encontrado');
  const regs = await col('bq_registros').find({ flujoId: req.flujoId, socioId: _id }).sort({ semana: 1 }).toArray();
  const semanas = await col('bq_semanas').find({ flujoId: req.flujoId }).toArray();
  let ahorro = 0, deuda = 0;
  res.json({
    socio: { id: socio._id, nro: socio.nro, nombre: socio.nombre },
    items: regs.map((r) => {
      ahorro += r.ahorro; deuda += r.prestamo - r.devolucion;
      return {
        semana: r.semana, fecha: semanas.find((s) => s.nro === r.semana)?.fecha || r.fecha,
        ...Object.fromEntries(CAMPOS.map((c) => [c, r[c]])), ahorroAcumulado: r2(ahorro), prestamoPendiente: Math.max(r2(deuda), 0),
      };
    }).reverse(),
  });
}));

// ---------- Semanas y registro semanal ----------
router.get('/semanas', wrap(async (req, res) => {
  const { semanas, registros } = await cargar(req.flujoId);
  res.json(semanas.map((s) => {
    const regs = registros.filter((r) => r.semana === s.nro);
    return { nro: s.nro, fecha: s.fecha, registros: regs.length, ahorro: suma(regs, 'ahorro') };
  }));
}));

router.post('/semanas', necesita('editor'), wrap(async (req, res) => {
  const ult = await col('bq_semanas').find({ flujoId: req.flujoId }).sort({ nro: -1 }).limit(1).toArray();
  const nro = Number(req.body.nro) || (ult[0]?.nro || 0) + 1;
  const fecha = esFecha(req.body.fecha) ? req.body.fecha : (ult[0] ? sumarDias(ult[0].fecha, 7) : hoy());
  if (await col('bq_semanas').findOne({ flujoId: req.flujoId, nro })) throw bad(`La semana ${nro} ya existe`);
  await col('bq_semanas').insertOne({ flujoId: req.flujoId, nro, fecha });
  await auditar(req, req.flujoId, 'crear', 'semana', null, `Semana ${nro} (${fecha})`);
  res.status(201).json({ nro, fecha });
}));

router.get('/semanas/:nro/registros', wrap(async (req, res) => {
  const nro = Number(req.params.nro);
  const semana = await col('bq_semanas').findOne({ flujoId: req.flujoId, nro });
  if (!semana) throw noEncontrado('La semana no existe');
  const { socios, registros } = await cargar(req.flujoId);
  const esta = registros.filter((r) => r.semana === nro);
  const filas = socios.filter((s) => s.activo !== false || esta.some((r) => String(r.socioId) === String(s._id))).map((s) => {
    const reg = esta.find((r) => String(r.socioId) === String(s._id));
    const previos = registros.filter((r) => String(r.socioId) === String(s._id) && r.semana < nro);
    return {
      socioId: s._id, nro: s.nro, nombre: s.nombre, existe: !!reg,
      ...Object.fromEntries(CAMPOS.map((c) => [c, reg ? reg[c] : 0])),
      ahorroAcumulado: suma(previos, 'ahorro'),
      prestamoPendiente: Math.max(r2(suma(previos, 'prestamo') - suma(previos, 'devolucion')), 0),
    };
  });
  res.json({ semana: { nro, fecha: semana.fecha }, cajaChicaDefault: req.flujo.config?.cajaChicaDefault ?? 3, filas });
}));

router.put('/semanas/:nro/registros', necesita('editor'), wrap(async (req, res) => {
  const nro = Number(req.params.nro);
  const semana = await col('bq_semanas').findOne({ flujoId: req.flujoId, nro });
  if (!semana) throw noEncontrado('La semana no existe');
  const filas = Array.isArray(req.body.filas) ? req.body.filas : [];
  const socios = await col('bq_socios').find({ flujoId: req.flujoId }).toArray();
  let siguiente = await siguienteNroRegistro(req.flujoId);
  let creados = 0, actualizados = 0;
  for (const f of filas) {
    const socioId = oidReq(f.socioId, 'socio');
    if (!socios.some((s) => String(s._id) === String(socioId))) throw bad('Un socio no pertenece a este banquito');
    const valores = Object.fromEntries(CAMPOS.map((c) => [c, montoCero(f[c], `El valor de ${c}`)]));
    const existente = await col('bq_registros').findOne({ flujoId: req.flujoId, socioId, semana: nro });
    const hayDatos = CAMPOS.some((c) => c !== 'cajaChica' && valores[c] > 0) || (existente && true);
    if (!hayDatos) continue;
    if (existente) {
      const cambio = CAMPOS.some((c) => existente[c] !== valores[c]);
      if (!cambio) continue;
      await col('bq_registros').updateOne({ _id: existente._id }, { $set: { ...valores, editadoPor: req.user.usuario, editadoEn: new Date() } });
      actualizados++;
    } else {
      await col('bq_registros').insertOne({
        flujoId: req.flujoId, nroRegistro: siguiente++, socioId, semana: nro, fecha: semana.fecha, ...valores,
        creadoPor: req.user.usuario, creadoEn: new Date(),
      });
      creados++;
    }
  }
  await auditar(req, req.flujoId, 'registrar', 'semana', null, `Semana ${nro}: ${creados} nuevos, ${actualizados} corregidos`);
  res.json({ creados, actualizados });
}));

// ---------- Balance, devoluciones y configuración ----------
router.get('/balance', wrap(async (req, res) => {
  const b = await calcularBalance(req.flujoId, req.query.semana, req.query.tipo);
  res.json(b || { vacio: true });
}));

router.get('/liquidacion', wrap(async (req, res) => {
  const l = await calcularLiquidacion(req.flujoId, req.query.semana, req.query.porc);
  res.json(l || { vacio: true });
}));

router.put('/config', necesita('admin'), wrap(async (req, res) => {
  const porc = Number(req.body.porcInteres);
  if (!isFinite(porc) || porc < 0 || porc > 10) throw bad('El porcentaje de interés debe estar entre 0 y 10 (por ejemplo 0.27 = 27%)');
  const cc = montoCero(req.body.cajaChicaDefault, 'La caja chica semanal');
  await col('flujos').updateOne({ _id: req.flujoId }, { $set: { 'config.porcInteres': porc, 'config.cajaChicaDefault': cc } });
  await auditar(req, req.flujoId, 'editar', 'config banquito', null, `interés ${porc}, caja chica ${cc}`);
  res.json({ ok: true });
}));

// ---------- Importar y exportar Excel ----------
router.post('/importar', necesita('admin'), express.raw({ type: 'application/octet-stream', limit: '25mb' }), wrap(async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw bad('No llegó ningún archivo');
  const existentes = await col('bq_registros').countDocuments({ flujoId: req.flujoId });
  if (existentes > 0 && req.get('X-Reemplazar') !== 'si') {
    throw new HttpError(409, `Este banquito ya tiene ${existentes} registros. Confirma si quieres reemplazarlos con los del Excel.`);
  }
  const datos = parsearExcel(req.body);
  await Promise.all(['bq_socios', 'bq_semanas', 'bq_registros'].map((c) => col(c).deleteMany({ flujoId: req.flujoId })));
  const ids = new Map();
  const docsSocios = datos.socios.map((s) => {
    const _id = new ObjectId();
    ids.set(s.nro, _id);
    return { _id, flujoId: req.flujoId, nro: s.nro, nombre: s.nombre, dni: s.dni, intDebe: s.intDebe, activo: true, creadoEn: new Date() };
  });
  await col('bq_socios').insertMany(docsSocios);
  await col('bq_semanas').insertMany(datos.semanas.map((s) => ({ flujoId: req.flujoId, nro: s.nro, fecha: s.fecha })));
  await col('bq_registros').insertMany(datos.registros.map((r) => ({
    flujoId: req.flujoId, nroRegistro: r.nroRegistro, socioId: ids.get(r.socioNro), semana: r.semana, fecha: r.fecha,
    ahorro: r.ahorro, cajaChica: r.cajaChica, multa: r.multa, prestamo: r.prestamo, devolucion: r.devolucion, interes: r.interes,
    creadoPor: req.user.usuario, creadoEn: new Date(),
  })));
  await col('flujos').updateOne({ _id: req.flujoId }, { $set: { 'config.porcInteres': datos.porcInteres || req.flujo.config?.porcInteres || 0 } });
  await auditar(req, req.flujoId, 'importar', 'banquito', null, `${datos.socios.length} socios, ${datos.semanas.length} semanas, ${datos.registros.length} registros`);
  res.json({ socios: datos.socios.length, semanas: datos.semanas.length, registros: datos.registros.length, porcInteres: datos.porcInteres });
}));

router.get('/exportar', wrap(async (req, res) => {
  const { socios, semanas, registros } = await cargar(req.flujoId);
  const liq = await calcularLiquidacion(req.flujoId, req.query.semana);
  const wb = XLSX.utils.book_new();
  const mapaS = new Map(socios.map((s) => [String(s._id), s]));
  const add = (n, filas) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas.length ? filas : [{ Aviso: 'Sin datos' }]), n);
  add('Socios', socios.map((s) => ({ Nro: s.nro, Socio: s.nombre, DNI: s.dni, Activo: s.activo !== false ? 'Sí' : 'No' })));
  add('Registros', registros.sort((a, b) => a.semana - b.semana || mapaS.get(String(a.socioId)).nro - mapaS.get(String(b.socioId)).nro).map((r) => ({
    'Nro registro': r.nroRegistro, 'Nro socio': mapaS.get(String(r.socioId)).nro, Socio: mapaS.get(String(r.socioId)).nombre, Semana: r.semana,
    Fecha: semanas.find((s) => s.nro === r.semana)?.fecha || r.fecha, Ahorro: r.ahorro, 'Caja chica': r.cajaChica, Multa: r.multa,
    Préstamo: r.prestamo, Devolución: r.devolucion, Interés: r.interes,
  })));
  if (liq) add('Devoluciones', liq.filas.map((f) => ({
    Nro: f.nro, Socio: f.nombre, 'Ahorro total': f.ahorro, 'Interés ganado': f.interesGanado, Préstamo: f.prestamo,
    'Interés que debe': f.intDebe, Total: f.total, 'Caja chica y multa': f.cajaChicaMulta,
  })));
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="banquito.xlsx"');
  res.send(buf);
}));

module.exports = router;
