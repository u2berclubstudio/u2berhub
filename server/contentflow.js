// ContentFlow, hosted per-user inside the hub.
// Each user's whole projects array lives in tool_data (tool='contentflow', key='projects').
// Every route below loads THIS user's projects, mutates, saves — full isolation.
import express from "express";
import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";
import { q } from "./db/index.js";
import { auth } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 9);
const clean = (v, max = 400) => String(v ?? "").trim().slice(0, max);

export async function loadProjects(userId) {
  const { rows } = await q(
    "SELECT value FROM tool_data WHERE user_id=$1 AND tool='contentflow' AND key='projects'", [userId]);
  const v = rows[0]?.value;
  const projects = Array.isArray(v?.projects) ? v.projects : [];
  // backfill fields added in later versions so older projects don't break
  for (const p of projects) {
    if (!p.stageDates) p.stageDates = {};
    for (const k of ["channel", "idea", "inspiration", "script", "shoot", "edit", "post"]) {
      if (!(k in p.stageDates)) p.stageDates[k] = "";
    }
    if (!p.post) p.post = { postedDate: "", url: "", views: "", watchTime: "", retention: "", saves: "", shares: "", comments: "", notes: "", retentionShotId: "" };

    // channel + pillars
    if (!("channelId" in p)) p.channelId = "";
    if (!Array.isArray(p.pillarIds)) p.pillarIds = [];

    // ideas: one box that stacks. Old single rawIdea becomes the first entry.
    if (!Array.isArray(p.ideas)) {
      p.ideas = [];
      const raw = p.idea && p.idea.rawIdea ? String(p.idea.rawIdea).trim() : "";
      if (raw) p.ideas.push({ id: uid("idea"), text: raw, createdAt: p.createdAt || new Date().toISOString() });
    }
    // idea categories + custom columns (spreadsheet-style extras on the Idea table)
    if (!Array.isArray(p.ideaColumns)) p.ideaColumns = [];
    p.ideas.forEach((idea) => {
      if (!("categoryId" in idea)) idea.categoryId = "";
      if (!idea.customValues || typeof idea.customValues !== "object") idea.customValues = {};
    });

    // scripts: a project now holds many. The old single script becomes "Script 1".
    if (!Array.isArray(p.scripts)) {
      p.scripts = [];
      const old = p.script || {};
      const hadContent = (old.hooks && old.hooks.length) || (old.blocks && old.blocks.length);
      if (hadContent) {
        p.scripts.push({
          id: uid("sc"), title: "Script 1", createdAt: p.createdAt || new Date().toISOString(),
          hooks: old.hooks || [], blocks: old.blocks || [],
        });
      }
    }
    // fullText: the whole script pasted as one block, alongside the structured hooks/blocks.
    p.scripts.forEach((sc) => { if (!("fullText" in sc)) sc.fullText = ""; });
    // shoot points at whichever script is being filmed
    if (!p.shoot) p.shoot = { date: "", location: "", generalNotes: "", shots: [] };
    if (!("scriptId" in p.shoot)) p.shoot.scriptId = p.scripts.length ? p.scripts[0].id : "";
    if (!Array.isArray(p.shoot.shots)) p.shoot.shots = [];
    // old shots had no scriptId — tie them to the migrated script
    p.shoot.shots.forEach((sh) => { if (!sh.scriptId) sh.scriptId = p.shoot.scriptId; });
  }
  return projects;
}
export async function saveProjects(userId, projects) {
  await q(
    `INSERT INTO tool_data (user_id,tool,key,value,updated_at) VALUES ($1,'contentflow','projects',$2,now())
     ON CONFLICT (user_id,tool,key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [userId, { projects }]);
}

const router = express.Router();
router.use(auth(true)); // every route requires an active, signed-in user

// helper: run a mutation against this user's projects and persist
async function withProject(req, res, fn) {
  const uidUser = req.user.id;
  const projects = await loadProjects(uidUser);
  const project = projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: "Not found" });
  const result = await fn(project, projects);
  await saveProjects(uidUser, projects);
  res.json(result);
}

// ---- Projects ----
router.get("/projects", async (req, res) => res.json(await loadProjects(req.user.id)));

router.get("/projects/:id", async (req, res) => {
  const projects = await loadProjects(req.user.id);
  const p = projects.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

router.post("/projects", async (req, res) => {
  const projects = await loadProjects(req.user.id);
  const project = {
    id: uid("p"),
    title: req.body.title || "Untitled",
    brand: req.body.brand || "",
    stage: "channel",
    createdAt: new Date().toISOString(),
    stageDates: { channel: "", idea: "", inspiration: "", script: "", shoot: "", edit: "", post: "" },
    channelId: clean(req.body.channelId, 60),
    pillarIds: Array.isArray(req.body.pillarIds) ? req.body.pillarIds.slice(0, 20) : [],
    inspirations: [],
    ideas: [],
    idea: { rawIdea: "", angle: "", linkedInspirationIds: [] },  // legacy, kept for old clients
    scripts: [],
    script: { hooks: [], blocks: [] },                           // legacy
    shoot: { scriptId: "", date: "", location: "", generalNotes: "", shots: [] },
    edit: { footageLink: "", musicNotes: "", pacingNotes: "", checklist: [], finalLink: "" },
    post: { postedDate: "", url: "", views: "", watchTime: "", retention: "", saves: "", shares: "", comments: "", notes: "", retentionShotId: "" },
  };
  projects.unshift(project);
  await saveProjects(req.user.id, projects);
  res.json(project);
});

router.patch("/projects/:id", (req, res) => withProject(req, res, (project) => { Object.assign(project, req.body); return project; }));

router.delete("/projects/:id", async (req, res) => {
  let projects = await loadProjects(req.user.id);
  projects = projects.filter((p) => p.id !== req.params.id);
  await saveProjects(req.user.id, projects);
  res.json({ ok: true });
});

// ---- Canvas: free-drag inspiration board ----
// Save the whole canvas layout for a project (frames = positions, tags, shot details).
// Images themselves live in canvas_images, referenced by imageId — keeps this JSON small.
router.patch("/projects/:id/canvas", (req, res) => withProject(req, res, (project) => {
  project.canvas = {
    frames: Array.isArray(req.body.frames) ? req.body.frames : [],
    updatedAt: Date.now(),
  };
  return project.canvas;
}));

// Upload one screenshot (base64). Returns an imageId the canvas frame points at.
router.post("/projects/:id/canvas/images", async (req, res) => {
  const projects = await loadProjects(req.user.id);
  if (!projects.find((p) => p.id === req.params.id)) return res.status(404).json({ error: "Not found" });
  const b64 = String(req.body.data || "").replace(/^data:[^;]+;base64,/, "");
  if (!b64) return res.status(400).json({ error: "No image data." });
  const buf = Buffer.from(b64, "base64");
  if (buf.length > 5 * 1024 * 1024) return res.status(413).json({ error: "Image too large (max 5MB)." });
  const id = "img_" + Math.random().toString(36).slice(2, 11);
  const mime = (req.body.mime || "image/jpeg").slice(0, 40);
  await q("INSERT INTO canvas_images (id,user_id,project_id,mime,data) VALUES ($1,$2,$3,$4,$5)",
    [id, req.user.id, req.params.id, mime, buf]);
  res.json({ id });
});

// Serve an image by id — only to its owner.
router.get("/images/:imgId", async (req, res) => {
  const { rows } = await q("SELECT mime, data FROM canvas_images WHERE id=$1 AND user_id=$2",
    [req.params.imgId, req.user.id]);
  if (!rows.length) return res.status(404).end();
  res.set("Content-Type", rows[0].mime);
  res.set("Cache-Control", "private, max-age=86400");
  res.send(rows[0].data);
});

router.delete("/projects/:id/canvas/images/:imgId", async (req, res) => {
  await q("DELETE FROM canvas_images WHERE id=$1 AND user_id=$2 AND project_id=$3",
    [req.params.imgId, req.user.id, req.params.id]);
  res.json({ ok: true });
});

// ---- Inspirations ----
router.post("/projects/:id/inspirations", (req, res) => withProject(req, res, (project) => {
  const item = { id: uid("i"), url: req.body.url || "", platform: req.body.platform || "", note: req.body.note || "", shots: [],
                 reasons: Array.isArray(req.body.reasons) ? req.body.reasons.slice(0, 12) : [] };
  project.inspirations.push(item); return item;
}));

// Save the shot breakdown for one inspiration reel (timestamped shots the user captured).
router.patch("/projects/:id/inspirations/:inspId/shots", (req, res) => withProject(req, res, (project) => {
  const insp = project.inspirations.find((x) => x.id === req.params.inspId);
  if (!insp) throw Object.assign(new Error("Inspiration not found"), { code: 404 });
  insp.shots = Array.isArray(req.body.shots) ? req.body.shots : [];
  return insp;
}));

router.post("/projects/:id/inspirations/bulk", (req, res) => withProject(req, res, (project) => {
  const rows = Array.isArray(req.body.items) ? req.body.items : [];
  const created = rows.filter((r) => r && (r.url || "").trim()).map((r) => ({
    id: uid("i"), url: (r.url || "").trim(), platform: (r.platform || "Instagram").trim(), note: (r.note || "").trim(), shots: [],
  }));
  project.inspirations.push(...created);
  return { created: created.length, items: created };
}));

// ---- Script hooks ----
router.post("/projects/:id/hooks", (req, res) => withProject(req, res, (project) => {
  const hook = {
    id: uid("h"),
    version: req.body.version || String.fromCharCode(65 + project.script.hooks.length),
    text: req.body.text || "", notes: req.body.notes || "",
    selected: project.script.hooks.length === 0,
  };
  project.script.hooks.push(hook); return hook;
}));

router.post("/projects/:id/hooks/:hookId/select", (req, res) => withProject(req, res, (project) => {
  project.script.hooks.forEach((h) => (h.selected = h.id === req.params.hookId));
  return project.script;
}));

// ---- Script blocks (shot-by-shot) ----
router.post("/projects/:id/blocks", (req, res) => withProject(req, res, (project) => {
  const block = {
    id: uid("b"), order: project.script.blocks.length + 1,
    dialogue: req.body.dialogue || "", shotType: req.body.shotType || "", angle: req.body.angle || "",
    movement: req.body.movement || "", location: req.body.location || "", props: req.body.props || "",
    onScreenText: req.body.onScreenText || "", referenceInspirationId: req.body.referenceInspirationId || null,
  };
  project.script.blocks.push(block);
  project.shoot.shots.push({ blockId: block.id, status: "pending", takeNotes: "" });
  return block;
}));

// ---- Shoot ----
router.patch("/projects/:id/shots/:blockId", (req, res) => withProject(req, res, (project) => {
  // scope to the script currently being filmed so two scripts don't share checkmarks
  const sid = project.shoot.scriptId;
  const shot = project.shoot.shots.find((s) => s.blockId === req.params.blockId && (!sid || s.scriptId === sid))
            || project.shoot.shots.find((s) => s.blockId === req.params.blockId);
  if (!shot) throw Object.assign(new Error("Shot not found"), { code: 404 });
  Object.assign(shot, req.body); return shot;
}));

router.patch("/projects/:id/shoot-meta", (req, res) => withProject(req, res, (project) => {
  Object.assign(project.shoot, req.body); return project.shoot;
}));

// ---- Edit ----
router.patch("/projects/:id/edit-meta", (req, res) => withProject(req, res, (project) => {
  Object.assign(project.edit, req.body); return project.edit;
}));

router.post("/projects/:id/edit-checklist", (req, res) => withProject(req, res, (project) => {
  const item = { item: req.body.item || "", done: false };
  project.edit.checklist.push(item); return item;
}));

router.patch("/projects/:id/edit-checklist/:index", (req, res) => withProject(req, res, (project) => {
  const idx = parseInt(req.params.index, 10);
  if (!project.edit.checklist[idx]) throw Object.assign(new Error("Not found"), { code: 404 });
  Object.assign(project.edit.checklist[idx], req.body);
  return project.edit.checklist[idx];
}));

// ---- Idea ----
router.patch("/projects/:id/idea", (req, res) => withProject(req, res, (project) => {
  Object.assign(project.idea, req.body); return project.idea;
}));

// Manually set/edit the date a stage was worked on.
router.patch("/projects/:id/stage-date", (req, res) => withProject(req, res, (project) => {
  const { stage, date } = req.body;
  const valid = ["channel", "idea", "inspiration", "script", "shoot", "edit", "post"];
  if (!valid.includes(stage)) throw Object.assign(new Error("Unknown stage"), { code: 400 });
  project.stageDates = project.stageDates || {};
  project.stageDates[stage] = date || "";
  return project.stageDates;
}));

// Post / results stage: analytics + retention screenshot reference.
router.patch("/projects/:id/post", (req, res) => withProject(req, res, (project) => {
  project.post = project.post || {};
  Object.assign(project.post, req.body);
  return project.post;
}));

// Upload the retention screenshot for the Post stage (reuses canvas_images storage).
router.post("/projects/:id/post/screenshot", async (req, res) => {
  const projects = await loadProjects(req.user.id);
  const project = projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: "Not found" });
  const b64 = String(req.body.data || "").replace(/^data:[^;]+;base64,/, "");
  if (!b64) return res.status(400).json({ error: "No image data." });
  const buf = Buffer.from(b64, "base64");
  if (buf.length > 5 * 1024 * 1024) return res.status(413).json({ error: "Image too large (max 5MB)." });
  const id = "img_" + Math.random().toString(36).slice(2, 11);
  await q("INSERT INTO canvas_images (id,user_id,project_id,mime,data) VALUES ($1,$2,$3,$4,$5)",
    [id, req.user.id, req.params.id, req.body.mime || "image/jpeg", buf]);
  project.post = project.post || {};
  project.post.retentionShotId = id;
  await saveProjects(req.user.id, projects);
  res.json({ id });
});

/* ================= Channels & pillars =================
   Stored per-user, separate from projects, so pillars are reused across every
   project on that channel. */
async function loadChannels(userId) {
  const { rows } = await q(
    "SELECT value FROM tool_data WHERE user_id=$1 AND tool='contentflow' AND key='channels'", [userId]);
  const v = rows[0]?.value;
  return Array.isArray(v?.channels) ? v.channels : [];
}
async function saveChannels(userId, channels) {
  await q(
    `INSERT INTO tool_data (user_id,tool,key,value,updated_at) VALUES ($1,'contentflow','channels',$2,now())
     ON CONFLICT (user_id,tool,key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [userId, { channels }]);
}

router.get("/channels", async (req, res) => res.json({ channels: await loadChannels(req.user.id) }));

router.post("/channels", async (req, res) => {
  const name = clean(req.body.name, 80);
  if (!name) return res.status(400).json({ error: "Give the channel a name." });
  const channels = await loadChannels(req.user.id);
  const existing = channels.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return res.json({ channel: existing, duplicate: true });
  const channel = { id: uid("ch"), name, pillars: [] };
  channels.push(channel);
  await saveChannels(req.user.id, channels);
  res.json({ channel });
});

router.patch("/channels/:id", async (req, res) => {
  const channels = await loadChannels(req.user.id);
  const c = channels.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: "Not found" });
  if ("name" in req.body) c.name = clean(req.body.name, 80) || c.name;
  await saveChannels(req.user.id, channels);
  res.json({ channel: c });
});

