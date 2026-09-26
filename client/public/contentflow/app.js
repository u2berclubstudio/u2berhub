const STAGES = ["channel", "idea", "inspiration", "script", "shoot", "edit", "post"];
const STAGE_LABELS = {
  channel: "Channel",
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
  ideaCategories: [],
  ideaSortField: "date",
  ideaSortDir: "desc",
  ideaSelected: new Set(),
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

async function loadProjectsAndChannels() {
  await Promise.all([loadProjects(), loadChannels()]);
}

async function loadProjects() {
  state.projects = await api("/projects");
}

// ---------- Role permissions ----------
// Which stages a role is allowed to EDIT. Every role can always VIEW every stage (read-only elsewhere).
const EDIT_PERMISSIONS = {
  strategist: ["channel", "idea", "inspiration", "script", "shoot", "edit", "post"],
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
  const brands = Array.from(new Set(state.projects.map((p) => (p.brand || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  app.innerHTML = `
    <div style="margin-bottom:18px;">
      <div style="font-size:22px;font-weight:700;">Pipeline board</div>
      <div style="color:var(--ink-soft);font-size:13px;margin-top:2px;">Every piece of content, one place, full context at every stage.</div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">
      <input id="boardSearch" class="input-sm" placeholder="Search by title…" oninput="renderBoardColumns()" style="flex:1;min-width:200px;" />
      <select id="boardBrandFilter" class="input-sm" onchange="renderBoardColumns()">
        <option value="">All brands</option>
        ${brands.map((b) => `<option value="${escapeAttr(b)}">${escapeHtml(b)}</option>`).join("")}
      </select>
      <label class="muted" style="font-size:11.5px;display:flex;align-items:center;gap:5px;">On date
        <input id="boardDateFilter" type="date" class="input-sm" onchange="renderBoardColumns()" />
      </label>
      <button class="btn btn-sm" onclick="clearBoardFilters()">Clear</button>
      <button class="btn btn-sm" onclick="openGlobalSearch()" style="margin-left:auto;">🔍 Search everything</button>
    </div>
    <div id="boardColumns" class="board-columns"></div>
  `;
  renderBoardColumns();
}

function clearBoardFilters() {
  document.getElementById("boardSearch").value = "";
  document.getElementById("boardBrandFilter").value = "";
  document.getElementById("boardDateFilter").value = "";
  renderBoardColumns();
}

// Every date field worth filtering by: when each stage started, the planned shoot date,
// and the posted date. Returns the labels of whichever ones match the picked date, so the
// card can show *why* it matched (e.g. "Shoot scheduled").
function projectDateMatches(p, dateStr) {
  const labels = [];
  const dates = p.stageDates || {};
  STAGES.forEach((stage) => { if (dates[stage] === dateStr) labels.push(`${STAGE_LABELS[stage]} started`); });
  if ((p.shoot || {}).date === dateStr) labels.push("Shoot scheduled");
  if ((p.post || {}).postedDate === dateStr) labels.push("Posted");
  return labels;
}

// Which role owns getting the CURRENT stage done — mirrors EDIT_PERMISSIONS: videographer
// only edits "shoot", editor only edits "edit", strategist covers everything else.
function stageOwnerRole(stage) {
  if (stage === "shoot") return "videographer";
  if (stage === "edit") return "editor";
  return "strategist";
}
const ROLE_ICON = { strategist: "📋", videographer: "🎥", editor: "✂️" };

function renderBoardColumns() {
  const search = (document.getElementById("boardSearch").value || "").trim().toLowerCase();
  const brand = document.getElementById("boardBrandFilter").value || "";
  const dateFilter = document.getElementById("boardDateFilter").value || "";

  const filtered = state.projects.filter((p) => {
    if (search && !p.title.toLowerCase().includes(search)) return false;
    // trim — brand names can pick up stray leading/trailing spaces when typed,
    // and the dropdown's option values are already trimmed (see renderBoard)
    if (brand && (p.brand || "").trim() !== brand) return false;
    if (dateFilter && !projectDateMatches(p, dateFilter).length) return false;
    return true;
  });

  const cols = STAGES.map((stage) => {
    const items = filtered.filter((p) => p.stage === stage);
    const cards = items
      .map((p) => {
        const dateHits = dateFilter ? projectDateMatches(p, dateFilter) : [];
        const role = stageOwnerRole(p.stage);
        return `
      <div class="card" style="${p.color ? `border-left:4px solid ${escapeAttr(p.color)};` : ""}" onclick="goProject('${p.id}')">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
          <div class="card-brand">${escapeHtml(p.brand || "")}</div>
          <input type="color" class="card-color-swatch" title="Tag this project with a color" value="${p.color || "#E8852B"}"
            onclick="event.stopPropagation()" onchange="event.stopPropagation();setProjectColor('${p.id}', this.value)" />
        </div>
        <div class="card-title">${escapeHtml(p.title)}</div>
        <div class="card-meta">${p.inspirations.length} reference${p.inspirations.length === 1 ? "" : "s"} &middot; ${p.script.blocks.length} shot${p.script.blocks.length === 1 ? "" : "s"}</div>
        <div class="card-owner" title="Owns the ${STAGE_LABELS[p.stage]} stage">${ROLE_ICON[role]} ${roleLabel(role)} — ${STAGE_LABELS[p.stage]} pending</div>
        ${dateHits.length ? `<div class="card-date-hit">📅 ${dateHits.map(escapeHtml).join(", ")}</div>` : ""}
        ${pipelineDots(p.stage)}
      </div>`;
      })
      .join("");
    return `
      <div class="board-col">
        <div class="board-col-title">${STAGE_LABELS[stage]} <span style="opacity:.5">(${items.length})</span></div>
        ${cards || '<div class="empty-state">—</div>'}
      </div>`;
  }).join("");

  document.getElementById("boardColumns").innerHTML = cols;
}

async function setProjectColor(pid, color) {
  const p = getProject(pid);
  if (p) p.color = color; // optimistic, same pattern as the idea race-condition fix
  await api(`/projects/${pid}`, { method: "PATCH", body: JSON.stringify({ color }) });
  renderBoardColumns();
}

function pipelineDots(stage) {
  const idx = STAGES.indexOf(stage);
  return `<div class="pipeline-progress">${STAGES.map((s, i) => `<div class="pip-dot ${i <= idx ? "done" : ""}"></div>`).join("")}</div>`;
}

// ---------- Global content search ----------
// Flatten every text field worth searching, across every project and every stage,
// into one list of {projectId, projectTitle, section, sectionLabel, text, jump}.
// jump describes how to get there: which tab to open, and (for ideas/scripts) which
// specific item to land on once there.
function buildSearchIndex() {
  const entries = [];
  const add = (p, section, sectionLabel, text, jump) => {
    const t = (text || "").toString().trim();
    if (t) entries.push({ projectId: p.id, projectTitle: p.title, brand: p.brand, section, sectionLabel, text: t, jump });
  };

  state.projects.forEach((p) => {
    // Idea
    (p.ideas || []).forEach((idea) => {
      add(p, "idea", "Idea", idea.text, { tab: "idea", ideaId: idea.id });
      const cols = p.ideaColumns || [];
      Object.entries(idea.customValues || {}).forEach(([colId, val]) => {
        const col = cols.find((c) => c.id === colId);
        add(p, "idea", `Idea · ${col ? col.name : "column"}`, val, { tab: "idea", ideaId: idea.id });
      });
    });
    // Inspiration
    (p.inspirations || []).forEach((insp) => {
      add(p, "inspiration", "Inspiration", insp.note, { tab: "inspiration" });
      add(p, "inspiration", "Inspiration · URL", insp.url, { tab: "inspiration" });
      (insp.reasons || []).forEach((r) => add(p, "inspiration", "Inspiration · why saved", r, { tab: "inspiration" }));
      (insp.shots || []).forEach((s) => add(p, "inspiration", "Inspiration · shot note", s.note, { tab: "inspiration" }));
    });
    // Script
    (p.scripts || []).forEach((sc) => {
      add(p, "script", `Script · ${sc.title}`, sc.title, { tab: "script", scriptId: sc.id });
      (sc.hooks || []).forEach((h) => {
        add(p, "script", `Script · ${sc.title} · hook`, h.text, { tab: "script", scriptId: sc.id });
        add(p, "script", `Script · ${sc.title} · hook notes`, h.notes, { tab: "script", scriptId: sc.id });
      });
      (sc.blocks || []).forEach((b) => {
        add(p, "script", `Script · ${sc.title} · shot ${b.order || ""}`, b.dialogue, { tab: "script", scriptId: sc.id });
        add(p, "script", `Script · ${sc.title} · shot ${b.order || ""} notes`, b.props, { tab: "script", scriptId: sc.id });
        add(p, "script", `Script · ${sc.title} · on-screen text`, b.onScreenText, { tab: "script", scriptId: sc.id });
      });
    });
    // Shoot
    add(p, "shoot", "Shoot · notes", (p.shoot || {}).generalNotes, { tab: "shoot" });
    add(p, "shoot", "Shoot · location", (p.shoot || {}).location, { tab: "shoot" });
    ((p.shoot || {}).shots || []).forEach((s) => add(p, "shoot", "Shoot · take notes", s.takeNotes, { tab: "shoot" }));
    // Edit
    add(p, "edit", "Edit · pacing notes", (p.edit || {}).pacingNotes, { tab: "edit" });
    add(p, "edit", "Edit · music notes", (p.edit || {}).musicNotes, { tab: "edit" });
    ((p.edit || {}).checklist || []).forEach((c) => add(p, "edit", "Edit · checklist", c.item, { tab: "edit" }));
    // Post
    add(p, "post", "Post · notes", (p.post || {}).notes, { tab: "post" });
  });
  return entries;
}

function openGlobalSearch() {
  modalRoot.innerHTML = `
    <div class="modal-overlay" onclick="closeModalIfOverlay(event)">
      <div class="modal modal-wide">
        <h3>Search everything</h3>
        <p class="muted" style="margin-top:4px;font-size:12.5px;">Searches every project's Idea, Inspiration, Script, Shoot, Edit and Post text.</p>
        <input type="text" id="globalSearchInput" placeholder="Type a word…" style="width:100%;margin-top:10px;" oninput="runGlobalSearch()" />
        <div id="globalSearchResults" style="margin-top:14px;max-height:55vh;overflow-y:auto;"></div>
        <div class="modal-actions" style="margin-top:14px;">
          <button class="btn" onclick="closeModal()">Close</button>
        </div>
      </div>
    </div>`;
  document.getElementById("globalSearchInput").focus();
  runGlobalSearch();
}

function highlightSnippet(text, query) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escapeHtml(text.length > 140 ? text.slice(0, 140) + "…" : text);
  const pad = 50;
  const start = Math.max(0, idx - pad);
  const end = Math.min(text.length, idx + query.length + pad);
  const before = escapeHtml((start > 0 ? "…" : "") + text.slice(start, idx));
  const match = escapeHtml(text.slice(idx, idx + query.length));
  const after = escapeHtml(text.slice(idx + query.length, end) + (end < text.length ? "…" : ""));
  return `${before}<mark>${match}</mark>${after}`;
}

function runGlobalSearch() {
  const query = (document.getElementById("globalSearchInput").value || "").trim();
  const host = document.getElementById("globalSearchResults");
  if (!query) { host.innerHTML = `<div class="muted" style="font-size:12.5px;padding:6px 0;">Start typing to search across every project.</div>`; return; }

  const q = query.toLowerCase();
  const matches = buildSearchIndex().filter((e) => e.text.toLowerCase().includes(q));
  state._searchResults = matches;

  if (!matches.length) { host.innerHTML = `<div class="muted" style="font-size:12.5px;padding:6px 0;">No matches for "${escapeHtml(query)}".</div>`; return; }

  host.innerHTML = matches.map((m, i) => `
    <div class="search-result" onclick="jumpToSearchResult(${i})">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <b style="font-size:13px;">${escapeHtml(m.projectTitle)}</b>
        ${m.brand ? `<span class="muted" style="font-size:11px;">${escapeHtml(m.brand)}</span>` : ""}
        <span class="tag" style="margin-left:auto;">${escapeHtml(m.sectionLabel)}</span>
      </div>
      <div style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;">${highlightSnippet(m.text, query)}</div>
    </div>`).join("");
}

// goProject() itself doesn't await its internal render(), so a setTimeout after it can't
// reliably know the detail page has actually loaded — set state directly and await render()
// here instead, then it's safe to layer the idea modal on top.
async function jumpToSearchResult(i) {
  const m = state._searchResults[i];
  if (!m) return;
  closeModal();
  if (m.jump.scriptId) state.openScriptId = m.jump.scriptId;
  state.currentProjectId = m.projectId;
  state.activeTab = m.jump.tab;
  await render();
  if (m.jump.ideaId) openIdeaNote(m.projectId, m.jump.ideaId);
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
        <a class="btn btn-sm" href="/api/contentflow/projects/${project.id}/pdf" target="_blank" rel="noopener">⬇ Export PDF</a>
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
  if (state.activeTab === "channel") body = renderChannel(project, editable);
  else if (state.activeTab === "inspiration") body = renderInspiration(project, editable);
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
const SAVE_REASONS = ["Hook", "Story", "Editing", "Camera", "Transition", "Acting", "Music", "CTA", "Concept"];
const SHOT_TYPES = ["Extreme close-up", "Close-up", "Medium close-up", "Medium", "Medium-wide", "Wide", "Extreme-wide / establishing"];
const SHOT_ANGLES = ["Eye-level", "Low angle", "High angle", "Dutch / tilted", "Overhead / top-down"];
const SHOT_MOVES = ["Static", "Handheld", "Pan", "Tilt", "Push in", "Pull out", "Snap zoom", "Whip / whip-pan", "Tracking / follow", "Orbit"];
// Narrative-role vocabulary for the "teaching breakdown" view — matches the Reel
// Deconstructor extension's own taxonomy.role, so imported shots need no remapping.
const SHOT_ROLES = ["Hook", "Context / setup", "Build", "Proof", "Payoff", "Reset attention", "CTA"];

// Reel Deconstructor's taxonomy uses slightly different wording than ContentFlow's own
// dropdowns for angle/movement (size matches exactly). These map an imported tag to the
// closest ContentFlow option; an unmappable/unknown source value comes through blank
// rather than forcing a misleading guess.
const RD_ANGLE_MAP = {
  "Eye-level": "Eye-level", "High angle": "High angle", "Low angle": "Low angle",
  "Overhead / top-down": "Overhead / top-down", "Dutch / tilted": "Dutch / tilted",
  "POV": "Eye-level",
};
const RD_MOVE_MAP = {
  "Static": "Static", "Pan / tilt": "Pan", "Zoom / push-in": "Push in",
  "Handheld": "Handheld", "Follow / tracking": "Tracking / follow", "Can't tell": "",
};

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
        <div class="reason-row">
          <span class="reason-lbl">Why saved:</span>
          ${SAVE_REASONS.map((r) => {
            const on = (i.reasons || []).includes(r);
            return `<button class="reason-chip ${on ? "on" : ""}" ${editable ? `onclick="toggleReason('${project.id}','${i.id}','${r}')"` : "disabled"}>${r}</button>`;
          }).join("")}
        </div>
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

async function toggleReason(pid, inspId, reason) {
  const project = getProject(pid);
  const insp = project.inspirations.find((x) => x.id === inspId);
  const cur = insp.reasons || [];
  const next = cur.includes(reason) ? cur.filter((r) => r !== reason) : [...cur, reason];
  await api(`/projects/${pid}/inspirations/${inspId}/reasons`, { method: "PATCH", body: JSON.stringify({ reasons: next }) });
  await loadProjects(); render();
}

// ---------- Shot study: break a reel into timestamped shots ----------
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function openShotStudy(projectId, inspId) {
  state._shotStudy = { projectId, inspId, shots: JSON.parse(JSON.stringify(getProject(projectId).inspirations.find((i) => i.id === inspId).shots || [])), view: "timeline", maximized: false };
  renderShotStudyModal();
}

// Rebuild the shot-breakdown modal from the current state._shotStudy — used both for the
// initial open and for the maximize/restore toggle, so in-progress (not-yet-saved) shots
// are never lost when the modal resizes.
function renderShotStudyModal() {
  const { projectId, inspId, maximized } = state._shotStudy;
  const project = state.projects.find((p) => p.id === projectId);
  const insp = project.inspirations.find((i) => i.id === inspId);
  const insta = isInstagramUrl(insp.url);

  modalRoot.innerHTML = `
    <div class="modal-overlay" onclick="closeModalIfOverlay(event)">
      <div class="modal ${maximized ? "maximized" : ""}" style="max-width:${maximized ? "none" : "760px"};">
        <div class="sticky-note-topbar">
          <h3 style="margin:0;">Shot breakdown</h3>
          <div class="sticky-note-tools">
            <button type="button" title="${maximized ? "Restore" : "Open full page"}" onclick="toggleShotStudySize(${!maximized})">${maximized ? "⤡" : "⤢"}</button>
            <button type="button" title="Close" onclick="closeModal()">✕</button>
          </div>
        </div>
        <p class="muted" style="margin-top:4px;font-size:12.5px;">
          ${insta ? "Instagram embed can't report exact time — type the timestamp as you watch." : ""}
          Study the reference and log each shot: when it happens, what type, and why it works.
        </p>

        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;padding:10px;border:1px dashed var(--border);border-radius:8px;background:var(--amber-light,#FDF3E7);">
          <span style="font-size:12px;font-weight:600;">Already ran this through Reel Deconstructor?</span>
          <button class="btn btn-sm" onclick="document.getElementById('rdZipUpload').click()">📦 Import from .zip</button>
          <input type="file" id="rdZipUpload" accept=".zip" style="display:none;" onchange="importShotsFromZip(this.files[0])">
          <button class="btn btn-sm" onclick="document.getElementById('rdPdfUpload').click()">📄 Import from PDF</button>
          <input type="file" id="rdPdfUpload" accept=".pdf" style="display:none;" onchange="importShotsFromPdf(this.files[0])">
          <span id="rdImportStatus" class="muted" style="font-size:11.5px;"></span>
        </div>

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
            <div class="field">
              <label class="field-label">Story role <span class="muted" style="font-weight:400;">(for the teaching view)</span></label>
              <select id="shotRole" class="input-sm" style="width:100%;">
                <option value="">—</option>
                ${SHOT_ROLES.map((t) => `<option>${t}</option>`).join("")}
              </select>
            </div>
            <button class="btn btn-primary btn-sm" onclick="addShot()">+ Capture this shot</button>
          </div>
        </div>

        <div style="margin-top:16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div class="section-title" style="font-size:13px;">Shots logged</div>
            <div class="seg-toggle" style="display:flex;gap:2px;border:1px solid var(--border);border-radius:6px;overflow:hidden;">
              <button type="button" class="seg-btn ${state._shotStudy.view === "timeline" ? "active" : ""}" onclick="setShotStudyView('timeline')">Timeline</button>
              <button type="button" class="seg-btn ${state._shotStudy.view === "teaching" ? "active" : ""}" onclick="setShotStudyView('teaching')">Teaching breakdown</button>
            </div>
          </div>
          <div id="shotList" style="${maximized ? "max-height:42vh;overflow-y:auto;" : ""}"></div>
        </div>

        <div class="modal-actions" style="margin-top:14px;">
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveShots()">Save breakdown</button>
        </div>
      </div>
    </div>`;
  renderShotList();
}

// Switch the shot-study modal between compact and full-page. Any shot already captured
// (in state._shotStudy.shots) survives automatically since we render from that state
// object, not from the server — but a draft still sitting in the capture-form fields
// (not yet "+ Capture this shot") would otherwise be wiped by the re-render, so it's
// read out and restored after.
function toggleShotStudySize(maximized) {
  const draft = ["shotTime", "shotType", "shotAngle", "shotMove", "shotNote", "shotRole"].reduce((acc, id) => {
    const el = document.getElementById(id);
    acc[id] = el ? el.value : "";
    return acc;
  }, {});
  state._shotStudy.maximized = maximized;
  renderShotStudyModal();
  Object.entries(draft).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el && val) el.value = val;
  });
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
  const role = document.getElementById("shotRole").value;
  if (!time && !type) { alert("Add at least a timestamp or a shot type."); return; }
  state._shotStudy.shots.push({ id: "s_" + Date.now(), time: time || "0:00", type, angle, move, note, role });
  // sort by timestamp (m:ss)
  state._shotStudy.shots.sort((a, b) => toSec(a.time) - toSec(b.time));
  document.getElementById("shotTime").value = "";
  document.getElementById("shotNote").value = "";
  document.getElementById("shotRole").value = "";
  renderShotList();
}
function toSec(t) { const p = String(t).split(":").map(Number); return p.length === 2 ? p[0] * 60 + p[1] : (p[0] || 0); }

function removeShot(id) {
  state._shotStudy.shots = state._shotStudy.shots.filter((s) => s.id !== id);
  renderShotList();
}

function setShotStudyView(view) {
  state._shotStudy.view = view;
  const seg = document.querySelector(".seg-toggle");
  if (seg) seg.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.textContent.trim() === (view === "timeline" ? "Timeline" : "Teaching breakdown")));
  renderShotList();
}

