import { h, html, $, $$, api, qs, fecha, dinero, aviso, falla, confirmar, formulario, hoyISO, crudo, ventana } from '../util.js';
import { cabecera, chip, monto, vacio, opcionesCuentas } from './comun.js';
import { formMovimiento } from './formMov.js';

export default async function movimientos(ctx) {
  const { main, flujo, meta, puedeEditar, params } = ctx;
  const f = {
    desde: params.get('desde') || '', hasta: params.get('hasta') || '', tipo: params.get('tipo') || '', cuentaId: params.get('cuentaId') || '',
    categoriaId: '', estado: params.get('estado') || '', q: '', pagina: 1,
  };
  const url = () => `/flujos/${flujo.id}/movimientos${qs(f)}`;

  const cargar = async () => {
    const d = await api.get(url());
    const paginas = Math.max(Math.ceil(d.total / d.limite), 1);
    const cuentaSel = f.cuentaId ? meta.cuentas.find((c) => c.id === f.cuentaId) : null;
    html(main, h`
      ${cabecera('Libro de movimientos', cuentaSel ? `Cuenta: ${cuentaSel.nombre}` : 'Todo lo que entró, salió o se movió entre cuentas', puedeEditar ? h`<button class="btn primario" id="nuevo">+ Nuevo movimiento</button>` : '')}
      <div class="filtros">
        <div class="campo"><label for="f-desde">Desde</label><input type="date" id="f-desde" value="${f.desde}"></div>
        <div class="campo"><label for="f-hasta">Hasta</label><input type="date" id="f-hasta" value="${f.hasta}"></div>
        <div class="campo"><label for="f-tipo">Tipo</label><select id="f-tipo">${[['', 'Todos'], ['ingreso', 'Ingresos'], ['egreso', 'Egresos'], ['transferencia', 'Transferencias']].map(([v, t]) => h`<option value="${v}" ${f.tipo === v ? crudo('selected') : ''}>${t}</option>`)}</select></div>
        <div class="campo"><label for="f-cuenta">Cuenta</label><select id="f-cuenta"><option value="">Todas</option>${meta.cuentas.map((c) => h`<option value="${c.id}" ${f.cuentaId === c.id ? crudo('selected') : ''}>${c.nombre}</option>`)}</select></div>
        <div class="campo"><label for="f-cat">Categoría</label><select id="f-cat"><option value="">Todas</option>${meta.categorias.map((c) => h`<option value="${c.id}" ${f.categoriaId === c.id ? crudo('selected') : ''}>${c.nombre} (${c.tipo})</option>`)}</select></div>
        <div class="campo"><label for="f-estado">Estado</label><select id="f-estado">${[['', 'Todos'], ['confirmado', 'Confirmados'], ['programado', 'Programados'], ['anulado', 'Anulados']].map(([v, t]) => h`<option value="${v}" ${f.estado === v ? crudo('selected') : ''}>${t}</option>`)}</select></div>
        <div class="campo ancho"><label for="f-q">Buscar</label><input type="text" id="f-q" value="${f.q}" placeholder="Cliente, nota, comprobante…"></div>
      </div>
      <div class="panel sin-pad">
        <div style="display:flex;gap:28px;padding:14px 18px;border-bottom:1px solid var(--line)">
          <span>Ingresos <b class="pos">${dinero(d.totales.ingresos)}</b></span><span>Egresos <b class="neg">${dinero(d.totales.egresos)}</b></span>
          <span>Neto <b class="${d.totales.ingresos - d.totales.egresos < 0 ? 'neg' : 'pos'}">${dinero(d.totales.ingresos - d.totales.egresos)}</b></span>
          <span class="muted small" style="margin-left:auto;align-self:center">Solo cuentan los movimientos confirmados; las transferencias no son ingreso ni gasto.</span></div>
        ${d.items.length ? h`<div class="tabla-wrap"><table class="t"><thead><tr><th>Fecha</th><th>Detalle</th><th>Cuenta</th><th>Estado</th><th class="num">Importe</th><th class="num">Saldo</th><th></th></tr></thead><tbody>
          ${d.items.map((m) => h`<tr class="${m.estado === 'anulado' ? 'anulado' : ''}">
            <td>${fecha(m.fecha)}</td>
            <td>${chip(m.tipo)} ${m.tipo === 'transferencia' ? '' : h`<b>${m.tercero || m.categoria}</b>`}<br>
              <span class="muted small">${m.tipo === 'transferencia' ? `${m.cuenta} → ${m.cuentaDestino}` : [m.categoria, m.metodoPago, m.comprobante].filter(Boolean).join(' · ')}${m.notas ? ` — ${m.notas}` : ''}${m.estado === 'anulado' ? ` · Anulado por ${m.anuladoPor}: ${m.motivoAnulacion}` : ''}</span></td>
            <td>${m.tipo === 'transferencia' ? m.cuenta : m.cuenta}</td>
            <td class="est">${chip(m.estado)}</td>
            <td class="num">${monto(m.monto, m.tipo)}</td>
            <td class="num">${m.saldo === null ? '—' : dinero(m.saldo)}</td>
            <td class="acc">${puedeEditar ? (m.estado === 'confirmado' ? h`<button class="btn mini" data-corregir="${m.id}">Corregir</button> <button class="btn mini peligro" data-anular="${m.id}">Anular</button>`
              : m.estado === 'programado' ? h`<button class="btn mini primario" data-confirmar="${m.id}">Confirmar</button> <button class="btn mini peligro" data-eliminar="${m.id}">Eliminar</button>` : '') : ''}</td></tr>`)}
        </tbody></table></div>
        <div class="paginacion"><span>${d.total} movimiento${d.total === 1 ? '' : 's'}</span><span><button class="btn mini" id="ant" ${f.pagina <= 1 ? 'disabled' : ''}>Anterior</button> Página ${f.pagina} de ${paginas} <button class="btn mini" id="sig" ${f.pagina >= paginas ? 'disabled' : ''}>Siguiente</button></span></div>`
          : vacio('No hay movimientos con estos filtros', 'Prueba con otras fechas o quita algún filtro.')}
      </div>`);

    const enlazar = (id, clave, esperar = false) => {
      const el = $(id); if (!el) return;
      let t;
      const aplicar = () => { f[clave] = el.value; f.pagina = 1; cargar(); };
      el.addEventListener(esperar ? 'input' : 'change', () => { clearTimeout(t); t = setTimeout(aplicar, esperar ? 350 : 0); });
    };
    [['#f-desde', 'desde'], ['#f-hasta', 'hasta'], ['#f-tipo', 'tipo'], ['#f-cuenta', 'cuentaId'], ['#f-cat', 'categoriaId'], ['#f-estado', 'estado']].forEach(([i, c]) => enlazar(i, c));
    enlazar('#f-q', 'q', true);
    const q = $('#f-q'); if (q && document.activeElement !== q && f.q) { q.focus(); q.setSelectionRange(f.q.length, f.q.length); }
    $('#ant')?.addEventListener('click', () => { f.pagina--; cargar(); });
    $('#sig')?.addEventListener('click', () => { f.pagina++; cargar(); });
    $('#nuevo')?.addEventListener('click', async () => { if (await formMovimiento(ctx, 'ingreso')) { await ctx.recargarMeta(); cargar(); } });

    const base = `/flujos/${flujo.id}/movimientos`;
    $$('[data-anular]').forEach((b) => b.onclick = async () => {
      const ok = await formulario({
        titulo: 'Anular movimiento', textoGuardar: 'Anular',
        campos: [{ name: 'motivo', label: 'Motivo de la anulación', tipo: 'text', ayuda: 'El movimiento queda en el libro, tachado, con tu nombre y este motivo.' }],
        enviar: (v) => api.post(`${base}/${b.dataset.anular}/anular`, v),
      });
      if (ok) { aviso('Movimiento anulado'); await ctx.recargarMeta(); cargar(); }
    });
    $$('[data-confirmar]').forEach((b) => b.onclick = async () => {
      try { await api.post(`${base}/${b.dataset.confirmar}/confirmar`, {}); aviso('Movimiento confirmado'); await ctx.recargarMeta(); cargar(); } catch (e) { falla(e); }
    });
    $$('[data-eliminar]').forEach((b) => b.onclick = async () => {
      if (!(await confirmar('¿Eliminar este movimiento programado?', { si: 'Eliminar', peligro: true }))) return;
      try { await api.del(`${base}/${b.dataset.eliminar}`); aviso('Movimiento eliminado'); cargar(); } catch (e) { falla(e); }
    });
    $$('[data-corregir]').forEach((b) => b.onclick = async () => {
      const m = d.items.find((x) => x.id === b.dataset.corregir);
      const previo = { ...m, cuentaId: m.cuentaId, cuentaDestinoId: m.cuentaDestinoId, categoriaId: m.categoriaId };
      if (await formMovimiento(ctx, m.tipo, previo)) { await ctx.recargarMeta(); cargar(); }
    });
  };
  await cargar();
}
