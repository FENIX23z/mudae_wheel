// public/js/api.js — Cliente API compartido
'use strict';

const API = {
  base: '/api',

  token() { return localStorage.getItem('mwf_token') || ''; },
  user()  {
    try { return JSON.parse(localStorage.getItem('mwf_user') || 'null'); }
    catch { return null; }
  },
  isAdmin() { return this.user()?.role === 'admin'; },
  isLoggedIn() { return !!this.token(); },

  setSession(token, user) {
    localStorage.setItem('mwf_token', token);
    localStorage.setItem('mwf_user', JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem('mwf_token');
    localStorage.removeItem('mwf_user');
  },

  async req(method, path, body) {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-token': this.token(),
      },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(this.base + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  get(path)         { return this.req('GET',    path); },
  post(path, body)  { return this.req('POST',   path, body); },
  put(path, body)   { return this.req('PUT',    path, body); },
  del(path)         { return this.req('DELETE', path); },
};

// Guard de sesión: redirige si no está logueado
function requireLogin(redirectTo = '/login.html') {
  if (!API.isLoggedIn()) { window.location.href = redirectTo; return false; }
  return true;
}
function requireAdmin() {
  if (!requireLogin()) return false;
  if (!API.isAdmin()) { window.location.href = '/user.html'; return false; }
  return true;
}
