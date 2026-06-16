# url2md-local — User Guide

## Table of Contents

1. [Installation](#installation)
2. [Quick Start](#quick-start)
3. [Shell Script](#shell-script)
4. [Commands Reference](#commands-reference)
5. [Options Reference](#options-reference)
6. [Batch Processing](#batch-processing)
7. [Interactive Mode](#interactive-mode)
8. [Output Formats](#output-formats)
9. [Troubleshooting](#troubleshooting)
10. [FAQ](#faq)

---

## Installation

### Prerequisites

- **Node.js 18+** — [download](https://nodejs.org/)
- **Chrome or Chromium** — Puppeteer downloads this automatically on first install

### Install

```bash
git clone https://github.com/<your-username>/url2md-local.git
cd url2md-local
npm install
```

### Global install (optional)

```bash
npm install -g .
```

After a global install the `url2md-local` command is available anywhere.

---

## Quick Start

```bash
# Single page
url2md-local convert https://example.com

# Save to a file
url2md-local convert https://example.com -o example.md

# JSON output
url2md-local convert https://example.com --json
```

---

## Shell Script

A convenience wrapper `url2md.sh` is included in the project root. It auto-installs dependencies on first run and forwards all arguments to the CLI.

### One-time setup

```bash
chmod +x url2md.sh
```

### Usage

```bash
./url2md.sh convert https://example.com -o output.md
./url2md.sh batch urls.txt -o output/
./url2md.sh health
```

You can also create a shell alias:

```bash
# Add to ~/.zshrc or ~/.bashrc
alias url2md="/full/path/to/url2md-local/url2md.sh"
```

Then use it anywhere:

```bash
url2md convert https://example.com
```

---

## Commands Reference

| Command | Description |
|---------|-------------|
| `convert <url>` | Convert a single URL to Markdown |
| `batch <file>` | Convert a list of URLs from a text file |
| `interactive` | Start an interactive REPL session |
| `health` | Verify Puppeteer, Turndown, and Chrome are working |

---

## Options Reference

Global options apply to every command:

| Option | Default | Description |
|--------|---------|-------------|
| `--headless` | `true` | Run Chrome in headless mode |
| `--wait <seconds>` | `2` | Extra wait time after page load (for JS-heavy sites) |
| `--viewport <type>` | `desktop` | Viewport preset: `mobile`, `tablet`, or `desktop` |
| `--timeout <seconds>` | `30` | Maximum navigation timeout |
| `--clean` | `false` | Strip `<nav>`, `<footer>`, `<script>`, `<style>`, and ad elements before conversion |
| `--no-images` | `false` | Remove all `<img>`, `<picture>`, and `<figure>` elements |
| `--no-links` | `false` | Strip anchor tags but keep their text |

### Viewport dimensions

| Preset | Width × Height | Touch |
|--------|---------------|-------|
| `mobile` | 375 × 667 | Yes |
| `tablet` | 768 × 1024 | Yes |
| `desktop` | 1920 × 1080 | No |

---

## Batch Processing

Create a plain-text file with one URL per line. Lines starting with `#` are treated as comments and ignored.

### Example — `urls.txt`

```
# Blog posts
https://example.com/post-1
https://example.com/post-2

# Docs
https://docs.example.com/intro
```

### Run

```bash
url2md-local batch urls.txt -o output/
```

Each URL is saved as `output/<sanitised-url>.md`. Processing runs in batches of 3 for efficiency.

---

## Interactive Mode

```bash
url2md-local interactive
```

You will be prompted for URLs one at a time. Output is truncated to 2 000 characters in the terminal; use `-o` with `convert` to get the full content.

Type `quit` or `exit` to leave.

---

## Output Formats

### Markdown (default)

Plain Markdown text, suitable for pasting into notes, docs, or static-site generators.

### JSON (`--json`)

```json
{
  "url": "https://example.com",
  "title": "Example Domain",
  "markdown": "# Example Domain\n\n...",
  "wordCount": 42,
  "charCount": 280,
  "timestamp": "2026-06-16T12:00:00.000Z",
  "provider": "puppeteer-turndown",
  "viewport": { "width": 1920, "height": 1080 }
}
```

---

## Troubleshooting

### Puppeteer can't find Chrome

```bash
npx puppeteer browsers install chrome
```

### Timeout on slow sites

Increase both `--wait` and `--timeout`:

```bash
url2md-local convert https://slow-site.com --wait 10 --timeout 60
```

### Health check fails

```bash
url2md-local health
```

This verifies that Puppeteer, Turndown, and Chrome can all load and launch. If Chrome fails, reinstall with the command above.

### Permission denied on `url2md.sh`

```bash
chmod +x url2md.sh
```

---

## FAQ

**Does it work behind a proxy?**
Yes — Puppeteer respects the standard `HTTP_PROXY` / `HTTPS_PROXY` environment variables.

**Can I use it with sites that require login?**
Not out of the box. Puppeteer launches a fresh browser profile each time. For authenticated sessions you would need to extend the code to load cookies or a user-data directory.

**Is any data sent to external services?**
No. Everything runs locally. The only network request is the page fetch made by Puppeteer.

**What Node.js versions are supported?**
Node.js 18 and above.
