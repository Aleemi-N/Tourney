// Fails on styling that bypasses the design tokens in src/app/globals.css:
//   - arbitrary hex colours in classes, e.g. bg-[#13111e]
//   - text smaller than 12px, e.g. text-[10px]
//   - white-on-dark assumptions that break the light theme, e.g. text-white, border-white/10
// Usage: node scripts/lint-design.mjs   (pnpm lint:design)
import fs from 'node:fs';
import path from 'node:path';

const RULES = [
  [/\[#[0-9a-fA-F]{3,8}\]/, 'raw hex colour: use a token class (bg-surface, text-text-primary, ...)'],
  [/\btext-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/, 'text below 12px: use text-xs or larger'],
  [/(?<![\w-])(?:[a-z-]+:)*(?:text-white|bg-white\/|border-white\/|divide-white\/|ring-white\/)/, 'dark-only white: use a token (text-text-primary, bg-surface, border-border, ...)'],
];

const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return files(full);
  return /\.(tsx|ts)$/.test(entry.name) ? [full] : [];
});

let problems = 0;
for (const file of files('src')) {
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    for (const [pattern, message] of RULES) {
      const match = line.match(pattern);
      if (match) {
        problems++;
        console.log(`${file}:${index + 1}  ${match[0]}  ${message}`);
      }
    }
  });
}

if (problems) {
  console.log(`\n${problems} design-token problem(s).`);
  process.exit(1);
}
console.log('Design tokens: clean.');
