// IDEAS — the inbox for everything you said out loud.
// Wispr Flow dictations arrive as a JSON upload; from here they get triaged
// and the ones worth filming are promoted into a ContentFlow project.
// Every row is keyed by user_id — same isolation as every other tool.
import express from "express";
import { q } from "./db/index.js";
import { auth } from "./auth.js";
import { loadProjects, saveProjects } from "./contentflow.js";

const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 9);
const clean = (v, max = 400) => String(v ?? "").trim().slice(0, max);

const TYPES    = ["Idea", "Task", "Decision", "Note"];
const STATUSES = ["Inbox", "Shortlisted", "Scripted", "Shot", "Published", "Dropped"];
const CATS     = ["Reel", "YouTube", "Ad Concept", "Hook/Copy", "Product",
                  "Strategy", "Offer/Pricing", "Ops", "Personal"];

const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const cats  = (v) => (Array.isArray(v) ? v.filter((c) => CATS.includes(c)).slice(0, 9) : []);

const router = express.Router();
router.use(auth(true));

/* ---------------- list ---------------- */
router.get("/", async (req, res) => {
  const { status, brand, type, needsReview } = req.query;
  const term = clean(req.query.q, 120);
  const where = ["user_id = $1"];
  const vals = [req.user.id];
  let n = 2;

  if (status)      { where.push(`status = $${n++}`); vals.push(status); }
  if (brand)       { where.push(`brand  = $${n++}`); vals.push(brand); }
  if (type)        { where.push(`type   = $${n++}`); vals.push(type); }
  if (needsReview === "1") where.push("needs_review = true");
  if (term) {
    where.push(`(title ILIKE $${n} OR raw_dictation ILIKE $${n} OR summary ILIKE $${n})`);
    vals.push(`%${term}%`); n++;
  }

  const limit  = Math.min(parseInt(req.query.limit, 10) || 300, 1000);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  vals.push(limit, offset);

  const { rows } = await q(
    `SELECT * FROM ideas WHERE ${where.join(" AND ")}
     ORDER BY spoken_at DESC NULLS LAST, created_at DESC
     LIMIT $${n++} OFFSET $${n}`, vals);

  const counts = await q(
    `SELECT status, COUNT(*)::int AS c FROM ideas WHERE user_id=$1 GROUP BY status`,
    [req.user.id]);

  res.json({
    ideas: rows,
    counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.c])),
  });
});

/* ---------------- create one by hand ---------------- */
router.post("/", async (req, res) => {
  const b = req.body || {};
  const raw = clean(b.raw_dictation, 8000);
  const title = clean(b.title, 200) || raw.slice(0, 60);
  if (!title && !raw) return res.status(400).json({ error: "Nothing to save." });

  const { rows } = await q(
    `INSERT INTO ideas (id,user_id,title,spoken_at,type,brand,category,status,
                        summary,raw_dictation,needs_review,flags,source,app)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [uid("idea"), req.user.id, title, b.spoken_at || new Date(),
     oneOf(b.type, TYPES, "Idea"), clean(b.brand, 60) || "Unassigned", cats(b.category),
     oneOf(b.status, STATUSES, "Inbox"), clean(b.summary, 600), raw,
     !!b.needs_review, clean(b.flags, 600), clean(b.source, 40) || "Manual", clean(b.app, 80)]);
  res.json(rows[0]);
});

/* ---------------- import a JSON export ----------------
   The daily Mac job writes exports/ideas-YYYY-MM-DD.json; this swallows it.
   dedupe_key is Wispr's transcriptEntityId, so re-uploading the same file —
   or a week's worth of overlapping files — never creates duplicates. */
router.post("/import", async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items) return res.status(400).json({ error: "Expected { items: [...] }" });
  if (items.length > 5000) return res.status(413).json({ error: "Too many items in one file." });

  let imported = 0, skipped = 0;
  for (const it of items) {
    const raw = clean(it.raw_dictation, 8000);
    if (!raw) { skipped++; continue; }
    const { rowCount } = await q(
      `INSERT INTO ideas (id,user_id,title,spoken_at,type,brand,category,status,
                          summary,raw_dictation,needs_review,flags,source,app,dedupe_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Inbox',$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
      [uid("idea"), req.user.id, clean(it.title, 200) || raw.slice(0, 60),
       it.spoken_at || null, oneOf(it.type, TYPES, "Idea"),
       clean(it.brand, 60) || "Unassigned", cats(it.category),
       clean(it.summary, 600), raw, !!it.needs_review, clean(it.flags, 600),
       clean(it.source, 40) || "Dictation", clean(it.app, 80),
       clean(it.dedupe_key, 120) || null]);
    rowCount ? imported++ : skipped++;
  }
  res.json({ imported, skipped, total: items.length });
});

