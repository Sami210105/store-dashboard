import express from 'express'
import bcrypt from 'bcryptjs'
import { randomBytes, createHash, randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { db } from './db.js'
import { HttpError, email, password, profile, id } from './validation.js'

const app = express()
const api = express.Router()
const roles = ['admin', 'user', 'owner']
const sessionCookie = 'ratings_session'
const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: process.env.VERCEL === '1' || process.env.COOKIE_SECURE === 'true', path: '/' }
const sessionLifetime = 86400000
const hashToken = (token) => createHash('sha256').update(token).digest('hex')
const getToken = (req) => req.headers.cookie?.match(/(?:^|;\s*)ratings_session=([a-f0-9]{64})(?:;|$)/)?.[1]
const publicUser = 'id, name, email, address, role'
const dist = fileURLToPath(new URL('./dist/', import.meta.url))

app.disable('x-powered-by')
app.use('/api', api)
const photoTypes = ['image/jpeg', 'image/png', 'image/webp']
api.put('/owner/store/photo', protect('owner'), express.raw({ type: photoTypes, limit: '4mb' }), async (req, res) => {
  if (!req.is(photoTypes)) throw new HttpError(415, 'Choose a JPEG, PNG, or WebP image.')
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'Choose an image to upload.')
  let photo
  try {
    const input = sharp(req.body, { limitInputPixels: 24_000_000 })
    const { format } = await input.metadata()
    if (!['jpeg', 'png', 'webp'].includes(format)) throw new Error('Unsupported format.')
    photo = await input.rotate().resize(1200, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
  } catch {
    throw new HttpError(400, 'Choose a valid JPEG, PNG, or WebP image under 24 megapixels.')
  }
  const { rowCount } = await db.query(
    `INSERT INTO store_photos (store_id, photo, version)
     SELECT id, $2, $3 FROM stores WHERE owner_id = $1 FOR SHARE
     ON CONFLICT (store_id) DO UPDATE SET photo = EXCLUDED.photo, version = EXCLUDED.version`,
    [req.user.id, photo, randomUUID()])
  if (!rowCount) throw new HttpError(404, 'No store is assigned to your account.')
  res.status(204).end()
})
api.use(express.json({ limit: '16kb' }))
api.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  if (['POST', 'PUT'].includes(req.method) && !req.is('application/json')) {
    return next(new HttpError(415, 'Send application/json.'))
  }
  next()
})

function protect(...allowed) {
  return async (req, res, next) => {
    const token = getToken(req)
    if (!token) throw new HttpError(401, 'Please log in.')
    const { rows: [user] } = await db.query(
      `SELECT u.${publicUser.replaceAll(', ', ', u.')} FROM users u JOIN sessions s ON s.user_id = u.id
       WHERE s.token_hash = $1 AND expires_at > now()`, [hashToken(token)])
    if (!user) throw new HttpError(401, 'Please log in.')
    if (allowed.length && !allowed.includes(user.role)) throw new HttpError(403, 'Access denied.')
    req.user = user
    next()
  }
}

async function createUser(body, role) {
  const user = profile(body)
  const hash = await bcrypt.hash(password(body.password), 12)
  const { rows: [created] } = await db.query(
    `INSERT INTO users (name, email, address, password_hash, role)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${publicUser}`,
    [user.name, user.email, user.address, hash, role])
  return created
}

api.post('/signup', async (req, res) => {
  res.status(201).json(await createUser(req.body, 'user'))
})

api.post('/login', async (req, res) => {
  const loginEmail = email(req.body?.email)
  const secret = req.body?.password
  if (typeof secret !== 'string' || [...secret].length > 16) throw new HttpError(401, 'Incorrect email or password.')
  const { rows: [user] } = await db.query(
    `SELECT ${publicUser}, password_hash FROM users WHERE email = $1`, [loginEmail])
  const valid = await bcrypt.compare(secret, user?.password_hash ?? dummyHash)
  if (!user || !valid) throw new HttpError(401, 'Incorrect email or password.')
  const oldToken = getToken(req)
  if (oldToken) await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(oldToken)])
  await db.query('DELETE FROM sessions WHERE expires_at <= now()')
  const token = randomBytes(32).toString('hex')
  const { rowCount } = await db.query(
    `INSERT INTO sessions SELECT $1, id, $3 FROM users WHERE id = $2 AND password_hash = $4 FOR SHARE`,
    [hashToken(token), user.id, new Date(Date.now() + sessionLifetime), user.password_hash])
  if (!rowCount) throw new HttpError(401, 'Please log in again.')
  delete user.password_hash
  res.cookie(sessionCookie, token, { ...cookieOptions, maxAge: sessionLifetime }).json(user)
})