router.delete("/channels/:id", async (req, res) => {
  let channels = await loadChannels(req.user.id);
  channels = channels.filter((c) => c.id !== req.params.id);
  await saveChannels(req.user.id, channels);
  res.json({ ok: true });
});

/* Pillars belong to a channel and are reused by every project on it. */
router.post("/channels/:id/pillars", async (req, res) => {
  const name = clean(req.body.name, 80);
  if (!name) return res.status(400).json({ error: "Give the pillar a name." });
  const channels = await loadChannels(req.user.id);
  const c = channels.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: "Channel not found" });
  c.pillars = c.pillars || [];
  const dup = c.pillars.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (dup) return res.json({ pillar: dup, duplicate: true });
  const pillar = { id: uid("pl"), name };
  c.pillars.push(pillar);
  await saveChannels(req.user.id, channels);
  res.json({ pillar });
});

router.delete("/channels/:id/pillars/:pillarId", async (req, res) => {
  const channels = await loadChannels(req.user.id);
  const c = channels.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: "Channel not found" });
  c.pillars = (c.pillars || []).filter((p) => p.id !== req.params.pillarId);
  await saveChannels(req.user.id, channels);
  res.json({ ok: true });
});

/* Set a project's channel + pillars */
router.patch("/projects/:id/channel", (req, res) => withProject(req, res, (project) => {
  if ("channelId" in req.body) project.channelId = clean(req.body.channelId, 60);
  if (Array.isArray(req.body.pillarIds)) project.pillarIds = req.body.pillarIds.slice(0, 20);
  return { channelId: project.channelId, pillarIds: project.pillarIds };
}));

