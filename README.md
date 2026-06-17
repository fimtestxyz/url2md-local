# url2md-local

A CLI tool and HTTP server to convert URLs to clean markdown using **local Puppeteer + Turndown** with Docker support and browser pooling - no external APIs required.

## Features

- 🚀 **100% Local** - Uses your own browser (Puppeteer)
- 🔒 **Private** - No data sent to external services
- 🧠 **Smart Extraction** - Turndown for clean HTML→Markdown
- 📱 **Viewport Control** - Mobile, tablet, desktop rendering
- 🎯 **Content Cleaning** - Remove nav, ads, scripts
- 📦 **Batch Processing** - Convert multiple URLs
- 🐳 **Docker Support** - Run as a containerized service
- 🌐 **HTTP Server** - REST API with browser pooling
- 🔄 **Service Management** - Start/stop/restart as a daemon

## Installation

### Local CLI (Node.js)

```bash
# Clone and install
git clone https://github.com/fimtestxyz/url2md-local.git
cd url2md-local
npm install

# Make executable
chmod +x bin/url2md.js

# Optional: install globally
npm install -g .
```

### Docker (Service Mode)

```bash
# Clone repository
git clone https://github.com/fimtestxyz/url2md-local.git
cd url2md-local

# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f
```

**Requirements:**
- Node.js 18+ (for local CLI)
- Chrome/Chromium (automatically downloaded by Puppeteer)
- Docker + Docker Compose (for containerized service)

## Usage

### CLI Mode

#### Basic Conversion

```bash
# Convert URL to markdown
./url2md.sh convert https://example.com

# Save to file
./url2md.sh convert https://example.com -o output.md

# JSON output
./url2md.sh convert https://example.com --json
```

#### Content Options

```bash
# Remove images
./url2md.sh convert https://example.com --no-images

# Remove links
./url2md.sh convert https://example.com --no-links

# Clean content (remove nav, footer, ads)
./url2md.sh convert https://example.com --clean

# All options combined
./url2md.sh convert https://example.com --clean --no-images --no-links -o clean.md
```

#### Viewport Options

```bash
# Mobile viewport (375x667)
./url2md.sh convert https://example.com --viewport mobile

# Tablet viewport (768x1024)
./url2md.sh convert https://example.com --viewport tablet

# Desktop viewport (1920x1080)
./url2md.sh convert https://example.com --viewport desktop
```

#### Wait Time & Debugging

```bash
# Wait 5 seconds for JavaScript content
./url2md.sh convert https://example.com --wait 5

# Visible browser (not headless)
./url2md.sh convert https://example.com --headless false
```

#### Batch Processing

```bash
# Create URL list
echo "https://example.com" > urls.txt
echo "https://github.com" >> urls.txt

# Convert all URLs
./url2md.sh batch urls.txt -o output/

# Output files:
# output/https___example.com.md
# output/https___github.com.md
```

#### Interactive Mode

```bash
./url2md.sh interactive

# Then enter URLs one at a time
```

#### Health Check

```bash
./url2md.sh health
```

### Docker / Server Mode

#### Service Management

```bash
# Start the service (background daemon)
./manage_service.sh start

# Stop the service
./manage_service.sh stop

# Restart the service
./manage_service.sh restart

# Check service status
./manage_service.sh status

# View logs
./manage_service.sh logs
```

#### HTTP API

Once the service is running (default port: 3000):

```bash
# Convert a URL via HTTP
curl -X POST http://localhost:3000/convert \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# With options
curl -X POST http://localhost:3000/convert \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "clean": true,
    "noImages": true,
    "viewport": "mobile",
    "wait": 5
  }'

# Health check endpoint
curl http://localhost:3000/health
```

**API Response Example:**

```json
{
  "success": true,
  "data": {
    "title": "Example Domain",
    "markdown": "# Example Domain\n\nThis domain is for use...",
    "url": "https://example.com",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "wordCount": 42
  }
}
```

#### Docker Compose Usage

```bash
# Build and run
docker-compose up -d

# Check logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild after code changes
docker-compose up -d --build
```

## Options Summary

| Option | Default | Description |
|--------|---------|-------------|
| `--headless` | true | Run in headless mode |
| `--wait` | 2 | Seconds to wait for page load |
| `--viewport` | desktop | Viewport size (mobile/tablet/desktop) |
| `--timeout` | 30 | Request timeout in seconds |
| `--clean` | false | Remove nav, footer, ads |
| `--no-images` | false | Remove images from output |
| `--no-links` | false | Remove links from output |

## Programmatic Usage

### Direct Library

```javascript
const { urlToMd, urlToJson } = require('./src/converter');

// Simple conversion
const result = await urlToMd('https://example.com', {
  clean: true,
  noImages: true,
  viewport: 'mobile'
});

console.log(result.title);
console.log(result.markdown);

// JSON output
const json = await urlToJson('https://example.com');
console.log(json.wordCount);
```

### HTTP Server Client

```javascript
// Using axios/fetch
const response = await fetch('http://localhost:3000/convert', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://example.com',
    clean: true,
    viewport: 'mobile'
  })
});

const { data } = await response.json();
console.log(data.markdown);
```

## Architecture

```
url2md-local/
├── bin/
│   └── url2md.js          # CLI executable
├── src/
│   ├── converter.js       # Puppeteer + Turndown core
│   ├── server.js          # HTTP server with browser pooling
│   ├── browser-pool.js    # Browser instance pool management
│   └── loader.js          # Module loader and orchestration
├── Dockerfile             # Container definition
├── docker-compose.yml     # Service orchestration
├── manage_service.sh      # Service lifecycle management
├── test-service.sh        # Service testing script
├── package.json
└── README.md
```

**Browser Pooling:**
- Pre-allocates configurable pool of browser instances
- Reuses instances across requests for efficiency
- Automatic cleanup and error recovery
- Configured via `BROWSER_POOL_SIZE` env var (default: 3)

## How It Works

1. **CLI Mode**: Puppeteer launches a headless Chrome browser, navigates to the URL, waits for content to load, and Turndown converts HTML to clean markdown
2. **Server Mode**: HTTP server accepts conversion requests, assigns a browser from the pool, performs conversion, and returns results
3. **Container Mode**: All components run in Docker with service orchestration via docker-compose

## Inspired By

- [mmdclx/url-to-markdown-cli-tool](https://github.com/mmdclx/url-to-markdown-cli-tool) - Original inspiration
- [mixmark-io/turndown](https://github.com/mixmark-io/turndown) - HTML to Markdown
- [puppeteer/puppeteer](https://github.com/puppeteer/puppeteer) - Headless Chrome

## License

MIT