/* ---------------- edit / delete ---------------- */
router.patch("/:id", async (req, res) => {
  const b = req.body || {};
  const sets = [], vals = [];
  let n = 1;
  const put = (col, val) => { sets.push(`${col} = $${n++}`); vals.push(val); };

  if ("status"   in b) put("status", oneOf(b.status, STATUSES, "Inbox"));
  if ("type"     in b) put("type",   oneOf(b.type, TYPES, "Idea"));
  if ("brand"    in b) put("brand",  clean(b.brand, 60) || "Unassigned");
  if ("category" in b) put("category", cats(b.category));
  if ("title"    in b) put("title",   clean(b.title, 200));
  if ("summary"  in b) put("summary", clean(b.summary, 600));
  if ("flags"    in b) put("flags",   clean(b.flags, 600));
  if ("needs_review" in b) put("needs_review", !!b.needs_review);
  if (!sets.length) return res.status(400).json({ error: "Nothing to update." });

  vals.push(req.params.id, req.user.id);
  const { rows } = await q(
    `UPDATE ideas SET ${sets.join(", ")} WHERE id = $${n++} AND user_id = $${n} RETURNING *`, vals);
  if (!rows.length) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

router.delete("/:id", async (req, res) => {
  await q("DELETE FROM ideas WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  res.json({ ok: true });
});

/* ---------------- promote into ContentFlow ----------------
   A ContentFlow idea never stands alone — it lives inside a project.
   So promoting either starts a new project or drops into an existing one.
   The FULL raw dictation carries across, never the summary: the exact words
   he spoke are the raw material a script gets written from. */
async function promote(userId, ideaIds, mode, projectId) {
  const { rows } = await q(
    `SELECT * FROM ideas WHERE user_id=$1 AND id = ANY($2::text[]) ORDER BY spoken_at`,
    [userId, ideaIds]);
  if (!rows.length) return { moved: 0, projects: [] };

  const projects = await loadProjects(userId);
  const touched = [];

  if (mode === "existing") {
    const project = projects.find((p) => p.id === projectId);
    if (!project) throw Object.assign(new Error("Project not found"), { code: 404 });
    project.ideas = project.ideas || [];
    for (const r of rows) {
      project.ideas.unshift({ id: uid("idea"), text: r.raw_dictation || r.summary,
                              createdAt: new Date().toISOString() });
    }
    touched.push({ id: project.id, title: project.title, added: rows.length });
    await q(`UPDATE ideas SET project_id=$1, status='Scripted' WHERE user_id=$2 AND id = ANY($3::text[])`,
            [project.id, userId, ideaIds]);
  } else {
    for (const r of rows) {
      const project = {
        id: uid("p"),
        title: r.title || "Untitled",
        brand: r.brand && r.brand !== "Unassigned" ? r.brand : "",
        stage: "idea",
        createdAt: new Date().toISOString(),
        stageDates: { channel: "", idea: new Date().toISOString().slice(0, 10),
                      inspiration: "", script: "", shoot: "", edit: "", post: "" },
        channelId: "", pillarIds: [],
        inspirations: [],
        ideas: [{ id: uid("idea"), text: r.raw_dictation || r.summary,
                  createdAt: new Date().toISOString() }],
        idea: { rawIdea: r.raw_dictation || "", angle: "", linkedInspirationIds: [] },
        scripts: [], script: { hooks: [], blocks: [] },
        shoot: { scriptId: "", date: "", location: "", generalNotes: "", shots: [] },
        edit: { footageLink: "", musicNotes: "", pacingNotes: "", checklist: [], finalLink: "" },
        post: { postedDate: "", url: "", views: "", watchTime: "", retention: "",
                saves: "", shares: "", comments: "", notes: "", retentionShotId: "" },
      };
      projects.unshift(project);
      touched.push({ id: project.id, title: project.title, added: 1 });
      await q("UPDATE ideas SET project_id=$1, status='Scripted' WHERE id=$2 AND user_id=$3",
              [project.id, r.id, userId]);
    }
  }

  await saveProjects(userId, projects);
  return { moved: rows.length, projects: touched };
}

router.post("/:id/promote", async (req, res) => {
  try {
    res.json(await promote(req.user.id, [req.params.id], req.body?.mode, req.body?.projectId));
  } catch (e) { res.status(e.code || 500).json({ error: e.message }); }
});

router.post("/bulk-promote", async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 100) : [];
  if (!ids.length) return res.status(400).json({ error: "No ideas selected." });
  try {
    res.json(await promote(req.user.id, ids, req.body?.mode, req.body?.projectId));
  } catch (e) { res.status(e.code || 500).json({ error: e.message }); }
});

/* projects list for the "add to existing" dropdown */
router.get("/cf-projects", async (req, res) => {
  const projects = await loadProjects(req.user.id);
  res.json({ projects: projects.map((p) => ({ id: p.id, title: p.title, brand: p.brand })) });
});

export default router;