/* Why did you save this? Structured tags beat free text — six months on you can
   actually count what you keep saving. */
router.patch("/projects/:id/inspirations/:inspId/reasons", (req, res) => withProject(req, res, (project) => {
  const insp = project.inspirations.find((x) => x.id === req.params.inspId);
  if (!insp) throw Object.assign(new Error("Not found"), { code: 404 });
  insp.reasons = Array.isArray(req.body.reasons) ? req.body.reasons.slice(0, 12) : [];
  return insp;
}));

/* ================= Ideas (one box that stacks) ================= */
router.post("/projects/:id/ideas", (req, res) => withProject(req, res, (project) => {
  const text = clean(req.body.text, 4000);
  if (!text) throw Object.assign(new Error("Empty idea"), { code: 400 });
  const idea = {
    id: uid("idea"), text, createdAt: new Date().toISOString(),
    categoryId: clean(req.body.categoryId, 60), customValues: {},
  };
  project.ideas = project.ideas || [];
  project.ideas.unshift(idea);   // newest first
  return idea;
}));

router.patch("/projects/:id/ideas/:ideaId", (req, res) => withProject(req, res, (project) => {
  const idea = (project.ideas || []).find((i) => i.id === req.params.ideaId);
  if (!idea) throw Object.assign(new Error("Not found"), { code: 404 });
  if ("text" in req.body) idea.text = clean(req.body.text, 4000);
  if ("categoryId" in req.body) idea.categoryId = clean(req.body.categoryId, 60);
  // deep-merge so setting one custom column's value never wipes another's
  if (req.body.customValues && typeof req.body.customValues === "object") {
    idea.customValues = { ...(idea.customValues || {}), ...req.body.customValues };
  }
  return idea;
}));

router.delete("/projects/:id/ideas/:ideaId", (req, res) => withProject(req, res, (project) => {
  project.ideas = (project.ideas || []).filter((i) => i.id !== req.params.ideaId);
  return { ok: true };
}));

