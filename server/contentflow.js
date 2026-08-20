// ContentFlow, hosted per-user inside the hub.
// Each user's whole projects array lives in tool_data (tool='contentflow', key='projects').
// Every route below loads THIS user's projects, mutates, saves — full isolation.
import express from "express";
import { q } from "./db/index.js";
import { auth } from "./auth.js";

const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 9);
const clean = (v, max = 400) => String(v ?? "").trim().slice(0, max);

async function loadProjects(userId) {
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
    // shoot points at whichever script is being filmed
    if (!p.shoot) p.shoot = { date: "", location: "", generalNotes: "", shots: [] };
    if (!("scriptId" in p.shoot)) p.shoot.scriptId = p.scripts.length ? p.scripts[0].id : "";
    if (!Array.isArray(p.shoot.shots)) p.shoot.shots = [];
    // old shots had no scriptId — tie them to the migrated script
    p.shoot.shots.forEach((sh) => { if (!sh.scriptId) sh.scriptId = p.shoot.scriptId; });
  }
  return projects;
}
async function saveProjects(userId, projects) {
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
  const idea = { id: uid("idea"), text, createdAt: new Date().toISOString() };
  project.ideas = project.ideas || [];
  project.ideas.unshift(idea);   // newest first
  return idea;
}));

router.patch("/projects/:id/ideas/:ideaId", (req, res) => withProject(req, res, (project) => {
  const idea = (project.ideas || []).find((i) => i.id === req.params.ideaId);
  if (!idea) throw Object.assign(new Error("Not found"), { code: 404 });
  if ("text" in req.body) idea.text = clean(req.body.text, 4000);
  return idea;
}));

router.delete("/projects/:id/ideas/:ideaId", (req, res) => withProject(req, res, (project) => {
  project.ideas = (project.ideas || []).filter((i) => i.id !== req.params.ideaId);
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

export default router;
