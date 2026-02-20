/**
 * Benchmarking Script
 * Measures latency and throughput for different scenarios
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';

// CLI arguments
const args = process.argv.slice(2);
const scenario = args.find((arg) => arg.startsWith('--scenario'))?.split('=')[1] || 'all';
const iterations = parseInt(
  args.find((arg) => arg.startsWith('--iterations'))?.split('=')[1] || '10',
);
const output =
  args.find((arg) => arg.startsWith('--output'))?.split('=')[1] || 'benchmark-results.md';

// Config
const API_URL = process.env.API_URL || 'https://api.example.com'; // Set via env
const TEST_TICKER = 'AAPL';
const TEST_TICKERS = [
  'AAPL',
  'GOOGL',
  'MSFT',
  'TSLA',
  'AMZN',
  'NVDA',
  'META',
  'NFLX',
  'AMD',
  'INTC',
];

interface BenchmarkResult {
  iteration: number;
  duration: number;
}

interface Stats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
}

function calculateStats(results: BenchmarkResult[]): Stats {
  if (results.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, p95: 0, p99: 0 };
  }

  const durations = results.map((r) => r.duration).sort((a, b) => a - b);
  const sum = durations.reduce((a, b) => a + b, 0);
  const n = durations.length;

  return {
    min: durations[0],
    max: durations[n - 1],
    mean: sum / n,
    median: durations[Math.floor((n - 1) / 2)],
    p95: durations[Math.floor((n - 1) * 0.95)],
    p99: durations[Math.floor((n - 1) * 0.99)],
  };
}

async function runBenchmark(scenarioName: string, runFn: () => Promise<void>): Promise<Stats> {
  console.log(`Running scenario: ${scenarioName} (${iterations} iterations)...`);
  const results: BenchmarkResult[] = [];

  for (let i = 0; i < iterations; i++) {
    try {
      const start = Date.now();
      await runFn();
      const duration = Date.now() - start;
      results.push({ iteration: i, duration });
      process.stdout.write('.');
    } catch (error) {
      process.stdout.write('x');
      // console.error(error);
    }
  }
  console.log(''); // Newline

  return calculateStats(results);
}

async function main() {
  console.log(`Starting benchmark suite against ${API_URL}`);

  const scenarios: Record<string, Stats> = {};
  const date = new Date().toISOString().split('T')[0];

  if (scenario === 'all' || scenario === 'single-ticker-cold') {
    // Note: True cold start is hard to force without redeploying or waiting.
    // We simulate "cold cache" by using a random date or assuming first run is cold.
    // But for repeated iterations, only the first might be cold.
    // So this scenario is tricky. We'll label it "Single Ticker" and assume mix.
    scenarios['Single Ticker'] = await runBenchmark('Single Ticker', async () => {
      await axios.get(`${API_URL}/stocks?ticker=${TEST_TICKER}&startDate=${date}`);
    });
  }

  if (scenario === 'all' || scenario === 'batch') {
    scenarios['Batch (10 tickers)'] = await runBenchmark('Batch (10 tickers)', async () => {
      await axios.post(`${API_URL}/batch/stocks`, {
        tickers: TEST_TICKERS,
        startDate: date,
      });
    });
  }

  if (scenario === 'all' || scenario === 'single-ticker-warm') {
    // Warm cache test: Make request to warm cache, then measure cached response
    // First request warms cache (outside timing)
    await axios.get(`${API_URL}/stocks?ticker=${TEST_TICKER}&startDate=${date}`);
    // Measure only the cached response
    scenarios['Single Ticker (Warm)'] = await runBenchmark('Single Ticker (Warm)', async () => {
      await axios.get(`${API_URL}/stocks?ticker=${TEST_TICKER}&startDate=${date}`);
    });
  }

  if (scenario === 'all' || scenario === 'portfolio') {
    // Portfolio loading: 5 tickers with all data types
    const PORTFOLIO_TICKERS = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'];
    scenarios['Portfolio (5 tickers)'] = await runBenchmark('Portfolio (5 tickers)', async () => {
      // Parallel fetch all data types using batch endpoints
      await Promise.all([
        axios.post(`${API_URL}/batch/stocks`, { tickers: PORTFOLIO_TICKERS, startDate: date }),
        axios.post(`${API_URL}/batch/news`, { tickers: PORTFOLIO_TICKERS, limit: 10 }),
        axios.post(`${API_URL}/batch/sentiment`, { tickers: PORTFOLIO_TICKERS, startDate: date }),
      ]);
    });
  }

  if (scenario === 'all' || scenario === 'cold-start') {
    // Cold start approximation: Use unique ticker to avoid cache hits
    // Note: True cold start measurement requires Lambda being idle for ~15+ minutes
    const uniqueTickers = ['COST', 'JNJ', 'PG', 'UNH', 'HD']; // Less common tickers
    let coldStartCount = 0;
    let totalColdStartDuration = 0;

    console.log('Running cold start detection (approximate)...');
    for (const ticker of uniqueTickers) {
      const start = Date.now();
      try {
        const response = await axios.get(`${API_URL}/stocks?ticker=${ticker}&startDate=${date}`);
        const duration = Date.now() - start;
        // Cold starts typically >1000ms, warm requests <500ms
        if (duration > 1000) {
          coldStartCount++;
          totalColdStartDuration += duration;
        }
      } catch (e) {
        // Skip errors
      }
    }

    const coldStartPercentage = (coldStartCount / uniqueTickers.length) * 100;
    const avgColdStartDuration = coldStartCount > 0 ? totalColdStartDuration / coldStartCount : 0;

    scenarios['Cold Start Detection'] = {
      min: 0,
      max: avgColdStartDuration,
      mean: avgColdStartDuration,
      median: avgColdStartDuration,
      p95: avgColdStartDuration,
      p99: avgColdStartDuration,
    };

    console.log(`Cold start approximation: ${coldStartPercentage.toFixed(1)}% of requests`);
  }

  // Generate Markdown Report
  let markdown = `# Benchmark Results\n\n`;
  markdown += `**Date:** ${new Date().toISOString()}\n`;
  markdown += `**Iterations:** ${iterations}\n`;
  markdown += `**API URL:** ${API_URL}\n\n`;

  markdown += `| Scenario | Mean (ms) | Median (ms) | p95 (ms) | p99 (ms) |\n`;
  markdown += `|----------|-----------|-------------|----------|----------|\n`;

  Object.entries(scenarios).forEach(([name, stats]) => {
    markdown += `| ${name} | ${stats.mean.toFixed(0)} | ${stats.median.toFixed(0)} | ${stats.p95.toFixed(0)} | ${stats.p99.toFixed(0)} |\n`;
  });

  fs.writeFileSync(output, markdown);
  console.log(`Results written to ${output}`);
}

main().catch(console.error);
