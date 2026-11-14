const { col } = require('../db');

async function auditar(req, flujoId, accion, entidad, entidadId, detalle) {
  try {
    await col('auditoria').insertOne({
      flujoId: flujoId || null,
      userId: req.user._id,
      usuario: req.user.usuario,
      accion,
      entidad,
      entidadId: entidadId || null,
      detalle: detalle || '',
      fecha: new Date(),
    });
  } catch (e) {
    console.error('No se pudo guardar la auditoría:', e.message);
  }
}
module.exports = { auditar };
