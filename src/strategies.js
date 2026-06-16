/**
 * Site strategies — domain detection and per-site configuration.
 *
 * Detects the site type from the URL and returns a strategy object
 * with viewport, user-agent, wait time, resource blocking preferences,
 * and selectors for article content and paywall detection.
 */

const DEFAULT_STRATEGY = {
  name: 'default',
  siteType: 'generic',
  viewport: { width: 1280, height: 900, isMobile: false, hasTouch: false },
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  extraWaitMs: 1500,
  blockResources: true,
  articleSelector:
    'article, .article-body, .post-content, [class*="article"], [class*="content"], main, .content, .article, .post, .story',
  paywallSelectors: [],
  qualityThresholdWords: 100,
  retries: 1,
  retryBackoffMs: 1000,
};

/**
 * Premium / well-known news sites with tailored strategies.
 */
const PREMIUM_NEWS = [
  {
    domains: ['bloomberg.com'],
    name: 'bloomberg',
    siteType: 'premium-news',
    viewport: { width: 1280, height: 900, isMobile: false, hasTouch: false },
    extraWaitMs: 3000,
    articleSelector:
      'article, [data-testid="article-body"], .body__article, .article-body, .story-body',
    paywallSelectors: ['[data-testid="paywall"]', '.paywall-overlay', '.gated-section', '[class*="paywall"]'],
    qualityThresholdWords: 200,
    retries: 2,
    retryBackoffMs: 1500,
  },
  {
    domains: ['reuters.com'],
    name: 'reuters',
    siteType: 'premium-news',
    viewport: { width: 1280, height: 900, isMobile: false, hasTouch: false },
    extraWaitMs: 2500,
    articleSelector:
      'article, [data-testid="ArticleBody"], .story-body, .article-body, .article__body',
    paywallSelectors: ['.paywall-container', '.restricted-content'],
    qualityThresholdWords: 150,
    retries: 2,
    retryBackoffMs: 1500,
  },
  {
    domains: ['nytimes.com'],
    name: 'nytimes',
    siteType: 'premium-news',
    viewport: { width: 1280, height: 900, isMobile: false, hasTouch: false },
    extraWaitMs: 3000,
    articleSelector:
      'article, .article-body, [data-testid="article-body"], .css-, [class*="story-body"]',
    paywallSelectors: ['#gateway-content', '.gateway-container', '[class*="subscription"]'],
    qualityThresholdWords: 200,
    retries: 2,
    retryBackoffMs: 2000,
  },
  {
    domains: ['wsj.com'],
    name: 'wsj',
    siteType: 'premium-news',
    viewport: { width: 1280, height: 900, isMobile: false, hasTouch: false },
    extraWaitMs: 3000,
    articleSelector:
      'article, .article-body, .wsj-article-body, .wsj-text',
    paywallSelectors: ['#paywallContainer', '.wsj-paywall', '.subscription-gate', '[class*="paywall"]'],
    qualityThresholdWords: 200,
    retries: 2,
    retryBackoffMs: 2000,
  },
  {
    domains: ['cnbc.com'],
    name: 'cnbc',
    siteType: 'news',
    viewport: { width: 1280, height: 900, isMobile: false, hasTouch: false },
    extraWaitMs: 2000,
    articleSelector:
      'article, .ArticleBody, .story-body__text, .article-body, .page-content',
    paywallSelectors: [],
    qualityThresholdWords: 100,
    retries: 1,
    retryBackoffMs: 1000,
  },
  {
    domains: ['foxnews.com'],
    name: 'foxnews',
    siteType: 'news',
    viewport: { width: 1280, height: 900, isMobile: false, hasTouch: false },
    extraWaitMs: 2000,
    articleSelector:
      'article, .article-body, .story-body, .article-content, [class*="article-body"]',
    paywallSelectors: [],
    qualityThresholdWords: 100,
    retries: 1,
    retryBackoffMs: 1000,
  },
  {
    domains: ['cnn.com'],
    name: 'cnn',
    siteType: 'news',
    viewport: { width: 1280, height: 900, isMobile: false, hasTouch: false },
    extraWaitMs: 2000,
    articleSelector:
      'article, .article-body, .container__Content, .text-element, [class*="article-body"]',
    paywallSelectors: [],
    qualityThresholdWords: 100,
    retries: 1,
    retryBackoffMs: 1000,
  },
  {
    domains: ['ft.com'],
    name: 'ft',
    siteType: 'premium-news',
    viewport: { width: 1280, height: 900, isMobile: false, hasTouch: false },
    extraWaitMs: 3000,
    articleSelector:
      'article, .fc-article__body, .article-body, [class*="article-body"]',
    paywallSelectors: ['[class*="paywall"]', '[class*="subscription"]', '#ft-paywall-wall'],
    qualityThresholdWords: 150,
    retries: 2,
    retryBackoffMs: 2000,
  },
  {
    domains: ['theguardian.com'],
    name: 'theguardian',
    siteType: 'news',
    viewport: { width: 1280, height: 900, isMobile: false, hasTouch: false },
    extraWaitMs: 2000,
    articleSelector:
      'article, .article-body, .article-body-wrapper, [class*="article-body"]',
    paywallSelectors: [],
    qualityThresholdWords: 100,
    retries: 1,
    retryBackoffMs: 1000,
  },
  {
    domains: ['apnews.com'],
    name: 'apnews',
    siteType: 'news',
    viewport: { width: 1280, height: 900, isMobile: false, hasTouch: false },
    extraWaitMs: 1500,
    articleSelector:
      'article, .article-body, [class*="article-body"], .StoryBody',
    paywallSelectors: [],
    qualityThresholdWords: 100,
    retries: 1,
    retryBackoffMs: 1000,
  },
  {
    domains: ['aljazeera.com'],
    name: 'aljazeera',
    siteType: 'news',
    viewport: { width: 1280, height: 900, isMobile: false, hasTouch: false },
    extraWaitMs: 2000,
    articleSelector:
      'article, .article-body, [class*="article-body"], .story-body',
    paywallSelectors: [],
    qualityThresholdWords: 100,
    retries: 1,
    retryBackoffMs: 1000,
  },
  {
    domains: ['politico.com'],
    name: 'politico',
    siteType: 'news',
    viewport: { width: 1280, height: 900, isMobile: false, hasTouch: false },
    extraWaitMs: 2000,
    articleSelector:
      'article, .article-body, .story-body, [class*="article-body"], .polymer-article',
    paywallSelectors: [],
    qualityThresholdWords: 100,
    retries: 1,
    retryBackoffMs: 1000,
  },
];

