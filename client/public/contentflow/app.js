const STAGES = ["idea", "inspiration", "script", "shoot", "edit", "post"];
const STAGE_LABELS = {
  idea: "Idea",
  inspiration: "Inspiration",
  script: "Script",
  shoot: "Shoot",
  edit: "Edit",
  post: "Post",
};

const state = {
  projects: [],
  role: "strategist",
  currentProjectId: null,
  activeTab: "inspiration",
};

const app = document.getElementById("app");
const modalRoot = document.getElementById("modalRoot");

// ---------- API ----------
async function api(path, opts) {
  const res = await fetch("/api/contentflow" + path, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...opts,
  });
  if (res.status === 401 || res.status === 403) { window.location.href = "/"; throw new Error("Not signed in"); }
  if (!res.ok) throw new Error("API error: " + res.status);
  return res.json();
}

async function loadProjects() {
  state.projects = await api("/projects");
}

// ---------- Role permissions ----------
// Which stages a role is allowed to EDIT. Every role can always VIEW every stage (read-only elsewhere).
const EDIT_PERMISSIONS = {
  strategist: ["idea", "inspiration", "script", "shoot", "edit", "post"],
  videographer: ["shoot"],
  editor: ["edit"],
};

function canEdit(stage) {
  return EDIT_PERMISSIONS[state.role].includes(stage);
}

// ---------- Routing ----------
function goBoard() {
  state.currentProjectId = null;
  render();
}
function goProject(id, tab) {
  state.currentProjectId = id;
  state.activeTab = tab || null;
  render();
}

async function render() {
  if (!state.currentProjectId) {
    renderBoard();
  } else {
    const project = await api("/projects/" + state.currentProjectId);
    if (!state.activeTab) state.activeTab = project.stage === "done" ? "edit" : project.stage;
    renderDetail(project);
  }
}

// ---------- Board ----------
function renderBoard() {
  const cols = STAGES.map((stage) => {
    const items = state.projects.filter((p) => p.stage === stage);
    const cards = items
      .map(
        (p) => `
      <div class="card" onclick="goProject('${p.id}')">
        <div class="card-brand">${escapeHtml(p.brand || "")}</div>
        <div class="card-title">${escapeHtml(p.title)}</div>
        <div class="card-meta">${p.inspirations.length} reference${p.inspirations.length === 1 ? "" : "s"} &middot; ${p.script.blocks.length} shot${p.script.blocks.length === 1 ? "" : "s"}</div>
        ${pipelineDots(p.stage)}
      </div>`
      )
      .join("");
    return `
      <div class="board-col">
        <div class="board-col-title">${STAGE_LABELS[stage]} <span style="opacity:.5">(${items.length})</span></div>
        ${cards || '<div class="empty-state">—</div>'}
      </div>`;
  }).join("");

  app.innerHTML = `
    <div style="margin-bottom:18px;">
      <div style="font-size:22px;font-weight:700;">Pipeline board</div>
      <div style="color:var(--ink-soft);font-size:13px;margin-top:2px;">Every piece of content, one place, full context at every stage.</div>
    </div>
    <div class="board-columns">${cols}</div>
  `;
}

function pipelineDots(stage) {
  const idx = STAGES.indexOf(stage);
  return `<div class="pipeline-progress">${STAGES.map((s, i) => `<div class="pip-dot ${i <= idx ? "done" : ""}"></div>`).join("")}</div>`;
}

// ---------- Detail ----------
function renderDetail(project) {
  const tabs = STAGES.map((stage) => {
    const active = state.activeTab === stage ? "active" : "";
    return `<div class="step ${active}" onclick="goProject('${project.id}','${stage}')">${STAGE_LABELS[stage]}${!canEdit(stage) ? '<span class="step-badge">view</span>' : ""}</div>`;
  }).join("");

  app.innerHTML = `
    <div class="back-link" onclick="goBoard()">&larr; Back to board</div>
    <div class="detail-header">
      <div>
        <div class="detail-brand">${escapeHtml(project.brand || "")}</div>
        <h1 class="detail-title">${escapeHtml(project.title)}</h1>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <select onchange="changeStage('${project.id}', this.value)" style="height:36px;">
          ${STAGES.map((s) => `<option value="${s}" ${project.stage === s ? "selected" : ""}>${STAGE_LABELS[s]}</option>`).join("")}
          <option value="done" ${project.stage === "done" ? "selected" : ""}>Done</option>
        </select>
        <button class="btn btn-sm" style="color:var(--red);border-color:var(--red);" onclick="confirmDeleteProject('${project.id}')">🗑 Delete</button>
      </div>
    </div>
    <div class="stepper">${tabs}</div>
    ${renderStageDateBar(project)}
    <div id="tabContent"></div>
  `;

  const contentEl = document.getElementById("tabContent");
  const editable = canEdit(state.activeTab);
  const banner = editable
    ? ""
    : `<div class="readonly-banner">Viewing as ${roleLabel(state.role)} — this stage is read-only for context. You can edit the ${STAGE_LABELS[EDIT_PERMISSIONS[state.role][0]] || ""} tab.</div>`;

  let body = "";
  if (state.activeTab === "inspiration") body = renderInspiration(project, editable);
  else if (state.activeTab === "idea") body = renderIdea(project, editable);
  else if (state.activeTab === "script") body = renderScript(project, editable);
  else if (state.activeTab === "shoot") body = renderShoot(project, editable);
  else if (state.activeTab === "edit") body = renderEdit(project, editable);
  else if (state.activeTab === "post") body = renderPost(project, editable);

  contentEl.innerHTML = banner + body;
  processInstagramEmbeds();
}

// A small bar under the tabs: the date THIS stage was worked on (editable).
function renderStageDateBar(project) {
  const stage = state.activeTab;
  if (!stage || stage === "done") return "";
  const dates = project.stageDates || {};
  const val = dates[stage] || "";
  const editable = canEdit(stage);
  return `
    <div class="stage-datebar">
      <span class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">${STAGE_LABELS[stage]} started</span>
      <input type="date" class="input-sm" value="${escapeAttr(val)}" ${editable ? "" : "disabled"}
        onchange="setStageDate('${project.id}','${stage}',this.value)" />
      ${val ? `<span class="muted" style="font-size:11px;">${fmtDate(val)}</span>` : `<span class="muted" style="font-size:11px;">not set</span>`}
    </div>`;
}
function fmtDate(d) {
  if (!d) return "";
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}
async function setStageDate(pid, stage, date) {
  await api(`/projects/${pid}/stage-date`, { method: "PATCH", body: JSON.stringify({ stage, date }) });
  await loadProjects();
  render();
}

function confirmDeleteProject(pid) {
  const p = getProject(pid);
  if (!confirm(`Delete "${p ? p.title : "this project"}"?\n\nThis permanently removes the project and all its data — inspirations, canvas frames, script, shots, and post results. This cannot be undone.`)) return;
  deleteProjectNow(pid);
}
async function deleteProjectNow(pid) {
  await api(`/projects/${pid}`, { method: "DELETE" });
  await loadProjects();
  goBoard();
}

