# POS Monorepo

## Development

The browser uses **one origin** for API calls. Vite runs on `5173` and proxies `/api/*` to the API on `3000`.

```bash
npm install
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:3000
- API health: http://localhost:3000/health

Host-based local development selects `DB_EXTERNAL_URL` from `api/.env` and requires an external database URL with TLS. On Render, the API container selects `DB_INTERNAL_URL` for the private network. The `docker compose up --build` stack is a separate self-contained option: its API uses the Compose `postgres` service and preserves the `pos_pgdata` volume.

Do not set `VITE_API_URL=http://localhost:3000` for normal development. Leave it unset so the browser calls `/api/...` and Vite handles the proxy.

## Docker Compose stack

```bash
docker compose up --build
```

The browser uses only:

```text
http://localhost:8080
```

Nginx serves the React application and proxies `/api/*` to the API container. The API remains internal on port 3000.

For Render, configure `DB_INTERNAL_URL` in the API service environment. The `Dockerfile.api` image defaults `DB_CONNECTION_MODE=internal`; local Node development uses the public `DB_EXTERNAL_URL` instead. These URLs point to the same Render Postgres instance; local external connections require TLS and may require the database IP allowlist to include the developer's network.

Before production, replace the development database/passwords and rotate any credentials that were previously exposed in local `.env` files.
# manager
