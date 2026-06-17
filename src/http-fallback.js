/**
 * HTTP fallback — try axios + cheerio for static pages before launching Puppeteer.
 *
 * Many news articles and documentation pages render fully server-side.
 * This module detects those cases and converts them without the overhead
 * of a headless browser.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const TurndownService = require('turndown');
const { ERRORS } = require('./errors');

/**
 * Attempt to fetch and convert a URL using HTTP + cheerio.
 * Returns { html, title, wordCount } on success, or null on failure.
 *
 * @param {string} url
 * @param {Object} opts
 * @returns {Promise<{html: string, title: string, wordCount: number}|null>}
 */
async function tryHttpFallback(url, opts = {}) {
  let client;
  try {
    client = axios.create({
      timeout: (opts.timeout || 30) * 1000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      maxRedirects: 5,
      validateStatus: () => true, // handle all status codes
    });

    const response = await client.get(url);
    const statusCode = response.status;

    // Only accept 2xx
    if (statusCode < 200 || statusCode >= 300) {
      return null;
    }

    const html = response.data;
    if (!html || typeof html !== 'string') return null;

    const $ = cheerio.load(html);

    const title = $('title').text().trim() || $('h1').first().text().trim() || '';

    // Extract main content BEFORE aggressive cleanup so we don't lose it
    const selectorCandidates = [
      'article', '[class*="article-body"]', '[class*="post-content"]',
      '[class*="story-body"]', '.entry-content', '.post-content',
      'main', '#content', '.content',
    ];
    let bodyHtml = null;
    for (const sel of selectorCandidates) {
      const el = $(sel).first();
      if (el.length > 0) {
        const inner = el.html();
        if (inner && typeof inner === 'string') {
          bodyHtml = inner;
          break;
        }
      }
    }
    if (!bodyHtml) {
      bodyHtml = $('body').html();
    }
    if (!bodyHtml || typeof bodyHtml !== 'string') return null;

    // Clean the extracted HTML in a fresh document
    const $clean = cheerio.load(`<html><body>${bodyHtml}</body></html>`);
    $clean('script, style, noscript, iframe, .ad, .ads, .advertisement, .cookie, .modal, .popup, .sidebar, .navigation').remove();

    const cleanBodyText = $clean('body').text();
    const wordCount = cleanBodyText.split(/\s+/).filter((w) => w.length > 0).length;

    // Need minimum content to be worth the HTTP call
    if (wordCount < 50) return null;

    return { html: $clean('body').html(), title, wordCount };
  } catch (err) {
    // Network error, DNS failure, timeout — fall back to Puppeteer
    return null;
  }
}

/**
 * Convert raw HTML (from HTTP fallback) to markdown.
 * @param {string} html
 * @param {string} title
 * @param {string} url
 * @param {Object} opts
 * @param {Object} strategy
 * @returns {{url, title, markdown, content, wordCount, charCount, provider, viewport, siteType}}
 */
function httpExtractContent(html, title, url, opts, strategy) {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  });

  // Handle images
  if (opts.noImages) {
    turndown.addRule('removeImages', {
      filter: ['img', 'picture', 'svg'],
      replacement: () => '',
    });
  }

  // Handle links
  if (opts.noLinks) {
    turndown.addRule('removeLinks', {
      filter: 'a',
      replacement: (content) => content,
    });
  }

  let markdown = turndown.turndown(`<html><body>${html}</body></html>`);
  markdown = markdown.replace(/\n{4,}/g, '\n\n').trim();

  const words = markdown.split(/\s+/).filter((w) => w.length > 0);

  return {
    url,
    title,
    markdown,
    content: markdown,
    wordCount: words.length,
    charCount: markdown.length,
    provider: 'axios-cheerio',
    viewport: { width: 1280, height: 900 },
    siteType: strategy.siteType || 'generic',
  };
}

module.exports = { tryHttpFallback, httpExtractContent };
