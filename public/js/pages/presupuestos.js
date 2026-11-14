import { h, html, $, $$, api, dinero, aviso, falla, formulario, mesLargo, hoyISO } from '../util.js';
import { cabecera, vacio, porcentajeClase } from './comun.js';

const mesAnterior = (p) => { const [y, m] = p.split('-').map(Number); return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7); };

export default async function presupuestos(ctx) {
  const { main, flujo, esAdminFlujo } = ctx;
  let periodo = ctx.params.get('periodo') || hoyISO().slice(0, 7);
  const cargar = async () => {
    const d = await api.get(`/flujos/${flujo.id}/presupuestos?periodo=${periodo}`);
    const t = d.totales;
    html(main, h`
      ${cabecera('Presupuestos', 'Límite de gasto por categoría. Lo comprometido (programado y por pagar) se muestra aparte del gasto real.', h`
        <input type="month" id="mes" value="${periodo}" style="width:auto" aria-label="Mes">${esAdminFlujo ? h`<button class="btn" id="copiar">Copiar de ${mesLargo(mesAnterior(periodo))}</button>` : ''}`)}
      <div class="rejilla g-4 mb">
        <div class="kpi"><div class="et">Presupuesto aprobado</div><div class="val">${dinero(t.aprobado)}</div></div>
        <div class="kpi egreso"><div class="et">Gastado</div><div class="val">${dinero(t.ejecutado)}</div></div>
        <div class="kpi"><div class="et">Comprometido</div><div class="val">${dinero(t.comprometido)}</div><div class="det">Programado + por pagar este mes</div></div>
        <div class="kpi"><div class="et">Restante</div><div class="val ${t.aprobado - t.ejecutado < 0 ? 'neg' : ''}">${dinero(t.aprobado - t.ejecutado)}</div></div></div>
      <div class="panel sin-pad">${d.filas.length ? h`<div class="tabla-wrap"><table class="t"><thead><tr><th>Categoría de gasto</th><th class="num">Presupuesto</th><th class="num">Gastado</th><th class="num">Comprometido</th><th class="num">Restante</th><th style="width:200px">Uso</th><th></th></tr></thead><tbody>
        ${d.filas.map((f) => h`<tr><td><b>${f.categoria}</b></td><td class="num">${f.aprobado ? dinero(f.aprobado) : h`<span class="muted">Sin límite</span>`}</td><td class="num">${dinero(f.ejecutado)}</td><td class="num">${f.comprometido ? dinero(f.comprometido) : '—'}</td>
          <td class="num ${f.restante < 0 && f.aprobado ? 'neg' : ''}">${f.aprobado ? dinero(f.restante) : '—'}</td>
          <td>${f.porcentaje === null ? '' : h`<div class="barra ${porcentajeClase(f.porcentaje)}"><i style="width:${Math.min(f.porcentaje, 100)}%"></i></div><span class="small muted">${f.porcentaje}%</span>`}</td>
          <td class="acc">${esAdminFlujo ? h`<button class="btn mini" data-fijar="${f.categoriaId}" data-nombre="${f.categoria}" data-monto="${f.aprobado}">${f.aprobado ? 'Cambiar' : 'Fijar límite'}</button>` : ''}</td></tr>`)}</tbody></table></div>
        ${d.sinCategoria ? h`<div style="padding:12px 18px" class="muted small">Además hubo ${dinero(d.sinCategoria)} en categorías archivadas.</div>` : ''}`
        : vacio('No hay categorías de gasto', 'Crea categorías en Configuración.')}</div>`);
    $('#mes').onchange = (e) => { if (e.target.value) { periodo = e.target.value; cargar(); } };
    $('#copiar')?.addEventListener('click', async () => {
      try { const r = await api.post(`/flujos/${flujo.id}/presupuestos/copiar`, { desde: mesAnterior(periodo), hacia: periodo }); aviso(r.copiados ? `Se copiaron ${r.copiados} límites` : 'El mes anterior no tenía límites'); cargar(); } catch (e) { falla(e); }
    });
    $$('[data-fijar]').forEach((b) => b.onclick = async () => {
      if (await formulario({
        titulo: `Límite de ${b.dataset.nombre}`,
        campos: [{ name: 'monto', label: `Presupuesto de ${mesLargo(periodo)} (${flujo.moneda})`, tipo: 'number', paso: '0.01', valor: Number(b.dataset.monto) || '', ayuda: 'Escribe 0 para quitar el límite.' }],
        enviar: (v) => api.put(`/flujos/${flujo.id}/presupuestos`, { periodo, categoriaId: b.dataset.fijar, monto: v.monto === '' ? 0 : v.monto }),
      })) { aviso('Presupuesto guardado'); cargar(); }
    });
  };
  await cargar();
}
