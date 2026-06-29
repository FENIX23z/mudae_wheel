// public/js/admin.js — Panel de administración completo
'use strict';

if (!requireAdmin()) throw new Error('redirect');

/* ── Helpers ─────────────────────────────────────── */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const genId = () => 'r' + Math.random().toString(36).slice(2, 10);
const toast = (msg, dur = 2800) => {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(t._tid); t._tid = setTimeout(() => t.classList.add('hidden'), dur);
};

const RARITIES = [
  { id:1, name:'Común',      color:'#9a9a9a' },
  { id:2, name:'Inusual',    color:'#4caf50' },
  { id:3, name:'Raro',       color:'#2196f3' },
  { id:4, name:'Épico',      color:'#9c27b0' },
  { id:5, name:'Legendario', color:'#ffc107' },
  { id:6, name:'Mítico',     color:'#e53935' },
];

// Rellena select de rareza
function fillRaritySelect(selId, selectedId = 1) {
  const sel = $(selId);
  sel.innerHTML = RARITIES.map(r =>
    `<option value="${r.id}" ${r.id === selectedId ? 'selected' : ''}>${r.name}</option>`
  ).join('');
}

/* ── Usuario logueado ────────────────────────────── */
$('#admin-username').textContent = `👤 ${API.user()?.username || ''}`;
$('#btn-logout').addEventListener('click', () => { API.clearSession(); window.location.href = '/'; });

/* ── Navegación sidebar ──────────────────────────── */
$$('.snav-btn').forEach(btn => btn.addEventListener('click', () => {
  $$('.snav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  $$('.admin-section').forEach(s => s.classList.add('hidden'));
  $(`#panel-${btn.dataset.panel}`).classList.remove('hidden');
}));

/* ── Partículas ──────────────────────────────────── */
(function () {
  const c = $('#particles-canvas'); if (!c) return;
  const ctx = c.getContext('2d'); let W, H, P = [];
  function r() { W = c.width = innerWidth; H = c.height = innerHeight; }
  r(); window.addEventListener('resize', r);
  for (let i = 0; i < 40; i++) P.push({ x: Math.random() * 2000, y: Math.random() * 2000, r: Math.random() * 2 + .5, s: Math.random() * .3 + .05, d: (Math.random() - .5) * .15, a: Math.random() * .3 + .05 });
  function f() { ctx.clearRect(0, 0, W, H); P.forEach(p => { p.y -= p.s; p.x += p.d; if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; } ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = `rgba(180,130,60,${p.a})`; ctx.fill(); }); requestAnimationFrame(f); }
  f();
})();

/* ══════════════════════════════════════════════════
   RULETAS
   ══════════════════════════════════════════════════ */
let allRoulettes = [];
let editingId    = null;
let optionsData  = [];

async function loadRoulettes() {
  allRoulettes = await API.get('/roulettes');
  renderRouletteList();
}

