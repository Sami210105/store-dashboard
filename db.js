import pg from 'pg'

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env first.')
export const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })
