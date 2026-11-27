import { db } from './db.js'

try {
  const { rowCount } = await db.query(`
    WITH samples (name, email, address, demo_photo) AS (
      VALUES
        ('Maple Street Coffee House', 'maple-coffee@example.com', '14 Maple Street, Pune', 'maple'),
        ('Little Lantern Garden Cafe', 'little-lantern@example.com', '28 Garden Lane, Pune', 'lantern'),
        ('The Morning Brew Cafe', 'morning-brew@example.com', '7 Station Road, Bengaluru', 'morning'),
        ('Cedar and Spice Restaurant', 'cedar-spice@example.com', '34 Market Road, Bengaluru', 'cedar'),
        ('Riverside Woodfire Kitchen', 'riverside-kitchen@example.com', '12 River Walk, Mumbai', 'riverside'),
        ('Blue Mango Family Restaurant', 'blue-mango@example.com', '55 Palm Avenue, Mumbai', 'mango')
    )
    INSERT INTO stores (name, email, address, demo_photo)
    SELECT sample.name, sample.email, sample.address, sample.demo_photo FROM samples sample
    WHERE NOT EXISTS (SELECT 1 FROM stores WHERE email = sample.email)
  `)
  console.log(`Added ${rowCount} sample stores.`)
} finally {
  await db.end()
}