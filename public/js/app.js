import { h, html, $, $$, api, aviso, falla, fijarMoneda, icono, formulario, esc, crudo } from './util.js';

const estado = { usuario: null, flujos: [], flujo: null, meta: null };
const app = $('#app');

const PAGINAS = {
  panel: ['Panel', 'panel', () => import('./pages/panel.js')],
  movimientos: ['Movimientos', 'libro', () => import('./pages/movimientos.js')],
  cuentas: ['Cuentas', 'cuentas', () => import('./pages/cuentas.js')],
  cobros: ['Cobros y pagos', 'cobros', () => import('./pages/cobros.js')],
  presupuestos: ['Presupuestos', 'presupuesto', () => import('./pages/presupuestos.js')],
  proyeccion: ['Proyección', 'proyeccion', () => import('./pages/proyeccion.js')],
  reportes: ['Reportes', 'reportes', () => import('./pages/reportes.js')],
  semana: ['Registro semanal', 'semana', () => import('./pages/banquito.js').then((m) => ({ default: m.semana }))],
  socios: ['Socios', 'socios', () => import('./pages/banquito.js').then((m) => ({ default: m.socios }))],
  balance: ['Balance', 'balance', () => import('./pages/banquito.js').then((m) => ({ default: m.balance }))],
  devoluciones: ['Devoluciones', 'devoluciones', () => import('./pages/banquito.js').then((m) => ({ default: m.devoluciones }))],
  config: ['Configuración', 'ajustes', () => import('./pages/config.js')],
};
const ADMIN_GLOBAL = {
  flujos: ['Flujos de caja', 'flujos', () => import('./pages/admin.js').then((m) => ({ default: m.flujos }))],
  usuarios: ['Usuarios', 'usuarios', () => import('./pages/admin.js').then((m) => ({ default: m.usuarios }))],
};

export const irA = (ruta) => { location.hash = ruta; };
const parsear = () => {
  const [ruta, query = ''] = (location.hash.slice(1) || '/').split('?');
  return { partes: ruta.split('/').filter(Boolean), params: new URLSearchParams(query) };
};

// ---------- Acceso ----------
function vistaLogin() {
  html(app, h`<div class="login">
    <section class="login-marca">
      <img src="/img/logo-gaver-studio.png" alt="Gaver Studio">
      <div>
        <h2>Cada sol, en su lugar.</h2>
        <p>Registra lo que entra y lo que sale, controla tus cuentas, cobros y pagos, y administra el banquito sin hojas sueltas.</p>
      </div>
      <div class="firma">Diseñado por <a href="https://gaverstudio.com/" target="_blank" rel="noopener">Gaver Studio</a></div>
    </section>
    <section class="login-form-lado">
      <form class="login-form" id="f-login" autocomplete="on">
        <h1>Ingresa a tu caja</h1>
        <p>Escribe tu usuario y contraseña.</p>
        <div class="error-form oculto" id="login-error"></div>
        <div class="campo"><label for="u">Usuario</label><input id="u" name="usuario" type="text" autocomplete="username" autofocus></div>
        <div class="campo"><label for="c">Contraseña</label><input id="c" name="clave" type="password" autocomplete="current-password"></div>
        <button class="btn primario" style="width:100%;justify-content:center;margin-top:8px" id="b-login">Ingresar</button>
      </form>
    </section>
  </div>`);
  $('#f-login').onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#login-error'); err.classList.add('oculto');
    const b = $('#b-login'); b.disabled = true;
    try {
      const r = await api.post('/auth/login', { usuario: $('#u').value, clave: $('#c').value });
      estado.usuario = r.usuario;
      await arrancar();
    } catch (x) { err.textContent = x.message; err.classList.remove('oculto'); b.disabled = false; $('#c').select(); }
  };
}

// ---------- Estructura general ----------
const enlace = (ruta, texto, ico, actual) => h`<a href="#${ruta}" class="${actual ? 'activo' : ''}">${icono[ico]}<span>${texto}</span></a>`;

