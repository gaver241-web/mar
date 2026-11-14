import { h, html, $, $$, api, dinero, aviso, formulario, confirmar, falla } from '../util.js';
import { cabecera, chip, vacio } from './comun.js';
import { formMovimiento } from './formMov.js';

const TIPOS = [{ v: 'caja', t: 'Caja' }, { v: 'banco', t: 'Banco' }, { v: 'billetera', t: 'Billetera digital' }];

export default async function cuentas(ctx) {
  const { main, flujo, esAdminFlujo, puedeEditar } = ctx;
  const cargar = async () => {
    const lista = await api.get(`/flujos/${flujo.id}/cuentas`);
    const activas = lista.filter((c) => c.activa);
    const total = activas.reduce((a, c) => a + c.saldo, 0);
    html(main, h`
      ${cabecera('Cuentas', 'Cajas, bancos y billeteras. El saldo es: saldo inicial + entradas − salidas.', h`
        ${puedeEditar ? h`<button class="btn" id="transf">Transferir entre cuentas</button>` : ''}${esAdminFlujo ? h`<button class="btn primario" id="nueva">+ Nueva cuenta</button>` : ''}`)}
      <div class="panel sin-pad">${lista.length ? h`<div class="tabla-wrap"><table class="t"><thead><tr><th>Cuenta</th><th>Tipo</th><th class="num">Saldo inicial</th><th class="num">Ingresos</th><th class="num">Egresos</th><th class="num">Transf. netas</th><th class="num">Saldo</th><th></th></tr></thead><tbody>
        ${lista.map((c) => h`<tr class="${c.activa ? '' : 'anulado'}"><td><a href="${ctx.ruta('movimientos', 'cuentaId=' + c.id)}"><b>${c.nombre}</b></a> ${c.activa ? '' : chip('archivada', 'anulado')}</td>
          <td>${TIPOS.find((t) => t.v === c.tipo)?.t}</td><td class="num">${dinero(c.saldoInicial)}</td><td class="num pos">${dinero(c.ingresos)}</td><td class="num neg">${dinero(c.egresos)}</td>
          <td class="num">${dinero(c.transferenciasEntrada - c.transferenciasSalida)}</td><td class="num"><b class="${c.saldo < 0 ? 'neg' : ''}">${dinero(c.saldo)}</b></td>
          <td class="acc">${esAdminFlujo ? h`<button class="btn mini" data-editar="${c.id}">Editar</button> <button class="btn mini" data-archivar="${c.id}">${c.activa ? 'Archivar' : 'Reactivar'}</button>` : ''}</td></tr>`)}
        <tr class="total"><td colspan="6">Saldo total de cuentas activas</td><td class="num">${dinero(total)}</td><td></td></tr></tbody></table></div>`
        : vacio('No hay cuentas', 'Crea una caja o un banco para empezar.')}</div>`);
    $('#nueva')?.addEventListener('click', async () => {
      if (await formulario({
        titulo: 'Nueva cuenta',
        campos: [{ name: 'nombre', label: 'Nombre', tipo: 'text', ph: 'Ej. BCP soles, Caja chica, Yape' }, { name: 'tipo', label: 'Tipo', tipo: 'select', opciones: TIPOS, mitad: true },
          { name: 'saldoInicial', label: `Saldo inicial (${flujo.moneda})`, tipo: 'number', paso: '0.01', valor: 0, mitad: true, ayuda: 'Lo que ya había al empezar a usar la app.' }],
        enviar: (v) => api.post(`/flujos/${flujo.id}/cuentas`, v),
      })) { aviso('Cuenta creada'); await ctx.recargarMeta(); cargar(); }
    });
    $('#transf')?.addEventListener('click', async () => { if (await formMovimiento(ctx, 'transferencia')) { await ctx.recargarMeta(); cargar(); } });
    $$('[data-editar]').forEach((b) => b.onclick = async () => {
      const c = lista.find((x) => x.id === b.dataset.editar);
      if (await formulario({
        titulo: `Editar ${c.nombre}`,
        campos: [{ name: 'nombre', label: 'Nombre', tipo: 'text' }, { name: 'tipo', label: 'Tipo', tipo: 'select', opciones: TIPOS, mitad: true },
          { name: 'saldoInicial', label: 'Saldo inicial', tipo: 'number', paso: '0.01', mitad: true, ayuda: 'Cambiarlo ajusta el saldo actual.' }],
        valores: c, enviar: (v) => api.put(`/flujos/${flujo.id}/cuentas/${c.id}`, v),
      })) { aviso('Cuenta actualizada'); await ctx.recargarMeta(); cargar(); }
    });
    $$('[data-archivar]').forEach((b) => b.onclick = async () => {
      const c = lista.find((x) => x.id === b.dataset.archivar);
      if (c.activa && !(await confirmar(`¿Archivar "${c.nombre}"? Ya no se podrá usar en movimientos nuevos, pero su historial se conserva.`, { si: 'Archivar' }))) return;
      try { await api.put(`/flujos/${flujo.id}/cuentas/${c.id}`, { activa: !c.activa }); await ctx.recargarMeta(); cargar(); } catch (e) { falla(e); }
    });
  };
  await cargar();
}
