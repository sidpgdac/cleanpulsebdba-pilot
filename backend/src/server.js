import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import path from 'path'
import { fileURLToPath } from 'url'

import { setupAuth } from './middleware/auth.js'
import publicRoutes from './routes/public.js'
import cleaningRoutes from './routes/cleaning.js'
import supervisorRoutes from './routes/supervisor.js'
import adminRoutes from './routes/admin.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = Fastify({
  logger: true,
  trustProxy: true,
  bodyLimit: 1024 * 1024
})

await app.register(helmet)
await app.register(cors, {
  origin: process.env.FRONTEND_ORIGIN || '*'
})
await app.register(rateLimit, { global: false })

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const cleanerSecret = new TextEncoder().encode(process.env.CLEANER_JWT_SECRET)
const auth = setupAuth(db, cleanerSecret)

app.get('/health', async () => ({
  ok: true,
  service: 'BMC CleanPulse API',
  timestamp: new Date().toISOString()
}))

app.register(publicRoutes, { prefix: '/api/public', db, auth })
app.register(cleaningRoutes, { prefix: '/api/cleaning', db, auth, cleanerSecret })
app.register(supervisorRoutes, { prefix: '/api/supervisor', db, auth })
app.register(adminRoutes, { prefix: '/api/admin', db, auth })


app.setErrorHandler((error, req, reply) => {
  req.log.error(error)

  if (error.name === 'ZodError') {
    return reply.code(400).send({
      error: 'Invalid request',
      details: error.issues
    })
  }

  reply.code(error.statusCode || 500).send({
    error: error.statusCode ? error.message : 'Something went wrong'
  })
})

// Serve React Frontend
const frontendDist = path.join(__dirname, '../../frontend/dist')
app.register(fastifyStatic, {
  root: frontendDist,
  wildcard: false // disable wildcard so it doesn't conflict with API
})

app.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'API Route Not Found' })
  }
  return reply.sendFile('index.html')
})

await app.listen({
  port: Number(process.env.PORT || 8787),
  host: '0.0.0.0'
})
