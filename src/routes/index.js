const api = require('express').Router();
const { requireAuth, requireAdmin, cargarFlujo, exigirHeaderApp } = require('../auth');

api.use(exigirHeaderApp);
api.use('/auth', require('./auth'));
api.use('/usuarios', requireAuth, requireAdmin, require('./usuarios'));

const hijo = (ruta, router) => api.use(`/flujos/:fid/${ruta}`, requireAuth, cargarFlujo, router);
api.use('/flujos', requireAuth, require('./flujos'));
hijo('movimientos', require('./movimientos'));
hijo('cobros', require('./cobros'));
hijo('presupuestos', require('./presupuestos'));
hijo('banquito', require('./banquito'));
hijo('', require('./catalogos'));
hijo('', require('./analisis'));

api.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

module.exports = api;
