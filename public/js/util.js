// ---------- Plantillas seguras: todo lo que se interpola se escapa ----------
class Crudo { constructor(s) { this.s = s; } }
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const val = (v) => (v instanceof Crudo ? v.s : Array.isArray(v) ? v.map(val).join('') : esc(v));
export function h(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += val(vals[i]); });
  return new Crudo(out);
}
export const crudo = (s) => new Crudo(s);
export const html = (el, plantilla) => { el.innerHTML = plantilla instanceof Crudo ? plantilla.s : esc(plantilla); return el; };

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

// ---------- Formatos ----------
let moneda = 'S/';
export const fijarMoneda = (m) => { moneda = m || 'S/'; };
export const dinero = (n, sinSimbolo) => {
  const v = Number(n) || 0;
  const t = Math.abs(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? '−' : ''}${sinSimbolo ? '' : moneda + ' '}${t}`;
};
export const numero = (n) => (Number(n) || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 });
export const fecha = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const mesLargo = (p) => `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
export const mesCorto = (p) => MESES[Number(p.slice(5, 7)) - 1].slice(0, 3);
export const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
export const diasEntre = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Comunicación con el servidor ----------
export class ErrorApi extends Error { constructor(msg, status) { super(msg); this.status = status; } }
async function pedir(metodo, ruta, cuerpo, cabeceras = {}) {
  const raw = cuerpo instanceof ArrayBuffer || cuerpo instanceof Blob;
  const r = await fetch('/api' + ruta, {
    method: metodo,
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'fetch', ...(cuerpo && !raw ? { 'Content-Type': 'application/json' } : {}), ...cabeceras },
    body: cuerpo ? (raw ? cuerpo : JSON.stringify(cuerpo)) : undefined,
  });
  let datos = null;
  try { datos = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok) {
    if (r.status === 401 && !ruta.startsWith('/auth/login')) window.dispatchEvent(new CustomEvent('sesion-vencida'));
    throw new ErrorApi(datos?.error || 'No se pudo completar la acción', r.status);
  }
  return datos;
}
export const api = {
  get: (r) => pedir('GET', r),
  post: (r, c, cab) => pedir('POST', r, c ?? {}, cab),
  put: (r, c) => pedir('PUT', r, c ?? {}),
  del: (r) => pedir('DELETE', r),
};
export const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) p.set(k, v); });
  const s = p.toString();
  return s ? '?' + s : '';
};
export async function descargar(ruta, nombreSugerido) {
  const r = await fetch('/api' + ruta, { credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' } });
  if (!r.ok) { let m = 'No se pudo descargar el archivo'; try { m = (await r.json()).error || m; } catch { /* nada */ } throw new ErrorApi(m, r.status); }
  const blob = await r.blob();
  const cd = r.headers.get('content-disposition') || '';
  const nombre = (cd.match(/filename="([^"]+)"/) || [])[1] || nombreSugerido;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- Avisos ----------
export function aviso(texto, tipo = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast' + (tipo === 'error' ? ' error' : '');
  t.textContent = texto;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), tipo === 'error' ? 6500 : 3200);
}
export const falla = (e) => aviso(e?.message || 'Ocurrió un error', 'error');

// ---------- Ventanas y formularios ----------
export function ventana({ titulo, cuerpo, ancha = false, acciones = [], alCerrar }) {
  return new Promise((resolver) => {
    const velo = document.createElement('div');
    velo.className = 'velo';
    velo.innerHTML = `<div class="ventana${ancha ? ' ancha' : ''}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <header><h2>${esc(titulo)}</h2><button type="button" data-cerrar aria-label="Cerrar">×</button></header>
      <div class="cuerpo"></div><footer></footer></div>`;
    const cuerpoEl = $('.cuerpo', velo);
    if (cuerpo instanceof Crudo) cuerpoEl.innerHTML = cuerpo.s; else if (cuerpo) cuerpoEl.append(cuerpo);
    const pie = $('footer', velo);
    const cerrar = (v) => { velo.remove(); document.removeEventListener('keydown', teclas); alCerrar?.(); resolver(v); };
    const teclas = (e) => { if (e.key === 'Escape') cerrar(null); };
    document.addEventListener('keydown', teclas);
    $('[data-cerrar]', velo).onclick = () => cerrar(null);
    velo.addEventListener('mousedown', (e) => { if (e.target === velo) cerrar(null); });
    acciones.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn ' + (a.clase || ''); b.textContent = a.texto;
      b.onclick = () => a.alHacer({ cerrar, cuerpo: cuerpoEl, boton: b, velo });
      pie.appendChild(b);
    });
    if (!acciones.length) pie.remove();
    document.body.appendChild(velo);
    const primero = $('input:not([type=hidden]), select, textarea', cuerpoEl);
    primero?.focus();
  });
}

export const confirmar = (mensaje, { si = 'Aceptar', peligro = false, titulo = 'Confirmar' } = {}) =>
  ventana({
    titulo, cuerpo: h`<p style="margin:4px 0 8px">${mensaje}</p>`,
    acciones: [
      { texto: 'Cancelar', alHacer: ({ cerrar }) => cerrar(false) },
      { texto: si, clase: peligro ? 'peligro' : 'primario', alHacer: ({ cerrar }) => cerrar(true) },
    ],
  }).then((r) => !!r);

