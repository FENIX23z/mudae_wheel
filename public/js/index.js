// public/js/index.js
'use strict';

/* ── Helpers ─────────────────────────────────────── */
const $ = s => document.querySelector(s);
const toast = (msg, d=2600) => {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), d);
};

let allRoulettes = [];
let myTickets    = {};   // { rarity_id: qty }
let session      = { stack: [] };
let freeSpinsUsed = {}; // { rouletteId: true } — rastrea giros gratis usados por sesión
let freeSpinCooldowns = {}; // { rouletteId: remainingSeconds }

/* ── Sonido de spin ───────────────────────────────── */
function playSpinSound() {
  const audio = new Audio('https://files.catbox.moe/wnwygz.mp3');
  audio.volume = 0.7;
  audio.play().catch(() => {}); // Ignora errores silenciosamente
}

/* ── Formatear cooldown ────────────────────────────── */
function formatCooldown(seconds) {
  const s = Math.ceil(seconds);
  const WEEK = 604800;  // 7 * 24 * 60 * 60
  const DAY = 86400;    // 24 * 60 * 60
  const HOUR = 3600;    // 60 * 60
  const MIN = 60;
  
  if (s >= WEEK) {
    const weeks = Math.floor(s / WEEK);
    return `${weeks} semana${weeks > 1 ? 's' : ''}`;
  } else if (s >= DAY) {
    const days = Math.floor(s / DAY);
    return `${days} día${days > 1 ? 's' : ''}`;
  } else if (s >= HOUR) {
    const hours = Math.floor(s / HOUR);
    return `${hours} hora${hours > 1 ? 's' : ''}`;
  } else {
    const mins = Math.floor(s / MIN);
    return `${mins} minuto${mins > 1 ? 's' : ''}`;
  }
}

/* ── Header nav ───────────────────────────────────── */
function renderNav() {
  const nav = $('#header-nav');
  const user = API.user();
  if (user) {
    nav.innerHTML = `
      <span style="font-family:var(--font-u);font-size:.8rem;color:var(--text-m)">👤 ${user.username}</span>
      <a href="/user.html" class="btn btn-sm">Mi perfil</a>
      ${user.role==='admin'?'<a href="/admin.html" class="btn btn-sm btn-primary">⚙ Admin</a>':''}
      <button class="btn btn-sm btn-ghost" id="btn-logout">Salir</button>`;
    $('#btn-logout')?.addEventListener('click', () => {
      API.clearSession(); window.location.reload();
    });
  } else {
    nav.innerHTML = `<a href="/login.html" class="btn btn-primary">🔑 Iniciar sesión / Registrarse</a>`;
  }
}

/* ── Cargar datos ─────────────────────────────────── */
async function loadData() {
  try {
    allRoulettes = await API.get('/roulettes');
  } catch(e) { toast('Error cargando ruletas: ' + e.message); allRoulettes = []; }

  if (API.isLoggedIn()) {
    try {
      const tickets = await API.get('/tickets');
      myTickets = {};
      tickets.forEach(t => { myTickets[t.rarity_id] = t.qty; });
    } catch { myTickets = {}; }
  }
}

/* ── Raíces (ruletas que no son hijas de ninguna) ─── */
function getRoots() {
  const childIds = new Set(
    allRoulettes.flatMap(r => r.options.map(o => o.childRouletteId).filter(Boolean))
  );
  return allRoulettes.filter(r => !childIds.has(r.id));
}

