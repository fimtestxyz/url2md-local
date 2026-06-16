/**
 * URL to Markdown Converter (Enhanced)
 *
 * Orchestrates HTTP fallback → browser loading → content extraction.
 * Preserves the original public API: urlToMd(), urlToJson(), batchConvert().
 */

const { detectStrategy, mergeStrategy } = require('./strategies');
const { loadPageWithRetry } = require('./loader');
const { extractContent } = require('./extractor');
const { tryHttpFallback, httpExtractContent } = require('./http-fallback');
const { ERRORS } = require('./errors');

async function urlToMd(url, options = {}) {
  const opts = {
    headless: true,
    timeout: 30,
    clean: false,
    noImages: false,
    noLinks: false,
    blockResources: true,
    ...options,
  };

  if (!url || typeof url !== 'string') {
    throw ERRORS.parseError('Invalid URL provided', { url });
  }

  let normalizedUrl = url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    normalizedUrl = 'https://' + url;
  }

  // Detect and merge strategy
  const detected = detectStrategy(normalizedUrl);
  const strategy = mergeStrategy(opts, detected);

  // Layer 1: Try HTTP fallback first for static pages
  try {
    const httpResult = await tryHttpFallback(normalizedUrl, opts);
    if (httpResult) {
      return httpExtractContent(
        httpResult.html,
        httpResult.title,
        normalizedUrl,
        opts,
        strategy
      );
    }
  } catch {
    // HTTP fallback failed; proceed to Puppeteer
  }

  // Layer 2: Load page via Puppeteer with retry (handles --clean inline)
  const { html, title } = await loadPageWithRetry(normalizedUrl, strategy, opts);

  // Layer 3: Extract content → markdown
  const result = await extractContent(html, title, normalizedUrl, strategy, opts);

  return result;
}

async function urlToJson(url, options = {}) {
  try {
    const result = await urlToMd(url, options);

    return {
      url: result.url,
      title: result.title,
      markdown: result.markdown,
      wordCount: result.wordCount,
      charCount: result.charCount,
      timestamp: new Date().toISOString(),
      provider: result.provider,
      viewport: result.viewport,
      siteType: result.siteType,
      error: null,
    };
  } catch (error) {
    return {
      url,
      title: null,
      markdown: null,
      wordCount: 0,
      charCount: 0,
      timestamp: new Date().toISOString(),
      provider: 'puppeteer-turndown-enhanced',
      siteType: null,
      error: {
        message: error.message || String(error),
        category: error.category || 'unknown',
        details: error.details || {},
      },
    };
  }
}

async function batchConvert(urls, options = {}) {
  const concurrency = 3;
  const results = [];

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map((url) => urlToMd(url, options))
    );

    results.push(
      ...batchResults.map((result, index) => ({
        url: batch[index],
        success: result.status === 'fulfilled',
        data: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason.message || String(result.reason) : null,
        errorCategory: result.status === 'rejected' ? result.reason.category || null : null,
      }))
    );
  }

  return results;
}

module.exports = { urlToMd, urlToJson, batchConvert };
