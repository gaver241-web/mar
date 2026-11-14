import { h, html, $, $$, api, qs, dinero, fecha, descargar, falla, graficoMensual, hoyISO, crudo } from '../util.js';
import { cabecera, chip, vacio } from './comun.js';

export default async function reportes(ctx) {
  const { main, flujo, meta } = ctx;
  const hoy = hoyISO();
  const f = { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy, cuentaId: '' };
  const cargar = async () => {
    const d = await api.get(`/flujos/${flujo.id}/reportes${qs(f)}`);
    const ing = d.porCategoria.filter((x) => x.tipo === 'ingreso'), egr = d.porCategoria.filter((x) => x.tipo === 'egreso');
    const tabla = (lista, tot, clase) => lista.length ? h`<table class="t compacta"><tbody>${lista.map((x) => h`<tr><td>${x.categoria}<br><span class="muted small">${x.cantidad} movimiento${x.cantidad === 1 ? '' : 's'}</span></td>
      <td class="num">${dinero(x.total)}</td><td class="num muted">${tot ? Math.round((x.total / tot) * 100) : 0}%</td></tr>`)}</tbody></table>` : h`<p class="muted">Sin movimientos.</p>`;
    html(main, h`
      ${cabecera('Reportes', `${flujo.nombre} · del ${fecha(d.desde)} al ${fecha(d.hasta)}`, h`
        <button class="btn" id="xlsx">Descargar Excel</button><button class="btn" id="csv">Descargar CSV</button><button class="btn primario" id="imprimir">Imprimir o guardar PDF</button>`)}
      <div class="filtros">
        <div class="campo"><label for="r-d">Desde</label><input type="date" id="r-d" value="${f.desde}"></div>
        <div class="campo"><label for="r-h">Hasta</label><input type="date" id="r-h" value="${f.hasta}"></div>
        <div class="campo"><label for="r-c">Cuenta</label><select id="r-c"><option value="">Todas</option>${meta.cuentas.map((c) => h`<option value="${c.id}" ${f.cuentaId === c.id ? crudo('selected') : ''}>${c.nombre}</option>`)}</select></div>
      </div>
      <div class="rejilla g-4 mb"><div class="kpi ingreso"><div class="et">Ingresos</div><div class="val">${dinero(d.resumen.ingresos)}</div></div>
        <div class="kpi egreso"><div class="et">Egresos</div><div class="val">${dinero(d.resumen.egresos)}</div></div>
        <div class="kpi"><div class="et">Flujo neto</div><div class="val ${d.resumen.neto < 0 ? 'neg' : ''}">${dinero(d.resumen.neto)}</div></div>
        <div class="kpi"><div class="et">Movimientos</div><div class="val">${d.resumen.movimientos}</div></div></div>
      ${d.porMes.length ? h`<div class="panel mb"><div class="tit"><h3>Por mes</h3></div><div class="grafico">${graficoMensual(d.porMes.map((m) => ({ ...m, saldo: m.neto })), { alto: 240 })}</div>
        <p class="muted small" style="margin:6px 0 0">La línea muestra el flujo neto de cada mes.</p></div>` : ''}
      <div class="rejilla g-1-1 mb"><div class="panel"><div class="tit"><h3>Ingresos por categoría</h3></div>${tabla(ing, d.resumen.ingresos)}</div>
        <div class="panel"><div class="tit"><h3>Egresos por categoría</h3></div>${tabla(egr, d.resumen.egresos)}</div></div>
      <div class="panel sin-pad"><div style="padding:18px 22px 0"><h3 style="margin-bottom:12px">Por cuenta</h3></div><div class="tabla-wrap"><table class="t"><thead><tr><th>Cuenta</th><th class="num">Saldo inicial</th><th class="num">Entradas</th><th class="num">Salidas</th><th class="num">Saldo final</th></tr></thead><tbody>
        ${d.porCuenta.map((c) => h`<tr><td>${c.cuenta}</td><td class="num">${dinero(c.saldoInicial)}</td><td class="num pos">${dinero(c.entradas)}</td><td class="num neg">${dinero(c.salidas)}</td><td class="num"><b>${dinero(c.saldoFinal)}</b></td></tr>`)}</tbody></table></div>
        <p class="muted small" style="padding:0 22px 14px;margin:0">Entradas y salidas incluyen transferencias entre cuentas; por eso no coinciden con ingresos y egresos.</p></div>`);
    [['#r-d', 'desde'], ['#r-h', 'hasta'], ['#r-c', 'cuentaId']].forEach(([i, k]) => { $(i).onchange = (e) => { f[k] = e.target.value; cargar(); }; });
    const bajar = (formato) => async () => { try { await descargar(`/flujos/${flujo.id}/reportes/exportar${qs({ ...f, formato })}`, `reporte.${formato}`); } catch (e) { falla(e); } };
    $('#xlsx').onclick = bajar('xlsx'); $('#csv').onclick = bajar('csv');
    $('#imprimir').onclick = () => window.print();
  };
  await cargar();
}
