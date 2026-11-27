import { readFile } from 'node:fs/promises'
import bcrypt from 'bcryptjs'
import { db } from './db.js'
import { email, password } from './validation.js'

try {
  const adminEmail = email(process.env.ADMIN_EMAIL)
  const hash = await bcrypt.hash(password(process.env.ADMIN_PASSWORD), 12)
  await db.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'))
  const { rows: [admin] } = await db.query(
    `INSERT INTO users (name, email, address, password_hash, role)
     VALUES ('System Administrator', $1, 'Platform office', $2, 'admin')
     ON CONFLICT (email) DO NOTHING RETURNING id`, [adminEmail, hash])
  if (!admin) {
    const { rows: [existing] } = await db.query('SELECT role FROM users WHERE email = $1', [adminEmail])
    if (existing.role !== 'admin') throw new Error('ADMIN_EMAIL already belongs to another role.')
  }
  console.log(admin ? 'Database configured and admin created.' : 'Database configured. Existing admin password preserved.')
} finally {
  await db.end()
}
