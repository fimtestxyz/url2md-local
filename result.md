# url2md Service Test Report

**Date:** 2026-06-17 09:07:53
**Target:** http://localhost:3000

## Summary

| Metric | Value |
|---|---|
| Total Tests | 19 |
| Passed | 19 |
| Failed | 0 |
| Pass Rate | 100% |

### All 19 tests passed

---

## 1. Health & Infrastructure

- ✓ **GET /api/health** — HTTP 200 (0.03s)

**Pool status:**

| Metric | Value |
|---|---|
| Status | ok |
| Workers | 3 total, 3 available |
| Memory | 620MB RSS, 404MB heap |
| Uptime | 163.4s |

## 2. HTTP Fallback Path (static/SSR pages)

- ✓ **CNA news article** — HTTP 200 (0.10s)
  - Title: `SpaceX options debut pulls record demand as investors chase rocket stock - CNA`
  - Words: 976 | Provider: `axios-cheerio`
- ✓ **Wikipedia article** — HTTP 200 (0.26s)
  - Title: `SpaceX - Wikipedia`
  - Words: 24947 | Provider: `axios-cheerio`

## 3. Puppeteer Path (browser-rendered pages)

- ✓ **example.com (Puppeteer)** — HTTP 200 (3.17s)
  - Title: `Example Domain`
  - Words: 23 | Provider: `puppeteer-turndown-enhanced`
- ✓ **Hacker News** — HTTP 200 (1.03s)
  - Title: `Hacker News`
  - Words: 750 | Provider: `axios-cheerio`

## 4. Options & Customization

- ✓ **clean=true** — HTTP 200 (0.22s)
  - Title: `SpaceX - Wikipedia`
  - Words: 24947 | Provider: `axios-cheerio`
- ✓ **noImages=true** — HTTP 200 (0.22s)
  - Title: `SpaceX - Wikipedia`
  - Words: 24885 | Provider: `axios-cheerio`
- ✓ **noLinks=true** — HTTP 200 (0.20s)
  - Title: `SpaceX - Wikipedia`
  - Words: 21490 | Provider: `axios-cheerio`
- ✓ **timeout=5** — HTTP 200 (0.21s)
  - Title: `SpaceX - Wikipedia`
  - Words: 24947 | Provider: `axios-cheerio`
- ✓ **viewport=mobile** — HTTP 200 (0.21s)
  - Title: `SpaceX - Wikipedia`
  - Words: 24947 | Provider: `axios-cheerio`

## 5. Error Handling

- ✓ **Missing URL → 400** — HTTP 400 (url is required and must be a string) (0.03s)
- ✓ **Non-string URL → 400** — HTTP 400 (url is required and must be a string) (0.03s)
- ✓ **Empty batch array → 400** — HTTP 400 (urls must be a non-empty array) (0.03s)
- ✓ **Batch >50 URLs → 400** — HTTP 400 (Maximum 50 URLs per batch request) (0.03s)
- ✓ **Non-existent domain → error** — HTTP 403 (Network error accessing https://this-domain-does-not-exist-xyz123abc.com/page: net::ERR_NAME_NOT_RESOLVED at https://this-domain-does-not-exist-xyz123abc.com/page) (0.61s)

## 6. Batch Conversion

- ✓ `https://en.wikipedia.org/wiki/SpaceX` — 24947 words (axios-cheerio)
- ✓ `https://www.channelnewsasia.com/business/spacex-options-debu` — 976 words (axios-cheerio)
- ✓ `https://example.com` — 23 words (puppeteer-turndown-enhanced)
- ✓ **Batch of 3 URLs** — 3/3 succeeded (3.49s)

## 7. Concurrency Stress Test

- ✓ **3 concurrent requests** — 3/3 succeeded (0.60s total)
- ✓ **5 concurrent requests** — 5/5 succeeded (0.88s total)
- ✓ **10 concurrent requests** — 10/10 succeeded (0.29s total)

## Post-Test Pool Status

| Metric | Value |
|---|---|
| Workers | 3 total, 3 available, 0 busy |
| Queued | 0 |
| Memory | 640MB RSS, 76MB heap |

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Service health and pool status |
| `/api/convert` | POST | Convert a single URL to markdown |
| `/api/batch` | POST | Convert multiple URLs (max 50) |

### Convert Options

| Option | Type | Default | Description |
|---|---|---|---|
| `timeout` | number | 30 | Navigation timeout (seconds) |
| `clean` | boolean | false | Strip nav, footer, scripts, ads |
| `noImages` | boolean | false | Remove images from output |
| `noLinks` | boolean | false | Remove links from output |
| `dataImages` | boolean | true | Keep base64 data URI images |
| `strategy` | string | auto | Override auto-detected site strategy |
| `viewport` | string | desktop | mobile, tablet, or desktop |
| `qualityThreshold` | number | 100 | Minimum word count for valid content |

## How to Run

```bash
# Start the service
docker compose up -d        # Docker
npm run serve               # Local

# Run the test suite
./test-service.sh

# Stop the service
docker compose down
```
