import React, { useState, useEffect, useCallback } from "react";
import { api } from "./theme.js";

export default function Admin() {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]); const [invites, setInvites] = useState([]);
  const [note, setNote] = useState(""); const [maxUses, setMaxUses] = useState(1); const [fresh, setFresh] = useState("");

  const load = useCallback(async () => {
    setUsers((await api.get("/api/admin/users")).users || []);
    setInvites((await api.get("/api/admin/invites")).invites || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (id, action) => { await api.post(`/api/admin/users/${id}/${action}`); load(); };
  const mint = async () => {
    const r = await api.post("/api/admin/invites", { note, maxUses: Number(maxUses) });
    if (r.code) { setFresh(r.code); setNote(""); load(); }
  };
  const copy = (c) => navigator.clipboard?.writeText(c);

  return (
    <div className="wrap">
      <div className="eyebrow" style={{ marginTop: 10 }}>Admin</div>
      <div className="h1" style={{ fontSize: 26 }}>Manage access</div>
      <div className="tabs">
        <button className={"tab " + (tab === "users" ? "on" : "")} onClick={() => setTab("users")}>Users ({users.length})</button>
        <button className={"tab " + (tab === "invites" ? "on" : "")} onClick={() => setTab("invites")}>Invite codes</button>
      </div>

      {tab === "users" && (
        <div className="card">
          <table className="admin">
            <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Role</th><th>Joined</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td><td>{u.email}</td>
                  <td><span className={"pill " + u.status}>{u.status}</span></td>
                  <td>{u.role}</td>
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
    </div>
  );
}