api.get('/me', protect(), (req, res) => res.json(req.user))
api.post('/logout', async (req, res) => {
  const token = getToken(req)
  if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])
  res.clearCookie(sessionCookie, cookieOptions).status(204).end()
})

api.put('/password', protect(), async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {}
  password(newPassword)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const { rows: [user] } = await client.query('SELECT password_hash FROM users WHERE id = $1 FOR UPDATE', [req.user.id])
    if (typeof currentPassword !== 'string' || [...currentPassword].length > 16 ||
        !await bcrypt.compare(currentPassword, user.password_hash)) {
      throw new HttpError(400, 'Current password is incorrect.')
    }
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2',
      [await bcrypt.hash(newPassword, 12), req.user.id])
    await client.query('DELETE FROM sessions WHERE user_id = $1', [req.user.id])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  res.clearCookie(sessionCookie, cookieOptions).status(204).end()
})

function listing(query, filters, sortable, values = []) {
  const clauses = []
  for (const [field, column] of Object.entries(filters)) {
    const value = query[field]
    if (typeof value === 'string' && value.trim()) {
      values.push(value.trim())
      if (field === 'role') clauses.push(`${column} = $${values.length}`)
      else clauses.push(`strpos(lower(${column}), lower($${values.length})) > 0`)
    }
  }
  const sort = sortable.includes(query.sort) ? query.sort : sortable[0]
  const direction = query.dir === 'desc' ? 'DESC' : 'ASC'
  return {
    values,
    where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '',
    order: `ORDER BY ${sort} ${direction} NULLS LAST, id ASC`
  }
}

api.get('/admin/counts', protect('admin'), async (req, res) => {
  const { rows: [counts] } = await db.query(`SELECT (SELECT count(*)::int FROM users) AS users,
    (SELECT count(*)::int FROM stores) AS stores, (SELECT count(*)::int FROM ratings) AS ratings`)
  res.json(counts)
})

api.get('/admin/users', protect('admin'), async (req, res) => {
  const { where, order, values } = listing(req.query,
    { name: 'u.name', email: 'u.email', address: 'u.address', role: 'u.role' }, ['name', 'email', 'address', 'role'])
  res.json((await db.query(`SELECT ${publicUser} FROM users u ${where} ${order}`, values)).rows)
})

api.get('/admin/users/:id', protect('admin'), async (req, res) => {
  const { rows: [user] } = await db.query(`SELECT u.id, u.name, u.email, u.address, u.role, s.rating, s.name AS store_name
    FROM users u LEFT JOIN store_ratings s ON s.owner_id = u.id WHERE u.id = $1`, [id(req.params.id)])
  if (!user) throw new HttpError(404, 'User not found.')
  res.json(user)
})

api.post('/admin/users', protect('admin'), async (req, res) => {
  if (!roles.includes(req.body?.role)) throw new HttpError(400, 'Select a valid role.')
  res.status(201).json(await createUser(req.body, req.body.role))
})

api.get('/admin/owners', protect('admin'), async (req, res) => {
  res.json((await db.query(`SELECT u.id, u.name, u.email FROM users u WHERE u.role = 'owner'
    AND NOT EXISTS (SELECT 1 FROM stores s WHERE s.owner_id = u.id AND s.id <> $1) ORDER BY u.name, u.id`,
    [req.query.storeId ? id(req.query.storeId) : 0])).rows)
})

api.post('/admin/stores', protect('admin'), async (req, res) => {
  const store = profile(req.body)
  const ownerId = req.body.ownerId ? id(req.body.ownerId) : null
  const { rows: [created] } = await db.query(
    `INSERT INTO stores (name, email, address, owner_id) SELECT $1, $2, $3, $4::integer
     WHERE $4::integer IS NULL OR EXISTS (SELECT 1 FROM users WHERE id = $4 AND role = 'owner')
     RETURNING id`, [store.name, store.email, store.address, ownerId])
  if (!created) throw new HttpError(400, 'Select a valid store owner.')
  res.status(201).json(created)
})

