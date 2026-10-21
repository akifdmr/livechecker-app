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
- PostgreSQL (local Docker): localhost:5432

Do not set `VITE_API_URL=http://localhost:3000` for normal development. Leave it unset so the browser calls `/api/...` and Vite handles the proxy.

## Production Docker

```bash
docker compose up --build
```

The browser uses only:

```text
http://localhost:8080
```

Nginx serves the React application and proxies `/api/*` to the API container. The API remains internal on port 3000.

Before production, replace the development database/passwords and rotate any credentials that were previously exposed in local `.env` files.
# manager
