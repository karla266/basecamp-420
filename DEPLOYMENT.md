# Despliegue de Basecamp 420

Esta guía deja la web en Vercel, la API HTTP y el worker en Railway o Render, y Postgres, Redis y el almacenamiento de grabaciones en servicios gestionados. Los comandos se ejecutan en la raíz del repositorio, donde están `package.json`, `pnpm-workspace.yaml` y `turbo.json`.

No subas `.env` al repositorio. Los secretos viven solo en el panel del hosting.

## Qué se despliega

| Pieza | Paquete | Dónde | Proceso |
| --- | --- | --- | --- |
| Web | `@basecamp/web` | Vercel | Next.js |
| API HTTP | `@basecamp/api` | Railway o Render | `node dist/main.js` |
| Worker | `@basecamp/api` | Railway o Render, segundo servicio | `node dist/worker.js` |
| Base de datos | `@basecamp/db` | Postgres gestionado | Prisma `migrate deploy` |
| Cola | BullMQ | Redis gestionado | la usan la API y el worker |
| Grabaciones | API | almacenamiento compatible con S3 | manifiesto JSON en el bucket |

La API y el worker son dos procesos del mismo paquete. Comparten build y variables. No basta con levantar solo el servidor HTTP: sin el worker, los trabajos de la cola no se ejecutan.

Requisitos del runtime: Node.js 20 o superior y pnpm 10.15.0 (`packageManager` en el `package.json` raíz).

## 1. Postgres

Crea una base Postgres 16 gestionada (Railway, Render, Neon u otro proveedor) y copia la URL de conexión.

`DATABASE_URL` tiene que estar definida en el build y en el runtime. `prisma generate`, que corre dentro del build de `@basecamp/db`, lee esa variable desde el esquema.

Si el proveedor exige TLS, añade `sslmode=require` a la URL. No uses `localhost` ni el puerto 5433: ese puerto es solo el mapeo local de `docker-compose.yml`.

## 2. Redis

Crea un Redis gestionado y copia `REDIS_URL` (`redis://` o `rediss://`).

En producción es obligatoria en los dos procesos. Sin ella, la API arranca pero la cola responde que no está disponible, y el worker escribe `worker.idle` y termina.

## 3. Almacenamiento de grabaciones

Crea un bucket en un servicio compatible con S3 (AWS S3, Cloudflare R2, MinIO u otro). La API no sube el audio: guarda un manifiesto JSON por grabación. Hacen falta las cuatro variables; si falta alguna, el proceso guarda la referencia solo en memoria y se pierde al reiniciar.

El cliente usa región `us-east-1` y path-style. No hay variable de región. El endpoint tiene que aceptar URLs de tipo path (`https://endpoint/bucket/clave`).

## 4. Variables de la API y del worker

Configura el mismo conjunto en el servicio HTTP y en el worker.

| Variable | Obligatoria | Valor en producción |
| --- | --- | --- |
| `DATABASE_URL` | sí | URL del Postgres gestionado |
| `REDIS_URL` | sí | URL del Redis gestionado |
| `AUTH_SECRET` | sí | cadena larga y aleatoria. Firma la sesión |
| `NODE_ENV` | sí | `production`. Activa la cookie `Secure` |
| `WEB_ORIGIN` | sí | origen público de Vercel, sin barra final. Por ejemplo `https://basecamp.vercel.app` |
| `PUBLIC_API_URL` | sí | origen HTTPS público de esta API, sin barra final. Twilio firma contra esta base |
| `API_PORT` | no | déjala sin definir. El proceso escucha `API_PORT` y, si no existe, `PORT` |
| `PORT` | la inyecta el host | no la fijes a mano en Railway ni en Render |
| `API_URL` | no en estos procesos | la usa la web, no la API |
| `TWILIO_ACCOUNT_SID` | para envío real | si falta, junto con el token, se usa el adaptador falso |
| `TWILIO_AUTH_TOKEN` | para envío real | con las dos credenciales, la firma de Twilio es obligatoria |
| `TWILIO_FROM_NUMBER` | recomendada | número de origen. Si falta, el código usa `+15005550006` |
| `S3_ENDPOINT` | sí, para grabaciones | endpoint del bucket, sin barra final |
| `S3_BUCKET` | sí, para grabaciones | nombre del bucket |
| `S3_ACCESS_KEY` | sí, para grabaciones | access key |
| `S3_SECRET_KEY` | sí, para grabaciones | secret key |
| `SMS_RATE_LIMIT_PER_MINUTE` | no | límite por minuto. Si falta, es 30 |
| `SEED_ADMIN_EMAIL` | solo para el seed | email del `platform_admin` |
| `SEED_ADMIN_PASSWORD` | solo para el seed | mínimo 8 caracteres |

`NODE_ENV=production` tiene que estar en los dos procesos. Railway no siempre la define solo.

No definas `API_PORT` en Railway ni en Render. Esas plataformas inyectan `PORT` y enrutan el tráfico hacia ese puerto. Si copias `API_PORT=3001` del ejemplo local, el proceso escucha 3001 y el proxy del host no lo alcanza.

## 5. API HTTP y worker

Los dos servicios salen del mismo repositorio y de la raíz del monorepo, no de `apps/api`. El directorio raíz del servicio es el del repo.

Build, igual para los dos:

```bash
corepack enable
corepack prepare pnpm@10.15.0 --activate
pnpm install --frozen-lockfile
pnpm exec turbo build --filter=@basecamp/api
```

Ese filtro compila `@basecamp/shared`, `@basecamp/comms` y `@basecamp/db` (incluye `prisma generate`) y después la API. No uses `pnpm install --prod`: el seed usa `tsx`, que está en devDependencies.

