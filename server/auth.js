import crypto from "crypto";
import { q } from "./db/index.js";

/* scrypt password hashing — no external dependency */
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
export function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex"), b = Buffer.from(test, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const DAY = 24 * 60 * 60 * 1000;
export async function createSession(userId, days = 30) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + days * DAY);
  await q("INSERT INTO sessions (token,user_id,expires_at) VALUES ($1,$2,$3)", [token, userId, expires]);
  return { token, expires };
}
export async function userFromToken(token) {
  if (!token) return null;
  const { rows } = await q(
    `SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token=$1 AND s.expires_at > now()`, [token]);
  return rows[0] || null;
}
export async function destroySession(token) {
  if (token) await q("DELETE FROM sessions WHERE token=$1", [token]);
}

/* express middleware */
export function auth(required = true) {
  return async (req, res, next) => {
    const u = await userFromToken(req.cookies?.sid);
    req.user = u || null;
    if (required && !u) return res.status(401).json({ error: "Not signed in." });
    if (required && u.status !== "active") return res.status(403).json({ error: "Your account is pending admin approval.", status: u.status });
    next();
  };
}
export function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "Admins only." });
  next();
}
export const publicUser = (u) => u && ({ id: u.id, email: u.email, name: u.name, role: u.role, status: u.status });