function renderRouletteList() {
  const list = $('#roulettes-list');
  list.innerHTML = '';
  if (!allRoulettes.length) {
    list.innerHTML = '<div class="empty"><span class="empty-icon">⚙</span>Sin ruletas. Crea la primera.</div>';
    return;
  }
  allRoulettes.forEach(r => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="list-item-bar" style="background:${r.rarity_color};box-shadow:0 0 6px ${r.rarity_color}66"></div>
      <div class="list-item-info">
        <div class="list-item-name">${r.name}</div>
        <div class="list-item-meta">${r.rarity_name} · ${r.type} · ${r.options?.length || 0} opciones</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-sm" data-edit="${r.id}">✏</button>
        <button class="btn btn-sm btn-danger" data-del="${r.id}">🗑</button>
      </div>`;
    item.querySelector('[data-edit]').addEventListener('click', () => openRouletteEditor(r.id));
    item.querySelector('[data-del]').addEventListener('click', () => deleteRoulette(r.id));
    list.appendChild(item);
  });
}

async function deleteRoulette(id) {
  const r = allRoulettes.find(x => x.id === id);
  if (!confirm(`¿Eliminar la ruleta "${r?.name}"?`)) return;
  await API.del(`/roulettes/${id}`);
  toast('Ruleta eliminada');
  await loadRoulettes();
}

$('#btn-new-roulette').addEventListener('click', () => openRouletteEditor(null));
$('#editor-r-close').addEventListener('click', closeEditor);
$('#ed-cancel').addEventListener('click', closeEditor);

function closeEditor() {
  $('#roulette-editor').classList.add('hidden');
  editingId = null; optionsData = [];
}

function openRouletteEditor(id) {
  editingId = id;
  const r = id ? allRoulettes.find(x => x.id === id) : null;
  $('#editor-r-title').textContent = r ? 'Editar Ruleta' : 'Nueva Ruleta';
  $('#ed-name').value  = r?.name || '';
  $('#ed-type').value  = r?.type || 'normal';
  $('#ed-desc').value  = r?.desc || '';
  $('#ed-img').value   = r?.img  || '';
  $('#ed-adapt').checked = r?.adaptSize || false;
  fillRaritySelect('#ed-rarity', r?.rarity_id || 1);

  // Opciones: inicializa probs automáticas si están todas en 0
  optionsData = (r?.options || []).map(o => ({ ...o }));
  if (optionsData.length && optionsData.every(o => !o.prob)) {
    const eq = ProbManager.equalDistrib(optionsData.length);
    optionsData.forEach((o, i) => { o.prob = eq[i]; });
  }
  refreshOptsList();
  id ? $('#ed-delete').classList.remove('hidden') : $('#ed-delete').classList.add('hidden');
  $('#roulette-editor').classList.remove('hidden');
}

/* ── Opciones / Probabilidades ───────────────────── */
function refreshOptsList() {
  const list = $('#opts-list');
  list.innerHTML = '';

  const total = optionsData.reduce((s, o) => s + (parseFloat(o.prob) || 0), 0);
  $('#prob-total').textContent = Math.round(total);

  // Barra visual
  let barHtml = `<div class="prob-bar-wrap"><div class="prob-bar-fill" style="width:${Math.min(total,100)}%;background:${total>100?'#e53935':total===100?'#4caf50':'#ffc107'}"></div></div>`;
  $('#prob-total-bar').innerHTML = barHtml + `Total: <span id="prob-total">${Math.round(total)}</span>% ${total===100?'✓ perfecto':total>100?'⚠ excede 100%':'(autobalanceo activo)'}`;

  optionsData.forEach((opt, i) => {
    const d = document.createElement('details');
    d.className = 'opt-item';
    d.innerHTML = `
      <summary>
        <span class="opt-summary-name">${opt.name || `Opción ${i + 1}`}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-family:var(--font-u);font-size:.7rem;color:var(--copper)">${opt.prob || 0}%</span>
          <button class="opt-del" data-idx="${i}" title="Eliminar">✕</button>
        </div>
      </summary>
      <div class="opt-fields">
        <label>Nombre</label>
        <input type="text" class="opt-name" data-idx="${i}" value="${opt.name || ''}" placeholder="Nombre de la opción"/>
        <label>Descripción</label>
        <textarea class="opt-desc" data-idx="${i}" placeholder="Descripción…">${opt.desc || ''}</textarea>
        <label>Imagen (URL)</label>
        <input type="text" class="opt-img" data-idx="${i}" value="${opt.img || ''}" placeholder="https://…"/>
        <label>Probabilidad (%)</label>
        <div class="prob-row">
          <input type="number" class="opt-prob" data-idx="${i}" min="0" max="100" step="1" value="${opt.prob || 0}"/>
          <input type="range" class="opt-prob-range" data-idx="${i}" min="0" max="100" step="1" value="${opt.prob || 0}"/>
          <span>${opt.prob || 0}%</span>
        </div>
        <label>Ruleta hija (al salir esta opción)</label>
        <select class="opt-child" data-idx="${i}">
          <option value="">— Ninguna —</option>
          ${allRoulettes.filter(r => r.id !== editingId).map(r =>
            `<option value="${r.id}" ${opt.childRouletteId === r.id ? 'selected' : ''}>${r.name}</option>`
          ).join('')}
        </select>
      </div>`;

    // Eventos
    d.querySelector('.opt-name').addEventListener('input', e => {
      optionsData[i].name = e.target.value;
      d.querySelector('.opt-summary-name').textContent = e.target.value || `Opción ${i + 1}`;
    });
    d.querySelector('.opt-desc').addEventListener('input', e => { optionsData[i].desc = e.target.value; });
    d.querySelector('.opt-img').addEventListener('input', e => { optionsData[i].img = e.target.value; });

    // Número y range sincronizados + autobalanceo
    const probNum   = d.querySelector('.opt-prob');
    const probRange = d.querySelector('.opt-prob-range');
    const probLabel = d.querySelector('.prob-row span');

    function applyProb(val) {
      const newProbs = ProbManager.adjust(optionsData.map(o => parseFloat(o.prob) || 0), i, val);
      newProbs.forEach((p, j) => { optionsData[j].prob = p; });
      refreshOptsList();
      // Reabre este details
      setTimeout(() => {
        const items = $$('#opts-list details');
        if (items[i]) items[i].open = true;
      }, 10);
    }

    probNum.addEventListener('change', e => applyProb(parseFloat(e.target.value) || 0));
    probRange.addEventListener('input', e => applyProb(parseFloat(e.target.value) || 0));

    d.querySelector('.opt-del').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      optionsData.splice(i, 1);
      // Reequilibra
      if (optionsData.length) {
        const eq = ProbManager.equalDistrib(optionsData.length);
        optionsData.forEach((o, j) => { o.prob = eq[j]; });
      }
      refreshOptsList();
    });

    d.querySelector('.opt-child').addEventListener('change', e => { optionsData[i].childRouletteId = e.target.value; });
    list.appendChild(d);
  });
}

$('#btn-add-opt').addEventListener('click', () => {
  // Distribuye automáticamente entre todas las opciones + nueva
  const n = optionsData.length + 1;
  const eq = ProbManager.equalDistrib(n);
  const newOpt = { id: genId(), name: '', desc: '', img: '', prob: eq[n - 1], childRouletteId: '' };
  optionsData.push(newOpt);
  optionsData.forEach((o, i) => { o.prob = eq[i]; });
  refreshOptsList();
  setTimeout(() => {
    const items = $$('#opts-list details');
    if (items.length) items[items.length - 1].open = true;
  }, 20);
});

$('#ed-save').addEventListener('click', async () => {
  const name = $('#ed-name').value.trim();
  if (!name) { toast('El nombre es obligatorio'); return; }

  // Normaliza probs a 100 antes de guardar
  const rawProbs = optionsData.map(o => parseFloat(o.prob) || 0);
  const normProbs = ProbManager.normalize(rawProbs);
  optionsData.forEach((o, i) => { o.prob = normProbs[i]; });

  const body = {
    id: editingId || genId(),
    name,
    type:      $('#ed-type').value,
    rarity_id: parseInt($('#ed-rarity').value),
    desc:      $('#ed-desc').value.trim(),
    img:       $('#ed-img').value.trim(),
    adaptSize: $('#ed-adapt').checked,
    options:   optionsData,
  };

  try {
    if (editingId) await API.put(`/roulettes/${editingId}`, body);
    else           await API.post('/roulettes', body);
    toast('Ruleta guardada ✓');
    closeEditor();
    await loadRoulettes();
  } catch (e) { toast('Error: ' + e.message); }
});

$('#ed-delete').addEventListener('click', async () => {
  if (!editingId) return;
  await deleteRoulette(editingId);
  closeEditor();
});

/* ══════════════════════════════════════════════════
   USUARIOS
   ══════════════════════════════════════════════════ */
let allUsers = [];

async function loadUsers() {
  allUsers = await API.get('/users');
  renderUserList();
  fillUserSelects();
}

function renderUserList() {
  const list = $('#users-list');
  $('#users-count').textContent = `${allUsers.length} usuario(s)`;
  list.innerHTML = '';

  allUsers.forEach(u => {
    const row = document.createElement('div');
    row.className = 'user-row';
    const initial = u.username[0].toUpperCase();
    row.innerHTML = `
      <div class="user-avatar">${initial}</div>
      <div class="user-info">
        <div class="user-name">${u.username}</div>
        <div class="user-meta">Desde ${new Date(u.created_at).toLocaleDateString('es-ES')}</div>
      </div>
      <span class="role-badge ${u.role === 'admin' ? 'role-admin' : 'role-user'}">${u.role}</span>
      <div style="display:flex;gap:6px;align-items:center">
        <select class="adm-select role-sel" data-uid="${u.id}" style="font-size:.75rem;padding:5px 8px">
          <option value="user"  ${u.role === 'user'  ? 'selected' : ''}>Usuario</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
        <button class="btn btn-sm btn-primary role-save-btn" data-uid="${u.id}">✔</button>
        <button class="btn btn-sm btn-danger del-user-btn" data-uid="${u.id}" data-name="${u.username}">🗑</button>
      </div>`;

    row.querySelector('.role-save-btn').addEventListener('click', async () => {
      const role = row.querySelector('.role-sel').value;
      try {
        await API.put(`/users/${u.id}/role`, { role });
        toast('Rol actualizado ✓');
        await loadUsers();
      } catch (e) { toast(e.message); }
    });
    row.querySelector('.del-user-btn').addEventListener('click', async () => {
      if (!confirm(`¿Eliminar al usuario "${u.username}"?`)) return;
      try {
        await API.del(`/users/${u.id}`);
        toast('Usuario eliminado');
        await loadUsers();
      } catch (e) { toast(e.message); }
    });
    list.appendChild(row);
  });
}

/* ══════════════════════════════════════════════════
   TICKETS
   ══════════════════════════════════════════════════ */
function fillUserSelects() {
  const sel = $('#ticket-user-sel');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Selecciona usuario —</option>';
  allUsers.forEach(u => {
    sel.innerHTML += `<option value="${u.id}" ${u.id == cur ? 'selected' : ''}>${u.username}</option>`;
  });
}

$('#ticket-user-sel').addEventListener('change', async e => {
  const uid = e.target.value;
  if (!uid) { $('#ticket-manager').classList.add('hidden'); return; }
  const user = allUsers.find(u => u.id == uid);
  await loadUserTickets(uid, user?.username || uid);
});

async function loadUserTickets(uid, username) {
  try {
    const tickets = await API.get(`/tickets/${uid}`);
    $('#ticket-manager-name').textContent = `Tickets de: ${username}`;
    renderTicketRows(uid, tickets);
    $('#ticket-manager').classList.remove('hidden');
  } catch (e) { toast(e.message); }
}

function renderTicketRows(uid, tickets) {
  const rows = $('#ticket-rows');
  rows.innerHTML = '';
  tickets.forEach(t => {
    const row = document.createElement('div');
    row.className = 'ticket-row';
    row.innerHTML = `
      <div class="ticket-dot" style="background:${t.color};box-shadow:0 0 6px ${t.color}88"></div>
      <div class="ticket-label" style="color:${t.color}">${t.name}</div>
      <div class="ticket-qty-display" style="color:${t.color}" id="tqty-${t.rarity_id}">${t.qty}</div>
      <div class="ticket-controls">
        <button class="btn btn-sm btn-danger" data-r="${t.rarity_id}" data-delta="-1">−1</button>
        <input type="number" class="tctl-input" id="tinput-${t.rarity_id}" value="1" min="1" max="999"/>
        <button class="btn btn-sm btn-primary" data-r="${t.rarity_id}" data-delta="1">+</button>
      </div>`;

    row.querySelectorAll('[data-delta]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const rid   = parseInt(btn.dataset.r);
        const sign  = parseInt(btn.dataset.delta);
        const input = row.querySelector(`#tinput-${rid}`);
        const amt   = parseInt(input.value) || 1;
        const delta = sign * amt;
        try {
          const res = await API.put(`/tickets/${uid}`, { rarity_id: rid, delta });
          row.querySelector(`#tqty-${rid}`).textContent = res.qty;
          toast(`Tickets actualizados: ${res.qty} ${t.name}`);
        } catch (e) { toast(e.message); }
      });
    });
    rows.appendChild(row);
  });
}

