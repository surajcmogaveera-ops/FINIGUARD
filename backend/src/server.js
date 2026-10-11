
import { createApp } from './app.js'

const port = Number.parseInt(
  process.env.PORT ?? process.env.API_PORT ?? '3001',
  10,
)

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.')
}

const app = createApp()

app.listen(port, '0.0.0.0', () => {
  console.log(`FINIGUARD API listening on port ${port}`)
})