function shotRowHtml(s) {
  return `
    <div style="display:flex;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:7px;margin-bottom:6px;align-items:flex-start;">
      <span class="chip" style="font-family:monospace;">${escapeHtml(s.time)}</span>
      <span style="flex:1;min-width:0;">
        <b style="font-size:13px;">${escapeHtml(s.type || "—")}</b>
        ${s.angle ? `<span class="muted" style="font-size:11px;"> · ${escapeHtml(s.angle)}</span>` : ""}
        ${s.move ? `<span class="muted" style="font-size:11px;"> · ${escapeHtml(s.move)}</span>` : ""}
        ${s.note ? `<span style="display:block;font-size:12px;color:var(--ink-soft);margin-top:2px;">${escapeHtml(s.note)}</span>` : ""}
      </span>
      <button class="btn btn-sm" onclick="removeShot('${s.id}')" style="padding:2px 7px;">✕</button>
    </div>`;
}

function renderShotList() {
  const shots = state._shotStudy.shots;
  const host = document.getElementById("shotList");
  if (!shots.length) { host.innerHTML = `<div class="muted" style="font-size:12.5px;padding:6px 0;">No shots captured yet.</div>`; return; }

  if (state._shotStudy.view === "teaching") {
    const groups = SHOT_ROLES.map((role) => ({ role, shots: shots.filter((s) => s.role === role) })).filter((g) => g.shots.length);
    const ungrouped = shots.filter((s) => !s.role);
    if (ungrouped.length) groups.push({ role: "Ungrouped", shots: ungrouped });
    host.innerHTML = groups.map((g) => `
      <div style="margin-bottom:12px;">
        <div style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--amber-dark,#C96A18);margin-bottom:6px;">${escapeHtml(g.role)}</div>
        ${g.shots.map(shotRowHtml).join("")}
      </div>`).join("");
  } else {
    host.innerHTML = shots.map(shotRowHtml).join("");
  }
}

