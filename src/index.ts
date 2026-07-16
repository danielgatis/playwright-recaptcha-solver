import { chromium, type Frame, type Page } from 'playwright';
import https from 'https';

export interface Logger {
  log(message: string): void;
  error(message: string): void;
}

export interface SolveOptions {
  headless?: boolean;
  proxy?: string;
  browserArgs?: string[];
  verbose?: boolean;
  logger?: Logger;
}

function isPage(input: string | Page): input is Page {
  return typeof input !== 'string';
}

function rdn(min: number, max: number): number {
  return Math.floor(Math.random() * (Math.floor(max) - Math.ceil(min))) + Math.ceil(min);
}

function waitForFrame(page: Page, urlPart: string): Promise<Frame> {
  const found = page.frames().find((f) => f.url().includes(urlPart));
  if (found) return Promise.resolve(found);

  return new Promise((resolve) => {
    const onFrame = (f: Frame) => {
      if (f.url().includes(urlPart)) {
        page.off('framenavigated', onFrame);
        resolve(f);
      }
    };
    page.on('framenavigated', onFrame);
  });
}

function witRequest(audioBytes: number[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(audioBytes);
    const req = https.request(
      {
        hostname: 'api.wit.ai',
        path: '/speech?v=20220622',
        method: 'POST',
        headers: {
          Authorization: 'Bearer JVHWCNWJLWLGN6MFALYLHAPKUFHMNTAC',
          'Content-Type': 'audio/mpeg3',
          'Content-Length': body.length,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: string) => {
          data += chunk;
        });
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function solveOnPage(
  page: Page,
  log: (msg: string) => void,
  logError: (msg: string) => void
): Promise<string> {
  log('[1] waiting for anchor frame...');
  const anchorFrame = await waitForFrame(page, 'api2/anchor');
  await anchorFrame.waitForSelector('#recaptcha-anchor');
  log('[1] anchor frame ready');

  const checkbox = await anchorFrame.waitForSelector('#recaptcha-anchor:not([disabled])', {
    timeout: 10000,
  });
  log('[2] clicking checkbox...');
  await checkbox!.click({ delay: rdn(30, 150) });

  log('[3] waiting for challenge bframe...');
  let imageFrame: Frame;
  try {
    await anchorFrame.waitForFunction(
      () => !document.querySelector('#recaptcha-anchor[aria-checked="true"]'),
      { timeout: 5000 }
    );
    imageFrame = await waitForFrame(page, 'api2/bframe');
    await imageFrame.waitForSelector('.rc-image-tile-wrapper img', { timeout: 5000 });
    log('[3] challenge appeared');
  } catch {
    log('[3] no challenge, done');
    return page.evaluate(
      () => (document.getElementById('g-recaptcha-response') as HTMLInputElement).value
    );
  }

  const audioButton = await imageFrame!.$('#recaptcha-audio-button');
  log('[4] clicking audio button...');
  await audioButton!.click({ delay: rdn(30, 150) });

  let iteration = 0;
  while (true) {
    iteration++;
    log(`[loop ${iteration}] waiting for audio download link...`);
    try {
      await imageFrame!.waitForSelector('.rc-audiochallenge-tdownload-link', { timeout: 5000 });
    } catch (e) {
      logError(`[loop ${iteration}] timeout waiting for audio link: ${(e as Error).message}`);
      continue;
    }

    const audioLink = await imageFrame!.$eval(
      '#audio-source',
      (el) => (el as HTMLSourceElement).src
    );
    log(`[loop ${iteration}] audio link: ${audioLink}`);

    const audioBytes = await page.evaluate(async (link: string) => {
      const res = await window.fetch(link);
      return Array.from(new Uint8Array(await res.arrayBuffer()));
    }, audioLink);
    log(`[loop ${iteration}] audio bytes fetched: ${audioBytes.length}`);

    const response = await witRequest(audioBytes);
    log(`[loop ${iteration}] wit.ai response: ${response}`);

    let audioTranscript: string;
    try {
      const matches = [...response.matchAll(/"text":\s*"([^"]+)"/g)];
      audioTranscript = matches[matches.length - 1][1].trim();
      log(`[loop ${iteration}] transcript: ${audioTranscript}`);
    } catch {
      log(`[loop ${iteration}] transcript parse failed, reloading...`);
      const reloadButton = await imageFrame!.$('#recaptcha-reload-button');
      await reloadButton!.click({ delay: rdn(30, 150) });
      continue;
    }

    const input = await imageFrame!.$('#audio-response');
    await input!.click({ delay: rdn(30, 150) });
    await input!.type(audioTranscript!, { delay: rdn(30, 75) });
    log(`[loop ${iteration}] typed transcript, clicking verify...`);

    const verifyButton = await imageFrame!.$('#recaptcha-verify-button');
    await verifyButton!.click({ delay: rdn(30, 150) });

    log(`[loop ${iteration}] waiting for result...`);
    try {
      await Promise.race([
        imageFrame!.waitForFunction(
          () => {
            const error = document.querySelector(
              '.rc-audiochallenge-error-message'
            ) as HTMLElement | null;
            return !!error?.innerText?.trim().length;
          },
          { timeout: 5000 }
        ),
        anchorFrame.waitForFunction(
          () => !!document.querySelector('#recaptcha-anchor[aria-checked="true"]'),
          { timeout: 5000 }
        ),
      ]);
    } catch {
      log(`[loop ${iteration}] timeout waiting for result, retrying...`);
      continue;
    }

    const { needsMore } = await imageFrame!.evaluate(() => {
      const error = document.querySelector(
        '.rc-audiochallenge-error-message'
      ) as HTMLElement | null;
      const text = error?.innerText?.trim() ?? '';
      return { needsMore: text.length > 0, errorText: text };
    });

    if (needsMore) {
      log(`[loop ${iteration}] need more solutions, continuing...`);
      continue;
    }

    const token = await page.evaluate(
      () => (document.getElementById('g-recaptcha-response') as HTMLInputElement).value
    );
    log(`[loop ${iteration}] SUCCESS! token length: ${token.length}`);
    return token;
  }
}

export async function solve(input: string | Page, options: SolveOptions = {}): Promise<string> {
  const { headless = true, proxy, browserArgs = [], verbose = false, logger } = options;

  const noop = () => {};
  const log = verbose ? (msg: string) => (logger ?? console).log(msg) : noop;
  const logError = verbose ? (msg: string) => (logger ?? console).error(msg) : noop;

  if (isPage(input)) {
    return solveOnPage(input, log, logError);
  }

  const args = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    ...browserArgs,
  ];

  if (proxy) args.push(`--proxy-server=${proxy}`);

  const browser = await chromium.launch({ headless, args });

  try {
    const ctx = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      (window as unknown as { chrome: { runtime: object } }).chrome = { runtime: {} };
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });

    const page = await ctx.newPage();
    await page.goto(input, { waitUntil: 'networkidle' });

    return await solveOnPage(page, log, logError);
  } finally {
    await browser.close();
  }
}

export default solve;
