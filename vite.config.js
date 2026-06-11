import 'dotenv/config'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Serves the Vercel-style web handlers in /api during `vite dev`, so the
// scoreboard works locally without the vercel CLI. In production Vercel
// deploys the same files as serverless functions.
function apiRoutes() {
  return {
    name: 'api-routes',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        try {
          // connect strips the /api mount prefix from req.url
          const pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '')
          const mod = await server.ssrLoadModule(`/api${pathname}.js`)
          const handler = mod[req.method]
          if (!handler) {
            res.statusCode = 405
            return res.end()
          }
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const response = await handler(
            new Request(`http://localhost${req.originalUrl}`, {
              method: req.method,
              headers: req.headers,
              body: chunks.length ? Buffer.concat(chunks) : undefined,
            }),
          )
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (err) {
          console.error('[api]', err)
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'internal error' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), apiRoutes()],
})