async function saveShots() {
  const { projectId, inspId, shots } = state._shotStudy;
  await api(`/projects/${projectId}/inspirations/${inspId}/shots`, { method: "PATCH", body: JSON.stringify({ shots }) });
  state._shotStudy = null;
  closeModal();
  await loadProjects();
  render();
}

// ---------- Reel Deconstructor import ----------
// Turn one raw reel.json shot (Reel Deconstructor's schema) into a ContentFlow shot.
// Angle/movement get mapped to the closest ContentFlow dropdown option; shot size uses
// the same wording in both tools so it passes straight through. Role tags import as-is —
// SHOT_ROLES was deliberately defined to match Reel Deconstructor's own taxonomy.role.
function rdShotToContentFlowShot(raw, idPrefix) {
  const tags = raw.tags || {};
  const size = SHOT_TYPES.includes(tags.size) ? tags.size : "";
  const angle = RD_ANGLE_MAP[tags.angle] ?? "";
  const move = RD_MOVE_MAP[tags.movement] ?? "";
  const role = SHOT_ROLES.includes(tags.role) ? tags.role : "";
  const note = (raw.note || "").trim() || (raw.dialogue || "").trim();
  return {
    id: `${idPrefix}_${raw.n ?? Math.random().toString(36).slice(2, 8)}`,
    time: fmtTime(raw.start || 0),
    type: size, angle, move, role,
    note: note.length > 300 ? note.slice(0, 297) + "…" : note,
  };
}

