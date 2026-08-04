-- U2berClub Tools — Postgres schema
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  pass_hash     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'creator',      -- 'creator' | 'admin'
  status        TEXT NOT NULL DEFAULT 'pending',       -- 'pending' | 'active' | 'blocked'
  invite_code   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS invite_codes (
  code          TEXT PRIMARY KEY,
  note          TEXT,                                  -- who it's for
  created_by    INTEGER REFERENCES users(id),
  used_by       INTEGER REFERENCES users(id),
  max_uses      INTEGER NOT NULL DEFAULT 1,
  uses          INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token         TEXT PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL
);

-- one row per (user, tool, key). This is where every tool's per-user data lives.
CREATE TABLE IF NOT EXISTS tool_data (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool          TEXT NOT NULL,                         -- 'savedreels' | 'teardown' | ...
  key           TEXT NOT NULL,                         -- e.g. a reel URL
  value         JSONB NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tool, key)
);
CREATE INDEX IF NOT EXISTS idx_tool_data_user_tool ON tool_data(user_id, tool);

-- Canvas frame images (screenshots). Stored separately so the project JSON stays small.
CREATE TABLE IF NOT EXISTS canvas_images (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  TEXT NOT NULL,
  mime        TEXT NOT NULL DEFAULT 'image/jpeg',
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_canvas_images_user ON canvas_images(user_id, project_id);
