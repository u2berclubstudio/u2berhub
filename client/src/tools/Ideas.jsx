import React, { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../theme.js";

const TYPES = ["Idea", "Task", "Decision", "Note"];
const STATUSES = ["Inbox", "Shortlisted", "Scripted", "Shot", "Published", "Dropped"];
const CATS = ["Reel", "YouTube", "Ad Concept", "Hook/Copy", "Product",
              "Strategy", "Offer/Pricing", "Ops", "Personal"];
const BRANDS = ["Honest Digital Marketer", "100 Days 100 Videos", "U2ber Club", "3BROS",
                "BiteEarn", "Top 3 Club", "Made in Ludhiana", "Restaurant", "Client Work", "Unassigned"];

const TYPE_COLOR = { Idea: "#2D7384", Task: "#E8852B", Decision: "#C24A5B", Note: "#71757E" };
const STATUS_COLOR = {
  Inbox: "#71757E", Shortlisted: "#B8860B", Scripted: "#E8852B",
  Shot: "#2D7384", Published: "#3F8F5B", Dropped: "#C24A5B",
};

const CSS = `
.ideas-bar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin:16px 0 10px; }
.ideas-bar select, .ideas-bar input { border:1px solid var(--line); border-radius:8px; padding:8px 10px;
  font-family:var(--body); font-size:13px; background:#fff; }
.ideas-bar input { min-width:200px; flex:1; }
.chipbar { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px; }
.chip { font-family:var(--mono); font-size:10.5px; letter-spacing:.04em; padding:5px 10px; border-radius:20px;
  border:1px solid var(--line); background:#fff; cursor:pointer; text-transform:uppercase; }
.chip.on { background:var(--ink); color:#fff; border-color:var(--ink); }
.chip .n { opacity:.55; margin-left:5px; }
table.ideas { width:100%; border-collapse:collapse; font-size:13px; background:#fff;
  border:1px solid var(--line); border-radius:12px; overflow:hidden; }
table.ideas th { text-align:left; font-family:var(--mono); font-size:9.5px; text-transform:uppercase;
  letter-spacing:.09em; color:var(--muted); padding:9px 10px; border-bottom:1px solid var(--line); background:#FDFCF9; }
table.ideas td { padding:10px; border-bottom:1px solid var(--line); vertical-align:top; }
table.ideas tr:last-child td { border-bottom:none; }
table.ideas tr.sel { background:#FFF9F0; }
table.ideas tr.gone td { opacity:.5; }
.i-title { font-weight:600; cursor:pointer; line-height:1.4; }
.i-title:hover { color:var(--amber); }
.i-sum { color:var(--muted); font-size:12px; margin-top:3px; line-height:1.45; }
.tag { font-family:var(--mono); font-size:9.5px; padding:2px 7px; border-radius:5px; color:#fff;
  text-transform:uppercase; letter-spacing:.05em; white-space:nowrap; }
.tag.soft { background:#F2EFE7; color:var(--muted); }
.tag.warnflag { background:#FBE9D2; color:#8A5A1E; text-transform:none; letter-spacing:0; font-size:10.5px; }
.raw { white-space:pre-wrap; line-height:1.65; font-size:14px; background:var(--paper);
  border:1px solid var(--line); border-radius:10px; padding:14px; margin-top:6px; }
.drop { border:2px dashed var(--line); border-radius:12px; padding:22px; text-align:center;
  color:var(--muted); font-size:13.5px; cursor:pointer; background:#fff; }
.drop.over { border-color:var(--amber); background:#FFFBF5; }
.sticky-actions { position:sticky; bottom:0; background:var(--ink); color:#fff; border-radius:12px;
  padding:12px 16px; display:flex; gap:10px; align-items:center; margin-top:14px; font-size:13.5px; }
.sticky-actions select { border:none; border-radius:7px; padding:7px 9px; font-size:13px; font-family:var(--body); }
.modal-bg { position:fixed; inset:0; background:rgba(21,23,30,.55); display:flex; align-items:center;
  justify-content:center; padding:20px; z-index:50; }
.modal { background:#fff; border-radius:16px; padding:24px; max-width:680px; width:100%;
  max-height:85vh; overflow:auto; }
`;

export default function Ideas({ me }) {
  const [ideas, setIdeas] = useState([]);
  const [counts, setCounts] = useState({});
  const [status, setStatus] = useState("");
  const [brand, setBrand] = useState("");
  const [type, setType] = useState("");
  const [term, setTerm] = useState("");
  const [sel, setSel] = useState([]);
  const [open, setOpen] = useState(null);
  const [projects, setProjects] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (brand) p.set("brand", brand);
    if (type) p.set("type", type);
    if (term) p.set("q", term);
    const d = await api.get("/api/ideas?" + p.toString());
    setIdeas(d.ideas || []);
    setCounts(d.counts || {});
  }, [status, brand, type, term]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/api/ideas/cf-projects").then((d) => setProjects(d.projects || [])); }, []);

  const total = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function importFile(file) {
    setBusy(true); setMsg("");
    try {
      const json = JSON.parse(await file.text());
      const items = Array.isArray(json) ? json : json.items;
      if (!Array.isArray(items)) throw new Error("File me 'items' array nahi mila.");
      const r = await api.post("/api/ideas/import", { items });
      if (r.error) throw new Error(r.error);
      setMsg(`${r.imported} nayi ideas aayi${r.skipped ? ` · ${r.skipped} pehle se thi` : ""}.`);
      load();
    } catch (e) { setMsg("Nahi ho paya: " + e.message); }
    setBusy(false);
  }

  async function patch(id, body) {
    const r = await api.patch("/api/ideas/" + id, body);
    if (!r.error) setIdeas((list) => list.map((i) => (i.id === r.id ? r : i)));
  }

  async function doPromote(mode, projectId) {
    setBusy(true);
    const r = await api.post("/api/ideas/bulk-promote", { ids: sel, mode, projectId });
    setBusy(false);
    if (r.error) { setMsg("Nahi ho paya: " + r.error); return; }
    setMsg(mode === "existing"
      ? `${r.moved} ideas project me chali gayi.`
      : `${r.moved} ContentFlow project ban gaye.`);
    setSel([]); load();
    api.get("/api/ideas/cf-projects").then((d) => setProjects(d.projects || []));
  }

  const fmt = (t) => t ? new Date(t).toLocaleString("en-IN",
    { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) : "—";

  return (
    <div className="wrap">
      <style>{CSS}</style>
      <div className="eyebrow">Tool</div>
      <div className="h1">IDEAS</div>
      <div className="sub">Jo bola, wo yahan hai. Chaanto, aur jo video banega use ContentFlow me bhej do.</div>

      {/* upload */}
      <div style={{ marginTop: 20 }}>
        <label
          className={"drop" + (over ? " over" : "")}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) importFile(f); }}
          style={{ display: "block" }}
        >
          <input type="file" accept=".json,application/json" hidden
                 onChange={(e) => e.target.files[0] && importFile(e.target.files[0])} />
          <strong>Wispr JSON yahan daalo</strong><br />
          <span style={{ fontSize: 12.5 }}>
            exports/ideas-YYYY-MM-DD.json — ek file do baar daalo ya poore hafte ki ek saath, duplicate nahi banegi
          </span>
        </label>
        {msg && <div className={msg.startsWith("Nahi") ? "err" : "ok"}>{msg}</div>}
      </div>

      {/* status chips */}
      <div className="chipbar" style={{ marginTop: 18 }}>
        <button className={"chip" + (status === "" ? " on" : "")} onClick={() => setStatus("")}>
          All <span className="n">{total}</span>
        </button>
        {STATUSES.map((s) => (
          <button key={s} className={"chip" + (status === s ? " on" : "")} onClick={() => setStatus(s)}>
            {s} <span className="n">{counts[s] || 0}</span>
          </button>
        ))}
      </div>

      <div className="ideas-bar">
        <input placeholder="Dhoondo — title, summary ya jo bola tha usme…"
               value={term} onChange={(e) => setTerm(e.target.value)} />
        <select value={brand} onChange={(e) => setBrand(e.target.value)}>
          <option value="">Sab brands</option>
          {BRANDS.map((b) => <option key={b}>{b}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Sab types</option>
          {TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>

      <table className="ideas">
        <thead>
          <tr>
            <th style={{ width: 30 }}></th>
            <th style={{ width: 110 }}>Kab</th>
            <th>Kya</th>
            <th style={{ width: 78 }}>Type</th>
            <th style={{ width: 150 }}>Brand</th>
            <th style={{ width: 118 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {ideas.map((i) => (
            <tr key={i.id} className={(sel.includes(i.id) ? "sel " : "") + (i.project_id ? "gone" : "")}>
              <td><input type="checkbox" checked={sel.includes(i.id)} onChange={() => toggle(i.id)} /></td>
              <td style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{fmt(i.spoken_at)}</td>
              <td>
                <div className="i-title" onClick={() => setOpen(i)}>{i.title}</div>
                {i.summary && <div className="i-sum">{i.summary}</div>}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                  {(i.category || []).map((c) => <span key={c} className="tag soft">{c}</span>)}
                  {i.needs_review && <span className="tag soft" title="Header nahi bola tha">?</span>}
                  {i.project_id && <span className="tag soft">→ ContentFlow</span>}
                </div>
                {i.flags && <div className="tag warnflag" style={{ display: "inline-block", marginTop: 6 }}>{i.flags}</div>}
              </td>
              <td><span className="tag" style={{ background: TYPE_COLOR[i.type] }}>{i.type}</span></td>
              <td>
                <select value={i.brand} onChange={(e) => patch(i.id, { brand: e.target.value })}
                        style={{ border: "1px solid var(--line)", borderRadius: 7, padding: "4px 6px",
                                 fontSize: 12, maxWidth: 140, background: "#fff" }}>
                  {BRANDS.map((b) => <option key={b}>{b}</option>)}
                </select>
              </td>
              <td>
                <select value={i.status} onChange={(e) => patch(i.id, { status: e.target.value })}
                        style={{ border: "none", borderRadius: 6, padding: "4px 6px", fontSize: 11.5,
                                 fontFamily: "var(--mono)", color: "#fff", background: STATUS_COLOR[i.status] }}>
                  {STATUSES.map((s) => <option key={s} style={{ color: "#000", background: "#fff" }}>{s}</option>)}
                </select>
              </td>
            </tr>
          ))}
          {!ideas.length && (
            <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 34 }}>
              {total ? "Is filter me kuch nahi." : "Abhi khaali hai. Upar apni pehli JSON daalo."}
            </td></tr>
          )}
        </tbody>
      </table>

      {sel.length > 0 && (
        <div className="sticky-actions">
          <strong>{sel.length} chuni</strong>
          <button className="btn btn-amber" disabled={busy} onClick={() => doPromote("new")}>
            → Naye ContentFlow projects banao
          </button>
          <select defaultValue="" disabled={busy}
                  onChange={(e) => { if (e.target.value) { doPromote("existing", e.target.value); e.target.value = ""; } }}>
            <option value="">…ya kisi project me jodo</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <div style={{ marginLeft: "auto" }}>
            <button className="link-btn" style={{ color: "#fff" }} onClick={() => setSel([])}>chhodo</button>
          </div>
        </div>
      )}

      {open && (
        <div className="modal-bg" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="eyebrow">{open.type} · {open.brand}</div>
            <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 21,
                          letterSpacing: "-.02em", margin: "6px 0 2px" }}>{open.title}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--muted)" }}>
              {fmt(open.spoken_at)}{open.app ? " · " + open.app.replace(/^com\./, "") : ""}
            </div>
            {open.summary && <p style={{ fontSize: 14.5, lineHeight: 1.6 }}>{open.summary}</p>}
            <span className="lbl" style={{ marginTop: 14 }}>Jaisa bola tha</span>
            <div className="raw">{open.raw_dictation}</div>
            {open.flags && <div className="tag warnflag" style={{ display: "inline-block", marginTop: 12 }}>{open.flags}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button className="btn btn-ghost" onClick={() => setOpen(null)}>Band karo</button>
              <div style={{ marginLeft: "auto" }}>
                <button className="link-btn" style={{ color: "var(--warn)" }}
                        onClick={async () => { await api.del("/api/ideas/" + open.id); setOpen(null); load(); }}>
                  Hatao
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