/* ══════════════════════════════════════════════════
   PLAYLIST (admin)
   ══════════════════════════════════════════════════ */
async function loadPlaylist() {
  const tracks = await API.get('/playlist');
  MusicPlayer.playlist = tracks;
  renderAdminPlaylist(tracks);
}

function renderAdminPlaylist(tracks) {
  const list = $('#pl-list');
  list.innerHTML = '';
  if (!tracks.length) {
    list.innerHTML = '<div class="empty"><span class="empty-icon">🎵</span>Lista vacía.</div>';
    return;
  }
  tracks.forEach((t, i) => {
    const item = document.createElement('div');
    item.className = `pl-item${i === MusicPlayer.currentIndex ? ' now-playing' : ''}`;
    item.innerHTML = `
      <button class="pl-play-btn" data-i="${i}">${i === MusicPlayer.currentIndex ? '▶' : '○'}</button>
      <span class="pl-item-title">${t.title || t.youtube_url}</span>
      <button class="pl-del-btn" data-id="${t.id}">🗑</button>`;
    item.querySelector('.pl-play-btn').addEventListener('click', () => MusicPlayer.loadTrack(i, true));
    item.querySelector('.pl-del-btn').addEventListener('click', async () => {
      await MusicPlayer.removeTrack(t.id);
      await loadPlaylist();
    });
    list.appendChild(item);
  });
}