/* ── Render grid ──────────────────────────────────── */
function renderGrid() {
  const grid = $('#roulettes-grid');
  grid.innerHTML = '';
  const roots = getRoots();
  if (!roots.length) {
    grid.innerHTML = '<div class="empty"><span class="empty-icon">⚙</span>No hay ruletas configuradas.</div>';
    return;
  }
  roots.forEach((r, i) => {
    const rc  = r.rarity_color || '#b06b20';
    const rl  = r.rarity_name || 'Común';
    const qty = myTickets[r.rarity_id] ?? 0;
    const hasTicket = !API.isLoggedIn() ? null : qty > 0;

    const card = document.createElement('div');
    card.className = 'r-card';
    card.style.animationDelay = `${i * 0.07}s`;
    card.innerHTML = `
      <div class="r-card-img">
        ${r.img ? `<img src="${r.img}" alt="${r.name}" onerror="this.style.display='none'"/>` : `<div class="r-card-placeholder">⚙</div>`}
        <div class="rarity-strip" style="background:${rc};box-shadow:0 0 10px ${rc}88"></div>
      </div>
      <div class="r-card-body">
        <span class="badge" style="color:${rc};border-color:${rc};margin-bottom:8px;display:inline-block">${rl}</span>
        <div class="r-card-name">${r.name}</div>
        <div class="r-card-desc">${r.desc || ''}</div>
        <button class="spin-button" style="border-color:${rc};color:${rc};font-size:.82rem;padding:10px 12px;margin-top:2px"
          data-id="${r.id}">
          ${r.spin_mode === 'free' ? '🎲 Giro Gratis · ' + rl : '🎟 Gastar Ticket · ' + rl}
          ${API.isLoggedIn() && r.spin_mode !== 'free' ? `<span style="margin-left:8px;font-size:.75rem;opacity:.8">(${qty})</span>` : ''}
          ${API.isLoggedIn() && r.spin_mode === 'free' && r.allow_ticket_spin !== false && qty > 0 ? `<span style="margin-left:8px;font-size:.75rem;opacity:.8">🎟(${qty})</span>` : ''}
        </button>
      </div>`;

    card.querySelector('button').addEventListener('click', e => {
      e.stopPropagation();
      openModal(r.id);
    });
    card.addEventListener('click', () => openModal(r.id));
    grid.appendChild(card);
  });
}

/* ── Modal ────────────────────────────────────────── */
function openModal(rouletteId) {
  session.stack = [{ rouletteId, picked: null }];
  showCurrentStep();
  $('#roulette-overlay').classList.remove('hidden');
}

function showCurrentStep() {
  const step = session.stack[session.stack.length - 1];
  const r    = allRoulettes.find(x => x.id === step.rouletteId);
  if (!r) return;

  // Breadcrumb
  $('#roulette-breadcrumb').textContent = session.stack
    .map(s => allRoulettes.find(x => x.id === s.rouletteId)?.name || '?')
    .join(' › ');

  $('#roulette-title').textContent = r.name;
  const rc = r.rarity_color || '#b06b20';
  $('#roulette-badge').innerHTML = `<span class="badge" style="color:${rc};border-color:${rc}">${r.rarity_name || 'Común'}</span>`;

  // Reinicia vistas
  ['no-session-msg','no-ticket-msg','spin-btn','free-spin-btn','fortune-area','result-area'].forEach(id => {
    const el = $(`#${id}`);
    if (el) el.classList.add('hidden');
  });
  $('#spin-btn').disabled = false;
  $('#free-spin-btn').disabled = false;

  // Wheel
  if (r.type === 'fortune') {
    WheelEngine.init($('#wheel-canvas'), [], false, r.rarity_id);
    $('#fortune-area').classList.remove('hidden');
    _resolveSpinButton(r, false);
  } else {
    WheelEngine.init($('#wheel-canvas'), r.options, r.adaptSize, r.rarity_id);
    _resolveSpinButton(r);
  }
}

