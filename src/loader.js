/**
 * Page loader — robust loading with resource blocking, smart wait, and retry.
 */

const fs = require('fs');
const puppeteer = require('puppeteer');
const { ERRORS } = require('./errors');

const SYSTEM_CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
];

function resolveChromePath() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  for (const p of SYSTEM_CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

/**
 * Load a single page, returning raw HTML and title.
 * @param {string} url
 * @param {Object} strategy
 * @param {Object} opts
 * @returns {{html: string, title: string}}
 */
async function loadPage(url, strategy, opts = {}) {
  const browser = await puppeteer.launch({
    headless: opts.headless !== false,
    executablePath: resolveChromePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent(strategy.userAgent);
    await page.setViewport({
      width: strategy.viewport.width,
      height: strategy.viewport.height,
      isMobile: strategy.viewport.isMobile || false,
      hasTouch: strategy.viewport.hasTouch || false,
    });

    if (strategy.blockResources) {
      await enableResourceBlocking(page);
    }

    const navTimeout = opts.timeout ? opts.timeout * 1000 : 30000;
    await page.goto(url, {
      waitUntil: ['domcontentloaded', 'networkidle0'],
      timeout: navTimeout,
    });

    await waitForArticleContent(page, strategy, opts);

    const html = await page.evaluate(() => document.documentElement.outerHTML);
    const title = await page.title();

    await browser.close();
    return { html, title };
  } catch (err) {
    if (page) await page.close().catch(() => {});
    await browser.close().catch(() => {});
    throw categorizeError(err, url);
  }
}

/**
 * Load a page with retry logic. Keeps browser alive across retries
 * to avoid expensive Chrome startup cost. On retry #1, falls back
 * to mobile viewport if the original was desktop.
 *
 * @param {string} url
 * @param {Object} strategy
 * @param {Object} opts
 * @returns {{html: string, title: string}}
 */
async function loadPageWithRetry(url, strategy, opts = {}) {
  const maxRetries = strategy.retries || 1;
  const backoffMs = strategy.retryBackoffMs || 1000;
  const browser = await puppeteer.launch({
    headless: opts.headless !== false,
    executablePath: resolveChromePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  let lastError;
  let currentStrategy = strategy;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = backoffMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }

    let page;
    try {
      page = await browser.newPage();

      await page.setUserAgent(currentStrategy.userAgent);
      await page.setViewport({
        width: currentStrategy.viewport.width,
        height: currentStrategy.viewport.height,
        isMobile: currentStrategy.viewport.isMobile || false,
        hasTouch: currentStrategy.viewport.hasTouch || false,
      });

      if (currentStrategy.blockResources) {
        await enableResourceBlocking(page);
      }

      const navTimeout = opts.timeout ? opts.timeout * 1000 : 30000;
      await page.goto(url, {
        waitUntil: ['domcontentloaded', 'networkidle0'],
        timeout: navTimeout,
      });

      await waitForArticleContent(page, currentStrategy, opts);

    let html = await page.evaluate((shouldClean) => {
      if (shouldClean) {
        // Remove common unwanted elements
        const selectorsToRemove = [
          'nav', 'footer', 'header', 'aside',
          'script', 'style', 'noscript',
          '.ad', '.ads', '.advertisement', '.banner',
          '.cookie', '.modal', '.popup',
          '.sidebar', '.navigation', '.breadcrumb',
          '.share', '.comments', '.related',
          '[class*="ad"]', '[class*="banner"]',
          '[class*="cookie"]', '[class*="popup"]',
          '[class*="modal"]', '[class*="sidebar"]',
          '[class*="navigation"]', '[class*="newsletter"]',
          '[class*="social"]', '[class*="tracking"]',
        ];

        const allEls = document.querySelectorAll(selectorsToRemove.join(', '));
        allEls.forEach((el) => el.remove());

        // Remove elements with common ad-like class names
        const all = document.querySelectorAll('*');
        for (const el of all) {
          const cls = (el.className || '').toLowerCase();
          if (
            cls.includes('ad-container') ||
            cls.includes('ad-wrapper') ||
            cls.includes('ad-placeholder') ||
            cls.includes('comscore') ||
            cls.includes('doubleclick')
          ) {
            el.remove();
          }
        }
      }
      return document.documentElement.outerHTML;
    }, opts.clean);

    const title = await page.title();

      await browser.close();
      return { html, title };
    } catch (err) {
      lastError = err;
      if (page) await page.close().catch(() => {});

      const categorized = categorizeError(err, url);
      const nonTransient = ['paywall', 'not-found', 'blocked'].includes(categorized.category);
      if (nonTransient) {
        await browser.close().catch(() => {});
        throw categorized;
      }

      // Adapt strategy on first retry: try mobile viewport
      if (attempt === 1 && currentStrategy.viewport.width >= 1000) {
        currentStrategy = {
          ...currentStrategy,
          viewport: { width: 375, height: 667, isMobile: true, hasTouch: true },
        };
      }
    }
  }

  await browser.close().catch(() => {});
  throw categorizeError(lastError, url);
}

/**
 * Enable resource blocking via request interception.
 * Blocks image, font, stylesheet, media, beacon, websocket, manifest.
 * Keeps document and script unblocked (needed for content + JS execution).
 * @param {import('puppeteer').Page} page
 */
async function enableResourceBlocking(page) {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const type = request.resourceType();
    if (
      ['image', 'font', 'stylesheet', 'media', 'beacon', 'websocket', 'manifest'].includes(type)
    ) {
      request.abort();
    } else {
      request.continue();
    }
  });
}

