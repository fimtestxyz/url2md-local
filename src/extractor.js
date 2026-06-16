/**
 * Content extractor — Turndown configuration, paywall detection,
 * quality scoring, and HTML cleaning.
 */

const TurndownService = require('turndown');
const { ERRORS } = require('./errors');

/**
 * Create a configured TurndownService instance.
 * @param {Object} opts
 * @returns {TurndownService}
 */
function createTurndown(opts = {}) {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    ...opts,
  });

  // Preserve pre/code blocks
  turndown.addRule('codeBlock', {
    filter: 'pre',
    replacement: (content) => `\n\`\`\`\n${content.trim()}\n\`\`\`\n`,
  });

  // Preserve tables with extra spacing
  turndown.addRule('table', {
    filter: 'table',
    replacement: (content) => `\n\n${content}\n\n`,
  });

  // Preserve blockquotes with proper prefixing
  turndown.addRule('blockquote', {
    filter: 'blockquote',
    replacement: (content) =>
      '\n' +
      content
        .trim()
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n') +
      '\n',
  });

  // Handle figure/figcaption pairs
  turndown.addRule('figure', {
    filter: 'figure',
    replacement: (content) => {
      const figcaptionMatch = content.match(/<figcaption>(.*?)<\/figcaption>/s);
      const caption = figcaptionMatch
        ? `\n\n*${figcaptionMatch[1].trim()}*\n\n`
        : '';
      return content.replace(/<figcaption>.*?<\/figcaption>/s, '').trim() + caption;
    },
  });

  if (opts.noImages) {
    turndown.addRule('removeImages', {
      filter: ['img', 'picture', 'svg'],
      replacement: () => '',
    });
  }

  if (opts.noLinks) {
    turndown.addRule('removeLinks', {
      filter: 'a',
      replacement: (content) => content,
    });
  }

  return turndown;
}

/**
 * Check if a paywall overlay is present on the page.
 * @param {import('puppeteer').Page} page
 * @param {Object} strategy
 * @returns {Promise<boolean>}
 */
async function detectPaywall(page, strategy) {
  if (!strategy.paywallSelectors || strategy.paywallSelectors.length === 0) {
    return false;
  }

  try {
    const found = await page.evaluate((selectors) => {
      return selectors.some((sel) => document.querySelector(sel) !== null);
    }, strategy.paywallSelectors);
    return found;
  } catch {
    return false;
  }
}

/**
 * Clean the HTML by removing navigation, footers, scripts, styles, and ad elements.
 * Runs via page.evaluate in the browser context.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<string>} Cleaned HTML.
 */
async function cleanHtml(page) {
  try {
    return await page.evaluate(() => {
      // Remove common unwanted elements
      const selectorsToRemove = [
        'nav',
        'footer',
        'header',
        'aside',
        'script',
        'style',
        'noscript',
        '.ad',
        '.ads',
        '.advertisement',
        '.banner',
        '.cookie',
        '.modal',
        '.popup',
        '.sidebar',
        '.navigation',
        '.breadcrumb',
        '.share',
        '.comments',
        '.related',
        '[class*="ad"]',
        '[class*="banner"]',
        '[class*="cookie"]',
        '[class*="popup"]',
        '[class*="modal"]',
        '[class*="sidebar"]',
        '[class*="navigation"]',
        '[class*="newsletter"]',
        '[class*="social"]',
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
          cls.includes('doubleclick') ||
          cls.includes('analytics') ||
          cls.includes('tracking')
        ) {
          el.remove();
        }
      }

      return document.documentElement.outerHTML;
    });
  } catch {
    // If evaluation fails, return null to signal cleaning failed
    return null;
  }
}

/**
 * Extract and convert HTML to markdown with quality checks.
 * @param {string} html
 * @param {string} title
 * @param {string} url
 * @param {Object} strategy
 * @param {Object} opts
 * @returns {{url: string, title: string, markdown: string, content: string, wordCount: number, charCount: number, provider: string, viewport: {width: number, height: number}, siteType: string}}
 * @throws {Url2mdError} on content quality failure.
 */
function extractContent(html, title, url, strategy, opts = {}) {
  const turndown = createTurndown(opts);
  let markdown = turndown.turndown(html);

  // Normalize excessive whitespace
  markdown = markdown.replace(/\n{4,}/g, '\n\n').trim();

  // Calculate quality metrics
  const words = markdown.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;
  const threshold = strategy.qualityThresholdWords || 100;

  const result = {
    url,
    title,
    markdown,
    content: markdown,
    wordCount,
    charCount: markdown.length,
    provider: 'puppeteer-turndown-enhanced',
    viewport: { width: strategy.viewport.width, height: strategy.viewport.height },
    siteType: strategy.siteType || 'generic',
  };

  // Quality check
  if (wordCount < threshold) {
    throw ERRORS.contentQuality(
      `Content quality below threshold: ${wordCount} words (threshold: ${threshold}). ` +
        `This may be a paywall, homepage, or error page.`,
      { wordCount, threshold, url }
    );
  }

  return result;
}

module.exports = { createTurndown, cleanHtml, detectPaywall, extractContent };
