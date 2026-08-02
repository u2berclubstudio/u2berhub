import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid, Cell,
} from "recharts";

/* ============================================================
   SAVEDREELS — a U2berClub tool
   Tools to make creators smart.
   Feed it saved_collections.json + saved_posts.json together.
   It merges them into your full categorized vault (captions
   included), builds a report, and lets Claude build from it.
   100% local — files never leave the browser.
   ============================================================ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap');
.vault * { box-sizing: border-box; }
.vault {
  --ink:#15171E; --ink-soft:#2A2E3A; --paper:#FBF8F2; --card:#FFFFFF;
  --amber:#E8852B; --amber-soft:#FBE9D2; --teal:#2D7384;
  --muted:#71757E; --line:#EBE5D8; --good:#3F8F5B;
  --graphite:#2A2E3A; --silver:#71757E; --hairline:#EBE5D8; --mist:#FDFCF8;
  font-family:var(--body); color:var(--ink); background:var(--paper);
  --display:'Space Grotesk',sans-serif; --body:'Inter',sans-serif; --mono:'Space Mono',monospace;
  min-height:100%; line-height:1.5; -webkit-font-smoothing:antialiased;
}
.wrap { max-width:1080px; margin:0 auto; padding:28px 22px 90px; }

/* masthead */
.masthead { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; flex-wrap:wrap; border-bottom:2px solid var(--ink); padding-bottom:14px; }
.brand-lockup { display:flex; align-items:center; gap:13px; }
.brand-logo { width:46px; height:46px; border-radius:50%; display:block; flex-shrink:0; }
.brand-eyebrow { font-family:var(--mono); font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:var(--amber); font-weight:700; }
.brand-title { font-family:var(--display); font-weight:700; font-size:38px; line-height:.98; letter-spacing:-.03em; margin:4px 0 0; }
.brand-accent { color:var(--amber); }
.brand-sub { font-size:13.5px; color:var(--muted); max-width:440px; margin-top:6px; }
.vault-counter { text-align:right; }
.vault-counter .n { font-family:var(--mono); font-weight:700; font-size:34px; line-height:1; }
.vault-counter .l { font-family:var(--mono); font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:var(--muted); }

/* film strip */
.filmstrip { margin:20px 0 6px; }
.sprockets { height:9px; background-image:radial-gradient(circle at 6px 50%, var(--line) 0 2.5px, transparent 2.6px); background-size:14px 9px; }
.spectrum { display:flex; height:46px; overflow:hidden; border-top:1px solid var(--line); border-bottom:1px solid var(--line); border-radius:2px; }
.spectrum-seg { transition:flex .4s ease; }
.spectrum-legend { display:flex; flex-wrap:wrap; gap:6px 16px; font-family:var(--mono); font-size:11px; color:var(--ink-soft); margin-bottom:6px; }
.spectrum-legend span { display:inline-flex; align-items:center; gap:6px; }
.dot { width:9px; height:9px; border-radius:2px; display:inline-block; }

