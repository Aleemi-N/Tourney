import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('PlayerCard Responsive Design', () => {
  const widths = [320, 375, 390, 768, 1024, 1440];

  for (const width of widths) {
    test(`Screenshot at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1080 });
      await page.goto('http://localhost:3000/test-cards');
      // wait for images to load
      await page.waitForLoadState('networkidle');
      
      const artifactsDir = path.join(
        'C:\\Users\\aleem\\.gemini\\antigravity-ide\\brain\\74a38d87-bd30-48ee-bb27-cbb966db33bd'
      );
      if (!fs.existsSync(artifactsDir)) {
        fs.mkdirSync(artifactsDir, { recursive: true });
      }

      await page.screenshot({ 
        path: path.join(artifactsDir, `playercard-${width}.png`),
        fullPage: true 
      });
    });
  }
});
