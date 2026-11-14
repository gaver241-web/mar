import { h, html, $, $$, api, qs, dinero, numero, fecha, aviso, falla, formulario, confirmar, ventana, descargar, crudo, hoyISO } from '../util.js';
import { cabecera, chip, vacio } from './comun.js';

const CAMPOS = ['ahorro', 'cajaChica', 'multa', 'prestamo', 'devolucion', 'interes'];
const ROT = { ahorro: 'Ahorro', cajaChica: 'Caja chica', multa: 'Multa', prestamo: 'Préstamo', devolucion: 'Devolución', interes: 'Interés' };
const sumarDias = (f, n) => { const d = new Date(f + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const base = (ctx) => `/flujos/${ctx.flujo.id}/banquito`;

const selectorSemana = (semanas, actual) => h`<select id="sel-semana" style="width:auto" aria-label="Semana">${[...semanas].reverse().map((s) => h`<option value="${s.nro}" ${s.nro === actual ? crudo('selected') : ''}>Semana ${s.nro} · ${fecha(s.fecha)}</option>`)}</select>`;
const vacioBanquito = (ctx) => h`<div class="vacio"><h3>Este banquito aún no tiene semanas</h3><p>${ctx.esAdminFlujo ? 'Importa tu Excel del banquito o crea la primera semana.' : 'El administrador debe crear la primera semana.'}</p>
  ${ctx.esAdminFlujo ? h`<a class="btn primario" href="${ctx.ruta('config')}">Ir a Configuración</a>` : ''}</div>`;

// ---------- Registro semanal ----------
export async function semana(ctx) {
  const { main, flujo, puedeEditar } = ctx;
  const semanas = await api.get(`${base(ctx)}/semanas`);
  if (!semanas.length) {
    html(main, h`${cabecera('Registro semanal')}${puedeEditar ? h`<div class="panel"><div class="vacio"><h3>Crea la primera semana</h3><p>Cada semana tiene una fecha y una fila por socio.</p><button class="btn primario" id="crear1">Crear semana 1</button></div></div>` : vacioBanquito(ctx)}`);
    $('#crear1')?.addEventListener('click', async () => { try { await api.post(`${base(ctx)}/semanas`, { fecha: hoyISO() }); ctx.irA(`/f/${flujo.id}/semana?nro=1`); location.reload(); } catch (e) { falla(e); } });
    return;
  }
  // Por defecto: la primera semana sin datos después de la última con datos (la que toca registrar).
  const conDatos = semanas.filter((s) => s.registros > 0).map((s) => s.nro);
  const ultimaConDatos = conDatos.length ? Math.max(...conDatos) : 0;
  let nro = Number(ctx.params.get('nro')) || (semanas.find((s) => s.nro > ultimaConDatos) || semanas[semanas.length - 1]).nro;
  const cargar = async () => {
    const d = await api.get(`${base(ctx)}/semanas/${nro}/registros`);
    const ro = puedeEditar ? '' : 'disabled';
    html(main, h`
      ${cabecera('Registro semanal', 'Anota lo que cada socio aportó o movió esta semana.', h`${selectorSemana(semanas, nro)}${puedeEditar ? h`<button class="btn" id="nueva-sem">+ Nueva semana</button>` : ''}`)}
      <div class="filtros"><div class="campo ancho"><label for="buscar">Buscar socio</label><input type="text" id="buscar" placeholder="Escribe un nombre…"></div>
        <div class="muted small" style="padding-bottom:10px">Si escribes un ahorro, la caja chica se completa sola (${dinero(d.cajaChicaDefault)}). Para una semana sin aporte, deja la fila vacía.</div></div>
      <div class="panel sin-pad"><div class="tabla-wrap"><table class="t compacta" id="grilla"><thead><tr><th>N.º</th><th>Socio</th><th class="num">Ahorrado antes</th><th class="num">Debe préstamo</th>${CAMPOS.map((c) => h`<th class="num">${ROT[c]}</th>`)}</tr></thead><tbody>
        ${d.filas.map((f) => h`<tr data-socio="${f.socioId}" data-existe="${f.existe ? 1 : 0}" data-nombre="${f.nombre.toLowerCase()}"><td>${f.nro}</td><td><b>${f.nombre}</b></td><td class="num">${dinero(f.ahorroAcumulado, true)}</td><td class="num ${f.prestamoPendiente ? 'neg' : 'muted'}">${f.prestamoPendiente ? dinero(f.prestamoPendiente, true) : '—'}</td>
          ${CAMPOS.map((c) => h`<td class="num"><input class="celda" type="number" min="0" step="0.01" inputmode="decimal" data-campo="${c}" data-orig="${f[c]}" value="${f[c] || ''}" ${ro} aria-label="${ROT[c]} de ${f.nombre}"></td>`)}</tr>`)}
        <tr class="total" id="fila-total"><td colspan="4">Total de la semana</td>${CAMPOS.map((c) => h`<td class="num" data-total="${c}">0</td>`)}</tr></tbody></table></div></div>
      ${puedeEditar ? h`<div class="sticky-guardar"><span class="muted" id="estado-guardar">Sin cambios</span><button class="btn primario" id="guardar" disabled>Guardar semana ${nro}</button></div>` : ''}`);

    const filas = $$('#grilla tbody tr[data-socio]');
    const totales = () => {
      CAMPOS.forEach((c) => { const t = $$(`input[data-campo="${c}"]`).reduce((a, i) => a + (Number(i.value) || 0), 0); $(`[data-total="${c}"]`).textContent = numero(t); });
    };
    totales();
    const marcar = () => {
      const n = $$('input.sucio').length;
      $('#estado-guardar') && ($('#estado-guardar').textContent = n ? `${n} cambio${n === 1 ? '' : 's'} sin guardar` : 'Sin cambios');
      $('#guardar') && ($('#guardar').disabled = !n);
    };
    $$('input.celda').forEach((i) => i.addEventListener('input', () => {
      const tr = i.closest('tr');
      i.classList.toggle('sucio', (Number(i.value) || 0) !== Number(i.dataset.orig));
      if (i.dataset.campo === 'ahorro' && Number(i.value) > 0 && tr.dataset.existe === '0') {
        const cc = $('[data-campo="cajaChica"]', tr);
        if (!Number(cc.value)) { cc.value = d.cajaChicaDefault || ''; cc.classList.add('sucio'); }
      }
      totales(); marcar();
    }));
    $('#buscar').oninput = (e) => { const q = e.target.value.toLowerCase(); filas.forEach((tr) => tr.classList.toggle('oculto', !tr.dataset.nombre.includes(q))); };
    $('#sel-semana').onchange = (e) => { nro = Number(e.target.value); cargar(); };
    $('#guardar')?.addEventListener('click', async () => {
      const cuerpo = filas.filter((tr) => $$('input.sucio', tr).length).map((tr) => ({ socioId: tr.dataset.socio, ...Object.fromEntries(CAMPOS.map((c) => [c, $(`[data-campo="${c}"]`, tr).value || 0])) }));
      try { const r = await api.put(`${base(ctx)}/semanas/${nro}/registros`, { filas: cuerpo }); aviso(`Semana guardada: ${r.creados} nuevo${r.creados === 1 ? '' : 's'}, ${r.actualizados} corregido${r.actualizados === 1 ? '' : 's'}`); cargar(); } catch (e) { falla(e); }
    });
    $('#nueva-sem')?.addEventListener('click', async () => {
      const ult = semanas[semanas.length - 1];
      const r = await formulario({
        titulo: 'Nueva semana', textoGuardar: 'Crear semana',
        campos: [{ name: 'fecha', label: `Fecha de la semana ${ult.nro + 1}`, tipo: 'date', valor: sumarDias(ult.fecha, 7), ayuda: `La semana anterior fue el ${fecha(ult.fecha)}.` }],
        enviar: (v) => api.post(`${base(ctx)}/semanas`, v),
      });
      if (r) { aviso(`Semana ${r.nro} creada`); ctx.irA(`/f/${flujo.id}/semana?nro=${r.nro}`); location.reload(); }
    });
  };
  await cargar();
}

// ---------- Socios ----------
export async function socios(ctx) {
  const { main, flujo, puedeEditar } = ctx;
  const cargar = async () => {
    const lista = await api.get(`${base(ctx)}/socios`);
    html(main, h`
      ${cabecera('Socios', `${lista.filter((s) => s.activo).length} socios activos`, h`${puedeEditar ? h`<button class="btn primario" id="nuevo">+ Nuevo socio</button>` : ''}<button class="btn" id="exportar">Descargar Excel</button>`)}
      <div class="panel sin-pad">${lista.length ? h`<div class="tabla-wrap"><table class="t"><thead><tr><th>N.º</th><th>Socio</th><th>DNI</th><th class="num">Ahorrado</th><th class="num">Debe préstamo</th><th class="num">Semanas</th><th>Estado</th><th></th></tr></thead><tbody>
        ${lista.map((s) => h`<tr class="${s.activo ? '' : 'anulado'}"><td>${s.nro}</td><td><b>${s.nombre}</b></td><td>${s.dni || '—'}</td><td class="num">${dinero(s.ahorro)}</td><td class="num ${s.prestamoPendiente ? 'neg' : ''}">${dinero(s.prestamoPendiente)}</td><td class="num">${s.semanasRegistradas}</td><td class="est">${chip(s.activo ? 'activo' : 'inactivo', s.activo ? 'confirmado' : 'anulado')}</td>
          <td class="acc"><button class="btn mini" data-hist="${s.id}">Historial</button>${puedeEditar ? h` <button class="btn mini" data-edit="${s.id}">Editar</button>` : ''}</td></tr>`)}</tbody></table></div>`
        : vacio('Aún no hay socios', 'Agrega socios o importa tu Excel desde Configuración.')}</div>`);
    $('#exportar').onclick = () => descargar(`${base(ctx)}/exportar`, 'banquito.xlsx').catch(falla);
    $('#nuevo')?.addEventListener('click', async () => {
      if (await formulario({ titulo: 'Nuevo socio', campos: [{ name: 'nombre', label: 'Nombre completo', tipo: 'text' }, { name: 'dni', label: 'DNI', tipo: 'text', ph: 'Opcional' }], enviar: (v) => api.post(`${base(ctx)}/socios`, v) })) { aviso('Socio agregado'); cargar(); }
    });
    $$('[data-edit]').forEach((b) => b.onclick = async () => {
      const s = lista.find((x) => x.id === b.dataset.edit);
      if (await formulario({
        titulo: `Editar a ${s.nombre}`,
        campos: [{ name: 'nombre', label: 'Nombre completo', tipo: 'text' }, { name: 'dni', label: 'DNI', tipo: 'text' }, { name: 'activo', label: 'Socio activo', tipo: 'check', ayuda: 'Los socios inactivos ya no aparecen en la planilla semanal, pero su historial se conserva.' }],
        valores: s, enviar: (v) => api.put(`${base(ctx)}/socios/${s.id}`, v),
      })) { aviso('Socio actualizado'); cargar(); }
    });
    $$('[data-hist]').forEach((b) => b.onclick = async () => {
      try {
        const d = await api.get(`${base(ctx)}/socios/${b.dataset.hist}/historial`);
        const cuerpo = document.createElement('div');
        html(cuerpo, h`<div style="max-height:56vh;overflow:auto"><table class="t compacta"><thead><tr><th>Sem.</th><th>Fecha</th>${CAMPOS.map((c) => h`<th class="num">${ROT[c]}</th>`)}<th class="num">Ahorro acum.</th><th class="num">Debe</th></tr></thead><tbody>
          ${d.items.map((r) => h`<tr><td>${r.semana}</td><td>${fecha(r.fecha)}</td>${CAMPOS.map((c) => h`<td class="num">${r[c] ? numero(r[c]) : '—'}</td>`)}<td class="num"><b>${numero(r.ahorroAcumulado)}</b></td><td class="num">${r.prestamoPendiente ? numero(r.prestamoPendiente) : '—'}</td></tr>`)}</tbody></table></div>`);
        ventana({ titulo: `Historial de ${d.socio.nombre}`, cuerpo, ancha: true, acciones: [{ texto: 'Cerrar', alHacer: ({ cerrar }) => cerrar(null) }] });
      } catch (e) { falla(e); }
    });
  };
  await cargar();
}

// ---------- Balance ----------
export async function balance(ctx) {
  const { main } = ctx;
  const semanas = await api.get(`${base(ctx)}/semanas`);
  if (!semanas.length) { html(main, h`${cabecera('Balance')}<div class="panel">${vacioBanquito(ctx)}</div>`); return; }
  let nro = semanas.filter((s) => s.registros).pop()?.nro || semanas[semanas.length - 1].nro, tipo = 1;
  const cargar = async () => {
    const b = await api.get(`${base(ctx)}/balance${qs({ semana: nro, tipo })}`);
    const l = (t, v, cl = '') => h`<div class="linea ${cl}"><span>${t}</span><span>${dinero(v)}</span></div>`;
    html(main, h`
      ${cabecera('Balance del banquito', tipo === 1 ? `Solo lo ocurrido en la semana ${b.semana} (${fecha(b.fecha)})` : `Acumulado hasta la semana ${b.semana} (${fecha(b.fecha)})`, h`${selectorSemana(semanas, nro)}
        <div class="segmentos"><button data-tipo="1" class="${tipo === 1 ? 'on' : ''}">Solo la semana</button><button data-tipo="2" class="${tipo === 2 ? 'on' : ''}">Hasta la semana</button></div>`)}
      <div class="rejilla g-2-1"><div class="panel"><div class="estado-balance">
        ${l('Monto ahorrado', b.ahorro)}${l('Devoluciones de préstamos', b.devolucion)}${l('Interés recaudado', b.interes)}${l('Efectivo', b.efectivo, 'fuerte')}${l('(−) Préstamos entregados', b.prestamo)}${l('En caja', b.enCaja, 'fuerte')}
        <div style="height:18px"></div>${l('En caja chica', b.cajaChica)}${l('En multas', b.multas)}</div></div>
        <div class="panel"><div class="tit"><h3>Para tener presente</h3></div><ul class="lista-simple">
          <li><span>Préstamos por cobrar</span><b>${dinero(b.prestamosPorCobrar)}</b></li><li><span>Interés / ahorro de la semana</span><b>${numero(b.interesSobreAhorro)}</b></li></ul>
          <p class="muted small">En caja = ahorro + devoluciones + interés − préstamos entregados. “Préstamos por cobrar” es lo prestado menos lo devuelto hasta esta semana.</p></div></div>`);
    $('#sel-semana').onchange = (e) => { nro = Number(e.target.value); cargar(); };
    $$('[data-tipo]').forEach((x) => x.onclick = () => { tipo = Number(x.dataset.tipo); cargar(); });
  };
  await cargar();
}

// ---------- Devoluciones a socios ----------
export async function devoluciones(ctx) {
  const { main, flujo, puedeEditar, esAdminFlujo } = ctx;
  const semanas = await api.get(`${base(ctx)}/semanas`);
  if (!semanas.length) { html(main, h`${cabecera('Devoluciones a socios')}<div class="panel">${vacioBanquito(ctx)}</div>`); return; }
  let nro = semanas.filter((s) => s.registros).pop()?.nro || semanas[semanas.length - 1].nro, porc = null;
  const cargar = async () => {
    const d = await api.get(`${base(ctx)}/liquidacion${qs({ semana: nro, porc })}`);
    const t = d.totales;
    html(main, h`
      ${cabecera('Devoluciones a socios', `Lo que le toca a cada socio si el banquito se liquidara con los datos hasta la semana ${d.semana}.`, h`${selectorSemana(semanas, nro)}<button class="btn" id="exportar">Descargar Excel</button>`)}
      <div class="panel mb" style="display:flex;gap:24px;align-items:flex-end;flex-wrap:wrap">
        <div class="campo" style="margin:0"><label for="porc">Porcentaje de interés sobre el ahorro</label><div style="display:flex;gap:8px"><input type="number" id="porc" step="0.0001" min="0" value="${d.porcInteres}" style="width:130px"><button class="btn" id="probar">Calcular</button></div></div>
        <div class="muted small" style="max-width:520px;padding-bottom:6px">0.27 significa 27%. Sugerido según el interés realmente recaudado: <b>${d.porcSugerido}</b>
          <button class="btn enlace" id="usar-sug">Usar sugerido</button>${esAdminFlujo ? h`<button class="btn enlace" id="guardar-porc">Guardar como oficial</button>` : ''}</div></div>
      <div class="panel sin-pad"><div class="tabla-wrap"><table class="t compacta"><thead><tr><th>N.º</th><th>Socio</th><th class="num">Ahorro total</th><th class="num">Interés ganado</th><th class="num">Préstamo</th><th class="num">Interés que debe</th><th class="num">Total a devolver</th><th class="num">Caja chica y multa</th><th></th></tr></thead><tbody>
        ${d.filas.map((f) => h`<tr><td>${f.nro}</td><td><b>${f.nombre}</b></td><td class="num">${dinero(f.ahorro, true)}</td><td class="num">${dinero(f.interesGanado, true)}</td><td class="num ${f.prestamo ? 'neg' : ''}">${f.prestamo ? dinero(f.prestamo, true) : '—'}</td><td class="num">${f.intDebe ? dinero(f.intDebe, true) : '—'}</td>
          <td class="num"><b class="${f.total < 0 ? 'neg' : ''}">${dinero(f.total, true)}</b></td><td class="num">${dinero(f.cajaChicaMulta, true)}</td>
          <td class="acc">${puedeEditar ? h`<button class="btn mini" data-debe="${f.socioId}" data-n="${f.nombre}" data-v="${f.intDebe}">Interés que debe</button>` : ''}</td></tr>`)}
        <tr class="total"><td colspan="2">Totales</td><td class="num">${dinero(t.ahorro, true)}</td><td class="num">${dinero(t.interesGanado, true)}</td><td class="num">${dinero(t.prestamo, true)}</td><td class="num">${dinero(t.intDebe, true)}</td><td class="num">${dinero(t.total, true)}</td><td class="num">${dinero(t.cajaChicaMulta, true)}</td><td></td></tr></tbody></table></div></div>
      <p class="muted small">Total a devolver = ahorro + interés ganado − préstamo pendiente − interés que debe. El interés que debe se anota a mano por socio.</p>`);
    $('#sel-semana').onchange = (e) => { nro = Number(e.target.value); cargar(); };
    $('#probar').onclick = () => { porc = $('#porc').value; cargar(); };
    $('#usar-sug').onclick = () => { porc = d.porcSugerido; cargar(); };
    $('#exportar').onclick = () => descargar(`${base(ctx)}/exportar?semana=${nro}`, 'banquito.xlsx').catch(falla);
    $('#guardar-porc')?.addEventListener('click', async () => {
      try { await api.put(`${base(ctx)}/config`, { porcInteres: $('#porc').value, cajaChicaDefault: flujo.config?.cajaChicaDefault ?? 3 }); await ctx.recargarFlujo(); aviso('Porcentaje guardado'); } catch (e) { falla(e); }
    });
    $$('[data-debe]').forEach((b) => b.onclick = async () => {
      if (await formulario({ titulo: `Interés que debe · ${b.dataset.n}`, campos: [{ name: 'intDebe', label: `Monto (${flujo.moneda})`, tipo: 'number', paso: '0.01', valor: b.dataset.v, ayuda: 'Interés pendiente por sus préstamos. Escribe 0 si no debe.' }], enviar: (v) => api.put(`${base(ctx)}/socios/${b.dataset.debe}`, v) })) { aviso('Guardado'); cargar(); }
    });
  };
  await cargar();
}
