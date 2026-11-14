import { h, html, $, $$, ventana, camposHTML, leerCampos, api, aviso, hoyISO } from '../util.js';
import { opcionesCuentas, opcionesCategorias } from './comun.js';

const METODOS = ['', 'Efectivo', 'Transferencia', 'Yape', 'Plin', 'Depósito', 'Tarjeta', 'Cheque', 'Otro'].map((m) => ({ v: m, t: m || 'Sin especificar' }));

// Ventana para registrar ingreso, egreso o transferencia. `previo` permite corregir un movimiento.
export async function formMovimiento(ctx, tipoInicial = 'ingreso', previo = null) {
  const { meta, flujo } = ctx;
  let tipo = tipoInicial;
  const cuerpo = document.createElement('div');
  const valores = previo || { fecha: hoyISO() };

  const pintar = (vals) => {
    const cuentas = opcionesCuentas(meta.cuentas);
    const campos = [
      { name: 'fecha', label: 'Fecha', tipo: 'date', mitad: true },
      { name: 'monto', label: `Importe (${flujo.moneda})`, tipo: 'number', paso: '0.01', min: 0, mitad: true, ph: '0.00' },
      { name: 'cuentaId', label: tipo === 'transferencia' ? 'Sale de' : tipo === 'ingreso' ? 'Entra a' : 'Sale de', tipo: 'select', opciones: cuentas, mitad: true },
    ];
    if (tipo === 'transferencia') campos.push({ name: 'cuentaDestinoId', label: 'Llega a', tipo: 'select', opciones: cuentas, mitad: true });
    else campos.push({ name: 'categoriaId', label: 'Categoría', tipo: 'select', opciones: opcionesCategorias(meta.categorias, tipo), mitad: true });
    if (tipo !== 'transferencia') campos.push(
      { name: 'tercero', label: tipo === 'ingreso' ? 'Cliente o fuente' : 'Proveedor o destino', tipo: 'text', mitad: true, ph: 'Opcional' },
      { name: 'metodoPago', label: 'Método de pago', tipo: 'select', opciones: METODOS, mitad: true },
      { name: 'comprobante', label: 'Nº de comprobante', tipo: 'text', ph: 'Boleta, factura, operación…', mitad: true },
    );
    campos.push({ name: 'notas', label: 'Notas', tipo: 'textarea' });
    campos.push({ name: 'programado', label: 'Programar (todavía no ocurre)', tipo: 'check', ayuda: 'Queda como estimado: cuenta en la proyección pero no en el saldo hasta que lo confirmes.' });
    html(cuerpo, h`<div class="segmentos" style="margin-bottom:16px">
      ${['ingreso', 'egreso', 'transferencia'].map((t) => h`<button type="button" data-tipo="${t}" class="${tipo === t ? 'on t-' + t : ''}">${{ ingreso: 'Ingreso', egreso: 'Egreso', transferencia: 'Transferencia' }[t]}</button>`)}
    </div>${camposHTML(campos, vals)}`);
    $$('[data-tipo]', cuerpo).forEach((b) => {
      b.onclick = () => { const actual = leerCampos(cuerpo); tipo = b.dataset.tipo; delete actual.categoriaId; pintar(actual); };
    });
  };
  pintar(valores);
  setTimeout(() => $('#f_monto', cuerpo)?.focus(), 0);

  return ventana({
    titulo: previo ? 'Corregir movimiento' : 'Nuevo movimiento', cuerpo,
    acciones: [
      { texto: 'Cancelar', alHacer: ({ cerrar }) => cerrar(null) },
      {
        texto: previo ? 'Guardar corrección' : 'Guardar', clase: 'primario',
        alHacer: async ({ cerrar, boton }) => {
          const err = $('[data-error]', cuerpo); err.classList.add('oculto');
          const v = leerCampos(cuerpo);
          if (!v.monto || Number(v.monto) <= 0) { err.textContent = 'Escribe un importe mayor que cero'; err.classList.remove('oculto'); return; }
          boton.disabled = true;
          try {
            if (previo) {
              const motivo = `Corrección del ${previo.fecha} por ${previo.monto}`;
              await api.post(`/flujos/${flujo.id}/movimientos/${previo.id}/anular`, { motivo });
            }
            const r = await api.post(`/flujos/${flujo.id}/movimientos`, { ...v, tipo, estado: v.programado ? 'programado' : undefined });
            aviso(r.estado === 'programado' ? 'Movimiento programado' : previo ? 'Movimiento corregido' : 'Movimiento registrado');
            cerrar(true);
          } catch (e) { err.textContent = e.message; err.classList.remove('oculto'); boton.disabled = false; }
        },
      },
    ],
  });
}
