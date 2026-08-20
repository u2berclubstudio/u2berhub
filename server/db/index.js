import { loadEnv } from "../env.js";
loadEnv();   // secrets must be present before the pool is created

import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ||
    `postgres://${process.env.PGUSER || "u2ber"}:${process.env.PGPASSWORD || "u2ber"}@${process.env.PGHOST || "localhost"}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || "u2berhub"}`,
});

export const q = (text, params) => pool.query(text, params);

export async function initDb() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(sql);
  // seed the first admin from env, if given and not present
  const email = process.env.ADMIN_EMAIL, pass = process.env.ADMIN_PASSWORD, name = process.env.ADMIN_NAME || "Admin";
  if (email && pass) {
    const { rows } = await pool.query("SELECT id FROM users WHERE email=$1", [email.toLowerCase()]);
    if (!rows.length) {
      const { hashPassword } = await import("../auth.js");
      await pool.query(
        "INSERT INTO users (email,name,pass_hash,role,status,approved_at) VALUES ($1,$2,$3,'admin','active',now())",
        [email.toLowerCase(), name, hashPassword(pass)]
      );
      console.log(`Seeded admin: ${email}`);
    }
  }
}
export default pool;
