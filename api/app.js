// ============================================================
// LIVE CHECK BACKEND v3.3 — Processor Routing + Charge Audit
// + Single-service deploy (Render/Railway/Fly) — Express serves FE+BE
// ============================================================

// ⭐ CRASH GUARD — en üstte
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
  if (reason && reason.stack) console.error(reason.stack);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  if (err && err.stack) console.error(err.stack);
});

require('dotenv').config();
const express = require('express');
const { randomUUID } = require('node:crypto');
const cors = require('cors');
const path = require('path');
const http = require('node:http');
const fs = require('node:fs');
const config = require('./config');
const { verifyToken } = require('./auth');

// ── Core ──
const BinDatabase = require('./core/BinDatabase');
const LoadBalancer = require('./core/LoadBalancer');
const ProviderFactory = require('./core/ProviderFactory');
const ProxyManager = require('./core/ProxyManager');

// ── Services ──
const RoutingService = require('./services/RoutingService');
const CardChecker = require('./services/CardChecker');
const ResinService = require('./services/ResinService');
const ImportService = require('./services/ImportService');
const DbService = require('./services/DbService');
const IntelService = require('./services/IntelService');
const CorrelationService = require('./services/CorrelationService');
const PaymentService = require('./services/PaymentService');
const ProcessorRoutingService = require('./services/ProcessorRoutingService');
const { migrate } = require('./services/MigrationService');

// ── Routes ──
const authRoutes = require('./routes/auth');
const cardsRoutes = require('./routes/cards');
const checkRoutes = require('./routes/check');
const importRoutes = require('./routes/import');
const processorDumpRoutes = require('./routes/processor-dumps');
const binRoutes = require('./routes/bin');
const subscriptionsRoutes = require('./routes/subscriptions');
const favoritesRoutes = require('./routes/favorites');
const adminRoutes = require('./routes/admin');
const bankAccountsRoutes = require('./routes/bank-accounts');
const processorsRoutes = require('./routes/processors');
const loadCardsRoutes = require('./routes/load-cards');
const loadsRoutes = require('./routes/loads');
const collectionsRoutes = require('./routes/collections');
const statsRoutes = require('./routes/stats');
const intelRoutes = require('./routes/intel');
const graphRoutes = require('./routes/graph');
const paymentRoutes = require('./routes/payments');
const chargeRoutes = require('./routes/charge');
const processorRoutingRoutes = require('./routes/processor-routing');
const posRoutes = require('./routes/pos');
const ledgerRoutes = require('./routes/ledger');
const provisionsRoutes = require('./routes/provisions');
const messagesRoutes = require('./routes/messages');

// ============================================================
// ORTAM
// ============================================================
const APP_ENV = config.APP_ENV || 'development';
const IS_DEV = config.IS_DEV === true;
const SERVE_WEB = config.SERVE_WEB === true;

// ============================================================
// APP
// ============================================================
const app = express();
let viteServer = null;

// ⭐ Static frontend path — web build çıktısı
const webDistPath = path.join(__dirname, '..', 'web', 'dist');
const webIndexFile = path.join(webDistPath, 'index.html');
const hasWebBuild = fs.existsSync(webIndexFile);