// Build a Map for O(1) domain lookups
const DOMAIN_STRATEGIES = new Map();
PREMIUM_NEWS.forEach((s) =>
  s.domains.forEach((d) => DOMAIN_STRATEGIES.set(d.toLowerCase(), s))
);

/**
 * Detect the best strategy for a given URL.
 * @param {string} url
 * @returns {Object} Strategy object (merged with defaults).
 */
function detectStrategy(url) {
  if (!url || typeof url !== 'string') return { ...DEFAULT_STRATEGY };

  let hostname;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return { ...DEFAULT_STRATEGY };
  }

  // Exact domain match
  if (DOMAIN_STRATEGIES.has(hostname)) {
    return { ...DEFAULT_STRATEGY, ...DOMAIN_STRATEGIES.get(hostname) };
  }

  // Parent domain match (e.g., "finance.yahoo.co.jp" → "yahoo.com")
  const parts = hostname.split('.');
  for (let i = 1; i < parts.length; i++) {
    const parent = parts.slice(i).join('.');
    if (DOMAIN_STRATEGIES.has(parent)) {
      return { ...DEFAULT_STRATEGY, ...DOMAIN_STRATEGIES.get(parent) };
    }
  }

  // Heuristic fallback for unknown domains
  const siteType = inferSiteType(hostname, url);
  return { ...DEFAULT_STRATEGY, siteType };
}

/**
 * Infer site type from hostname using keyword heuristics.
 * @param {string} hostname
 * @param {string} url
 * @returns {string} One of: 'news', 'blog', 'docs', 'generic'
 */
function inferSiteType(hostname, url) {
  const knownNews = [
    'bbc', 'guardian', 'apnews', 'aljazeera', 'politico', 'axios',
    'fortune', 'businessinsider', 'marketwatch', 'ft', 'financialtimes',
    'bloomberg', 'reuters', 'cnbc', 'foxnews', 'cnn', 'msnbc',
  ];
  const knownBlog = ['medium', 'substack', 'ghost', 'hashnode'];
  const knownDocs = ['docs.', 'developer.', 'api.', 'wiki.'];

  const hostLower = hostname.toLowerCase();

  if (knownNews.some((k) => hostLower.includes(k))) return 'news';
  if (knownBlog.some((k) => hostLower.includes(k))) return 'blog';
  if (knownDocs.some((k) => hostLower.startsWith(k))) return 'docs';
  return 'generic';
}

/**
 * Merge user-provided CLI options over the detected strategy.
 * User options take priority.
 * @param {Object} userOpts - Options from CLI / caller.
 * @param {Object} detected - Strategy from detectStrategy().
 * @returns {Object} Merged strategy.
 */
function mergeStrategy(userOpts, detected) {
  const viewport = resolveViewport(userOpts.viewport || detected.viewport);
  return {
    ...detected,
    name: userOpts.strategy || detected.name,
    viewport,
    userAgent: userOpts.userAgent || detected.userAgent,
    extraWaitMs: userOpts.wait
      ? parseInt(userOpts.wait, 10) * 1000
      : detected.extraWaitMs,
    blockResources:
      userOpts.blockResources !== undefined
        ? userOpts.blockResources
        : detected.blockResources,
    articleSelector: detected.articleSelector,
    paywallSelectors: detected.paywallSelectors,
    qualityThresholdWords:
      userOpts.qualityThreshold !== undefined
        ? parseInt(userOpts.qualityThreshold, 10)
        : detected.qualityThresholdWords,
    retries:
      userOpts.retries !== undefined ? parseInt(userOpts.retries, 10) : detected.retries,
    retryBackoffMs: detected.retryBackoffMs,
    siteType: detected.siteType || 'generic',
  };
}

/**
 * Resolve viewport from string preset or object.
 * @param {Object|string} viewport
 * @returns {Object} Viewport object with width, height, isMobile, hasTouch.
 */
function resolveViewport(viewport) {
  if (typeof viewport === 'string') {
    const presets = {
      mobile: { width: 375, height: 667, isMobile: true, hasTouch: true },
      tablet: { width: 768, height: 1024, isMobile: true, hasTouch: true },
      desktop: { width: 1920, height: 1080, isMobile: false, hasTouch: false },
    };
    if (presets[viewport]) return presets[viewport];
  }
  // Already an object or unknown — normalize
  return {
    width: viewport?.width || 1280,
    height: viewport?.height || 900,
    isMobile: viewport?.isMobile || false,
    hasTouch: viewport?.hasTouch || false,
  };
}

module.exports = {
  detectStrategy,
  mergeStrategy,
  DEFAULT_STRATEGY,
  PREMIUM_NEWS,
};
