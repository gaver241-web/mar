import { h, crudo, dinero, fecha, esc } from '../util.js';

export const cabecera = (titulo, sub, acciones) => h`<div class="cabecera"><div><h1>${titulo}</h1>${sub ? h`<div class="sub">${sub}</div>` : ''}</div><div class="acciones">${acciones || ''}</div></div>`;
export const chip = (texto, clase) => h`<span class="chip ${clase || texto}">${texto}</span>`;
export const opcionesCuentas = (cuentas, soloActivas = true) => cuentas.filter((c) => !soloActivas || c.activa).map((c) => ({ v: c.id, t: c.nombre }));
export const opcionesCategorias = (cats, tipo) => cats.filter((c) => c.activa && c.tipo === tipo).map((c) => ({ v: c.id, t: c.nombre }));
export const monto = (m, tipo) => h`<span class="${tipo === 'ingreso' ? 'pos' : tipo === 'egreso' ? 'neg' : ''}">${tipo === 'ingreso' ? '+' : tipo === 'egreso' ? '−' : ''}${dinero(m, true)}</span>`;
export const vacio = (titulo, texto, boton) => h`<div class="vacio"><h3>${titulo}</h3><p>${texto}</p>${boton || ''}</div>`;
export const porcentajeClase = (p) => (p === null ? '' : p >= 100 ? 'alto' : p >= 85 ? 'medio' : '');
export { h, crudo, esc, fecha };