Comando de arranque de la API HTTP:

```bash
pnpm --filter @basecamp/api start
```

Eso ejecuta `node dist/main.js`. Health check: `GET /health`. La respuesta es `{ "status": "ok", "db": "up" }` cuando Postgres responde. Un `db` distinto de `up` significa que el proceso vive pero no alcanzó la base.

Comando de arranque del worker:

```bash
pnpm --filter @basecamp/api start:worker
```

Eso ejecuta `node dist/worker.js`. No le pongas dominio público. Arráncalo después de que `pnpm db:migrate` haya terminado.

### Railway

1. Crea un proyecto y añade Postgres y Redis gestionados, o conecta los de otro proveedor.
2. Crea un servicio desde el repositorio de Git con la raíz del repo.
3. Build command: el bloque de build de arriba.
4. Start command de este servicio: `pnpm --filter @basecamp/api start`.
5. Custom start no lleva `API_PORT`. Railway asigna `PORT`.
6. Añade las variables de la sección 4. `PUBLIC_API_URL` será `https://` más el dominio que Railway genere para este servicio, sin barra final.
7. Health check path: `/health`.
8. Duplica el servicio para el worker. Mismo build, mismas variables, start command `pnpm --filter @basecamp/api start:worker`, sin dominio público.

En Railway, el comando de release del servicio HTTP (no del worker) es:

```bash
pnpm db:migrate
```

### Render

1. Crea Postgres y Redis gestionados, o conecta los de otro proveedor.
2. Crea un **Web Service** desde el repositorio, con la raíz del repo, runtime Node 20 y la build command de arriba.
3. Start command: `pnpm --filter @basecamp/api start`.
4. Pre-Deploy Command: `pnpm db:migrate`.
5. Health check path: `/health`.
6. Crea un **Background Worker** con el mismo repositorio, la misma build command y las mismas variables. Start command: `pnpm --filter @basecamp/api start:worker`. No repitas la migración en el worker.

Render suele definir `NODE_ENV=production`. Confírmalo. No definas `API_PORT`.

## 6. Migrar y crear el administrador

Desde la raíz del repo, con las variables de producción ya inyectadas y el build hecho:

```bash
pnpm db:migrate
pnpm db:seed
```

`pnpm db:migrate` ejecuta `prisma migrate deploy` en `@basecamp/db`. Aplica las migraciones existentes. No usa `migrate dev`.

`pnpm db:seed` crea el usuario `platform_admin` con `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`. La contraseña tiene que tener al menos 8 caracteres. Si ese email ya existe, el seed no cambia nada. Ejecútalo una vez. No lo dejes como comando de cada arranque.

## 7. Web en Vercel

1. Importa el mismo repositorio.
2. Framework Preset: Next.js.
3. Root Directory: `apps/web`.
4. Incluye los archivos fuera de ese directorio. `@basecamp/web` depende de `@basecamp/shared`, que está en `packages/shared`.
5. Node.js 20.x. El instalador tiene que usar pnpm 10.15.0.
6. Install Command, ejecutado de forma que pnpm vea el workspace:

```bash
cd ../.. && corepack enable && corepack prepare pnpm@10.15.0 --activate && pnpm install --frozen-lockfile
```

7. Build Command:

```bash
cd ../.. && pnpm exec turbo build --filter=@basecamp/web
```

Ese filtro compila `@basecamp/shared` y después `next build`. El resultado queda en `apps/web/.next`.

Variable de Vercel:

| Variable | Valor |
| --- | --- |
| `API_URL` | origen HTTPS público de la API, sin barra final. El mismo valor que `PUBLIC_API_URL` |

`API_URL` tiene que existir en el momento del build. `apps/web/next.config.mjs` la copia al bundle. Si la cambias, vuelve a desplegar la web. No pongas `localhost`. Vercel llama a la API desde sus servidores, y el navegador habla con la web: Next reenvía `/backend` y la cookie hacia `API_URL`.

La web no necesita `DATABASE_URL`, Redis, Twilio ni S3.

Cuando Vercel te dé la URL definitiva, pon ese origen exacto en `WEB_ORIGIN` de la API y del worker, y reinicia esos dos procesos. Ejemplo: `https://tu-proyecto.vercel.app`.

La sesión es la cookie httpOnly `basecamp_session`, emitida por la API. En producción la cookie sale con `Secure` solo si `NODE_ENV` de la API es `production`.

## 8. Webhooks de Twilio

`PUBLIC_API_URL` es la base pública que Twilio puede llamar. Sin barra final. En el panel de Twilio, o como status callback de voz que arma la propia API, las rutas son:

- SMS: `POST https://<tu-dominio-de-api>/webhooks/twilio/sms`
- Voz: `POST https://<tu-dominio-de-api>/webhooks/twilio/voice`

La firma se calcula contra `PUBLIC_API_URL` más esa ruta. Si la URL pública no coincide (otro host, barra final, `http` en lugar de `https`), Twilio recibe 403.

Con `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN`, la firma del proveedor es obligatoria. Sin esas credenciales no hay envío real: el adaptador es falso.

## 9. Comprobación

1. `GET https://<tu-dominio-de-api>/health` devuelve `"db": "up"`.
2. El worker sigue en ejecución y no registró `worker.idle`.
3. La web en Vercel abre el login y, tras entrar, la cookie `basecamp_session` queda en el dominio de Vercel.
4. Un envío o una llamada de prueba deja el manifiesto de la grabación en el bucket, bajo `recordings/`.
