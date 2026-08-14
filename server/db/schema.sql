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

-- ============ TRENDS: community reel directory + publishable lists ============

-- Usernames for public list URLs (/list/<username>/<slug>). One per user.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- The SHARED directory. One row per unique reel (deduped by normalised URL).
-- Visible to every approved creator. This is the one place we intentionally
-- share data across users.
CREATE TABLE IF NOT EXISTS trend_reels (
  id          TEXT PRIMARY KEY,
  url         TEXT NOT NULL,
  url_key     TEXT NOT NULL UNIQUE,          -- normalised url, for dedupe
  shortcode   TEXT,                          -- instagram shortcode if parseable
  category    TEXT NOT NULL DEFAULT '',
  tags        TEXT NOT NULL DEFAULT '',
  caption     TEXT NOT NULL DEFAULT '',
  added_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trend_reels_cat ON trend_reels(category);
CREATE INDEX IF NOT EXISTS idx_trend_reels_created ON trend_reels(created_at DESC);

-- PRIVATE per-user notes on a shared reel. Published only when a list is published.
CREATE TABLE IF NOT EXISTS trend_notes (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reel_id     TEXT NOT NULL REFERENCES trend_reels(id) ON DELETE CASCADE,
  why         TEXT NOT NULL DEFAULT '',      -- why it works
  hooks       TEXT NOT NULL DEFAULT '',      -- hook points / breakdown
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, reel_id)
);

-- A creator's named list.
CREATE TABLE IF NOT EXISTS trend_lists (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  slug        TEXT NOT NULL,
  blurb       TEXT NOT NULL DEFAULT '',
  published   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_trend_lists_user ON trend_lists(user_id);

-- Reels inside a list, ordered.
CREATE TABLE IF NOT EXISTS trend_list_items (
  list_id     TEXT NOT NULL REFERENCES trend_lists(id) ON DELETE CASCADE,
  reel_id     TEXT NOT NULL REFERENCES trend_reels(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (list_id, reel_id)
);