function mergeImportedShots(imported, statusLabel) {
  if (!imported.length) { setImportStatus("Nothing to import — no shots found."); return; }
  state._shotStudy.shots = state._shotStudy.shots.concat(imported);
  state._shotStudy.shots.sort((a, b) => toSec(a.time) - toSec(b.time));
  renderShotList();
  setImportStatus(`Imported ${imported.length} shots ${statusLabel}. Review below, then Save breakdown.`);
}

function setImportStatus(msg) {
  const el = document.getElementById("rdImportStatus");
  if (el) el.textContent = msg;
}

async function importShotsFromZip(file) {
  if (!file) return;
  setImportStatus("Reading zip…");
  try {
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const entry = Object.keys(zip.files).find((name) => /(^|\/)reel\.json$/i.test(name));
    if (!entry) { setImportStatus("Couldn't find reel.json inside that zip."); return; }
    const json = JSON.parse(await zip.files[entry].async("string"));
    const shots = Array.isArray(json.shots) ? json.shots : [];
    const imported = shots.map((s) => rdShotToContentFlowShot(s, "rdzip"));
    mergeImportedShots(imported, "from the zip");
  } catch (e) {
    setImportStatus("Couldn't read that zip: " + e.message);
  } finally {
    document.getElementById("rdZipUpload").value = "";
  }
}

