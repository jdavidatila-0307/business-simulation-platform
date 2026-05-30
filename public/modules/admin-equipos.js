/**
 * modules/admin-equipos.js — SimNego v3.2
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo: gestión de equipos administrativo
 * Fase 1 — Día 5 del plan de modularización
 *
 * Funciones incluidas:
 *   - loadAdminEquipos
 *   - window.togglePassVis, window.cambiarClave
 *   - window.resetearEnvio, window.eliminarEquipo
 *
 * Dependencias: api(), fmt (ui-components.js), state, toast
 * Reversión: comentar <script src="modules/admin-equipos.js"> en index.html
 * ─────────────────────────────────────────────────────────────────────────────
 */

async function loadAdminEquipos() {
  var el = document.getElementById('equiposTableWrap');
  if (!el) return;

  try {
    var equipos = await api('GET', '/admin/equipos');
    if (!equipos || !equipos.length) {
      el.innerHTML = '<p style="color:var(--text3);padding:20px">Sin equipos registrados.</p>';
      return;
    }

    var rows = equipos.filter(function(eq) { return !eq.isBot; }).map(function(eq) {
      var miembros = Array.isArray(eq.miembros) ? eq.miembros : [];
      var fecha    = eq.registradoAt ? new Date(eq.registradoAt).toLocaleString('es-BO', {dateStyle:'short', timeStyle:'short'}) : '—';
      var nMiemb   = miembros.length;

      var miembrosHTML = miembros.length
        ? miembros.map(function(m) {
            var ap  = [m.apellidoPaterno, m.apellidoMaterno].filter(Boolean).join(' ');
            var nm  = m.nombres || m.nombre || m.name || '—';
            var ci  = m.nroRegistro || m.ci || '';
            var tel = m.telefono || m.phone || '';
            return '<div style="margin-bottom:6px"><strong>' + (ap ? ap + ', ' : '') + nm + '</strong>'
              + '<div style="font-size:.75rem;color:var(--text3);margin-top:2px">'
              + (ci  ? '<span style="margin-right:10px">🪪 ' + ci  + '</span>' : '')
              + (tel ? '<span>📞 ' + tel + '</span>' : '')
              + '</div></div>';
          }).join('')
        : '<span style="color:var(--text3);font-size:.8rem">Sin integrantes</span>';

      var estadoBadge = eq.submitted
        ? '<span class="badge badge-ok">✓ Enviado</span>'
        : '<span class="badge badge-warn">Pendiente</span>';

      return '<tr style="vertical-align:top;border-bottom:1px solid var(--border)">'
        + '<td style="padding:14px 16px;min-width:180px"><div style="font-weight:700;font-size:.92rem">' + eq.nombre + '</div>'
        + '<div style="font-family:var(--font-mono);font-size:.68rem;color:var(--text3);margin-top:3px">' + eq.id + '</div></td>'
        + '<td style="padding:14px 16px"><span style="font-family:var(--font-mono);color:var(--accent3);font-size:.85rem">' + (eq.passwordPlain || '••••••') + '</span>'
        + '<button onclick="togglePassVis(this,\'' + (eq.passwordPlain || '') + '\')" style="background:none;border:none;cursor:pointer;color:var(--text3);margin-left:6px;font-size:.8rem">👁</button></td>'
        + '<td style="padding:14px 16px;min-width:220px">' + miembrosHTML + '</td>'
        + '<td style="padding:14px 16px;text-align:center;font-family:var(--font-mono);font-size:.85rem">' + nMiemb + '</td>'
        + '<td style="padding:14px 16px;text-align:center">' + estadoBadge + '</td>'
        + '<td style="padding:14px 16px;font-size:.78rem;color:var(--text3)">' + fecha + '</td>'
        + '<td style="padding:14px 16px;white-space:nowrap">'
        + '<button class="btn btn-ghost btn-sm" onclick="editarEquipo(\'' + eq.id + '\')">✏️ Editar</button>'
        + '<button class="btn btn-ghost btn-sm" style="margin-left:4px" onclick="resetearEnvio(\'' + eq.id + '\',\'' + eq.nombre + '\')">↺ Resetear</button>'
        + '<button class="btn btn-sm" style="background:#EF4444;color:#fff;margin-left:4px" onclick="eliminarEquipo(\'' + eq.id + '\',\'' + eq.nombre + '\')">✕</button>'
        + '</td></tr>';
    }).join('');

    el.innerHTML = '<div style="overflow-x:auto">'
      + '<table style="width:100%;border-collapse:collapse">'
      + '<thead><tr style="background:var(--bg2);font-family:var(--font-mono);font-size:.65rem;text-transform:uppercase;letter-spacing:1px;color:var(--text3)">'
      + '<th style="padding:10px 16px;text-align:left">Equipo / ID de Acceso</th>'
      + '<th style="padding:10px 16px;text-align:left">Contraseña</th>'
      + '<th style="padding:10px 16px;text-align:left">Integrantes</th>'
      + '<th style="padding:10px 16px;text-align:center">#</th>'
      + '<th style="padding:10px 16px;text-align:center">Estado Ronda</th>'
      + '<th style="padding:10px 16px;text-align:left">Registrado</th>'
      + '<th style="padding:10px 16px;text-align:left">Acciones</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>';

  } catch(e) {
    el.innerHTML = '<p style="color:var(--accent4);padding:20px">Error: ' + e.message + '</p>';
    console.error('[admin-equipos] loadAdminEquipos:', e);
  }
}

