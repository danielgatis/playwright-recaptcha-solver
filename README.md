# playwright-recaptcha-solver

Solves reCAPTCHA v2 audio challenges automatically using Playwright. No paid services required — uses [wit.ai](https://wit.ai) for speech-to-text.

## How it works

1. Clicks the reCAPTCHA checkbox
2. If a challenge appears, switches to the audio challenge
3. Downloads the audio file and sends it to wit.ai for transcription
4. Types the transcript and submits
5. Retries automatically if Google requests more solutions
6. Returns the `g-recaptcha-response` token

## Installation

```bash
npm install playwright-recaptcha-solver
npx playwright install chromium
```

## Usage

### Pass a URL

The library manages the browser lifecycle for you.

```ts
import { solve } from 'playwright-recaptcha-solver';

const token = await solve('https://www.google.com/recaptcha/api2/demo');
console.log(token);
```

### Pass a Playwright `Page`

Use this when you already have a browser open and need to submit the form or do other actions after solving.

```ts
import { chromium } from 'playwright';
import { solve } from 'playwright-recaptcha-solver';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

await page.goto('https://www.google.com/recaptcha/api2/demo');

const token = await solve(page);

// token is already set in g-recaptcha-response — submit the form
await page.click('#recaptcha-demo-submit');
await page.waitForSelector('.recaptcha-success');

await browser.close();
```

## API

```ts
solve(input: string | Page, options?: SolveOptions): Promise<string>
```

Returns the `g-recaptcha-response` token.

### SolveOptions

| Option        | Type       | Default     | Description                                                                        |
| ------------- | ---------- | ----------- | ---------------------------------------------------------------------------------- |
| `headless`    | `boolean`  | `true`      | Run browser in headless mode. Only used when `input` is a URL.                     |
| `proxy`       | `string`   | `undefined` | Proxy server URL, e.g. `socks5://127.0.0.1:9060`. Only used when `input` is a URL. |
| `browserArgs` | `string[]` | `[]`        | Extra Chromium launch arguments. Only used when `input` is a URL.                  |
| `verbose`     | `boolean`  | `false`     | Enable logging.                                                                    |
| `logger`      | `Logger`   | `console`   | Custom logger. Only used when `verbose` is `true`.                                 |

### Logger interface

```ts
interface Logger {
  log(message: string): void;
  error(message: string): void;
}
```

Compatible with `console`, `winston`, `pino`, or any custom logger.

## Examples

### With proxy

```ts
const token = await solve('https://example.com', {
  proxy: 'socks5://127.0.0.1:9060',
});
```

### With verbose logging

```ts
const token = await solve('https://example.com', {
  verbose: true,
});
```

### With custom logger (e.g. pino)

```ts
import pino from 'pino';

const logger = pino();

const token = await solve('https://example.com', {
  verbose: true,
  logger: {
    log: (msg) => logger.info(msg),
    error: (msg) => logger.error(msg),
  },
});
```

### Multiple concurrent solves

```ts
import { chromium } from 'playwright';
import { solve } from 'playwright-recaptcha-solver';

const browser = await chromium.launch();

const tokens = await Promise.all(
  Array.from({ length: 5 }, async () => {
    const page = await browser.newPage();
    await page.goto('https://www.google.com/recaptcha/api2/demo');
    const token = await solve(page);
    await page.close();
    return token;
  })
);

await browser.close();
```

## Building from source

```bash
git clone https://github.com/danielgatis/playwright-recaptcha-solver
cd playwright-recaptcha-solver
npm install
npx playwright install chromium
npm run build
```

## Buy me a coffee

Liked some of my work? Buy me a coffee (or more likely a beer)

<a href="https://www.buymeacoffee.com/danielgatis" target="_blank"><img src="https://bmc-cdn.nyc3.digitaloceanspaces.com/BMC-button-images/custom_images/orange_img.png" alt="Buy Me A Coffee" style="height: auto !important;width: auto !important;"></a>

## License

MIT