function armarEstructura(paginaActual) {
  const esAdmin = estado.usuario.rol === 'admin';
  const f = estado.flujo;
  const base = f ? `/f/${f.id}/` : '';
  const general = ['panel', 'movimientos', 'cuentas', 'cobros', 'presupuestos', 'proyeccion', 'reportes'];
  const bq = ['semana', 'socios', 'balance', 'devoluciones'];
  html(app, h`<div class="app">
    <aside class="lateral">
      <div class="logo"><a href="#/"><img src="/img/logo-gaver-studio.png" alt="Gaver Studio"></a></div>
      ${estado.flujos.length ? h`<div class="selector-flujo"><label for="sel-flujo">Flujo de caja</label>
        <select id="sel-flujo">${estado.flujos.map((x) => h`<option value="${x.id}" ${f && f.id === x.id ? crudo('selected') : ''}>${x.nombre}</option>`)}</select></div>` : ''}
      <nav class="menu">
        ${f ? h`<h4>Caja</h4>${general.map((p) => enlace(base + p, PAGINAS[p][0], PAGINAS[p][1], paginaActual === p))}
        ${f.tipo === 'banquito' ? h`<h4>Banquito</h4>${bq.map((p) => enlace(base + p, PAGINAS[p][0], PAGINAS[p][1], paginaActual === p))}` : ''}
        ${f.rol === 'admin' ? h`<h4>Administración</h4>${enlace(base + 'config', 'Configuración', 'ajustes', paginaActual === 'config')}` : ''}` : ''}
        ${esAdmin ? h`<h4>General</h4>${enlace('/flujos', 'Flujos de caja', 'flujos', paginaActual === 'flujos')}${enlace('/usuarios', 'Usuarios', 'usuarios', paginaActual === 'usuarios')}` : ''}
      </nav>
      <div class="pie">
        <div class="quien"><span>${estado.usuario.nombre}</span></div>
        <div class="rol">${esAdmin ? 'Administrador' : 'Usuario'}${f ? ` · ${{ admin: 'administra este flujo', editor: 'puede registrar', lector: 'solo consulta' }[f.rol]}` : ''}</div>
        <button id="b-clave" type="button">Cambiar contraseña</button><button id="b-salir" type="button">Salir</button>
        <div class="firma">Diseñado por <a href="https://gaverstudio.com/" target="_blank" rel="noopener">Gaver Studio</a></div>
      </div>
    </aside>
    <main class="principal" id="principal"><div class="cargando">Cargando…</div></main>
  </div>`);
  const sel = $('#sel-flujo');
  if (sel) sel.onchange = () => { localStorage.setItem('gaver_flujo', sel.value); irA(`/f/${sel.value}/${paginaActual in PAGINAS ? (PAGINAS[paginaActual] && estado.flujo?.tipo !== 'banquito' && ['semana', 'socios', 'balance', 'devoluciones'].includes(paginaActual) ? 'panel' : paginaActual) : 'panel'}`); };
  $('#b-salir').onclick = async () => { await api.post('/auth/logout').catch(() => {}); estado.usuario = null; irA('/'); vistaLogin(); };
  $('#b-clave').onclick = () => formulario({
    titulo: 'Cambiar contraseña',
    campos: [
      { name: 'actual', label: 'Contraseña actual', tipo: 'password' },
      { name: 'nueva', label: 'Nueva contraseña', tipo: 'password', ayuda: 'Mínimo 8 caracteres.' },
    ],
    enviar: async (v) => { await api.post('/auth/cambiar-clave', v); aviso('Contraseña actualizada'); },
  });
  return $('#principal');
}

export async function cargarMeta(recargar = false) {
  if (estado.meta && !recargar) return estado.meta;
  const id = estado.flujo.id;
  const [cuentas, categorias] = await Promise.all([api.get(`/flujos/${id}/cuentas`), api.get(`/flujos/${id}/categorias`)]);
  estado.meta = { cuentas, categorias };
  return estado.meta;
}