async function _resolveSpinButton(r, showNormalSpin = true) {
  const user = API.user();
  if (!user) {
    $('#no-session-msg').classList.remove('hidden');
    return;
  }

  const freeBtn = $('#free-spin-btn');
  const freeBtnText = $('#free-spin-btn-text');
  const spinBtn = $('#spin-btn');
  const qty = myTickets[r.rarity_id] ?? 0;
  // allow_ticket_spin: si es undefined o true => permitido; si es explicitamente false => no
  const ticketsAllowed = r.allow_ticket_spin !== false;

  if (r.spin_mode === 'free') {
    // Solo ocultar spin-btn si tickets no permitidos
    if (!ticketsAllowed) {
      spinBtn.classList.add('hidden');
    }
    try {
      const status = await API.get(`/roulette/free-spin-status/${r.id}`);
      const canFreeSpin = status.enabled && !freeSpinsUsed[r.id];
      if (canFreeSpin) {
        freeBtn.classList.remove('hidden');
        freeBtnText.textContent = 'Girar Gratis';
        freeBtn.disabled = false;
      } else {
        freeBtn.classList.add('hidden');
        if (status.remaining_seconds > 0) {
          freeBtnText.textContent = `Cooldown ${formatCooldown(status.remaining_seconds)}`;
          freeBtn.classList.remove('hidden');
          freeBtn.disabled = true;
        }
      }
    } catch {
      freeBtn.classList.add('hidden');
    }
    // Si tickets están permitidos en esta ruleta free, mostrar botón de ticket también
    if (ticketsAllowed && qty >= 1) {
      spinBtn.classList.remove('hidden');
      const rc = r.rarity_color || '#b06b20';
      spinBtn.style.borderColor = rc;
      spinBtn.style.color       = rc;
      $('#spin-btn-text').textContent = `Gastar Ticket · ${r.rarity_name || ''} (${qty})`;
    }
  } else {
    // spin_mode !== 'free', NO mostrar botón de giro gratis
    freeBtn.classList.add('hidden');
  }

  if (qty < 1) {
    // Only show "no tickets" message if it's NOT a free-spin roulette (or tickets allowed but none)
    if (r.spin_mode !== 'free' || ticketsAllowed) {
      const noEl = $('#no-ticket-msg');
      if (r.spin_mode !== 'free') {
        noEl.textContent = `No tienes tickets de rareza ${r.rarity_name || 'Común'}. ¡Consíguelos en tu perfil!`;
        noEl.classList.remove('hidden');
      } else if (ticketsAllowed) {
        // Es free pero también permite tickets y no tiene: no mostrar error bloqueante
        // (el giro gratis sigue disponible)
      }
    }
    if (r.spin_mode !== 'free') return;
  }

  if (r.spin_mode !== 'free' && showNormalSpin) {
    spinBtn.classList.remove('hidden');
    const rc = r.rarity_color || '#b06b20';
    spinBtn.style.borderColor = rc;
    spinBtn.style.color       = rc;
    $('#spin-btn-text').textContent = `Gastar Ticket · ${r.rarity_name || ''} (${qty})`;
  }
}

$('#roulette-close').addEventListener('click', () => {
  $('#roulette-overlay').classList.add('hidden');
  freeSpinsUsed = {}; // resetea giros gratis al cerrar
  WheelEngine.spinning = false;
});

$('#spin-btn').addEventListener('click', async () => {
  const step = session.stack[session.stack.length - 1];
  const r    = allRoulettes.find(x => x.id === step.rouletteId);
  if (!r || WheelEngine.spinning) return;

  if (r.spin_mode === 'free' && r.allow_ticket_spin === false) {
    toast('Esta ruleta solo se juega con giro gratis');
    return;
  }

  // Gasta ticket
  try {
    await API.post('/tickets/spend', { rarity_id: r.rarity_id });
    myTickets[r.rarity_id] = Math.max(0, (myTickets[r.rarity_id] ?? 1) - 1);
  } catch(e) { toast(e.message); return; }

  $('#spin-btn').disabled = true;
  $('#free-spin-btn').classList.add('hidden');
  playSpinSound();
  WheelEngine.spin(picked => {
    $('#spin-btn').disabled = false;
    handleSpinResult(r, picked);
  });
});

$('#free-spin-btn').addEventListener('click', async () => {
  const step = session.stack[session.stack.length - 1];
  const r    = allRoulettes.find(x => x.id === step.rouletteId);
  if (!r || WheelEngine.spinning) return;
  if (freeSpinsUsed[r.id]) { toast('Ya usaste tu giro gratis para esta ruleta'); return; }

  const user = API.user();
  if (!user) { window.location.href = '/login.html'; return; }

  try {
    await API.post('/roulette/free-spin', { roulette_id: r.id });
  } catch (e) {
    toast(e.message);
    return;
  }

  freeSpinsUsed[r.id] = true;
  $('#free-spin-btn').disabled = true;
  $('#spin-btn').classList.add('hidden');
  playSpinSound();
  WheelEngine.spin(picked => {
    handleSpinResult(r, picked);
  });
});

function handleSpinResult(r, picked) {
  const opt = r.options[picked];
  if (!opt) return;
  session.stack[session.stack.length - 1].picked = picked;

  // Log
  API.post('/spin-log', { roulette_id: r.id, option_id: opt.id }).catch(() => {});

  // Auto-dar ticket si la opción lo tiene configurado
  if (opt.givesTicketRarityId && API.isLoggedIn()) {
    API.post('/tickets/award', { rarity_id: opt.givesTicketRarityId })
      .then(res => {
        const rarityNames = {1:'Común',2:'Inusual',3:'Raro',4:'Épico',5:'Legendario',6:'Mítico'};
        toast(`🎟 +1 Ticket ${rarityNames[opt.givesTicketRarityId] || ''} obtenido!`, 3500);
        if (res.qty !== undefined) myTickets[opt.givesTicketRarityId] = res.qty;
      })
      .catch(() => {});
  }

  if (opt.childRouletteId) {
    const child = allRoulettes.find(x => x.id === opt.childRouletteId);
    if (child) {
      setTimeout(() => {
        session.stack.push({ rouletteId: opt.childRouletteId, picked: null });
        showCurrentStep();
      }, 600);
      return;
    }
  }
  showResult(r, opt, null);
}

