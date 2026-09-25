import { chromium } from '@playwright/test';

const baseUrl = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const routes = [
  '/t/tourny-local-qa-cup',
  '/t/tourny-local-qa-cup/fixtures',
  '/t/tourny-local-qa-cup/table',
  '/t/tourny-local-qa-cup/live',
  '/t/tourny-local-qa-cup/match/90700000-0000-0000-0000-000000000001',
  '/t/tourny-local-qa-cup/match/90700000-0000-0000-0000-000000000001/tv',
];
const browser = await chromium.launch({ headless: true });

try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    for (const route of routes) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      if (horizontalOverflow || errors.length) {
        throw new Error(`${route} failed at ${width}px: ${JSON.stringify({ horizontalOverflow, errors })}`);
      }
      console.log(JSON.stringify({ route, width, horizontalOverflow, pageErrors: errors.length }));
      await page.close();
    }
  }
} finally {
  await browser.close();
}
