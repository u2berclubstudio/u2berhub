import React, { useState, useEffect, useCallback } from "react";
import { api } from "./theme.js";

export default function Admin() {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]); const [invites, setInvites] = useState([]); const [tools, setTools] = useState([]);
  const [note, setNote] = useState(""); const [maxUses, setMaxUses] = useState(1); const [fresh, setFresh] = useState("");

  // FilmLens (Chrome extension) licences
  const [flCodes, setFlCodes] = useState([]); const [flActs, setFlActs] = useState([]);
  const [flKeyOk, setFlKeyOk] = useState(true);
  const [flNote, setFlNote] = useState(""); const [flCount, setFlCount] = useState(5);
  const [flSeats, setFlSeats] = useState(2); const [flFresh, setFlFresh] = useState([]);

  const load = useCallback(async () => {
    setUsers((await api.get("/api/admin/users")).users || []);
    setInvites((await api.get("/api/admin/invites")).invites || []);
    setTools((await api.get("/api/tools")).tools || []);
    try {
      const c = await api.get("/api/filmlens/admin/codes");
      setFlCodes(c.codes || []); setFlKeyOk(c.signing_key !== false);
      setFlActs((await api.get("/api/filmlens/admin/activations")).activations || []);
    } catch { /* router not deployed yet — the other tabs still work */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (id, action) => { await api.post(`/api/admin/users/${id}/${action}`); load(); };
  const toggleTool = async (u, toolId) => {
    const all = tools.map((t) => t.id);
    const current = (u.tool_access == null || u.tool_access === "") ? all : u.tool_access.split(",").filter(Boolean);
    const next = current.includes(toolId) ? current.filter((t) => t !== toolId) : [...current, toolId];
    // if they end up with everything, clear the restriction (null = all, future-proof)
    const payload = next.length === all.length ? null : next;
    await api.post(`/api/admin/users/${u.id}/tools`, { tools: payload });
    load();
  };
  const mint = async () => {
    const r = await api.post("/api/admin/invites", { note, maxUses: Number(maxUses) });
    if (r.code) { setFresh(r.code); setNote(""); load(); }
  };
  const copy = (c) => navigator.clipboard?.writeText(c);

  const flMake = async () => {
    const r = await api.post("/api/filmlens/admin/codes", {
      count: Number(flCount), seats: Number(flSeats), note: flNote || null,
    });
    if (r.codes) { setFlFresh(r.codes); setFlNote(""); load(); }
  };
  const flRevoke = async (code, revoked) => {
    await api.post("/api/filmlens/admin/revoke", { code, revoked });
    load();
  };
  const flRelease = async (code, device_id = "") => {
    await api.post("/api/filmlens/admin/release", { code, device_id });
    load();
  };
  const shortDate = (v) => v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "\u2014";
  const shortTime = (v) => v ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "\u2014";

  return (
    <div className="wrap">
      <div className="eyebrow" style={{ marginTop: 10 }}>Admin</div>
      <div className="h1" style={{ fontSize: 26 }}>Manage access</div>
      <div className="tabs">
        <button className={"tab " + (tab === "users" ? "on" : "")} onClick={() => setTab("users")}>Users ({users.length})</button>
        <button className={"tab " + (tab === "invites" ? "on" : "")} onClick={() => setTab("invites")}>Invite codes</button>
        <button className={"tab " + (tab === "filmlens" ? "on" : "")} onClick={() => setTab("filmlens")}>FilmLens keys ({flCodes.length})</button>
      </div>

      {tab === "users" && (
        <div className="card">
          <table className="admin">
            <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Role</th><th>Tools</th><th>Joined</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td><td>{u.email}</td>
                  <td><span className={"pill " + u.status}>{u.status}</span></td>
                  <td>{u.role}</td>
                  <td>
                    {u.role === "admin" ? (
                      <span style={{ fontSize: 11.5, color: "var(--muted)" }}>all</span>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {tools.map((t) => {
                          const on = (u.tool_access == null || u.tool_access === "") || u.tool_access.split(",").includes(t.id);
                          return (
                            <button key={t.id} onClick={() => toggleTool(u, t.id)} title={t.name}
                              style={{
                                fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".04em",
                                padding: "3px 7px", borderRadius: 5, cursor: "pointer",
                                border: "1px solid " + (on ? "var(--good)" : "var(--line)"),
                                background: on ? "#E8F3EB" : "#fff",
                                color: on ? "var(--good)" : "var(--muted)",
                                textDecoration: on ? "none" : "line-through",
                              }}>
                              {t.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td style={{ color: "var(--muted)" }}>{new Date(u.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                  <td>
                    {u.role !== "admin" && <>
                      {u.status !== "active" && <button className="link-btn" onClick={() => act(u.id, "approve")}>Approve</button>}
                      {u.status !== "blocked" && <button className="link-btn" style={{ marginLeft: 10, color: "var(--warn)" }} onClick={() => act(u.id, "block")}>Block</button>}
                      {u.status === "blocked" && <button className="link-btn" style={{ marginLeft: 10 }} onClick={() => act(u.id, "approve")}>Unblock</button>}
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "invites" && (
        <div className="card">
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 18 }}>
            <div><label className="lbl">Who's it for (note)</label><input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Rahul from Chandigarh" /></div>
            <div><label className="lbl">Max uses</label><input className="inp" style={{ width: 90 }} type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} /></div>
            <button className="btn btn-amber" onClick={mint}>Generate code</button>
          </div>
          {fresh && <div style={{ marginBottom: 16 }}><span className="code-chip">{fresh}</span> <button className="link-btn" style={{ marginLeft: 8 }} onClick={() => copy(fresh)}>copy</button> <span style={{ fontSize: 12.5, color: "var(--muted)" }}>— share this with the creator</span></div>}
          <table className="admin">
            <thead><tr><th>Code</th><th>Note</th><th>Uses</th><th>Created</th></tr></thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.code}>
                  <td><span className="code-chip" style={{ fontSize: 12 }}>{i.code}</span> <button className="link-btn" onClick={() => copy(i.code)}>copy</button></td>
                  <td>{i.note || "—"}</td>
                  <td style={{ color: i.uses >= i.max_uses ? "var(--warn)" : "var(--good)" }}>{i.uses}/{i.max_uses}</td>
                  <td style={{ color: "var(--muted)" }}>{new Date(i.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "filmlens" && (
        <>
          {!flKeyOk && (
            <div className="card" style={{ marginBottom: 14, borderColor: "var(--warn)" }}>
              <b>Signing key missing on the server.</b> Codes can be created but the extension
              cannot be activated until <code>.keys/filmlens-private.pem</code> exists
              (run <code>node scripts/filmlens-keys.mjs</code> and restart PM2).
            </div>
          )}

          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
              <div><label className="lbl">Who's it for (note)</label><input className="inp" value={flNote} onChange={(e) => setFlNote(e.target.value)} placeholder="e.g. Oct cohort \u2014 Rahul" /></div>
              <div><label className="lbl">How many</label><input className="inp" style={{ width: 90 }} type="number" min="1" max="100" value={flCount} onChange={(e) => setFlCount(e.target.value)} /></div>
              <div><label className="lbl">Devices each</label><input className="inp" style={{ width: 90 }} type="number" min="1" max="10" value={flSeats} onChange={(e) => setFlSeats(e.target.value)} /></div>
              <button className="btn btn-amber" onClick={flMake}>Generate keys</button>
            </div>
            {flFresh.length > 0 && (
              <div>
                <div className="lbl" style={{ marginBottom: 6 }}>Fresh keys \u2014 share one per person</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  {flFresh.map((c) => <span key={c} className="code-chip">{c}</span>)}
                  <button className="link-btn" onClick={() => copy(flFresh.join("\n"))}>copy all</button>
                </div>
              </div>
            )}
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, lineHeight: 1.6 }}>
              The person enters their email + this key once in the extension popup. It then works
              offline for 30 days and renews itself quietly. Revoke locks them out at their next
              daily check \u2014 a server outage does not.
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="lbl" style={{ marginBottom: 10 }}>Keys</div>
            <table className="admin">
              <thead><tr><th>Key</th><th>Note</th><th>Seats</th><th>Email</th><th>Last seen</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {flCodes.length === 0 && <tr><td colSpan="7" style={{ color: "var(--muted)" }}>No keys yet.</td></tr>}
                {flCodes.map((c) => (
                  <tr key={c.code}>
                    <td><span className="code-chip" style={{ fontSize: 12 }}>{c.code}</span> <button className="link-btn" onClick={() => copy(c.code)}>copy</button></td>
                    <td>{c.note || "\u2014"}</td>
                    <td style={{ color: Number(c.seats_used) >= c.seats ? "var(--warn)" : "var(--good)" }}>{c.seats_used}/{c.seats}</td>
                    <td style={{ fontSize: 12 }}>{c.bound_email || "\u2014"}</td>
                    <td style={{ color: "var(--muted)" }}>{shortDate(c.last_seen)}</td>
                    <td><span className={"pill " + (c.revoked ? "blocked" : "active")}>{c.revoked ? "revoked" : "active"}</span></td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="link-btn" onClick={() => flRelease(c.code)}>Free seats</button>
                      <button className="link-btn" style={{ marginLeft: 10, color: c.revoked ? "var(--good)" : "var(--warn)" }}
                        onClick={() => flRevoke(c.code, !c.revoked)}>
                        {c.revoked ? "Restore" : "Revoke"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="lbl" style={{ marginBottom: 10 }}>Activations</div>
            <table className="admin">
              <thead><tr><th>Last seen</th><th>Email</th><th>Key</th><th>Device</th><th>Version</th><th></th></tr></thead>
              <tbody>
                {flActs.length === 0 && <tr><td colSpan="6" style={{ color: "var(--muted)" }}>Nobody has activated yet.</td></tr>}
                {flActs.map((a) => (
                  <tr key={a.code + a.device_id}>
                    <td style={{ color: "var(--muted)" }}>{shortTime(a.last_seen)}</td>
                    <td>{a.email}</td>
                    <td><span className="code-chip" style={{ fontSize: 11.5 }}>{a.code}</span></td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{String(a.device_id).slice(0, 8)}</td>
                    <td style={{ color: "var(--muted)" }}>{a.version || "\u2014"}</td>
                    <td>{a.released_at
                      ? <span className="pill blocked">signed out</span>
                      : <button className="link-btn" onClick={() => flRelease(a.code, a.device_id)}>Free</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}