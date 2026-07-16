import { solve } from '../src/index.js';

const token = await solve('https://www.google.com/recaptcha/api2/demo', {
  headless: false,
  proxy: 'socks5://127.0.0.1:9060',
});

console.log('token:', token);