// ============================================================
// OPENAPI DOCS
// ============================================================
const openApiPath = path.join(__dirname, 'docs', 'openapi.json');
app.get('/api-docs/openapi.json', (req, res) => res.sendFile(openApiPath));
app.get('/api-docs', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>LiveChecker API Docs</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>window.onload=()=>SwaggerUIBundle({url:'/api-docs/openapi.json',dom_id:'#swagger-ui',deepLinking:true});</script></body></html>`);
});

// ============================================================
// ⭐ MIDDLEWARE SIRASI (kritik!)
// 1) cors + body parser
// 2) request logger (1 kere — tek yerde)
// 3) /api prefix strip
// 4) checker role check
// ============================================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logger — TEK kayıt. API docs endpoint hariç her şeyi loglar.
app.use((req, res, next) => {
  // api-docs ve health log spam'ini engelle
  const skipLog =
    req.path === '/health' ||
    req.path.startsWith('/api-docs') ||
    req.path.startsWith('/assets/');

  req.requestId = randomUUID();
  const startedAt = Date.now();
  res.setHeader('X-Request-ID', req.requestId);

  if (!skipLog) {
    res.on('finish', () => {
      console.info('[HTTP]', JSON.stringify({
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        userId: req.user?.id || null,
        durationMs: Date.now() - startedAt,
      }));
    });
  }
  next();
});

// ⭐ /api prefix strip — frontend `/api/live-cards` çağırır, backend `/live-cards` bekler.
//    Dev'de Vite proxy, prod'da bu middleware strip eder.
//    NOT: `/api-docs` buradan etkilenmez (startsWith('/api/') !== startsWith('/api-docs')).
app.use((req, _res, next) => {
  if (
    req.url === '/api' ||
    req.url.startsWith('/api/') ||
    req.url.startsWith('/api?')
  ) {
    req._wasApiPrefixed = true;
    req.url = req.url.slice(4) || '/';
  }
  next();
});

// ============================================================
// CHECKER ROLÜ KISITLAMASI
// ⭐ FIX: Frontend (HTML/JS/CSS) istekleri değil, sadece API istekleri kısıtlanır.
// ============================================================
app.use((req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const user = token ? verifyToken(token) : null;

  if (user?.role !== 'checker') return next();

  // ⭐ /api prefix'siz istek (frontend asset / SPA route) → checker bile erişebilir
  if (!req._wasApiPrefixed) return next();

  const allowed =
    (req.method === 'POST' && req.path === '/bin-check') ||
    (req.method === 'GET' &&
      (req.path === '/bin-history' ||
        req.path === '/bin-favorites' ||
        req.path === '/subscription-cards' ||
        req.path === '/subscription-prechecks' ||
        /^\/bin\/\d{6}$/.test(req.path) ||
        req.path === '/auth/me')) ||
    (req.method === 'POST' && /^\/subscription-cards\/\d+\/preflight$/.test(req.path));

  if (!allowed) {
    return res.status(403).json({
      error:
        'Bu kullanıcı yalnızca BIN metadata sorgusu, abonelik kartı yerel ön kontrolü ve kendi kontrol geçmişine erişebilir.',
    });
  }
  next();
});

// ============================================================
// DEPENDENCY INIT — SIRALAMA KRİTİK
// ============================================================

// 1️⃣ ProxyManager
const proxyManager = new ProxyManager();
const proxyStats = proxyManager.stats();
console.log(`[INIT] ${proxyStats.total} proxy yüklendi (${proxyStats.alive} aktif)`);

// 2️⃣ RoutingService
const routingService = new RoutingService();

// 3️⃣ BinDatabase
const binDb = new BinDatabase(config.BIN_CSV_PATH);
binDb.load();

// 4️⃣ Providers
const { providers, healths } = ProviderFactory.createAll(config.PROVIDERS, {
  isDev: IS_DEV,
});
console.log(`\n[BOOT] Ortam: ${APP_ENV} ${IS_DEV ? '(DEV)' : '(PROD)'}`);
console.log(`[BOOT] Yüklenen provider'lar (${Object.keys(providers).length}):`);
Object.entries(providers).forEach(([key, p]) => {
  const h = healths[key];
  console.log(
    `   - ${key} (${p.config?.type || '?'}) — ${p.name}` +
      (h ? ` [weight: ${h.weight ?? '?'}]` : '')
  );
});
console.log('');

// 5️⃣ LoadBalancer
const loadBalancer = new LoadBalancer(healths);

// 6️⃣ IntelService
const intelService = new IntelService(proxyManager);

// 7️⃣ CorrelationService
const correlationService = new CorrelationService(intelService, proxyManager);

// 8️⃣ CardChecker
const cardChecker = new CardChecker(
  providers,
  healths,
  loadBalancer,
  binDb,
  config.EXTERNAL_BIN_API,
  proxyManager
);

// 9️⃣ ResinService
const resinService = new ResinService(
  path.join(__dirname, 'selenium-check.py'),
  proxyManager
);

// 🔟 ImportService
const importService = new ImportService(cardChecker, resinService, DbService);

// 1️⃣1️⃣ PaymentService
const paymentService = new PaymentService(providers, DbService);

// 1️⃣2️⃣ ProcessorRoutingService
const processorRoutingService = new ProcessorRoutingService();

// ============================================================
// DEPS BUNDLE
// ============================================================
const deps = {
  providers,
  healths,
  loadBalancer,
  binDb,
  cardChecker,
  paymentService,
  resinService,
  importService,
  dbService: DbService,
  proxyManager,
  routingService,
  intelService,
  correlationService,
  processorRoutingService,
  isDev: IS_DEV,
  appEnv: APP_ENV,
};

// ============================================================
// ROUTES
// ============================================================
app.use('/auth', authRoutes);
app.use('/', cardsRoutes(deps));
app.use('/', checkRoutes(deps));
app.use('/', paymentRoutes(deps));
app.use('/', importRoutes(deps));
app.use('/', processorDumpRoutes());
app.use('/', binRoutes(deps));
app.use('/', subscriptionsRoutes(deps));
app.use('/', favoritesRoutes(deps));
app.use('/', adminRoutes(deps));
app.use('/', bankAccountsRoutes(deps));
app.use('/', processorsRoutes(deps));
app.use('/', loadCardsRoutes(deps));
app.use('/', loadsRoutes(deps));
app.use('/', collectionsRoutes(deps));
app.use('/', statsRoutes(deps));
app.use('/', intelRoutes(deps));
app.use('/', graphRoutes(deps));
app.use('/', chargeRoutes(deps));
app.use('/', processorRoutingRoutes(deps));
app.use('/', posRoutes(deps));
app.use('/', ledgerRoutes);
app.use('/', provisionsRoutes(deps));
app.use('/', messagesRoutes);

// ============================================================
// HEALTH
// ============================================================
app.get('/health', async (req, res) => {
  let database = { available: true };
  try {
    await DbService.pool.query('SELECT 1');
  } catch (error) {
    database = { available: false, code: error.code || 'DB_UNAVAILABLE' };
  }

  const providerList = Object.entries(providers).map(([key, p]) => {
    const h = healths[key];
    return {
      key,
      type: p.config?.type || 'unknown',
      name: p.name,
      merchantId: p.config?.merchantId || null,
      available: typeof h?.isAvailable === 'function' ? h.isAvailable() : true,
      weight: h?.weight ?? 0,
      capabilities: {
        verify: typeof p.verify === 'function',
        preAuth: typeof p.preAuth === 'function' || typeof p.preauth === 'function',
        capture: typeof p.capture === 'function',
        refund: typeof p.refund === 'function',
        complete: typeof p.complete === 'function',
        void: typeof p.voidTransaction === 'function',
        sale: typeof p.sale === 'function',
      },
    };
  });

  const ready = database.available;
  res.status(ready ? 200 : 503).json({
    ok: ready,
    ready,
    database,
    env: APP_ENV,
    isDev: IS_DEV,
    uptime: process.uptime(),
    providers: providerList,
    providerCount: providerList.length,
    binCount: binDb.bins.size,
    proxies: proxyManager.stats(),
    webBuild: hasWebBuild ? 'available' : 'missing',
  });
});

// ============================================================
// ⭐ STATIC FRONTEND (production — single-service deploy)
// ============================================================
if (hasWebBuild) {
  console.log(`[WEB] Static frontend serving from: ${webDistPath}`);

  // Statik assetler (js, css, img vs.)
  app.use(
    express.static(webDistPath, {
      index: false,        // `/` için SPA fallback hallediyor
      maxAge: '1h',        // asset'ler cache'lensin
      etag: true,
      setHeaders: (res, filePath) => {
        // index.html cache'lenmesin — yeni deploy hemen görünsün
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        }
      },
    })
  );

  // SPA fallback — API olmayan tüm GET'ler index.html
  app.get('*', (req, res, next) => {
    // API ve sistem endpoint'leri SPA'ya düşmesin
    if (
      req._wasApiPrefixed ||
      req.path === '/health' ||
      req.path.startsWith('/api-docs')
    ) {
      return next();
    }
    // Sadece GET (Express app.get zaten filtreliyor ama ekstra güvenlik)
    if (req.method !== 'GET') return next();

    res.sendFile(webIndexFile, (err) => {
      if (err) next(err);
    });
  });
} else {
  console.log(
    `[WEB] No frontend build at ${webDistPath} — running in API-only mode`
  );
}

