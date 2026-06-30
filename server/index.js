// server/index.js — Servidor Express completo
'use strict';
require('dotenv').config();
const express = require('express');
const mysql   = require('mysql2/promise');
const crypto  = require('crypto');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Pool MySQL ──────────────────────────────────────────────
const pool = mysql.createPool({
  host:     process.env.DB_HOST || 'fdb1031.125mb.com',
  port:     parseInt(process.env.DB_PORT || '3306'),
  user:     process.env.DB_USER || '4694716_4694716',
  password: process.env.DB_PASSWORD || 'P@ssw0rd',
  database: process.env.DB_NAME || '4694716_4694716',
  charset:  'utf8mb4',
  waitForConnections: true,
  connectionLimit: 5,
});

pool.getConnection()
  .then(c => { console.log('✅ MySQL conectado'); c.release(); })
  .catch(e => console.error('❌ MySQL:', e.message));

// ── Helpers ─────────────────────────────────────────────────
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const genId  = () => 'r' + crypto.randomBytes(4).toString('hex');

// Auth middleware — lee header x-token → devuelve usuario
async function auth(req, res, next) {
  const token = req.headers['x-token'];
  if (!token) return res.status(401).json({ error: 'Sin sesión' });
  try {
    const [rows] = await pool.query(
      'SELECT id,username,role FROM users WHERE SHA2(CONCAT(id,username,"mudae_secret"),256)=? LIMIT 1',
      [token]
    );
    if (!rows.length) return res.status(401).json({ error: 'Token inválido' });
    req.user = rows[0];
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Solo admins' });
  next();
}

function makeToken(user) {
  return crypto.createHash('sha256')
    .update(`${user.id}${user.username}mudae_secret`)
    .digest('hex');
}

// ════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Datos incompletos' });
  if (username.length < 3) return res.status(400).json({ error: 'Usuario demasiado corto (mín 3)' });
  if (password.length < 4) return res.status(400).json({ error: 'Contraseña demasiado corta (mín 4)' });
  try {
    const [ex] = await pool.query('SELECT id FROM users WHERE username=?', [username]);
    if (ex.length) return res.status(409).json({ error: 'Nombre de usuario ya existe' });
    const [r] = await pool.query(
      'INSERT INTO users (username,password,role) VALUES (?,?,?)',
      [username, sha256(password), 'user']
    );
    const user = { id: r.insertId, username, role: 'user' };
    res.json({ ok: true, token: makeToken(user), user: { id: user.id, username, role: 'user' } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await pool.query(
      'SELECT id,username,role FROM users WHERE username=? AND password=?',
      [username, sha256(password)]
    );
    if (!rows.length) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const user = rows[0];
    res.json({ ok: true, token: makeToken(user), user: { id: user.id, username: user.username, role: user.role } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/me', auth, (req, res) => {
  res.json({ user: req.user });
});

app.put('/api/me/password', auth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'Contraseña demasiado corta' });
  try {
    const [rows] = await pool.query('SELECT id FROM users WHERE id=? AND password=?', [req.user.id, sha256(oldPassword)]);
    if (!rows.length) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    await pool.query('UPDATE users SET password=? WHERE id=?', [sha256(newPassword), req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
// USUARIOS (admin)
// ════════════════════════════════════════════════════════════
app.get('/api/users', auth, adminOnly, async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT id,username,role,created_at FROM users ORDER BY id');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/users/:id/role', auth, adminOnly, async (req, res) => {
  const { role } = req.body;
  if (!['admin','user'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });
  try {
    await pool.query('UPDATE users SET role=? WHERE id=?', [role, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', auth, adminOnly, async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
  try {
    await pool.query('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
// TICKETS
// ════════════════════════════════════════════════════════════
// GET mis tickets
app.get('/api/tickets', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.id AS rarity_id, r.name, r.color, r.\`order\`,
             COALESCE(t.qty,0) AS qty
      FROM rarities r
      LEFT JOIN user_tickets t ON t.user_id=? AND t.rarity_id=r.id
      ORDER BY r.\`order\``, [req.user.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET tickets de cualquier usuario (admin)
app.get('/api/tickets/:userId', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.id AS rarity_id, r.name, r.color, r.\`order\`,
             COALESCE(t.qty,0) AS qty
      FROM rarities r
      LEFT JOIN user_tickets t ON t.user_id=? AND t.rarity_id=r.id
      ORDER BY r.\`order\``, [req.params.userId]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/tickets/:userId — admin da/quita tickets
app.put('/api/tickets/:userId', auth, adminOnly, async (req, res) => {
  const { rarity_id, delta } = req.body; // delta: +N o -N
  if (!rarity_id || delta === undefined) return res.status(400).json({ error: 'Faltan datos' });
  try {
    await pool.query(`
      INSERT INTO user_tickets (user_id, rarity_id, qty)
      VALUES (?, ?, GREATEST(0, ?))
      ON DUPLICATE KEY UPDATE qty = GREATEST(0, qty + ?)`,
      [req.params.userId, rarity_id, Math.max(0, delta), delta]);
    const [[row]] = await pool.query(
      'SELECT qty FROM user_tickets WHERE user_id=? AND rarity_id=?',
      [req.params.userId, rarity_id]);
    res.json({ ok: true, qty: row?.qty ?? 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/tickets/craft — craftear (9 de rareza N → 1 de rareza N+1)
app.post('/api/tickets/craft', auth, async (req, res) => {
  const { from_rarity_id } = req.body;
  const fromId = parseInt(from_rarity_id);
  if (fromId < 1 || fromId > 5) return res.status(400).json({ error: 'No se puede craftear desde esa rareza' });
  const toId = fromId + 1;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(
      'SELECT qty FROM user_tickets WHERE user_id=? AND rarity_id=? FOR UPDATE',
      [req.user.id, fromId]);
    const qty = row?.qty ?? 0;
    if (qty < 9) { await conn.rollback(); return res.status(400).json({ error: `Necesitas 9 tickets. Tienes ${qty}.` }); }
    await conn.query(
      'UPDATE user_tickets SET qty=qty-9 WHERE user_id=? AND rarity_id=?',
      [req.user.id, fromId]);
    await conn.query(`
      INSERT INTO user_tickets (user_id,rarity_id,qty) VALUES (?,?,1)
      ON DUPLICATE KEY UPDATE qty=qty+1`, [req.user.id, toId]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally { conn.release(); }
});

// POST /api/tickets/spend — gastar 1 ticket para girar
app.post('/api/tickets/spend', auth, async (req, res) => {
  const { rarity_id } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(
      'SELECT qty FROM user_tickets WHERE user_id=? AND rarity_id=? FOR UPDATE',
      [req.user.id, rarity_id]);
    if (!row || row.qty < 1) {
      await conn.rollback();
      return res.status(400).json({ error: 'No tienes tickets de esa rareza' });
    }
    await conn.query(
      'UPDATE user_tickets SET qty=qty-1 WHERE user_id=? AND rarity_id=?',
      [req.user.id, rarity_id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally { conn.release(); }
});

// ════════════════════════════════════════════════════════════
// RULETAS
// ════════════════════════════════════════════════════════════
app.get('/api/roulettes', async (_req, res) => {
  try {
    const [roulettes] = await pool.query(`
      SELECT r.*, ra.name AS rarity_name, ra.color AS rarity_color
      FROM roulettes r
      JOIN rarities ra ON ra.id=r.rarity_id
      WHERE r.is_active=1 ORDER BY r.sort_order, r.created_at`);
    const [options] = await pool.query(
      'SELECT * FROM roulette_options ORDER BY sort_order');
    const [users] = await pool.query('SELECT id, username FROM users ORDER BY id');
    const result = roulettes.map(r => {
      let rouletteOptions = options.filter(o => o.roulette_id === r.id).map(o => ({
        id: o.id, name: o.name||'', desc: o.description||'',
        img: o.image_url||'', prob: parseFloat(o.probability)||0,
        childRouletteId: o.child_roulette_id||'',
        givesTicketRarityId: o.gives_ticket_rarity_id ? Number(o.gives_ticket_rarity_id) : null,
      }));
      if (r.type === 'users') {
        rouletteOptions = users.map(u => ({
          id: `user-${u.id}`,
          name: u.username,
          desc: `Usuario #${u.id}`,
          img: '',
          prob: 1,
          childRouletteId: '',
          givesTicketRarityId: null,
        }));
      }
      return {
        ...r,
        adaptSize: !!r.adapt_size,
        img: r.image_url || '',
        desc: r.description || '',
        spin_mode: r.spin_mode || 'normal',
        free_spin_cooldown_seconds: Number(r.free_spin_cooldown_seconds || 0),
        options: rouletteOptions,
      };
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/roulette/free-spin-status/:rouletteId', auth, async (req, res) => {
  try {
    const [[roulette]] = await pool.query(
      'SELECT id, spin_mode, free_spin_cooldown_seconds FROM roulettes WHERE id=?',
      [req.params.rouletteId]);
    if (!roulette || roulette.spin_mode !== 'free') {
      return res.json({ enabled: false, remaining_seconds: 0 });
    }
    const cooldown = Number(roulette.free_spin_cooldown_seconds || 0);
    const [[state]] = await pool.query(
      'SELECT last_used_at FROM roulette_free_spin_state WHERE user_id=? AND roulette_id=?',
      [req.user.id, req.params.rouletteId]);
    if (!state?.last_used_at) return res.json({ enabled: true, remaining_seconds: 0 });
    const [[diffRow]] = await pool.query(
      'SELECT TIMESTAMPDIFF(SECOND, ?, NOW()) AS diff',
      [state.last_used_at]);
    const diff = Number(diffRow?.diff || 0);
    const remaining = Math.max(0, cooldown - diff);
    res.json({ enabled: remaining <= 0, remaining_seconds: remaining });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/roulette/free-spin', auth, async (req, res) => {
  const { roulette_id } = req.body;
  try {
    const [[roulette]] = await pool.query(
      'SELECT id, spin_mode, free_spin_cooldown_seconds FROM roulettes WHERE id=?',
      [roulette_id]);
    if (!roulette || roulette.spin_mode !== 'free') {
      return res.status(400).json({ error: 'Esta ruleta no tiene giro gratis' });
    }
    const cooldown = Number(roulette.free_spin_cooldown_seconds || 0);
    const [[state]] = await pool.query(
      'SELECT last_used_at FROM roulette_free_spin_state WHERE user_id=? AND roulette_id=?',
      [req.user.id, roulette_id]);
    if (state?.last_used_at) {
      const [[diffRow]] = await pool.query(
        'SELECT TIMESTAMPDIFF(SECOND, ?, NOW()) AS diff',
        [state.last_used_at]);
      const diff = Number(diffRow?.diff || 0);
      if (diff < cooldown) {
        return res.status(400).json({ error: 'Cooldown activo', remaining_seconds: Math.max(0, cooldown - diff) });
      }
    }
    await pool.query(
      'INSERT INTO roulette_free_spin_state (user_id, roulette_id, last_used_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE last_used_at=NOW()',
      [req.user.id, roulette_id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/roulettes', auth, adminOnly, async (req, res) => {
  const { id, name, type, rarity_id, desc, img, adaptSize, spin_mode, free_spin_cooldown_seconds, options=[] } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  const rid = id || genId();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'INSERT INTO roulettes (id,name,description,image_url,type,rarity_id,adapt_size,spin_mode,free_spin_cooldown_seconds) VALUES (?,?,?,?,?,?,?,?,?)',
      [rid, name, desc||'', img||'', type||'normal', rarity_id||1, adaptSize?1:0, spin_mode||'normal', Number(free_spin_cooldown_seconds||0)]);
    await _insertOptions(conn, rid, options);
    await conn.commit();
    res.json({ ok:true, id: rid });
  } catch (e) { await conn.rollback(); res.status(500).json({ error: e.message }); }
  finally { conn.release(); }
});

app.put('/api/roulettes/:id', auth, adminOnly, async (req, res) => {
  const { name, type, rarity_id, desc, img, adaptSize, options=[] } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'UPDATE roulettes SET name=?,description=?,image_url=?,type=?,rarity_id=?,adapt_size=?,spin_mode=?,free_spin_cooldown_seconds=? WHERE id=?',
      [name, desc||'', img||'', type||'normal', rarity_id||1, adaptSize?1:0, spin_mode||'normal', Number(free_spin_cooldown_seconds||0), req.params.id]);
    await conn.query('DELETE FROM roulette_options WHERE roulette_id=?', [req.params.id]);
    await _insertOptions(conn, req.params.id, options);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); res.status(500).json({ error: e.message }); }
  finally { conn.release(); }
});

app.delete('/api/roulettes/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('UPDATE roulette_options SET child_roulette_id=NULL WHERE child_roulette_id=?', [req.params.id]);
    await pool.query('DELETE FROM roulettes WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function _insertOptions(conn, rouletteId, options) {
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    const oid = (o.id && o.id.startsWith('r')) ? o.id : genId();
    await conn.query(
      'INSERT INTO roulette_options (id,roulette_id,name,description,image_url,probability,child_roulette_id,gives_ticket_rarity_id,sort_order) VALUES (?,?,?,?,?,?,?,?,?)',
      [oid, rouletteId, o.name||'', o.desc||'', o.img||'', o.prob||0, o.childRouletteId||null, o.givesTicketRarityId || null, i]);
  }
}

// ── Spin log ─────────────────────────────────────────────────
app.post('/api/spin-log', auth, async (req, res) => {
  const { roulette_id, option_id, fortune_result } = req.body;
  try {
    await pool.query(
      'INSERT INTO spin_log (user_id,roulette_id,option_id,fortune_result) VALUES (?,?,?,?)',
      [req.user.id, roulette_id, option_id||null, fortune_result||null]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
// PLAYLIST
// ════════════════════════════════════════════════════════════
app.get('/api/playlist', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM playlist_tracks ORDER BY sort_order,id');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/playlist', auth, adminOnly, async (req, res) => {
  const { youtube_url, title } = req.body;
  if (!youtube_url) return res.status(400).json({ error: 'URL requerida' });
  try {
    const [r] = await pool.query(
      'INSERT INTO playlist_tracks (youtube_url,title,sort_order) VALUES (?,?,999)',
      [youtube_url, title||youtube_url]);
    res.json({ ok:true, id: r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/playlist/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM playlist_tracks WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
// SETTINGS (info page)
// ════════════════════════════════════════════════════════════
app.get('/api/settings', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT k,v FROM app_settings');
    const obj = {};
    rows.forEach(r => { obj[r.k] = r.v; });
    res.json(obj);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings', auth, adminOnly, async (req, res) => {
  try {
    for (const [k, v] of Object.entries(req.body)) {
      await pool.query('INSERT INTO app_settings (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=?', [k,v,v]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🎡 Mudae en http://localhost:${PORT}`));
