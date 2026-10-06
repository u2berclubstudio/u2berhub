/* FilmLens licence API.
 *
 * Mounted in index.js as:  app.use("/api/filmlens", filmlens);
 * The router enforces its own guards, like feedsorter does — the three
 * endpoints the Chrome extension calls are public, everything under /admin
 * goes through the hub's normal auth(true) + adminOnly.
 *
 * Tokens are signed RS256 with node:crypto (no new npm dependency). The
 * private key never leaves this server; the extension ships with only the
 * public half, so it can verify a licence but never issue one.
 *
 * HONEST SCOPE: this is access control, not copy protection. An extension's
 * code sits on the user's own machine, so a technical person can delete the
 * check and reload. What it does achieve: a forwarded folder stops working,
 * you see who is using it and from how many devices, and you can revoke.
 */
import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { q } from "./db/index.js";
import { auth, adminOnly } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();
router.use(express.json({ limit: "32kb" }));

const TOKEN_DAYS = Number(process.env.FILMLENS_TOKEN_DAYS || 30);

/* ---------------- key loading ----------------
 * Prefer a file: the hub's .env loader does not understand multi-line values,
 * so a PEM pasted into .env arrives with literal \n and will not parse. The
 * env var is still supported, with the escapes undone.
 */
function loadPrivateKey() {
  const fromFile = process.env.FILMLENS_PRIVATE_KEY_FILE ||
    path.join(__dirname, "..", ".keys", "filmlens-private.pem");
  try {
    const pem = fs.readFileSync(fromFile, "utf8");
    if (pem.includes("PRIVATE KEY")) return pem;
  } catch { /* fall through to the env var */ }

  const raw = process.env.FILMLENS_PRIVATE_KEY;
  if (raw && raw.includes("PRIVATE KEY")) return raw.replace(/\\n/g, "\n");
  return null;
}

let PRIVATE_KEY = loadPrivateKey();
const hasKey = () => !!PRIVATE_KEY;

const b64u = (buf) => Buffer.from(buf).toString("base64url");

function signToken(payload) {
  const header = { alg: "RS256", typ: "JWT" };
  const data = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  return `${data}.${b64u(crypto.sign("sha256", Buffer.from(data), PRIVATE_KEY))}`;
}

function readToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || !PRIVATE_KEY) return null;
  try {
    const ok = crypto.verify(
      "sha256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      crypto.createPublicKey(PRIVATE_KEY),
      Buffer.from(parts[2], "base64url")
    );
    if (!ok) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

const mint = (email, code, did) => {
  const now = Math.floor(Date.now() / 1000);
  return signToken({ sub: email, code, did, iat: now, exp: now + TOKEN_DAYS * 86400 });
};

const cleanEmail = (v) => String(v || "").trim().toLowerCase();
const cleanCode = (v) => String(v || "").trim().toUpperCase();
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/* The extension calls from a chrome-extension:// origin. */
function openCors(req, res, next) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
}

function needKey(res) {
  if (hasKey()) return true;
  res.status(500).json({ error: "FilmLens signing key is not installed on the server." });
  return false;
}

/* ================= PUBLIC: what the extension calls ================= */

router.options("/activate", openCors);
router.post("/activate", openCors, async (req, res) => {
  if (!needKey(res)) return;

  const email = cleanEmail(req.body?.email);
  const code = cleanCode(req.body?.code);
  const deviceId = String(req.body?.device_id || "").slice(0, 64);
  const version = String(req.body?.version || "").slice(0, 16);

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "That email does not look right." });
  if (!code || !deviceId) return res.status(400).json({ error: "Email, invite code and device are all required." });

  try {
    const { rows } = await q("SELECT * FROM filmlens_codes WHERE code=$1", [code]);
    const rec = rows[0];
    if (!rec) return res.status(404).json({ error: "That invite code does not exist." });
    if (rec.revoked) return res.status(403).json({ error: "That invite code has been revoked." });
    if (rec.expires_at && new Date(rec.expires_at) < new Date()) {
      return res.status(403).json({ error: "That invite code has expired." });
    }
    if (rec.bound_email && rec.bound_email !== email) {
      return res.status(403).json({ error: "This code is already registered to a different email address." });
    }

    // same device activating again costs no extra seat
    const { rows: mine } = await q(
      "SELECT id FROM filmlens_activations WHERE code=$1 AND device_id=$2", [code, deviceId]);
    if (!mine.length) {
      const { rows: used } = await q(
        "SELECT COUNT(*)::int AS n FROM filmlens_activations WHERE code=$1 AND released_at IS NULL", [code]);
      if (used[0].n >= rec.seats) {
        return res.status(409).json({
          error: `All ${rec.seats} device slots for this code are in use. Sign out on another device first.`,
        });
      }
    }

    await q(
      `INSERT INTO filmlens_activations (code,email,device_id,version,user_agent,ip)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (code,device_id) DO UPDATE
         SET email=EXCLUDED.email, version=EXCLUDED.version, last_seen=now(), released_at=NULL`,
      [code, email, deviceId, version, String(req.get("user-agent") || "").slice(0, 300), req.ip]);

    if (!rec.bound_email) {
      await q("UPDATE filmlens_codes SET bound_email=$1 WHERE code=$2", [email, code]);
    }

    res.json({ token: mint(email, code, deviceId), days: TOKEN_DAYS });
  } catch (e) {
    console.error("[filmlens] activate:", e.message);
    res.status(500).json({ error: "Activation failed on the server." });
  }
});