// ============================================================
// VITE DEV MIDDLEWARE (yalnızca IS_DEV && SERVE_WEB)
// ============================================================
async function attachWebDevMiddleware(server) {
  if (!IS_DEV || !SERVE_WEB) return;
  const { createServer } = await import('vite');
  viteServer = await createServer({
    configFile: path.resolve(__dirname, '../web/vite.config.ts'),
    appType: 'spa',
    server: {
      host: '0.0.0.0',
      middlewareMode: true,
      hmr: { server },
    },
  });
  app.use(viteServer.middlewares);
  console.log('[WEB] Vite dev middleware mounted.');
}

// ============================================================
// 404 — bilinmeyen route (JSON)
// ============================================================
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'POST') return next();
  res.status(404).json({
    error: 'Not found',
    path: req.originalUrl,
    wasApi: !!req._wasApiPrefixed,
  });
});

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================
app.use((err, req, res, next) => {
  console.error(
    '[SERVER ERROR]',
    JSON.stringify({
      requestId: req.requestId || null,
      method: req.method,
      path: req.path,
      code: err.code || null,
      status: err.status || err.statusCode || null,
    })
  );
  console.error(err.stack || err);

  if (res.headersSent) return next(err);

  const dependencyUnavailable = [
    'ENOTFOUND',
    'EHOSTUNREACH',
    'ETIMEDOUT',
    'ECONNREFUSED',
  ].includes(err.code);

  res
    .status(dependencyUnavailable ? 503 : err.status || err.statusCode || 500)
    .json({
      success: false,
      code: dependencyUnavailable
        ? 'DEPENDENCY_UNAVAILABLE'
        : err.code || null,
      error: dependencyUnavailable
        ? 'Bağımlı servise erişilemiyor. Ödeme durumunu kontrol etmeden tekrar göndermeyin.'
        : err.message || 'Internal server error',
      requestId: req.requestId || null,
    });
});

