import React, { useState } from "react";
import { api } from "./theme.js";

export default function Auth({ onDone }) {
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ name: "", email: "", password: "", code: "" });
  const [err, setErr] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    setErr(""); setOk(""); setBusy(true);
    try {
      if (mode === "login") {
        const r = await api.post("/api/auth/login", { email: f.email, password: f.password });
        if (r.error) { setErr(r.error); return; }
        if (r.pending) { setErr("Your account is still awaiting admin approval."); return; }
        onDone();
      } else {
        const r = await api.post("/api/auth/register", { name: f.name, email: f.email, password: f.password, code: f.code });
        if (r.error) { setErr(r.error); return; }
        setOk("Account created! An admin will approve you shortly. You'll be able to sign in once approved.");
        setMode("login");
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="center">
      <div className="authbox">
        <img className="logo" src="/logo.png" alt="U2berClub" />
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div className="eyebrow">U2berClub Tools · Making Creators Smart</div>
          <div className="h1" style={{ fontSize: 26 }}>{mode === "login" ? "Sign in" : "Request access"}</div>
        </div>
        <div className="card">
          {mode === "register" && (
            <>
              <div className="field"><label className="lbl">Name</label><input className="inp" value={f.name} onChange={set("name")} /></div>
              <div className="field"><label className="lbl">Invite code</label><input className="inp" value={f.code} onChange={set("code")} placeholder="U2B-XXXXXXXX" /></div>
            </>
          )}
          <div className="field"><label className="lbl">Email</label><input className="inp" type="email" value={f.email} onChange={set("email")} /></div>
          <div className="field"><label className="lbl">Password</label><input className="inp" type="password" value={f.password} onChange={set("password")} placeholder={mode === "register" ? "at least 8 characters" : ""} /></div>
          {err && <div className="err">{err}</div>}
          {ok && <div className="ok">{ok}</div>}
          <button className="btn btn-amber" style={{ width: "100%", marginTop: 6 }} disabled={busy} onClick={submit}>
            {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
          <div style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: "var(--muted)" }}>
            {mode === "login"
              ? <>Have an invite code? <button className="link-btn" onClick={() => { setMode("register"); setErr(""); }}>Register</button></>
              : <>Already approved? <button className="link-btn" onClick={() => { setMode("login"); setErr(""); }}>Sign in</button></>}
          </div>
        </div>
        <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--muted)", marginTop: 16, fontFamily: "var(--mono)" }}>Signup is invite-only.</p>
      </div>
    </div>
  );
}
