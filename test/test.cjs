#!/usr/bin/env node

/**
 * Comprehensive test suite for url2md-local.
 *
 * Minimal assert-based runner — no external test frameworks needed.
 * Groups:
 *   1. Unit — errors, strategies, extractor (synchronous, no browser)
 *   2. HTTP Fallback — tryHttpFallback (async, network-only, no browser)
 *   3. Integration — converter pipeline, loader, batch (needs browser+network)
 *   4. Backwards compatibility
 *   5. CLI & package sanity
 *
 * Usage:
 *   node test/test.cjs                  — run everything
 *   node test/test.cjs --unit-only      — synchronous unit tests only
 *
 * Note: .cjs extension avoids ESM issues on Node 24+.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
let skipped = 0;
const results = [];
const pendingAsyncTests = [];

function group(name) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${'═'.repeat(60)}`);
}

function test(label, fn) {
  try {
    fn();
    passed++;
    results.push({ label: `✓ ${label}`, status: 'PASS', error: null });
  } catch (err) {
    failed++;
    results.push({ label: `✗ ${label}`, status: 'FAIL', error: err.message });
    console.error(`  ✗ ${label}`);
    console.error(`    ${err.message}`);
  }
}

function skip(label, reason) {
  skipped++;
  results.push({ label: `⊘ ${label}`, status: 'SKIP', error: reason });
  console.log(`  ⊘ ${label} (skipped: ${reason})`);
}

function asyncTest(label, fn) {
  const p = fn()
    .then(() => {
      passed++;
      results.push({ label: `✓ ${label}`, status: 'PASS', error: null });
    })
    .catch((err) => {
      failed++;
      results.push({ label: `✗ ${label}`, status: 'FAIL', error: err.message });
      console.error(`  ✗ ${label}`);
      console.error(`    ${err.message}`);
    });
  pendingAsyncTests.push(p);
  return p;
}

// ---------------------------------------------------------------------------
// 1. UNIT TESTS — errors.js (synchronous)
// ---------------------------------------------------------------------------

group('1. Error Types (src/errors.js)');
{
  const { Url2mdError, ERRORS } = require('../src/errors');

  test('Url2mdError extends Error', () => {
    const err = new Url2mdError('msg', 'timeout', { url: 'x' });
    assert(err instanceof Error);
    assert(err instanceof Url2mdError);
  });

  test('Url2mdError sets category and details', () => {
    const err = new Url2mdError('bad thing', 'blocked', { url: 'https://x.com' });
    assert.strictEqual(err.category, 'blocked');
    assert.deepStrictEqual(err.details, { url: 'https://x.com' });
    assert.strictEqual(err.message, 'bad thing');
    assert.strictEqual(err.name, 'Url2mdError');
  });

  test('ERRORS.timeout factory', () => {
    const err = ERRORS.timeout('timed out', { url: 'https://slow.com' });
    assert.strictEqual(err.category, 'timeout');
    assert.strictEqual(err.details.url, 'https://slow.com');
  });

  test('ERRORS.blocked factory', () => {
    const err = ERRORS.blocked('access denied');
    assert.strictEqual(err.category, 'blocked');
  });

  test('ERRORS.paywall factory', () => {
    const err = ERRORS.paywall('behind paywall');
    assert.strictEqual(err.category, 'paywall');
  });

  test('ERRORS.notFound factory', () => {
    const err = ERRORS.notFound('404');
    assert.strictEqual(err.category, 'not-found');
  });

  test('ERRORS.parseError factory', () => {
    const err = ERRORS.parseError('invalid');
    assert.strictEqual(err.category, 'parse-error');
  });

  test('ERRORS.contentQuality factory', () => {
    const err = ERRORS.contentQuality('too short');
    assert.strictEqual(err.category, 'content-quality');
  });

  test('ERRORS.browser factory', () => {
    const err = ERRORS.browser('chrome crashed');
    assert.strictEqual(err.category, 'browser');
  });

  test('ERRORS factories default details to empty object', () => {
    const err = ERRORS.timeout('no details');
    assert.deepStrictEqual(err.details, {});
  });
}

// ---------------------------------------------------------------------------
// 2. UNIT TESTS — strategies.js (synchronous)
// ---------------------------------------------------------------------------

group('2. Site Strategies (src/strategies.js)');
{
  const { detectStrategy, mergeStrategy, DEFAULT_STRATEGY, PREMIUM_NEWS } =
    require('../src/strategies');

  test('PREMIUM_NEWS has 12 entries', () => {
    assert.strictEqual(PREMIUM_NEWS.length, 12);
  });

  test('detectStrategy returns default for null', () => {
    const s = detectStrategy(null);
    assert.strictEqual(s.name, 'default');
    assert.strictEqual(s.siteType, 'generic');
  });

  test('detectStrategy returns default for empty string', () => {
    const s = detectStrategy('');
    assert.strictEqual(s.name, 'default');
  });

  test('detectStrategy returns default for invalid URL', () => {
    const s = detectStrategy('not-a-url');
    assert.strictEqual(s.name, 'default');
  });

  test('detectStrategy matches exact domain (bloomberg)', () => {
    const s = detectStrategy('https://bloomberg.com/news/article');
    assert.strictEqual(s.name, 'bloomberg');
    assert.strictEqual(s.siteType, 'premium-news');
    assert.strictEqual(s.qualityThresholdWords, 200);
    assert.strictEqual(s.retries, 2);
  });

  test('detectStrategy matches exact domain (reuters)', () => {
    const s = detectStrategy('https://reuters.com/world');
    assert.strictEqual(s.name, 'reuters');
    assert.strictEqual(s.siteType, 'premium-news');
  });

  test('detectStrategy matches exact domain (nytimes)', () => {
    const s = detectStrategy('https://nytimes.com/2024/01/01/article');
    assert.strictEqual(s.name, 'nytimes');
    assert.strictEqual(s.retries, 2);
  });

  test('detectStrategy matches exact domain (wsj)', () => {
    const s = detectStrategy('https://wsj.com/articles/headline');
    assert.strictEqual(s.name, 'wsj');
  });

  test('detectStrategy matches exact domain (cnbc)', () => {
    const s = detectStrategy('https://cnbc.com/2024/01/01/');
    assert.strictEqual(s.name, 'cnbc');
    assert.strictEqual(s.siteType, 'news');
  });

  test('detectStrategy matches exact domain (theguardian)', () => {
    const s = detectStrategy('https://theguardian.com/us-news');
    assert.strictEqual(s.name, 'theguardian');
  });

  test('detectStrategy matches exact domain (apnews)', () => {
    const s = detectStrategy('https://apnews.com/article/b52-crash');
    assert.strictEqual(s.name, 'apnews');
  });

  test('detectStrategy matches www-prefixed domain', () => {
    const s = detectStrategy('https://www.bloomberg.com/news');
    assert.strictEqual(s.name, 'bloomberg');
  });

  test('detectStrategy does case-insensitive matching', () => {
    const s = detectStrategy('https://BLOOMBERG.COM/NEWS');
    assert.strictEqual(s.name, 'bloomberg');
  });

  test('detectStrategy heuristic: bbc → news', () => {
    const s = detectStrategy('https://bbc.com/news/world');
    assert.strictEqual(s.siteType, 'news');
  });

  test('detectStrategy heuristic: medium → blog', () => {
    const s = detectStrategy('https://medium.com/@user/story');
    assert.strictEqual(s.siteType, 'blog');
  });

  test('detectStrategy heuristic: docs.example → docs', () => {
    const s = detectStrategy('https://docs.example.com/api/reference');
    assert.strictEqual(s.siteType, 'docs');
  });

  test('detectStrategy heuristic: api.example → docs', () => {
    const s = detectStrategy('https://api.example.com/v1/docs');
    assert.strictEqual(s.siteType, 'docs');
  });

  test('detectStrategy heuristic: unknown → generic', () => {
    const s = detectStrategy('https://random-website-xyz123.com/page');
    assert.strictEqual(s.siteType, 'generic');
  });

  test('DEFAULT_STRATEGY has expected fields', () => {
    assert.strictEqual(DEFAULT_STRATEGY.viewport.width, 1280);
    assert.strictEqual(DEFAULT_STRATEGY.viewport.height, 900);
    assert.strictEqual(DEFAULT_STRATEGY.extraWaitMs, 1500);
    assert.strictEqual(DEFAULT_STRATEGY.blockResources, true);
    assert.strictEqual(DEFAULT_STRATEGY.qualityThresholdWords, 100);
    assert.strictEqual(DEFAULT_STRATEGY.retries, 1);
  });

  test('mergeStrategy passes through detected values', () => {
    const detected = detectStrategy('https://bloomberg.com/news');
    const merged = mergeStrategy({}, detected);
    assert.strictEqual(merged.name, 'bloomberg');
    assert.strictEqual(merged.qualityThresholdWords, 200);
    assert.strictEqual(merged.retries, 2);
  });

  test('mergeStrategy overrides with user opts', () => {
    const detected = detectStrategy('https://bloomberg.com/news');
    const merged = mergeStrategy({ qualityThreshold: 50, retries: 5 }, detected);
    assert.strictEqual(merged.qualityThresholdWords, 50);
    assert.strictEqual(merged.retries, 5);
  });

  test('mergeStrategy respects --wait override', () => {
    const detected = detectStrategy('https://example.com');
    const merged = mergeStrategy({ wait: 10 }, detected);
    assert.strictEqual(merged.extraWaitMs, 10000);
  });

  test('mergeStrategy preserves blockResources default', () => {
    const detected = detectStrategy('https://example.com');
    const merged = mergeStrategy({}, detected);
    assert.strictEqual(merged.blockResources, true);
  });

  test('mergeStrategy respects blockResources: false', () => {
    const detected = detectStrategy('https://example.com');
    const merged = mergeStrategy({ blockResources: false }, detected);
    assert.strictEqual(merged.blockResources, false);
  });

  test('mergeStrategy respects blockResources: true', () => {
    const detected = detectStrategy('https://example.com');
    const merged = mergeStrategy({ blockResources: true }, detected);
    assert.strictEqual(merged.blockResources, true);
  });

  test('mergeStrategy string viewport → object viewport', () => {
    const detected = detectStrategy('https://example.com');
    const merged = mergeStrategy({ viewport: 'mobile' }, detected);
    assert.strictEqual(merged.viewport.width, 375);
    assert.strictEqual(merged.viewport.height, 667);
    assert.strictEqual(merged.viewport.isMobile, true);
  });

  test('mergeStrategy object viewport', () => {
    const detected = detectStrategy('https://example.com');
    const merged = mergeStrategy({ viewport: { width: 800, height: 600 } }, detected);
    assert.strictEqual(merged.viewport.width, 800);
    assert.strictEqual(merged.viewport.height, 600);
  });

  test('mergeStrategy respects strategy override', () => {
    const detected = detectStrategy('https://bloomberg.com/news');
    const merged = mergeStrategy({ strategy: 'custom' }, detected);
    assert.strictEqual(merged.name, 'custom');
  });

  test('bloomberg has paywall selectors', () => {
    const s = detectStrategy('https://bloomberg.com/news');
    assert.ok(s.paywallSelectors.length > 0);
  });

  test('reuters has paywall selectors', () => {
    const s = detectStrategy('https://reuters.com/world');
    assert.ok(s.paywallSelectors.length > 0);
  });

  test('cnbc has no paywall selectors', () => {
    const s = detectStrategy('https://cnbc.com/2024');
    assert.deepStrictEqual(s.paywallSelectors, []);
  });
}

// ---------------------------------------------------------------------------
// 3. UNIT TESTS — extractor.js (synchronous)
// ---------------------------------------------------------------------------

group('3. Content Extractor (src/extractor.js)');
{
  const { createTurndown, extractContent } = require('../src/extractor');
  const { DEFAULT_STRATEGY } = require('../src/strategies');

  test('createTurndown returns a TurndownService instance', () => {
    const t = createTurndown();
    assert.ok(t.turndown);
    assert(typeof t.turndown === 'function');
  });

  test('createTurndown respects noImages option', () => {
    const t = createTurndown({ noImages: true });
    const html = '<p>Hello <img src="x.png"> World</p>';
    const md = t.turndown(html);
    assert(!md.includes('x.png'));
  });

  test('createTurndown respects noLinks option', () => {
    const t = createTurndown({ noLinks: true });
    const html = '<p>Hello <a href="/x">World</a>!</p>';
    const md = t.turndown(html);
    assert(!md.includes('/x'));
    assert(md.includes('World'));
  });

  test('extractContent converts HTML to markdown', () => {
    const html = '<html><body><h1>Title</h1><p>Some paragraph text here with more words to pass the threshold check.</p></body></html>';
    const strategy = { ...DEFAULT_STRATEGY, qualityThresholdWords: 5 };
    const result = extractContent(html, 'Title', 'https://example.com', strategy);
    assert.ok(result.markdown.includes('# Title'));
    assert.ok(result.markdown.includes('Some paragraph text here'));
  });

  test('extractContent returns correct shape', () => {
    const html = '<html><body><h1>H</h1><p>Word one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty more words here.</p></body></html>';
    const strategy = { ...DEFAULT_STRATEGY, qualityThresholdWords: 5 };
    const result = extractContent(html, 'H', 'https://example.com', strategy);
    assert.strictEqual(result.url, 'https://example.com');
    assert.strictEqual(result.title, 'H');
    assert.ok(typeof result.markdown === 'string');
    assert.ok(typeof result.content === 'string');
    assert.ok(result.wordCount > 0);
    assert.ok(result.charCount > 0);
    assert.strictEqual(result.provider, 'puppeteer-turndown-enhanced');
    assert.strictEqual(result.siteType, 'generic');
  });

  test('extractContent throws contentQuality error when word count below threshold', () => {
    const html = '<html><body><p>tiny</p></body></html>';
    try {
      extractContent(html, 'T', 'https://example.com', DEFAULT_STRATEGY);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.strictEqual(err.category, 'content-quality');
    }
  });

  test('extractContent respects qualityThresholdWords from strategy', () => {
    const html = '<html><body><h1>Short</h1></body></html>';
    const strategy = { ...DEFAULT_STRATEGY, qualityThresholdWords: 1 };
    const result = extractContent(html, 'Short', 'https://example.com', strategy);
    assert.ok(result);
  });

  test('extractContent normalizes excessive newlines', () => {
    const html = '<html><body><p>A</p><p>B</p><p>C</p></body></html>';
    const strategy = { ...DEFAULT_STRATEGY, qualityThresholdWords: 1 };
    const result = extractContent(html, 'T', 'https://example.com', strategy);
    assert.ok(!/\n{4,}/.test(result.markdown));
  });

  test('extractContent preserves heading style (ATX)', () => {
    const html = '<html><body><h1>Level One</h1><h2>Level Two</h2></body></html>';
    const strategy = { ...DEFAULT_STRATEGY, qualityThresholdWords: 1 };
    const result = extractContent(html, 'T', 'https://example.com', strategy);
    assert.ok(result.markdown.startsWith('# Level One'));
    assert.ok(result.markdown.includes('## Level Two'));
  });
}

// ---------------------------------------------------------------------------
// 4. SYNCHRONOUS TESTS — CLI & package (no browser, no network)
// ---------------------------------------------------------------------------

group('4. CLI & Package (synchronous)');
{
  test('package.json has test script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.ok(pkg.scripts.test, 'Has test script');
    assert.strictEqual(pkg.scripts.test, 'node test/test.cjs');
  });

  test('bin/url2md.js exists', () => {
    const stat = fs.statSync(path.join(__dirname, '..', 'bin', 'url2md.js'));
    assert.ok(stat.isFile());
  });

  test('all source files exist', () => {
    const srcDir = path.join(__dirname, '..', 'src');
    const files = ['errors.js', 'strategies.js', 'loader.js', 'extractor.js', 'http-fallback.js', 'converter.js'];
    files.forEach((f) => {
      assert.ok(fs.existsSync(path.join(srcDir, f)), `${f} exists`);
    });
  });

  test('test.cjs exists', () => {
    const stat = fs.statSync(path.join(__dirname, 'test.cjs'));
    assert.ok(stat.isFile());
  });
}

// ---------------------------------------------------------------------------
// ASYNC TEST GROUPS — these need await, so they run inside main()
// ---------------------------------------------------------------------------

async function runAsyncTests(unitOnly) {
  // ---- 5. HTTP Fallback (async, network-only) ----
  group('5. HTTP Fallback (src/http-fallback.js)');
  {
    const { tryHttpFallback, httpExtractContent } = require('../src/http-fallback');
    const { detectStrategy, mergeStrategy } = require('../src/strategies');

    await asyncTest('tryHttpFallback returns null for nonexistent domain', async () => {
      const result = await tryHttpFallback('https://this-domain-definitely-does-not-exist-xyz123.com');
      assert.strictEqual(result, null);
    });

    await asyncTest('tryHttpFallback succeeds for AP News article', async () => {
      const result = await tryHttpFallback(
        'https://apnews.com/article/b52-crash-california-edwards-air-force-base-ea237a6eec587adbbf9e7a578014ca93',
        { timeout: 20 }
      );
      assert.ok(result !== null, 'HTTP fallback should succeed for AP News article');
      assert.ok(result.wordCount >= 50, `Expected >= 50 words, got ${result.wordCount}`);
      assert.ok(result.title.length > 0, 'Should have a title');
    });

    await asyncTest('tryHttpFallback returns null for tiny page (example.com)', async () => {
      const result = await tryHttpFallback('https://example.com');
      assert.strictEqual(result, null);
    });

    test('httpExtractContent produces correct shape', () => {
      const strategy = mergeStrategy({}, detectStrategy('https://example.com'));
      const result = httpExtractContent(
        '<p>Hello world.</p>',
        'Test Title',
        'https://example.com',
        {},
        strategy
      );
      assert.strictEqual(result.provider, 'axios-cheerio');
      assert.strictEqual(result.title, 'Test Title');
      assert.ok(result.wordCount > 0);
      assert.ok(result.markdown.length > 0);
    });
  }

  // ---- 6. Converter Pipeline (async, needs browser) ----
  group('6. Converter Pipeline (src/converter.js)');
  {
    const { urlToMd, urlToJson, batchConvert } = require('../src/converter');

    await asyncTest('urlToMd throws parseError for null URL', async () => {
      try {
        await urlToMd(null);
        assert.fail('Should have thrown');
      } catch (err) {
        assert.strictEqual(err.category, 'parse-error');
      }
    });

    await asyncTest('urlToMd throws parseError for empty string', async () => {
      try {
        await urlToMd('');
        assert.fail('Should have thrown');
      } catch (err) {
        assert.strictEqual(err.category, 'parse-error');
      }
    });

    await asyncTest('urlToMd auto-prefixes https://', async () => {
      try {
        await urlToMd('example.com');
      } catch (err) {
        assert.notStrictEqual(err.category, 'parse-error');
      }
    });

    await asyncTest('urlToMd returns correct shape on success (AP News via HTTP fallback)', async () => {
      const result = await urlToMd(
        'https://apnews.com/article/b52-crash-california-edwards-air-force-base-ea237a6eec587adbbf9e7a578014ca93',
        { qualityThreshold: 50, timeout: 30 }
      );
      assert.ok(result.markdown, 'Has markdown');
      assert.ok(result.content, 'Has content (alias)');
      assert.ok(result.title, 'Has title');
      assert.ok(result.wordCount >= 50, `Word count ${result.wordCount} >= 50`);
      assert.ok(result.charCount > 0, 'Has charCount');
      assert.ok(['axios-cheerio', 'puppeteer-turndown-enhanced'].includes(result.provider),
        `Provider is ${result.provider}`);
      assert.ok(result.viewport, 'Has viewport');
      assert.ok(result.siteType, 'Has siteType');
    });

    await asyncTest('urlToMd with --no-images works', async () => {
      const result = await urlToMd(
        'https://apnews.com/article/b52-crash-california-edwards-air-force-base-ea237a6eec587adbbf9e7a578014ca93',
        { qualityThreshold: 50, timeout: 30, noImages: true }
      );
      assert.ok(result);
    });

    await asyncTest('urlToMd with --no-links works', async () => {
      const result = await urlToMd(
        'https://apnews.com/article/b52-crash-california-edwards-air-force-base-ea237a6eec587adbbf9e7a578014ca93',
        { qualityThreshold: 50, timeout: 30, noLinks: true }
      );
      assert.ok(result);
    });

    await asyncTest('urlToMd with custom qualityThreshold on tiny page', async () => {
      const result = await urlToMd('https://example.com', { qualityThreshold: 10, timeout: 30 });
      assert.ok(result);
      assert.ok(result.wordCount > 0);
    });

    await asyncTest('urlToMd with viewport mobile', async () => {
      const result = await urlToMd(
        'https://apnews.com/article/b52-crash-california-edwards-air-force-base-ea237a6eec587adbbf9e7a578014ca93',
        { qualityThreshold: 50, timeout: 30, viewport: 'mobile' }
      );
      assert.ok(result);
    });

    await asyncTest('urlToMd with --block-resources false', async () => {
      const result = await urlToMd(
        'https://apnews.com/article/b52-crash-california-edwards-air-force-base-ea237a6eec587adbbf9e7a578014ca93',
        { qualityThreshold: 50, timeout: 30, blockResources: false }
      );
      assert.ok(result);
    });

    // urlToJson

    await asyncTest('urlToJson returns success shape with error: null', async () => {
      const result = await urlToJson(
        'https://apnews.com/article/b52-crash-california-edwards-air-force-base-ea237a6eec587adbbf9e7a578014ca93',
        { qualityThreshold: 50, timeout: 30 }
      );
      assert.strictEqual(result.error, null);
      assert.ok(result.url);
      assert.ok(result.markdown);
      assert.ok(result.wordCount > 0);
      assert.ok(result.timestamp);
      assert.ok(result.siteType);
    });

    await asyncTest('urlToJson returns error shape on failure', async () => {
      const result = await urlToJson('https://this-does-not-exist-xyz123.com', { timeout: 10 });
      assert.ok(result.error, 'Should have error field');
      assert.strictEqual(result.title, null);
      assert.strictEqual(result.markdown, null);
      assert.strictEqual(result.wordCount, 0);
      assert.ok(result.error.message.length > 0);
      assert.ok(result.error.category);
    });

    await asyncTest('urlToJson includes timestamp', async () => {
      const result = await urlToJson(
        'https://apnews.com/article/b52-crash-california-edwards-air-force-base-ea237a6eec587adbbf9e7a578014ca93',
        { qualityThreshold: 50, timeout: 30 }
      );
      assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(result.timestamp));
    });

    // batchConvert

    await asyncTest('batchConvert processes single URL', async () => {
      const results = await batchConvert(
        ['https://apnews.com/article/b52-crash-california-edwards-air-force-base-ea237a6eec587adbbf9e7a578014ca93'],
        { qualityThreshold: 50, timeout: 30 }
      );
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].success, true);
      assert.ok(results[0].data);
    });

    await asyncTest('batchConvert reports errorCategory for failed URLs', async () => {
      const results = await batchConvert(
        ['https://this-domain-definitely-does-not-exist-xyz123.com'],
        { timeout: 10 }
      );
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].success, false);
      assert.ok(results[0].errorCategory, 'Should have errorCategory');
      assert.ok(results[0].error.length > 0);
    });

    await asyncTest('batchConvert handles mixed success/failure', async () => {
      const results = await batchConvert([
        'https://apnews.com/article/b52-crash-california-edwards-air-force-base-ea237a6eec587adbbf9e7a578014ca93',
        'https://this-domain-definitely-does-not-exist-xyz123.com',
      ], { qualityThreshold: 50, timeout: 15 });
      assert.strictEqual(results.length, 2);
      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);
      assert.ok(successes.length > 0, 'At least one success');
      assert.ok(failures.length > 0, 'At least one failure');
    });
  }

  // ---- 7. Loader (async, needs browser) ----
  group('7. Loader (src/loader.js)');
  {
    const { loadPageWithRetry } = require('../src/loader');
    const { detectStrategy, mergeStrategy } = require('../src/strategies');

    await asyncTest('loadPageWithRetry succeeds for AP News article', async () => {
      const strategy = mergeStrategy(
        { qualityThreshold: 50, timeout: 30 },
        detectStrategy('https://apnews.com/article/b52-crash-california-edwards-air-force-base-ea237a6eec587adbbf9e7a578014ca93')
      );
      const result = await loadPageWithRetry(
        'https://apnews.com/article/b52-crash-california-edwards-air-force-base-ea237a6eec587adbbf9e7a578014ca93',
        strategy,
        { timeout: 30, qualityThreshold: 50 }
      );
      assert.ok(result.html.length > 0, 'Should have HTML');
      assert.ok(result.title.length > 0, 'Should have title');
    });

    await asyncTest('loadPageWithRetry categorizes DNS failure as blocked', async () => {
      const strategy = mergeStrategy({}, detectStrategy('https://nonexistent-xyz123.com'));
      try {
        await loadPageWithRetry('https://nonexistent-xyz123.com', strategy, { timeout: 10 });
        assert.fail('Should have thrown');
      } catch (err) {
        assert.strictEqual(err.category, 'blocked', `Expected 'blocked', got '${err.category}'`);
      }
    });

    await asyncTest('loadPageWithRetry works with resource blocking enabled', async () => {
      const strategy = mergeStrategy(
        { blockResources: true, qualityThreshold: 50, timeout: 30 },
        detectStrategy('https://apnews.com')
      );
      const result = await loadPageWithRetry('https://apnews.com', strategy, {
        timeout: 30,
        blockResources: true,
      });
      assert.ok(result.html.length > 0);
    });

    await asyncTest('loadPageWithRetry works with resource blocking disabled', async () => {
      const strategy = mergeStrategy(
        { blockResources: false, qualityThreshold: 50, timeout: 30 },
        detectStrategy('https://apnews.com')
      );
      const result = await loadPageWithRetry('https://apnews.com', strategy, {
        timeout: 30,
        blockResources: false,
      });
      assert.ok(result.html.length > 0);
    });
  }

  // ---- 8. Backwards Compatibility (async, needs browser) ----
  group('8. Backwards Compatibility');
  {
    const { urlToMd, urlToJson, batchConvert } = require('../src/converter');

    await asyncTest('urlToMd return shape matches original contract', async () => {
      const result = await urlToMd(
        'https://apnews.com/article/b52-crash-california-edwards-air-force-base-ea237a6eec587adbbf9e7a578014ca93',
        { qualityThreshold: 50, timeout: 30 }
      );
      assert.ok('url' in result, 'Has url');
      assert.ok('title' in result, 'Has title');
      assert.ok('markdown' in result, 'Has markdown');
      assert.ok('content' in result, 'Has content');
      assert.ok('wordCount' in result, 'Has wordCount');
      assert.ok('charCount' in result, 'Has charCount');
      assert.ok('provider' in result, 'Has provider');
      assert.ok('viewport' in result, 'Has viewport');
      assert.ok('siteType' in result, 'Has siteType (new)');
    });

    await asyncTest('urlToJson return shape matches original contract', async () => {
      const result = await urlToJson(
        'https://apnews.com/article/b52-crash-california-edwards-air-force-base-ea237a6eec587adbbf9e7a578014ca93',
        { qualityThreshold: 50, timeout: 30 }
      );
      assert.ok('url' in result);
      assert.ok('title' in result);
      assert.ok('markdown' in result);
      assert.ok('wordCount' in result);
      assert.ok('charCount' in result);
      assert.ok('timestamp' in result);
      assert.ok('provider' in result);
      assert.ok('viewport' in result);
      assert.ok('siteType' in result);
      assert.ok('error' in result);
    });

    await asyncTest('batchConvert return shape matches original contract', async () => {
      const results = await batchConvert(
        ['https://apnews.com/article/b52-crash-california-edwards-air-force-base-ea237a6eec587adbbf9e7a578014ca93'],
        { qualityThreshold: 50, timeout: 30 }
      );
      const r = results[0];
      assert.ok('url' in r);
      assert.ok('success' in r);
      assert.ok('data' in r);
      assert.ok('error' in r);
      assert.ok('errorCategory' in r);
    });

    await asyncTest('viewport in return is {width, height}', async () => {
      const result = await urlToMd(
        'https://apnews.com/article/b52-crash-california-edwards-air-force-base-ea237a6eec587adbbf9e7a578014ca93',
        { qualityThreshold: 50, timeout: 30 }
      );
      assert.ok('width' in result.viewport, 'viewport has width');
      assert.ok('height' in result.viewport, 'viewport has height');
    });
  }
}

// ---------------------------------------------------------------------------
// Summary & persistence
// ---------------------------------------------------------------------------

function printSummary() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  SUMMARY');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Passed:  ${passed}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total:   ${passed + failed + skipped}`);
  console.log(`${'═'.repeat(60)}`);

  if (failed > 0) {
    console.log('\n  FAILURES:');
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => {
        console.log(`    ${r.label}`);
        console.log(`      ${r.error}`);
      });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const unitOnly = args.includes('--unit-only');
  const startTime = Date.now();

  // Run async test groups (HTTP fallback + integration + backwards compat)
  if (!unitOnly) {
    await runAsyncTests(unitOnly);
  }

  // Wait for all async tests to settle (belt and suspenders)
  await Promise.all(pendingAsyncTests);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  printSummary();

  // Save results to file
  const resultFile = path.join(__dirname, 'test-result.json');
  const resultData = {
    timestamp: new Date().toISOString(),
    durationSec: parseFloat(elapsed),
    passed,
    failed,
    skipped,
    total: passed + failed + skipped,
    results,
  };
  fs.writeFileSync(resultFile, JSON.stringify(resultData, null, 2));
  console.log(`\n  Results saved to ${resultFile}`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