// ── Handlers de acciones ──────────────────────────────────────────────────────
window.togglePassVis = function(btn, pass) {
  var sp = btn.previousElementSibling;
  sp.textContent = sp.textContent.includes('•') ? pass : '••••••';
};

window.editarEquipo = async function(id) {
  var equipos;
  try { equipos = await api('GET', '/admin/equipos'); }
  catch(e) { toast('Error: ' + e.message, 'error'); return; }
  var eq = equipos.find(function(e) { return e.id === id; });
  if (!eq) { toast('Equipo no encontrado', 'error'); return; }

  var btn = document.querySelector('[onclick="editarEquipo(\'' + id + '\')"]');
  if (!btn) return;
  var tr  = btn.closest('tr');
  if (!tr) return;

  var existing = document.getElementById('edit-form-' + id);
  if (existing) { existing.remove(); return; }
  document.querySelectorAll('[id^="edit-form-"]').forEach(function(el) { el.remove(); });

  var td = document.createElement('tr');
  td.id  = 'edit-form-' + id;
  td.innerHTML = '<td colspan="7" style="padding:0">'
    + '<div style="padding:14px 16px;background:rgba(158,216,48,0.06);border-top:1px solid rgba(158,216,48,0.15);border-bottom:1px solid rgba(158,216,48,0.15)">'
    + '<div style="font-family:var(--font-mono);font-size:.68rem;color:var(--accent3);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">✏️ Editar equipo</div>'
    + '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">'
    + '<div><label style="font-size:.72rem;color:var(--text3);display:block;margin-bottom:4px">Nombre del equipo</label>'
    + '<input id="edit-nombre-' + id + '" type="text" value="' + (eq.nombre||'').replace(/"/g,'&quot;') + '" '
    + 'style="background:var(--bg2);border:1px solid var(--border2);color:var(--white);padding:7px 12px;border-radius:6px;font-size:.85rem;width:200px"></div>'
    + '<div><label style="font-size:.72rem;color:var(--text3);display:block;margin-bottom:4px">Nueva contraseña <span style="opacity:.5">(vacío = no cambiar)</span></label>'
    + '<input id="edit-pass-' + id + '" type="text" placeholder="' + (eq.passwordPlain||'contraseña actual') + '" '
    + 'style="background:var(--bg2);border:1px solid var(--border2);color:var(--white);padding:7px 12px;border-radius:6px;font-size:.85rem;width:200px"></div>'
    + '<button class="btn btn-ghost btn-sm" style="border-color:rgba(158,216,48,0.4);color:#9ED830" onclick="guardarEdicionEquipo(\'' + id + '\')">💾 Guardar</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'edit-form-\' + id + \'\'  ).remove()">Cancelar</button>'
    + '</div></div></td>';

  tr.insertAdjacentElement('afterend', td);
  document.getElementById('edit-nombre-' + id).focus();
};

window.guardarEdicionEquipo = async function(id) {
  var nombreInput = document.getElementById('edit-nombre-' + id);
  var passInput   = document.getElementById('edit-pass-' + id);
  var nombre = nombreInput ? nombreInput.value.trim() : '';
  var pass   = passInput   ? passInput.value.trim()   : '';
  if (!nombre) { toast('El nombre no puede estar vacío', 'error'); return; }
  try {
    await api('PUT', '/admin/equipos/' + id + '/editar', {
      nombre:   nombre,
      password: pass || undefined,
    });
    toast('✅ Equipo actualizado', 'success');
    var form = document.getElementById('edit-form-' + id);
    if (form) form.remove();
    loadAdminEquipos();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
};

window.resetearEnvio = async function(id, nombre) {
  if (!confirm('¿Resetear el envío de decisiones de ' + nombre + '? El equipo podrá editar y reenviar.')) return;
  try {
    await api('POST', '/admin/equipos/' + id + '/reset-envio');
    toast('✅ Envío reseteado — el equipo puede volver a enviar', 'success');
    loadAdminEquipos();
  } catch(e) { toast(e.message, 'error'); }
};

window.eliminarEquipo = async function(id, nombre) {
  if (!confirm('¿Eliminar el equipo "' + nombre + '"? Esta acción no se puede deshacer.')) return;
  try {
    await api('DELETE', '/admin/equipos/' + id);
    toast('✅ Equipo eliminado', 'success');
    loadAdminEquipos();
  } catch(e) { toast(e.message, 'error'); }
};

console.log('[admin-equipos] ✅ Módulo cargado — loadAdminEquipos activo');
