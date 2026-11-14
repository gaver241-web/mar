const { MongoClient } = require('mongodb');
const cfg = require('./config');

let client;
let db;

async function conectar() {
  if (!cfg.mongoUri) throw new Error('Falta la variable MONGODB_URI');
  client = new MongoClient(cfg.mongoUri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  db = client.db(cfg.dbNombre);

  await Promise.all([
    col('users').createIndex({ usuarioLower: 1 }, { unique: true }),
    col('movimientos').createIndex({ flujoId: 1, fecha: -1 }),
    col('cuentas').createIndex({ flujoId: 1 }),
    col('categorias').createIndex({ flujoId: 1 }),
    col('pendientes').createIndex({ flujoId: 1, vencimiento: 1 }),
    col('presupuestos').createIndex({ flujoId: 1, periodo: 1, categoriaId: 1 }, { unique: true }),
    col('auditoria').createIndex({ flujoId: 1, fecha: -1 }),
    col('bq_socios').createIndex({ flujoId: 1, nro: 1 }),
    col('bq_semanas').createIndex({ flujoId: 1, nro: 1 }, { unique: true }),
    col('bq_registros').createIndex({ flujoId: 1, socioId: 1, semana: 1 }, { unique: true }),
    col('bq_registros').createIndex({ flujoId: 1, semana: 1 }),
  ]);
  return db;
}

function col(nombre) {
  if (!db) throw new Error('Base de datos no conectada');
  return db.collection(nombre);
}

module.exports = { conectar, col };
