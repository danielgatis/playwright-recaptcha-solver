import { chromium } from 'playwright';
import { solve } from '../src/index.js';

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto('https://www.google.com/recaptcha/api2/demo', { waitUntil: 'networkidle' });

const token = await solve(page, { verbose: true });
console.log('token:', token);

await page.click('#recaptcha-demo-submit');
await page.waitForSelector('.recaptcha-success', { timeout: 10000 });
console.log('submitted successfully!');

await browser.close();
