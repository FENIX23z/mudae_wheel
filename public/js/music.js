// public/js/music.js — Reproductor YouTube CORREGIDO
// Usa postMessage API para controlar el iframe sin CORS
'use strict';

const MusicPlayer = {
  playlist: [],
  currentIndex: 0,
  shuffle: false,
  loop: true,
  volume: 50,
  playing: false,
  ready: false,
  frame: null,
  pollTimer: null,

  async init() {
    this.frame = document.getElementById('yt-frame');
    if (!this.frame) return;

    // Carga playlist desde API
    try {
      const tracks = await API.get('/playlist');
      this.playlist = tracks;
    } catch(e) { this.playlist = []; }

    this._updateBar();

    if (this.playlist.length) {
      this.loadTrack(0, false);
    }

    // Controles de la barra
    const tog  = document.getElementById('music-toggle');
    const prev = document.getElementById('music-prev');
    const next = document.getElementById('music-next');
    const vol  = document.getElementById('music-vol');

    tog?.addEventListener('click', () => this.toggle());
    prev?.addEventListener('click', () => this.prev());
    next?.addEventListener('click', () => this.next());
    vol?.addEventListener('input', e => {
      this.volume = +e.target.value;
      this._postCmd('setVolume', this.volume);
      document.getElementById('vol-icon').textContent = this.volume > 0 ? '🔊' : '🔇';
    });

    // Escucha mensajes del iframe
    window.addEventListener('message', e => {
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (d.event === 'onStateChange') {
          // 1=playing, 2=paused, 0=ended
          this.playing = d.info === 1;
          this._updateBar();
          if (d.info === 0 && (this.loop || this.shuffle)) this.next();
        }
        if (d.event === 'onReady') {
          this.ready = true;
          this._postCmd('setVolume', this.volume);
        }
      } catch {}
    });
  },

  extractId(url) {
    if (!url) return null;
    const m = url.match(/(?:youtu\.be\/|[?&]v=|embed\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  },

  loadTrack(index, autoplay = true) {
    if (!this.playlist.length || !this.frame) return;
    this.currentIndex = index;
    const track = this.playlist[index];
    if (!track) return;
    const vid = this.extractId(track.youtube_url || track.url || '');
    if (!vid) return;

    // Construye URL con enablejsapi=1 para postMessage
    const src = `https://www.youtube.com/embed/${vid}?enablejsapi=1&autoplay=${autoplay?1:0}&controls=0&rel=0&loop=0&origin=${encodeURIComponent(location.origin)}`;
    this.frame.src = src;
    this.playing = autoplay;
    this._updateBar();
  },

  _postCmd(func, value) {
    if (!this.frame?.contentWindow) return;
    try {
      this.frame.contentWindow.postMessage(
        JSON.stringify({ event:'command', func, args: value !== undefined ? [value] : [] }),
        '*'
      );
    } catch {}
  },

  play()   { this._postCmd('playVideo');   this.playing = true;  this._updateBar(); },
  pause()  { this._postCmd('pauseVideo');  this.playing = false; this._updateBar(); },
  toggle() { this.playing ? this.pause() : this.play(); },

  next() {
    if (!this.playlist.length) return;
    const idx = this.shuffle
      ? Math.floor(Math.random() * this.playlist.length)
      : (this.currentIndex + 1) % this.playlist.length;
    this.loadTrack(idx, true);
  },

  prev() {
    if (!this.playlist.length) return;
    const idx = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
    this.loadTrack(idx, true);
  },

  setVolume(v) {
    this.volume = v;
    this._postCmd('setVolume', v);
    const el = document.getElementById('music-vol');
    if (el) el.value = v;
  },

  _updateBar() {
    const titleEl = document.getElementById('music-title');
    const togEl   = document.getElementById('music-toggle');
    if (!titleEl) return;
    const track = this.playlist[this.currentIndex];
    titleEl.textContent = track ? `♪ ${track.title || track.youtube_url}` : '♪ Sin música';
    if (togEl) togEl.textContent = this.playing ? '⏸' : '▶';
  },

  // Añade pista y recarga lista
  async addTrack(url, title) {
    await API.post('/playlist', { youtube_url: url, title });
    const tracks = await API.get('/playlist');
    this.playlist = tracks;
    this._updateBar();
    return tracks;
  },

  async removeTrack(id) {
    await API.del(`/playlist/${id}`);
    const tracks = await API.get('/playlist');
    this.playlist = tracks;
    if (this.currentIndex >= this.playlist.length) this.currentIndex = 0;
    if (this.playlist.length) this.loadTrack(this.currentIndex, false);
    this._updateBar();
    return tracks;
  },
};
