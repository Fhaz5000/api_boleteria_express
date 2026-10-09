# API Boletería

API en Node.js/Express que conecta la **APP .NET** y la **web de validación QR** con la base MySQL de Hostinger. Ninguno de los dos clientes se conecta directo a MySQL.

## Configuración

Copie `.env.example` a `.env` y llene los valores:

| Variable | Valor |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Datos de la base MySQL de Hostinger |
| `HMAC_KEY` | La misma que `Seguridad:HmacKey` en `appsettings.json` de la APP .NET |
| `JWT_SECRET` | Cadena larga y aleatoria para firmar las sesiones |
| `PORT` | Puerto local (los hostings como Render lo asignan solos) |

```
npm install
npm start
```

Comprobar: `GET /api/salud` debe responder `{"ok":true,"mysql":"conectado"}`.

## Rutas

| Ruta | Quién la usa | Acceso |
| --- | --- | --- |
| `GET /api/boleto/check?token=` | Web: al abrir el QR | Pública (desde las 3:00 PM hora Colombia) |
| `POST /api/boleto/comprar` | Web: formulario de validación | Pública (desde las 3:00 PM hora Colombia) |
| `POST /api/boleto/validar` | Ruta de la API anterior | Pública |
| `GET /api/sorteo/hoy` | Sorteo del día | Pública |
| `POST /api/auth/login` | APP .NET: inicio de sesión | Pública; devuelve el token |
| `/api/temas`, `/api/sorteos`, `/api/boletas` | APP .NET | Token + permiso del rol |
| `/api/usuarios`, `/api/roles` | APP .NET | Token de SUPERADMIN |

## Publicar en Render

1. New → Web Service, con la carpeta `Api/api_boleteria_express` como *Root Directory*.
2. Build command `npm install`, start command `npm start`.
3. En *Environment* cree las mismas variables del `.env`.
4. En Hostinger → Bases de datos → **MySQL remoto**, permita conexiones desde cualquier host (`%`): Render no tiene IP fija.
5. Ponga la dirección de Render (`https://<servicio>.onrender.com/api`) en:
   - APP .NET: `appsettings.json` → `Api:BaseUrl`
   - Web: `assets/config.js` → `window.API_URL`

En el plan gratuito, Render duerme el servicio tras 15 minutos sin uso; la primera petición tarda unos 50 segundos.
