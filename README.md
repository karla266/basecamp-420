# Basecamp 420

Plataforma de operaciones: un equipo interno atiende a muchos clientes y cada cliente entra a su portal. La interfaz está en español.

## Arranque local

Requisitos: Node 20+, pnpm 10 y Docker.

1. Copia el entorno y completa los valores locales:

```bash
cp .env.example .env
```

`SEED_ADMIN_PASSWORD` tiene que tener al menos 8 caracteres. Las contraseñas de Postgres, Redis y MinIO del `docker-compose.yml` son solo para la máquina local.

2. Levanta Postgres, Redis y MinIO:

```bash
docker compose up -d
```

3. Instala, migra y crea el administrador de plataforma:

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
```

4. Arranca la web, la API y el worker:

```bash
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001/health
- Consola de MinIO: http://localhost:9001

Sin `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN`, los envíos usan el adaptador falso. Con credenciales, salen por Twilio. Los webhooks locales, sin token de Twilio, se aceptan solo si el header `x-basecamp-dev-webhook` coincide con `AUTH_SECRET`. Con Twilio configurado, la firma del proveedor es obligatoria. Sin variables `S3_*`, las grabaciones quedan referenciadas en memoria de proceso; con MinIO, se guarda un manifiesto JSON, no el audio, en el bucket.

## Variables

`DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `WEB_ORIGIN`, `API_URL`, `PUBLIC_API_URL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SMS_RATE_LIMIT_PER_MINUTE`.

## Scripts

- `pnpm dev` — web, API y worker
- `pnpm test` — pruebas de dominio, aislamiento, mensajes, automatizaciones, llamadas y el recorrido del operador
- `pnpm lint` — ESLint y TypeScript
- `pnpm db:migrate` — aplica las migraciones de Prisma
- `pnpm db:seed` — crea el `platform_admin` si aún no existe

## Roles

- `platform_admin` ve todas las organizaciones.
- `operator` solo entra a las organizaciones asignadas.
- `client_admin` invita usuarios de su organización y no crea clientes.
- `client_viewer` consulta su organización.

Las rutas `/admin` exigen rol interno. Las rutas `/portal` exigen rol de cliente. La sesión es una cookie `httpOnly` emitida por la API.
