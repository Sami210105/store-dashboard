CREATE TABLE IF NOT EXISTS users (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 20 AND 60),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  address text NOT NULL CHECK (char_length(address) BETWEEN 1 AND 400),
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'user', 'owner'))
);
CREATE TABLE IF NOT EXISTS stores (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 20 AND 60),
  email text NOT NULL CHECK (email = lower(email)),
  address text NOT NULL CHECK (char_length(address) BETWEEN 1 AND 400),
  owner_id integer UNIQUE REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS ratings (
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  store_id integer REFERENCES stores(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score BETWEEN 1 AND 5),
  PRIMARY KEY (user_id, store_id)
);
CREATE INDEX IF NOT EXISTS ratings_store_idx ON ratings(store_id);
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS review text CHECK (char_length(review) <= 1000);
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS updated_at timestamptz;
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS store_photos (
  store_id integer PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  photo bytea NOT NULL,
  version uuid NOT NULL
);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS demo_photo text;
UPDATE stores s SET demo_photo = sample.slug
FROM (VALUES
  ('maple-coffee@example.com', 'maple'),
  ('little-lantern@example.com', 'lantern'),
  ('morning-brew@example.com', 'morning'),
  ('cedar-spice@example.com', 'cedar'),
  ('riverside-kitchen@example.com', 'riverside'),
  ('blue-mango@example.com', 'mango')
) AS sample(email, slug)
WHERE s.email = sample.email AND s.demo_photo IS NULL;

CREATE OR REPLACE VIEW store_ratings AS
SELECT s.id, s.name, s.email, s.address, s.owner_id, round(avg(r.score), 2)::float AS rating,
  s.demo_photo, (SELECT p.version FROM store_photos p WHERE p.store_id = s.id) AS photo_version
FROM stores s LEFT JOIN ratings r ON r.store_id = s.id GROUP BY s.id;
