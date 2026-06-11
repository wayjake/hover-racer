import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema.js'

// On Vercel these come from the project's environment variables; locally the
// vite dev server and drizzle-kit both load them from .env.
export const db = drizzle(
  createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_KEY,
  }),
  { schema },
)
