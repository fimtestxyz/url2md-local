# url2md-local

A CLI tool to convert URLs to clean markdown using **local Puppeteer + Turndown** - no external APIs required.

## Features

- 🚀 **100% Local** - Uses your own browser (Puppeteer)
- 🔒 **Private** - No data sent to external services
- 🧠 **Smart Extraction** - Turndown for clean HTML→Markdown
- 📱 **Viewport Control** - Mobile, tablet, desktop rendering
- 🎯 **Content Cleaning** - Remove nav, ads, scripts
- 📦 **Batch Processing** - Convert multiple URLs

## Installation

```bash
# Clone and install
git clone https://github.com/yourusername/url2md-local.git
cd url2md-local
npm install

# Make executable
chmod +x bin/url2md.js

# Optional: install globally
npm install -g .
```

**Requirements:**
- Node.js 18+
- Chrome/Chromium (automatically downloaded by Puppeteer)

## Usage

### Basic Conversion

```bash
# Convert URL to markdown
url2md-local convert https://example.com

# Save to file
url2md-local convert https://example.com -o output.md

# JSON output
url2md-local convert https://example.com --json
```

### Content Options

```bash
# Remove images
url2md-local convert https://example.com --no-images

# Remove links
url2md-local convert https://example.com --no-links

# Clean content (remove nav, footer, ads)
url2md-local convert https://example.com --clean

# All options combined
url2md-local convert https://example.com --clean --no-images --no-links -o clean.md
```

### Viewport Options

```bash
# Mobile viewport (375x667)
url2md-local convert https://example.com --viewport mobile

# Tablet viewport (768x1024)
url2md-local convert https://example.com --viewport tablet

# Desktop viewport (1920x1080)
url2md-local convert https://example.com --viewport desktop
```

### Wait Time

```bash
# Wait 5 seconds for JavaScript content
url2md-local convert https://example.com --wait 5

# Visible browser (not headless)
url2md-local convert https://example.com --headless false
```

### Batch Processing

```bash
# Create URL list
echo "https://example.com" > urls.txt
echo "https://github.com" >> urls.txt

# Convert all URLs
url2md-local batch urls.txt -o output/

# Output files:
# output/https___example.com.md
# output/https___github.com.md
```

### Interactive Mode

```bash
url2md-local interactive

# Then enter URLs one at a time
```

### Health Check

```bash
url2md-local health
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

## How It Works

1. **Puppeteer** launches a headless Chrome browser
2. Navigates to the URL and waits for content to load
3. **Turndown** converts HTML to clean markdown
4. Optional cleaning removes nav, ads, scripts

## Project Structure

```
url2md-local/
├── bin/
│   └── url2md.js          # CLI executable
├── src/
│   └── converter.js       # Puppeteer + Turndown core
├── package.json
└── README.md
```

## Inspired By

- [mmdclx/url-to-markdown-cli-tool](https://github.com/mmdclx/url-to-markdown-cli-tool) - Original inspiration
- [mixmark-io/turndown](https://github.com/mixmark-io/turndown) - HTML to Markdown
- [puppeteer/puppeteer](https://github.com/puppeteer/puppeteer) - Headless Chrome

## License

MIT
