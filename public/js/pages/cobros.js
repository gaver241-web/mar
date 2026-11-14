import { h, html, $, $$, api, dinero, fecha, aviso, falla, formulario, confirmar, hoyISO, diasEntre, crudo, ventana } from '../util.js';
import { cabecera, chip, vacio, opcionesCuentas } from './comun.js';

const METODOS = ['', 'Efectivo', 'Transferencia', 'Yape', 'Plin', 'Depósito', 'Tarjeta', 'Cheque', 'Otro'].map((m) => ({ v: m, t: m || 'Sin especificar' }));

export default async function cobros(ctx) {
  const { main, flujo, meta, puedeEditar } = ctx;
  let tab = ctx.params.get('tipo') || 'cobrar';
  let verPagados = false;
  const cargar = async () => {
    const d = await api.get(`/flujos/${flujo.id}/cobros`);
    const lista = d.items.filter((x) => x.tipo === tab && (verPagados || x.estado !== 'pagado'));
    const r = d.resumen[tab];
    const nombreT = tab === 'cobrar' ? 'cliente' : 'proveedor';
    html(main, h`
      ${cabecera('Cobros y pagos', 'Lo que te deben y lo que debes, con pagos parciales y vencimientos.', puedeEditar ? h`<button class="btn primario" id="nuevo">+ ${tab === 'cobrar' ? 'Nueva cuenta por cobrar' : 'Nueva cuenta por pagar'}</button>` : '')}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <div class="segmentos"><button data-tab="cobrar" class="${tab === 'cobrar' ? 'on t-ingreso' : ''}">Por cobrar</button><button data-tab="pagar" class="${tab === 'pagar' ? 'on t-egreso' : ''}">Por pagar</button></div>
        <label><input type="checkbox" id="pag" ${verPagados ? 'checked' : ''}> Mostrar saldadas</label></div>
      <div class="rejilla g-3 mb"><div class="kpi ${tab === 'cobrar' ? 'ingreso' : 'egreso'}"><div class="et">Pendiente ${tab === 'cobrar' ? 'de cobro' : 'de pago'}</div><div class="val">${dinero(r.pendiente)}</div></div>
        <div class="kpi"><div class="et">De eso, vencido</div><div class="val ${r.vencido > 0 ? 'neg' : ''}">${dinero(r.vencido)}</div></div>
        <div class="kpi"><div class="et">${tab === 'cobrar' ? 'Clientes con saldo' : 'Proveedores con saldo'}</div><div class="val">${new Set(d.items.filter((x) => x.tipo === tab && x.saldo > 0).map((x) => x.tercero)).size}</div></div></div>
      <div class="panel sin-pad">${lista.length ? h`<div class="tabla-wrap"><table class="t"><thead><tr><th>${tab === 'cobrar' ? 'Cliente' : 'Proveedor'}</th><th>Vence</th><th class="num">Monto</th><th>Avance</th><th class="num">Saldo</th><th>Estado</th><th></th></tr></thead><tbody>
        ${lista.map((p) => { const dd = diasEntre(hoyISO(), p.vencimiento); const pct = Math.min(Math.round((p.pagado / p.monto) * 100), 100); return h`<tr>
          <td><b>${p.tercero}</b><br><span class="muted small">${p.concepto || 'Sin detalle'}</span></td>
          <td>${fecha(p.vencimiento)}<br><span class="muted small">${p.estado === 'pagado' ? '' : dd < 0 ? `hace ${-dd} día${dd === -1 ? '' : 's'}` : dd === 0 ? 'hoy' : `en ${dd} día${dd === 1 ? '' : 's'}`}</span></td>
          <td class="num">${dinero(p.monto)}</td>
          <td style="min-width:120px"><div class="barra"><i style="width:${pct}%"></i></div><span class="muted small">${pct}% ${tab === 'cobrar' ? 'cobrado' : 'pagado'}</span></td>
          <td class="num"><b>${dinero(p.saldo)}</b></td><td>${chip(p.estado)}</td>
          <td class="acc">${p.pagos.length ? h`<button class="btn mini" data-pagos="${p.id}">Historial</button> ` : ''}${puedeEditar && p.saldo > 0 ? h`<button class="btn mini primario" data-pagar="${p.id}">${tab === 'cobrar' ? 'Registrar cobro' : 'Registrar pago'}</button> ` : ''}${puedeEditar && !p.pagos.length ? h`<button class="btn mini peligro" data-quitar="${p.id}">Anular</button>` : ''}</td></tr>`; })}
      </tbody></table></div>` : vacio(tab === 'cobrar' ? 'Nadie te debe nada por ahora' : 'No tienes pagos pendientes', puedeEditar ? `Registra una cuenta por ${tab} para controlar su vencimiento.` : '')}</div>`);

    $$('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; cargar(); });
    $('#pag').onchange = (e) => { verPagados = e.target.checked; cargar(); };
    $('#nuevo')?.addEventListener('click', async () => {
      if (await formulario({
        titulo: tab === 'cobrar' ? 'Nueva cuenta por cobrar' : 'Nueva cuenta por pagar',
        campos: [{ name: 'tercero', label: tab === 'cobrar' ? 'Cliente' : 'Proveedor', tipo: 'text' }, { name: 'concepto', label: 'Concepto', tipo: 'text', ph: 'Ej. Factura 001, venta a crédito' },
          { name: 'monto', label: `Monto (${flujo.moneda})`, tipo: 'number', paso: '0.01', mitad: true }, { name: 'vencimiento', label: 'Vence el', tipo: 'date', mitad: true, valor: hoyISO() },
          { name: 'fechaEmision', label: 'Fecha de emisión', tipo: 'date', mitad: true, valor: hoyISO() },
          { name: 'categoriaId', label: 'Categoría al cobrar/pagar', tipo: 'select', mitad: true, opciones: meta.categorias.filter((c) => c.activa && c.tipo === (tab === 'cobrar' ? 'ingreso' : 'egreso')).map((c) => ({ v: c.id, t: c.nombre })) }],
        enviar: (v) => api.post(`/flujos/${flujo.id}/cobros`, { ...v, tipo: tab }),
      })) { aviso('Registrado'); cargar(); }
    });
    $$('[data-pagar]').forEach((b) => b.onclick = async () => {
      const p = d.items.find((x) => x.id === b.dataset.pagar);
      if (await formulario({
        titulo: `${tab === 'cobrar' ? 'Registrar cobro' : 'Registrar pago'} · ${p.tercero}`,
        campos: [{ name: 'monto', label: `Importe (${flujo.moneda})`, tipo: 'number', paso: '0.01', valor: p.saldo, mitad: true, ayuda: `Saldo pendiente: ${dinero(p.saldo)}. Puedes registrar un pago parcial.` },
          { name: 'fecha', label: 'Fecha', tipo: 'date', valor: hoyISO(), mitad: true },
          { name: 'cuentaId', label: tab === 'cobrar' ? 'Entra a la cuenta' : 'Sale de la cuenta', tipo: 'select', opciones: opcionesCuentas(meta.cuentas), mitad: true },
          { name: 'metodoPago', label: 'Método', tipo: 'select', opciones: METODOS, mitad: true }],
        enviar: (v) => api.post(`/flujos/${flujo.id}/cobros/${p.id}/pagos`, v),
      })) { aviso(tab === 'cobrar' ? 'Cobro registrado' : 'Pago registrado'); await ctx.recargarMeta(); cargar(); }
    });
    $$('[data-pagos]').forEach((b) => b.onclick = () => {
      const p = d.items.find((x) => x.id === b.dataset.pagos);
      const cuerpo = document.createElement('div');
      html(cuerpo, h`<table class="t compacta"><thead><tr><th>Fecha</th><th>Cuenta</th><th class="num">Importe</th><th></th></tr></thead><tbody>
        ${p.pagos.map((x) => h`<tr><td>${fecha(x.fecha)}</td><td>${meta.cuentas.find((c) => c.id === x.cuentaId)?.nombre || '—'}</td><td class="num">${dinero(x.monto)}</td>
          <td class="acc">${puedeEditar ? h`<button class="btn mini peligro" data-anular="${x.movimientoId}">Anular</button>` : ''}</td></tr>`)}</tbody></table>
        <p class="muted small">Si anulas un pago, el importe vuelve al saldo pendiente y el movimiento queda anulado en el libro.</p>`);
      ventana({ titulo: `Historial · ${p.tercero}`, cuerpo, acciones: [{ texto: 'Cerrar', alHacer: ({ cerrar }) => cerrar(null) }] });
      $$('[data-anular]', cuerpo).forEach((a) => a.onclick = async () => {
        try { await api.post(`/flujos/${flujo.id}/movimientos/${a.dataset.anular}/anular`, { motivo: 'Pago anulado desde cobros y pagos' }); document.querySelector('.velo')?.remove(); aviso('Pago anulado'); await ctx.recargarMeta(); cargar(); } catch (e) { falla(e); }
      });
    });
    $$('[data-quitar]').forEach((b) => b.onclick = async () => {
      if (!(await confirmar('¿Anular esta cuenta pendiente?', { si: 'Anular', peligro: true }))) return;
      try { await api.del(`/flujos/${flujo.id}/cobros/${b.dataset.quitar}`); aviso('Anulada'); cargar(); } catch (e) { falla(e); }
    });
  };
  await cargar();
}
