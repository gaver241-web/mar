const { ObjectId } = require('mongodb');
const cfg = require('./config');

class HttpError extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}
const bad = (m) => new HttpError(400, m);
const prohibido = (m = 'No tienes permiso para esta acción') => new HttpError(403, m);
const noEncontrado = (m = 'No se encontró el registro') => new HttpError(404, m);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function oid(s) {
  try { return new ObjectId(String(s)); } catch { return null; }
}
function oidReq(s, nombre = 'id') {
  const o = oid(s);
  if (!o) throw bad(`El ${nombre} no es válido`);
  return o;
}

const esFecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));

function hoy() {
  return new Date().toLocaleDateString('en-CA', { timeZone: cfg.zona });
}
function sumarDias(f, n) {
  const d = new Date(f + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function sumarMeses(periodo, n) {
  const [y, m] = periodo.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
function finDeMes(periodo) {
  const [y, m] = periodo.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
const esPeriodo = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

function monto(v, nombre = 'El monto') {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) throw bad(`${nombre} debe ser mayor que cero`);
  if (n > 1e9) throw bad(`${nombre} es demasiado grande`);
  return r2(n);
}
function montoCero(v, nombre = 'El monto') {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(v);
  if (!isFinite(n) || n < 0) throw bad(`${nombre} no puede ser negativo`);
  if (n > 1e9) throw bad(`${nombre} es demasiado grande`);
  return r2(n);
}
function texto(v, max = 200) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

module.exports = {
  HttpError, bad, prohibido, noEncontrado, wrap, r2, oid, oidReq, esFecha, hoy,
  sumarDias, sumarMeses, finDeMes, esPeriodo, monto, montoCero, texto,
};