/**
 * Wait for article content to be ready.
 * Waits the configured extra time, then checks if any article-matching
 * selector exists in the DOM. Does NOT throw if content is not found —
 * the quality checker handles that.
 *
 * @param {import('puppeteer').Page} page
 * @param {Object} strategy
 * @param {Object} opts
 */
async function waitForArticleContent(page, strategy, opts) {
  const extraWait = strategy.extraWaitMs || 1500;
  await new Promise((r) => setTimeout(r, extraWait));

  try {
    const articleFound = await page.evaluate((selectors) => {
      const selectorList = selectors.split(',').map((s) => s.trim()).filter(Boolean);
      return selectorList.some((sel) => document.querySelector(sel) !== null);
    }, strategy.articleSelector);

    if (!articleFound) {
      // Content may not have loaded or page is not an article;
      // the quality checker will flag low-word-count pages.
    }
  } catch {
    // Evaluation failed silently; proceed anyway.
  }
}

/**
 * Categorize a Puppeteer / network error into a structured error.
 * @param {Error|null} err
 * @param {string} url
 * @returns {Error}
 */
function categorizeError(err, url) {
  if (!err) return ERRORS.browser(`Unknown error accessing ${url}`, { url });

  const msg = err.message || String(err);

  if (msg.includes('NET_') || msg.includes('ERR_') || msg.includes('net::')) {
    return ERRORS.blocked(`Network error accessing ${url}: ${msg}`, { url, originalError: msg });
  }
  if (err.name === 'TimeoutError' || msg.toLowerCase().includes('timeout')) {
    return ERRORS.timeout(`Navigation timed out for ${url}: ${msg}`, { url });
  }
  if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
    return ERRORS.notFound(`Page not found: ${url}`, { url });
  }
  if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) {
    return ERRORS.blocked(`Access forbidden for ${url}: ${msg}`, { url });
  }
  if (msg.includes('ERR_BLOCKED_BY_RESPONSE') || msg.includes('blocked by client')) {
    return ERRORS.blocked(`Request blocked for ${url}: ${msg}`, { url });
  }

  return ERRORS.browser(`Browser error for ${url}: ${msg}`, { url, originalError: msg });
}

module.exports = { loadPage, loadPageWithRetry };
