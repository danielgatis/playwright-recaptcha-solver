import { solve } from '../src/index.js'

const token = await solve('https://www.google.com/recaptcha/api2/demo', {
  headless: false,
  verbose: true,
})

console.log('token:', token)
