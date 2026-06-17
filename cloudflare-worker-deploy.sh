#!/bin/bash

# Script to prepare and deploy url2md-local to Cloudflare Workers
# Note: Cloudflare Workers don't support Puppeteer directly.
# This script creates a Worker version that can either:
# 1. Proxy requests to your self-hosted service, or
# 2. Use a lightweight HTTP-based extraction

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLOUDFLARE_DIR="$SCRIPT_DIR/cloudflare"

echo "🔨 Preparing Cloudflare Worker deployment..."

# Create cloudflare directory structure
mkdir -p "$CLOUDFLARE_DIR"

# Create wrangler.toml
cat > "$CLOUDFLARE_DIR/wrangler.toml" << 'EOF'
name = "url2md-worker"
main = "worker.js"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[vars]
# Set your self-hosted service URL here
SELF_HOSTED_URL = ""
# Or use simplified extraction: true/false
USE_SIMPLE_EXTRACTION = "true"

[env.production]
name = "url2md-worker"
routes = [
  { pattern = "your-worker.your-subdomain.workers.dev/*", zone_name = "" }
]

[env.staging]
name = "url2md-worker-staging"
EOF

# Create the Worker script
cat > "$CLOUDFLARE_DIR/worker.js" << 'EOF'
import TurndownService from 'https://cdn.jsdelivr.net/npm/turndown@7.1.2/dist/turndown.es.js';

// Simple HTML-to-Markdown conversion ( lightweight, no browser required )
function htmlToMarkdown(html) {
  // This is a simplified conversion. For full Turndown support,
  // you would need to bundle it or use external APIs.
  const turndown = {
    turndown: function(html) {
      let markdown = html
        // Remove script and style tags
        .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '')
        .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, '')
        // Headings
        .replace(/<h1\b[^>]*>(.*?)<\/h1>/gim, '# $1\n\n')
        .replace(/<h2\b[^>]*>(.*?)<\/h2>/gim, '## $1\n\n')
        .replace(/<h3\b[^>]*>(.*?)<\/h3>/gim, '### $1\n\n')
        .replace(/<h4\b[^>]*>(.*?)<\/h4>/gim, '#### $1\n\n')
        .replace(/<h5\b[^>]*>(.*?)<\/h5>/gim, '##### $1\n\n')
        .replace(/<h6\b[^>]*>(.*?)<\/h6>/gim, '###### $1\n\n')
        // Bold and italic
        .replace(/<b\b[^>]*>(.*?)<\/b>/gim, '**$1**')
        .replace(/<strong\b[^>]*>(.*?)<\/strong>/gim, '**$1**')
        .replace(/<i\b[^>]*>(.*?)<\/i>/gim, '*$1*')
        .replace(/<em\b[^>]*>(.*?)<\/em>/gim, '*$1*')
        // Links
        .replace(/<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gim, '[$2]($1)')
        // Images
        .replace(/<img\b[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gim, '![$2]($1)')
        .replace(/<img\b[^>]*src="([^"]*)"[^>]*>/gim, '[]($1)')
        // Lists
        .replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gim, (match, content) => {
          return content.replace(/<li\b[^>]*>(.*?)<\/li>/gim, '- $1\n');
        })
        .replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gim, (match, content) => {
          let counter = 1;
          return content.replace(/<li\b[^>]*>(.*?)<\/li>/gim, () => `${counter++}. $1\n`);
        })
        // Paragraphs and br
        .replace(/<p\b[^>]*>(.*?)<\/p>/gim, '$1\n\n')
        .replace(/<br\s*\/?>/gim, '\n')
        // Blockquotes
        .replace(/<blockquote\b[^>]*>(.*?)<\/blockquote>/gim, '> $1\n\n')
        // Code blocks
        .replace(/<pre\b[^>]*><code\b[^>]*>([\s\S]*?)<\/code><\/pre>/gim, '```\n$1\n```\n\n')
        .replace(/<code\b[^>]*>(.*?)<\/code>/gim, '`$1`')
        // Horizontal rules
        .replace(/<hr\b[^>]*>/gim, '---\n\n')
        // Clean up multiple newlines
        .replace(/\n{3,}/g, '\n\n')
        // Remove remaining HTML tags
        .replace(/<[^>]+>/g, '')
        // HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

      return markdown.trim();
    }
  };

  return turndown.turndown(html);
}

