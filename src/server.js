const express = require('express');
const { BrowserPool } = require('./browser-pool');
const { urlToMd, batchConvert } = require('./converter');

const PORT = parseInt(process.env.PORT || '3000', 10);
const POOL_SIZE = parseInt(process.env.POOL_SIZE || '3', 10);
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || '60', 10) * 1000;

const pool = new BrowserPool(POOL_SIZE);
const app = express();

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function parseOptions(body) {
  const o = body.options || {};
  return {
    headless: true,
    timeout: o.timeout || 30,
    clean: o.clean || false,
    noImages: o.noImages || false,
    noLinks: o.noLinks || false,
    dataImages: o.dataImages !== false,
    blockResources: o.blockResources !== false,
    strategy: o.strategy,
    viewport: o.viewport || 'desktop',
    retries: o.retries || 1,
    qualityThreshold: o.qualityThreshold || 100,
  };
}

app.post('/api/convert', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required and must be a string' });
  }

  const opts = parseOptions(req.body);
  let browser;
  try {
    browser = await pool.acquire(REQUEST_TIMEOUT);
    const result = await urlToMd(url, { ...opts, browser });
    res.json(result);
  } catch (err) {
    const status = err.category === 'timeout' ? 504 :
                   err.category === 'not-found' ? 404 :
                   err.category === 'blocked' ? 403 : 500;
    res.status(status).json({
      error: err.message || String(err),
      category: err.category || 'unknown',
      details: err.details || {},
    });
  } finally {
    if (browser) pool.release(browser);
  }
});

app.post('/api/batch', async (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls must be a non-empty array' });
  }
  if (urls.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 URLs per batch request' });
  }

  const opts = parseOptions(req.body);

  const results = [];
  for (const url of urls) {
    let browser;
    try {
      browser = await pool.acquire(REQUEST_TIMEOUT);
      const result = await urlToMd(url, { ...opts, browser });
      results.push({ url, success: true, data: result });
    } catch (err) {
      results.push({
        url,
        success: false,
        error: err.message || String(err),
        errorCategory: err.category || 'unknown',
      });
    } finally {
      if (browser) pool.release(browser);
    }
  }

  res.json({ results });
});

app.get('/api/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: pool.started ? 'ok' : 'starting',
    workers: pool.stats,
    uptime: process.uptime(),
    memory: {
      rss: Math.round(mem.rss / 1048576) + 'MB',
      heapUsed: Math.round(mem.heapUsed / 1048576) + 'MB',
    },
  });
});

async function start() {
  await pool.start();
  console.log(`Browser pool ready (${POOL_SIZE} workers)`);

  const server = app.listen(PORT, () => {
    console.log(`url2md server listening on :${PORT}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received, shutting down...`);
    server.close();
    await pool.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