async function cargarFlujos() {
  estado.flujos = await api.get('/flujos');
}

async function enrutar() {
  if (!estado.usuario) return vistaLogin();
  const { partes, params } = parsear();
  try {
    if (partes[0] === 'flujos' || partes[0] === 'usuarios') {
      if (estado.usuario.rol !== 'admin') return irA('/');
      estado.flujo = null;
      const main = armarEstructura(partes[0]);
      const mod = await ADMIN_GLOBAL[partes[0]][2]();
      return await mod.default({ main, estado, irA, recargarFlujos: cargarFlujos });
    }
    if (partes[0] === 'f' && partes[1]) {
      const id = partes[1];
      if (!estado.flujo || estado.flujo.id !== id) {
        estado.flujo = await api.get(`/flujos/${id}`);
        estado.meta = null;
        localStorage.setItem('gaver_flujo', id);
      }
      fijarMoneda(estado.flujo.moneda);
      let pagina = partes[2] || 'panel';
      if (!PAGINAS[pagina] || (['semana', 'socios', 'balance', 'devoluciones'].includes(pagina) && estado.flujo.tipo !== 'banquito')) pagina = 'panel';
      if (pagina === 'config' && estado.flujo.rol !== 'admin') pagina = 'panel';
      const main = armarEstructura(pagina);
      const meta = await cargarMeta();
      const mod = await PAGINAS[pagina][2]();
      document.title = `${PAGINAS[pagina][0]} · ${estado.flujo.nombre}`;
      return await mod.default({
        main, flujo: estado.flujo, meta, params, irA,
        recargarMeta: () => cargarMeta(true),
        recargarFlujo: async () => { estado.flujo = await api.get(`/flujos/${estado.flujo.id}`); fijarMoneda(estado.flujo.moneda); return estado.flujo; },
        recargarFlujos: cargarFlujos,
        puedeEditar: ['admin', 'editor'].includes(estado.flujo.rol),
        esAdminFlujo: estado.flujo.rol === 'admin',
        ruta: (p, q) => `#/f/${estado.flujo.id}/${p}${q ? '?' + q : ''}`,
      });
    }
    // Inicio: ir al último flujo usado o al primero disponible
    estado.flujo = null;
    const ultimo = localStorage.getItem('gaver_flujo');
    const destino = estado.flujos.find((x) => x.id === ultimo) || estado.flujos[0];
    if (destino) return irA(`/f/${destino.id}/panel`);
    const main = armarEstructura('inicio');
    html(main, h`<div class="vacio"><h3>Todavía no tienes un flujo de caja</h3>
      <p>${estado.usuario.rol === 'admin' ? 'Crea el primero para empezar a registrar movimientos.' : 'Pide al administrador que te asigne uno.'}</p>
      ${estado.usuario.rol === 'admin' ? h`<a class="btn primario" href="#/flujos">Crear flujo de caja</a>` : ''}</div>`);
  } catch (e) {
    if (e.status === 403 || e.status === 404) { estado.flujo = null; aviso(e.message, 'error'); return irA('/'); }
    const main = $('#principal') || armarEstructura('');
    html(main, h`<div class="vacio"><h3>No se pudo cargar esta página</h3><p>${e.message}</p><button class="btn" id="reintentar">Reintentar</button></div>`);
    $('#reintentar')?.addEventListener('click', () => location.reload());
    console.error(e);
  }
}

async function arrancar() {
  await cargarFlujos();
  estado.flujo = null;
  if (!location.hash || location.hash === '#/') await enrutar(); else await enrutar();
}

window.addEventListener('hashchange', enrutar);
window.addEventListener('sesion-vencida', () => { if (estado.usuario) { estado.usuario = null; aviso('Tu sesión venció. Ingresa de nuevo.', 'error'); vistaLogin(); } });

(async () => {
  try { estado.usuario = (await api.get('/auth/me')).usuario; await arrancar(); } catch { vistaLogin(); }
})();
