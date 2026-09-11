// Content Pillar Generator — a guided worksheet that turns any business into a
// content-pillar strategy: Business info -> Goals -> 7 Pillars -> Idea Grid ->
// Shortlist -> 3C Review/Export. No AI here — the value is the structure + the
// generic example hints in the grid, same as the paper worksheet this replaced.

const TABS = [
  { id: "business", label: "1. Business" },
  { id: "goals", label: "2. Goals" },
  { id: "pillars", label: "3. Pillars" },
  { id: "grid", label: "4. Idea Grid" },
  { id: "shortlist", label: "5. Shortlist" },
  { id: "review", label: "6. Review & Export" },
];

const state = {
  profiles: [],
  reference: { pillars: [], angles: [], goals: [], hints: {} },
  currentId: null,
  activeTab: "business",
};

const app = document.getElementById("app");

// ---------- API ----------
async function api(path, opts) {
  const res = await fetch("/api/pillargen" + path, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...opts,
  });
  if (res.status === 401 || res.status === 403) { window.location.href = "/"; throw new Error("Not signed in"); }
  if (!res.ok) {
    let msg = "Something went wrong (" + res.status + ")";
    try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

async function loadAll() {
  const [profiles, reference] = await Promise.all([api("/profiles"), api("/reference")]);
  state.profiles = profiles;
  state.reference = reference;
}

function getProfile(id) { return state.profiles.find((p) => p.id === id); }
function pillarDef(id) { return state.reference.pillars.find((p) => p.id === id); }
function angleDef(id) { return state.reference.angles.find((a) => a.id === id); }

// ---------- Routing ----------
function goList() { state.currentId = null; render(); }
function goProfile(id, tab) { state.currentId = id; state.activeTab = tab || state.activeTab || "business"; render(); }

function render() {
  if (!state.currentId) renderList();
  else renderDetail();
}

// ---------- List ----------
function renderList() {
  const profiles = state.profiles;
  app.innerHTML = `
    <div style="font-size:12px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">Your business strategies</div>
    <p class="muted" style="font-size:13px;margin:0 0 18px;">Any business, any industry — open one up or start a new one.</p>
    ${profiles.length ? `<div class="profile-grid">${profiles.map(profileCard).join("")}</div>` : '<div class="empty-state">No business strategies yet. Click "+ New business" above to start one.</div>'}
  `;
}
function profileCard(p) {
  const pillarsFilled = Object.values(p.pillars).filter((pl) => pl.keyPoints.length).length;
  const ideaCount = Object.keys(p.ideaGrid).length;
  return `
    <div class="card" onclick="goProfile('${p.id}')">
      <div class="card-title">${escapeHtml(p.business.name || "Untitled business")}</div>
      <div class="card-meta">${escapeHtml(p.business.industry || "No industry set")}</div>
      <div class="card-meta" style="margin-top:6px;">${pillarsFilled}/7 pillars &middot; ${ideaCount} ideas &middot; ${p.shortlist.length} shortlisted</div>
    </div>`;
}
async function addProfile() {
  const name = prompt("Business name:");
  if (!name || !name.trim()) return;
  const p = await api("/profiles", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
  await loadAll();
  goProfile(p.id, "business");
}
async function deleteProfile(id) {
  if (!confirm("Delete this business strategy? This can't be undone.")) return;
  await api(`/profiles/${id}`, { method: "DELETE" });
  await loadAll();
  goList();
}

// ---------- Detail shell ----------
function renderDetail() {
  const p = getProfile(state.currentId);
  if (!p) { goList(); return; }
  app.innerHTML = `
    <div class="back-link" onclick="goList()">&larr; All businesses</div>
    <div class="detail-header">
      <div>
        <h1 class="detail-title">${escapeHtml(p.business.name || "Untitled business")}</h1>
        <div class="muted" style="font-size:12.5px;">${escapeHtml(p.business.industry || "No industry set")}</div>
      </div>
      <div style="display:flex;gap:8px;">
        <a class="btn" href="/api/pillargen/profiles/${p.id}/pdf" target="_blank" rel="noopener">&#11015; Export PDF</a>
        <button class="btn" style="color:var(--red);" onclick="deleteProfile('${p.id}')">Delete</button>
      </div>
    </div>
    <div class="stepper">
      ${TABS.map((t) => `<div class="step ${state.activeTab === t.id ? "active" : ""}" onclick="goProfile('${p.id}','${t.id}')">${t.label}</div>`).join("")}
    </div>
    <div id="tabBody"></div>
  `;
  const body = document.getElementById("tabBody");
  if (state.activeTab === "business") body.innerHTML = renderBusinessTab(p);
  else if (state.activeTab === "goals") body.innerHTML = renderGoalsTab(p);
  else if (state.activeTab === "pillars") body.innerHTML = renderPillarsTab(p);
  else if (state.activeTab === "grid") body.innerHTML = renderGridTab(p);
  else if (state.activeTab === "shortlist") body.innerHTML = renderShortlistTab(p);
  else if (state.activeTab === "review") body.innerHTML = renderReviewTab(p);
}

// ---------- Step 1: Business ----------
const BUSINESS_FIELDS = [
  ["name", "Business name"],
  ["industry", "Industry / Category"],
  ["products", "Products / Services"],
  ["audience", "Target audience (who?)"],
  ["problem", "Customer's main problem (what?)"],
  ["competitors", "Biggest competitors"],
];
function renderBusinessTab(p) {
  const b = p.business;
  return `
    <div class="section">
      <div class="section-title">Understand the business</div>
      <p class="muted" style="font-size:12.5px;margin:-4px 0 14px;">Fill this first — everything else builds on it.</p>
      ${BUSINESS_FIELDS.map(([key, lbl]) => `
        <div class="field">
          <label class="field-label">${lbl}</label>
          <input type="text" value="${escapeAttr(b[key] || "")}" onblur="saveBusinessField('${p.id}','${key}', this.value)">
        </div>`).join("")}
    </div>`;
}
async function saveBusinessField(pid, key, value) {
  await api(`/profiles/${pid}/business`, { method: "PATCH", body: JSON.stringify({ [key]: value }) });
  await loadAll();
  if (state.currentId === pid) renderDetail();
}

// ---------- Step 2: Goals ----------
function renderGoalsTab(p) {
  const goals = state.reference.goals;
  const selected = p.goals.selected || [];
  return `
    <div class="section">
      <div class="section-title">End goal — why are we doing this?</div>
      <p class="muted" style="font-size:12.5px;margin:-4px 0 14px;">Pick every goal that applies — it keeps the ideas grounded in something real.</p>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px;">
        ${goals.map((g) => `<button class="toggle-chip ${selected.includes(g.id) ? "on" : ""}" onclick="toggleGoal('${p.id}','${g.id}')">${g.label}</button>`).join("")}
      </div>
      ${selected.includes("other") ? `
        <div class="field" style="max-width:360px;">
          <label class="field-label">Other goal</label>
          <input type="text" value="${escapeAttr(p.goals.otherText || "")}" onblur="saveOtherGoal('${p.id}', this.value)">
        </div>` : ""}
    </div>`;
}
async function toggleGoal(pid, goalId) {
  const p = getProfile(pid);
  const cur = p.goals.selected || [];
  const next = cur.includes(goalId) ? cur.filter((x) => x !== goalId) : [...cur, goalId];
  await api(`/profiles/${pid}/goals`, { method: "PATCH", body: JSON.stringify({ selected: next }) });
  await loadAll(); renderDetail();
}
async function saveOtherGoal(pid, text) {
  await api(`/profiles/${pid}/goals`, { method: "PATCH", body: JSON.stringify({ otherText: text }) });
  await loadAll();
}

// ---------- Step 3: Pillars ----------
function renderPillarsTab(p) {
  const pillars = state.reference.pillars;
  return `
    <div class="pillar-cards">
      ${pillars.map((pd) => {
        const points = (p.pillars[pd.id] || {}).keyPoints || [];
        return `
        <div class="pillar-card">
          <div class="pillar-card-head"><span class="pillar-card-icon">${pd.icon}</span><span class="pillar-card-title">${pd.label}</span></div>
          <div class="pillar-card-desc">${escapeHtml(pd.desc)}</div>
          <div id="kp-list-${pd.id}">${renderKeyPoints(p.id, pd.id, points)}</div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <input id="kp-new-${pd.id}" class="input-sm" style="flex:1;" placeholder="Add a key point..." onkeydown="if(event.key==='Enter'){event.preventDefault();addKeyPoint('${p.id}','${pd.id}');}">
            <button class="btn btn-sm" onclick="addKeyPoint('${p.id}','${pd.id}')">+</button>
          </div>
        </div>`;
      }).join("")}
    </div>`;
}
function renderKeyPoints(pid, pillarId, points) {
  if (!points.length) return '<div class="empty-state" style="padding:8px 0;font-size:12px;">No key points yet.</div>';
  return points.map((kp) => `
    <div class="kp-row" data-kpid="${kp.id}">
      <span>${escapeHtml(kp.text)}</span>
      <button class="icon-btn" title="Remove" onclick="deleteKeyPoint('${pid}','${pillarId}','${kp.id}')">&#10005;</button>
    </div>`).join("");
}
async function addKeyPoint(pid, pillarId) {
  const input = document.getElementById(`kp-new-${pillarId}`);
  const text = input.value.trim();
  if (!text) return;
  await api(`/profiles/${pid}/pillars/${pillarId}/keypoints`, { method: "POST", body: JSON.stringify({ text }) });
  await loadAll();
  const p = getProfile(pid);
  document.getElementById(`kp-list-${pillarId}`).innerHTML = renderKeyPoints(pid, pillarId, p.pillars[pillarId].keyPoints);
  input.value = ""; input.focus();
}
async function deleteKeyPoint(pid, pillarId, kpId) {
  await api(`/profiles/${pid}/pillars/${pillarId}/keypoints/${kpId}`, { method: "DELETE" });
  await loadAll();
  const p = getProfile(pid);
  document.getElementById(`kp-list-${pillarId}`).innerHTML = renderKeyPoints(pid, pillarId, p.pillars[pillarId].keyPoints);
}

// ---------- Step 4: Idea Grid ----------
function renderGridTab(p) {
  const pillars = state.reference.pillars;
  const angles = state.reference.angles;
  return `
    <div class="section" style="padding-bottom:14px;">
      <div class="section-title">Content angles — how to show it</div>
      <div class="angle-legend">
        ${angles.map((a) => `<span class="angle-pill" title="${escapeAttr(a.desc)}"><b>${a.label}</b> &middot; ${a.sub}</span>`).join("")}
      </div>
    </div>
    ${pillars.map((pd) => `
      <div class="grid-pillar-block">
        <div class="grid-pillar-title">${pd.icon} ${pd.label}</div>
        <div class="grid-cells">
          ${angles.map((a) => {
            const key = `${pd.id}|${a.id}`;
            const val = p.ideaGrid[key] || "";
            const hint = (state.reference.hints[pd.id] || {})[a.id] || "";
            return `
            <div class="grid-cell">
              <div class="grid-cell-angle">${a.label}</div>
              <textarea rows="2" placeholder="${escapeAttr(hint)}" onblur="saveGridCell('${p.id}','${pd.id}','${a.id}', this.value)" id="grid-${pd.id}-${a.id}">${escapeHtml(val)}</textarea>
              <div class="grid-cell-actions"><button onclick="shortlistFromGrid('${p.id}','${pd.id}','${a.id}')">&rarr; Shortlist</button></div>
            </div>`;
          }).join("")}
        </div>
      </div>`).join("")}
  `;
}
async function saveGridCell(pid, pillarId, angleId, text) {
  await api(`/profiles/${pid}/grid`, { method: "PATCH", body: JSON.stringify({ pillarId, angleId, text }) });
  await loadAll();
}
async function shortlistFromGrid(pid, pillarId, angleId) {
  const el = document.getElementById(`grid-${pillarId}-${angleId}`);
  const text = (el.value || "").trim();
  if (!text) { alert("Write an idea in this cell first."); return; }
  await api(`/profiles/${pid}/shortlist`, { method: "POST", body: JSON.stringify({ text, pillarId, angleId }) });
  await loadAll();
  alert("Added to shortlist → check the Shortlist tab.");
}

// ---------- Step 5: Shortlist ----------
function renderShortlistTab(p) {
  const items = p.shortlist;
  return `
    <div class="section">
      <div class="section-title">Shortlist</div>
      <p class="muted" style="font-size:12.5px;margin:-4px 0 14px;">Pull the best ideas from the grid, or add one directly below.</p>
      <div class="inline-form" style="margin-bottom:16px;">
        <div class="field"><label class="field-label">New idea</label><input type="text" id="new-shortlist-text" placeholder="Type an idea, then Add" onkeydown="if(event.key==='Enter'){event.preventDefault();addShortlistItem('${p.id}');}"></div>
        <button class="btn btn-sm" onclick="addShortlistItem('${p.id}')">+ Add</button>
      </div>
      <div id="shortlist-list">${items.length ? items.map((s) => shortlistRow(p, s)).join("") : '<div class="empty-state">Nothing shortlisted yet.</div>'}</div>
    </div>`;
}
function shortlistRow(p, s) {
  const pillar = pillarDef(s.pillarId);
  const angle = angleDef(s.angleId);
  const meta = [pillar && pillar.label, angle && angle.label].filter(Boolean).join(" &middot; ");
  return `
    <div class="shortlist-row" data-slid="${s.id}">
      <div class="shortlist-text">${escapeHtml(s.text)}</div>
      ${meta ? `<div class="shortlist-meta">${meta}</div>` : ""}
      <div class="shortlist-controls">
        <input class="input-sm" style="width:120px;" placeholder="Format (Reel...)" value="${escapeAttr(s.format)}" onblur="patchShortlist('${p.id}','${s.id}',{format:this.value})">
        <input class="input-sm" style="width:140px;" placeholder="Goal" value="${escapeAttr(s.goal)}" onblur="patchShortlist('${p.id}','${s.id}',{goal:this.value})">
        <select class="input-sm" onchange="patchShortlist('${p.id}','${s.id}',{status:this.value})">
          ${["Idea", "Planned", "Shot", "Posted"].map((st) => `<option ${s.status === st ? "selected" : ""}>${st}</option>`).join("")}
        </select>
        <button class="icon-btn" title="Remove" onclick="deleteShortlistItem('${p.id}','${s.id}')">&#10005;</button>
      </div>
    </div>`;
}
async function addShortlistItem(pid) {
  const input = document.getElementById("new-shortlist-text");
  const text = input.value.trim();
  if (!text) return;
  await api(`/profiles/${pid}/shortlist`, { method: "POST", body: JSON.stringify({ text }) });
  await loadAll(); renderDetail();
}
async function patchShortlist(pid, itemId, patch) {
  await api(`/profiles/${pid}/shortlist/${itemId}`, { method: "PATCH", body: JSON.stringify(patch) });
  await loadAll();
}
async function deleteShortlistItem(pid, itemId) {
  await api(`/profiles/${pid}/shortlist/${itemId}`, { method: "DELETE" });
  await loadAll(); renderDetail();
}

// ---------- Step 6: Review & Export (3C filter) ----------
function threeCPass(s) { const c = s.threeC || {}; return !!(c.customer && c.content && c.commercial); }
function renderReviewTab(p) {
  const items = p.shortlist;
  const pillarsFilled = Object.values(p.pillars).filter((pl) => pl.keyPoints.length).length;
  const ideaCount = Object.keys(p.ideaGrid).length;
  const keepCount = items.filter(threeCPass).length;
  return `
    <div class="section">
      <div class="section-title">Apply the 3C filter</div>
      <p class="muted" style="font-size:12.5px;margin:-4px 0 14px;">For each idea: will the <b>Customer</b> find it valuable? Can we make the <b>Content</b> engaging? Does it support a <b>Commercial</b> goal? Yes to all 3 &rarr; keep it.</p>
      ${items.length ? items.map((s) => reviewRow(p, s)).join("") : '<div class="empty-state">Shortlist something first (Step 5).</div>'}
    </div>
    <div class="section" style="text-align:center;">
      <div class="section-title" style="text-align:left;">Final output</div>
      <p class="muted" style="font-size:13px;">${pillarsFilled}/7 pillars filled &middot; ${ideaCount} ideas in the grid &middot; ${keepCount} idea${keepCount === 1 ? "" : "s"} ready to keep</p>
      <a class="btn btn-primary" href="/api/pillargen/profiles/${p.id}/pdf" target="_blank" rel="noopener">&#11015; Export full strategy as PDF</a>
    </div>`;
}
function reviewRow(p, s) {
  const c = s.threeC || {};
  const pass = threeCPass(s);
  return `
    <div class="shortlist-row">
      <div class="shortlist-text">${escapeHtml(s.text)}</div>
      <div class="shortlist-controls">
        <span class="threec-toggle ${c.customer ? "on" : ""}" onclick="toggle3C('${p.id}','${s.id}','customer',${!c.customer})">Customer</span>
        <span class="threec-toggle ${c.content ? "on" : ""}" onclick="toggle3C('${p.id}','${s.id}','content',${!c.content})">Content</span>
        <span class="threec-toggle ${c.commercial ? "on" : ""}" onclick="toggle3C('${p.id}','${s.id}','commercial',${!c.commercial})">Commercial</span>
        <span class="verdict-badge ${pass ? "verdict-keep" : "verdict-review"}">${pass ? "Keep" : "Review"}</span>
      </div>
    </div>`;
}
async function toggle3C(pid, itemId, key, value) {
  await api(`/profiles/${pid}/shortlist/${itemId}`, { method: "PATCH", body: JSON.stringify({ threeC: { [key]: value } }) });
  await loadAll(); renderDetail();
}

// ---------- Helpers ----------
function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

// ---------- Boot ----------
(async function init() {
  await loadAll();
  render();
})();
