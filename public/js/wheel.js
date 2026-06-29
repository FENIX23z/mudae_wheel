// public/js/wheel.js — Motor de ruleta Canvas MEJORADO
'use strict';

const RARITIES = {
  1:{label:'Común',      color:'#9a9a9a',glow:'rgba(154,154,154,.5)'},
  2:{label:'Inusual',    color:'#4caf50',glow:'rgba(76,175,80,.5)'},
  3:{label:'Raro',       color:'#2196f3',glow:'rgba(33,150,243,.5)'},
  4:{label:'Épico',      color:'#9c27b0',glow:'rgba(156,39,176,.5)'},
  5:{label:'Legendario', color:'#ffc107',glow:'rgba(255,193,7,.6)'},
  6:{label:'Mítico',     color:'#e53935',glow:'rgba(229,57,53,.6)'},
};

// Mapeo de nombre de rareza → id
const RARITY_NAME_MAP = {
  'common':1,'uncommon':2,'rare':3,'epic':4,'legendary':5,'mythic':6,
  'común':1,'inusual':2,'raro':3,'épico':4,'legendario':5,'mítico':6,
};

function rarityById(id){ return RARITIES[id] || RARITIES[1]; }
function rarityByName(n){ return RARITIES[RARITY_NAME_MAP[n?.toLowerCase()]||1]; }

/* ═══════════════════════════════════════════════════
   WheelEngine
   ═══════════════════════════════════════════════════ */