// ============================================================
// BAŞLAT
// ============================================================
async function startServer() {
  try {
    await migrate(DbService.pool);
    console.log('[DB] Migration kontrolü tamamlandı.');
  } catch (err) {
    console.error('[BOOT] Database initialization failed:', err.message);
    console.error(
      '[BOOT] Check DATABASE_URL/PGUSER/PGPASSWORD or run: docker compose up -d postgres'
    );
    process.exit(1);
  }

  const server = http.createServer(app);

  try {
    await attachWebDevMiddleware(server);
  } catch (err) {
    console.error('[WEB] Vite could not start:', err.message);
    process.exit(1);
  }

  server.on('close', () => viteServer?.close());
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[BOOT] Port ${config.PORT} is already in use. Stop its owner or set PORT in .env.`
      );
    } else {
      console.error('[BOOT] HTTP server error:', err.message);
    }
    process.exit(1);
  });

  server.listen(Number(config.PORT), '0.0.0.0', () => {
    const providerList = Object.entries(providers).map(
      ([key, p]) => `${key} (${p.config?.type || '?'})`
    );
    const ps = proxyManager.stats();

    console.log(`\n========================================`);
    console.log(`  LIVE CHECK BACKEND v3.3`);
    console.log(`  Ortam: ${APP_ENV} ${IS_DEV ? '🔧 (DEV)' : '🚀 (PROD)'}`);
    console.log(`  Port: ${config.PORT}`);
    console.log(`  BIN kayıtları: ${binDb.bins.size}`);
    console.log(`  Proxy: ${ps.total} adet (${ps.alive} aktif)`);
    console.log(`  Web build: ${hasWebBuild ? '✅ served' : '❌ API-only'}`);
    console.log(`  Aktif Provider'lar (${providerList.length}):`);
    providerList.forEach((p) => console.log(`    - ${p}`));
    console.log(`  Endpoint'ler:`);
    console.log(`    POST /check       → LiveCheck`);
    console.log(`    POST /preauth     → Provizyon al`);
    console.log(`    POST /capture     → Provizyonu paraya çevir`);
    console.log(`    POST /refund      → İade`);
    console.log(`    GET  /providers   → Provider listesi`);
    console.log(`    POST /payments/preauth  → DB kayıtlı provizyon`);
    console.log(`    POST /payments/capture  → DB güncellemeli capture`);
    console.log(`    POST /payments/refund   → DB güncellemeli iade`);
    console.log(`    POST /charge              → auth/capture/refund/sale`);
    console.log(`    GET  /charge/history      → charge_audit geçmişi`);
    console.log(`    POST /balance-check       → auth ($0 = live_check)`);
    console.log(`    GET  /processor-routing   → routing kuralları`);
    console.log(`    GET  /provider-transactions           → txn listesi`);
    console.log(`    GET  /provider-transactions/summary   → özet`);
    console.log(`  DB: Aiven (dataservice-cardmanager)`);
    console.log(`========================================\n`);

    if (typeof loadBalancer.recalculateWeights === 'function') {
      loadBalancer.recalculateWeights();
    }
  });
}

startServer();
