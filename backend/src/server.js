import { createApp } from './app.js'

const port = Number.parseInt(process.env.API_PORT ?? '3001', 10)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('API_PORT must be an integer between 1 and 65535.')
}

const app = createApp()
app.listen(port, '127.0.0.1', () => {
  console.log(`FINIGUARD API listening on http://127.0.0.1:${port}`)
})