// ---------- Post / results stage ----------
function renderPost(project, editable) {
  const p = project.post || {};
  const dis = editable ? "" : "disabled";
  const shotSrc = p.retentionShotId ? `/api/contentflow/images/${p.retentionShotId}` : null;
  const field = (label, key, ph, hint) => `
    <div class="field">
      <label class="field-label">${label}${hint ? ` <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0;">— ${hint}</span>` : ""}</label>
      <input type="text" id="post-${key}" ${dis} value="${escapeAttr(p[key] || "")}" placeholder="${ph}">
    </div>`;
  return `
    <div class="section">
      <div class="section-title">Results &amp; analytics</div>
      <p class="muted" style="font-size:12.5px;margin:-4px 0 14px;">Once it's live, log how it actually performed. Instagram doesn't expose this for you to pull automatically — type in what you see, same as TEARDOWN.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <div style="flex:1;min-width:150px;">${field("Posted on", "postedDate", "", "")}</div>
        <div style="flex:2;min-width:220px;">${field("Post URL", "url", "https://instagram.com/reel/...", "")}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        ${field("Views", "views", "240K", "")}
        ${field("Watch time", "watchTime", "12s avg", "average")}
        ${field("Retention", "retention", "48%", "% who stayed")}
        ${field("Saves", "saves", "6,200", "")}
        ${field("Shares", "shares", "4,100", "")}
        ${field("Comments", "comments", "320", "")}
      </div>
      <div class="field">
        <label class="field-label">Notes — what worked, what you'd change</label>
        <textarea id="post-notes" ${dis} rows="2" placeholder="Hook held for 3s then dropped; CTA at the end drove the saves...">${escapeHtml(p.notes || "")}</textarea>
      </div>
      ${editable ? `<button class="btn btn-primary btn-sm" onclick="savePost('${project.id}')">Save results</button>` : ""}
    </div>

    <div class="section">
      <div class="section-title">Retention screenshot</div>
      <p class="muted" style="font-size:12.5px;margin:-4px 0 12px;">Upload the retention graph from Instagram Insights — the shape of where people dropped off is the real lesson.</p>
      ${shotSrc ? `
        <div style="position:relative;display:inline-block;">
          <img src="${shotSrc}" style="max-width:100%;max-height:420px;border:1px solid var(--border);border-radius:8px;display:block;">
          ${editable ? `<button class="btn btn-sm" style="margin-top:8px;" onclick="document.getElementById('retentionUpload').click()">Replace screenshot</button>` : ""}
        </div>` : (editable ? `
        <button class="btn btn-sm" onclick="document.getElementById('retentionUpload').click()">⬆ Upload retention screenshot</button>` : `<div class="muted" style="font-size:13px;">No screenshot uploaded.</div>`)}
      ${editable ? `<input type="file" id="retentionUpload" accept="image/*" style="display:none;" onchange="uploadRetention('${project.id}', this.files[0])">` : ""}
    </div>`;
}

async function savePost(pid) {
  const g = (k) => (document.getElementById("post-" + k) || {}).value || "";
  const body = { postedDate: g("postedDate"), url: g("url"), views: g("views"), watchTime: g("watchTime"),
    retention: g("retention"), saves: g("saves"), shares: g("shares"), comments: g("comments"), notes: g("notes") };
  await api(`/projects/${pid}/post`, { method: "PATCH", body: JSON.stringify(body) });
  await loadProjects();
  render();
}
async function uploadRetention(pid, file) {
  if (!file || !file.type.startsWith("image/")) return;
  const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
  await api(`/projects/${pid}/post/screenshot`, { method: "POST", body: JSON.stringify({ data: dataUrl, mime: file.type }) });
  await loadProjects();
  render();
}

// ---------- Instagram embeds ----------
function isInstagramUrl(url) {
  return /instagram\.com/i.test(url || "");
}

function instagramEmbedHtml(url) {
  if (!isInstagramUrl(url)) {
    return `<div class="insp-thumb">🎬</div>`;
  }
  return `
    <blockquote class="instagram-media insp-embed" data-instgrm-permalink="${escapeAttr(url)}" data-instgrm-version="14">
      <a href="${escapeAttr(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>
    </blockquote>`;
}

function processInstagramEmbeds() {
  if (window.instgrm && window.instgrm.Embeds) {
    window.instgrm.Embeds.process();
  }
}

function roleLabel(role) {
  return { strategist: "Strategist", videographer: "Videographer", editor: "Editor" }[role];
}

async function changeStage(id, stage) {
  await api(`/projects/${id}`, { method: "PATCH", body: JSON.stringify({ stage }) });
  await loadProjects();
  render();
}

// ---------- Inspiration tab ----------
// Shot-breakdown vocabulary (from the U2berClub shot-breakdown-analyzer)
const SHOT_TYPES = ["Extreme close-up", "Close-up", "Medium close-up", "Medium", "Medium-wide", "Wide", "Extreme-wide / establishing"];
const SHOT_ANGLES = ["Eye-level", "Low angle", "High angle", "Dutch / tilted", "Overhead / top-down"];
const SHOT_MOVES = ["Static", "Handheld", "Pan", "Tilt", "Push in", "Pull out", "Snap zoom", "Whip / whip-pan", "Tracking / follow", "Orbit"];

// ============ CANVAS BOARD (free-drag inspiration board) ============
const TAG_COLORS = [
  { id: "hook",  label: "Hook",   color: "#E8852B" },
  { id: "broll", label: "B-roll", color: "#2D7384" },
  { id: "talk",  label: "Talking",color: "#7A4FA3" },
  { id: "text",  label: "Text/GFX",color: "#3F8F5B" },
  { id: "trans", label: "Transition",color: "#C24A5B" },
  { id: "end",   label: "CTA/End",color: "#D9A226" },
];
function tagById(id) { return TAG_COLORS.find((t) => t.id === id); }

function renderCanvasBoard(project, editable) {
  const frames = (project.canvas && project.canvas.frames) || [];
  return `
    <div class="section" style="padding-bottom:10px;">
      <div class="section-title" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        🎨 Mood canvas <span class="chip">${frames.length}</span>
        <span class="muted" style="font-weight:400;font-size:11px;">drag frames around · capture from video · tag by role</span>
        ${editable ? `
        <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-sm" onclick="openCaptureModal('${project.id}')">🎬 Capture from video</button>
          <button class="btn btn-sm" onclick="document.getElementById('canvasImgUpload').click()">🖼 Add image</button>
          <button class="btn btn-sm" onclick="addTextFrame('${project.id}')">🗒 Add note</button>
          <input type="file" id="canvasImgUpload" accept="image/*" multiple style="display:none;" onchange="uploadCanvasImages('${project.id}', this.files)">
        </span>` : ""}
      </div>
      <div id="canvas-${project.id}" class="mood-canvas" ${editable ? `ondragover="event.preventDefault()"` : ""}>
        ${frames.length ? frames.map((f) => renderFrame(project.id, f, editable)).join("") :
          `<div class="canvas-empty">Capture a shot from a video or drop an image to start your board.</div>`}
      </div>
    </div>`;
}

function renderFrame(projectId, f, editable) {
  const tag = f.tag ? tagById(f.tag) : null;
  const x = f.x || 20, y = f.y || 20, w = f.w || 200;
  const imgSrc = f.imageId ? `/api/contentflow/images/${f.imageId}` : null;
  return `
    <div class="frame" data-fid="${f.id}" style="left:${x}px;top:${y}px;width:${w}px;${tag ? `border-color:${tag.color};` : ""}"
      ${editable ? `onmousedown="frameDragStart(event,'${projectId}','${f.id}')"` : ""}>
      ${tag ? `<div class="frame-tag" style="background:${tag.color};">${tag.label}</div>` : ""}
      ${imgSrc ? `<img src="${imgSrc}" class="frame-img" draggable="false" />` :
        (f.type === "text" ? "" : `<div class="frame-img frame-img-empty">no image</div>`)}
      <div class="frame-body">
        ${f.time ? `<span class="chip" style="font-family:monospace;font-size:10px;">${escapeHtml(f.time)}</span>` : ""}
        ${f.shotType ? `<b style="font-size:11.5px;"> ${escapeHtml(f.shotType)}</b>` : ""}
        ${(f.angle || f.move) ? `<div class="muted" style="font-size:10px;">${[f.angle, f.move].filter(Boolean).map(escapeHtml).join(" · ")}</div>` : ""}
        ${f.note ? `<div style="font-size:11px;color:var(--ink-soft);margin-top:3px;line-height:1.35;">${escapeHtml(f.note)}</div>` : ""}
      </div>
      ${editable ? `
      <div class="frame-tools">
        <button title="Edit" onmousedown="event.stopPropagation()" onclick="editFrame('${projectId}','${f.id}')">✎</button>
        <button title="Tag" onmousedown="event.stopPropagation()" onclick="cycleTag('${projectId}','${f.id}')">🎨</button>
        <button title="Delete" onmousedown="event.stopPropagation()" onclick="deleteFrame('${projectId}','${f.id}')">✕</button>
      </div>` : ""}
    </div>`;
}

// ---- canvas state helpers ----
function getProject(pid) { return state.projects.find((p) => p.id === pid); }
function getFrames(pid) { const p = getProject(pid); return (p.canvas && p.canvas.frames) || []; }
async function saveCanvas(pid) {
  const frames = getFrames(pid);
  await api(`/projects/${pid}/canvas`, { method: "PATCH", body: JSON.stringify({ frames }) });
}
function setFrames(pid, frames) {
  const p = getProject(pid);
  p.canvas = p.canvas || {}; p.canvas.frames = frames;
}

// ---- drag ----
let _drag = null;
function frameDragStart(e, pid, fid) {
  if (e.button !== 0) return;
  const el = e.currentTarget;
  const canvas = document.getElementById("canvas-" + pid);
  const cRect = canvas.getBoundingClientRect();
  const fRect = el.getBoundingClientRect();
  _drag = { pid, fid, el, offX: e.clientX - fRect.left, offY: e.clientY - fRect.top, cRect };
  el.style.zIndex = 999;
  document.addEventListener("mousemove", frameDragMove);
  document.addEventListener("mouseup", frameDragEnd);
  e.preventDefault();
}
function frameDragMove(e) {
  if (!_drag) return;
  let x = e.clientX - _drag.cRect.left - _drag.offX;
  let y = e.clientY - _drag.cRect.top - _drag.offY;
  x = Math.max(0, x); y = Math.max(0, y);
  _drag.el.style.left = x + "px"; _drag.el.style.top = y + "px";
}
function frameDragEnd() {
  if (!_drag) return;
  const { pid, fid, el } = _drag;
  const x = parseInt(el.style.left), y = parseInt(el.style.top);
  const frames = getFrames(pid).map((f) => f.id === fid ? { ...f, x, y } : f);
  setFrames(pid, frames);
  el.style.zIndex = "";
  document.removeEventListener("mousemove", frameDragMove);
  document.removeEventListener("mouseup", frameDragEnd);
  _drag = null;
  saveCanvas(pid); // persist new position
}

// ---- add frames ----
function newFrameId() { return "f_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6); }
function nextPos(pid) {
  const n = getFrames(pid).length;
  return { x: 20 + (n % 4) * 220, y: 20 + Math.floor(n / 4) * 200 };
}

async function uploadCanvasImages(pid, fileList) {
  const files = Array.from(fileList || []);
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
    const { id } = await api(`/projects/${pid}/canvas/images`, { method: "POST", body: JSON.stringify({ data: dataUrl, mime: file.type }) });
    const pos = nextPos(pid);
    const frames = [...getFrames(pid), { id: newFrameId(), type: "image", imageId: id, x: pos.x, y: pos.y, w: 200 }];
    setFrames(pid, frames);
  }
  await saveCanvas(pid);
  render();
}

function addTextFrame(pid) {
  const note = prompt("Note text:");
  if (note == null) return;
  const pos = nextPos(pid);
  setFrames(pid, [...getFrames(pid), { id: newFrameId(), type: "text", note, x: pos.x, y: pos.y, w: 180 }]);
  saveCanvas(pid); render();
}

function deleteFrame(pid, fid) {
  const f = getFrames(pid).find((x) => x.id === fid);
  if (f && f.imageId) api(`/projects/${pid}/canvas/images/${f.imageId}`, { method: "DELETE" }).catch(() => {});
  setFrames(pid, getFrames(pid).filter((x) => x.id !== fid));
  saveCanvas(pid); render();
}

function cycleTag(pid, fid) {
  const order = [null, ...TAG_COLORS.map((t) => t.id)];
  setFrames(pid, getFrames(pid).map((f) => {
    if (f.id !== fid) return f;
    const cur = order.indexOf(f.tag || null);
    return { ...f, tag: order[(cur + 1) % order.length] };
  }));
  saveCanvas(pid); render();
}

function editFrame(pid, fid) {
  const f = getFrames(pid).find((x) => x.id === fid);
  if (!f) return;
  state._editFrame = { pid, fid };
  modalRoot.innerHTML = `
    <div class="modal-overlay" onclick="closeModalIfOverlay(event)">
      <div class="modal" style="max-width:420px;">
        <h3>Frame details</h3>
        <div class="field"><label class="field-label">Timestamp</label><input id="ef-time" class="input-sm" style="width:100%;" value="${escapeAttr(f.time || "")}" placeholder="0:03"></div>
        <div class="field"><label class="field-label">Shot type</label>
          <select id="ef-type" class="input-sm" style="width:100%;"><option value="">—</option>${SHOT_TYPES.map((t) => `<option ${f.shotType === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div style="display:flex;gap:8px;">
          <div class="field" style="flex:1;"><label class="field-label">Angle</label>
            <select id="ef-angle" class="input-sm" style="width:100%;"><option value="">—</option>${SHOT_ANGLES.map((t) => `<option ${f.angle === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
          <div class="field" style="flex:1;"><label class="field-label">Movement</label>
            <select id="ef-move" class="input-sm" style="width:100%;"><option value="">—</option>${SHOT_MOVES.map((t) => `<option ${f.move === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        </div>
        <div class="field"><label class="field-label">Note</label><textarea id="ef-note" rows="2">${escapeHtml(f.note || "")}</textarea></div>
        <div class="field"><label class="field-label">Tag</label>
          <select id="ef-tag" class="input-sm" style="width:100%;"><option value="">— none —</option>${TAG_COLORS.map((t) => `<option value="${t.id}" ${f.tag === t.id ? "selected" : ""}>${t.label}</option>`).join("")}</select></div>
        <div class="modal-actions" style="margin-top:12px;">
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveFrameEdit()">Save</button>
        </div>
      </div>
    </div>`;
}
function saveFrameEdit() {
  const { pid, fid } = state._editFrame;
  const g = (id) => document.getElementById(id).value;
  setFrames(pid, getFrames(pid).map((f) => f.id === fid ? {
    ...f, time: g("ef-time"), shotType: g("ef-type"), angle: g("ef-angle"), move: g("ef-move"), note: g("ef-note"), tag: g("ef-tag") || null,
  } : f));
  state._editFrame = null; closeModal(); saveCanvas(pid); render();
}

// ---- capture from an uploaded video ----
function openCaptureModal(pid) {
  state._capture = { pid };
  modalRoot.innerHTML = `
    <div class="modal-overlay" onclick="closeModalIfOverlay(event)">
      <div class="modal" style="max-width:640px;">
        <h3>Capture frames from video</h3>
        <p class="muted" style="font-size:12.5px;margin-top:4px;">Upload the reel's video, scrub to a moment, and grab the exact frame as an image on your canvas.</p>
        <div id="capHost" style="margin-top:10px;">
          <button class="btn btn-sm" onclick="document.getElementById('capFile').click()">⬆ Upload video file</button>
          <input type="file" id="capFile" accept="video/*" style="display:none;" onchange="capLoadVideo(this.files[0])">
        </div>
        <div class="modal-actions" style="margin-top:12px;">
          <button class="btn" onclick="closeModal()">Done</button>
        </div>
      </div>
    </div>`;
}
function capLoadVideo(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  document.getElementById("capHost").innerHTML = `
    <video id="capVideo" src="${url}" controls playsinline style="width:100%;border-radius:8px;background:#000;max-height:420px;"></video>
    <div style="display:flex;gap:8px;align-items:center;margin-top:8px;">
      <button class="btn btn-primary btn-sm" onclick="grabFrame()">📸 Grab this frame → canvas</button>
      <span id="capTime" class="muted" style="font-size:12px;font-family:monospace;"></span>
    </div>
    <div id="capThumbs" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;"></div>`;
  const v = document.getElementById("capVideo");
  v.addEventListener("timeupdate", () => { document.getElementById("capTime").textContent = fmtTime(v.currentTime); });
}
async function grabFrame() {
  const v = document.getElementById("capVideo");
  if (!v) return;
  const canvas = document.createElement("canvas");
  const w = 320, h = Math.round(w * (v.videoHeight / v.videoWidth)) || 480;
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(v, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  const time = fmtTime(v.currentTime);
  const { pid } = state._capture;
  const { id } = await api(`/projects/${pid}/canvas/images`, { method: "POST", body: JSON.stringify({ data: dataUrl, mime: "image/jpeg" }) });
  const pos = nextPos(pid);
  setFrames(pid, [...getFrames(pid), { id: newFrameId(), type: "image", imageId: id, time, x: pos.x, y: pos.y, w: 200 }]);
  await saveCanvas(pid);
  // little confirmation thumb in the modal
  const thumbs = document.getElementById("capThumbs");
  if (thumbs) thumbs.innerHTML += `<div style="position:relative;"><img src="${dataUrl}" style="height:56px;border-radius:5px;border:1px solid var(--border);"><span class="chip" style="position:absolute;bottom:2px;left:2px;font-size:9px;">${time}</span></div>`;
}

function renderInspiration(project, editable) {
  const items = project.inspirations
    .map((i) => {
      const insta = isInstagramUrl(i.url);
      const shotCount = (i.shots || []).length;
      return `
    <div class="insp-item ${insta ? "insp-item-embed" : ""}">
      ${instagramEmbedHtml(i.url)}
      <div class="insp-body">
        <div class="insp-platform">${escapeHtml(i.platform || "")}</div>
        ${!insta ? `<a class="insp-url" href="${escapeAttr(i.url)}" target="_blank" rel="noopener">${escapeHtml(i.url)}</a>` : ""}
        <div class="insp-note">${escapeHtml(i.note)}</div>
        <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button class="btn btn-sm" onclick="openShotStudy('${project.id}','${i.id}')">🎬 ${shotCount ? `Shots (${shotCount})` : "Break down shots"}</button>
          ${shotCount ? `<span class="muted" style="font-size:11px;">${(i.shots || []).map((s) => s.time).join(" · ")}</span>` : ""}
        </div>
      </div>
    </div>`;
    })
    .join("");

  return `
    ${renderCanvasBoard(project, editable)}
    <div class="section">
      <div class="section-title">Reference reels &amp; why they work</div>
      ${items || '<div class="empty-state">No inspiration added yet.</div>'}
      ${
        editable
          ? `
      <div class="inline-form">
        <div class="field"><label class="field-label">Platform</label><input type="text" id="insp-platform" placeholder="Instagram"></div>
        <div class="field" style="flex:2"><label class="field-label">URL</label><input type="url" id="insp-url" placeholder="https://..."></div>
      </div>
      <div class="field" style="margin-top:8px;">
        <label class="field-label">What specifically works about it</label>
        <textarea id="insp-note" rows="2" placeholder="Hook timing, edit trick, pacing, whatever made you save it..."></textarea>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" onclick="addInspiration('${project.id}')">+ Add reference</button>
        <button class="btn btn-sm" onclick="pullFromSavedReels('${project.id}')">⚡ Pull my saved reels</button>
        <button class="btn btn-sm" onclick="triggerImport('${project.id}')">⬆ Import CSV</button>
      </div>
      <input type="file" id="importFileInput" accept=".csv,.json" style="display:none;" onchange="handleImportFile('${project.id}', this.files[0])">
      `
          : ""
      }
    </div>
  `;
}

async function addInspiration(id) {
  const platform = document.getElementById("insp-platform").value;
  const url = document.getElementById("insp-url").value;
  const note = document.getElementById("insp-note").value;
  if (!url) return;
  await api(`/projects/${id}/inspirations`, { method: "POST", body: JSON.stringify({ platform, url, note }) });
  await loadProjects();
  render();
}

// ---------- Shot study: break a reel into timestamped shots ----------
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function openShotStudy(projectId, inspId) {
  const project = state.projects.find((p) => p.id === projectId);
  const insp = project.inspirations.find((i) => i.id === inspId);
  state._shotStudy = { projectId, inspId, shots: JSON.parse(JSON.stringify(insp.shots || [])) };
  const insta = isInstagramUrl(insp.url);

  modalRoot.innerHTML = `
    <div class="modal-overlay" onclick="closeModalIfOverlay(event)">
      <div class="modal" style="max-width:760px;">
        <h3>Shot breakdown</h3>
        <p class="muted" style="margin-top:4px;font-size:12.5px;">
          ${insta ? "Instagram embed can't report exact time — type the timestamp as you watch." : ""}
          Study the reference and log each shot: when it happens, what type, and why it works.
        </p>

        <div style="display:flex;gap:16px;margin-top:12px;flex-wrap:wrap;">
          <div style="flex:1;min-width:280px;">
            <div id="shotVideoHost">
              ${insta
                ? `<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;">
                     <iframe src="${escapeAttr(instaEmbedSrc(insp.url))}" style="width:100%;height:460px;border:0;" allowtransparency="true"></iframe>
                   </div>
                   <div style="margin-top:8px;">
                     <button class="btn btn-sm" onclick="document.getElementById('shotUpload').click()">⬆ Upload the video file for exact timestamps</button>
                     <input type="file" id="shotUpload" accept="video/*" style="display:none;" onchange="loadShotVideo(this.files[0])">
                   </div>`
                : `<div class="muted" style="font-size:13px;padding:8px 0;">Upload the reel's video file to capture exact timestamps:</div>
                   <button class="btn btn-sm" onclick="document.getElementById('shotUpload').click()">⬆ Upload video file</button>
                   <input type="file" id="shotUpload" accept="video/*" style="display:none;" onchange="loadShotVideo(this.files[0])">`}
            </div>
          </div>

          <div style="flex:1;min-width:280px;">
            <div class="field">
              <label class="field-label">Timestamp <span id="shotTimeLive" class="muted" style="font-weight:400;"></span></label>
              <div style="display:flex;gap:6px;">
                <input type="text" id="shotTime" placeholder="0:03" style="flex:1;" />
                <button class="btn btn-sm" id="shotGrabBtn" onclick="grabTimestamp()" style="display:none;">⏱ Grab current</button>
              </div>
            </div>
            <div class="field">
              <label class="field-label">Shot type</label>
              <select id="shotType" class="input-sm" style="width:100%;">
                <option value="">— pick —</option>
                ${SHOT_TYPES.map((t) => `<option>${t}</option>`).join("")}
              </select>
            </div>
            <div style="display:flex;gap:8px;">
              <div class="field" style="flex:1;">
                <label class="field-label">Angle</label>
                <select id="shotAngle" class="input-sm" style="width:100%;">
                  <option value="">—</option>
                  ${SHOT_ANGLES.map((t) => `<option>${t}</option>`).join("")}
                </select>
              </div>
              <div class="field" style="flex:1;">
                <label class="field-label">Movement</label>
                <select id="shotMove" class="input-sm" style="width:100%;">
                  <option value="">—</option>
                  ${SHOT_MOVES.map((t) => `<option>${t}</option>`).join("")}
                </select>
              </div>
            </div>
            <div class="field">
              <label class="field-label">What's happening / why it works</label>
              <textarea id="shotNote" rows="2" placeholder="Hook line lands here, tight on face, cuts on the beat..."></textarea>
            </div>
            <button class="btn btn-primary btn-sm" onclick="addShot()">+ Capture this shot</button>
          </div>
        </div>

        <div style="margin-top:16px;">
          <div class="section-title" style="font-size:13px;">Shots logged</div>
          <div id="shotList"></div>
        </div>

        <div class="modal-actions" style="margin-top:14px;">
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveShots()">Save breakdown</button>
        </div>
      </div>
    </div>`;
  renderShotList();
}

// convert an instagram url to its embeddable src
function instaEmbedSrc(url) {
  const m = (url || "").match(/instagram\.com\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
  return m ? `https://www.instagram.com/reel/${m[2]}/embed/captioned/` : url;
}

// when a real video file is loaded, swap in a <video> so we can grab exact timestamps
function loadShotVideo(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  document.getElementById("shotVideoHost").innerHTML = `
    <video id="shotVideo" src="${url}" controls playsinline style="width:100%;border-radius:8px;background:#000;max-height:460px;"></video>`;
  const grab = document.getElementById("shotGrabBtn");
  if (grab) grab.style.display = "inline-block";
  const v = document.getElementById("shotVideo");
  const live = document.getElementById("shotTimeLive");
  v.addEventListener("timeupdate", () => { if (live) live.textContent = "· now at " + fmtTime(v.currentTime); });
}

function grabTimestamp() {
  const v = document.getElementById("shotVideo");
  if (v) document.getElementById("shotTime").value = fmtTime(v.currentTime);
}

function addShot() {
  const time = document.getElementById("shotTime").value.trim();
  const type = document.getElementById("shotType").value;
  const angle = document.getElementById("shotAngle").value;
  const move = document.getElementById("shotMove").value;
  const note = document.getElementById("shotNote").value.trim();
  if (!time && !type) { alert("Add at least a timestamp or a shot type."); return; }
  state._shotStudy.shots.push({ id: "s_" + Date.now(), time: time || "0:00", type, angle, move, note });
  // sort by timestamp (m:ss)
  state._shotStudy.shots.sort((a, b) => toSec(a.time) - toSec(b.time));
  document.getElementById("shotTime").value = "";
  document.getElementById("shotNote").value = "";
  renderShotList();
}
function toSec(t) { const p = String(t).split(":").map(Number); return p.length === 2 ? p[0] * 60 + p[1] : (p[0] || 0); }

function removeShot(id) {
  state._shotStudy.shots = state._shotStudy.shots.filter((s) => s.id !== id);
  renderShotList();
}

function renderShotList() {
  const shots = state._shotStudy.shots;
  document.getElementById("shotList").innerHTML = shots.length
    ? shots.map((s) => `
      <div style="display:flex;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:7px;margin-bottom:6px;align-items:flex-start;">
        <span class="chip" style="font-family:monospace;">${escapeHtml(s.time)}</span>
        <span style="flex:1;min-width:0;">
          <b style="font-size:13px;">${escapeHtml(s.type || "—")}</b>
          ${s.angle ? `<span class="muted" style="font-size:11px;"> · ${escapeHtml(s.angle)}</span>` : ""}
          ${s.move ? `<span class="muted" style="font-size:11px;"> · ${escapeHtml(s.move)}</span>` : ""}
          ${s.note ? `<span style="display:block;font-size:12px;color:var(--ink-soft);margin-top:2px;">${escapeHtml(s.note)}</span>` : ""}
        </span>
        <button class="btn btn-sm" onclick="removeShot('${s.id}')" style="padding:2px 7px;">✕</button>
      </div>`).join("")
    : `<div class="muted" style="font-size:12.5px;padding:6px 0;">No shots captured yet.</div>`;
}

async function saveShots() {
  const { projectId, inspId, shots } = state._shotStudy;
  await api(`/projects/${projectId}/inspirations/${inspId}/shots`, { method: "PATCH", body: JSON.stringify({ shots }) });
  state._shotStudy = null;
  closeModal();
  await loadProjects();
  render();
}



// Direct pull: fetch THIS user's vault + notes from the hub, let them pick which to bring in.
async function pullFromSavedReels(projectId) {
  let vault = [], notes = {};
  try {
    const [vr, nr] = await Promise.all([
      fetch("/api/data/savedreels_vault", { credentials: "include" }),
      fetch("/api/data/savedreels", { credentials: "include" }),
    ]);
    if (vr.status === 401 || nr.status === 401) { window.location.href = "/"; return; }
    const vjson = vr.ok ? await vr.json() : {};
    notes = nr.ok ? await nr.json() : {};
    vault = vjson && vjson.records && Array.isArray(vjson.records.records) ? vjson.records.records : [];
  } catch { alert("Couldn't reach your SAVEDREELS vault. Try again."); return; }

  if (!vault.length) {
    alert("Your SAVEDREELS vault is empty. Open SAVEDREELS first and upload your Instagram export, then come back.");
    return;
  }

  const norm = (u) => (u || "").replace(/\/+$/, "");
  // Prefer reels you've actually annotated — those are the intentional ones. Annotated first.
  const rows = vault.map((r) => {
    const n = notes[norm(r.url)] || {};
    const noteText = [n.why, n.idea].filter(Boolean).join(" — ");
    return {
      url: r.url,
      caption: (r.caption || "").replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim(),
      collection: r.collection || "",
      note: noteText,
      hasNote: !!(n.why || n.idea || n.status),
      status: n.status || "",
    };
  }).sort((a, b) => (b.hasNote - a.hasNote));

  state._pull = { projectId, rows };
  openPullModal();
}

function openPullModal() {
  const { rows } = state._pull;
  const noted = rows.filter((r) => r.hasNote).length;
  const collections = Array.from(new Set(rows.map((r) => r.collection).filter(Boolean))).sort();
  modalRoot.innerHTML = `
    <div class="modal-overlay" onclick="closeModalIfOverlay(event)">
      <div class="modal" style="max-width:640px;">
        <h3>Pull from SAVEDREELS</h3>
        <p class="muted" style="margin-top:4px;">${rows.length} saved reels${noted ? ` · ${noted} with your notes (shown first)` : ""}. Tick the ones to bring in as references.</p>
        <div style="display:flex;gap:8px;margin:12px 0;flex-wrap:wrap;align-items:center;">
          <input id="pullSearch" class="input-sm" placeholder="Search caption / note / collection…" oninput="renderPullList()" style="flex:1;min-width:180px;" />
          <select id="pullCollection" class="input-sm" onchange="renderPullList()">
            <option value="">All collections</option>
            ${collections.map((c) => `<option value="${c.replace(/"/g, "&quot;")}">${c}</option>`).join("")}
          </select>
          <label class="muted" style="font-size:12px;display:flex;gap:5px;align-items:center;">
            <input type="checkbox" id="pullOnlyNoted" onchange="renderPullList()" ${noted ? "checked" : ""}/> only noted
          </label>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <button class="btn btn-sm" onclick="pullSelectAll(true)">Select all shown</button>
          <button class="btn btn-sm" onclick="pullSelectAll(false)">Clear</button>
          <span id="pullCount" class="muted" style="margin-left:auto;font-size:12px;align-self:center;"></span>
        </div>
        <div id="pullList" style="max-height:340px;overflow:auto;border:1px solid var(--border);border-radius:8px;"></div>
        <div class="modal-actions" style="margin-top:14px;">
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="confirmPull()">Add selected</button>
        </div>
      </div>
    </div>`;
  state._pullSelected = new Set(rows.filter((r) => r.hasNote).map((r) => r.url));
  renderPullList();
}

function renderPullList() {
  const { rows } = state._pull;
  const qEl = document.getElementById("pullSearch");
  const s = (qEl?.value || "").trim().toLowerCase();
  const col = document.getElementById("pullCollection")?.value || "";
  const onlyNoted = document.getElementById("pullOnlyNoted")?.checked;
  const sel = state._pullSelected;

  const shown = rows.filter((r) => {
    if (onlyNoted && !r.hasNote) return false;
    if (col && r.collection !== col) return false;
    if (s && !(`${r.caption} ${r.note} ${r.collection}`.toLowerCase().includes(s))) return false;
    return true;
  });

  document.getElementById("pullList").innerHTML = shown.length
    ? shown.map((r) => {
        const id = "pk_" + btoa(unescape(encodeURIComponent(r.url))).replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
        const label = r.caption || r.url;
        return `<label style="display:flex;gap:9px;padding:9px 11px;border-bottom:1px solid var(--border);cursor:pointer;align-items:flex-start;">
          <input type="checkbox" ${sel.has(r.url) ? "checked" : ""} onchange="togglePull('${r.url.replace(/'/g, "\\'")}', this.checked)" style="margin-top:3px;" />
          <span style="flex:1;min-width:0;">
            <span style="font-size:13px;line-height:1.4;">${label.slice(0, 120)}</span>
            ${r.collection ? `<span class="chip" style="margin-left:6px;font-size:10px;">${r.collection}</span>` : ""}
            ${r.note ? `<span style="display:block;font-size:12px;color:var(--amber);margin-top:3px;">✎ ${r.note.slice(0, 140)}</span>` : ""}
          </span>
        </label>`;
      }).join("")
    : `<div class="muted" style="padding:18px;text-align:center;font-size:13px;">Nothing matches.</div>`;
  updatePullCount();
}

function togglePull(url, on) { on ? state._pullSelected.add(url) : state._pullSelected.delete(url); updatePullCount(); }
function pullSelectAll(on) {
  const { rows } = state._pull;
  const s = (document.getElementById("pullSearch")?.value || "").trim().toLowerCase();
  const col = document.getElementById("pullCollection")?.value || "";
  const onlyNoted = document.getElementById("pullOnlyNoted")?.checked;
  rows.forEach((r) => {
    if (onlyNoted && !r.hasNote) return;
    if (col && r.collection !== col) return;
    if (s && !(`${r.caption} ${r.note} ${r.collection}`.toLowerCase().includes(s))) return;
    on ? state._pullSelected.add(r.url) : state._pullSelected.delete(r.url);
  });
  renderPullList();
}
function updatePullCount() {
  const el = document.getElementById("pullCount");
  if (el) el.textContent = `${state._pullSelected.size} selected`;
}

async function confirmPull() {
  const { projectId, rows } = state._pull;
  const sel = state._pullSelected;
  const items = rows.filter((r) => sel.has(r.url)).map((r) => ({
    url: r.url,
    platform: "Instagram",
    note: r.note || (r.caption ? r.caption.slice(0, 160) : ""),
  }));
  if (!items.length) { alert("Tick at least one reel to add."); return; }
  const result = await api(`/projects/${projectId}/inspirations/bulk`, { method: "POST", body: JSON.stringify({ items }) });
  closeModal();
  await loadProjects();
  render();
  state._pull = null; state._pullSelected = null;
  alert(`Added ${result.created} reference${result.created === 1 ? "" : "s"} from your saved reels.`);
}

function triggerImport(id) {
  document.getElementById("importFileInput").click();
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length && r.some((c) => c.trim() !== ""));
}

function guessColumn(headers, candidates) {
  const lower = headers.map((h) => h.toLowerCase());
  for (const cand of candidates) {
    const idx = lower.findIndex((h) => h.includes(cand));
    if (idx !== -1) return idx;
  }
  return -1;
}

async function handleImportFile(projectId, file) {
  if (!file) return;
  const text = await file.text();
  let headers = [];
  let rows = [];

  if (file.name.toLowerCase().endsWith(".json")) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      alert("Couldn't read that JSON file.");
      return;
    }
    let arr = Array.isArray(parsed) ? parsed : parsed.items || parsed.reels || parsed.savedReels || parsed.data || [];
    if (!Array.isArray(arr) || !arr.length) {
      alert("No importable rows found in that file.");
      return;
    }
    headers = Array.from(arr.reduce((set, obj) => { Object.keys(obj || {}).forEach((k) => set.add(k)); return set; }, new Set()));
    rows = arr.map((obj) => headers.map((h) => (obj[h] != null ? String(obj[h]) : "")));
  } else {
    const csvRows = parseCSV(text);
    if (!csvRows.length) {
      alert("That CSV looks empty.");
      return;
    }
    headers = csvRows[0];
    rows = csvRows.slice(1);
  }

  if (!rows.length) {
    alert("No rows to import.");
    return;
  }

  openImportMappingModal(projectId, headers, rows);
}

function openImportMappingModal(projectId, headers, rows) {
  state._import = { headers, rows };
  const urlGuess = guessColumn(headers, ["url", "link", "permalink"]);
  const noteGuess = guessColumn(headers, ["note", "caption", "description", "why"]);
  const platformGuess = guessColumn(headers, ["platform", "source"]);

  const colOptions = (selectedIdx) =>
    `<option value="-1">— none —</option>` +
    headers.map((h, idx) => `<option value="${idx}" ${idx === selectedIdx ? "selected" : ""}>${escapeHtml(h)}</option>`).join("");

  const previewRows = rows.slice(0, 3).map((r) => `<tr>${r.map((c) => `<td>${escapeHtml((c || "").slice(0, 40))}</td>`).join("")}</tr>`).join("");
  const previewHead = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");

  modalRoot.innerHTML = `
    <div class="modal-overlay" onclick="closeModalIfOverlay(event)">
      <div class="modal modal-wide">
        <h3>Import from SAVEDREELS</h3>
        <div style="font-size:12px;color:var(--ink-soft);margin-bottom:14px;">Found ${rows.length} row${rows.length === 1 ? "" : "s"}. Match your columns below — I've guessed where I could.</div>
        <div class="inline-form">
          <div class="field"><label class="field-label">URL column</label><select id="map-url">${colOptions(urlGuess)}</select></div>
          <div class="field"><label class="field-label">Note column</label><select id="map-note">${colOptions(noteGuess)}</select></div>
          <div class="field"><label class="field-label">Platform column</label><select id="map-platform">${colOptions(platformGuess)}</select></div>
        </div>
        <div style="overflow-x:auto;margin-top:14px;border:1px solid var(--border);border-radius:8px;">
          <table class="preview-table">
            <thead><tr>${previewHead}</tr></thead>
            <tbody>${previewRows}</tbody>
          </table>
        </div>
        <div class="modal-actions">
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="confirmImport('${projectId}')">Import ${rows.length} item${rows.length === 1 ? "" : "s"}</button>
        </div>
      </div>
    </div>
  `;
}

async function confirmImport(projectId) {
  const { headers, rows } = state._import;
  const urlIdx = parseInt(document.getElementById("map-url").value, 10);
  const noteIdx = parseInt(document.getElementById("map-note").value, 10);
  const platformIdx = parseInt(document.getElementById("map-platform").value, 10);

  if (urlIdx === -1) {
    alert("Pick a URL column — every inspiration item needs a link.");
    return;
  }

  const items = rows
    .map((r) => ({
      url: r[urlIdx] || "",
      note: noteIdx !== -1 ? r[noteIdx] || "" : "",
      platform: platformIdx !== -1 ? r[platformIdx] || "" : "Instagram",
    }))
    .filter((i) => i.url.trim());

  const result = await api(`/projects/${projectId}/inspirations/bulk`, { method: "POST", body: JSON.stringify({ items }) });
  closeModal();
  await loadProjects();
  render();
  state._import = null;
  alert(`Imported ${result.created} reference${result.created === 1 ? "" : "s"} from SAVEDREELS.`);
}

// ---------- Idea tab ----------
function renderIdea(project, editable) {
  const linked = project.idea.linkedInspirationIds
    .map((iid) => project.inspirations.find((i) => i.id === iid))
    .filter(Boolean);

  return `
    <div class="section">
      <div class="section-title">Raw idea</div>
      ${
        editable
          ? `<textarea id="idea-raw" rows="3">${escapeHtml(project.idea.rawIdea)}</textarea>
             <div style="margin-top:10px;"></div>
             <label class="field-label">Angle / POV for this brand</label>
             <textarea id="idea-angle" rows="2">${escapeHtml(project.idea.angle)}</textarea>
             <button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="saveIdea('${project.id}')">Save</button>`
          : `<div class="block-dialogue" style="font-weight:400;font-size:14px;">${escapeHtml(project.idea.rawIdea) || '<span class="empty-state">No idea written yet.</span>'}</div>
             ${project.idea.angle ? `<div style="margin-top:10px;"><span class="field-label">Angle</span><div>${escapeHtml(project.idea.angle)}</div></div>` : ""}`
      }
    </div>
    <div class="section">
      <div class="section-title">Built on these references</div>
      ${
        linked.length
          ? linked.map((i) => `<div class="insp-item ${isInstagramUrl(i.url) ? "insp-item-embed" : ""}">${instagramEmbedHtml(i.url)}<div class="insp-body"><div class="insp-note">${escapeHtml(i.note)}</div></div></div>`).join("")
          : '<div class="empty-state">No references linked.</div>'
      }
    </div>
  `;
}

async function saveIdea(id) {
  const rawIdea = document.getElementById("idea-raw").value;
  const angle = document.getElementById("idea-angle").value;
  await api(`/projects/${id}/idea`, { method: "PATCH", body: JSON.stringify({ rawIdea, angle }) });
  await loadProjects();
  render();
}

// ---------- Script tab ----------
function renderScript(project, editable) {
  const hooks = project.script.hooks
    .map(
      (h) => `
    <div class="hook-card ${h.selected ? "selected" : ""}">
      ${h.selected ? '<div class="selected-tag">Selected</div>' : ""}
      <div class="hook-version">Version ${h.version}</div>
      <div class="hook-text">${escapeHtml(h.text)}</div>
      ${h.notes ? `<div class="hook-notes">${escapeHtml(h.notes)}</div>` : ""}
      ${editable && !h.selected ? `<button class="btn btn-ghost btn-sm" onclick="selectHook('${project.id}','${h.id}')">Use this one</button>` : ""}
    </div>`
    )
    .join("");

  const blocks = project.script.blocks
    .map((b) => {
      const ref = b.referenceInspirationId ? project.inspirations.find((i) => i.id === b.referenceInspirationId) : null;
      return `
      <div class="block-card">
        <div><span class="block-num">${b.order}</span></div>
        <div class="block-dialogue">${escapeHtml(b.dialogue)}</div>
        <div class="block-tags">
          ${b.shotType ? `<span class="tag">${escapeHtml(b.shotType)}</span>` : ""}
          ${b.angle ? `<span class="tag">${escapeHtml(b.angle)}</span>` : ""}
          ${b.movement ? `<span class="tag">${escapeHtml(b.movement)}</span>` : ""}
          ${b.location ? `<span class="tag">📍 ${escapeHtml(b.location)}</span>` : ""}
        </div>
        ${b.props ? `<div style="font-size:12px;color:var(--ink-soft);">Props/notes: ${escapeHtml(b.props)}</div>` : ""}
        ${b.onScreenText ? `<div style="font-size:12px;color:var(--ink-soft);">On-screen text: ${escapeHtml(b.onScreenText)}</div>` : ""}
        ${ref ? `<div class="block-ref">🔗 Shot reference: ${escapeHtml(ref.note)}</div>` : ""}
      </div>`;
    })
    .join("");

  // Reference panel: every shot the user captured across all inspiration reels.
  const allShots = [];
  project.inspirations.forEach((i) => {
    (i.shots || []).forEach((s) => allShots.push({ ...s, from: i.note || i.platform || i.url, url: i.url, inspId: i.id }));
  });
  const shotRef = allShots.length ? `
    <div class="section" style="background:var(--cream);border:1px solid var(--border);">
      <div class="section-title" style="font-size:13px;display:flex;align-items:center;gap:8px;">
        🎬 Shots you studied <span class="chip">${allShots.length}</span>
        <span class="muted" style="font-weight:400;font-size:11px;">${editable ? "click a shot to fill the block form below" : "reference while you write"}</span>
      </div>
      <div style="display:flex;gap:8px;overflow-x:auto;padding:4px 0;">
        ${allShots.map((s, idx) => `
          <div ${editable ? `onclick="stampShot(${idx})" style="cursor:pointer;"` : ""} class="shot-ref-card" style="flex:0 0 200px;border:1px solid var(--border);border-radius:8px;padding:9px 10px;background:#fff;transition:.12s;">
            <div style="display:flex;gap:6px;align-items:center;">
              <span class="chip" style="font-family:monospace;">${escapeHtml(s.time)}</span>
              <b style="font-size:12.5px;">${escapeHtml(s.type || "—")}</b>
            </div>
            ${(s.angle || s.move) ? `<div class="muted" style="font-size:11px;margin-top:3px;">${[s.angle, s.move].filter(Boolean).map(escapeHtml).join(" · ")}</div>` : ""}
            ${s.note ? `<div style="font-size:11.5px;color:var(--ink-soft);margin-top:4px;line-height:1.4;">${escapeHtml(s.note)}</div>` : ""}
            <div class="muted" style="font-size:10px;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">↪ ${escapeHtml(s.from)}</div>
            ${editable ? `<div style="font-size:10px;color:var(--amber);margin-top:5px;font-weight:600;">+ use in block</div>` : ""}
          </div>`).join("")}
      </div>
    </div>` : "";
  // stash for stampShot to read
  state._scriptShots = allShots;

  return `
    ${shotRef}
    <div class="section">
      <div class="section-title">Hook options</div>
      <div class="hook-list">${hooks || '<div class="empty-state">No hooks written yet.</div>'}</div>
      ${
        editable
          ? `<div class="inline-form" style="margin-top:14px;">
              <div class="field"><label class="field-label">Hook text</label><input type="text" id="hook-text" placeholder="\"...\""></div>
              <div class="field"><label class="field-label">Notes</label><input type="text" id="hook-notes" placeholder="Delivery, tone..."></div>
              <button class="btn btn-primary btn-sm" onclick="addHook('${project.id}')">+ Add hook</button>
            </div>`
          : ""
      }
    </div>
    <div class="section">
      <div class="section-title">Shot-by-shot script</div>
      ${blocks || '<div class="empty-state">No script blocks yet.</div>'}
      ${editable ? renderAddBlockForm(project) : ""}
    </div>
  `;
}

function renderAddBlockForm(project) {
  const refOptions = project.inspirations.map((i) => `<option value="${i.id}">${escapeHtml(i.note.slice(0, 40))}...</option>`).join("");
  return `
    <div style="border-top:1px solid var(--border);margin-top:14px;padding-top:14px;">
      <div class="field"><label class="field-label">Dialogue / VO / action</label><textarea id="block-dialogue" rows="2"></textarea></div>
      <div class="inline-form">
        <div class="field"><label class="field-label">Shot type</label><input type="text" id="block-shottype" placeholder="Close-up"></div>
        <div class="field"><label class="field-label">Angle</label><input type="text" id="block-angle" placeholder="Eye-level"></div>
        <div class="field"><label class="field-label">Movement</label><input type="text" id="block-movement" placeholder="Static"></div>
      </div>
      <div class="inline-form">
        <div class="field"><label class="field-label">Location</label><input type="text" id="block-location" placeholder="Studio"></div>
        <div class="field"><label class="field-label">Props/notes</label><input type="text" id="block-props" placeholder=""></div>
      </div>
      <div class="field"><label class="field-label">On-screen text</label><input type="text" id="block-onscreen" placeholder=""></div>
      <div class="field">
        <label class="field-label">Shot reference (which inspiration is this beat from?)</label>
        <select id="block-ref"><option value="">— none —</option>${refOptions}</select>
      </div>
      <button class="btn btn-primary btn-sm" onclick="addBlock('${project.id}')">+ Add shot to script</button>
    </div>
  `;
}

// Click a captured shot -> fill the block form with its type/angle/movement/note.
function stampShot(idx) {
  const s = (state._scriptShots || [])[idx];
  if (!s) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
  set("block-shottype", s.type || "");
  set("block-angle", s.angle || "");
  set("block-movement", s.move || "");
  // carry the study note into props/notes without clobbering anything already typed
  const props = document.getElementById("block-props");
  if (props) {
    const ref = `ref ${s.time}${s.note ? ": " + s.note : ""}`;
    props.value = props.value.trim() ? props.value + " · " + ref : ref;
  }
  // if this shot came from a known inspiration reel, preselect it in the ref dropdown
  const ref = document.getElementById("block-ref");
  if (ref && s.inspId) { ref.value = s.inspId; }
  // pull focus to the dialogue field so they can type the line for this shot
  const dlg = document.getElementById("block-dialogue");
  if (dlg) { dlg.scrollIntoView({ behavior: "smooth", block: "center" }); dlg.focus(); }
}


async function selectHook(id, hookId) {
  await api(`/projects/${id}/hooks/${hookId}/select`, { method: "POST" });
  await loadProjects();
  render();}

async function addHook(id) {
  const text = document.getElementById("hook-text").value;
  const notes = document.getElementById("hook-notes").value;
  if (!text) return;
  await api(`/projects/${id}/hooks`, { method: "POST", body: JSON.stringify({ text, notes }) });
  await loadProjects();
  render();
}

async function addBlock(id) {
  const dialogue = document.getElementById("block-dialogue").value;
  const shotType = document.getElementById("block-shottype").value;
  const angle = document.getElementById("block-angle").value;
  const movement = document.getElementById("block-movement").value;
  const location = document.getElementById("block-location").value;
  const props = document.getElementById("block-props").value;
  const onScreenText = document.getElementById("block-onscreen").value;
  const referenceInspirationId = document.getElementById("block-ref").value || null;
  if (!dialogue) return;
  await api(`/projects/${id}/blocks`, {
    method: "POST",
    body: JSON.stringify({ dialogue, shotType, angle, movement, location, props, onScreenText, referenceInspirationId }),
  });
  await loadProjects();
  render();
}

// ---------- Shoot tab ----------
function renderShoot(project, editable) {
  const rows = project.shoot.shots
    .map((s) => {
      const block = project.script.blocks.find((b) => b.id === s.blockId);
      if (!block) return "";
      const ref = block.referenceInspirationId ? project.inspirations.find((i) => i.id === block.referenceInspirationId) : null;
      return `
      <div class="shot-row">
        <div class="shot-status">
          ${
            editable
              ? `<select onchange="updateShotStatus('${project.id}','${s.blockId}',this.value)">
                  <option value="pending" ${s.status === "pending" ? "selected" : ""}>Pending</option>
                  <option value="shot" ${s.status === "shot" ? "selected" : ""}>Shot</option>
                  <option value="reshoot" ${s.status === "reshoot" ? "selected" : ""}>Reshoot</option>
                </select>`
              : `<span class="status-badge status-${s.status}">${s.status}</span>`
          }
        </div>
        <div style="flex:1;">
          <div><span class="block-num">${block.order}</span><strong>${escapeHtml(block.dialogue)}</strong></div>
          <div class="block-tags" style="margin-top:8px;">
            ${block.shotType ? `<span class="tag">${escapeHtml(block.shotType)}</span>` : ""}
            ${block.angle ? `<span class="tag">${escapeHtml(block.angle)}</span>` : ""}
            ${block.movement ? `<span class="tag">${escapeHtml(block.movement)}</span>` : ""}
            ${block.location ? `<span class="tag">📍 ${escapeHtml(block.location)}</span>` : ""}
          </div>
          ${ref ? `<div class="block-ref">🎬 Reference: ${escapeHtml(ref.note)} — <a href="${escapeAttr(ref.url)}" target="_blank">${escapeHtml(ref.url)}</a></div>` : ""}
          ${
            editable
              ? `<textarea placeholder="Take notes..." rows="1" style="margin-top:8px;" onblur="updateShotNotes('${project.id}','${s.blockId}',this.value)">${escapeHtml(s.takeNotes)}</textarea>`
              : s.takeNotes
              ? `<div style="font-size:12px;color:var(--ink-soft);margin-top:6px;">Note: ${escapeHtml(s.takeNotes)}</div>`
              : ""
          }
        </div>
      </div>`;
    })
    .join("");

  return `
    <div class="section">
      <div class="section-title">Shoot logistics</div>
      ${
        editable
          ? `<div class="inline-form">
              <div class="field"><label class="field-label">Date</label><input type="date" id="shoot-date" value="${project.shoot.date || ""}"></div>
              <div class="field"><label class="field-label">Location</label><input type="text" id="shoot-location" value="${escapeAttr(project.shoot.location)}"></div>
            </div>
            <div class="field" style="margin-top:8px;"><label class="field-label">Gear/general notes</label><textarea id="shoot-notes" rows="2">${escapeHtml(project.shoot.generalNotes)}</textarea></div>
            <button class="btn btn-primary btn-sm" onclick="saveShootMeta('${project.id}')">Save</button>`
          : `<div><strong>Date:</strong> ${project.shoot.date || "TBD"} &nbsp; <strong>Location:</strong> ${escapeHtml(project.shoot.location) || "TBD"}</div>
             ${project.shoot.generalNotes ? `<div style="margin-top:8px;">${escapeHtml(project.shoot.generalNotes)}</div>` : ""}`
      }
    </div>
    <div class="section">
      <div class="section-title">Shot list — generated straight from the script</div>
      ${rows || '<div class="empty-state">No shots yet — add script blocks first.</div>'}
    </div>
  `;
}

async function saveShootMeta(id) {
  const date = document.getElementById("shoot-date").value;
  const location = document.getElementById("shoot-location").value;
  const generalNotes = document.getElementById("shoot-notes").value;
  await api(`/projects/${id}/shoot-meta`, { method: "PATCH", body: JSON.stringify({ date, location, generalNotes }) });
  await loadProjects();
  render();
}

async function updateShotStatus(id, blockId, status) {
  await api(`/projects/${id}/shots/${blockId}`, { method: "PATCH", body: JSON.stringify({ status }) });
  await loadProjects();
}

async function updateShotNotes(id, blockId, takeNotes) {
  await api(`/projects/${id}/shots/${blockId}`, { method: "PATCH", body: JSON.stringify({ takeNotes }) });
  await loadProjects();
}

// ---------- Edit tab ----------
function renderEdit(project, editable) {
  const shotRecap = project.shoot.shots
    .map((s) => {
      const block = project.script.blocks.find((b) => b.id === s.blockId);
      if (!block) return "";
      return `<div class="shot-row">
        <div class="shot-status"><span class="status-badge status-${s.status}">${s.status}</span></div>
        <div style="flex:1;">
          <div><span class="block-num">${block.order}</span>${escapeHtml(block.dialogue)}</div>
          ${s.takeNotes ? `<div style="font-size:12px;color:var(--ink-soft);margin-top:4px;">${escapeHtml(s.takeNotes)}</div>` : ""}
        </div>
      </div>`;
    })
    .join("");

  const checklist = project.edit.checklist
    .map(
      (c, idx) => `
    <div class="checklist-item ${c.done ? "done" : ""}">
      <input type="checkbox" ${c.done ? "checked" : ""} ${editable ? `onchange="toggleChecklist('${project.id}',${idx},this.checked)"` : "disabled"} />
      <span class="checklist-text">${escapeHtml(c.item)}</span>
    </div>`
    )
    .join("");

  const selectedHook = project.script.hooks.find((h) => h.selected);

  return `
    <div class="section">
      <div class="section-title">Original intent (for reference while cutting)</div>
      ${selectedHook ? `<div><span class="field-label">Hook</span><div class="hook-text">${escapeHtml(selectedHook.text)}</div></div>` : ""}
      ${project.edit.pacingNotes || editable ? `
        <div style="margin-top:10px;">
          <label class="field-label">Pacing notes</label>
          ${editable ? `<textarea id="edit-pacing" rows="2">${escapeHtml(project.edit.pacingNotes)}</textarea>` : `<div>${escapeHtml(project.edit.pacingNotes)}</div>`}
        </div>` : ""}
      <div style="margin-top:10px;">
        <label class="field-label">Music notes</label>
        ${editable ? `<textarea id="edit-music" rows="2">${escapeHtml(project.edit.musicNotes)}</textarea>` : `<div>${escapeHtml(project.edit.musicNotes) || '<span class="empty-state">—</span>'}</div>`}
      </div>
      <div style="margin-top:10px;">
        <label class="field-label">Footage folder link</label>
        ${editable ? `<input type="url" id="edit-footage" value="${escapeAttr(project.edit.footageLink)}">` : `<a href="${escapeAttr(project.edit.footageLink)}" target="_blank">${escapeHtml(project.edit.footageLink) || "—"}</a>`}
      </div>
      ${editable ? `<button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="saveEditMeta('${project.id}')">Save</button>` : ""}
    </div>
    <div class="section">
      <div class="section-title">Shot recap from the shoot</div>
      ${shotRecap || '<div class="empty-state">Nothing shot yet.</div>'}
    </div>
    <div class="section">
      <div class="section-title">Edit checklist</div>
      ${checklist || '<div class="empty-state">No checklist items yet.</div>'}
      ${
        editable
          ? `<div class="inline-form">
              <div class="field"><input type="text" id="checklist-item" placeholder="Add a checklist item..."></div>
              <button class="btn btn-primary btn-sm" onclick="addChecklistItem('${project.id}')">Add</button>
            </div>`
          : ""
      }
    </div>
  `;
}

async function saveEditMeta(id) {
  const pacingNotes = document.getElementById("edit-pacing") ? document.getElementById("edit-pacing").value : undefined;
  const musicNotes = document.getElementById("edit-music").value;
  const footageLink = document.getElementById("edit-footage").value;
  const payload = { musicNotes, footageLink };
  if (pacingNotes !== undefined) payload.pacingNotes = pacingNotes;
  await api(`/projects/${id}/edit-meta`, { method: "PATCH", body: JSON.stringify(payload) });
  await loadProjects();
  render();
}

async function toggleChecklist(id, idx, done) {
  await api(`/projects/${id}/edit-checklist/${idx}`, { method: "PATCH", body: JSON.stringify({ done }) });
  await loadProjects();
}

async function addChecklistItem(id) {
  const item = document.getElementById("checklist-item").value;
  if (!item) return;
  await api(`/projects/${id}/edit-checklist`, { method: "POST", body: JSON.stringify({ item }) });
  await loadProjects();
  render();
}

// ---------- New project modal ----------
document.getElementById("newProjectBtn").addEventListener("click", () => {
  modalRoot.innerHTML = `
    <div class="modal-overlay" onclick="closeModalIfOverlay(event)">
      <div class="modal">
        <h3>New project</h3>
        <div class="field"><label class="field-label">Title</label><input type="text" id="new-title"></div>
        <div class="field"><label class="field-label">Brand</label><input type="text" id="new-brand"></div>
        <div class="modal-actions">
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="createProject()">Create</button>
        </div>
      </div>
    </div>
  `;
});
function closeModal() { modalRoot.innerHTML = ""; }
function closeModalIfOverlay(e) { if (e.target.classList.contains("modal-overlay")) closeModal(); }

async function createProject() {
  const title = document.getElementById("new-title").value;
  const brand = document.getElementById("new-brand").value;
  if (!title) return;
  const project = await api("/projects", { method: "POST", body: JSON.stringify({ title, brand }) });
  closeModal();
  await loadProjects();
  goProject(project.id, "inspiration");
}

// ---------- Role switching ----------
document.getElementById("roleSelect").addEventListener("change", (e) => {
  state.role = e.target.value;
  render();
});

// ---------- Utils ----------
function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

// ---------- Boot ----------
(async function init() {
  await loadProjects();
  render();
})();
