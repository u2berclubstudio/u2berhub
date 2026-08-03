import express from "express";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { q, initDb } from "./db/index.js";
import { hashPassword, verifyPassword, createSession, destroySession, auth, adminOnly, publicUser } from "./auth.js";
import { TOOLS } from "./tools.js";
import contentflow from "./contentflow.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "8mb" }));
app.use(cookieParser());

const isProd = process.env.NODE_ENV === "production";
const cookieOpts = { httpOnly: true, sameSite: "lax", secure: isProd, maxAge: 30 * 24 * 60 * 60 * 1000, path: "/" };
const clean = (s) => String(s || "").trim();
const emailOk = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

/* ---------------- AUTH ---------------- */
app.post("/api/auth/register", async (req, res) => {
  try {
    const email = clean(req.body.email).toLowerCase();
    const name = clean(req.body.name);
    const pw = String(req.body.password || "");
    const code = clean(req.body.code);
    if (!name || !emailOk(email)) return res.status(400).json({ error: "Give a valid name and email." });
    if (pw.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
    if (!code) return res.status(400).json({ error: "An invite code is required." });

    const { rows: cr } = await q("SELECT * FROM invite_codes WHERE code=$1", [code]);
    const invite = cr[0];
    if (!invite || invite.uses >= invite.max_uses) return res.status(400).json({ error: "That invite code is invalid or already used." });

    const { rows: ex } = await q("SELECT id FROM users WHERE email=$1", [email]);
    if (ex.length) return res.status(400).json({ error: "An account with that email already exists." });

    const { rows } = await q(
      `INSERT INTO users (email,name,pass_hash,invite_code,status) VALUES ($1,$2,$3,$4,'pending') RETURNING *`,
      [email, name, hashPassword(pw), code]);
    await q("UPDATE invite_codes SET uses=uses+1, used_by=$1 WHERE code=$2", [rows[0].id, code]);
    // pending: no session yet — must be approved first
    res.json({ ok: true, pending: true, message: "Account created. An admin will approve you shortly." });
  } catch (e) { res.status(500).json({ error: "Something went wrong creating your account." }); }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = clean(req.body.email).toLowerCase();
    const pw = String(req.body.password || "");
    const { rows } = await q("SELECT * FROM users WHERE email=$1", [email]);
    const u = rows[0];
    if (!u || !verifyPassword(pw, u.pass_hash)) return res.status(401).json({ error: "Wrong email or password." });
    if (u.status === "blocked") return res.status(403).json({ error: "This account has been blocked." });
    const { token } = await createSession(u.id);
    res.cookie("sid", token, cookieOpts);
    res.json({ ok: true, user: publicUser(u), pending: u.status === "pending" });
  } catch (e) { res.status(500).json({ error: "Login failed." }); }
});

app.post("/api/auth/logout", async (req, res) => {
  await destroySession(req.cookies?.sid);
  res.clearCookie("sid", { path: "/" });
  res.json({ ok: true });
});

app.get("/api/auth/me", auth(false), (req, res) => {
  res.json({ user: publicUser(req.user) });
});

/* ---------------- TOOLS (catalog) ---------------- */
app.get("/api/tools", auth(true), (req, res) => {
  res.json({ tools: TOOLS.map((t) => ({ id: t.id, name: t.name, tagline: t.tagline, status: t.status })) });
});

/* ---------------- PER-USER TOOL DATA ---------------- */
// generic key-value store, always scoped to the signed-in user + a tool namespace
app.get("/api/data/:tool", auth(true), async (req, res) => {
  const { rows } = await q("SELECT key, value FROM tool_data WHERE user_id=$1 AND tool=$2", [req.user.id, req.params.tool]);
  const out = {};
  rows.forEach((r) => { out[r.key] = r.value; });
  res.json(out);
});
app.put("/api/data/:tool", auth(true), async (req, res) => {
  const incoming = req.body && typeof req.body === "object" ? req.body : {};
  const entries = Object.entries(incoming);
  if (entries.length > 5000) return res.status(413).json({ error: "Too many items in one write." });
  for (const [key, value] of entries) {
    await q(
      `INSERT INTO tool_data (user_id,tool,key,value,updated_at) VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (user_id,tool,key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
      [req.user.id, req.params.tool, key, value]);
  }
  res.json({ ok: true, count: entries.length });
});
app.delete("/api/data/:tool/:key", auth(true), async (req, res) => {
  await q("DELETE FROM tool_data WHERE user_id=$1 AND tool=$2 AND key=$3", [req.user.id, req.params.tool, req.params.key]);
  res.json({ ok: true });
});

/* ---------------- ADMIN ---------------- */
app.get("/api/admin/users", auth(true), adminOnly, async (req, res) => {
  const { rows } = await q("SELECT id,email,name,role,status,invite_code,created_at,approved_at FROM users ORDER BY created_at DESC");
  res.json({ users: rows });
});
app.post("/api/admin/users/:id/:action", auth(true), adminOnly, async (req, res) => {
  const map = { approve: "active", block: "blocked", pending: "pending" };
  const status = map[req.params.action];
  if (!status) return res.status(400).json({ error: "Unknown action." });
  const approved = status === "active" ? "now()" : "approved_at";
  await q(`UPDATE users SET status=$1, approved_at=${status === "active" ? "now()" : "approved_at"} WHERE id=$2`, [status, req.params.id]);
  res.json({ ok: true });
});
app.get("/api/admin/invites", auth(true), adminOnly, async (req, res) => {
  const { rows } = await q("SELECT * FROM invite_codes ORDER BY created_at DESC");
  res.json({ invites: rows });
});
app.post("/api/admin/invites", auth(true), adminOnly, async (req, res) => {
  const note = clean(req.body.note);
  const maxUses = Math.max(1, Math.min(100, parseInt(req.body.maxUses) || 1));
  const code = "U2B-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  await q("INSERT INTO invite_codes (code,note,created_by,max_uses) VALUES ($1,$2,$3,$4)", [code, note, req.user.id, maxUses]);
  res.json({ ok: true, code });
});

app.use("/api/contentflow", contentflow);

/* ---------------- STATIC (built client) ---------------- */
app.use(express.static(path.join(__dirname, "..", "client", "dist")));
app.get("*", (_q, res) => res.sendFile(path.join(__dirname, "..", "client", "dist", "index.html")));

const port = process.env.PORT || 4000;
initDb().then(() => {
  app.listen(port, () => console.log(`U2berClub Tools hub on :${port}`));
}).catch((e) => { console.error("DB init failed:", e.message); process.exit(1); });
