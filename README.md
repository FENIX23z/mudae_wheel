# ⚙️ Mudae Wheel of Fate — Guía de instalación

## Estructura de archivos

```
mudae-wheel-of-fate/
├── server/
│   └── index.js          ← Servidor Node.js + todas las rutas API
├── public/
│   ├── index.html        ← Vista pública: ruletas
│   ├── login.html        ← Login y registro
│   ├── user.html         ← Perfil de usuario (inventario, crafteo, info)
│   ├── admin.html        ← Panel de administración
│   ├── css/
│   │   ├── shared.css    ← Estilos compartidos (steampunk)
│   │   ├── index.css     ← Estilos página principal
│   │   └── admin.css     ← Estilos panel admin
│   └── js/
│       ├── api.js        ← Cliente API REST + helpers de sesión
│       ├── wheel.js      ← Motor de ruleta Canvas + ProbManager
│       ├── music.js      ← Reproductor YouTube iframe
│       ├── index.js      ← Lógica página principal
│       └── admin.js      ← Lógica panel admin
├── schema.sql            ← Schema completo MySQL
├── package.json
└── .env.example
```

---

## 1. Base de datos MySQL

1. Accede a tu panel de 125mb.com → phpMyAdmin.
2. Selecciona la base de datos `4694716_4694716`.
3. Ve a la pestaña **SQL** y pega el contenido de `schema.sql`.
4. Haz clic en **Ejecutar**.

Esto crea todas las tablas y el usuario admin inicial:
- **Usuario:** `marcosplpp`
- **Contraseña:** `P@ssw0rd`

---

## 2. Servidor Node.js

### Requisitos
- Node.js 16+
- Acceso a MySQL desde donde corras el servidor

### Instalación

```bash
# 1. Entra al directorio
cd mudae-wheel-of-fate

# 2. Instala dependencias
npm install

# 3. Crea el archivo .env
cp .env.example .env
# Edita .env con tu contraseña real de MySQL

# 4. Arranca el servidor
npm start
# → http://localhost:3000
```

---

## 3. Hosting en 125mb.com

125mb.com **no soporta Node.js directamente** (es hosting PHP compartido).
Tienes dos opciones:

### Opción A — Servidor externo (recomendado)
Despliega el servidor Node.js en:
- **Railway.app** (gratis, fácil)
- **Render.com** (gratis)
- **Fly.io** (gratis tier)

Y apunta el DNS de tu dominio de 125mb a ese servidor.

En Railway/Render:
1. Sube la carpeta al repositorio de GitHub.
2. Conecta el repo en Railway → `npm start`.
3. Añade las variables de entorno desde `.env.example`.

### Opción B — Solo frontend estático en 125mb
Sube los archivos de `public/` al servidor FTP de 125mb.
Cambia en `api.js`:
```js
base: 'https://TU-SERVIDOR-RAILWAY.railway.app/api',
```

---

## 4. Páginas y acceso

| URL | Descripción |
|-----|-------------|
| `/` | Ruletas públicas |
| `/login.html` | Login / Registro |
| `/user.html` | Perfil usuario (requiere login) |
| `/admin.html` | Panel admin (requiere rol admin) |

---

## 5. Roles

| Rol | Permisos |
|-----|----------|
| `user` | Ver ruletas, girar (con ticket), gestionar perfil, craftear |
| `admin` | Todo lo anterior + gestionar ruletas, usuarios, tickets y playlist |

---

## 6. Sistema de tickets

- Cada ruleta tiene una **rareza** (Común → Mítico).
- Para girar necesitas **1 ticket de esa rareza**.
- El admin puede **dar o quitar tickets** desde el panel → Tickets.
- Los usuarios pueden **craftear**: 9 tickets de rareza N → 1 de rareza N+1.

### Crafteo
| Receta | Resultado |
|--------|-----------|
| 9 × Común | 1 × Inusual |
| 9 × Inusual | 1 × Raro |
| 9 × Raro | 1 × Épico |
| 9 × Épico | 1 × Legendario |
| 9 × Legendario | 1 × Mítico |

---

## 7. Ruleta de la Fortuna

- La ruleta muestra los **números del 2 al máximo** que el usuario introduce.
- El motor calcula el sector exacto y anima el giro hasta el número correcto.
- Soporta hasta ~50 números con buena legibilidad.

---

## 8. Música de fondo

- Añade URLs de YouTube desde **Admin → Playlist**.
- La música arranca en la barra inferior de todas las páginas.
- Controles: play/pausa, anterior, siguiente, volumen.
- Usa el API de YouTube iframe con postMessage (sin CORS).

---

## 9. API REST (resumen)

```
POST /api/register          Crear cuenta
POST /api/login             Iniciar sesión → token
GET  /api/me                Usuario actual

GET  /api/roulettes         Lista de ruletas con opciones
POST /api/roulettes         Crear ruleta (admin)
PUT  /api/roulettes/:id     Editar ruleta (admin)
DEL  /api/roulettes/:id     Eliminar ruleta (admin)

GET  /api/tickets           Mis tickets
GET  /api/tickets/:userId   Tickets de usuario (admin)
PUT  /api/tickets/:userId   Dar/quitar tickets (admin)
POST /api/tickets/craft     Craftear tickets
POST /api/tickets/spend     Gastar 1 ticket al girar

GET  /api/users             Lista usuarios (admin)
PUT  /api/users/:id/role    Cambiar rol (admin)
DEL  /api/users/:id         Eliminar usuario (admin)

GET  /api/playlist          Playlist
POST /api/playlist          Añadir canción (admin)
DEL  /api/playlist/:id      Eliminar canción (admin)

GET  /api/settings          Configuración pública
PUT  /api/settings          Guardar configuración (admin)
```

---

## 10. Seguridad

- Las contraseñas se guardan como **SHA-256** en MySQL.
- La autenticación usa un **token derivado** (no hay sesiones en servidor).
- El token se guarda en `localStorage` del navegador.
- Para producción real: migra a bcrypt + JWT con expiración.