const WheelEngine = {
  canvas: null, ctx: null,
  options: [],        // [{name, prob, img, childRouletteId, ...}]
  currentAngle: 0,
  spinning: false,
  adaptSize: false,
  rarityColor: '#b06b20',

  // Paleta steampunk — 24 colores para soportar muchas opciones
  PALETTE: [
    ['#5C2D06','#9B4F10'],['#1A3A0A','#2E6E15'],['#0A1F3A','#1A4E7A'],
    ['#3A0A3A','#722E72'],['#3A2800','#7A5500'],['#0A2A20','#1A5A40'],
    ['#2A1500','#6A3500'],['#220A0A','#5A1A1A'],['#1A1A3A','#3A3A7A'],
    ['#2A2A0A','#5A5A1A'],['#0A2A2A','#1A6060'],['#2A0A1A','#6A1A3A'],
    ['#1A2A1A','#3A5A3A'],['#2A1A00','#5A3A00'],['#0A0A2A','#1A1A5A'],
    ['#2A0A0A','#5A1010'],['#001A2A','#0A3A5A'],['#1A001A','#3A003A'],
    ['#002A1A','#005A3A'],['#2A2000','#5A4A00'],['#001A1A','#003A3A'],
    ['#1A0A2A','#3A1A5A'],['#2A1A1A','#5A3A3A'],['#0A1A0A','#1A3A1A'],
  ],

  init(canvas, options, adaptSize, rarityId) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = options || [];
    this.adaptSize = !!adaptSize;
    this.currentAngle = 0;
    this.rarityColor = rarityById(rarityId||1).color;
    this.draw();
  },

  /* ── Ángulos de cada sector ── */
  getSegmentAngles() {
    const opts = this.options;
    if (!opts.length) return [];
    if (this.adaptSize) {
      const total = opts.reduce((s,o) => s + (parseFloat(o.prob)||1), 0) || opts.length;
      let start = 0;
      return opts.map(o => {
        const a = ((parseFloat(o.prob)||1) / total) * Math.PI * 2;
        const seg = { start, end: start + a };
        start += a;
        return seg;
      });
    }
    const a = (Math.PI * 2) / opts.length;
    return opts.map((_,i) => ({ start: i*a, end: (i+1)*a }));
  },

  /* ══════════════════════════════════
     DRAW  — texto completamente reescrito
     Soporta N opciones sin límite.
     ══════════════════════════════════ */
  draw() {
    const { canvas, ctx, options: opts, currentAngle, PALETTE } = this;
    if (!canvas) return;
    const W = canvas.width, H = canvas.height;
    const cx = W/2, cy = H/2;
    const R  = Math.min(W,H)/2 - 10;
    ctx.clearRect(0,0,W,H);

    if (!opts.length) {
      this._drawEmpty(cx, cy, R);
      return;
    }

    const segs = this.getSegmentAngles();
    const n = opts.length;

    /* ── Sectores ── */
    segs.forEach((seg, i) => {
      const [c1, c2] = PALETTE[i % PALETTE.length];
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, currentAngle + seg.start, currentAngle + seg.end);
      ctx.closePath();
      const grad = ctx.createRadialGradient(cx,cy,R*0.08,cx,cy,R);
      grad.addColorStop(0, c1); grad.addColorStop(1, c2);
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = 'rgba(201,162,39,.4)'; ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    });

    /* ── TEXTO inteligente ──────────────────────────────────
       Estrategia:
       • Calcular la apertura angular de cada sector en grados.
       • Ajustar tamaño de fuente según apertura Y número total de opciones.
       • Para sectores muy pequeños (<5°): solo punto.
       • Para ≤12 opciones normales: texto largo multilinea.
       • Para 13–30: texto una línea, fuente pequeña.
       • Para >30: fuente mínima 7px, una sola línea truncada.
    ─────────────────────────────────────────────────────── */
    segs.forEach((seg, i) => {
      const opt = opts[i];
      const span = seg.end - seg.start;
      const deg  = span * (180 / Math.PI);

      if (deg < 3) return; // demasiado pequeño

      const midAngle = currentAngle + seg.start + span / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(midAngle);

      // Radio donde poner el texto
      const textR = R * 0.68;

      // Ancho de cuerda disponible a textR
      const chordHalf = Math.abs(textR * Math.sin(span / 2));
      const availW = chordHalf * 1.8;

      // Fuente base según número de opciones y ángulo
      let fontSize;
      if (n <= 8)       fontSize = Math.min(16, Math.max(11, chordHalf * 0.42));
      else if (n <= 16) fontSize = Math.min(13, Math.max(9,  chordHalf * 0.36));
      else if (n <= 30) fontSize = Math.min(11, Math.max(8,  chordHalf * 0.32));
      else               fontSize = Math.min(9,  Math.max(7,  chordHalf * 0.28));

      ctx.font = `bold ${fontSize}px "Crimson Text",serif`;
      ctx.fillStyle = '#f0e4c8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,.9)';
      ctx.shadowBlur  = 5;

      const name = opt.name || `#${i+1}`;

      if (deg >= 20 && n <= 20) {
        /* Multilinea */
        const words = name.split(' ');
        const lines = []; let cur = '';
        words.forEach(w => {
          const test = cur ? cur+' '+w : w;
          if (ctx.measureText(test).width > availW && cur) { lines.push(cur); cur = w; }
          else cur = test;
        });
        if (cur) lines.push(cur);
        const lineH = fontSize * 1.28;
        const totalH = lines.length * lineH;
        lines.forEach((line, li) => {
          ctx.fillText(line, textR, -(totalH/2) + (li + .5)*lineH);
        });
        // % si hay espacio
        if (opt.prob && deg > 30) {
          ctx.font = `${Math.max(7, fontSize * 0.72)}px "IM Fell English SC",serif`;
          ctx.fillStyle = 'rgba(200,170,80,.8)';
          ctx.fillText(`${opt.prob}%`, textR, totalH/2 + fontSize*.9);
        }
      } else {
        /* Una sola línea truncada */
        let label = name;
        while (label.length > 1 && ctx.measureText(label).width > availW) {
          label = label.slice(0, -1);
        }
        if (label !== name && label.length > 1) label = label.slice(0, -1) + '…';
        ctx.fillText(label, textR, 0);
      }

      ctx.restore();
    });

    /* ── Anillo exterior ── */
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2);
    ctx.strokeStyle = this.rarityColor; ctx.lineWidth = 5; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx,cy,R-7,0,Math.PI*2);
    ctx.strokeStyle = 'rgba(201,162,39,.25)'; ctx.lineWidth = 2; ctx.stroke();

    /* ── Remaches ── */
    for (let a = 0; a < Math.PI*2; a += Math.PI/4) {
      const rx = cx + (R-12)*Math.cos(a), ry = cy + (R-12)*Math.sin(a);
      ctx.beginPath(); ctx.arc(rx,ry,4,0,Math.PI*2);
      const rg = ctx.createRadialGradient(rx-1,ry-1,0,rx,ry,4);
      rg.addColorStop(0,'#e6c84a'); rg.addColorStop(1,'#7a6015');
      ctx.fillStyle = rg; ctx.fill();
    }

    /* ── Centro ── */
    const cg = ctx.createRadialGradient(cx-2,cy-2,0,cx,cy,24);
    cg.addColorStop(0,'#7a4515'); cg.addColorStop(1,'#1a0a04');
    ctx.beginPath(); ctx.arc(cx,cy,24,0,Math.PI*2);
    ctx.fillStyle = cg; ctx.fill();
    ctx.strokeStyle = '#d4892a'; ctx.lineWidth = 2.5; ctx.stroke();
  },

  _drawEmpty(cx, cy, R) {
    const ctx = this.ctx;
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2);
    ctx.fillStyle='#1a0f04'; ctx.fill();
    ctx.strokeStyle='#6b4520'; ctx.lineWidth=4; ctx.stroke();
    ctx.fillStyle='#5a4535'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font='bold 17px "Crimson Text",serif';
    ctx.fillText('Sin opciones',cx,cy);
  },

  /* ── SPIN ── */
  spin(onResult) {
    if (this.spinning || !this.options.length) return;
    this.spinning = true;
    const picked   = this._weightedPick();
    const segs     = this.getSegmentAngles();
    const seg      = segs[picked];
    const targetMid = seg.start + (seg.end - seg.start) / 2;
    const pointer   = -Math.PI / 2;
    const currentNorm = ((this.currentAngle % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
    let delta = pointer - targetMid - currentNorm;
    delta = ((delta % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
    const totalDelta = (5 + Math.floor(Math.random()*4)) * Math.PI*2 + delta;
    const duration   = 3500 + Math.random()*1500;
    const startAngle = this.currentAngle;
    const startTime  = performance.now();

    const animate = now => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1-t, 4);
      this.currentAngle = startAngle + totalDelta * ease;
      this.draw();
      if (t < 1) requestAnimationFrame(animate);
      else { this.spinning = false; onResult(picked); }
    };
    requestAnimationFrame(animate);
  },

  /* ── FORTUNE SPIN — muestra sectores numerados del 2..max ── */
  spinFortune(max, onResult) {
    if (this.spinning) return;
    // Crear opciones 2..max
    const nums = [];
    for (let i = 2; i <= max; i++) nums.push({ name: String(i), prob: 1 });
    this.options  = nums;
    this.adaptSize = false;
    this.draw();

    this.spinning = true;
    const picked    = Math.floor(Math.random() * nums.length); // índice 0-based → valor = picked+2
    const result    = picked + 2;
    const segs      = this.getSegmentAngles();
    const seg       = segs[picked];
    const targetMid = seg.start + (seg.end - seg.start) / 2;
    const pointer   = -Math.PI / 2;
    const currentNorm = ((this.currentAngle % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
    let delta = pointer - targetMid - currentNorm;
    delta = ((delta % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
    const totalDelta = (5 + Math.floor(Math.random()*4)) * Math.PI*2 + delta;
    const duration   = 3500 + Math.random()*1500;
    const startAngle = this.currentAngle;
    const startTime  = performance.now();

    const animate = now => {
      const t = Math.min((now - startTime) / duration, 1);
      this.currentAngle = startAngle + totalDelta * (1 - Math.pow(1-t, 4));
      this.draw();
      if (t < 1) requestAnimationFrame(animate);
      else { this.spinning = false; onResult(result); }
    };
    requestAnimationFrame(animate);
  },

  _weightedPick() {
    const opts  = this.options;
    const total = opts.reduce((s,o) => s + (parseFloat(o.prob)||1), 0);
    let r = Math.random() * total;
    for (let i = 0; i < opts.length; i++) {
      r -= (parseFloat(opts[i].prob)||1);
      if (r <= 0) return i;
    }
    return opts.length - 1;
  },
};

/* ═══════════════════════════════════════════════════
   Probability manager — autobalanceo automático
   ═══════════════════════════════════════════════════ */
const ProbManager = {
  /* Distribuye 100 de forma equitativa entre N opciones */
  equalDistrib(n) {
    if (n <= 0) return [];
    const base = Math.floor(100 / n);
    const rem  = 100 - base * n;
    return Array.from({length: n}, (_, i) => base + (i < rem ? 1 : 0));
  },

  /* Cuando el usuario cambia el índice `changed` al valor `newVal`,
     reajusta los demás proporcionalemente. */
  adjust(probs, changed, newVal) {
    const n = probs.length;
    if (n === 0) return probs;
    newVal = Math.max(0, Math.min(100, Math.round(newVal)));
    const before  = probs.slice(0, changed).reduce((a,b) => a+b, 0);
    const maxVal  = 100 - before;
    if (newVal > maxVal) newVal = maxVal;

    const result  = [...probs];
    result[changed] = newVal;
    const remaining = maxVal - newVal;
    const rest = probs.slice(changed + 1);
    const restSum = rest.reduce((a,b) => a+b, 0) || 1;
    let leftover = remaining;

    for (let i = changed + 1; i < n; i++) {
      const share = restSum > 0
        ? Math.round((probs[i] / restSum) * remaining)
        : Math.floor(remaining / (n - changed - 1));
      result[i] = share;
      leftover -= share;
    }
    // Ajusta residuo en el último
    if (n > changed + 1) result[n-1] = Math.max(0, result[n-1] + leftover);
    return result;
  },

  /* Normaliza a 100 */
  normalize(probs) {
    const total = probs.reduce((a,b) => a+b, 0);
    if (total === 0) return this.equalDistrib(probs.length);
    const scaled = probs.map(p => (p / total) * 100);
    const floors = scaled.map(Math.floor);
    let used = floors.reduce((a,b) => a+b, 0);
    const order = scaled.map((v,i) => ({i, f: v - floors[i]})).sort((a,b) => b.f - a.f);
    for (let k = 0; k < 100 - used; k++) floors[order[k].i]++;
    return floors;
  },
};
