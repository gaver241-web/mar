import { h, html, $, $$, api, dinero, fecha, graficoLinea, crudo } from '../util.js';
import { cabecera, chip, vacio } from './comun.js';

export default async function proyeccion(ctx) {
  const { main, flujo } = ctx;
  let dias = 90, pct = 100;
  const cargar = async () => {
    const d = await api.get(`/flujos/${flujo.id}/proyeccion?dias=${dias}&pctCobros=${pct}`);
    html(main, h`
      ${cabecera('Flujo proyectado', `Del ${fecha(d.hoy)} al ${fecha(d.limite)}: saldo de hoy, movimientos programados y vencimientos de cobros y pagos.`)}
      <div class="filtros">
        <div class="campo"><label>Horizonte</label><div class="segmentos">${[30, 60, 90, 180].map((x) => h`<button data-dias="${x}" class="${dias === x ? 'on' : ''}">${x} días</button>`)}</div></div>
        <div class="campo"><label>Escenario de cobros</label><div class="segmentos">${[[100, 'Todo llega a tiempo'], [80, 'Llega el 80%'], [60, 'Llega el 60%']].map(([x, t]) => h`<button data-pct="${x}" class="${pct === x ? 'on' : ''}">${t}</button>`)}</div></div>
      </div>
      ${d.primerDeficit ? h`<div class="aviso alto">Con este escenario el saldo queda negativo desde el ${fecha(d.primerDeficit)}. El punto más bajo es ${dinero(d.minimo.saldo)} el ${fecha(d.minimo.fecha)}.</div>`
        : h`<div class="aviso info">En este escenario el saldo no baja de cero. El punto más bajo es ${dinero(d.minimo.saldo)} el ${fecha(d.minimo.fecha)}.</div>`}
      <div class="rejilla g-3 mb"><div class="kpi"><div class="et">Saldo hoy</div><div class="val">${dinero(d.saldoActual)}</div></div>
        <div class="kpi"><div class="et">Saldo más bajo</div><div class="val ${d.minimo.saldo < 0 ? 'neg' : ''}">${dinero(d.minimo.saldo)}</div><div class="det">${fecha(d.minimo.fecha)}</div></div>
        <div class="kpi"><div class="et">Saldo al ${fecha(d.limite)}</div><div class="val ${d.saldoFinal < 0 ? 'neg' : ''}">${dinero(d.saldoFinal)}</div></div></div>
      <div class="panel mb"><div class="tit"><h3>Saldo proyectado, semana a semana</h3></div><div class="grafico">${graficoLinea(d.serie)}</div></div>
      <div class="panel sin-pad"><div style="padding:18px 22px 0"><h3 style="margin-bottom:12px">Movimientos considerados</h3></div>
        ${d.eventos.length ? h`<div class="tabla-wrap"><table class="t"><thead><tr><th>Fecha</th><th>Origen</th><th>Detalle</th><th class="num">Importe</th><th class="num">Saldo proyectado</th></tr></thead><tbody>
          ${d.eventos.map((e) => h`<tr><td>${fecha(e.fecha)}${e.atrasado ? h` <span class="chip pendiente">atrasado</span>` : ''}</td><td>${e.origen}</td><td>${e.detalle}</td><td class="num ${e.importe < 0 ? 'neg' : 'pos'}">${dinero(e.importe)}</td><td class="num ${e.saldo < 0 ? 'neg' : ''}">${dinero(e.saldo)}</td></tr>`)}</tbody></table></div>`
          : vacio('No hay movimientos futuros', 'Programa ingresos y egresos, o registra cuentas por cobrar y pagar con vencimiento, para ver la proyección.')}</div>`);
    $$('[data-dias]').forEach((b) => b.onclick = () => { dias = Number(b.dataset.dias); cargar(); });
    $$('[data-pct]').forEach((b) => b.onclick = () => { pct = Number(b.dataset.pct); cargar(); });
  };
  await cargar();
}