// PDF fallback: the storyboard PDF has no taxonomy tags (those live only in reel.json),
// so this recovers timestamps + dialogue-as-note only — type/angle/movement/role are
// left for the user to fill in by hand after import.
async function importShotsFromPdf(file) {
  if (!file) return;
  setImportStatus("Reading PDF…");
  try {
    if (window.pdfjsLib && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let fullText = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      fullText += content.items.map((it) => it.str).join(" ") + "\n";
    }
    // "SHOT 01   0:00.00 – 0:03.00 · 3.00s   <dialogue text until the next SHOT marker>"
    const re = /SHOT\s+(\d+)\s+([\d:.]+)\s*–\s*[\d:.]+\s*·\s*[\d.]+s\s*(.*?)(?=SHOT\s+\d+\s+[\d:.]+\s*–|$)/gs;
    const imported = [];
    let m;
    while ((m = re.exec(fullText))) {
      const [, n, start, dialogue] = m;
      const sec = start.split(":").reduce((acc, part) => acc * 60 + parseFloat(part), 0);
      const note = dialogue.trim().replace(/\s+/g, " ");
      imported.push({ id: `rdpdf_${n}`, time: fmtTime(sec), type: "", angle: "", move: "", role: "", note: note.length > 300 ? note.slice(0, 297) + "…" : note });
    }
    mergeImportedShots(imported, "from the PDF");
  } catch (e) {
    setImportStatus("Couldn't read that PDF: " + e.message);
  } finally {
    document.getElementById("rdPdfUpload").value = "";
  }
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

// ---------- Channel + pillars ----------
// A quick reference for people writing a pillar's "purpose" for the first time —
// tapping one drops the label into the textarea so they just finish the sentence.
const PURPOSE_TYPES = [
  { id: "educate", label: "Educate", desc: "Teaches the audience something useful — a how-to, a fact, a framework." },
  { id: "entertain", label: "Entertain", desc: "Pure enjoyment — comedy, drama, relatable moments. No lesson required." },
  { id: "inspire", label: "Inspire", desc: "Motivates or shifts mindset — transformation stories, big-picture ideas." },
  { id: "trust", label: "Build trust", desc: "Shows expertise, behind-the-scenes, or process — makes you credible." },
  { id: "sell", label: "Drive sales", desc: "Directly promotes a product/service/offer with a clear CTA." },
  { id: "community", label: "Community", desc: "Engages the audience directly — replies, polls, UGC, shoutouts." },
];

function renderChannel(project, editable) {
  const chans = state.channels || [];
  const ch = chans.find((c) => c.id === project.channelId);
  const pillars = ch ? (ch.pillars || []) : [];
  const chosen = project.pillarIds || [];

  return `
    <div class="section">
      <div class="section-title">Channel</div>
      <p class="muted" style="font-size:12.5px;margin:-4px 0 12px;">Which channel is this for? Pillars are remembered per channel, so you only ever type them once.</p>
      ${editable ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <select id="ch-select" class="input-sm" style="min-width:220px;" onchange="setChannel('${project.id}', this.value)">
            <option value="">— pick a channel —</option>
            ${chans.map((c) => `<option value="${c.id}" ${c.id === project.channelId ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
          </select>
          <button class="btn btn-sm" onclick="addChannel('${project.id}')">+ New channel</button>
        </div>`
        : `<div style="font-size:15px;font-weight:600;">${ch ? escapeHtml(ch.name) : '<span class="empty-state">No channel set.</span>'}</div>`}
    </div>

    <div class="section">
      <div class="section-title">Content pillars</div>
      ${!ch ? '<div class="empty-state">Pick a channel first.</div>' : `
        <p class="muted" style="font-size:12.5px;margin:-4px 0 12px;">Tick every pillar this video belongs to. Months from now this is what tells you which kind of content actually worked.</p>
        <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px;">
          ${pillars.length ? pillars.map((pl) => {
            const on = chosen.includes(pl.id);
            return `<span class="pillar-chip-wrap">
              <button class="pillar-chip ${on ? "on" : ""}" ${editable ? `onclick="togglePillar('${project.id}','${pl.id}')"` : "disabled"}>${escapeHtml(pl.name)}</button>
              <button class="pillar-edit-btn" title="Purpose &amp; examples" onclick="openPillarEditor('${project.id}','${ch.id}','${pl.id}')">✎</button>
            </span>`;
          }).join("") : '<span class="empty-state">No pillars on this channel yet.</span>'}
        </div>
        ${editable ? `<button class="btn btn-sm" onclick="addPillar('${project.id}','${ch.id}')">+ New pillar</button>` : ""}
      `}
    </div>`;
}

async function loadChannels() {
  try { const r = await api("/channels"); state.channels = r.channels || []; }
  catch { state.channels = []; }
}
async function setChannel(pid, channelId) {
  await api(`/projects/${pid}/channel`, { method: "PATCH", body: JSON.stringify({ channelId, pillarIds: [] }) });
  await loadProjects(); render();
}
async function addChannel(pid) {
  const name = prompt("Channel name (e.g. U2berClub Instagram):");
  if (!name || !name.trim()) return;
  const r = await api("/channels", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
  await loadChannels();
  await api(`/projects/${pid}/channel`, { method: "PATCH", body: JSON.stringify({ channelId: r.channel.id, pillarIds: [] }) });
  await loadProjects(); render();
}
async function addPillar(pid, channelId) {
  const name = prompt("Pillar name (e.g. Mockumentary skits):");
  if (!name || !name.trim()) return;
  const r = await api(`/channels/${channelId}/pillars`, { method: "POST", body: JSON.stringify({ name: name.trim() }) });
  await loadChannels(); render();
  // jump straight into the editor so purpose + examples get filled in right away
  openPillarEditor(pid, channelId, r.pillar.id);
}
async function togglePillar(pid, pillarId) {
  const project = getProject(pid);
  const cur = project.pillarIds || [];
  const next = cur.includes(pillarId) ? cur.filter((x) => x !== pillarId) : [...cur, pillarId];
  await api(`/projects/${pid}/channel`, { method: "PATCH", body: JSON.stringify({ pillarIds: next }) });
  await loadProjects(); render();
}

// ---- pillar editor: purpose (why) + a growable list of examples ----
function openPillarEditor(pid, channelId, pillarId) {
  const ch = (state.channels || []).find((c) => c.id === channelId);
  const pl = ch ? (ch.pillars || []).find((p) => p.id === pillarId) : null;
  if (!pl) return;
  state._editPillar = { pid, channelId, pillarId };
  modalRoot.innerHTML = `
    <div class="modal-overlay" onclick="closeModalIfOverlay(event)">
      <div class="modal modal-wide">
        <h3>Pillar details</h3>
        <div class="field"><label class="field-label">Name</label>
          <input id="pl-name" class="input-sm" style="width:100%;" value="${escapeAttr(pl.name)}"></div>

        <div class="field">
          <label class="field-label">Purpose — why does this pillar exist?</label>
          <p class="muted" style="font-size:11.5px;margin:2px 0 6px;">Tap a type to drop it in, then finish the sentence in your own words.</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
            ${PURPOSE_TYPES.map((t) => `<button type="button" class="chip-btn" title="${escapeAttr(t.desc)}" onclick="insertPurposeType('${t.label}')">${t.label}</button>`).join("")}
          </div>
          <textarea id="pl-purpose" rows="3" placeholder="e.g. Educate — teach one editing trick every episode so viewers trust us as the go-to source.">${escapeHtml(pl.purpose || "")}</textarea>
        </div>

        <div class="field">
          <label class="field-label">Examples — what kind of content fits here?</label>
          <p class="muted" style="font-size:11.5px;margin:2px 0 6px;">Add a few so anyone on the team knows what counts, no guessing.</p>
          <div id="pl-examples-list">${renderPillarExamples(pl)}</div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <input id="pl-new-example" class="input-sm" style="flex:1;" placeholder="e.g. 'We tried X for 30 days' format" onkeydown="if(event.key==='Enter'){event.preventDefault();addPillarExample();}">
            <button class="btn btn-sm" onclick="addPillarExample()">+ Add</button>
          </div>
        </div>

        <div class="modal-actions" style="margin-top:14px;">
          <button class="btn" style="color:var(--red);" onclick="deletePillar('${pid}','${channelId}','${pillarId}')">Delete pillar</button>
          <div style="flex:1;"></div>
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="savePillarEdit()">Save</button>
        </div>
      </div>
    </div>`;
}
function renderPillarExamples(pl) {
  const examples = pl.examples || [];
  if (!examples.length) return '<div class="empty-state" style="padding:10px 0;">No examples yet.</div>';
  return examples.map((ex) => `
    <div class="example-row" data-exid="${ex.id}">
      <span>${escapeHtml(ex.text)}</span>
      <button class="icon-btn" title="Remove" onclick="deletePillarExample('${ex.id}')">✕</button>
    </div>`).join("");
}
function insertPurposeType(label) {
  const el = document.getElementById("pl-purpose");
  const prefix = el.value.trim() ? el.value.trim() + "  " : "";
  el.value = prefix + label + " — ";
  el.focus();
  el.selectionStart = el.selectionEnd = el.value.length;
}
async function addPillarExample() {
  const { channelId, pillarId } = state._editPillar;
  const input = document.getElementById("pl-new-example");
  const text = input.value.trim();
  if (!text) return;
  await api(`/channels/${channelId}/pillars/${pillarId}/examples`, { method: "POST", body: JSON.stringify({ text }) });
  await loadChannels();
  const ch = (state.channels || []).find((c) => c.id === channelId);
  const pl = ch.pillars.find((p) => p.id === pillarId);
  document.getElementById("pl-examples-list").innerHTML = renderPillarExamples(pl);
  input.value = "";
  input.focus();
}
async function deletePillarExample(exampleId) {
  const { channelId, pillarId } = state._editPillar;
  await api(`/channels/${channelId}/pillars/${pillarId}/examples/${exampleId}`, { method: "DELETE" });
  await loadChannels();
  const ch = (state.channels || []).find((c) => c.id === channelId);
  const pl = ch.pillars.find((p) => p.id === pillarId);
  document.getElementById("pl-examples-list").innerHTML = renderPillarExamples(pl);
}
async function savePillarEdit() {
  const { channelId, pillarId } = state._editPillar;
  const name = document.getElementById("pl-name").value.trim();
  const purpose = document.getElementById("pl-purpose").value;
  if (!name) { alert("Pillar needs a name."); return; }
  await api(`/channels/${channelId}/pillars/${pillarId}`, { method: "PATCH", body: JSON.stringify({ name, purpose }) });
  await loadChannels();
  state._editPillar = null;
  closeModal();
  render();
}
async function deletePillar(pid, channelId, pillarId) {
  if (!confirm("Delete this pillar? This removes it from every project on this channel.")) return;
  await api(`/channels/${channelId}/pillars/${pillarId}`, { method: "DELETE" });
  await loadChannels();
  state._editPillar = null;
  closeModal();
  await loadProjects(); render();
}

// ---------- Idea tab: categorized, sortable table + custom columns ----------
async function loadIdeaCategories() {
  try { const r = await api("/idea-categories"); state.ideaCategories = r.categories || []; }
  catch { state.ideaCategories = []; }
}
function categoryName(id) {
  const c = state.ideaCategories.find((x) => x.id === id);
  return c ? c.name : "";
}
function sortedIdeas(project) {
  const ideas = [...(project.ideas || [])];
  const field = state.ideaSortField, dir = state.ideaSortDir === "asc" ? 1 : -1;
  ideas.sort((a, b) => {
    if (field === "category") return categoryName(a.categoryId).localeCompare(categoryName(b.categoryId)) * dir;
    // default: date (createdAt)
    return (new Date(a.createdAt) - new Date(b.createdAt)) * dir;
  });
  return ideas;
}
function sortArrow(field) {
  if (state.ideaSortField !== field) return "";
  return state.ideaSortDir === "asc" ? " ▲" : " ▼";
}
function toggleIdeaSort(field) {
  if (state.ideaSortField === field) state.ideaSortDir = state.ideaSortDir === "asc" ? "desc" : "asc";
  else { state.ideaSortField = field; state.ideaSortDir = "desc"; }
  render();
}

function renderIdea(project, editable) {
  const ideas = sortedIdeas(project);
  const customColumns = project.ideaColumns || [];
  const categoryOptions = state.ideaCategories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");

  const customTh = customColumns.map((col) => `
    <th>${escapeHtml(col.name)}${editable ? `<span class="col-remove" onclick="event.stopPropagation();removeIdeaColumn('${project.id}','${col.id}')" title="Remove column">×</span>` : ""}</th>`).join("");

  const rows = ideas.map((i) => {
    const checked = state.ideaSelected.has(i.id) ? "checked" : "";
    const dateStr = new Date(i.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const customTds = customColumns.map((col) => `
      <td onclick="event.stopPropagation()">
        ${editable
          ? `<input type="text" class="cell-input" value="${escapeAttr((i.customValues || {})[col.id] || "")}" onblur="updateIdeaCustomValue('${project.id}','${i.id}','${col.id}', this.value)">`
          : escapeHtml((i.customValues || {})[col.id] || "")}
      </td>`).join("");
    return `<tr>
      <td onclick="event.stopPropagation()"><input type="checkbox" ${checked} onchange="toggleIdeaSelected('${i.id}', this.checked)"></td>
      <td onclick="openIdeaNote('${project.id}','${i.id}')">${dateStr}</td>
      <td onclick="openIdeaNote('${project.id}','${i.id}')">${i.categoryId ? `<span class="tag">${escapeHtml(categoryName(i.categoryId))}</span>` : '<span class="empty-state" style="padding:0;">—</span>'}</td>
      <td class="idea-table-text" onclick="openIdeaNote('${project.id}','${i.id}')">${escapeHtml(i.text.slice(0, 90))}${i.text.length > 90 ? "…" : ""}</td>
      ${customTds}
    </tr>`;
  }).join("");

  return `
    ${editable ? `
    <div class="section">
      <div class="section-title">Raw idea</div>
      <p class="muted" style="font-size:12.5px;margin:-4px 0 12px;">Dump the thought as it comes. Nothing gets overwritten — every idea stays in the list below.</p>
      <textarea id="idea-box" rows="3" placeholder="What if the shopkeeper argued with the delivery guy about..."></textarea>
      <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap;">
        <select id="idea-category" class="input-sm">
          <option value="">— no category —</option>
          ${categoryOptions}
        </select>
        <button class="btn btn-sm" onclick="promptNewIdeaCategory()">+ New category</button>
        <button class="btn btn-primary btn-sm" onclick="addIdea('${project.id}')">+ Add idea</button>
      </div>
    </div>` : ""}

    <div class="section">
      <div class="section-title" style="display:flex;align-items:center;justify-content:space-between;">
        <span>Ideas recorded <span class="chip">${ideas.length}</span></span>
        <div style="display:flex;gap:8px;">
          ${editable ? `<button class="btn btn-sm" onclick="addIdeaColumn('${project.id}')">+ Add column</button>` : ""}
          <button class="btn btn-sm" onclick="exportIdeas('${project.id}', false)">Export all CSV</button>
          <button class="btn btn-sm" onclick="exportIdeas('${project.id}', true)">Export selected CSV</button>
        </div>
      </div>
      ${ideas.length ? `
      <table class="idea-table">
        <thead>
          <tr>
            <th style="width:28px;"><input type="checkbox" onchange="toggleAllIdeaSelected('${project.id}', this.checked)"></th>
            <th class="sortable" onclick="toggleIdeaSort('date')">Date${sortArrow("date")}</th>
            <th class="sortable" onclick="toggleIdeaSort('category')">Category${sortArrow("category")}</th>
            <th>Idea</th>
            ${customTh}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>` : '<div class="empty-state">Nothing captured yet.</div>'}
    </div>`;
}

async function addIdea(pid) {
  const el = document.getElementById("idea-box");
  const text = (el.value || "").trim();
  if (!text) return;
  const categoryId = document.getElementById("idea-category").value;
  await api(`/projects/${pid}/ideas`, { method: "POST", body: JSON.stringify({ text, categoryId }) });
  el.value = "";
  await loadProjects(); render();
}

async function promptNewIdeaCategory() {
  const name = prompt("New idea category (e.g. Observation, Trend, Personal experience):");
  if (!name || !name.trim()) return;
  await api("/idea-categories", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
  await loadIdeaCategories(); render();
}

async function updateIdeaCategory(pid, ideaId, categoryId) {
  const idea = (getProject(pid).ideas || []).find((i) => i.id === ideaId);
  if (idea) idea.categoryId = categoryId; // optimistic — so a fast reopen doesn't race the network reload
  await api(`/projects/${pid}/ideas/${ideaId}`, { method: "PATCH", body: JSON.stringify({ categoryId }) });
  await loadProjects(); render();
}

function toggleIdeaSelected(id, checked) {
  if (checked) state.ideaSelected.add(id); else state.ideaSelected.delete(id);
}
function toggleAllIdeaSelected(pid, checked) {
  const project = getProject(pid);
  const ideas = project.ideas || [];
  if (checked) ideas.forEach((i) => state.ideaSelected.add(i.id));
  else state.ideaSelected.clear();
  render();
}

function openIdeaNote(pid, ideaId, maximized) {
  const project = getProject(pid);
  const idea = (project.ideas || []).find((i) => i.id === ideaId);
  if (!idea) return;
  const editable = canEdit("idea");
  const customColumns = project.ideaColumns || [];
  const dateStr = new Date(idea.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const categoryOptions = state.ideaCategories.map((c) => `<option value="${c.id}" ${c.id === idea.categoryId ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("");
  const isMax = !!maximized;

  const customFields = customColumns.map((col) => `
    <div class="field">
      <label class="field-label">${escapeHtml(col.name)}</label>
      <textarea rows="${isMax ? 6 : 2}" data-col-id="${col.id}" ${editable ? `onblur="updateIdeaCustomValue('${pid}','${ideaId}','${col.id}', this.value)"` : "disabled"}>${escapeHtml((idea.customValues || {})[col.id] || "")}</textarea>
    </div>`).join("");

  modalRoot.innerHTML = `
    <div class="modal-overlay" onclick="closeModalIfOverlay(event)">
      <div class="sticky-note modal-wide ${isMax ? "maximized" : ""}">
        <div class="sticky-note-topbar">
          <div class="sticky-note-date">${dateStr}</div>
          <div class="sticky-note-tools">
            <button type="button" title="${isMax ? "Restore" : "Open full page"}" onclick="toggleIdeaNoteSize('${pid}','${ideaId}', ${!isMax})">${isMax ? "⤡" : "⤢"}</button>
            <button type="button" title="Close" onclick="closeModal()">✕</button>
          </div>
        </div>
        ${editable ? `
          <select class="input-sm sticky-note-category" onchange="updateIdeaCategory('${pid}','${ideaId}', this.value)">
            <option value="">— no category —</option>
            ${categoryOptions}
          </select>` : idea.categoryId ? `<div class="sticky-note-category"><span class="tag">${escapeHtml(categoryName(idea.categoryId))}</span></div>` : ""}
        <textarea class="sticky-note-text" rows="${isMax ? 22 : 6}" ${editable ? "" : "disabled"} onblur="updateIdeaText('${pid}','${ideaId}', this.value)">${escapeHtml(idea.text)}</textarea>
        ${customFields}
        <div class="modal-actions" style="margin-top:12px;">
          ${editable ? `<button class="btn" style="color:var(--red, #C0392B);border-color:var(--red, #C0392B);" onclick="deleteIdea('${pid}','${ideaId}')">Delete</button>` : ""}
          <button class="btn btn-primary" onclick="closeModal()">Close</button>
        </div>
      </div>
    </div>`;
}

// Switch the idea modal between compact and full-page: flush any edit that's still
// sitting in a textarea (hasn't blurred yet) into local state first, so resizing
// never discards text the user just typed.
function toggleIdeaNoteSize(pid, ideaId, maximized) {
  const note = document.querySelector(".sticky-note");
  if (note) {
    const textEl = note.querySelector(".sticky-note-text");
    if (textEl && !textEl.disabled) updateIdeaText(pid, ideaId, textEl.value);
    note.querySelectorAll("textarea[data-col-id]").forEach((el) => {
      if (!el.disabled) updateIdeaCustomValue(pid, ideaId, el.dataset.colId, el.value);
    });
  }
  openIdeaNote(pid, ideaId, maximized);
}

async function updateIdeaText(pid, ideaId, text) {
  const idea = (getProject(pid).ideas || []).find((i) => i.id === ideaId);
  if (idea) idea.text = text; // optimistic — see updateIdeaCategory above for why
  await api(`/projects/${pid}/ideas/${ideaId}`, { method: "PATCH", body: JSON.stringify({ text }) });
  await loadProjects();
}

async function updateIdeaCustomValue(pid, ideaId, columnId, value) {
  const idea = (getProject(pid).ideas || []).find((i) => i.id === ideaId);
  if (idea) { idea.customValues = idea.customValues || {}; idea.customValues[columnId] = value; } // optimistic
  await api(`/projects/${pid}/ideas/${ideaId}`, { method: "PATCH", body: JSON.stringify({ customValues: { [columnId]: value } }) });
  await loadProjects();
}

async function addIdeaColumn(pid) {
  const name = prompt("New column name (e.g. Brief, Owner):");
  if (!name || !name.trim()) return;
  await api(`/projects/${pid}/idea-columns`, { method: "POST", body: JSON.stringify({ name: name.trim() }) });
  await loadProjects(); render();
}
async function removeIdeaColumn(pid, columnId) {
  if (!confirm("Remove this column? Its values on every idea will be lost.")) return;
  await api(`/projects/${pid}/idea-columns/${columnId}`, { method: "DELETE" });
  await loadProjects(); render();
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function exportIdeas(pid, selectedOnly) {
  const project = getProject(pid);
  let ideas = sortedIdeas(project);
  if (selectedOnly) ideas = ideas.filter((i) => state.ideaSelected.has(i.id));
  if (!ideas.length) { alert(selectedOnly ? "No ideas selected." : "No ideas to export."); return; }
  const customColumns = project.ideaColumns || [];
  const header = ["Date", "Category", "Idea", ...customColumns.map((c) => c.name)];
  const lines = [header.map(csvEscape).join(",")];
  ideas.forEach((i) => {
    const row = [
      new Date(i.createdAt).toLocaleDateString("en-IN"),
      categoryName(i.categoryId),
      i.text,
      ...customColumns.map((c) => (i.customValues || {})[c.id] || ""),
    ];
    lines.push(row.map(csvEscape).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${(project.title || "ideas").replace(/[^a-z0-9]+/gi, "_")}_ideas.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

async function deleteIdea(pid, ideaId) {
  if (!confirm("Delete this idea?")) return;
  await api(`/projects/${pid}/ideas/${ideaId}`, { method: "DELETE" });
  state.ideaSelected.delete(ideaId);
  closeModal();
  await loadProjects(); render();
}

// ---------- Script tab ----------
/* Shots you captured on inspiration reels — reference while writing, click to stamp. */
function renderShotRefPanel(project, editable) {
  const all = [];
  (project.inspirations || []).forEach((i) => {
    (i.shots || []).forEach((sh) => all.push({ ...sh, from: i.note || i.platform || i.url, inspId: i.id }));
  });
  state._scriptShots = all;
  if (!all.length) return "";
  return `
    <div class="section" style="background:var(--cream);border:1px solid var(--border);">
      <div class="section-title" style="font-size:13px;display:flex;align-items:center;gap:8px;">
        🎬 Shots you studied <span class="chip">${all.length}</span>
        <span class="muted" style="font-weight:400;font-size:11px;">${editable ? "click a shot to fill the block form below" : "reference while you write"}</span>
      </div>
      <div style="display:flex;gap:8px;overflow-x:auto;padding:4px 0;">
        ${all.map((sh, idx) => `
          <div class="shot-ref-card" ${editable ? `onclick="stampShot(${idx})" style="cursor:pointer;"` : ""}
               style="flex:0 0 200px;border:1px solid var(--border);border-radius:8px;padding:9px 10px;background:#fff;">
            <div style="display:flex;gap:6px;align-items:center;">
              <span class="chip" style="font-family:monospace;">${escapeHtml(sh.time || "")}</span>
              <b style="font-size:12.5px;">${escapeHtml(sh.type || "—")}</b>
            </div>
            ${(sh.angle || sh.move) ? `<div class="muted" style="font-size:11px;margin-top:3px;">${[sh.angle, sh.move].filter(Boolean).map(escapeHtml).join(" · ")}</div>` : ""}
            ${sh.note ? `<div style="font-size:11.5px;color:var(--ink-soft);margin-top:4px;line-height:1.4;">${escapeHtml(sh.note)}</div>` : ""}
            <div class="muted" style="font-size:10px;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">↪ ${escapeHtml(sh.from)}</div>
            ${editable ? `<div style="font-size:10px;color:var(--amber);margin-top:5px;font-weight:600;">+ use in block</div>` : ""}
          </div>`).join("")}
      </div>
    </div>`;
}

function activeScript(project) {
  const list = project.scripts || [];
  if (!list.length) return null;
  const openId = state.openScriptId && list.some((x) => x.id === state.openScriptId)
    ? state.openScriptId : list[0].id;
  return list.find((x) => x.id === openId);
}

function renderScript(project, editable) {
  const list = project.scripts || [];
  const sc = activeScript(project);

  const chooser = `
    <div class="section">
      <div class="section-title" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        Scripts <span class="chip">${list.length}</span>
        ${editable ? `<span style="margin-left:auto;"><button class="btn btn-primary btn-sm" onclick="addScript('${project.id}')">+ New script</button></span>` : ""}
      </div>
      <p class="muted" style="font-size:12.5px;margin:-4px 0 12px;">Rewrite as many times as you like — every draft stays here. Nothing you wrote is ever lost.</p>
      ${list.length ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${list.map((x) => `
            <button class="script-tab ${sc && x.id === sc.id ? "on" : ""}" onclick="openScript('${x.id}')">
              ${escapeHtml(x.title)}
              <span class="script-tab-meta">${(x.blocks || []).length} shots</span>
            </button>`).join("")}
        </div>` : '<div class="empty-state">No scripts yet. Make your first draft.</div>'}
    </div>`;

  if (!sc) return chooser;

  const hooks = (sc.hooks || []).map((h) => `
    <div class="hook-card ${h.selected ? "selected" : ""}">
      ${h.selected ? '<div class="selected-tag">Selected</div>' : ""}
      <div class="hook-version">Version ${escapeHtml(h.version || "")}</div>
      <div class="hook-text">${escapeHtml(h.text)}</div>
      ${h.notes ? `<div class="hook-notes">${escapeHtml(h.notes)}</div>` : ""}
      ${editable && !h.selected ? `<button class="btn btn-ghost btn-sm" onclick="selectHook('${project.id}','${h.id}')">Use this one</button>` : ""}
    </div>`).join("");

  const blocks = (sc.blocks || []).map((b) => {
    const ref = b.referenceInspirationId ? project.inspirations.find((i) => i.id === b.referenceInspirationId) : null;
    return `
      <div class="block-card">
        <div><span class="block-num">${b.order}</span>
          ${editable ? `<button class="link-btn-sm danger" style="float:right;" onclick="deleteBlock('${project.id}','${b.id}')">remove</button>` : ""}
        </div>
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
  }).join("");

  return `
    ${chooser}
    <div class="section">
      <div class="section-title" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        ${escapeHtml(sc.title)}
        ${editable ? `<span style="margin-left:auto;display:flex;gap:6px;">
          <button class="btn btn-sm" onclick="renameScript('${project.id}','${sc.id}')">Rename</button>
          <button class="btn btn-sm" onclick="duplicateScript('${project.id}','${sc.id}')">Duplicate</button>
          <button class="btn btn-sm" style="color:var(--red);border-color:var(--red);" onclick="deleteScript('${project.id}','${sc.id}')">Delete</button>
        </span>` : ""}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Full script</div>
      <p class="muted" style="font-size:12.5px;margin:-4px 0 12px;">Paste the whole script here as one block — handy when you've written it elsewhere and just want it on record for reference.</p>
      ${editable
        ? `<textarea rows="10" placeholder="Paste the complete script here..." onblur="saveFullScript('${project.id}','${sc.id}', this.value)">${escapeHtml(sc.fullText || "")}</textarea>`
        : (sc.fullText ? `<div style="white-space:pre-wrap;font-size:13.5px;line-height:1.6;">${escapeHtml(sc.fullText)}</div>` : '<div class="empty-state">No full script pasted yet.</div>')}
    </div>

    ${renderShotRefPanel(project, editable)}

    <div class="section">
      <div class="section-title">Hook options</div>
      ${hooks || '<div class="empty-state">No hooks written yet.</div>'}
      ${editable ? `
        <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
          <div class="field" style="flex:2;min-width:200px;"><label class="field-label">Hook text</label><input type="text" id="hook-text"></div>
          <div class="field" style="flex:1;min-width:160px;"><label class="field-label">Notes</label><input type="text" id="hook-notes" placeholder="Delivery, tone..."></div>
          <button class="btn btn-primary btn-sm" style="align-self:flex-end;margin-bottom:12px;" onclick="addHook('${project.id}')">+ Add hook</button>
        </div>` : ""}
    </div>

    <div class="section">
      <div class="section-title">Shot-by-shot script</div>
      ${blocks || '<div class="empty-state">No script blocks yet.</div>'}
      ${editable ? renderAddBlockForm(project) : ""}
    </div>`;
}

// Click a captured shot -> fill the block form with its framing.
function renderAddBlockForm(project) {
  const insp = project.inspirations || [];
  return `
    <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:16px;">
      <div class="field"><label class="field-label">Dialogue / VO / action</label>
        <textarea id="block-dialogue" rows="2"></textarea></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <div class="field" style="flex:1;min-width:140px;"><label class="field-label">Shot type</label>
          <input type="text" id="block-shottype" placeholder="Close-up"></div>
        <div class="field" style="flex:1;min-width:140px;"><label class="field-label">Angle</label>
          <input type="text" id="block-angle" placeholder="Eye-level"></div>
        <div class="field" style="flex:1;min-width:140px;"><label class="field-label">Movement</label>
          <input type="text" id="block-movement" placeholder="Static"></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <div class="field" style="flex:1;min-width:160px;"><label class="field-label">Location</label>
          <input type="text" id="block-location" placeholder="Studio"></div>
        <div class="field" style="flex:1;min-width:160px;"><label class="field-label">Props/notes</label>
          <input type="text" id="block-props"></div>
      </div>
      <div class="field"><label class="field-label">On-screen text</label>
        <input type="text" id="block-onscreen"></div>
      <div class="field"><label class="field-label">Shot reference (which inspiration is this beat from?)</label>
        <select id="block-ref" class="input-sm" style="min-width:220px;">
          <option value="">— none —</option>
          ${insp.map((i) => `<option value="${i.id}">${escapeHtml((i.note || i.url || "").slice(0, 60))}</option>`).join("")}
        </select></div>
      <button class="btn btn-primary btn-sm" onclick="addBlock('${project.id}')">+ Add shot to script</button>
    </div>`;
}

function stampShot(idx) {
  const sh = (state._scriptShots || [])[idx];
  if (!sh) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
  set("block-shottype", sh.type || "");
  set("block-angle", sh.angle || "");
  set("block-movement", sh.move || "");
  const props = document.getElementById("block-props");
  if (props) {
    const ref = `ref ${sh.time || ""}${sh.note ? ": " + sh.note : ""}`.trim();
    props.value = props.value.trim() ? props.value + " · " + ref : ref;
  }
  const refSel = document.getElementById("block-ref");
  if (refSel && sh.inspId) refSel.value = sh.inspId;
  const dlg = document.getElementById("block-dialogue");
  if (dlg) { dlg.scrollIntoView({ behavior: "smooth", block: "center" }); dlg.focus(); }
}

function openScript(id) { state.openScriptId = id; render(); }

async function addScript(pid) {
  const title = prompt("Name this draft:", "Draft " + (((getProject(pid).scripts || []).length) + 1));
  if (title == null) return;
  const sc = await api(`/projects/${pid}/scripts`, { method: "POST", body: JSON.stringify({ title }) });
  state.openScriptId = sc.id;
  await loadProjects(); render();
}
async function renameScript(pid, sid) {
  const sc = (getProject(pid).scripts || []).find((x) => x.id === sid);
  const title = prompt("Rename script:", sc ? sc.title : "");
  if (title == null) return;
  await api(`/projects/${pid}/scripts/${sid}`, { method: "PATCH", body: JSON.stringify({ title }) });
  await loadProjects(); render();
}
async function duplicateScript(pid, sid) {
  const copy = await api(`/projects/${pid}/scripts/${sid}/duplicate`, { method: "POST" });
  state.openScriptId = copy.id;
  await loadProjects(); render();
}
async function saveFullScript(pid, sid, text) {
  await api(`/projects/${pid}/scripts/${sid}`, { method: "PATCH", body: JSON.stringify({ fullText: text }) });
  await loadProjects();
}
async function deleteScript(pid, sid) {
  if (!confirm("Delete this draft? Its shots and hooks go with it. Other drafts stay.")) return;
  await api(`/projects/${pid}/scripts/${sid}`, { method: "DELETE" });
  state.openScriptId = null;
  await loadProjects(); render();
}

async function selectHook(id, hookId) {
  const sc = activeScript(getProject(id));
  await api(`/projects/${id}/scripts/${sc.id}/hooks/${hookId}/select`, { method: "POST" });
  await loadProjects(); render();
}
async function addHook(id) {
  const sc = activeScript(getProject(id));
  const text = document.getElementById("hook-text").value;
  const notes = document.getElementById("hook-notes").value;
  if (!text) return;
  await api(`/projects/${id}/scripts/${sc.id}/hooks`, { method: "POST", body: JSON.stringify({ text, notes }) });
  await loadProjects(); render();
}
async function addBlock(id) {
  const sc = activeScript(getProject(id));
  if (!sc) { alert("Make a script first."); return; }
  const g = (k) => (document.getElementById(k) || {}).value || "";
  const body = {
    dialogue: g("block-dialogue"), shotType: g("block-shottype"), angle: g("block-angle"),
    movement: g("block-movement"), location: g("block-location"), props: g("block-props"),
    onScreenText: g("block-onscreen"), referenceInspirationId: g("block-ref") || null,
  };
  if (!body.dialogue.trim()) return;
  await api(`/projects/${id}/scripts/${sc.id}/blocks`, { method: "POST", body: JSON.stringify(body) });
  await loadProjects(); render();
}
async function deleteBlock(pid, blockId) {
  const sc = activeScript(getProject(pid));
  if (!confirm("Remove this shot from the script?")) return;
  await api(`/projects/${pid}/scripts/${sc.id}/blocks/${blockId}`, { method: "DELETE" });
  await loadProjects(); render();
}

function renderShoot(project, editable) {
  const list = project.scripts || [];
  const sid = project.shoot.scriptId;
  const filming = list.find((x) => x.id === sid);

  const picker = `
    <div class="section">
      <div class="section-title">Which script are you filming?</div>
      ${list.length ? `
        <select class="input-sm" style="min-width:260px;" ${editable ? `onchange="setShootScript('${project.id}', this.value)"` : "disabled"}>
          <option value="">— pick a draft —</option>
          ${list.map((x) => `<option value="${x.id}" ${x.id === sid ? "selected" : ""}>${escapeHtml(x.title)} (${(x.blocks || []).length} shots)</option>`).join("")}
        </select>
        <p class="muted" style="font-size:12px;margin-top:8px;">The shot list below is built from this draft. Ticking shots here only affects this draft.</p>`
        : '<div class="empty-state">No scripts yet — write one in the Script tab first.</div>'}
    </div>`;

  const blocksOf = filming ? (filming.blocks || []) : [];
  const rows = (project.shoot.shots || [])
    .filter((s) => s.scriptId === sid)
    .map((s) => {
      const block = blocksOf.find((b) => b.id === s.blockId);
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
    ${picker}
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

async function setShootScript(pid, scriptId) {
  await api(`/projects/${pid}/shoot-script`, { method: "PATCH", body: JSON.stringify({ scriptId }) });
  await loadProjects(); render();
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
  await Promise.all([loadChannels(), loadProjects(), loadIdeaCategories()]);
  render();
})();
