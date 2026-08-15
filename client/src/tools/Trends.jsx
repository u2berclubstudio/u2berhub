import React, { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../theme.js";

/* ============================================================
   TRENDS — community reel directory + publishable lists.
   The one tool where the reel pool is SHARED. Notes and lists
   stay private until the creator publishes a list.
   ============================================================ */

const CSS = `
.tr * { box-sizing: border-box; }
.tr { padding-bottom: 60px; }
.tr-head { display:flex; align-items:flex-end; gap:14px; flex-wrap:wrap; margin-bottom:6px; }
.tr-tabs { display:flex; gap:8px; margin:18px 0 16px; flex-wrap:wrap; }
.tr-tab { font-family:var(--display); font-weight:600; font-size:13.5px; padding:8px 15px; border-radius:9px;
  border:1px solid var(--line); background:#fff; cursor:pointer; color:var(--ink); }
.tr-tab.on { background:var(--ink); color:#fff; border-color:var(--ink); }
.tr-bar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:14px; }
.tr-search { flex:1; min-width:180px; border:1px solid var(--line); border-radius:9px; padding:10px 12px;
  font-family:var(--body); font-size:14px; background:#fff; }
.tr-search:focus { outline:none; border-color:var(--amber); }
.cat-chip { font-size:12px; border:1px solid var(--line); background:#fff; border-radius:14px; padding:5px 11px;
  cursor:pointer; font-family:var(--body); color:var(--ink-soft); white-space:nowrap; }
.cat-chip.on { background:var(--ink); color:#fff; border-color:var(--ink); }
.reel-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:14px; }
.reel-card { background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; }
.reel-embed { width:100%; height:660px; background:#F4F1EA; position:relative; }
.reel-embed iframe { width:100%; height:100%; border:0; display:block; }
.reel-ph { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:8px; color:var(--muted); font-family:var(--mono); font-size:12px; text-align:center; padding:16px; }
.reel-meta { padding:11px 13px; border-top:1px solid var(--line); }
.reel-tags { display:flex; gap:5px; flex-wrap:wrap; margin-top:6px; }
.tagpill { font-family:var(--mono); font-size:10px; background:#EAF3F4; color:var(--teal); border-radius:5px; padding:2px 7px; }
.catpill { font-family:var(--mono); font-size:10px; background:var(--amber-soft); color:#8A5A1E; border-radius:5px; padding:2px 7px; }
.by { font-family:var(--mono); font-size:10px; color:var(--muted); margin-top:6px; }
.note-box { margin-top:9px; border:1px dashed #D8CDB6; border-radius:8px; padding:9px 10px; background:#FDFCF8; }
.note-box.filled { border-style:solid; border-color:var(--amber); }
.note-lbl { display:block; font-size:9.5px; letter-spacing:.09em; text-transform:uppercase; color:var(--muted); font-weight:700; margin:6px 0 3px; }
.note-ta { width:100%; border:1px solid var(--line); border-radius:6px; padding:6px 8px; font-family:var(--body);
  font-size:12.5px; resize:vertical; background:#fff; color:var(--ink); }
.note-ta:focus { outline:none; border-color:var(--amber); }
.warn-line { font-size:11px; color:#8A5A1E; background:var(--amber-soft); border-radius:6px; padding:6px 8px; margin-top:7px; line-height:1.4; }
.list-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; }
.list-card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:15px; }
.list-card h4 { font-family:var(--display); font-weight:600; font-size:16px; margin:0 0 4px; }
.pub-url { font-family:var(--mono); font-size:11px; background:var(--ink); color:#fff; border-radius:6px;
  padding:6px 9px; word-break:break-all; display:block; margin-top:8px; }
.mini { font-family:var(--display); font-weight:600; font-size:11.5px; border:none; border-radius:6px;
  padding:6px 11px; cursor:pointer; background:transparent; color:var(--muted); border:1px solid var(--line); }
.mini:hover { border-color:var(--ink); color:var(--ink); }
.mini.solid { background:var(--ink); color:#fff; border-color:var(--ink); }
.mini.amber { background:var(--amber); color:#fff; border-color:var(--amber); }
.empty { text-align:center; color:var(--muted); font-size:14px; padding:40px 20px; }
.modal-bg { position:fixed; inset:0; background:rgba(21,23,30,.5); display:flex; align-items:center;
  justify-content:center; z-index:1000; padding:20px; }
.modal-w { background:#fff; border-radius:14px; padding:22px; max-width:560px; width:100%; max-height:86vh; overflow:auto; }
.modal-w h3 { font-family:var(--display); font-weight:600; font-size:19px; margin:0 0 6px; }
.pick-row { display:flex; gap:9px; padding:9px 10px; border-bottom:1px solid var(--line); align-items:flex-start; cursor:pointer; }
.pick-row:hover { background:var(--paper); }
`;

const shortcodeOf = (u = "") =>
  (u.match(/instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/) || [])[1] || null;

export default function Trends({ me }) {
  const [tab, setTab] = useState("browse");
  const [scope, setScope] = useState("official");
  const [counts, setCounts] = useState({ official: 0, mine: 0 });
  const [reels, setReels] = useState([]);
  const [cats, setCats] = useState([]);
  const [lists, setLists] = useState([]);
  const [username, setUsername] = useState(null);
  const [cat, setCat] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [openNote, setOpenNote] = useState(null);
  const [modal, setModal] = useState(null); // 'add' | 'newlist' | 'username' | 'import' | {addTo:reelId}

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("scope", scope);
    if (cat) params.set("category", cat);
    if (search.trim()) params.set("q", search.trim());
    const [r, c, l, m, n] = await Promise.all([
      api.get("/api/trends/reels?" + params.toString()),
      api.get("/api/trends/categories?scope=" + scope),
      api.get("/api/trends/lists"),
      api.get("/api/trends/me"),
      api.get("/api/trends/counts"),
    ]);
    setReels(r.reels || []);
    setCats(c.categories || []);
    setLists(l.lists || []);
    setUsername(m.username || null);
    setCounts(n || { official: 0, mine: 0 });
  }, [cat, search, scope]);

  useEffect(() => { load(); }, [load]);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3000); };

  return (
    <div className="wrap tr">
      <style>{CSS}</style>

      <div className="tr-head">
        <div>
          <div className="eyebrow">U2berClub Tools</div>
          <div className="h1" style={{ fontSize: 30 }}>TRENDS</div>
          <div className="sub">Curated trends from U2berClub, plus your own private collection. Note why they work, and publish a list anyone can open.</div>
        </div>
      </div>

      <div className="tr-tabs">
        <button className={"tr-tab " + (tab === "browse" && scope === "official" ? "on" : "")}
          onClick={() => { setTab("browse"); setScope("official"); setCat(""); }}>U2berClub Trends ({counts.official})</button>
        <button className={"tr-tab " + (tab === "browse" && scope === "mine" ? "on" : "")}
          onClick={() => { setTab("browse"); setScope("mine"); setCat(""); }}>My reels ({counts.mine})</button>
        <button className={"tr-tab " + (tab === "lists" ? "on" : "")} onClick={() => setTab("lists")}>My lists ({lists.length})</button>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-amber" onClick={() => setModal("add")}>+ Add a reel</button>
          <button className="btn btn-ghost" onClick={() => setModal("import")}>⚡ Import from SAVEDREELS</button>
        </span>
      </div>

      {msg && <div className="ok" style={{ marginBottom: 12 }}>{msg}</div>}

      {tab === "browse" && (
        <>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>
            {scope === "official"
              ? "Curated by U2berClub — everyone sees these. Your notes on them stay private."
              : "Only you can see these. Other creators never see reels you add here."}
          </div>
          <div className="tr-bar">
            <input className="tr-search" placeholder="Search captions, tags, categories…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className={"cat-chip " + (cat === "" ? "on" : "")} onClick={() => setCat("")}>All</button>
            {cats.map((c) => (
              <button key={c.category} className={"cat-chip " + (cat === c.category ? "on" : "")} onClick={() => setCat(c.category)}>
                {c.category} · {c.n}
              </button>
            ))}
          </div>

          {!reels.length ? (
            <div className="empty">
              {scope === "official" ? (
                <>The U2berClub directory is still being built.<br />
                  <span style={{ fontSize: 13 }}>Curated trends will show up here. In the meantime, add your own under “My reels”.</span></>
              ) : (
                <>You haven't added any reels yet.<br />
                  <span style={{ fontSize: 13 }}>Add a reel, or import a batch from your SAVEDREELS vault. Only you can see these.</span></>
              )}
            </div>
          ) : (
            <div className="reel-grid">
              {reels.map((r) => (
                <ReelCard
                  key={r.id} reel={r} me={me} lists={lists} scope={scope}
                  open={openNote === r.id}
                  onToggle={() => setOpenNote(openNote === r.id ? null : r.id)}
                  onSaved={load} onFlash={flash}
                  onAddTo={() => setModal({ addTo: r.id })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "lists" && (
        <ListsPane
          lists={lists} username={username} onReload={load} onFlash={flash}
          onNew={() => setModal("newlist")} onNeedUsername={() => setModal("username")}
        />
      )}

      {modal === "add" && <AddReelModal isAdmin={me?.role === "admin"} onClose={() => setModal(null)} onDone={(m) => { setModal(null); setScope(me?.role === "admin" ? "official" : "mine"); flash(m); }} />}
      {modal === "newlist" && <NewListModal onClose={() => setModal(null)} onDone={() => { setModal(null); load(); flash("List created."); }} />}
      {modal === "username" && <UsernameModal current={username} onClose={() => setModal(null)} onDone={(u) => { setModal(null); setUsername(u); load(); flash("Username set: " + u); }} />}
      {modal === "import" && <ImportModal isAdmin={me?.role === "admin"} onClose={() => setModal(null)} onDone={(m) => { setModal(null); setScope(me?.role === "admin" ? "official" : "mine"); flash(m); }} />}
      {modal && modal.addTo && <AddToListModal reelId={modal.addTo} lists={lists} onClose={() => setModal(null)} onDone={(m) => { setModal(null); load(); flash(m); }} />}
    </div>
  );
}

/* ---------------- one reel in the directory ---------------- */
function ReelCard({ reel, me, open, onToggle, onSaved, onFlash, onAddTo, scope }) {
  const [why, setWhy] = useState(reel.my_why || "");
  const [hooks, setHooks] = useState(reel.my_hooks || "");
  const [saving, setSaving] = useState(false);
  const code = reel.shortcode || shortcodeOf(reel.url);
  const hasNote = !!(reel.my_why || reel.my_hooks);

  const save = async () => {
    setSaving(true);
    await api.put(`/api/trends/notes/${reel.id}`, { why, hooks });
    setSaving(false); onToggle(); onSaved(); onFlash("Note saved.");
  };
  const canRemove = me?.role === "admin" || (scope === "mine");
  const remove = async () => {
    const q2 = scope === "mine"
      ? "Remove this reel from your collection?"
      : "Remove this reel from the U2berClub directory for everyone?";
    if (!confirm(q2)) return;
    await api.del(`/api/trends/reels/${reel.id}`);
    onSaved(); onFlash("Removed from directory.");
  };

  return (
    <div className="reel-card">
      <div className="reel-embed">
        {code ? (
          <iframe title={reel.id} src={`https://www.instagram.com/reel/${code}/embed/captioned/`} loading="lazy" />
        ) : (
          <div className="reel-ph">
            <span style={{ fontSize: 22 }}>🔗</span>
            <a href={reel.url} target="_blank" rel="noreferrer">Open link</a>
          </div>
        )}
      </div>
      <div className="reel-meta">
        <div className="reel-tags">
          {reel.category && <span className="catpill">{reel.category}</span>}
          {(reel.tags || "").split(/[\s,]+/).filter(Boolean).slice(0, 5).map((t, i) => (
            <span className="tagpill" key={i}>#{t.replace(/^#/, "")}</span>
          ))}
        </div>
        {reel.trend_name && <div style={{ fontFamily: "var(--display)", fontWeight: 600, fontSize: 15, marginTop: 8 }}>{reel.trend_name}</div>}
        {reel.trend_desc && <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4, lineHeight: 1.45 }}>{reel.trend_desc.slice(0, 180)}{reel.trend_desc.length > 180 ? "…" : ""}</div>}
        {!reel.trend_desc && reel.caption && <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 7, lineHeight: 1.45 }}>{reel.caption.slice(0, 140)}</div>}
        <div className="by">
          {reel.official ? <span style={{ color: "var(--amber)", fontWeight: 700 }}>U2BERCLUB · </span> : null}
          {reel.reels_count ? <>{reel.reels_count} reels made · </> : null}
          {reel.publish_date ? <>{reel.publish_date} · </> : null}
          added by {reel.added_by_name || "—"}
        </div>

        {!open ? (
          <div className={"note-box " + (hasNote ? "filled" : "")} onClick={onToggle} style={{ cursor: "pointer" }}>
            {hasNote ? (
              <>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{reel.my_why || reel.my_hooks}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--amber)", marginTop: 4 }}>edit my notes</div>
              </>
            ) : (
              <span style={{ fontSize: 12, color: "var(--muted)" }}>✎ add your notes — why it works, hook points</span>
            )}
          </div>
        ) : (
          <div className="note-box filled">
            <label className="note-lbl">Why it works</label>
            <textarea className="note-ta" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="the mechanism — what makes it land" />
            <label className="note-lbl">Hook points</label>
            <textarea className="note-ta" rows={2} value={hooks} onChange={(e) => setHooks(e.target.value)} placeholder="0:02 close-up on face, negative command on screen…" />
            <div className="warn-line">
              These notes are private — <b>except</b> if you add this reel to a list and publish it. Published lists show your notes to anyone with the link.
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
              <button className="mini solid" disabled={saving} onClick={save}>{saving ? "…" : "Save"}</button>
              <button className="mini" onClick={onToggle}>Cancel</button>
              <button className="mini amber" style={{ marginLeft: "auto" }} onClick={onAddTo}>+ Add to list</button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {!open && <button className="mini" onClick={onAddTo}>+ Add to list</button>}
          {canRemove && <button className="mini" style={{ marginLeft: "auto", color: "var(--warn)" }} onClick={remove}>Remove</button>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- my lists ---------------- */
function ListsPane({ lists, username, onReload, onFlash, onNew, onNeedUsername }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const togglePublish = async (l) => {
    if (!l.published && !username) { onNeedUsername(); return; }
    if (!l.published) {
      const ok = confirm(
        `Publish "${l.title}"?\n\nAnyone with the link will be able to see this list — including the notes you wrote on each reel. No login needed.\n\nYou can unpublish at any time.`
      );
      if (!ok) return;
    }
    const r = await api.patch(`/api/trends/lists/${l.id}`, { published: !l.published });
    if (r.error) { alert(r.error); return; }
    onReload(); onFlash(l.published ? "Unpublished." : "Published — link is live.");
  };
  const del = async (l) => {
    if (!confirm(`Delete the list "${l.title}"? The reels stay in the directory.`)) return;
    await api.del(`/api/trends/lists/${l.id}`);
    onReload(); onFlash("List deleted.");
  };
  const copy = (url) => { navigator.clipboard?.writeText(url); onFlash("Link copied."); };

  return (
    <>
      <div className="tr-bar">
        <button className="btn btn-amber" onClick={onNew}>+ New list</button>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
          {username ? <>Your public URLs start with <b>/list/{username}/</b></> : <>Pick a username to publish — <button className="link-btn" onClick={onNeedUsername}>set it now</button></>}
        </span>
      </div>

      {!lists.length ? (
        <div className="empty">No lists yet.<br /><span style={{ fontSize: 13 }}>Make one, add reels from Browse, then publish it as a shareable page.</span></div>
      ) : (
        <div className="list-grid">
          {lists.map((l) => {
            const url = username ? `${origin}/list/${username}/${l.slug}` : null;
            return (
              <div className="list-card" key={l.id}>
                <h4>{l.title}</h4>
                {l.blurb && <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 6 }}>{l.blurb}</div>}
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
                  {l.item_count} reel{l.item_count === 1 ? "" : "s"} · {l.published ? <span style={{ color: "var(--good)" }}>published</span> : "private"}
                </div>
                {l.published && url && (
                  <>
                    <span className="pub-url">{url}</span>
                    <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                      <button className="mini" onClick={() => copy(url)}>Copy link</button>
                      <a className="mini" href={url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>Open</a>
                    </div>
                  </>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  <button className={"mini " + (l.published ? "" : "solid")} onClick={() => togglePublish(l)}>
                    {l.published ? "Unpublish" : "Publish"}
                  </button>
                  <button className="mini" style={{ marginLeft: "auto", color: "var(--warn)" }} onClick={() => del(l)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ---------------- modals ---------------- */
function Modal({ children, onClose }) {
  return (
    <div className="modal-bg" onClick={(e) => { if (e.target.className === "modal-bg") onClose(); }}>
      <div className="modal-w">{children}</div>
    </div>
  );
}

function AddReelModal({ onClose, onDone, isAdmin }) {
  const [f, setF] = useState({ url: "", trend_name: "", trend_desc: "", reels_count: "", publish_date: "", audio_name: "", audio_url: "", category: "", tags: "", caption: "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setErr(""); setBusy(true);
    const r = await api.post("/api/trends/reels", f);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    onDone(r.duplicate ? "That reel was already in the directory." : "Added to the directory.");
  };
  return (
    <Modal onClose={onClose}>
      <h3>Add a reel</h3>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 0 }}>
        {isAdmin
          ? "You're an admin — this goes into the official U2berClub directory that every creator sees."
          : "This is added to your own collection. Only you can see it."}
      </p>
      <div className="field"><label className="lbl">Instagram link</label><input className="inp" value={f.url} onChange={set("url")} placeholder="https://www.instagram.com/reel/..." /></div>
      <div className="field"><label className="lbl">Trend name</label><input className="inp" value={f.trend_name} onChange={set("trend_name")} placeholder="e.g. Tap to reveal" /></div>
      <div className="field"><label className="lbl">What is this trend?</label>
        <textarea className="inp" style={{ minHeight: 78, resize: "vertical" }} value={f.trend_desc} onChange={set("trend_desc")}
          placeholder="Describe how it works — the format, the sound, what makes people stop. This becomes the article text on a published list." /></div>
      <div style={{ display: "flex", gap: 10 }}>
        <div className="field" style={{ flex: 1 }}><label className="lbl">Reels made with it</label><input className="inp" value={f.reels_count} onChange={set("reels_count")} placeholder="12K" /></div>
        <div className="field" style={{ flex: 1 }}><label className="lbl">Date of publish</label><input className="inp" type="date" value={f.publish_date} onChange={set("publish_date")} /></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div className="field" style={{ flex: 1 }}><label className="lbl">Audio / sound</label><input className="inp" value={f.audio_name} onChange={set("audio_name")} placeholder="I Feel Love – Donna Summer" /></div>
        <div className="field" style={{ flex: 1 }}><label className="lbl">Audio link</label><input className="inp" value={f.audio_url} onChange={set("audio_url")} placeholder="https://instagram.com/reels/audio/..." /></div>
      </div>
      <div className="field"><label className="lbl">Category</label><input className="inp" value={f.category} onChange={set("category")} placeholder="Restaurant, Fitness, Fashion…" /></div>
      <div className="field"><label className="lbl">Tags</label><input className="inp" value={f.tags} onChange={set("tags")} placeholder="hook transition food" /></div>
      <div className="field"><label className="lbl">What is it? (optional)</label><input className="inp" value={f.caption} onChange={set("caption")} placeholder="short description" /></div>
      {err && <div className="err">{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn btn-amber" disabled={busy || !f.url.trim()} onClick={submit}>{busy ? "…" : "Add to directory"}</button>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

function NewListModal({ onClose, onDone }) {
  const [title, setTitle] = useState(""); const [blurb, setBlurb] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const submit = async () => {
    setBusy(true); const r = await api.post("/api/trends/lists", { title, blurb }); setBusy(false);
    if (r.error) { setErr(r.error); return; }
    onDone();
  };
  return (
    <Modal onClose={onClose}>
      <h3>New list</h3>
      <div className="field"><label className="lbl">Name</label><input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Restaurant reels to recreate" /></div>
      <div className="field"><label className="lbl">Short description (shows on the public page)</label><input className="inp" value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="For Ludhiana restaurant owners" /></div>
      {err && <div className="err">{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-amber" disabled={busy || !title.trim()} onClick={submit}>Create</button>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

function UsernameModal({ current, onClose, onDone }) {
  const [u, setU] = useState(current || "");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const submit = async () => {
    setErr(""); setBusy(true);
    const r = await api.post("/api/trends/username", { username: u });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    onDone(r.username);
  };
  return (
    <Modal onClose={onClose}>
      <h3>Pick your username</h3>
      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 0 }}>
        This becomes the address of every list you publish:<br />
        <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>tools.u2berclub.com/list/<b>{u || "yourname"}</b>/your-list</span>
      </p>
      <div className="field">
        <input className="inp" value={u} onChange={(e) => setU(e.target.value.toLowerCase())} placeholder="atul" />
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 5 }}>3–30 characters. Lowercase letters, numbers, hyphen, underscore.</div>
      </div>
      {err && <div className="err">{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-amber" disabled={busy || !u.trim()} onClick={submit}>Save username</button>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

function AddToListModal({ reelId, lists, onClose, onDone }) {
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!sel) return;
    setBusy(true);
    await api.post(`/api/trends/lists/${sel}/items`, { reelIds: [reelId] });
    setBusy(false); onDone("Added to list.");
  };
  return (
    <Modal onClose={onClose}>
      <h3>Add to a list</h3>
      {!lists.length ? (
        <p style={{ fontSize: 13.5, color: "var(--muted)" }}>You don't have any lists yet. Make one in the "My lists" tab first.</p>
      ) : (
        <div style={{ border: "1px solid var(--line)", borderRadius: 8, marginBottom: 12, maxHeight: 260, overflow: "auto" }}>
          {lists.map((l) => (
            <label className="pick-row" key={l.id}>
              <input type="radio" name="lst" checked={sel === l.id} onChange={() => setSel(l.id)} style={{ marginTop: 3 }} />
              <span>
                <b style={{ fontSize: 13.5 }}>{l.title}</b>
                <span style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted)" }}>
                  {l.item_count} reels · {l.published ? "published" : "private"}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-amber" disabled={!sel || busy} onClick={submit}>Add</button>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

/* Import from the user's own SAVEDREELS vault */
function ImportModal({ onClose, onDone, isAdmin }) {
  const [rows, setRows] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const v = await api.get("/api/data/savedreels_vault");
        const recs = v && v.records && Array.isArray(v.records.records) ? v.records.records : [];
        if (!recs.length) { setErr("Your SAVEDREELS vault is empty. Open SAVEDREELS and upload your Instagram export first."); setRows([]); return; }
        setRows(recs.map((r) => ({
          url: r.url,
          caption: (r.caption || "").replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim(),
          collection: r.collection || "",
          tags: (r.tags || []).join(" "),
        })));
      } catch { setErr("Couldn't reach your vault."); setRows([]); }
    })();
  }, []);

  const shown = useMemo(() => {
    if (!rows) return [];
    const s = q.trim().toLowerCase();
    return rows.filter((r) => !s || `${r.caption} ${r.collection}`.toLowerCase().includes(s));
  }, [rows, q]);

  const submit = async () => {
    const items = shown.filter((r) => sel.has(r.url)).map((r) => ({
      url: r.url, caption: r.caption.slice(0, 200),
      category: cat.trim() || r.collection.replace(/^[^\p{L}\p{N}]+/u, "").trim(),
      tags: r.tags,
    }));
    if (!items.length) { setErr("Tick at least one reel."); return; }
    setBusy(true);
    const res = await api.post("/api/trends/reels/bulk", { items });
    setBusy(false);
    onDone(`Added ${res.added} to the directory${res.skipped ? ` · ${res.skipped} already there` : ""}.`);
  };

  return (
    <Modal onClose={onClose}>
      <h3>Import from SAVEDREELS</h3>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 0 }}>
        These go into your own collection — only you see them. Your private notes don't come along.
      </p>
      {rows === null ? <div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>Loading your vault…</div> : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input className="inp" style={{ flex: 1, minWidth: 150 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            <input className="inp" style={{ width: 170 }} placeholder="Category for all" value={cat} onChange={(e) => setCat(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button className="mini" onClick={() => setSel(new Set(shown.map((r) => r.url)))}>Select all shown</button>
            <button className="mini" onClick={() => setSel(new Set())}>Clear</button>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>{sel.size} selected</span>
          </div>
          <div style={{ border: "1px solid var(--line)", borderRadius: 8, maxHeight: 300, overflow: "auto" }}>
            {shown.slice(0, 300).map((r) => (
              <label className="pick-row" key={r.url}>
                <input type="checkbox" checked={sel.has(r.url)} style={{ marginTop: 3 }}
                  onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(r.url) : n.delete(r.url); setSel(n); }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13 }}>{r.caption.slice(0, 100) || r.url}</span>
                  {r.collection && <span className="catpill" style={{ marginLeft: 6 }}>{r.collection}</span>}
                </span>
              </label>
            ))}
          </div>
        </>
      )}
      {err && <div className="err">{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn btn-amber" disabled={busy || !sel.size} onClick={submit}>{busy ? "…" : `Add ${sel.size} to directory`}</button>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
