import React, { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "../theme.js";

/* TEARDOWN — a creator's reels pulled apart (transcript, hook, setup, pattern break,
   payoff, CTA). Teardowns are produced outside the hub as "u2ber-teardown" JSON, uploaded
   here, stored per user, and exported as JSON / Excel / PDF. */

const CSS = `
.td { padding-bottom:60px; }
.td-drop { border:2px dashed var(--line); border-radius:12px; padding:22px; text-align:center;
  color:var(--muted); font-size:13.5px; cursor:pointer; background:#fff; margin-top:18px; }
.td-drop.over { border-color:var(--amber); background:#FFFBF5; }
.td-list { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; margin-top:18px; }
.td-card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; cursor:pointer; }
.td-card:hover { border-color:var(--ink); }
.td-card .c { font-family:var(--display); font-weight:700; font-size:18px; }
.td-card .m { font-family:var(--mono); font-size:11px; color:var(--muted); margin-top:6px; }
.td-head { display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; margin-top:8px; }
.td-exp { display:flex; gap:8px; flex-wrap:wrap; margin-left:auto; }
.td-exp a { text-decoration:none; display:inline-block; }
.td-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:18px 0; }
.td-stat { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 15px; }
.td-stat .v { font-family:var(--mono); font-weight:700; font-size:22px; line-height:1; }
.td-stat .k { font-size:10.5px; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); margin-top:7px; font-weight:600; }
.td-steps { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); border:1px solid var(--line); border-radius:12px; background:#fff; overflow:hidden; }
.td-step { padding:14px; border-right:1px solid var(--line); }
.td-step:last-child { border-right:none; }
.td-step .t { font-family:var(--mono); font-size:10.5px; color:var(--amber); }
.td-step .h { font-family:var(--display); font-weight:700; font-size:15px; margin:3px 0; }
.td-step p { font-size:12.5px; color:var(--ink-soft); line-height:1.5; margin:0; }
.td-finds { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:12px; margin-top:14px; }
.td-find { background:#fff; border:1px solid var(--line); border-radius:12px; padding:15px; }
.td-find .h { font-family:var(--display); font-weight:700; font-size:15px; }
.td-find p { font-size:13px; line-height:1.55; color:var(--ink-soft); margin:6px 0 0; }
.td-find .ex { color:var(--muted); font-size:12.5px; }
.td-bar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin:16px 0 10px; }
.td-bar input, .td-bar select { border:1px solid var(--line); border-radius:8px; padding:8px 10px; font-family:var(--body); font-size:13px; background:#fff; }
.td-bar input { flex:1; min-width:200px; }
.td-row { background:#fff; border:1px solid var(--line); border-radius:11px; padding:11px 13px; margin-bottom:8px; cursor:pointer; }
.td-row:hover { border-color:var(--muted); }
.td-row .top { display:flex; gap:12px; align-items:flex-start; }
.td-row .rk { font-family:var(--mono); font-size:11px; color:var(--muted); width:38px; flex:0 0 38px; padding-top:2px; }
.td-row .body { flex:1; min-width:0; }
.td-row .tt { font-weight:600; font-size:14px; line-height:1.4; }
.td-row .hk { font-size:12.5px; color:var(--muted); margin-top:3px; line-height:1.45; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.td-row .num { font-family:var(--mono); font-size:11.5px; text-align:right; white-space:nowrap; }
.td-row .num b { font-size:14px; display:block; }
.td-tags { display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }
.td-tag { font-family:var(--mono); font-size:9.5px; padding:2px 7px; border-radius:5px; background:#F2EFE7; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; }
.td-tag.a { background:var(--amber-soft); color:#8A5A1E; }
.td-tag.g { background:#E8F3EB; color:var(--good); }
.td-detail { border-top:1px dashed var(--line); margin-top:10px; padding-top:12px; cursor:auto; }
.td-hookq { font-family:var(--display); font-weight:600; font-size:16px; line-height:1.35; border-left:3px solid var(--amber); padding-left:10px; margin-bottom:12px; }
.td-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:10px 20px; }
.td-f .l { font-family:var(--mono); font-size:9.5px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
.td-f p { font-size:13px; line-height:1.5; margin:2px 0 0; }
.td-beats { font-size:12.5px; margin-top:12px; display:grid; gap:2px; }
.td-beats span { font-family:var(--mono); color:var(--teal); display:inline-block; width:44px; }
.td-tr { background:var(--paper); border:1px solid var(--line); border-radius:10px; padding:10px 12px; margin-top:12px; max-height:320px; overflow:auto; font-size:13.5px; line-height:1.6; }
.td-tr div { display:flex; gap:10px; }
.td-tr code { font-family:var(--mono); font-size:11px; color:var(--muted); flex:0 0 36px; padding-top:3px; }
@media (max-width:720px){ .td-stats{grid-template-columns:repeat(2,1fr);} .td-step{border-right:none;border-bottom:1px solid var(--line);} }
`;

const fmt = (n) => {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(Math.round(n));
};
const mmss = (s) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
const median = (a) => { a = a.filter((x) => x != null).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

/* ---------------- list of saved teardowns + upload ---------------- */
function TeardownList({ open }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  const load = useCallback(async () => {
    const r = await api.get("/api/teardown");
    if (r.error) setErr(r.error); else setItems(r.teardowns || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const upload = async (file) => {
    if (!file) return;
    setErr(""); setBusy(true);
    try {
      let json;
      try { json = JSON.parse(await file.text()); } catch { setErr("That file isn't valid JSON."); return; }
      const r = await api.post("/api/teardown", json);
      if (r.error) { setErr(r.error); return; }
      await load();
      open(r.id);
    } catch { setErr("Upload failed. Try again."); }
    finally { setBusy(false); }
  };

  const remove = async (e, id, creator) => {
    e.stopPropagation();
    if (!window.confirm(`Delete the @${creator} teardown? This can't be undone.`)) return;
    await api.del(`/api/teardown/${id}`);
    load();
  };

  return (
    <>
      <label className={"td-drop " + (over ? "over" : "")}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files[0]); }}>
        <input type="file" accept=".json,application/json" hidden onChange={(e) => upload(e.target.files[0])} />
        {busy ? "Uploading…" : <>Drop a <b>teardown .json</b> here, or click to choose one</>}
      </label>
      {err && <div className="err" style={{ marginTop: 10 }}>{err}</div>}

      {items && !items.length && (
        <div className="sub" style={{ marginTop: 18 }}>No teardowns yet. Upload the JSON file Claude gives you for a creator.</div>
      )}
      <div className="td-list">
        {(items || []).map((t) => (
          <div key={t.id} className="td-card" onClick={() => open(t.id)}>
            <div className="c">@{t.creator || "creator"}</div>
            <div className="m">{t.reel_count} posts · {fmt(Number(t.total_plays))} plays</div>
            <div className="m">Uploaded {new Date(t.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
            <button className="link-btn" style={{ marginTop: 10 }} onClick={(e) => remove(e, t.id, t.creator)}>Delete</button>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------- one reel row ---------------- */
function ReelRow({ r, isOpen, toggle }) {
  return (
    <div className="td-row" onClick={toggle}>
      <div className="top">
        <div className="rk">#{r.rank}</div>
        <div className="body">
          <div className="tt">{r.topic || r.shortcode}</div>
          <div className="hk">{r.hook_spoken || r.hook}</div>
          <div className="td-tags">
            {r.hook_family && <span className="td-tag a">{r.hook_family}</span>}
            {r.duration_sec ? <span className="td-tag">{mmss(r.duration_sec)}</span> : null}
            {r.cta_word && <span className="td-tag g">Comment “{r.cta_word}”</span>}
            {r.repost_of && <span className="td-tag">Repost / remake</span>}
          </div>
        </div>
        <div className="num"><b>{fmt(r.plays)}</b>plays<br />{fmt(r.comments)} cmts</div>
      </div>
      {isOpen && (
        <div className="td-detail" onClick={(e) => e.stopPropagation()}>
          {(r.hook_spoken || r.hook) && <div className="td-hookq">{r.hook_spoken || r.hook}</div>}
          <div className="td-grid">
            {[["Hook type", r.hook_type], ["Format", r.format],
              ["Script length", r.duration_sec ? `${mmss(r.duration_sec)} · ${r.words || 0} words${r.wpm ? ` · ${r.wpm} wpm` : ""}` : ""],
              ["Setup", r.setup], ["Pattern break", r.pattern_break], ["Payoff", r.payoff],
              ["CTA", r.cta], ["Why it worked / didn't", r.why]]
              .filter(([, v]) => v).map(([l, v]) => (
                <div className="td-f" key={l}><div className="l">{l}</div><p>{v}</p></div>
              ))}
          </div>
          {r.beats?.length > 0 && (
            <div className="td-beats">
              {r.beats.map((b, i) => <div key={i}><span>{b.t}s</span>{b.label}</div>)}
            </div>
          )}
          {r.transcript?.length > 0 && (
            <div className="td-tr">
              {r.transcript.map((s, i) => <div key={i}><code>{mmss(s.t)}</code><span>{s.text}</span></div>)}
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
            {r.date} · Audio: {r.audio || "—"} · {r.url && <a href={r.url} target="_blank" rel="noreferrer">Open on Instagram ↗</a>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- one teardown ---------------- */
function TeardownView({ id, back }) {
  const [td, setTd] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("formula");
  const [q, setQ] = useState("");
  const [fam, setFam] = useState("");
  const [sort, setSort] = useState("rank");
  const [openSc, setOpenSc] = useState(null);
  const [shown, setShown] = useState(40);

  useEffect(() => {
    api.get(`/api/teardown/${id}`).then((r) => (r.error ? setErr(r.error) : setTd(r)));
  }, [id]);

  const families = useMemo(() => [...new Set((td?.reels || []).map((r) => r.hook_family).filter(Boolean))].sort(), [td]);
  const reels = useMemo(() => {
    if (!td) return [];
    const needle = q.trim().toLowerCase();
    let list = td.reels.filter((r) => (!fam || r.hook_family === fam) &&
      (!needle || [r.topic, r.hook, r.hook_spoken, r.caption, ...(r.transcript || []).map((t) => t.text)].join(" ").toLowerCase().includes(needle)));
    const by = { rank: (a, b) => a.rank - b.rank, plays: (a, b) => (b.plays || 0) - (a.plays || 0),
      comments: (a, b) => (b.comments || 0) - (a.comments || 0), date: (a, b) => String(b.date).localeCompare(String(a.date)) }[sort];
    return list.sort(by);
  }, [td, q, fam, sort]);

  if (err) return <div className="err" style={{ marginTop: 16 }}>{err}</div>;
  if (!td) return <div className="sub" style={{ marginTop: 16 }}>Loading…</div>;

  const voiced = td.reels.filter((r) => r.transcript?.length);
  const totalPlays = td.reels.reduce((a, r) => a + (r.plays || 0), 0);

  return (
    <>
      <button className="link-btn" onClick={back}>← All teardowns</button>
      <div className="td-head">
        <div>
          <div className="h1" style={{ fontSize: 30 }}>@{td.creator}</div>
          <div className="sub">{td.summary?.headline || `${td.reels.length} posts pulled apart.`}</div>
        </div>
        <div className="td-exp">
          <a className="btn btn-ghost" href={`/api/teardown/${id}/json`}>Export JSON</a>
          <a className="btn btn-ghost" href={`/api/teardown/${id}/xlsx`}>Export Excel</a>
          <a className="btn btn-amber" href={`/api/teardown/${id}/pdf`}>Export PDF</a>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
        Excel has 3 sheets: Reels (one row each), Transcripts (line by line with timestamps) and Formula.
        PDF has the formula and every reel's breakdown ·{" "}
        <a href={`/api/teardown/${id}/pdf?top=20`}>top 20 only</a> ·{" "}
        <a href={`/api/teardown/${id}/pdf?transcripts=1`}>with transcripts</a>
      </div>

      <div className="td-stats">
        <div className="td-stat"><div className="v">{td.reels.length}</div><div className="k">Posts</div></div>
        <div className="td-stat"><div className="v">{fmt(totalPlays)}</div><div className="k">Total plays</div></div>
        <div className="td-stat"><div className="v">{voiced.length}</div><div className="k">With a spoken script</div></div>
        <div className="td-stat"><div className="v">{fmt(median(td.reels.map((r) => r.plays)))}</div><div className="k">Median plays (all posts)</div></div>
      </div>

      <div className="tabs">
        <button className={"tab " + (tab === "formula" ? "on" : "")} onClick={() => setTab("formula")}>Formula</button>
        <button className={"tab " + (tab === "reels" ? "on" : "")} onClick={() => setTab("reels")}>Every reel ({td.reels.length})</button>
      </div>

      {tab === "formula" && (
        <>
          {td.summary?.formula?.length > 0 && (
            <div className="td-steps">
              {td.summary.formula.map((f, i) => (
                <div className="td-step" key={i}><div className="t">{f.t}</div><div className="h">{f.title}</div><p>{f.text}</p></div>
              ))}
            </div>
          )}
          <div className="td-finds">
            {(td.summary?.findings || []).map((f, i) => (
              <div className="td-find" key={i}>
                <div className="h">{f.title}</div>
                <p>{f.text}</p>
                {f.example && <p className="ex">{f.example}</p>}
              </div>
            ))}
          </div>
          {td.summary?.notes && <div className="sub" style={{ marginTop: 14, maxWidth: 760 }}>{td.summary.notes}</div>}
        </>
      )}

      {tab === "reels" && (
        <>
          <div className="td-bar">
            <input value={q} placeholder="Search topic, hook or transcript…" onChange={(e) => { setQ(e.target.value); setShown(40); }} />
            <select value={fam} onChange={(e) => { setFam(e.target.value); setShown(40); }}>
              <option value="">All hook types</option>
              {families.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="rank">Original rank</option>
              <option value="plays">Most plays</option>
              <option value="comments">Most comments</option>
              <option value="date">Newest</option>
            </select>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{reels.length} posts</span>
          </div>
          {reels.slice(0, shown).map((r) => (
            <ReelRow key={r.shortcode || r.rank} r={r} isOpen={openSc === (r.shortcode || r.rank)}
              toggle={() => setOpenSc(openSc === (r.shortcode || r.rank) ? null : (r.shortcode || r.rank))} />
          ))}
          {reels.length > shown && <button className="btn btn-ghost" onClick={() => setShown(shown + 40)}>Show more</button>}
        </>
      )}
    </>
  );
}

export default function Teardown() {
  const [id, setId] = useState(null);
  return (
    <div className="wrap td">
      <style>{CSS}</style>
      <div className="eyebrow">U2berClub Tools</div>
      {!id && (
        <>
          <div className="h1" style={{ fontSize: 30 }}>TEARDOWN</div>
          <div className="sub">
            A creator's reels, pulled apart: what was said, the hook and when it landed, the setup, pattern break,
            payoff and CTA. Upload a teardown, read it here, export it as Excel, PDF or JSON.
          </div>
        </>
      )}
      {id ? <TeardownView id={id} back={() => setId(null)} /> : <TeardownList open={setId} />}
    </div>
  );
}