// Extract main content using common patterns
function extractMainContent(html) {
  // Try to find main content areas
  const patterns = [
    /<main\b[^>]*>([\s\S]*?)<\/main>/i,
    /<article\b[^>]*>([\s\S]*?)<\/article>/i,
    /<div\b[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div\b[^>]*id="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Fallback to body
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    return bodyMatch[1];
  }

  return html;
}

// Clean HTML (Remove nav, footer, ads, etc.)
function cleanHTML(html) {
  const removePatterns = [
    /<nav\b[^>]*>[\s\S]*?<\/nav>/gi,
    /<footer\b[^>]*>[\s\S]*?<\/footer>/gi,
    /<header\b[^>]*>[\s\S]*?<\/header>/gi,
    /<aside\b[^>]*>[\s\S]*?<\/aside>/gi,
    /<div\b[^>]*class="[^"]*(?:nav|sidebar|advertisement|ad-banner)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    /<script\b[^>]*>[\s\S]*?<\/script>/gi,
    /<style\b[^>]*>[\s\S]*?<\/style>/gi,
    /<!--[\s\S]*?-->/g,
  ];

  let cleaned = html;
  for (const pattern of removePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned;
}

// Extract title from HTML
function extractTitle(html) {
  const titleMatch = html.match(/<title\b[^>]*>(.*?)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  const h1Match = html.match(/<h1\b[^>]*>(.*?)<\/h1>/i);
  if (h1Match) {
    return h1Match[1].trim();
  }

  return 'Untitled';
}

// Estimate word count
function estimateWordCount(text) {
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);

      // Health check endpoint
      if (url.pathname === '/health') {
        return Response.json({
          status: 'healthy',
          mode: env.USE_SIMPLE_EXTRACTION === 'true' ? 'simple' : 'proxy',
          selfHostedUrl: env.SELF_HOSTED_URL || 'not configured'
        }, { headers: corsHeaders });
      }

      // List info endpoint
      if (url.pathname === '/') {
        return Response.json({
          name: 'url2md Worker',
          version: '1.0.0',
          endpoints: {
            '/health': 'Health check',
            '/convert': 'Convert URL to markdown (POST)',
          },
          mode: env.USE_SIMPLE_EXTRACTION === 'true' ? 'simple' : 'proxy'
        }, { headers: corsHeaders });
      }

      // Convert endpoint
      if (url.pathname === '/convert' && request.method === 'POST') {
        const body = await request.json();
        let targetUrl = body.url;

        if (!targetUrl) {
          return Response.json({
            success: false,
            error: 'URL is required'
          }, { status: 400, headers: corsHeaders });
        }

        // Proxy mode: forward to self-hosted service
        if (env.SELF_HOSTED_URL && env.USE_SIMPLE_EXTRACTION !== 'true') {
          try {
            const proxyResponse = await fetch(`${env.SELF_HOSTED_URL}/convert`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: targetUrl,
                clean: body.clean || true,
                noImages: body.noImages || false,
                noLinks: body.noLinks || false,
                viewport: body.viewport || 'desktop'
              })
            });

            const proxyData = await proxyResponse.json();
            return Response.json(proxyData, {
              status: proxyResponse.status,
              headers: corsHeaders
            });
          } catch (error) {
            return Response.json({
              success: false,
              error: 'Failed to proxy request to self-hosted service',
              details: error.message
            }, { status: 502, headers: corsHeaders });
          }
        }

        // Simple extraction mode (no browser required)
        const options = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        };

        let html;
        try {
          const response = await fetch(targetUrl, options);
          if (!response.ok) {
            return Response.json({
              success: false,
              error: `Failed to fetch URL: ${response.status} ${response.statusText}`
            }, { status: 400, headers: corsHeaders });
          }
          html = await response.text();
        } catch (error) {
          return Response.json({
            success: false,
            error: 'Failed to fetch URL',
            details: error.message
          }, { status: 400, headers: corsHeaders });
        }

        // Process the HTML
        let processedHTML = html;

        if (body.clean !== false) {
          processedHTML = cleanHTML(processedHTML);
        }

        const mainContent = extractMainContent(processedHTML);
        const markdown = htmlToMarkdown(mainContent);

        // Remove images/links if requested
        let finalMarkdown = markdown;
        if (body.noImages) {
          finalMarkdown = finalMarkdown.replace(/!\[.*?\]\(.*?\)/g, '');
        }
        if (body.noLinks) {
          finalMarkdown = finalMarkdown.replace(/\[.*?\]\(.*?\)/g, '$1');
        }

        const title = extractTitle(html);

        return Response.json({
          success: true,
          data: {
            title,
            markdown: finalMarkdown,
            url: targetUrl,
            timestamp: new Date().toISOString(),
            wordCount: estimateWordCount(finalMarkdown),
            mode: 'simple'
          }
        }, { headers: corsHeaders });
      }

      // 404 for unknown endpoints
      return Response.json({
        success: false,
        error: 'Not found'
      }, { status: 404, headers: corsHeaders });

    } catch (error) {
      return Response.json({
        success: false,
        error: 'Internal server error',
        details: error.message
      }, { status: 500, headers: corsHeaders });
    }
  }
};
EOF

# Create package.json for dependencies
cat > "$CLOUDFLARE_DIR/package.json" << 'EOF'
{
  "name": "url2md-worker",
  "version": "1.0.0",
  "description": "URL to Markdown Cloudflare Worker",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "deploy:staging": "wrangler deploy --env staging",
    "deploy:production": "wrangler deploy --env production"
  },
  "devDependencies": {
    "wrangler": "^3.0.0"
  }
}
EOF

echo "✅ Cloudflare Worker files created in: $CLOUDFLARE_DIR"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Install dependencies:"
echo "   cd $CLOUDFLARE_DIR && npm install"
echo ""
echo "2. Configure wrangler.toml:"
echo "   - Set your Cloudflare account ID in wrangler.toml"
echo "   - Optionally configure SELF_HOSTED_URL for proxy mode"
echo ""
echo "3. Authenticate with Cloudflare:"
echo "   npx wrangler login"
echo ""
echo "4. Deploy to staging:"
echo "   npm run deploy:staging"
echo ""
echo "5. Deploy to production:"
echo "   npm run deploy:production"
echo ""
echo "📝 Important Notes:"
echo "   - Workers don't support Puppeteer directly"
echo "   - This worker uses lightweight HTTP extraction or proxies to your service"
echo "   - For full browser support, keep your original service running separately"
echo ""
echo "🌐 After deployment, your worker will be available at:"
echo "   https://your-worker.<your-subdomain>.workers.dev"
echo ""
echo "   Test with:"
echo "   curl -X POST https://your-worker.<your-subdomain>.workers.dev/convert \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{\"url\":\"https://example.com\"}'"