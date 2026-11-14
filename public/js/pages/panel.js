import { h, html, $, api, dinero, fecha, mesLargo, graficoMensual, diasEntre, hoyISO, crudo } from '../util.js';
import { cabecera, chip, monto, vacio } from './comun.js';
import { formMovimiento } from './formMov.js';

const variacion = (act, ant) => {
  if (!ant) return '';
  const p = Math.round(((act - ant) / Math.abs(ant)) * 100);
  return `${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}% frente al mes anterior`;
};

export default async function panel(ctx) {
  const { main, flujo, puedeEditar } = ctx;
  let periodo = ctx.params.get('periodo') || hoyISO().slice(0, 7);
  const cargar = async () => {
    const d = await api.get(`/flujos/${flujo.id}/resumen?periodo=${periodo}`);
    const neg = d.saldoTotal < 0;
    html(main, h`
      ${cabecera('Panel', `${flujo.nombre} · ${mesLargo(periodo)}`, h`
        <input type="month" id="mes" value="${periodo}" style="width:auto" aria-label="Mes">
        ${puedeEditar ? h`<button class="btn ingreso" data-nuevo="ingreso">+ Ingreso</button><button class="btn egreso" data-nuevo="egreso">+ Egreso</button><button class="btn" data-nuevo="transferencia">Transferir</button>` : ''}`)}

      ${d.banquito ? h`<div class="panel mb" style="display:flex;justify-content:space-between;align-items:center;gap:24px">
        <div><div class="muted small">Banquito · semana ${d.banquito.semana} (${fecha(d.banquito.fecha)})</div>
        <div style="font-family:var(--f-display);font-size:22px;margin-top:4px">${dinero(d.banquito.enCaja)} <span class="muted small" style="font-family:var(--f-body)">en caja</span></div></div>
        <div style="display:flex;gap:36px"><div><div class="muted small">Ahorrado</div><b>${dinero(d.banquito.ahorro)}</b></div>
        <div><div class="muted small">Préstamos por cobrar</div><b>${dinero(d.banquito.prestamosPorCobrar)}</b></div>
        <div><div class="muted small">Caja chica</div><b>${dinero(d.banquito.cajaChica)}</b></div></div>
        <a class="btn" href="${ctx.ruta('balance')}">Ver balance</a></div>` : ''}

      <div class="rejilla mb" style="grid-template-columns:1.25fr 1fr 1fr 1fr">
        <div class="saldo-hero ${neg ? 'neg' : ''}"><div class="et">Saldo disponible</div><div class="val">${dinero(d.saldoTotal)}</div><div class="det">En ${d.cuentas.length} cuenta${d.cuentas.length === 1 ? '' : 's'}</div></div>
        <div class="kpi ingreso"><div class="et">Ingresos del mes</div><div class="val">${dinero(d.mes.ingresos)}</div><div class="det">${variacion(d.mes.ingresos, d.mesAnterior.ingresos) || 'Sin mes anterior para comparar'}</div></div>
        <div class="kpi egreso"><div class="et">Egresos del mes</div><div class="val">${dinero(d.mes.egresos)}</div><div class="det">${variacion(d.mes.egresos, d.mesAnterior.egresos) || 'Sin mes anterior para comparar'}</div></div>
        <div class="kpi"><div class="et">Flujo neto</div><div class="val ${d.mes.neto < 0 ? 'neg' : ''}">${dinero(d.mes.neto)}</div><div class="det">Entradas menos salidas del mes</div></div>
      </div>

      <div class="rejilla g-2-1 mb">
        <div class="panel"><div class="tit"><h3>Ingresos, egresos y saldo</h3>
          <div class="leyenda"><span><b style="background:#00B8D4"></b>Ingresos</span><span><b style="background:#D81B9E"></b>Egresos</span><span><b style="background:#161A33;border-radius:50%"></b>Saldo al cierre</span></div></div>
          <div class="grafico">${graficoMensual(d.serie)}</div></div>
        <div class="panel"><div class="tit"><h3>Para revisar</h3></div>
          ${d.alertas.length ? d.alertas.map((a) => h`<a class="alerta ${a.nivel}" href="${ctx.ruta(a.ruta)}"><i></i><span>${a.texto}</span></a>`)
            : h`<p class="muted" style="margin:0">Todo en orden: no hay vencimientos ni alertas.</p>`}</div>
      </div>

      <div class="rejilla g-3 mb">
        <div class="panel"><div class="tit"><h3>Cuentas</h3><a href="${ctx.ruta('cuentas')}" class="small">Ver todas</a></div>
          <ul class="lista-simple">${d.cuentas.map((c) => h`<li><span>${c.nombre}</span><b class="${c.saldo < 0 ? 'neg' : ''}">${dinero(c.saldo)}</b></li>`)}</ul></div>
        <div class="panel"><div class="tit"><h3>Cobros y pagos</h3><a href="${ctx.ruta('cobros')}" class="small">Ver detalle</a></div>
          <ul class="lista-simple">
            <li><span>Por cobrar</span><b class="pos">${dinero(d.porCobrar.total)}</b></li>
            <li><span class="muted">de eso, vencido</span><span>${dinero(d.porCobrar.vencido)}</span></li>
            <li><span>Por pagar</span><b class="neg">${dinero(d.porPagar.total)}</b></li>
            <li><span class="muted">de eso, vencido</span><span>${dinero(d.porPagar.vencido)}</span></li></ul></div>
        <div class="panel"><div class="tit"><h3>Próximos 7 días</h3></div>
          ${d.proximos.length ? h`<ul class="lista-simple">${d.proximos.map((p) => { const dd = diasEntre(hoyISO(), p.vencimiento); return h`<li><span>${p.tercero}<br><span class="muted small">${p.tipo === 'cobrar' ? 'Cobrar' : 'Pagar'} · ${dd < 0 ? `venció hace ${-dd} d` : dd === 0 ? 'vence hoy' : `en ${dd} d`}</span></span><b>${dinero(p.saldo)}</b></li>`; })}</ul>`
            : h`<p class="muted" style="margin:0">No hay vencimientos en los próximos 7 días.</p>`}</div>
      </div>

      <div class="panel sin-pad"><div style="padding:18px 22px 0"><div class="tit"><h3>Movimientos recientes</h3><a href="${ctx.ruta('movimientos')}" class="small">Abrir libro de movimientos</a></div></div>
        ${d.recientes.length ? h`<div class="tabla-wrap"><table class="t"><thead><tr><th>Fecha</th><th>Detalle</th><th>Cuenta</th><th>Estado</th><th class="num">Importe</th></tr></thead><tbody>
          ${d.recientes.map((m) => h`<tr><td>${fecha(m.fecha)}</td><td>${m.tercero || m.categoria || (m.tipo === 'transferencia' ? 'Transferencia' : '—')}<br><span class="muted small">${m.categoria || ''}</span></td><td>${m.cuenta}</td><td>${chip(m.estado)}</td><td class="num">${monto(m.monto, m.tipo)}</td></tr>`)}</tbody></table></div>`
          : vacio('Aún no hay movimientos', puedeEditar ? 'Registra tu primer ingreso o egreso para empezar.' : 'Cuando se registren movimientos aparecerán aquí.')}
      </div>`);
    $('#mes').onchange = (e) => { if (e.target.value) { periodo = e.target.value; cargar(); } };
    main.querySelectorAll('[data-nuevo]').forEach((b) => { b.onclick = async () => { if (await formMovimiento(ctx, b.dataset.nuevo)) { await ctx.recargarMeta(); cargar(); } }; });
  };
  await cargar();
}
