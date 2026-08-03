// ContentFlow, hosted per-user inside the hub.
// Each user's whole projects array lives in tool_data (tool='contentflow', key='projects').
// Every route below loads THIS user's projects, mutates, saves — full isolation.
import express from "express";
import { q } from "./db/index.js";
import { auth } from "./auth.js";

const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 9);

async function loadProjects(userId) {
  const { rows } = await q(
    "SELECT value FROM tool_data WHERE user_id=$1 AND tool='contentflow' AND key='projects'", [userId]);
  const v = rows[0]?.value;
  return Array.isArray(v?.projects) ? v.projects : [];
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
    stage: "inspiration",
    createdAt: new Date().toISOString(),
    inspirations: [],
    idea: { rawIdea: "", angle: "", linkedInspirationIds: [] },
    script: { hooks: [], blocks: [] },
    shoot: { date: "", location: "", generalNotes: "", shots: [] },
    edit: { footageLink: "", musicNotes: "", pacingNotes: "", checklist: [], finalLink: "" },
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

// ---- Inspirations ----
router.post("/projects/:id/inspirations", (req, res) => withProject(req, res, (project) => {
  const item = { id: uid("i"), url: req.body.url || "", platform: req.body.platform || "", note: req.body.note || "", shots: [] };
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
  const shot = project.shoot.shots.find((s) => s.blockId === req.params.blockId);
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

export default router;
