const puppeteer = require('puppeteer');
const { resolveChromePath } = require('./loader');

class BrowserPool {
  constructor(size = 3, launchOpts = {}) {
    this.size = size;
    this.launchOpts = launchOpts;
    this.browsers = [];
    this.available = [];
    this.waiting = [];
    this.started = false;
  }

  async start() {
    if (this.started) return;
    for (let i = 0; i < this.size; i++) {
      const browser = await this._launch();
      this.browsers.push(browser);
      this.available.push(browser);
    }
    this.started = true;
  }

  async _launch() {
    return puppeteer.launch({
      headless: 'new',
      executablePath: resolveChromePath(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
      ...this.launchOpts,
    });
  }

  acquire(timeoutMs = 60000) {
    if (this.available.length > 0) {
      return Promise.resolve(this.available.shift());
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiting.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) this.waiting.splice(idx, 1);
        reject(new Error('Browser pool exhausted: timed out waiting for a worker'));
      }, timeoutMs);
      this.waiting.push({
        resolve: (browser) => { clearTimeout(timer); resolve(browser); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
    });
  }

  release(browser) {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift();
      next.resolve(browser);
      return;
    }
    this.available.push(browser);
  }

  async shutdown() {
    this.waiting.forEach((w) => w.reject(new Error('Pool shutting down')));
    this.waiting = [];
    await Promise.all(this.browsers.map((b) => b.close().catch(() => {})));
    this.browsers = [];
    this.available = [];
    this.started = false;
  }

  get stats() {
    return {
      total: this.browsers.length,
      available: this.available.length,
      busy: this.browsers.length - this.available.length,
      queued: this.waiting.length,
    };
  }
}

module.exports = { BrowserPool };
