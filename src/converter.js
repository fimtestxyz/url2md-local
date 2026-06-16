/**
 * URL to Markdown Converter
 * Uses Puppeteer (headless Chrome) + Turndown for HTML to Markdown conversion
 */

const puppeteer = require('puppeteer');
const TurndownService = require('turndown');

async function urlToMd(url, options = {}) {
  const opts = {
    headless: true,
    viewport: 'desktop',
    timeout: 30,
    clean: false,
    noImages: false,
    noLinks: false,
    ...options
  };
  
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid URL provided');
  }
  
  let normalizedUrl = url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    normalizedUrl = 'https://' + url;
  }
  
  const viewports = {
    mobile: { width: 375, height: 667 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1920, height: 1080 }
  };
  
  const vp = viewports[opts.viewport] || viewports.desktop;
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  await page.setViewport({
    width: vp.width,
    height: vp.height,
    isMobile: opts.viewport === 'mobile',
    hasTouch: opts.viewport !== 'desktop'
  });
  
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
  
  await page.goto(normalizedUrl, {
    waitUntil: 'domcontentloaded',
    timeout: opts.timeout * 1000
  });
  
  // Small wait for JS content
  await new Promise(r => setTimeout(r, 2000));
  
  const title = await page.title();
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  
  await browser.close();
  
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined'
  });
  
  if (opts.noImages) {
    turndownService.addRule('removeImages', {
      filter: ['img', 'picture', 'figure'],
      replacement: () => ''
    });
  }
  
  if (opts.noLinks) {
    turndownService.addRule('removeLinks', {
      filter: 'a',
      replacement: (content) => content
    });
  }
  
  let markdown = turndownService.turndown(html);
  markdown = markdown.replace(/\n{4,}/g, '\n\n').trim();
  
  const wordCount = markdown.split(/\s+/).filter(w => w.length > 0).length;
  
  return {
    url: normalizedUrl,
    title,
    markdown,
    content: markdown,
    wordCount,
    charCount: markdown.length,
    provider: 'puppeteer-turndown',
    viewport: vp
  };
}

async function urlToJson(url, options = {}) {
  const result = await urlToMd(url, options);
  
  return {
    url: result.url,
    title: result.title,
    markdown: result.markdown,
    wordCount: result.wordCount,
    charCount: result.charCount,
    timestamp: new Date().toISOString(),
    provider: result.provider,
    viewport: result.viewport
  };
}

async function batchConvert(urls, options = {}) {
  const concurrency = 3;
  const results = [];
  
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(url => urlToMd(url, options))
    );
    
    results.push(...batchResults.map((result, index) => ({
      url: batch[index],
      success: result.status === 'fulfilled',
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason.message : null
    })));
  }
  
  return results;
}

module.exports = { urlToMd, urlToJson, batchConvert };
