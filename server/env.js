// Loads secrets from a .env file that git never sees.
// Anything already in the real environment wins, so PM2/CI can still override.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = process.env.ENV_FILE || path.join(__dirname, "..", ".env");

export function loadEnv() {
  let raw;
  try { raw = fs.readFileSync(ENV_PATH, "utf8"); } catch { return false; }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
  return true;
}