/* Called about once a day by each install. 401/403 here is the ONLY thing
   that locks a user out, so a database wobble must return 500, never 403. */
router.options("/verify", openCors);
router.post("/verify", openCors, async (req, res) => {
  if (!needKey(res)) return;
  const payload = readToken(req.body?.token);
  if (!payload) return res.status(401).json({ error: "Token is invalid or expired." });

  try {
    const { rows } = await q(
      `SELECT c.revoked, c.expires_at, a.released_at
         FROM filmlens_codes c
         LEFT JOIN filmlens_activations a ON a.code=c.code AND a.device_id=$2
        WHERE c.code=$1`, [payload.code, payload.did]);
    const rec = rows[0];
    if (!rec) return res.status(403).json({ error: "Code no longer exists." });
    if (rec.revoked) return res.status(403).json({ error: "Access revoked." });
    if (rec.expires_at && new Date(rec.expires_at) < new Date()) {
      return res.status(403).json({ error: "Code expired." });
    }
    if (rec.released_at) return res.status(403).json({ error: "This device was signed out." });

    await q("UPDATE filmlens_activations SET last_seen=now() WHERE code=$1 AND device_id=$2",
      [payload.code, payload.did]);
    res.json({ token: mint(payload.sub, payload.code, payload.did), days: TOKEN_DAYS });
  } catch (e) {
    console.error("[filmlens] verify:", e.message);
    res.status(500).json({ error: "Verification unavailable." });
  }
});

router.options("/deactivate", openCors);
router.post("/deactivate", openCors, async (req, res) => {
  if (!needKey(res)) return;
  const payload = readToken(req.body?.token);
  if (!payload) return res.status(400).json({ error: "Token is invalid." });
  try {
    await q("UPDATE filmlens_activations SET released_at=now() WHERE code=$1 AND device_id=$2",
      [payload.code, payload.did]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Could not release the seat." });
  }
});

router.get("/health", (req, res) =>
  res.json({ ok: true, signing_key: hasKey(), token_days: TOKEN_DAYS }));

/* ================= ADMIN: the hub's own auth ================= */
const admin = [auth(true), adminOnly];

router.get("/admin/codes", ...admin, async (req, res) => {
  const { rows } = await q(
    `SELECT c.code, c.note, c.seats, c.revoked, c.expires_at, c.bound_email, c.created_at,
            COUNT(a.id) FILTER (WHERE a.released_at IS NULL) AS seats_used,
            MAX(a.last_seen) AS last_seen
       FROM filmlens_codes c
       LEFT JOIN filmlens_activations a ON a.code = c.code
      GROUP BY c.code
      ORDER BY c.created_at DESC`);
  res.json({ codes: rows, signing_key: hasKey() });
});

router.get("/admin/activations", ...admin, async (req, res) => {
  const { rows } = await q(
    `SELECT code, email, device_id, version, activated_at, last_seen, released_at
       FROM filmlens_activations ORDER BY last_seen DESC LIMIT 500`);
  res.json({ activations: rows });
});

router.post("/admin/codes", ...admin, async (req, res) => {
  const count = Math.min(100, Math.max(1, parseInt(req.body?.count) || 1));
  const seats = Math.min(10, Math.max(1, parseInt(req.body?.seats) || 2));
  const note = String(req.body?.note || "").trim().slice(0, 160) || null;
  const expires = req.body?.expires_at || null;

  const made = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString("hex").toUpperCase(); // 8 chars
    const code = `FL-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    await q(
      `INSERT INTO filmlens_codes (code,note,seats,expires_at,created_by)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [code, note, seats, expires, req.user.id]);
    made.push(code);
  }
  res.json({ ok: true, codes: made });
});

router.post("/admin/revoke", ...admin, async (req, res) => {
  const code = cleanCode(req.body?.code);
  const revoked = req.body?.revoked !== false;
  await q("UPDATE filmlens_codes SET revoked=$2 WHERE code=$1", [code, revoked]);
  res.json({ ok: true, code, revoked });
});

router.post("/admin/release", ...admin, async (req, res) => {
  const code = cleanCode(req.body?.code);
  const deviceId = String(req.body?.device_id || "");
  await q(
    "UPDATE filmlens_activations SET released_at=now() WHERE code=$1 AND ($2='' OR device_id=$2)",
    [code, deviceId]);
  res.json({ ok: true });
});

export default router;