api.put('/admin/stores/:id', protect('admin'), async (req, res) => {
  const store = profile(req.body)
  const ownerId = req.body.ownerId ? id(req.body.ownerId) : null
  const storeId = id(req.params.id)
  const { rows: [updated] } = await db.query(
    `UPDATE stores SET name = $1, email = $2, address = $3, owner_id = $4 WHERE id = $5
     AND ($4::integer IS NULL OR EXISTS (SELECT 1 FROM users WHERE id = $4 AND role = 'owner'))
     RETURNING id`, [store.name, store.email, store.address, ownerId, storeId])
  if (!updated) {
    const { rowCount } = await db.query('SELECT 1 FROM stores WHERE id = $1', [storeId])
    if (!rowCount) throw new HttpError(404, 'Store not found.')
    throw new HttpError(400, 'Select a valid store owner.')
  }
  res.json(updated)
})

api.get('/admin/stores', protect('admin'), async (req, res) => {
  const { where, order, values } = listing(req.query,
    { name: 'name', email: 'email', address: 'address' }, ['name', 'email', 'address', 'rating'])
  res.json((await db.query(`SELECT id, name, email, address, rating, owner_id, demo_photo, photo_version FROM store_ratings ${where} ${order}`, values)).rows)
})

api.get('/stores', protect('user'), async (req, res) => {
  const { where, order, values } = listing(req.query,
    { name: 's.name', address: 's.address' }, ['name', 'address', 'rating', 'my_rating'], [req.user.id])
  res.json((await db.query(`SELECT s.id, s.name, s.address, s.rating, s.demo_photo, s.photo_version, r.score AS my_rating, r.review AS my_review
    FROM store_ratings s LEFT JOIN ratings r ON r.store_id = s.id AND r.user_id = $1 ${where} ${order}`, values)).rows)
})

api.put('/stores/:id/rating', protect('user'), async (req, res) => {
  const score = req.body?.score
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new HttpError(400, 'Choose a whole number from 1 to 5.')
  const review = req.body.review
  if (review !== undefined && (typeof review !== 'string' || [...review.trim()].length > 1000)) {
    throw new HttpError(400, 'Reviews can be up to 1,000 characters.')
  }
  const { rowCount } = await db.query(
    `INSERT INTO ratings (user_id, store_id, score, review, updated_at)
     SELECT $1, id, $3, $4, now() FROM stores WHERE id = $2
     ON CONFLICT (user_id, store_id) DO UPDATE
     SET score = EXCLUDED.score,
         review = CASE WHEN $5 THEN EXCLUDED.review ELSE ratings.review END,
         updated_at = EXCLUDED.updated_at`,
    [req.user.id, id(req.params.id), score, review?.trim() || null, review !== undefined])
  if (!rowCount) throw new HttpError(404, 'Store not found.')
  res.status(204).end()
})

api.get('/owner/store', protect('owner'), async (req, res) => {
  const { rows: [store] } = await db.query('SELECT id, name, rating, demo_photo, photo_version FROM store_ratings WHERE owner_id = $1', [req.user.id])
  if (!store) return res.json({ store: null, ratings: [] })
  const { order, values } = listing(req.query, {}, ['name', 'email', 'score', 'updated_at'], [store.id])
  const { rows: ratings } = await db.query(`SELECT u.id, u.name, u.email, r.score, r.review, r.updated_at
    FROM ratings r JOIN users u ON u.id = r.user_id WHERE r.store_id = $1 ${order}`, values)
  res.json({ store, ratings })
})

api.get('/stores/:id/photo', protect(), async (req, res) => {
  const { rows: [image] } = await db.query('SELECT photo FROM store_photos WHERE store_id = $1', [id(req.params.id)])
  if (!image) throw new HttpError(404, 'Store photo not found.')
  res.set('X-Content-Type-Options', 'nosniff').type('webp').send(image.photo)
})

api.use((req, res) => res.status(404).json({ message: 'Endpoint not found.' }))
app.use(express.static(dist))
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  if (error.code === '23505') {
    const message = error.constraint === 'users_email_key' ? 'That email is already registered.' : 'That owner already has a store.'
    return res.status(409).json({ message })
  }
  const status = error.status ?? 500
  if (status >= 500) console.error(error)
  res.status(status).json({ message: error instanceof HttpError ? error.message :
    status === 400 ? 'Invalid request body.' : status === 413 ? 'Request is too large.' : 'Something went wrong.' })
})

const dummyHash = await bcrypt.hash(randomBytes(16).toString('hex'), 12)
export default app
