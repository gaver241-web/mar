import { h, html, $, $$, api, aviso, falla, formulario, confirmar, fecha, crudo } from '../util.js';
import { cabecera, chip, vacio } from './comun.js';

const ROLES_F = [{ v: 'admin', t: 'Administra el flujo' }, { v: 'editor', t: 'Registra movimientos' }, { v: 'lector', t: 'Solo consulta' }];

export async function flujos(ctx) {
  const { main } = ctx;
  const cargar = async () => {
    await ctx.recargarFlujos();
    const lista = ctx.estado.flujos;
    html(main, h`${cabecera('Flujos de caja', 'Cada flujo es una caja independiente: un negocio, un banquito, un proyecto.', h`<button class="btn primario" id="nuevo">+ Nuevo flujo de caja</button>`)}
      <div class="panel sin-pad">${lista.length ? h`<div class="tabla-wrap"><table class="t"><thead><tr><th>Nombre</th><th>Tipo</th><th>Moneda</th><th></th></tr></thead><tbody>
        ${lista.map((f) => h`<tr><td><b>${f.nombre}</b><br><span class="muted small">${f.descripcion || ''}</span></td><td>${chip(f.tipo === 'banquito' ? 'Banquito' : 'General', f.tipo === 'banquito' ? 'programado' : 'pendiente')}</td><td>${f.moneda}</td>
          <td class="acc"><a class="btn mini" href="#/f/${f.id}/panel">Abrir</a> <a class="btn mini" href="#/f/${f.id}/config">Configurar y dar acceso</a> <button class="btn mini peligro" data-arch="${f.id}" data-n="${f.nombre}">Archivar</button></td></tr>`)}</tbody></table></div>`
        : vacio('Aún no hay flujos', 'Crea el primero para empezar.')}</div>`);
    $('#nuevo').onclick = async () => {
      const r = await formulario({
        titulo: 'Nuevo flujo de caja',
        campos: [{ name: 'nombre', label: 'Nombre', tipo: 'text', ph: 'Ej. Tienda, Banquito 2026-1' },
          { name: 'tipo', label: 'Tipo', tipo: 'select', opciones: [{ v: 'general', t: 'General (ingresos, egresos, cuentas…)' }, { v: 'banquito', t: 'Banquito (además lleva socios y semanas)' }] },
          { name: 'descripcion', label: 'Descripción', tipo: 'text', ph: 'Opcional' }, { name: 'moneda', label: 'Símbolo de moneda', tipo: 'text', valor: 'S/' }],
        enviar: (v) => api.post('/flujos', v),
      });
      if (r) { aviso('Flujo creado'); location.hash = `#/f/${r.id}/${'config'}`; await ctx.recargarFlujos(); }
    };
    $$('[data-arch]').forEach((b) => b.onclick = async () => {
      if (!(await confirmar(`¿Archivar "${b.dataset.n}"? Dejará de aparecer en la lista (los datos no se borran).`, { si: 'Archivar', peligro: true }))) return;
      try { await api.del(`/flujos/${b.dataset.arch}`); aviso('Flujo archivado'); cargar(); } catch (e) { falla(e); }
    });
  };
  await cargar();
}

export async function usuarios(ctx) {
  const { main } = ctx;
  const cargar = async () => {
    const [lista] = await Promise.all([api.get('/usuarios'), ctx.recargarFlujos()]);
    const fl = ctx.estado.flujos;
    html(main, h`${cabecera('Usuarios', 'Crea personas para que administren uno o varios flujos de caja.', h`<button class="btn primario" id="nuevo">+ Nuevo usuario</button>`)}
      <div class="panel sin-pad"><div class="tabla-wrap"><table class="t"><thead><tr><th>Usuario</th><th>Rol general</th><th>Flujos y permisos</th><th>Estado</th><th></th></tr></thead><tbody>
        ${lista.map((u) => h`<tr class="${u.activo ? '' : 'anulado'}"><td><b>${u.nombre}</b><br><span class="muted small">${u.usuario}</span></td><td>${u.rol === 'admin' ? 'Administrador' : 'Usuario'}</td>
          <td>${u.rol === 'admin' ? h`<span class="muted">Ve todos los flujos</span>` : u.flujos.length ? u.flujos.map((f) => h`<div class="small">${f.nombre} · <span class="muted">${ROLES_F.find((r) => r.v === f.rol)?.t}</span></div>`) : h`<span class="muted">Sin flujos asignados</span>`}</td>
          <td class="est">${chip(u.activo ? 'activo' : 'inactivo', u.activo ? 'confirmado' : 'anulado')}</td>
          <td class="acc"><button class="btn mini" data-edit="${u.id}">Editar</button></td></tr>`)}</tbody></table></div></div>`);
    $('#nuevo').onclick = async () => {
      const cuerpoCampos = [{ name: 'nombre', label: 'Nombre', tipo: 'text', mitad: true }, { name: 'usuario', label: 'Usuario para ingresar', tipo: 'text', mitad: true, ayuda: 'Sin espacios.' },
        { name: 'clave', label: 'Contraseña inicial', tipo: 'password', mitad: true, ayuda: 'Mínimo 8 caracteres.' }, { name: 'rol', label: 'Rol general', tipo: 'select', mitad: true, opciones: [{ v: 'usuario', t: 'Usuario' }, { v: 'admin', t: 'Administrador (ve y gestiona todo)' }] },
        ...fl.flatMap((f) => [{ name: `acc_${f.id}`, label: `Acceso a ${f.nombre}`, tipo: 'select', mitad: true, opciones: [{ v: '', t: 'Sin acceso' }, ...ROLES_F] }])];
      if (await formulario({
        titulo: 'Nuevo usuario', campos: cuerpoCampos, ancha: true,
        enviar: (v) => api.post('/usuarios', { usuario: v.usuario, nombre: v.nombre, clave: v.clave, rol: v.rol, flujos: fl.filter((f) => v[`acc_${f.id}`]).map((f) => ({ flujoId: f.id, rol: v[`acc_${f.id}`] })) }),
      })) { aviso('Usuario creado'); cargar(); }
    };
    $$('[data-edit]').forEach((b) => b.onclick = async () => {
      const u = lista.find((x) => x.id === b.dataset.edit);
      if (await formulario({
        titulo: `Editar a ${u.usuario}`,
        campos: [{ name: 'nombre', label: 'Nombre', tipo: 'text' }, { name: 'rol', label: 'Rol general', tipo: 'select', opciones: [{ v: 'usuario', t: 'Usuario' }, { v: 'admin', t: 'Administrador' }], mitad: true },
          { name: 'activo', label: 'Usuario activo', tipo: 'check', ayuda: 'Si lo desactivas, no podrá ingresar.' },
          { name: 'clave', label: 'Nueva contraseña (opcional)', tipo: 'password', ayuda: 'Déjala vacía para no cambiarla.' }],
        valores: u, enviar: (v) => api.put(`/usuarios/${u.id}`, { nombre: v.nombre, rol: v.rol, activo: v.activo, clave: v.clave || undefined }),
      })) { aviso('Usuario actualizado'); cargar(); }
    });
  };
  await cargar();
}
