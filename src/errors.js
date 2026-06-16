/**
 * Error types and categorization for url2md.
 *
 * Every failure produces a structured error with a category string,
 * making it possible for the CLI and callers to understand *why*
 * something failed.
 */

class Url2mdError extends Error {
  /**
   * @param {string} message - Human-readable error message.
   * @param {string} category - Machine-readable category.
   * @param {*} [details={}] - Additional machine-readable metadata.
   */
  constructor(message, category, details = {}) {
    super(message);
    this.name = 'Url2mdError';
    this.category = category;
    this.details = details;
  }
}

/**
 * Factory functions for each error category.
 */
const ERRORS = {
  timeout: (msg, details = {}) => new Url2mdError(msg, 'timeout', details),
  blocked: (msg, details = {}) => new Url2mdError(msg, 'blocked', details),
  paywall: (msg, details = {}) => new Url2mdError(msg, 'paywall', details),
  notFound: (msg, details = {}) => new Url2mdError(msg, 'not-found', details),
  parseError: (msg, details = {}) => new Url2mdError(msg, 'parse-error', details),
  contentQuality: (msg, details = {}) => new Url2mdError(msg, 'content-quality', details),
  browser: (msg, details = {}) => new Url2mdError(msg, 'browser', details),
};

module.exports = { Url2mdError, ERRORS };
