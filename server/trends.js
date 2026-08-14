// TRENDS — community reel directory + publishable lists.
//
// This is the ONE tool where data is deliberately shared: trend_reels is a
// common pool every approved creator can see and add to. Everything personal
// (notes, lists) stays per-user until the creator publishes a list.
import express from "express";
import crypto from "crypto";
import { q } from "./db/index.js";
import { auth, adminOnly } from "./auth.js";

const uid = (p) => p + "_" + crypto.randomBytes(5).toString("hex");
const clean = (s, max = 400) => String(s || "").trim().slice(0, max);

/* Normalise an Instagram URL so the same reel added twice is one row. */
export function normUrl(u) {
  const s = String(u || "").trim();
  const m = s.match(/instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
  if (m) return "ig:" + m[1];
  return s.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
}
export function shortcodeOf(u) {
  const m = String(u || "").match(/instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

/* Usernames must never collide with real app paths. */
const RESERVED = new Set([
  "api", "list", "lists", "admin", "login", "logout", "register", "signup", "signin",
  "contentflow", "savedreels", "trends", "teardown", "storyboard", "tool", "tools",
  "static", "assets", "images", "img", "public", "app", "www", "help", "support",
  "about", "terms", "privacy", "settings", "account", "user", "users", "me", "new",
]);
export function usernameError(name) {
  const u = String(name || "").trim().toLowerCase();
  if (!u) return "Pick a username.";
  if (!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(u)) {
    return "3–30 characters: lowercase letters, numbers, hyphen or underscore. Must start with a letter or number.";
  }
  if (RESERVED.has(u)) return "That username is reserved. Try another.";
  return null;
}
const slugify = (s) =>
  String(s || "").toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-")
    .replace(/^-|-$/g, "").slice(0, 60) || "list";

const router = express.Router();

/* ============================================================
   PUBLIC — no auth. Must be registered BEFORE the auth middleware.
   Serves a published list to anyone with the link.
   ============================================================ */
router.get("/public/:username/:slug", async (req, res) => {
  try {
    const { rows: ur } = await q("SELECT id, name, username FROM users WHERE username=$1", [
      String(req.params.username || "").toLowerCase(),
    ]);
    const owner = ur[0];
    if (!owner) return res.status(404).json({ error: "Not found" });

    const { rows: lr } = await q(
      "SELECT * FROM trend_lists WHERE user_id=$1 AND slug=$2 AND published=true",
      [owner.id, String(req.params.slug || "").toLowerCase()]
    );
    const list = lr[0];
    if (!list) return res.status(404).json({ error: "Not found" });

    // The creator chose to publish, so their notes travel with the list.
    const { rows: items } = await q(
      `SELECT r.id, r.url, r.shortcode, r.category, r.tags, r.caption,
              r.trend_name, r.trend_desc, r.reels_count, r.publish_date,
              COALESCE(n.why,'')   AS why,
              COALESCE(n.hooks,'') AS hooks,
              i.position
         FROM trend_list_items i
         JOIN trend_reels r ON r.id = i.reel_id
         LEFT JOIN trend_notes n ON n.reel_id = r.id AND n.user_id = $1
        WHERE i.list_id = $2
        ORDER BY i.position, r.created_at`,
      [owner.id, list.id]
    );

    res.json({
      list: { title: list.title, blurb: list.blurb, slug: list.slug },
      owner: { name: owner.name, username: owner.username },
      items,
    });
  } catch (e) {
    res.status(500).json({ error: "Could not load that list." });
  }
});

/* Everything below requires an active signed-in creator. */
router.use(auth(true));

/* ---------------- username ---------------- */
router.get("/me", async (req, res) => {
  const { rows } = await q("SELECT username FROM users WHERE id=$1", [req.user.id]);
  res.json({ username: rows[0]?.username || null, name: req.user.name });
});

router.post("/username", async (req, res) => {
  const wanted = String(req.body.username || "").trim().toLowerCase();
  const err = usernameError(wanted);
  if (err) return res.status(400).json({ error: err });
  const { rows: taken } = await q("SELECT id FROM users WHERE username=$1 AND id<>$2", [wanted, req.user.id]);
  if (taken.length) return res.status(400).json({ error: "That username is taken." });
  await q("UPDATE users SET username=$1 WHERE id=$2", [wanted, req.user.id]);
  res.json({ ok: true, username: wanted });
});

/* ---------------- shared directory ---------------- */
router.get("/reels", async (req, res) => {
  const cat = clean(req.query.category, 60);
  const search = clean(req.query.q, 80);
  const params = [req.user.id];
  let where = "1=1";
  if (cat) { params.push(cat); where += ` AND r.category = $${params.length}`; }
  if (search) {
    params.push("%" + search.toLowerCase() + "%");
    where += ` AND (lower(r.caption) LIKE $${params.length} OR lower(r.tags) LIKE $${params.length} OR lower(r.category) LIKE $${params.length})`;
  }
  const { rows } = await q(
    `SELECT r.*, u.name AS added_by_name,
            COALESCE(n.why,'')   AS my_why,
            COALESCE(n.hooks,'') AS my_hooks
       FROM trend_reels r
       LEFT JOIN users u ON u.id = r.added_by
       LEFT JOIN trend_notes n ON n.reel_id = r.id AND n.user_id = $1
      WHERE ${where}
      ORDER BY r.created_at DESC
      LIMIT 500`,
    params
  );
  res.json({ reels: rows });
});

router.get("/categories", async (req, res) => {
  const { rows } = await q(
    "SELECT category, count(*)::int AS n FROM trend_reels WHERE category <> '' GROUP BY category ORDER BY n DESC"
  );
  res.json({ categories: rows });
});

/* Add one reel. Deduped by normalised url — same reel added twice stays one row. */
router.post("/reels", async (req, res) => {
  const url = clean(req.body.url, 500);
  if (!url) return res.status(400).json({ error: "Paste a reel link." });
  const key = normUrl(url);
  const { rows: existing } = await q("SELECT * FROM trend_reels WHERE url_key=$1", [key]);
  if (existing.length) return res.json({ reel: existing[0], duplicate: true });

  const id = uid("tr");
  const { rows } = await q(
    `INSERT INTO trend_reels (id,url,url_key,shortcode,category,tags,caption,added_by,
                              trend_name,trend_desc,reels_count,publish_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [id, url, key, shortcodeOf(url), clean(req.body.category, 60),
     clean(req.body.tags, 200), clean(req.body.caption, 1000), req.user.id,
     clean(req.body.trend_name, 120), clean(req.body.trend_desc, 2000),
     clean(req.body.reels_count, 40), clean(req.body.publish_date, 20)]
  );
  res.json({ reel: rows[0] });
});

/* Bulk add — used by the SAVEDREELS vault import. Skips duplicates silently. */
router.post("/reels/bulk", async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: "Nothing to add." });
  let added = 0, skipped = 0;
  for (const it of items.slice(0, 500)) {
    const url = clean(it.url, 500);
    if (!url) { skipped++; continue; }
    const key = normUrl(url);
    const { rows: ex } = await q("SELECT id FROM trend_reels WHERE url_key=$1", [key]);
    if (ex.length) { skipped++; continue; }
    await q(
      `INSERT INTO trend_reels (id,url,url_key,shortcode,category,tags,caption,added_by,trend_name,trend_desc)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [uid("tr"), url, key, shortcodeOf(url), clean(it.category, 60),
       clean(it.tags, 200), clean(it.caption, 1000), req.user.id,
       clean(it.trend_name, 120), clean(it.trend_desc, 2000)]
    );
    added++;
  }
  res.json({ added, skipped });
});

/* Update category/tags on a directory reel (shared metadata). */
router.patch("/reels/:id", async (req, res) => {
  const fields = [], params = [];
  for (const k of ["category", "tags", "caption", "trend_name", "trend_desc", "reels_count", "publish_date"]) {
    if (k in req.body) { params.push(clean(req.body[k], k === "trend_desc" ? 2000 : 200)); fields.push(`${k}=$${params.length}`); }
  }
  if (!fields.length) return res.json({ ok: true });
  params.push(req.params.id);
  await q(`UPDATE trend_reels SET ${fields.join(",")} WHERE id=$${params.length}`, params);
  res.json({ ok: true });
});

/* Admin can remove anything from the shared directory. */
router.delete("/reels/:id", adminOnly, async (req, res) => {
  await q("DELETE FROM trend_reels WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

/* ---------------- private notes ---------------- */
router.put("/notes/:reelId", async (req, res) => {
  await q(
    `INSERT INTO trend_notes (user_id,reel_id,why,hooks,updated_at)
     VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (user_id,reel_id) DO UPDATE SET why=EXCLUDED.why, hooks=EXCLUDED.hooks, updated_at=now()`,
    [req.user.id, req.params.reelId, clean(req.body.why, 2000), clean(req.body.hooks, 2000)]
  );
  res.json({ ok: true });
});

/* ---------------- lists ---------------- */
router.get("/lists", async (req, res) => {
  const { rows } = await q(
    `SELECT l.*, (SELECT count(*)::int FROM trend_list_items i WHERE i.list_id=l.id) AS item_count
       FROM trend_lists l WHERE l.user_id=$1 ORDER BY l.created_at DESC`,
    [req.user.id]
  );
  res.json({ lists: rows });
});

router.get("/lists/:id", async (req, res) => {
  const { rows: lr } = await q("SELECT * FROM trend_lists WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  if (!lr.length) return res.status(404).json({ error: "Not found" });
  const { rows: items } = await q(
    `SELECT r.*, i.position, COALESCE(n.why,'') AS my_why, COALESCE(n.hooks,'') AS my_hooks
       FROM trend_list_items i
       JOIN trend_reels r ON r.id=i.reel_id
       LEFT JOIN trend_notes n ON n.reel_id=r.id AND n.user_id=$1
      WHERE i.list_id=$2 ORDER BY i.position, r.created_at`,
    [req.user.id, req.params.id]
  );
  res.json({ list: lr[0], items });
});

router.post("/lists", async (req, res) => {
  const title = clean(req.body.title, 120);
  if (!title) return res.status(400).json({ error: "Give the list a name." });
  let slug = slugify(title), n = 1;
  while ((await q("SELECT id FROM trend_lists WHERE user_id=$1 AND slug=$2", [req.user.id, slug])).rows.length) {
    slug = slugify(title) + "-" + (++n);
  }
  const { rows } = await q(
    "INSERT INTO trend_lists (id,user_id,title,slug,blurb) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [uid("tl"), req.user.id, title, slug, clean(req.body.blurb, 500)]
  );
  res.json({ list: rows[0] });
});

router.patch("/lists/:id", async (req, res) => {
  const { rows: own } = await q("SELECT id FROM trend_lists WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  if (!own.length) return res.status(404).json({ error: "Not found" });

  // Publishing requires a username — that's what the public URL is built from.
  if (req.body.published === true) {
    const { rows: u } = await q("SELECT username FROM users WHERE id=$1", [req.user.id]);
    if (!u[0]?.username) return res.status(400).json({ error: "Pick a username before publishing." });
  }
  const fields = [], params = [];
  if ("title" in req.body) { params.push(clean(req.body.title, 120)); fields.push(`title=$${params.length}`); }
  if ("blurb" in req.body) { params.push(clean(req.body.blurb, 500)); fields.push(`blurb=$${params.length}`); }
  if ("published" in req.body) { params.push(!!req.body.published); fields.push(`published=$${params.length}`); }
  if (!fields.length) return res.json({ ok: true });
  params.push(req.params.id);
  const { rows } = await q(`UPDATE trend_lists SET ${fields.join(",")} WHERE id=$${params.length} RETURNING *`, params);
  res.json({ list: rows[0] });
});

router.delete("/lists/:id", async (req, res) => {
  await q("DELETE FROM trend_lists WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  res.json({ ok: true });
});

/* Admin can unpublish anyone's list — published pages sit on your domain. */
router.post("/lists/:id/unpublish", adminOnly, async (req, res) => {
  await q("UPDATE trend_lists SET published=false WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

router.post("/lists/:id/items", async (req, res) => {
  const { rows: own } = await q("SELECT id FROM trend_lists WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  if (!own.length) return res.status(404).json({ error: "Not found" });
  const ids = Array.isArray(req.body.reelIds) ? req.body.reelIds : [req.body.reelId].filter(Boolean);
  const { rows: maxr } = await q("SELECT COALESCE(MAX(position),0)::int AS m FROM trend_list_items WHERE list_id=$1", [req.params.id]);
  let pos = maxr[0].m;
  for (const rid of ids.slice(0, 200)) {
    await q(
      "INSERT INTO trend_list_items (list_id,reel_id,position) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
      [req.params.id, rid, ++pos]
    );
  }
  res.json({ ok: true, added: ids.length });
});

router.delete("/lists/:id/items/:reelId", async (req, res) => {
  const { rows: own } = await q("SELECT id FROM trend_lists WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  if (!own.length) return res.status(404).json({ error: "Not found" });
  await q("DELETE FROM trend_list_items WHERE list_id=$1 AND reel_id=$2", [req.params.id, req.params.reelId]);
  res.json({ ok: true });
});

export default router;
