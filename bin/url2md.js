#!/usr/bin/env node

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const { urlToMd, urlToJson, batchConvert } = require('../src/converter');

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

async function main() {
  const program = new Command();
  
  program
    .name('url2md-local')
    .description('Convert URLs to markdown using local Puppeteer + Turndown')
    .version(packageJson.version);
  
  // Global options
  program
    .option('--headless', 'Run browser in headless mode', true)
    .option('--wait <seconds>', 'Wait time for page load', '2')
    .option('--viewport <type>', 'Viewport: mobile, tablet, desktop', 'desktop')
    .option('--timeout <seconds>', 'Request timeout', '30')
    .option('--clean', 'Remove nav, footer, scripts', false)
    .option('--no-images', 'Remove images from output', false)
    .option('--no-links', 'Remove links from output', false);
  
  // Single URL conversion
  program
    .command('convert <url>')
    .description('Convert a single URL to markdown')
    .option('-o, --output <file>', 'Write output to file')
    .option('--json', 'Output as JSON')
    .action(async (url, options) => {
      try {
        const opts = program.opts();
        let result;
        
        if (options.json) {
          result = await urlToJson(url, opts);
        } else {
          result = await urlToMd(url, opts);
        }
        
        if (options.output) {
          fs.writeFileSync(options.output, result.content || result);
          console.log(`✓ Written to ${options.output}`);
        } else {
          console.log(result.content || result);
        }
      } catch (error) {
        console.error(`✗ Error: ${error.message}`);
        process.exit(1);
      }
    });
  
  // Batch conversion
  program
    .command('batch <file>')
    .description('Convert multiple URLs from a file')
    .option('-o, --output-dir <dir>', 'Output directory')
    .action(async (file, options) => {
      try {
        const urls = fs.readFileSync(file, 'utf8')
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0 && !line.startsWith('#'));
        
        console.log(`Processing ${urls.length} URLs...`);
        
        const outputDir = options.outputDir || 'output';
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const opts = program.opts();
        const results = await batchConvert(urls, opts);
        
        let success = 0;
        let failed = 0;
        
        for (const r of results) {
          if (r.success) {
            const filename = r.url.replace(/[^a-z0-9]/gi, '_').slice(0, 100) + '.md';
            const outputPath = path.join(outputDir, filename);
            fs.writeFileSync(outputPath, r.data.content);
            console.log(`✓ ${r.url} -> ${outputPath}`);
            success++;
          } else {
            console.error(`✗ ${r.url}: ${r.error}`);
            failed++;
          }
        }
        
        console.log(`\nCompleted: ${success} succeeded, ${failed} failed`);
      } catch (error) {
        console.error(`✗ Error: ${error.message}`);
        process.exit(1);
      }
    });
  
  // Interactive mode
  program
    .command('interactive')
    .description('Interactive URL to markdown converter')
    .action(async () => {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const askUrl = () => {
        return new Promise((resolve) => {
          rl.question('\nEnter URL (or "quit" to exit): ', (answer) => {
            resolve(answer);
          });
        });
      };
      
      const opts = program.opts();
      
      console.log('\n=== URL to Markdown (Local) ===');
      console.log('Using Puppeteer + Turndown for extraction.\n');
      
      while (true) {
        const url = await askUrl();
        
        if (url.toLowerCase() === 'quit' || url.toLowerCase() === 'exit') {
          console.log('Goodbye!');
          break;
        }
        
        if (!url.trim()) continue;
        
        try {
          const result = await urlToMd(url, opts);
          console.log('\n--- Markdown Output ---\n');
          console.log(result.content.slice(0, 2000));
          if (result.content.length > 2000) {
            console.log('\n... (truncated, use -o to save full output)\n');
          }
        } catch (error) {
          console.error(`✗ Error: ${error.message}`);
        }
      }
      
      rl.close();
    });
  
  // Health check
  program
    .command('health')
    .description('Check browser and dependencies')
    .action(async () => {
      try {
        console.log('Checking dependencies...');
        
        // Check Puppeteer
        const puppeteer = require('puppeteer');
        console.log('✓ Puppeteer loaded');
        
        // Check Turndown
        const TurndownService = require('turndown');
        console.log('✓ Turndown loaded');
        
        // Try to launch browser
        const opts = program.opts();
        const browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        await browser.close();
        console.log('✓ Browser launch OK');
        
        console.log('\n✓ All dependencies healthy');
      } catch (error) {
        console.log(`✗ Health check failed: ${error.message}`);
        process.exit(1);
      }
    });
  
  await program.parseAsync(process.argv);
  
  if (process.argv.length === 2) {
    program.help();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
