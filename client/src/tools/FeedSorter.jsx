import React, { useState, useMemo } from "react";
import { api } from "../theme.js";

/* FEEDSORTER — scan a public Instagram profile, rank posts by how far they beat
   that account's own typical performance. Admin-only. */

const CSS = `
.fs { padding-bottom: 60px; }
.fs-form { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin:18px 0 6px; }
.fs-input { flex:1; min-width:220px; border:1px solid var(--line); border-radius:10px;
  padding:12px 14px; font-family:var(--body); font-size:15px; background:#fff; }
.fs-input:focus { outline:none; border-color:var(--amber); }
.fs-note { font-size:12.5px; color:var(--muted); margin-top:4px; line-height:1.5; }
.fs-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:22px 0; }
.fs-stat { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 15px; }
.fs-stat .v { font-family:var(--mono); font-weight:700; font-size:22px; line-height:1; }
.fs-stat .k { font-size:10.5px; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); margin-top:7px; font-weight:600; }
.fs-bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px; }
.fs-row { display:flex; gap:12px; background:var(--card); border:1px solid var(--line);
  border-radius:11px; padding:11px 12px; margin-bottom:9px; align-items:flex-start; }
.fs-thumb { width:72px; height:96px; object-fit:cover; border-radius:7px; background:#EEE9DE; flex:0 0 72px; }
.fs-body { flex:1; min-width:0; }
.fs-hook { font-size:13.5px; line-height:1.45; color:var(--ink); }
.fs-nums { display:flex; gap:12px; flex-wrap:wrap; margin-top:7px; font-family:var(--mono); font-size:11px; color:var(--muted); }
.fs-viral { font-family:var(--mono); font-weight:700; font-size:15px; flex:0 0 62px; text-align:right; }
.fs-type { font-family:var(--mono); font-size:9.5px; text-transform:uppercase; letter-spacing:.06em;
  background:var(--paper); border:1px solid var(--line); border-radius:5px; padding:1px 6px; color:var(--ink-soft); }
.fs-open { font-family:var(--mono); font-size:11px; color:var(--teal); text-decoration:none; }
.fs-open:hover { text-decoration:underline; }
.fs-warn { background:var(--amber-soft); border:1px solid #F0D9B8; border-radius:10px;
  padding:11px 13px; font-size:12.5px; color:var(--ink-soft); line-height:1.5; }
@media (max-width:720px){ .fs-stats{grid-template-columns:repeat(2,1fr);} }
`;

const fmt = (n) => {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(Math.round(n));
};

