# Mudae Wheel of Fate

Este proyecto está preparado para un hosting compartido con Apache + PHP + MySQL y mantiene una interfaz visual más limpia para el panel de administración.

## Qué cambia
- El backend se ejecuta con PHP y MySQL mediante [public/api.php](public/api.php).
- El frontend estático vive en [public](public) y la vista de administración se sirve desde [public/admin.html](public/admin.html).
- El archivo [.htaccess](.htaccess) redirige las peticiones `/api/*` al backend PHP y sirve el resto desde la carpeta pública.

## Mejoras aplicadas
- Se ha reforzado la vista de administración para que cargue de forma más robusta y muestre mensajes claros si faltan credenciales o la API no responde.
- Se ha eliminado contenido duplicado y carpetas de salida que no se usan en la web principal.
- Se ha dejado una estructura más ordenada para el frontend y la administración.

## Despliegue recomendado en 125 MB
1. Sube toda la carpeta al hosting.
2. Asegúrate de que Apache tenga activado `mod_rewrite`.
3. La página principal debe quedar en [index.html](index.html) en la raíz del hosting.
4. Importa [schema.sql](schema.sql) en MySQL.
5. Ajusta las credenciales de base de datos en [.env](.env) o en [public/api.php](public/api.php).

## Rutas principales
- Sitio: `/`
- Panel admin: `/admin.html`
- API: `/api/...`

## Notas
- No necesitas `npm install` para este hosting.
- El panel de administración funciona mejor cuando hay una sesión válida de administrador y la base de datos responde.