$('#fortune-confirm').addEventListener('click', async () => {
  const step = session.stack[session.stack.length - 1];
  const r    = allRoulettes.find(x => x.id === step.rouletteId);
  if (!r) return;

  const max = parseInt($('#fortune-max').value) || 10;
  if (max < 2) { toast('El máximo debe ser al menos 2'); return; }

  // Comprobar ticket
  const user = API.user();
  if (!user) { window.location.href = '/login.html'; return; }
  const qty = myTickets[r.rarity_id] ?? 0;
  if (qty < 1) { toast('No tienes tickets de esta rareza'); return; }

  try {
    await API.post('/tickets/spend', { rarity_id: r.rarity_id });
    myTickets[r.rarity_id] = Math.max(0, (myTickets[r.rarity_id] ?? 1) - 1);
  } catch(e) { toast(e.message); return; }

  $('#fortune-confirm').disabled = true;
  $('#fortune-area').classList.add('hidden');

  WheelEngine.spinFortune(max, result => {
    $('#fortune-confirm').disabled = false;
    API.post('/spin-log', { roulette_id: r.id, fortune_result: result }).catch(() => {});
    showResult(r, null, result);
  });
});

$('#num-minus').addEventListener('click', () => {
  const i = $('#fortune-max'); i.value = Math.max(2, parseInt(i.value||2)-1);
});
$('#num-plus').addEventListener('click', () => {
  const i = $('#fortune-max'); i.value = parseInt(i.value||10)+1;
});

function showResult(r, opt, fortuneNum) {
  $('#spin-btn').classList.add('hidden');
  $('#free-spin-btn').classList.add('hidden');
  $('#fortune-area').classList.add('hidden');
  $('#result-area').classList.remove('hidden');

  const rc = r.rarity_color || '#b06b20';
  $('#result-rarity-bar').style.cssText = `height:5px;background:${rc};box-shadow:0 0 10px ${rc}88`;

  const img = $('#result-img');
  if (opt?.img) { img.src = opt.img; img.style.display = 'block'; }
  else img.style.display = 'none';

  if (fortuneNum !== null) {
    $('#result-name').textContent = '¡Número de la Fortuna!';
    $('#result-desc').textContent = 'Tu número de PJ es:';
    $('#result-number').textContent = fortuneNum;
  } else {
    $('#result-name').textContent = opt?.name || 'Resultado';
    $('#result-desc').textContent = opt?.desc || '';
    $('#result-number').textContent = '';
  }

  const nextBtn = $('#result-next');
  nextBtn.classList.add('hidden');
}

$('#result-restart').addEventListener('click', () => {
  $('#roulette-overlay').classList.add('hidden');
  freeSpinsUsed = {}; // resetea giros gratis al cerrar
  session.stack = [];
  renderGrid(); // refresca contador tickets
});
$('#result-next').addEventListener('click', () => {
  if (session.stack.length > 1) { session.stack.pop(); showCurrentStep(); }
  else $('#roulette-overlay').classList.add('hidden');
});

/* ── Partículas ───────────────────────────────────── */
(function(){
  const c = $('#particles-canvas'); if(!c) return;
  const ctx = c.getContext('2d'); let W,H,P=[];
  function resize(){ W=c.width=innerWidth; H=c.height=innerHeight; }
  resize(); window.addEventListener('resize',resize);
  for(let i=0;i<50;i++) P.push({x:Math.random()*2000,y:Math.random()*2000,r:Math.random()*2.5+.5,s:Math.random()*.3+.05,d:(Math.random()-.5)*.15,a:Math.random()*.3+.05});
  function frame(){ ctx.clearRect(0,0,W,H); P.forEach(p=>{ p.y-=p.s; p.x+=p.d; if(p.y<-5){p.y=H+5;p.x=Math.random()*W;} ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=`rgba(180,130,60,${p.a})`;ctx.fill(); }); requestAnimationFrame(frame); }
  frame();
})();

/* ── INIT ─────────────────────────────────────────── */
(async () => {
  renderNav();
  await loadData();
  renderGrid();
  await MusicPlayer.init();
})();