$('#pl-add').addEventListener('click', async () => {
  const url   = $('#pl-url').value.trim();
  const title = $('#pl-title').value.trim();
  if (!url) { toast('Introduce una URL de YouTube'); return; }
  try {
    await MusicPlayer.addTrack(url, title);
    $('#pl-url').value = ''; $('#pl-title').value = '';
    await loadPlaylist();
    toast('Canción añadida ✓');
  } catch (e) { toast(e.message); }
});

$('#pl-prev').addEventListener('click', () => { MusicPlayer.prev(); setTimeout(() => loadPlaylist(), 300); });
$('#pl-next').addEventListener('click', () => { MusicPlayer.next(); setTimeout(() => loadPlaylist(), 300); });
$('#pl-play').addEventListener('click', () => {
  MusicPlayer.toggle();
  setTimeout(() => { $('#pl-play').textContent = MusicPlayer.playing ? '⏸ Pausa' : '▶ Play'; }, 300);
});
$('#pl-shuffle').addEventListener('change', e => { MusicPlayer.shuffle = e.target.checked; });
$('#pl-loop').addEventListener('change',   e => { MusicPlayer.loop    = e.target.checked; });
$('#pl-vol').addEventListener('input', e => { MusicPlayer.setVolume(+e.target.value); });

/* ══════════════════════════════════════════════════
   INFO PAGE
   ══════════════════════════════════════════════════ */
async function loadInfoPage() {
  const settings = await API.get('/settings');
  $('#info-editor').value = settings.info_page || '';
}

$('#btn-save-info').addEventListener('click', async () => {
  const content = $('#info-editor').value;
  try {
    await API.put('/settings', { info_page: content });
    toast('Página de información guardada ✓');
  } catch (e) { toast(e.message); }
});

$('#btn-preview-info').addEventListener('click', () => {
  const preview = $('#info-preview');
  preview.innerHTML = $('#info-editor').value;
  preview.classList.toggle('hidden');
  $('#btn-preview-info').textContent = preview.classList.contains('hidden') ? '👁 Vista previa' : '🙈 Ocultar';
});

/* ══════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════ */
(async () => {
  await loadRoulettes();
  await loadUsers();
  await loadPlaylist();
  await loadInfoPage();
  await MusicPlayer.init();
})();
