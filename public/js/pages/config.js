import { h, html, $, $$, api, aviso, falla, formulario, confirmar, descargar, fecha, crudo } from '../util.js';
import { cabecera, chip } from './comun.js';

const ROLES = [{ v: 'admin', t: 'Administra el flujo' }, { v: 'editor', t: 'Registra movimientos' }, { v: 'lector', t: 'Solo consulta' }];
const ACCIONES = { crear: 'Creó', editar: 'Editó', anular: 'Anuló', confirmar: 'Confirmó', eliminar: 'Eliminó', cobro: 'Cobro', pago: 'Pago', registrar: 'Registró', importar: 'Importó', archivar: 'Archivó' };

export default async function config(ctx) {
  const { main, flujo } = ctx;
  let tab = ctx.params.get('tab') || 'general';
  const cargar = async () => {
    const f = await ctx.recargarFlujo();
    const tabs = [['general', 'General y accesos'], ['categorias', 'Categorías'], ...(f.tipo === 'banquito' ? [['banquito', 'Banquito']] : []), ['auditoria', 'Historial de cambios']];
    html(main, h`${cabecera('Configuración', f.nombre)}
      <div class="segmentos" style="margin-bottom:20px">${tabs.map(([k, t]) => h`<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${t}</button>`)}</div><div id="tab"></div>`);
    $$('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; cargar(); });
    const cont = $('#tab');
    if (tab === 'general') await general(cont, f);
    if (tab === 'categorias') await categorias(cont);
    if (tab === 'banquito') banquito(cont, f);
    if (tab === 'auditoria') await auditoria(cont);
  };

  async function general(cont, f) {
    html(cont, h`<div class="rejilla g-1-1"><div class="panel"><div class="tit"><h3>Datos del flujo</h3></div>
      <div class="campo"><label for="g-n">Nombre</label><input type="text" id="g-n" value="${f.nombre}"></div>
      <div class="campo"><label for="g-d">Descripción</label><input type="text" id="g-d" value="${f.descripcion}"></div>
      <div class="campo"><label for="g-m">Símbolo de moneda</label><input type="text" id="g-m" value="${f.moneda}" style="width:100px"></div>
      <button class="btn primario" id="g-guardar">Guardar datos</button></div>
      <div class="panel"><div class="tit"><h3>Quién puede entrar</h3></div>
        <p class="muted small" style="margin-top:-6px">Los administradores generales ven todos los flujos. Aquí eliges a los demás usuarios. Crea usuarios nuevos en General → Usuarios.</p>
        <table class="t compacta"><tbody id="miembros">${f.miembros.map((m) => h`<tr data-u="${m.userId}"><td><b>${m.nombre}</b><br><span class="muted small">${m.usuario}</span></td><td><select data-rol>${ROLES.map((r) => h`<option value="${r.v}" ${m.rol === r.v ? crudo('selected') : ''}>${r.t}</option>`)}</select></td><td class="acc"><button class="btn mini peligro" data-quitar>Quitar</button></td></tr>`)}</tbody></table>
        ${f.miembros.length ? '' : h`<p class="muted">Aún no hay usuarios asignados.</p>`}
        ${f.usuariosDisponibles.filter((u) => !f.miembros.some((m) => m.userId === u.id)).length ? h`<div style="display:flex;gap:8px;margin-top:12px"><select id="nuevo-u">${f.usuariosDisponibles.filter((u) => !f.miembros.some((m) => m.userId === u.id)).map((u) => h`<option value="${u.id}">${u.nombre} (${u.usuario})</option>`)}</select><button class="btn" id="agregar-u">Agregar</button></div>` : ''}
        <div style="margin-top:16px"><button class="btn primario" id="guardar-m">Guardar accesos</button></div></div></div>`);
    $('#g-guardar').onclick = async () => { try { await api.put(`/flujos/${f.id}`, { nombre: $('#g-n').value, descripcion: $('#g-d').value, moneda: $('#g-m').value }); await ctx.recargarFlujos(); aviso('Datos guardados'); location.reload(); } catch (e) { falla(e); } };
    const estadoMiembros = () => $$('#miembros tr').map((tr) => ({ userId: tr.dataset.u, rol: $('[data-rol]', tr).value }));
    $$('[data-quitar]').forEach((b) => b.onclick = () => { b.closest('tr').remove(); });
    $('#agregar-u')?.addEventListener('click', async () => { const m = estadoMiembros(); m.push({ userId: $('#nuevo-u').value, rol: 'editor' }); try { await api.put(`/flujos/${f.id}/miembros`, { miembros: m }); aviso('Usuario agregado'); cargar(); } catch (e) { falla(e); } });
    $('#guardar-m').onclick = async () => { try { await api.put(`/flujos/${f.id}/miembros`, { miembros: estadoMiembros() }); aviso('Accesos guardados'); cargar(); } catch (e) { falla(e); } };
  }

  async function categorias(cont) {
    const cats = await api.get(`/flujos/${flujo.id}/categorias`);
    const bloque = (tipo, titulo) => h`<div class="panel"><div class="tit"><h3>${titulo}</h3><button class="btn mini" data-nueva="${tipo}">+ Agregar</button></div>
      <ul class="lista-simple">${cats.filter((c) => c.tipo === tipo).map((c) => h`<li><span class="${c.activa ? '' : 'muted'}">${c.nombre}${c.activa ? '' : ' (oculta)'}</span><span><button class="btn mini" data-ren="${c.id}" data-n="${c.nombre}">Renombrar</button> <button class="btn mini" data-vis="${c.id}" data-a="${c.activa ? 1 : 0}">${c.activa ? 'Ocultar' : 'Mostrar'}</button></span></li>`)}</ul></div>`;
    html(cont, h`<div class="rejilla g-1-1">${bloque('ingreso', 'Categorías de ingreso')}${bloque('egreso', 'Categorías de gasto')}</div>`);
    $$('[data-nueva]').forEach((b) => b.onclick = async () => { if (await formulario({ titulo: 'Nueva categoría', campos: [{ name: 'nombre', label: 'Nombre', tipo: 'text' }], enviar: (v) => api.post(`/flujos/${flujo.id}/categorias`, { ...v, tipo: b.dataset.nueva }) })) { await ctx.recargarMeta(); cargar(); } });
    $$('[data-ren]').forEach((b) => b.onclick = async () => { if (await formulario({ titulo: 'Renombrar categoría', campos: [{ name: 'nombre', label: 'Nombre', tipo: 'text' }], valores: { nombre: b.dataset.n }, enviar: (v) => api.put(`/flujos/${flujo.id}/categorias/${b.dataset.ren}`, v) })) { await ctx.recargarMeta(); cargar(); } });
    $$('[data-vis]').forEach((b) => b.onclick = async () => { try { await api.put(`/flujos/${flujo.id}/categorias/${b.dataset.vis}`, { activa: b.dataset.a !== '1' }); await ctx.recargarMeta(); cargar(); } catch (e) { falla(e); } });
  }

  function banquito(cont, f) {
    html(cont, h`<div class="rejilla g-1-1"><div class="panel"><div class="tit"><h3>Parámetros</h3></div>
      <div class="campo"><label for="b-cc">Caja chica semanal (${f.moneda})</label><input type="number" id="b-cc" step="0.01" min="0" value="${f.config.cajaChicaDefault ?? 3}"><div class="ayuda">Se completa sola cuando anotas un ahorro.</div></div>
      <div class="campo"><label for="b-pi">Porcentaje de interés sobre el ahorro</label><input type="number" id="b-pi" step="0.0001" min="0" value="${f.config.porcInteres ?? 0}"><div class="ayuda">0.27 significa 27%. Se usa para repartir el interés entre socios.</div></div>
      <button class="btn primario" id="b-guardar">Guardar parámetros</button></div>
      <div class="panel"><div class="tit"><h3>Importar tu Excel del banquito</h3></div>
        <p class="muted" style="margin-top:-6px">Sube el archivo BANQUITO (.xlsm o .xlsx). Se leen las hojas SOCIOS, BASE_DE_REGISTROS, DATOS_CONF y Hoja1 (socios, semanas, registros, porcentaje de interés e interés que debe cada socio).</p>
        <input type="file" id="archivo" accept=".xlsm,.xlsx,.xls" style="margin-bottom:12px"><br><button class="btn primario" id="importar">Importar</button>
        <p class="muted small" style="margin-bottom:0">Si el banquito ya tiene datos, te pedirá confirmar antes de reemplazarlos.</p></div></div>`);
    $('#b-guardar').onclick = async () => { try { await api.put(`/flujos/${f.id}/banquito/config`, { porcInteres: $('#b-pi').value, cajaChicaDefault: $('#b-cc').value }); aviso('Parámetros guardados'); await ctx.recargarFlujo(); } catch (e) { falla(e); } };
    $('#importar').onclick = async () => {
      const file = $('#archivo').files[0];
      if (!file) return aviso('Elige primero el archivo de Excel', 'error');
      const buf = await file.arrayBuffer();
      const subir = (reemplazar) => api.post(`/flujos/${f.id}/banquito/importar`, buf, { 'Content-Type': 'application/octet-stream', ...(reemplazar ? { 'X-Reemplazar': 'si' } : {}) });
      try {
        let r;
        try { r = await subir(false); } catch (e) {
          if (e.status !== 409) throw e;
          if (!(await confirmar(`${e.message} Se borrarán los datos actuales del banquito y se cargarán los del Excel.`, { si: 'Reemplazar datos', peligro: true, titulo: 'Reemplazar datos' }))) return;
          r = await subir(true);
        }
        aviso(`Importado: ${r.socios} socios, ${r.semanas} semanas, ${r.registros} registros`);
        await ctx.recargarFlujo(); cargar();
      } catch (e) { falla(e); }
    };
  }

  async function auditoria(cont) {
    const lista = await api.get(`/flujos/${flujo.id}/auditoria`);
    html(cont, h`<div class="panel sin-pad">${lista.length ? h`<div class="tabla-wrap"><table class="t compacta"><thead><tr><th>Cuándo</th><th>Quién</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>
      ${lista.map((a) => h`<tr><td style="white-space:nowrap">${new Date(a.fecha).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' })}</td><td>${a.usuario}</td><td>${ACCIONES[a.accion] || a.accion} · ${a.entidad}</td><td class="muted">${a.detalle}</td></tr>`)}</tbody></table></div>`
      : h`<div class="vacio"><p>Todavía no hay cambios registrados.</p></div>`}</div>
      <p class="muted small">Se muestran los últimos 200 cambios: quién creó, corrigió o anuló cada cosa.</p>`);
  }
  await cargar();
}