/* dropzone */
.drop { border:1.5px dashed #CDB89A; border-radius:14px; background:linear-gradient(180deg,#fff,#FCFAF5); padding:34px 26px; text-align:center; transition:.18s; cursor:pointer; }
.drop.hot { border-color:var(--amber); background:var(--amber-soft); }
.drop-mark { font-size:30px; }
.drop h3 { font-family:var(--display); font-weight:600; font-size:19px; margin:10px 0 4px; }
.drop p { color:var(--muted); font-size:13.5px; margin:2px 0; }

/* buttons */
.btn { font-family:var(--display); font-weight:600; font-size:13.5px; border:none; border-radius:9px; padding:11px 17px; cursor:pointer; transition:.15s; }
.btn-amber { background:var(--amber); color:#fff; }
.btn-amber:hover { filter:brightness(1.05); }
.btn-ghost { background:transparent; color:var(--ink); border:1px solid var(--line); }
.btn-ghost:hover { border-color:var(--ink); }
.btn:disabled { opacity:.5; cursor:not-allowed; }

/* stats */
.stats { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:22px 0; }
.stat { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 15px; }
.stat .v { font-family:var(--mono); font-weight:700; font-size:24px; line-height:1; }
.stat .k { font-size:11px; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); margin-top:7px; font-weight:600; }

/* sections */
.section { margin:30px 0; }
.section-head { display:flex; align-items:baseline; gap:12px; margin-bottom:14px; }
.section-idx { font-family:var(--mono); font-size:12px; color:var(--amber); font-weight:700; }
.section-title { font-family:var(--display); font-weight:600; font-size:20px; letter-spacing:-.01em; }
.section-note { font-size:12.5px; color:var(--muted); margin-left:auto; }
.panel { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px; }

/* collection cards */
.cat-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
.cat { background:var(--card); border:1px solid var(--line); border-radius:11px; padding:12px 13px; cursor:pointer; transition:.13s; }
.cat:hover { border-color:var(--ink); transform:translateY(-1px); }
.cat.active { border-color:var(--amber); box-shadow:0 0 0 2px var(--amber-soft); }
.cat-top { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
.cat-idx { font-family:var(--mono); font-size:10px; color:var(--muted); }
.cat-name { font-family:var(--display); font-weight:600; font-size:13.5px; margin:3px 0 7px; letter-spacing:-.01em; line-height:1.25; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cat-count { font-family:var(--mono); font-weight:700; font-size:12px; }
.cat-bar { height:5px; border-radius:4px; background:var(--line); overflow:hidden; }
.cat-bar i { display:block; height:100%; }

/* search + rows */
.search { width:100%; border:1px solid var(--line); border-radius:10px; padding:11px 13px; font-family:var(--body); font-size:14px; background:#fff; }
.search:focus { outline:none; border-color:var(--amber); }
.save-row { background:var(--card); border:1px solid var(--line); border-radius:11px; padding:13px 14px; margin-bottom:9px; }
.save-top { display:flex; align-items:center; gap:9px; margin-bottom:6px; }
.save-cap { font-size:13.5px; color:var(--ink-soft); line-height:1.5; }
.save-tags { display:flex; flex-wrap:wrap; gap:5px; margin-top:8px; }
.tag { font-family:var(--mono); font-size:10.5px; color:var(--teal); background:#EAF3F4; border-radius:5px; padding:2px 7px; }
.coltag { font-family:var(--mono); font-size:10px; color:#8A5A1E; background:var(--amber-soft); border-radius:5px; padding:2px 7px; }
.pill { font-family:var(--mono); font-size:9.5px; padding:2px 6px; border-radius:5px; background:var(--paper); border:1px solid var(--line); color:var(--ink-soft); text-transform:uppercase; letter-spacing:.04em; }
.open-link { color:var(--teal); text-decoration:none; font-weight:600; font-size:12.5px; font-family:var(--mono); }
.open-link:hover { text-decoration:underline; }

/* view toggle */
.vtoggle { display:inline-flex; border:1px solid var(--line); border-radius:9px; overflow:hidden; background:#fff; }
.vtoggle button { border:none; background:transparent; font-family:var(--display); font-weight:600; font-size:12.5px; padding:8px 14px; cursor:pointer; color:var(--muted); }
.vtoggle button.on { background:var(--ink); color:#fff; }

/* preview grid */
.embed-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(316px,1fr)); gap:14px; }
.embed-card { background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; }
.embed-frame { position:relative; width:100%; height:560px; background:#F4F1EA; }
.embed-frame iframe { width:100%; height:100%; border:0; display:block; }
.ph { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; color:var(--muted); font-size:12.5px; font-family:var(--mono); text-align:center; padding:16px; }
.ph .ph-ico { font-size:26px; opacity:.5; }
.embed-meta { padding:11px 13px; border-top:1px solid var(--line); }
.embed-cap { font-size:12.5px; color:var(--ink-soft); line-height:1.45; }
.load-more { display:flex; justify-content:center; margin-top:16px; }

/* planner notes */
.note-collapsed { display:flex; align-items:center; gap:7px; padding:8px 10px; margin-top:8px; border:1px dashed #D8CDB6; border-radius:8px; cursor:pointer; background:#FDFCF8; transition:.13s; }
.note-collapsed:hover { border-color:var(--amber); background:var(--amber-soft); }
.note-add { font-size:12px; color:var(--muted); font-family:var(--body); }
.note-peek { font-size:12px; color:var(--ink-soft); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }
.note-edit { font-size:10.5px; color:var(--amber); font-family:var(--mono); margin-left:auto; }
.status-pill { font-size:10px; color:#fff; border-radius:5px; padding:2px 6px; font-weight:600; white-space:nowrap; }
.note-open { margin-top:8px; border:1px solid var(--amber); border-radius:9px; padding:10px; background:#FDFBF6; }
.note-statuses { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:9px; }
.st-chip { font-size:11px; border:1px solid var(--line); background:#fff; border-radius:14px; padding:4px 9px; cursor:pointer; font-family:var(--body); color:var(--ink-soft); transition:.12s; }
.st-chip:hover { border-color:var(--ink); }
.note-label { display:block; font-size:10px; letter-spacing:.09em; text-transform:uppercase; color:var(--muted); font-weight:600; margin:7px 0 3px; }
.note-ta { width:100%; border:1px solid var(--line); border-radius:7px; padding:7px 8px; font-family:var(--body); font-size:12.5px; resize:vertical; background:#fff; color:var(--ink); }
.note-ta:focus { outline:none; border-color:var(--amber); }
.note-actions { display:flex; gap:6px; margin-top:9px; }
.btn-mini { font-family:var(--display); font-weight:600; font-size:11.5px; border:none; border-radius:6px; padding:6px 11px; cursor:pointer; background:var(--ink); color:#fff; }
.btn-mini.ghost { background:transparent; color:var(--muted); border:1px solid var(--line); }

/* filter chips */
.filter-chips { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; align-items:center; }
.fchip { font-size:11.5px; border:1px solid var(--line); background:#fff; border-radius:14px; padding:5px 11px; cursor:pointer; font-family:var(--body); color:var(--ink-soft); }
.fchip:hover { border-color:var(--ink); }
.fchip.on { background:var(--ink); color:#fff; border-color:var(--ink); }
.save-dot { font-family:var(--mono); font-size:10.5px; padding:5px 9px; border-radius:14px; margin-left:auto; white-space:nowrap; }
.save-dot.saved { color:var(--good); background:#E8F3EB; }
.save-dot.saving { color:#8A5A1E; background:var(--amber-soft); }
.save-dot.local, .save-dot.idle { color:var(--muted); background:#F2EFE7; }

/* AI block */
.ai { background:var(--ink); color:#F4F1EA; border-radius:16px; padding:22px; margin-top:8px; }
.ai-eyebrow { font-family:var(--mono); font-size:10.5px; letter-spacing:.2em; text-transform:uppercase; color:var(--amber); font-weight:700; }
.ai h3 { font-family:var(--display); font-weight:600; font-size:21px; margin:6px 0 3px; }
.ai p.sub { color:#B7B9C0; font-size:13px; margin:0 0 14px; }
.chips { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:13px; }
.chip { font-size:12px; background:#23262F; color:#E7E4DC; border:1px solid #33363F; border-radius:20px; padding:7px 12px; cursor:pointer; transition:.15s; font-family:var(--body); }
.chip:hover { border-color:var(--amber); color:#fff; }
.ai textarea { width:100%; background:#1C1F27; color:#F4F1EA; border:1px solid #33363F; border-radius:10px; padding:13px; font-family:var(--body); font-size:14px; resize:vertical; min-height:78px; }
.ai textarea:focus { outline:none; border-color:var(--amber); }
.ai-row { display:flex; gap:10px; margin-top:11px; align-items:center; flex-wrap:wrap; }
.answer { background:#1A1D24; border:1px solid #2C2F38; border-radius:12px; padding:18px; margin-top:16px; font-size:14.2px; color:#ECEAE3; line-height:1.62; }
.answer h4 { font-family:var(--display); color:#fff; font-size:15px; margin:16px 0 6px; }
.answer h4:first-child { margin-top:0; }
.answer strong { color:#FBD9B4; font-weight:700; }
.answer ul { margin:6px 0 6px 2px; padding-left:18px; }
.answer li { margin:4px 0; }
.muted-link { background:none; border:none; color:#9A9DA6; font-size:12.5px; text-decoration:underline; cursor:pointer; padding:0; font-family:var(--body); }
.tip { font-size:12.5px; color:var(--ink-soft); background:var(--amber-soft); border:1px solid #F0D9B8; border-radius:10px; padding:11px 13px; }
.spin { width:15px; height:15px; border:2px solid #555; border-top-color:var(--amber); border-radius:50%; animation:sp .7s linear infinite; display:inline-block; }
@keyframes sp { to { transform:rotate(360deg); } }
.footer-note { font-size:11.5px; color:var(--muted); text-align:center; margin-top:40px; font-family:var(--mono); }
@media (prefers-reduced-motion: reduce) { .vault *, .vault *::before { animation:none !important; transition:none !important; } }
@media (max-width:720px){
  .stats{grid-template-columns:repeat(2,1fr);}
  .cat-grid{grid-template-columns:repeat(2,1fr);} .brand-title{font-size:30px;} .embed-grid{grid-template-columns:1fr;}
}
`;

const LOGO = "data:image/png;base64,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";

const PALETTE = ["#E8852B","#2D7384","#7A4FA3","#C24A5B","#3F8F5B","#D9A226","#4A6FA5","#B5632E","#5E8C61","#9C4F73","#406E8E","#A8632B"];
const OTHER_COLOR = "#C9C2B4";

function typeOf(u = "") {
  if (u.includes("/reel/")) return "Reel";
  if (u.includes("/tv/")) return "IGTV";
  if (u.includes("/p/")) return "Post";
  return "Saved";
}
function fixMojibake(s) { try { return decodeURIComponent(escape(s)); } catch { return s; } }
function extractTags(caption) { return Array.from(new Set((caption.match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.toLowerCase()))); }
function normUrl(u) { return (u || "").replace(/\/+$/, ""); }

/* ---- notes store: persists on a real deploy; degrades to memory in sandboxes ---- */
const NOTES_KEY = "vault_notes_v1";
const noteStore = {
  load() { try { return JSON.parse(window.localStorage.getItem(NOTES_KEY) || "{}"); } catch { return {}; } },
  save(v) { try { window.localStorage.setItem(NOTES_KEY, JSON.stringify(v)); return true; } catch { return false; } },
};

/* newest-wins merge, so notes from another browser/tab never get clobbered */
function mergeNotes(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    if (!cur || (v?.updated || 0) >= (cur?.updated || 0)) out[k] = v;
  }
  return out;
}

const STATUSES = [
  { id: "idea",  label: "💡 Idea",      color: "#D9A226" },
  { id: "shoot", label: "🎬 To shoot",  color: "#C24A5B" },
  { id: "ref",   label: "📚 Reference", color: "#2D7384" },
  { id: "done",  label: "✅ Made it",   color: "#3F8F5B" },
];
const statusOf = (id) => STATUSES.find((s) => s.id === id);
const hasNote = (n) => !!(n && (n.why || n.idea || n.status));

/* ---- the planner box attached to every saved reel ---- */
function NoteEditor({ note, onChange }) {
  const [open, setOpen] = useState(false);
  const n = note || {};
  const filled = hasNote(n);
  const st = statusOf(n.status);

  if (!open) {
    return (
      <div className="note-collapsed" onClick={() => setOpen(true)}>
        {filled ? (
          <>
            {st && <span className="status-pill" style={{ background: st.color }}>{st.label}</span>}
            <span className="note-peek">{n.idea || n.why}</span>
            <span className="note-edit">edit</span>
          </>
        ) : (
          <span className="note-add">✎ add your thinking</span>
        )}
      </div>
    );
  }
  return (
    <div className="note-open">
      <div className="note-statuses">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            className={"st-chip " + (n.status === s.id ? "on" : "")}
            style={n.status === s.id ? { background: s.color, borderColor: s.color, color: "#fff" } : {}}
            onClick={() => onChange({ status: n.status === s.id ? "" : s.id })}
          >{s.label}</button>
        ))}
      </div>
      <label className="note-label">Why I saved this</label>
      <textarea className="note-ta" rows={2} value={n.why || ""} placeholder="the hook? the cut? the lighting?"
        onChange={(e) => onChange({ why: e.target.value })} />
      <label className="note-label">What I want to make with it</label>
      <textarea className="note-ta" rows={2} value={n.idea || ""} placeholder="my version, my angle, which episode…"
        onChange={(e) => onChange({ idea: e.target.value })} />
      <div className="note-actions">
        <button className="btn-mini" onClick={() => setOpen(false)}>Done</button>
        {filled && <button className="btn-mini ghost" onClick={() => { onChange({ why: "", idea: "", status: "" }); setOpen(false); }}>Clear</button>}
      </div>
    </div>
  );
}

/* pull the shortcode out of an instagram link: /reel/ABC123/ -> ABC123 */
function shortcodeOf(url = "") {
  const m = url.match(/instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/* One preview tile. The iframe only mounts once it scrolls near the viewport,
   so 1000+ saves don't nuke the browser. */
function EmbedCard({ rec, showCollection, note, onNote }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);
  const code = shortcodeOf(rec.url);

  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) { setVisible(true); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } });
    }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const clean = rec.caption.replace(/#[\p{L}\p{N}_]+/gu, "").trim();
  return (
    <div className="embed-card">
      <div className="embed-frame" ref={ref}>
        {visible && code ? (
          <iframe
            src={`https://www.instagram.com/reel/${code}/embed/captioned/`}
            loading="lazy"
            allowtransparency="true"
            scrolling="no"
            title={code}
          />
        ) : (
          <div className="ph">
            <span className="ph-ico">▶</span>
            <span>{code ? "loading preview…" : "no preview available"}</span>
          </div>
        )}
      </div>
      <div className="embed-meta">
        <div className="save-top" style={{ marginBottom: 6 }}>
          <span className="pill">{rec.type}</span>
          {showCollection && <span className="coltag">{rec.collection}</span>}
          <a className="open-link" href={rec.url} target="_blank" rel="noreferrer" style={{ marginLeft: "auto" }}>open ↗</a>
        </div>
        {clean && <div className="embed-cap">{clean.slice(0, 110)}{clean.length > 110 ? "…" : ""}</div>}
        <NoteEditor note={note} onChange={onNote} />
      </div>
    </div>
  );
}

/* ---------- format detection ---------- */
function isLV(o) { return o && typeof o === "object" && Array.isArray(o.label_values); }
function getLV(item, label) { for (const lv of item.label_values || []) if (lv.label === label) return lv.href || lv.value || ""; return ""; }
function isCollectionItem(o) { return isLV(o) && o.label_values.some((l) => l.label === "Name") && o.label_values.some((l) => Array.isArray(l.dict)); }
function isFlatItem(o) { return isLV(o) && o.label_values.some((l) => l.label === "URL"); }

/* posts nested inside a collection entry */
function postsInCollection(item) {
  const out = [];
  for (const lv of item.label_values || []) {
    if (!Array.isArray(lv.dict)) continue;
    for (const entry of lv.dict) {
      const inner = entry && entry.dict;
      if (!Array.isArray(inner)) continue;
      let url = "", caption = "";
      for (const f of inner) {
        if (f.label === "URL") url = f.href || f.value || "";
        if (f.label === "Caption") caption = fixMojibake(f.value || "");
      }
      if (url) out.push({ url, caption });
    }
  }
  return out;
}

/* ---------- older-format fallback ---------- */
function pickLink(v) { if (!v || typeof v !== "object") return ""; return (typeof v.href === "string" && v.href) || (typeof v.uri === "string" && v.uri) || ""; }
function looksLikeOldItem(o) {
  if (!o || typeof o !== "object") return false;
  if (o.string_map_data && typeof o.string_map_data === "object" && Object.values(o.string_map_data).some((v) => v && (v.href || v.uri || v.timestamp || v.value))) return true;
  if (Array.isArray(o.string_list_data) && o.string_list_data.length) return true;
  return !!(o.href || o.uri);
}
function readOldItem(o) {
  let href = "", ts = 0, value = "";
  if (o.string_map_data) for (const v of Object.values(o.string_map_data)) { if (!v) continue; if (!href) href = pickLink(v); if (!ts && v.timestamp) ts = v.timestamp; if (!value && v.value) value = v.value; }
  if (Array.isArray(o.string_list_data)) for (const v of o.string_list_data) { if (!v) continue; if (!href) href = pickLink(v); if (!ts && v.timestamp) ts = v.timestamp; if (!value && v.value) value = v.value; }
  if (!href) href = pickLink(o);
  if (!ts) ts = o.timestamp || o.creation_timestamp || 0;
  return { url: href, caption: "", ts: Number(ts) || 0, type: typeOf(href), tags: [] };
}
function collectArrays(node, found = []) {
  if (Array.isArray(node)) { if (node.some(looksLikeOldItem)) found.push(node); else node.forEach((n) => collectArrays(n, found)); }
  else if (node && typeof node === "object") Object.values(node).forEach((v) => collectArrays(v, found));
  return found;
}

const UNFILED = "📥 Uncategorized";

function parseFiles(files) {
  const all = [];
  const errors = [];
  for (const { name, text } of files) {
    let json;
    try { json = JSON.parse(text); } catch { errors.push(`${name}: not valid JSON`); continue; }
    const arr = Array.isArray(json) ? json : (json && typeof json === "object" ? Object.values(json).find((v) => Array.isArray(v)) : null);
    let added = 0;

    if (Array.isArray(arr) && arr.some(isCollectionItem)) {
      for (const item of arr) {
        if (!isCollectionItem(item)) continue;
        const nm = fixMojibake((item.label_values.find((l) => l.label === "Name") || {}).value || "").trim();
        if (!nm) continue;
        const ts = item.timestamp || 0;
        for (const p of postsInCollection(item)) {
          all.push({ url: p.url, caption: p.caption, ts, type: typeOf(p.url), tags: extractTags(p.caption), collection: nm });
          added++;
        }
      }
    }

    if (Array.isArray(arr) && arr.some(isFlatItem)) {
      for (const it of arr) {
        if (!isFlatItem(it)) continue;
        const url = getLV(it, "URL"); if (!url) continue;
        const caption = fixMojibake(getLV(it, "Caption") || "");
        all.push({ url, caption, ts: it.timestamp || 0, type: typeOf(url), tags: extractTags(caption), collection: "__FLAT__" });
        added++;
      }
    }

    if (!added) {
      const arrays = collectArrays(json);
      arrays.forEach((a) => a.forEach((o) => { if (looksLikeOldItem(o)) { all.push({ ...readOldItem(o), collection: "__FLAT__" }); added++; } }));
    }
    if (!added) {
      const keys = json && typeof json === "object" && !Array.isArray(json) ? Object.keys(json).slice(0, 8).join(", ") : (Array.isArray(json) ? "(array)" : typeof json);
      errors.push(`${name}: couldn't read saved items (top-level: [${keys}]).`);
    }
  }

  /* MERGE by URL: a real collection name beats __FLAT__, captions fill gaps */
  const byUrl = new Map();
  for (const r of all) {
    const key = normUrl(r.url) || (r.collection + Math.random());
    if (!byUrl.has(key)) { byUrl.set(key, { ...r }); continue; }
    const ex = byUrl.get(key);
    if (ex.collection === "__FLAT__" && r.collection !== "__FLAT__") ex.collection = r.collection;
    if (!ex.caption && r.caption) { ex.caption = r.caption; ex.tags = r.tags; }
    if (!ex.ts && r.ts) ex.ts = r.ts;
  }
  let records = [...byUrl.values()].map((r) => ({ ...r, collection: r.collection === "__FLAT__" ? UNFILED : r.collection }));
  const cols = new Set(records.map((r) => r.collection));
  if (cols.size === 1 && cols.has(UNFILED)) records = records.map((r) => ({ ...r, collection: "All Saved" }));
  return { records, errors };
}

function buildSample() {
  const cols = { "I like style of video": 22, "U2ber academy": 18, "Studio design": 14, "Viral hooks": 11, "Acting": 9, "Content ideas": 8, "After effects": 6, "📥 Uncategorized": 7 };
  const caps = ["3 transitions every editor should know #videoediting #aftereffects", "How I color grade cinematic footage #cinematic #colorgrading", "The hook formula that doubled views #contentcreator #reels", "Podcast studio setup on a budget #studio #podcast", "Behind the scenes of a one-man shoot #filmmaking #bts"];
  const recs = [];
  const now = Date.now();
  Object.entries(cols).forEach(([collection, n]) => {
    for (let i = 0; i < n; i++) {
      const ts = Math.floor((now - Math.random() * 1000 * 60 * 60 * 24 * 320) / 1000);
      const id = Math.random().toString(36).slice(2, 13);
      const caption = caps[Math.floor(Math.random() * caps.length)];
      recs.push({ url: `https://www.instagram.com/reel/${id}/`, caption, ts, type: "Reel", tags: extractTags(caption), collection });
    }
  });
  return recs;
}

function renderAnswer(text) {
  const inline = (s) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>);
  const lines = text.split("\n"); const out = []; let bullets = [];
  const flush = () => { if (bullets.length) { out.push(<ul key={"u" + out.length}>{bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}</ul>); bullets = []; } };
  lines.forEach((raw, i) => {
    const l = raw.trim();
    if (!l) { flush(); return; }
    if (/^#{1,4}\s/.test(l)) { flush(); out.push(<h4 key={i}>{inline(l.replace(/^#{1,4}\s/, ""))}</h4>); return; }
    if (/^(\*\*[^*]+\*\*):?$/.test(l) && l.length < 64) { flush(); out.push(<h4 key={i}>{inline(l.replace(/\*\*/g, "").replace(/:$/, ""))}</h4>); return; }
    if (/^[-*•]\s/.test(l)) { bullets.push(l.replace(/^[-*•]\s/, "")); return; }
    if (/^\d+[.)]\s/.test(l)) { bullets.push(l.replace(/^\d+[.)]\s/, "")); return; }
    flush(); out.push(<p key={i} style={{ margin: "8px 0" }}>{inline(l)}</p>);
  });
  flush(); return out;
}

export default function SavedReels({ me }) {
  const [records, setRecords] = useState(null);
  const [vaultLoaded, setVaultLoaded] = useState(false);
  const [vaultState, setVaultState] = useState("idle");
  const [errors, setErrors] = useState([]);
  const [hot, setHot] = useState(false);
  const [selCol, setSelCol] = useState(null);
  const [showAllCols, setShowAllCols] = useState(false);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("grid");
  const [limit, setLimit] = useState(24);
  const [notes, setNotes] = useState({});
  const [pfilter, setPfilter] = useState("all");
  const [serverOk, setServerOk] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const fileRef = useRef();
  const browseRef = useRef();
  const notesFileRef = useRef();

  const ingest = useCallback(async (fileList) => {
    const arr = Array.from(fileList).filter((f) => /\.json$/i.test(f.name));
    if (!arr.length) { setErrors(["Please drop .json files from your Instagram export."]); return; }
    const read = await Promise.all(arr.map((f) => f.text().then((t) => ({ name: f.name, text: t }))));
    const { records: recs, errors: errs } = parseFiles(read);
    if (!recs.length) { setErrors(errs.length ? errs : ["No saved posts found."]); return; }
    setRecords(recs); setErrors(errs); setSelCol(null); setShowAllCols(false); setAnswer(""); setSearch("");
  }, []);

  /* store the whole vault server-side, under this user's account */
  const saveVault = useCallback(async (recs) => {
    try {
      setVaultState("saving");
      const r = await fetch("/api/data/savedreels_vault", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: { records: recs, savedAt: Date.now() } }),
      });
      setVaultState(r.ok ? "saved" : "local");
    } catch { setVaultState("local"); }
  }, []);

  /* Whenever the vault changes from a user action (upload or sample), push it to the
     server — but NOT when it was just auto-loaded FROM the server on login. */
  const skipVaultSave = useRef(true);
  useEffect(() => {
    if (skipVaultSave.current) { skipVaultSave.current = false; return; }
    if (records && records.length) saveVault(records);
  }, [records, saveVault]);

  const stats = useMemo(() => {
    if (!records) return null;
    const byCol = {}, byTag = {}, byType = {}, byMonth = {};
    let minTs = Infinity, maxTs = 0;
    records.forEach((r) => {
      byCol[r.collection] = (byCol[r.collection] || 0) + 1;
      byType[r.type] = (byType[r.type] || 0) + 1;
      r.tags.forEach((t) => byTag[t] = (byTag[t] || 0) + 1);
      if (r.ts) { minTs = Math.min(minTs, r.ts); maxTs = Math.max(maxTs, r.ts); const d = new Date(r.ts * 1000); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; byMonth[k] = (byMonth[k] || 0) + 1; }
    });
    const total = records.length;
    const collections = Object.entries(byCol).map(([name, count], i) => ({ name, count, share: count / total, color: name === UNFILED ? OTHER_COLOR : PALETTE[i % PALETTE.length] })).sort((a, b) => b.count - a.count);
    const themes = Object.entries(byTag).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
    const timeline = Object.entries(byMonth).map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month));
    const fmt = (ts) => ts && ts !== Infinity ? new Date(ts * 1000).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—";
    const multiCol = collections.length > 1;
    const unfiled = byCol[UNFILED] || 0;
    return { total, collections, themes, byType, timeline, from: fmt(minTs), to: fmt(maxTs), multiCol, unfiled };
  }, [records]);

  const filtered = useMemo(() => {
    if (!records) return [];
    let base = [...records].sort((a, b) => b.ts - a.ts);
    if (selCol) base = base.filter((r) => r.collection === selCol);
    if (pfilter === "noted") base = base.filter((r) => hasNote(notes[normUrl(r.url)]));
    else if (pfilter !== "all") base = base.filter((r) => (notes[normUrl(r.url)] || {}).status === pfilter);
    const s = search.trim().toLowerCase();
    if (s) base = base.filter((r) => {
      const n = notes[normUrl(r.url)] || {};
      return r.caption.toLowerCase().includes(s) || r.tags.some((t) => t.includes(s)) || r.url.toLowerCase().includes(s) ||
        r.collection.toLowerCase().includes(s) || (n.why || "").toLowerCase().includes(s) || (n.idea || "").toLowerCase().includes(s);
    });
    return base;
  }, [records, search, selCol, pfilter, notes]);

  useEffect(() => { setLimit(24); }, [search, selCol, view, pfilter]);

  /* On login: pull this user's notes AND their saved vault from the server. */
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await fetch("/api/data/savedreels", { credentials: "include" });
        if (!r.ok) throw new Error("no api");
        const server = await r.json();
        if (dead) return;
        setNotes(server || {});
        setServerOk(true);
        setSaveState("saved");
      } catch {
        if (!dead) { setServerOk(false); setSaveState("local"); }
      }
      // load the vault itself, if this user has uploaded before
      try {
        const rv = await fetch("/api/data/savedreels_vault", { credentials: "include" });
        if (rv.ok) {
          const v = await rv.json();
          const saved = v && v.records && Array.isArray(v.records.records) ? v.records.records : null;
          if (!dead && saved && saved.length) { skipVaultSave.current = true; setRecords(saved); setVaultState("saved"); }
        }
      } catch {}
      if (!dead) setVaultLoaded(true);
    })();
    return () => { dead = true; };
  }, []);

  /* Persist: always cache locally; push to the server (debounced) when present. */
  const firstSave = useRef(true);
  useEffect(() => {
    /* server-persisted */;
    if (firstSave.current) { firstSave.current = false; return; }
    if (!serverOk) { setSaveState("local"); return; }
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/data/savedreels", {
          method: "PUT", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(notes),
        });
        setSaveState(r.ok ? "saved" : "local");
      } catch { setSaveState("local"); }
    }, 700);
    return () => clearTimeout(t);
  }, [notes, serverOk]);

  const setNote = useCallback((url, patch) => {
    const k = normUrl(url);
    setNotes((prev) => ({ ...prev, [k]: { ...(prev[k] || {}), ...patch, updated: Date.now() } }));
  }, []);

  const noteCounts = useMemo(() => {
    const c = { noted: 0 };
    STATUSES.forEach((s) => c[s.id] = 0);
    Object.values(notes).forEach((n) => {
      if (hasNote(n)) c.noted++;
      if (n.status && c[n.status] !== undefined) c[n.status]++;
    });
    return c;
  }, [notes]);

  const pickCol = (name) => {
    setSelCol(selCol === name ? null : name);
    setTimeout(() => browseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const askClaude = useCallback(async (question) => {
    if (!question.trim() || !stats) return;
    setLoading(true); setAiErr(""); setAnswer("");
    const sampleCaptions = records.filter((r) => r.caption).slice(0, 45).map((r) => ({ collection: r.collection, caption: r.caption.slice(0, 200), tags: r.tags.slice(0, 5) }));
    const myNotes = records
      .map((r) => ({ r, n: notes[normUrl(r.url)] }))
      .filter(({ n }) => hasNote(n))
      .slice(0, 60)
      .map(({ r, n }) => ({
        collection: r.collection,
        caption: r.caption.slice(0, 90),
        url: r.url,
        status: n.status ? (statusOf(n.status) || {}).label : "",
        whySaved: n.why || "",
        whatIWantToMake: n.idea || "",
      }));
    const context = {
      totalSaves: stats.total,
      uncategorized: stats.unfiled,
      dateRange: `${stats.from} to ${stats.to}`,
      mediaTypes: stats.byType,
      collections: stats.collections.map((c) => ({ name: c.name, count: c.count })),
      topHashtags: stats.themes.slice(0, 40),
      monthlyTimeline: stats.timeline,
      sampleSavedCaptions: sampleCaptions,
      myAnnotations: myNotes,
      annotationCount: noteCounts.noted,
    };
    const sys = `You are a sharp, practical content strategist for an Indian creator who runs U2berClub, a podcast & short-form video studio, and a creator-education program. They have a large Instagram "saved" vault organized into their own collections, and you can SEE the captions + hashtags. Turn the hoard into action: content series, pillars, scripts, studio decisions, systems.

Rules:
- Be specific. Reference their REAL collection names and themes from the data.
- "myAnnotations" are the user's OWN notes on individual reels (why they saved it, what they want to make). These are the highest-signal input you have — their actual intent. Prioritize them heavily and build plans around them when present.
- Indian creator context. If the user writes Hinglish, reply in Hinglish.
- Short bold headers, tight bullets. No preamble, no restating the question.
- End with one clear next step.`;
    const userMsg = `My Instagram saved vault, merged from collections + loose saves, including my own notes on reels I annotated (JSON):\n${JSON.stringify(context)}\n\nMy request: ${question}`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1600, system: sys, messages: [{ role: "user", content: userMsg }] }),
      });
      const data = await res.json();
      const txt = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      txt ? setAnswer(txt) : setAiErr("No response came back. Try rephrasing.");
    } catch { setAiErr("Couldn't reach Claude just now. Check connection and retry."); }
    finally { setLoading(false); }
  }, [stats, records]);

  /* Full backup of just the notes — restore on any machine, any browser */
  const exportNotes = () => {
    const blob = new Blob([JSON.stringify(notes, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `savedreels-notes-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const restoreNotes = async (fileList) => {
    const f = fileList && fileList[0]; if (!f) return;
    try {
      const incoming = JSON.parse(await f.text());
      setNotes((prev) => mergeNotes(prev, incoming));
      alert(`Restored ${Object.keys(incoming).length} notes (merged — newest wins).`);
    } catch { alert("That file didn't look like a notes backup."); }
  };

  /* Notion-ready table: one row per annotated reel, columns Notion maps cleanly.
     First column becomes the Title property on import. */
  const exportNotion = () => {
    const annotated = records
      .map((r) => ({ r, n: notes[normUrl(r.url)] }))
      .filter(({ n }) => hasNote(n))
      .sort((a, b) => (b.n.updated || 0) - (a.n.updated || 0));
    if (!annotated.length) { alert("Nothing to export yet — add your thinking to a few reels first."); return; }

    // newlines break table cells in some importers; fold them into a separator
    const flat = (s) => String(s ?? "").replace(/\s*\n+\s*/g, " · ").replace(/\s+/g, " ").trim();
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const title = (r, n) => {
      const cap = r.caption.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim();
      return flat(n.idea || cap || r.collection || "Saved reel").slice(0, 80);
    };

    const header = ["Name", "Status", "Why I Saved It", "What I Want To Make", "Collection", "Link", "Saved On", "Hashtags", "Caption"];
    const rows = [header];
    annotated.forEach(({ r, n }) => {
      const st = n.status ? (statusOf(n.status) || {}).label || "" : "";
      rows.push([
        title(r, n),
        flat(st).replace(/^[^\p{L}]+/u, ""),      // drop the emoji so Notion select options stay clean
        flat(n.why),
        flat(n.idea),
        flat(r.collection),
        r.url,
        r.ts ? new Date(r.ts * 1000).toISOString().slice(0, 10) : "",
        r.tags.join(" "),
        flat(r.caption).slice(0, 300),
      ]);
    });

    // BOM keeps Hindi/emoji intact in Notion, Excel and Sheets
    const csv = "\uFEFF" + rows.map((row) => row.map((c) => esc(c)).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `savedreels-for-notion-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const rows = [["collection", "type", "status", "why_saved", "what_to_make", "caption", "hashtags", "url", "saved_on"]];
    records.forEach((r) => {
      const n = notes[normUrl(r.url)] || {};
      rows.push([r.collection, r.type, n.status ? (statusOf(n.status) || {}).label : "", n.why || "", n.idea || "",
        r.caption.replace(/\s+/g, " "), r.tags.join(" "), r.url, r.ts ? new Date(r.ts * 1000).toISOString().slice(0, 10) : ""]);
    });
    const csv = rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "savedreels.csv"; a.click(); URL.revokeObjectURL(url);
  };

  /* Export ONLY the reels I've annotated, grouped by status — my actual content plan */
  const exportPlan = () => {
    const annotated = records.map((r) => ({ r, n: notes[normUrl(r.url)] })).filter(({ n }) => hasNote(n));
    if (!annotated.length) { alert("No notes yet — add your thinking to a few reels first."); return; }
    let md = `# My Content Plan\n\n_${annotated.length} annotated saves · exported ${new Date().toLocaleDateString("en-IN")}_\n`;
    const groups = [...STATUSES, { id: "", label: "📝 Unsorted" }];
    groups.forEach((g) => {
      const items = annotated.filter(({ n }) => (n.status || "") === g.id);
      if (!items.length) return;
      md += `\n## ${g.label} (${items.length})\n\n`;
      items.forEach(({ r, n }) => {
        const cap = r.caption.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim().slice(0, 80);
        md += `### ${cap || "Saved reel"}\n`;
        md += `- **Link:** ${r.url}\n- **Collection:** ${r.collection}\n`;
        if (n.why) md += `- **Why I saved it:** ${n.why}\n`;
        if (n.idea) md += `- **What I want to make:** ${n.idea}\n`;
        md += `\n`;
      });
    });
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = document.createElement("a"); a.href = url; a.download = "savedreels-content-plan.md"; a.click(); URL.revokeObjectURL(url);
  };

  const chips = [
    "Turn my notes into a shoot-ready plan",
    "Read my 'To shoot' reels and script the first one",
    "Merge my collections into 6-8 content pillars",
    "Give me 10 reel ideas from my Viral hooks + Content ideas",
    "Mere notes se ek 7-din ka shooting plan banao (Hinglish)",
  ];

  const spectrumSegs = useMemo(() => {
    if (!stats) return [];
    const top = stats.collections.slice(0, 12);
    const restCount = stats.collections.slice(12).reduce((s, c) => s + c.count, 0);
    const segs = top.map((c) => ({ name: c.name, count: c.count, color: c.color }));
    if (restCount > 0) segs.push({ name: "Other", count: restCount, color: OTHER_COLOR });
    return segs;
  }, [stats]);

  return (
    <div className="vault">
      <style>{CSS}</style>
      <div className="wrap">
        <div className="masthead">
          <div className="brand-lockup">
            <img src={LOGO} alt="U2berClub" className="brand-logo" />
            <div>
              <div className="brand-eyebrow">U2berClub Tools · Making Creators Smart</div>
              <h1 className="brand-title">SAVED<span className="brand-accent">REELS</span></h1>
            <p className="brand-sub">Every reel you saved, finally working for you. Drop your <b>saved_collections.json</b> + <b>saved_posts.json</b> — see them all, note why you saved them, and turn them into content.</p>
            </div>
          </div>
          {stats && <div className="vault-counter"><div className="n">{stats.total}</div><div className="l">reels saved</div></div>}
        </div>

        {!records && !vaultLoaded && (
          <div style={{ marginTop: 40, textAlign: "center", color: "var(--muted)", fontFamily: "var(--mono)", fontSize: 13 }}>
            Loading your vault…
          </div>
        )}

        {!records && vaultLoaded && (
          <>
            <div className={"drop " + (hot ? "hot" : "")} style={{ marginTop: 22 }}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setHot(true); }}
              onDragLeave={() => setHot(false)}
              onDrop={(e) => { e.preventDefault(); setHot(false); ingest(e.dataTransfer.files); }}>
              <div className="drop-mark">📁</div>
              <h3>Drop both JSON files here</h3>
              <p>saved_collections.json + saved_posts.json — select both and drop them together</p>
              <p style={{ marginTop: 10, color: "var(--muted)" }}>Parsed in your browser. Nothing is uploaded.</p>
              <input ref={fileRef} type="file" accept=".json" multiple hidden onChange={(e) => ingest(e.target.files)} />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn btn-amber" onClick={() => setRecords(buildSample())}>Try it with sample data</button>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Want to see it work first? Load a demo vault.</span>
            </div>
            <div className="section" style={{ marginTop: 26 }}>
              <div className="tip">
                <strong>Get both files:</strong> Instagram → Accounts Center → <b>Export your information</b> → tick <b>Saved</b> → Format <b>JSON</b>, <b>All time</b> → unzip the email → open <span style={{ fontFamily: "var(--mono)" }}>your_instagram_activity / saved /</span> and grab both <b>saved_collections.json</b> and <b>saved_posts.json</b>.
              </div>
            </div>
            {!!errors.length && <div style={{ marginTop: 14, fontSize: 13, color: "#B23A48" }}>{errors.map((e, i) => <div key={i}>⚠ {e}</div>)}</div>}
          </>
        )}

        {records && stats && (
          <>
            <div className="section" style={{ marginTop: 18 }}>
              <div className="spectrum-legend">
                {spectrumSegs.slice(0, 8).map((c) => (<span key={c.name}><i className="dot" style={{ background: c.color }} />{c.name} · {c.count}</span>))}
              </div>
              <div className="filmstrip">
                <div className="sprockets" />
                <div className="spectrum">
                  {spectrumSegs.map((c) => (<div key={c.name} className="spectrum-seg" title={`${c.name}: ${c.count}`} style={{ flex: c.count, background: c.color }} />))}
                </div>
                <div className="sprockets" />
              </div>
            </div>

            <div className="stats">
              <div className="stat"><div className="v">{stats.total}</div><div className="k">Total saves</div></div>
              <div className="stat"><div className="v">{stats.collections.length}</div><div className="k">Collections</div></div>
              <div className="stat"><div className="v">{stats.unfiled || (stats.byType.Reel || 0)}</div><div className="k">{stats.unfiled ? "Uncategorized" : "Reels"}</div></div>
              <div className="stat"><div className="v" style={{ fontSize: 15, paddingTop: 4 }}>{stats.from} – {stats.to}</div><div className="k">Date range</div></div>
            </div>

            {stats.multiCol && (
              <div className="section">
                <div className="section-head">
                  <span className="section-idx">01</span>
                  <span className="section-title">Your collections</span>
                  <span className="section-note">{selCol ? `filtering: ${selCol}` : "tap one to browse it"}</span>
                </div>
                <div className="cat-grid">
                  {(showAllCols ? stats.collections : stats.collections.slice(0, 24)).map((c, i) => (
                    <div key={c.name} className={"cat " + (selCol === c.name ? "active" : "")} onClick={() => pickCol(c.name)}>
                      <div className="cat-top"><span className="cat-idx">{String(i + 1).padStart(2, "0")}</span><span className="cat-count" style={{ color: c.color }}>{c.count}</span></div>
                      <div className="cat-name" title={c.name}>{c.name}</div>
                      <div className="cat-bar"><i style={{ width: Math.max(5, c.share * 100) + "%", background: c.color }} /></div>
                    </div>
                  ))}
                </div>
                {stats.collections.length > 24 && (
                  <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setShowAllCols(!showAllCols)}>
                    {showAllCols ? "Show top 24 only" : `Show all ${stats.collections.length} collections`}
                  </button>
                )}
              </div>
            )}

            <div className="section">
              <div className="section-head"><span className="section-idx">{stats.multiCol ? "02" : "01"}</span><span className="section-title">Your themes</span><span className="section-note">from captions across all saves</span></div>
              <div className="panel">
                <ResponsiveContainer width="100%" height={Math.min(15, stats.themes.length) * 26 + 20}>
                  <BarChart layout="vertical" data={stats.themes.slice(0, 15)} margin={{ left: 10, right: 22 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="tag" width={140} tick={{ fontSize: 11, fill: "#2A2E3A", fontFamily: "Space Mono" }} />
                    <Tooltip cursor={{ fill: "#FBE9D2" }} />
                    <Bar dataKey="count" radius={[0, 5, 5, 0]}>{stats.themes.slice(0, 15).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="section">
              <div className="section-head"><span className="section-idx">{stats.multiCol ? "03" : "02"}</span><span className="section-title">When you save</span></div>
              <div className="panel">
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={stats.timeline} margin={{ left: -18, right: 8, top: 6 }}>
                    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E8852B" stopOpacity={0.5} /><stop offset="100%" stopColor="#E8852B" stopOpacity={0.04} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEE8DC" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#71757E" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#71757E" }} allowDecimals={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="count" stroke="#E8852B" strokeWidth={2} fill="url(#g)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="section" ref={browseRef}>
              <div className="section-head">
                <span className="section-idx">{stats.multiCol ? "04" : "03"}</span>
                <span className="section-title">Browse your reels</span>
                <span className="section-note">{filtered.length} {selCol ? `in ${selCol}` : "saves"}</span>
              </div>
              {selCol && <div style={{ marginBottom: 10 }}><button className="muted-link" onClick={() => setSelCol(null)}>← clear "{selCol}" filter</button></div>}
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                <input className="search" style={{ flex: 1, minWidth: 220 }} placeholder="Search captions, hashtags, collection, links…  e.g. hook, studio, transition" value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className="vtoggle">
                  <button className={view === "grid" ? "on" : ""} onClick={() => setView("grid")}>▦ Previews</button>
                  <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>☰ List</button>
                </div>
              </div>

              <div className="filter-chips">
                <button className={"fchip " + (pfilter === "all" ? "on" : "")} onClick={() => setPfilter("all")}>All</button>
                <button className={"fchip " + (pfilter === "noted" ? "on" : "")} onClick={() => setPfilter("noted")}>✎ My notes · {noteCounts.noted}</button>
                {STATUSES.map((s) => (
                  <button key={s.id} className={"fchip " + (pfilter === s.id ? "on" : "")} onClick={() => setPfilter(s.id)}
                    style={pfilter === s.id ? { background: s.color, borderColor: s.color } : {}}>
                    {s.label} · {noteCounts[s.id]}
                  </button>
                ))}
                <span className={"save-dot " + saveState} title={serverOk ? "Notes are saved to notes.json on your server" : "No server detected — notes are saved in this browser only"}>
                  {saveState === "saving" ? "saving…" : saveState === "saved" ? "✓ saved to disk" : "browser only"}
                </span>
                <button className="fchip" onClick={exportNotes} title="Download a backup of all your notes">⤓ backup notes</button>
                <button className="fchip" onClick={() => notesFileRef.current?.click()} title="Restore notes from a backup file">⤒ restore</button>
                <input ref={notesFileRef} type="file" accept=".json" hidden onChange={(e) => restoreNotes(e.target.files)} />
              </div>

              {view === "grid" ? (
                <>
                  <div className="embed-grid">
                    {filtered.slice(0, limit).map((r, i) => (
                      <EmbedCard key={r.url + i} rec={r} showCollection={stats.multiCol}
                        note={notes[normUrl(r.url)]} onNote={(patch) => setNote(r.url, patch)} />
                    ))}
                  </div>
                  {!filtered.length && <div style={{ color: "var(--muted)", fontSize: 13, padding: "20px 2px" }}>Nothing here. Try another word or clear the filter.</div>}
                  {filtered.length > limit && (
                    <div className="load-more">
                      <button className="btn btn-ghost" onClick={() => setLimit(limit + 24)}>
                        Load 24 more · showing {limit} of {filtered.length}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ maxHeight: 620, overflow: "auto", paddingRight: 4 }}>
                  {filtered.slice(0, 200).map((r, i) => (
                    <div className="save-row" key={i}>
                      <div className="save-top">
                        <span className="pill">{r.type}</span>
                        {stats.multiCol && <span className="coltag">{r.collection}</span>}
                        <a className="open-link" href={r.url} target="_blank" rel="noreferrer" style={{ marginLeft: "auto" }}>open ↗</a>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{r.ts ? new Date(r.ts * 1000).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : ""}</span>
                      </div>
                      {r.caption && <div className="save-cap">{(r.caption.replace(/#[\p{L}\p{N}_]+/gu, "").trim().slice(0, 170) || r.caption.slice(0, 170))}{r.caption.length > 170 ? "…" : ""}</div>}
                      {!!r.tags.length && <div className="save-tags">{r.tags.slice(0, 6).map((t) => <span className="tag" key={t}>{t}</span>)}</div>}
                      <NoteEditor note={notes[normUrl(r.url)]} onChange={(patch) => setNote(r.url, patch)} />
                    </div>
                  ))}
                  {!filtered.length && <div style={{ color: "var(--muted)", fontSize: 13, padding: "20px 2px" }}>Nothing here. Try another word or clear the filter.</div>}
                  {filtered.length > 200 && <div style={{ color: "var(--muted)", fontSize: 12, padding: "8px 2px", fontFamily: "var(--mono)" }}>showing first 200 — narrow with search</div>}
                </div>
              )}
            </div>

            <div className="section">
              <div className="section-head"><span className="section-idx">{stats.multiCol ? "05" : "04"}</span><span className="section-title">Ask your reels</span></div>
              <div className="ai">
                <div className="ai-eyebrow">Claude · content strategist</div>
                <h3>What do you want to build from this?</h3>
                <p className="sub">Claude reads your collections + captions. Tell it what to make.</p>
                <div className="chips">{chips.map((c) => <button key={c} className="chip" onClick={() => { setQ(c); askClaude(c); }}>{c}</button>)}</div>
                <textarea value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Turn my top 5 collections into a 2-week U2berClub content calendar…" />
                <div className="ai-row">
                  <button className="btn btn-amber" disabled={loading || !q.trim()} onClick={() => askClaude(q)}>{loading ? <><span className="spin" />&nbsp; Thinking…</> : "Ask Claude"}</button>
                  <button className="btn btn-ghost" style={{ color: "#E7E4DC", borderColor: "#33363F" }} onClick={exportNotion}>Export for Notion (.csv)</button>
                  <button className="btn btn-ghost" style={{ color: "#E7E4DC", borderColor: "#33363F" }} onClick={exportPlan}>Export content plan (.md)</button>
                  <button className="btn btn-ghost" style={{ color: "#E7E4DC", borderColor: "#33363F" }} onClick={exportCSV}>Export CSV</button>
                  <button className="muted-link" style={{ marginLeft: "auto" }} onClick={() => { fetch("/api/data/savedreels_vault/records", { method: "DELETE", credentials: "include" }).catch(() => {}); setRecords(null); setVaultState("idle"); setErrors([]); setAnswer(""); setQ(""); setSearch(""); setSelCol(null); }}>Load different files</button>
                </div>
                {aiErr && <div style={{ color: "#F0A0A0", fontSize: 13, marginTop: 12 }}>{aiErr}</div>}
                {answer && <div className="answer">{renderAnswer(answer)}</div>}
              </div>
            </div>

            {!!errors.length && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>Notes: {errors.join(" · ")}</div>}
          </>
        )}
        <div className="footer-note">SAVEDREELS · a U2berClub tool · parsed locally, nothing uploaded</div>
      </div>
    </div>
  );
}