export default function FeedSorter() {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);
  const [sort, setSort] = useState("viral");
  const [onlyReels, setOnlyReels] = useState(false);

  const scan = async () => {
    const u = username.trim().replace(/^@/, "");
    if (!u) return;
    setBusy(true); setErr(""); setData(null);
    try {
      const r = await api.post("/api/feedsorter/scan", { username: u });
      if (r.error) { setErr(r.error); return; }
      setData(r);
    } catch {
      setErr("Couldn't reach the server. Try again.");
    } finally { setBusy(false); }
  };

  const posts = useMemo(() => {
    if (!data) return [];
    let list = data.posts.slice();
    if (onlyReels) list = list.filter((p) => p.type === "reel");
    if (sort === "views") list.sort((a, b) => (b.views || 0) - (a.views || 0));
    else if (sort === "recent") list.sort((a, b) => (b.takenAt || 0) - (a.takenAt || 0));
    else list.sort((a, b) => (b.viral || 0) - (a.viral || 0));
    return list;
  }, [data, sort, onlyReels]);

  const exportCsv = () => {
    if (!data) return;
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Profile", "Post", "Type", "Date", "Views", "Likes", "Viral Score", "Comments", "Hook"];
    const rows = posts.map((p) => [
      data.username, p.url, p.type,
      p.takenAt ? new Date(p.takenAt).toISOString().slice(0, 10) : "",
      p.views ?? "", p.likes ?? "", (p.viral || 0).toFixed(2), p.comments ?? "",
      (p.hook || "").replace(/\s*\n+\s*/g, " · "),
    ].map(esc).join(","));
    const csv = "\uFEFF" + [header.map(esc).join(","), ...rows].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${data.username}-posts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="wrap fs">
      <style>{CSS}</style>

      <div className="eyebrow">U2berClub Tools · admin only</div>
      <div className="h1" style={{ fontSize: 30 }}>FEEDSORTER</div>
      <div className="sub">
        Scan any public profile and see which posts actually beat that account's own average — not
        just which got the biggest number.
      </div>

      <div className="fs-form">
        <input className="fs-input" value={username} placeholder="username (without @)"
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") scan(); }} />
        <button className="btn btn-amber" disabled={busy || !username.trim()} onClick={scan}>
          {busy ? "Scanning…" : "Scan profile"}
        </button>
      </div>
      <div className="fs-note">
        Reads up to 150 recent posts. Takes 10–30 seconds. Public accounts only.
      </div>

      {err && <div className="err" style={{ marginTop: 14 }}>{err}</div>}

      {busy && (
        <div className="fs-warn" style={{ marginTop: 16 }}>
          Working through their feed a page at a time, with a pause between each — that's what keeps
          Instagram from blocking this server. Hang on.
        </div>
      )}

      {data && (
        <>
          <div className="fs-stats">
            <div className="fs-stat">
              <div className="v">{data.stats.count}</div>
              <div className="k">Posts scanned</div>
            </div>
            <div className="fs-stat">
              <div className="v">{fmt(data.stats.typical_likes)}</div>
              <div className="k">Typical likes</div>
            </div>
            <div className="fs-stat">
              <div className="v">{data.stats.top_viral}×</div>
              <div className="k">Best post</div>
            </div>
            <div className="fs-stat">
              <div className="v">{fmt(data.profile?.followers)}</div>
              <div className="k">Followers</div>
            </div>
          </div>

          <div className="fs-warn" style={{ marginBottom: 16 }}>
            <b>Viral score</b> is likes ÷ that account's median likes. A 3.0× post beat their own
            typical post three times over — which is a fairer read than raw numbers, because a big
            account's flop still looks big.
          </div>

          <div className="fs-bar">
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Sort:</span>
            {[["viral", "Viral score"], ["views", "Views"], ["recent", "Newest"]].map(([k, label]) => (
              <button key={k} className={"cat-chip " + (sort === k ? "on" : "")} onClick={() => setSort(k)}>{label}</button>
            ))}
            <button className={"cat-chip " + (onlyReels ? "on" : "")} onClick={() => setOnlyReels(!onlyReels)}>
              Reels only
            </button>
            <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={exportCsv}>Export CSV</button>
          </div>

          {posts.map((p) => (
            <div className="fs-row" key={p.code || p.url}>
              {p.thumb
                ? <img className="fs-thumb" src={p.thumb} alt="" referrerPolicy="no-referrer" loading="lazy" />
                : <div className="fs-thumb" />}
              <div className="fs-body">
                <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 5 }}>
                  <span className="fs-type">{p.type}</span>
                  {p.takenAt && (
                    <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted)" }}>
                      {new Date(p.takenAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                    </span>
                  )}
                  <a className="fs-open" href={p.url} target="_blank" rel="noreferrer">open ↗</a>
                </div>
                <div className="fs-hook">{p.hook || <span style={{ color: "var(--muted)" }}>(no caption)</span>}</div>
                <div className="fs-nums">
                  {p.views != null && <span>{fmt(p.views)} views</span>}
                  <span>{fmt(p.likes)} likes</span>
                  <span>{fmt(p.comments)} comments</span>
                </div>
              </div>
              <div className="fs-viral" style={{ color: p.viral >= 2 ? "var(--good)" : p.viral >= 1 ? "var(--ink)" : "var(--muted)" }}>
                {(p.viral || 0).toFixed(1)}×
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