function campoHTML(c, v) {
  const id = `f_${c.name}`;
  const val_ = v ?? c.valor ?? '';
  let control;
  if (c.tipo === 'select') {
    control = h`<select id="${id}" name="${c.name}">${(c.opciones || []).map((o) => h`<option value="${o.v}" ${String(o.v) === String(val_) ? crudo('selected') : ''}>${o.t}</option>`)}</select>`;
  } else if (c.tipo === 'textarea') {
    control = h`<textarea id="${id}" name="${c.name}" placeholder="${c.ph || ''}">${val_}</textarea>`;
  } else if (c.tipo === 'check') {
    return h`<div class="campo"><label style="font-weight:500"><input type="checkbox" id="${id}" name="${c.name}" ${val_ ? crudo('checked') : ''} style="width:auto;margin-right:8px">${c.label}</label>${c.ayuda ? h`<div class="ayuda">${c.ayuda}</div>` : ''}</div>`;
  } else {
    control = h`<input id="${id}" name="${c.name}" type="${c.tipo || 'text'}" value="${val_}" placeholder="${c.ph || ''}" ${c.paso ? crudo(`step="${esc(c.paso)}"`) : ''} ${c.min !== undefined ? crudo(`min="${esc(c.min)}"`) : ''} autocomplete="off">`;
  }
  return h`<div class="campo" data-campo="${c.name}"><label for="${id}">${c.label}</label>${control}${c.ayuda ? h`<div class="ayuda">${c.ayuda}</div>` : ''}</div>`;
}
export function camposHTML(campos, valores = {}) {
  const partes = []; let fila = [];
  const vaciar = () => { if (fila.length) { partes.push(h`<div class="fila-campos">${fila}</div>`); fila = []; } };
  for (const c of campos) {
    const bloque = campoHTML(c, valores[c.name]);
    if (c.mitad) fila.push(bloque); else { vaciar(); partes.push(bloque); }
    if (fila.length === 2) vaciar();
  }
  vaciar();
  return h`<div class="error-form oculto" data-error></div>${partes}`;
}
export function leerCampos(raiz) {
  const o = {};
  $$('[name]', raiz).forEach((el) => { o[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
  return o;
}

// Formulario modal: `enviar(valores)` debe lanzar un error si algo falla.
export function formulario({ titulo, campos, valores = {}, textoGuardar = 'Guardar', enviar, ancha = false, extra }) {
  const cuerpo = document.createElement('div');
  cuerpo.innerHTML = camposHTML(campos, valores).s;
  return ventana({
    titulo, cuerpo, ancha,
    acciones: [
      { texto: 'Cancelar', alHacer: ({ cerrar }) => cerrar(null) },
      {
        texto: textoGuardar, clase: 'primario',
        alHacer: async ({ cerrar, cuerpo: c, boton }) => {
          const err = $('[data-error]', c);
          err.classList.add('oculto');
          boton.disabled = true;
          try { const r = await enviar(leerCampos(c)); cerrar(r ?? true); } catch (e) {
            err.textContent = e.message; err.classList.remove('oculto'); boton.disabled = false;
          }
        },
      },
    ],
    alCerrar: undefined,
  }).finally(() => {});
  // `extra` se reserva para enganchar eventos desde quien llama (ver movimientos.js)
}

// ---------- Gráficos SVG ----------
const compacto = (n) => {
  const a = Math.abs(n);
  const t = a >= 1e6 ? (a / 1e6).toFixed(1) + ' M' : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + ' mil' : String(Math.round(a));
  return (n < 0 ? '−' : '') + t;
};
function escala(min, max, pasos = 4) {
  if (min === max) { max = min + 1; }
  const bruto = (max - min) / pasos;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto);
  const lo = Math.floor(min / paso) * paso, hi = Math.ceil(max / paso) * paso;
  const marcas = []; for (let v = lo; v <= hi + paso / 2; v += paso) marcas.push(Math.round(v * 100) / 100);
  return { lo, hi, marcas };
}

// Barras agrupadas (ingresos/egresos) + línea de saldo opcional.
export function graficoMensual(datos, { ancho = 760, alto = 280 } = {}) {
  const m = { t: 14, r: 16, b: 30, l: 56 };
  const w = ancho - m.l - m.r, hh = alto - m.t - m.b;
  const valores = datos.flatMap((d) => [d.ingresos, d.egresos, d.saldo]);
  const { lo, hi, marcas } = escala(Math.min(0, ...valores), Math.max(...valores, 1));
  const y = (v) => m.t + hh - ((v - lo) / (hi - lo)) * hh;
  const banda = w / datos.length, bw = Math.min(26, banda * .28);
  let s = `<svg viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Ingresos, egresos y saldo por mes">`;
  marcas.forEach((v) => { s += `<line x1="${m.l}" x2="${ancho - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? '#9AA0BC' : '#E8EBF4'}"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${compacto(v)}</text>`; });
  datos.forEach((d, i) => {
    const cx = m.l + banda * i + banda / 2;
    s += `<rect x="${cx - bw - 2}" y="${Math.min(y(d.ingresos), y(0))}" width="${bw}" height="${Math.abs(y(0) - y(d.ingresos))}" rx="3" fill="#00B8D4"><title>Ingresos ${mesLargo(d.periodo)}: ${dinero(d.ingresos)}</title></rect>`;
    s += `<rect x="${cx + 2}" y="${Math.min(y(d.egresos), y(0))}" width="${bw}" height="${Math.abs(y(0) - y(d.egresos))}" rx="3" fill="#D81B9E"><title>Egresos ${mesLargo(d.periodo)}: ${dinero(d.egresos)}</title></rect>`;
    s += `<text x="${cx}" y="${alto - 8}" text-anchor="middle">${mesCorto(d.periodo)}</text>`;
  });
  const pts = datos.map((d, i) => `${m.l + banda * i + banda / 2},${y(d.saldo)}`).join(' ');
  s += `<polyline points="${pts}" fill="none" stroke="#161A33" stroke-width="2.5" stroke-linejoin="round"/>`;
  datos.forEach((d, i) => { s += `<circle cx="${m.l + banda * i + banda / 2}" cy="${y(d.saldo)}" r="4" fill="#fff" stroke="#161A33" stroke-width="2"><title>Saldo a fin de ${mesLargo(d.periodo)}: ${dinero(d.saldo)}</title></circle>`; });
  return crudo(s + '</svg>');
}

// Línea de saldo proyectado con línea de cero resaltada.
export function graficoLinea(puntos, { ancho = 860, alto = 300 } = {}) {
  const m = { t: 14, r: 16, b: 30, l: 62 };
  const w = ancho - m.l - m.r, hh = alto - m.t - m.b;
  const vals = puntos.map((p) => p.saldo);
  const { lo, hi, marcas } = escala(Math.min(0, ...vals), Math.max(0, ...vals, 1));
  const y = (v) => m.t + hh - ((v - lo) / (hi - lo)) * hh;
  const x = (i) => m.l + (puntos.length === 1 ? w / 2 : (w * i) / (puntos.length - 1));
  let s = `<svg viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Saldo proyectado">`;
  marcas.forEach((v) => { s += `<line x1="${m.l}" x2="${ancho - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? '#D81B9E' : '#E8EBF4'}" ${v === 0 ? 'stroke-dasharray="5 4"' : ''}/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${compacto(v)}</text>`; });
  const area = `${x(0)},${y(0)} ` + puntos.map((p, i) => `${x(i)},${y(p.saldo)}`).join(' ') + ` ${x(puntos.length - 1)},${y(0)}`;
  s += `<polygon points="${area}" fill="rgba(59,63,216,.08)"/>`;
  s += `<polyline points="${puntos.map((p, i) => `${x(i)},${y(p.saldo)}`).join(' ')}" fill="none" stroke="#3B3FD8" stroke-width="2.5" stroke-linejoin="round"/>`;
  const cada = Math.ceil(puntos.length / 8);
  puntos.forEach((p, i) => {
    s += `<circle cx="${x(i)}" cy="${y(p.saldo)}" r="${p.saldo < 0 ? 4.5 : 3.5}" fill="${p.saldo < 0 ? '#D81B9E' : '#3B3FD8'}"><title>${fecha(p.fecha)}: ${dinero(p.saldo)}</title></circle>`;
    if (i % cada === 0) s += `<text x="${x(i)}" y="${alto - 8}" text-anchor="middle">${p.fecha.slice(8, 10)}/${p.fecha.slice(5, 7)}</text>`;
  });
  return crudo(s + '</svg>');
}

// ---------- Íconos (trazo simple) ----------
const I = (d) => crudo(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`);
export const icono = {
  panel: I('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  libro: I('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5V21"/><path d="M9 8h7M9 12h7"/>'),
  cuentas: I('<rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M2.5 10.5h19M6.5 15h3"/>'),
  cobros: I('<path d="M7 7h12l-3-3M17 17H5l3 3"/>'),
  presupuesto: I('<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>'),
  proyeccion: I('<path d="M3 17l5-5 4 3 8-9"/><path d="M15 6h5v5"/>'),
  reportes: I('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6M9 9h2"/>'),
  semana: I('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17M8 14.5h3"/>'),
  socios: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.8c2 .7 3.2 2.3 3.5 5.2"/>'),
  balance: I('<path d="M12 3v18M5 7h14"/><path d="M5 7l-3 7a3.5 3.5 0 0 0 6 0zM19 7l-3 7a3.5 3.5 0 0 0 6 0z"/>'),
  devoluciones: I('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  ajustes: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  usuarios: I('<circle cx="12" cy="8" r="4"/><path d="M4 21c.7-4 3.9-6 8-6s7.3 2 8 6"/>'),
  flujos: I('<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/>'),
  auditoria: I('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
};