/* Idea categories — per-user, reused across every project (like channels/pillars). */
async function loadIdeaCategories(userId) {
  const { rows } = await q(
    "SELECT value FROM tool_data WHERE user_id=$1 AND tool='contentflow' AND key='ideaCategories'", [userId]);
  const v = rows[0]?.value;
  return Array.isArray(v?.categories) ? v.categories : [];
}
async function saveIdeaCategories(userId, categories) {
  await q(
    `INSERT INTO tool_data (user_id,tool,key,value,updated_at) VALUES ($1,'contentflow','ideaCategories',$2,now())
     ON CONFLICT (user_id,tool,key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [userId, { categories }]);
}
router.get("/idea-categories", async (req, res) => {
  res.json({ categories: await loadIdeaCategories(req.user.id) });
});
router.post("/idea-categories", async (req, res) => {
  const name = clean(req.body.name, 60);
  if (!name) return res.status(400).json({ error: "Give the category a name." });
  const categories = await loadIdeaCategories(req.user.id);
  const dup = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (dup) return res.json({ category: dup, duplicate: true });
  const category = { id: uid("icat"), name };
  categories.push(category);
  await saveIdeaCategories(req.user.id, categories);
  res.json({ category });
});

/* Idea table custom columns — scoped to one project, spreadsheet-style extra fields. */
router.post("/projects/:id/idea-columns", async (req, res) => {
  const name = clean(req.body.name, 60);
  if (!name) return res.status(400).json({ error: "Give the column a name." });
  return withProject(req, res, (project) => {
    project.ideaColumns = project.ideaColumns || [];
    const column = { id: uid("col"), name };
    project.ideaColumns.push(column);
    return column;
  });
});
router.delete("/projects/:id/idea-columns/:columnId", (req, res) => withProject(req, res, (project) => {
  project.ideaColumns = (project.ideaColumns || []).filter((c) => c.id !== req.params.columnId);
  (project.ideas || []).forEach((idea) => {
    if (idea.customValues) delete idea.customValues[req.params.columnId];
  });
  return { ok: true };
}));

/* ================= Scripts (a project holds many) ================= */
router.post("/projects/:id/scripts", (req, res) => withProject(req, res, (project) => {
  project.scripts = project.scripts || [];
  const script = {
    id: uid("sc"),
    title: clean(req.body.title, 120) || `Script ${project.scripts.length + 1}`,
    createdAt: new Date().toISOString(),
    hooks: [], blocks: [],
  };
  project.scripts.push(script);
  if (!project.shoot.scriptId) project.shoot.scriptId = script.id;
  return script;
}));

router.patch("/projects/:id/scripts/:scriptId", (req, res) => withProject(req, res, (project) => {
  const sc = (project.scripts || []).find((x) => x.id === req.params.scriptId);
  if (!sc) throw Object.assign(new Error("Not found"), { code: 404 });
  if ("title" in req.body) sc.title = clean(req.body.title, 120) || sc.title;
  if ("fullText" in req.body) sc.fullText = clean(req.body.fullText, 50000);
  return sc;
}));

router.delete("/projects/:id/scripts/:scriptId", (req, res) => withProject(req, res, (project) => {
  project.scripts = (project.scripts || []).filter((x) => x.id !== req.params.scriptId);
  project.shoot.shots = (project.shoot.shots || []).filter((sh) => sh.scriptId !== req.params.scriptId);
  if (project.shoot.scriptId === req.params.scriptId) {
    project.shoot.scriptId = project.scripts.length ? project.scripts[0].id : "";
  }
  return { ok: true };
}));

/* Duplicate a script — the "rewrite it but keep the old one" move */
router.post("/projects/:id/scripts/:scriptId/duplicate", (req, res) => withProject(req, res, (project) => {
  const src = (project.scripts || []).find((x) => x.id === req.params.scriptId);
  if (!src) throw Object.assign(new Error("Not found"), { code: 404 });
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uid("sc");
  copy.title = src.title + " (copy)";
  copy.createdAt = new Date().toISOString();
  copy.hooks = (copy.hooks || []).map((h) => ({ ...h, id: uid("h") }));
  copy.blocks = (copy.blocks || []).map((b) => ({ ...b, id: uid("b") }));
  project.scripts.push(copy);
  return copy;
}));

/* hooks + blocks now live under a specific script */
router.post("/projects/:id/scripts/:scriptId/hooks", (req, res) => withProject(req, res, (project) => {
  const sc = (project.scripts || []).find((x) => x.id === req.params.scriptId);
  if (!sc) throw Object.assign(new Error("Not found"), { code: 404 });
  const hook = {
    id: uid("h"),
    version: clean(req.body.version, 8) || String.fromCharCode(65 + sc.hooks.length),
    text: clean(req.body.text, 1000), notes: clean(req.body.notes, 500),
    selected: sc.hooks.length === 0,
  };
  sc.hooks.push(hook); return hook;
}));

router.post("/projects/:id/scripts/:scriptId/hooks/:hookId/select", (req, res) => withProject(req, res, (project) => {
  const sc = (project.scripts || []).find((x) => x.id === req.params.scriptId);
  if (!sc) throw Object.assign(new Error("Not found"), { code: 404 });
  sc.hooks.forEach((h) => (h.selected = h.id === req.params.hookId));
  return sc;
}));

router.post("/projects/:id/scripts/:scriptId/blocks", (req, res) => withProject(req, res, (project) => {
  const sc = (project.scripts || []).find((x) => x.id === req.params.scriptId);
  if (!sc) throw Object.assign(new Error("Not found"), { code: 404 });
  const block = {
    id: uid("b"), order: sc.blocks.length + 1,
    dialogue: clean(req.body.dialogue, 2000), shotType: clean(req.body.shotType, 60),
    angle: clean(req.body.angle, 60), movement: clean(req.body.movement, 60),
    location: clean(req.body.location, 120), props: clean(req.body.props, 300),
    onScreenText: clean(req.body.onScreenText, 300),
    referenceInspirationId: req.body.referenceInspirationId || null,
  };
  sc.blocks.push(block);
  // a shot row for the shoot tab, tied to THIS script
  project.shoot.shots.push({ scriptId: sc.id, blockId: block.id, status: "pending", takeNotes: "" });
  return block;
}));

router.patch("/projects/:id/scripts/:scriptId/blocks/:blockId", (req, res) => withProject(req, res, (project) => {
  const sc = (project.scripts || []).find((x) => x.id === req.params.scriptId);
  if (!sc) throw Object.assign(new Error("Not found"), { code: 404 });
  const b = sc.blocks.find((x) => x.id === req.params.blockId);
  if (!b) throw Object.assign(new Error("Not found"), { code: 404 });
  for (const k of ["dialogue", "shotType", "angle", "movement", "location", "props", "onScreenText", "referenceInspirationId"]) {
    if (k in req.body) b[k] = k === "referenceInspirationId" ? (req.body[k] || null) : clean(req.body[k], 2000);
  }
  return b;
}));

router.delete("/projects/:id/scripts/:scriptId/blocks/:blockId", (req, res) => withProject(req, res, (project) => {
  const sc = (project.scripts || []).find((x) => x.id === req.params.scriptId);
  if (!sc) throw Object.assign(new Error("Not found"), { code: 404 });
  sc.blocks = sc.blocks.filter((x) => x.id !== req.params.blockId);
  project.shoot.shots = project.shoot.shots.filter((sh) => sh.blockId !== req.params.blockId);
  return { ok: true };
}));

/* which script is being filmed */
router.patch("/projects/:id/shoot-script", (req, res) => withProject(req, res, (project) => {
  const id = clean(req.body.scriptId, 60);
  if (id && !(project.scripts || []).some((x) => x.id === id)) {
    throw Object.assign(new Error("Unknown script"), { code: 400 });
  }
  project.shoot.scriptId = id;
  // make sure every block of that script has a shot row
  const sc = (project.scripts || []).find((x) => x.id === id);
  if (sc) {
    for (const b of sc.blocks) {
      if (!project.shoot.shots.some((sh) => sh.scriptId === id && sh.blockId === b.id)) {
        project.shoot.shots.push({ scriptId: id, blockId: b.id, status: "pending", takeNotes: "" });
      }
    }
  }
  return project.shoot;
}));

/* ================= PDF export: the whole project, execution-ready ================= */
const FONTS_DIR = path.join(__dirname, "fonts");
const FONT_REG = "body";
const FONT_BOLD = "bold";

const AMBER = "#E8852B";
const AMBER_DARK = "#C96A18";
const AMBER_LIGHT = "#FDF3E7";
const INK = "#2B2320";
const SOFT = "#6B5F55";
const BORDER = "#EAE1D3";
const GRAY_BG = "#F1ECE2";
const GREEN = "#2E7D46";
const GREEN_BG = "#E8F5E9";
const RED = "#C0392B";
const RED_BG = "#FDECEA";

// Mirrors TAG_COLORS in the client's mood canvas (client/public/contentflow/app.js).
const CANVAS_TAGS = [
  { id: "hook", label: "Hook", color: "#E8852B" },
  { id: "broll", label: "B-roll", color: "#2D7384" },
  { id: "talk", label: "Talking", color: "#7A4FA3" },
  { id: "text", label: "Text/GFX", color: "#3F8F5B" },
  { id: "trans", label: "Transition", color: "#C24A5B" },
  { id: "end", label: "CTA/End", color: "#D9A226" },
];
const canvasTag = (id) => CANVAS_TAGS.find((t) => t.id === id);

function registerContentFlowFonts(doc) {
  doc.registerFont(FONT_REG, path.join(FONTS_DIR, "NotoSansDevanagari-Regular.ttf"));
  doc.registerFont(FONT_BOLD, path.join(FONTS_DIR, "NotoSansDevanagari-Bold.ttf"));
}

function pdfPageBreakIfNeeded(doc, needed) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function pdfSectionTitle(doc, text) {
  pdfPageBreakIfNeeded(doc, 60);
  doc.moveDown(1);
  const y = doc.y;
  doc.rect(doc.page.margins.left, y + 2, 4, 13).fill(AMBER);
  doc.fontSize(13).fillColor(AMBER_DARK).font(FONT_BOLD).text(text.toUpperCase(), doc.page.margins.left + 12, y, { characterSpacing: 0.6 });
  doc.moveTo(doc.page.margins.left, doc.y + 4).lineTo(doc.page.width - doc.page.margins.right, doc.y + 4).lineWidth(1).strokeColor(BORDER).stroke();
  doc.y = doc.y + 10;
  doc.x = doc.page.margins.left;
  doc.fillColor(INK).font(FONT_REG);
}
function pdfLabel(doc, label, value) {
  if (!value) return;
  doc.fontSize(9).fillColor(SOFT).font(FONT_BOLD).text(label.toUpperCase() + "  ", doc.x, doc.y, { continued: true });
  doc.fontSize(10.5).fillColor(INK).font(FONT_REG).text(String(value));
}
function pdfBody(doc, text) {
  doc.fontSize(10.5).fillColor(INK).font(FONT_REG).text(text, { align: "left" });
}

// Wrapping "chip" tags — used for categories, why-saved reasons, shot tags, status.
function pdfChips(doc, items, opts = {}) {
  const clean = (items || []).filter(Boolean);
  if (!clean.length) return;
  const bg = opts.bg || AMBER_LIGHT, fg = opts.fg || AMBER_DARK;
  const startX = opts.x != null ? opts.x : doc.page.margins.left;
  const maxX = doc.page.width - doc.page.margins.right;
  let x = startX, y = doc.y;
  const padX = 7, h = 16, gap = 6;
  clean.forEach((label) => {
    doc.font(FONT_BOLD).fontSize(8.5);
    const w = doc.widthOfString(label) + padX * 2;
    if (x + w > maxX && x > startX) { x = startX; y += h + 5; }
    doc.roundedRect(x, y, w, h, 8).fill(bg);
    doc.fillColor(fg).text(label, x + padX, y + 4, { lineBreak: false, width: w - padX * 2 });
    x += w + gap;
  });
  doc.x = startX;
  doc.y = y + h + 6;
  doc.font(FONT_REG).fillColor(INK);
}

// Left accent stripe around a block of content — the "highlighted card" look for entries.
function pdfCardStart(doc) { return { x: doc.x, y: doc.y, pages: doc.bufferedPageRange().count }; }
function pdfCardEnd(doc, start, color) {
  if (doc.bufferedPageRange().count !== start.pages) return; // spanned a page break — skip the stripe
  const y1 = doc.y;
  if (y1 <= start.y) return;
  doc.rect(doc.page.margins.left - 10, start.y - 2, 3, y1 - start.y + 4).fill(color);
}

function pdfHeaderBand(doc, project, channel, pillarNames) {
  const contentW = doc.page.width - 100;
  doc.font(FONT_BOLD).fontSize(21);
  const titleH = doc.heightOfString(project.title || "Untitled", { width: contentW });
  const brandY = 24, titleY = brandY + 15, metaY = titleY + titleH + 8, bandH = metaY + 17;

  doc.rect(0, 0, doc.page.width, bandH).fill(AMBER);
  doc.fillColor("#FFF3E0").font(FONT_BOLD).fontSize(9)
    .text((project.brand || "U2BERCLUB").toUpperCase(), 50, brandY, { characterSpacing: 0.6 });
  doc.fillColor("#FFFFFF").font(FONT_BOLD).fontSize(21)
    .text(project.title || "Untitled", 50, titleY, { width: contentW });
  doc.fillColor("#FFF3E0").font(FONT_REG).fontSize(9.5).text(
    `Stage: ${project.stage || "—"}   ·   Created: ${project.createdAt ? new Date(project.createdAt).toLocaleDateString("en-IN") : "—"}   ·   Channel: ${channel ? channel.name : "—"}   ·   Pillars: ${pillarNames.length ? pillarNames.join(", ") : "—"}`,
    50, metaY, { width: contentW }
  );
  doc.y = bandH + 22;
  doc.x = doc.page.margins.left;
  doc.fillColor(INK).font(FONT_REG);
}

function pdfChecklistRow(doc, item) {
  const contentX = doc.page.margins.left + 18;
  const contentW = doc.page.width - doc.page.margins.right - contentX;
  const y = doc.y;
  const boxX = doc.page.margins.left;
  if (item.done) {
    doc.roundedRect(boxX, y + 1, 11, 11, 2).fill(GREEN);
    doc.save().strokeColor("#FFFFFF").lineWidth(1.4)
      .moveTo(boxX + 2.3, y + 6.3).lineTo(boxX + 4.6, y + 8.6).lineTo(boxX + 8.7, y + 3).stroke();
    doc.restore();
  } else {
    doc.roundedRect(boxX, y + 1, 11, 11, 2).lineWidth(1).stroke(BORDER);
  }
  doc.fillColor(item.done ? SOFT : INK).font(FONT_REG).fontSize(10).text(item.item, contentX, y, { width: contentW });
  doc.x = boxX;
  doc.y = Math.max(doc.y, y + 15) + 4;
}

// One mood-canvas frame: thumbnail on the left (if it has an image), tag/time/shot
// metadata and the note on the right. imgBuf is the raw image Buffer (or null).
function pdfMoodFrame(doc, frame, imgBuf) {
  const boxX = doc.page.margins.left;
  const boxW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const pad = 10;
  const showImgBox = frame.type !== "text";
  const imgW = showImgBox ? 120 : 0;
  const textX = boxX + pad + (showImgBox ? imgW + pad : 0);
  const textW = boxW - pad * 2 - (showImgBox ? imgW + pad : 0);

  doc.font(FONT_REG).fontSize(10);
  const noteH = frame.note ? doc.heightOfString(frame.note, { width: textW }) : 0;
  const metaStr = [frame.angle, frame.move].filter(Boolean).join(" · ");
  let textH = 14; // meta/tag line always reserved
  if (frame.shotType) textH += 15;
  if (metaStr) textH += 12;
  if (noteH) textH += noteH + 6;
  const blockH = Math.max(showImgBox ? 90 : 0, textH) + pad * 2;

  pdfPageBreakIfNeeded(doc, blockH + 10);
  const boxY = doc.y;
  const tag = frame.tag ? canvasTag(frame.tag) : null;
  doc.roundedRect(boxX, boxY, boxW, blockH, 6).fillAndStroke("#FAF6EC", BORDER);
  if (tag) doc.rect(boxX, boxY, 4, blockH).fill(tag.color);

  if (showImgBox) {
    const imgH = blockH - pad * 2;
    let drew = false;
    if (imgBuf) {
      try {
        doc.image(imgBuf, boxX + pad, boxY + pad, { fit: [imgW, imgH], align: "center", valign: "center" });
        drew = true;
      } catch (e) { /* unsupported format (e.g. webp/heic) — fall through to placeholder */ }
    }
    if (!drew) {
      doc.roundedRect(boxX + pad, boxY + pad, imgW, imgH, 4).lineWidth(1).stroke(BORDER);
      doc.fontSize(8).fillColor(SOFT).font(FONT_REG)
        .text(imgBuf ? "Image unavailable" : "No image", boxX + pad + 4, boxY + pad + imgH / 2 - 4,
          { width: imgW - 8, align: "center" });
    }
  }

  let ty = boxY + pad;
  const metaParts = [];
  if (frame.time) metaParts.push(frame.time);
  if (tag) metaParts.push(tag.label);
  if (metaParts.length) {
    doc.fontSize(8.5).fillColor(SOFT).font(FONT_BOLD)
      .text(metaParts.join("   ·   ").toUpperCase(), textX, ty, { width: textW, lineBreak: false });
    ty = doc.y + 3;
  } else {
    ty += 2;
  }
  if (frame.shotType) {
    doc.fontSize(10.5).fillColor(INK).font(FONT_BOLD).text(frame.shotType, textX, ty, { width: textW });
    ty = doc.y + 2;
  }
  if (metaStr) {
    doc.fontSize(9).fillColor(SOFT).font(FONT_REG).text(metaStr, textX, ty, { width: textW });
    ty = doc.y + 3;
  }
  if (frame.note) {
    doc.fontSize(10).fillColor(INK).font(FONT_REG).text(frame.note, textX, ty, { width: textW });
  }

  doc.y = boxY + blockH + 8;
  doc.x = boxX;
}

function buildProjectPDF(doc, project, channels, ideaCategories, canvasImages) {
  registerContentFlowFonts(doc);
  const channel = channels.find((c) => c.id === project.channelId);
  const pillarNames = channel ? (channel.pillars || []).filter((p) => (project.pillarIds || []).includes(p.id)).map((p) => p.name) : [];
  const categoryName = (id) => (ideaCategories.find((c) => c.id === id) || {}).name;

  pdfHeaderBand(doc, project, channel, pillarNames);

  // Idea
  pdfSectionTitle(doc, "Idea");
  const ideas = project.ideas || [];
  if (!ideas.length) pdfBody(doc, "No ideas recorded.");
  ideas.forEach((i, idx) => {
    if (idx > 0) doc.moveDown(0.6);
    const start = pdfCardStart(doc);
    doc.fontSize(8.5).fillColor(SOFT).font(FONT_REG).text(new Date(i.createdAt).toLocaleDateString("en-IN"));
    doc.moveDown(0.15);
    pdfBody(doc, i.text);
    const customEntries = Object.entries(i.customValues || {}).filter(([, v]) => v);
    if (customEntries.length) {
      doc.moveDown(0.2);
      customEntries.forEach(([colId, val]) => {
        const col = (project.ideaColumns || []).find((c) => c.id === colId);
        if (col) pdfLabel(doc, col.name, val);
      });
    }
    if (i.categoryId && categoryName(i.categoryId)) {
      doc.moveDown(0.25);
      pdfChips(doc, [categoryName(i.categoryId)]);
    }
    pdfCardEnd(doc, start, AMBER);
  });

  // Inspiration
  pdfSectionTitle(doc, "Inspiration");
  const insps = project.inspirations || [];
  if (!insps.length) pdfBody(doc, "No inspiration references saved.");
  insps.forEach((i, idx) => {
    if (idx > 0) doc.moveDown(0.6);
    const start = pdfCardStart(doc);
    pdfLabel(doc, "URL", i.url);
    if (i.note) { doc.moveDown(0.15); pdfBody(doc, i.note); }
    if (i.reasons && i.reasons.length) { doc.moveDown(0.25); pdfChips(doc, i.reasons, { bg: GRAY_BG, fg: SOFT }); }
    pdfCardEnd(doc, start, AMBER_DARK);
  });

  // Mood canvas — the free-drag board of captured frames, uploaded images, and notes.
  const frames = (project.canvas && project.canvas.frames) || [];
  if (frames.length) {
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor(SOFT).font(FONT_BOLD).text("MOOD CANVAS");
    doc.moveDown(0.2);
    // top-to-bottom, left-to-right — approximates how the board reads visually
    const sorted = [...frames].sort((a, b) => (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0));
    sorted.forEach((f) => {
      const entry = f.imageId ? canvasImages.get(f.imageId) : null;
      pdfMoodFrame(doc, f, entry ? entry.data : null);
    });
  }

  // Scripts (every draft; the one linked to Shoot is highlighted)
  pdfSectionTitle(doc, "Script");
  const scripts = project.scripts || [];
  if (!scripts.length) pdfBody(doc, "No script drafts yet.");
  scripts.forEach((sc, idx) => {
    if (idx > 0) doc.moveDown(1);
    const inProduction = project.shoot && project.shoot.scriptId === sc.id;
    pdfPageBreakIfNeeded(doc, 40);
    doc.fontSize(13).fillColor(INK).font(FONT_BOLD).text(sc.title);
    if (inProduction) { doc.moveDown(0.15); pdfChips(doc, ["IN PRODUCTION"], { bg: GREEN_BG, fg: GREEN }); }
    doc.moveDown(0.35);

    // Full script — boxed like a quoted script block.
    if (sc.fullText && sc.fullText.trim()) {
      doc.fontSize(9).fillColor(SOFT).font(FONT_BOLD).text("FULL SCRIPT");
      doc.moveDown(0.2);
      const boxX = doc.page.margins.left;
      const boxW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      doc.font(FONT_REG).fontSize(10.5);
      const textH = doc.heightOfString(sc.fullText, { width: boxW - 24 });
      pdfPageBreakIfNeeded(doc, textH + 24);
      const boxY = doc.y;
      doc.roundedRect(boxX, boxY, boxW, textH + 20, 6).fillAndStroke("#FAF6EC", BORDER);
      doc.fillColor(INK).font(FONT_REG).fontSize(10.5).text(sc.fullText, boxX + 12, boxY + 10, { width: boxW - 24 });
      doc.y = boxY + textH + 20 + 10;
      doc.x = boxX;
    }

    // Hooks — selected one highlighted.
    if ((sc.hooks || []).length) {
      doc.fontSize(9).fillColor(SOFT).font(FONT_BOLD).text("HOOK OPTIONS");
      doc.moveDown(0.2);
      const boxX = doc.page.margins.left;
      const boxW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      sc.hooks.forEach((h) => {
        doc.font(FONT_REG).fontSize(10.5);
        const textH = doc.heightOfString(h.text || "", { width: boxW - 24 });
        let notesH = 0;
        if (h.notes) { doc.font(FONT_REG).fontSize(9); notesH = doc.heightOfString(h.notes, { width: boxW - 24 }) + 6; }
        const totalH = 18 + textH + notesH + 12;
        pdfPageBreakIfNeeded(doc, totalH + 8);
        const boxY = doc.y;
        if (h.selected) doc.roundedRect(boxX, boxY, boxW, totalH, 6).fillAndStroke(AMBER_LIGHT, AMBER);
        else doc.roundedRect(boxX, boxY, boxW, totalH, 6).lineWidth(1).stroke(BORDER);
        doc.fillColor(AMBER_DARK).font(FONT_BOLD).fontSize(9)
          .text(`VERSION ${h.version}`.toUpperCase() + (h.selected ? "   ·  SELECTED" : ""), boxX + 12, boxY + 9);
        doc.fillColor(INK).font(FONT_REG).fontSize(10.5).text(h.text || "", boxX + 12, doc.y + 3, { width: boxW - 24 });
        if (h.notes) doc.fillColor(SOFT).font(FONT_REG).fontSize(9).text(h.notes, boxX + 12, doc.y + 3, { width: boxW - 24 });
        doc.y = boxY + totalH + 8;
        doc.x = boxX;
      });
      doc.moveDown(0.15);
    }

    // Shot-by-shot — numbered badges + tag chips.
    if ((sc.blocks || []).length) {
      doc.fontSize(9).fillColor(SOFT).font(FONT_BOLD).text("SHOT-BY-SHOT");
      doc.moveDown(0.2);
      const boxX = doc.page.margins.left;
      const contentX = boxX + 28;
      const contentW = doc.page.width - doc.page.margins.right - contentX;
      sc.blocks.forEach((b) => {
        const tags = [b.shotType, b.angle, b.movement, b.location].filter(Boolean);
        doc.font(FONT_REG).fontSize(10.5);
        const dialogueH = Math.max(20, doc.heightOfString(b.dialogue || "—", { width: contentW }));
        let extraH = (tags.length ? 24 : 0) + (b.props ? 14 : 0) + (b.onScreenText ? 14 : 0);
        pdfPageBreakIfNeeded(doc, dialogueH + extraH + 14);
        const boxY = doc.y;
        doc.circle(boxX + 11, boxY + 10, 11).fill(AMBER);
        doc.fillColor("#FFFFFF").font(FONT_BOLD).fontSize(9.5).text(String(b.order), boxX, boxY + 6, { width: 22, align: "center" });
        doc.fillColor(INK).font(FONT_REG).fontSize(10.5).text(b.dialogue || "—", contentX, boxY, { width: contentW });
        doc.x = contentX;
        if (tags.length) { doc.moveDown(0.2); pdfChips(doc, tags, { bg: GRAY_BG, fg: SOFT, x: contentX }); doc.x = contentX; }
        if (b.props) doc.fontSize(9).fillColor(SOFT).font(FONT_REG).text("Props/notes: " + b.props, contentX, doc.y, { width: contentW });
        if (b.onScreenText) doc.fontSize(9).fillColor(SOFT).font(FONT_REG).text("On-screen text: " + b.onScreenText, contentX, doc.y, { width: contentW });
        doc.y = Math.max(doc.y, boxY + 26) + 10;
        doc.x = boxX;
      });
    }
  });

  // Shoot
  pdfSectionTitle(doc, "Shoot");
  const shoot = project.shoot || {};
  pdfLabel(doc, "Date", shoot.date);
  pdfLabel(doc, "Location", shoot.location);
  if (shoot.generalNotes) { doc.moveDown(0.15); pdfBody(doc, shoot.generalNotes); }
  const shootSc = scripts.find((s) => s.id === shoot.scriptId);
  const shots = (shoot.shots || []).filter((s) => !shoot.scriptId || s.scriptId === shoot.scriptId);
  if (shootSc && shots.length) {
    doc.moveDown(0.35);
    const STATUS_STYLE = {
      shot: { bg: GREEN_BG, fg: GREEN }, reshoot: { bg: RED_BG, fg: RED }, pending: { bg: GRAY_BG, fg: SOFT },
    };
    shots.forEach((sh) => {
      const b = (shootSc.blocks || []).find((x) => x.id === sh.blockId);
      const status = sh.status || "pending";
      pdfPageBreakIfNeeded(doc, 40);
      doc.fontSize(10).fillColor(INK).font(FONT_BOLD).text(`Shot ${b ? b.order : "?"}`, { continued: false });
      doc.moveDown(0.15);
      pdfChips(doc, [status.toUpperCase()], STATUS_STYLE[status] || STATUS_STYLE.pending);
      if (sh.takeNotes) { doc.fontSize(9.5).fillColor(SOFT).font(FONT_REG).text(sh.takeNotes); doc.moveDown(0.1); }
      doc.moveDown(0.25);
    });
  }

  // Edit (only if something's filled in)
  const edit = project.edit || {};
  const hasEdit = edit.footageLink || edit.musicNotes || edit.pacingNotes || (edit.checklist || []).length;
  if (hasEdit) {
    pdfSectionTitle(doc, "Edit");
    pdfLabel(doc, "Footage link", edit.footageLink);
    if (edit.musicNotes) pdfLabel(doc, "Music notes", edit.musicNotes);
    if (edit.pacingNotes) pdfLabel(doc, "Pacing notes", edit.pacingNotes);
    if ((edit.checklist || []).length) {
      doc.moveDown(0.3);
      edit.checklist.forEach((c) => pdfChecklistRow(doc, c));
    }
  }

  // Post (only if something's filled in)
  const post = project.post || {};
  const hasPost = ["url", "views", "watchTime", "retention", "saves", "shares", "comments", "notes"].some((k) => post[k]);
  if (hasPost) {
    pdfSectionTitle(doc, "Post");
    const stats = [
      ["Views", post.views], ["Watch time", post.watchTime], ["Retention", post.retention],
      ["Saves", post.saves], ["Shares", post.shares], ["Comments", post.comments],
    ].filter(([, v]) => v);
    if (stats.length) {
      pdfChips(doc, stats.map(([k, v]) => `${k}: ${v}`), { bg: AMBER_LIGHT, fg: AMBER_DARK });
      doc.moveDown(0.15);
    }
    pdfLabel(doc, "URL", post.url);
    if (post.notes) { doc.moveDown(0.15); pdfBody(doc, post.notes); }
  }

  // Footer: page numbers on every buffered page.
  // (Writing this close to the bottom edge can make pdfkit think the text overflows
  // and silently start a new page — zeroing the bottom margin during the write avoids that.)
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fontSize(8).fillColor(SOFT).font(FONT_REG)
      .text(`U2berClub ContentFlow  ·  Page ${i - range.start + 1} of ${range.count}`,
        doc.page.margins.left, doc.page.height - oldBottom + 14,
        { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: "center", lineBreak: false });
    doc.page.margins.bottom = oldBottom;
  }
}

router.get("/projects/:id/pdf", async (req, res) => {
  const projects = await loadProjects(req.user.id);
  const project = projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: "Not found" });
  const { rows } = await q(
    "SELECT value FROM tool_data WHERE user_id=$1 AND tool='contentflow' AND key='channels'", [req.user.id]);
  const channels = Array.isArray(rows[0]?.value?.channels) ? rows[0].value.channels : [];
  const { rows: catRows } = await q(
    "SELECT value FROM tool_data WHERE user_id=$1 AND tool='contentflow' AND key='ideaCategories'", [req.user.id]);
  const ideaCategories = Array.isArray(catRows[0]?.value?.categories) ? catRows[0].value.categories : [];

  // Mood-canvas images (and the Post-stage retention screenshot) live in canvas_images,
  // keyed by id — pull every image belonging to this project so the PDF can embed them.
  const { rows: imgRows } = await q(
    "SELECT id, mime, data FROM canvas_images WHERE user_id=$1 AND project_id=$2", [req.user.id, project.id]);
  const canvasImages = new Map(imgRows.map((r) => [r.id, r]));

  const filename = (project.title || "project").replace(/[^a-z0-9]+/gi, "_").slice(0, 60) + ".pdf";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
  doc.pipe(res);
  buildProjectPDF(doc, project, channels, ideaCategories, canvasImages);
  doc.end();
});

export default router;
