import { chromium } from '@playwright/test';

const baseUrl = process.env.TEST_BASE_URL ?? 'http://localhost:3100';
const browser = await chromium.launch({ headless: true });

try {
  for (const width of [320, 375, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    const result = await page.evaluate(() => {
      const tournamentSection = document.querySelector('#tournaments')?.getBoundingClientRect();
      const nextSection = document.querySelector('#how-it-works')?.getBoundingClientRect();
      return {
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        interSectionGap: tournamentSection && nextSection ? Math.round(nextSection.top - tournamentSection.bottom) : null,
        tournamentCards: document.querySelectorAll('a[href^="/t/"]').length,
      };
    });
    if (result.horizontalOverflow || result.interSectionGap !== 0 || consoleErrors.length) {
      throw new Error(`Homepage responsive check failed at ${width}px: ${JSON.stringify({ ...result, consoleErrors })}`);
    }
    console.log(JSON.stringify({ width, ...result, consoleErrors: 0 }));
    await page.close();
  }

  const page = await browser.newPage();
  await page.goto(`${baseUrl}/organizer/tournaments/00000000-0000-0000-0000-000000000000/staff`);
  if (!page.url().includes('/login')) throw new Error(`Protected Staff route did not redirect to login: ${page.url()}`);
  console.log(JSON.stringify({ unauthenticatedStaffProtection: 'PASS' }));
} finally {
  await browser.close();
}
