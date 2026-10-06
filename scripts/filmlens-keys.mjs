#!/usr/bin/env node
/* Generate the key pair that signs FilmLens licence tokens.
 *
 *   node scripts/filmlens-keys.mjs
 *
 * Writes .keys/filmlens-private.pem (git-ignored) and prints the public JWK
 * to paste into the extension's src/licence.js.
 *
 * Two keys rather than one shared secret, on purpose: the extension ships to
 * other people's machines. With an asymmetric pair it can verify a licence but
 * never issue one. A shared secret inside an extension is not a secret.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const keyDir = path.join(root, ".keys");
const keyPath = path.join(keyDir, "filmlens-private.pem");

if (fs.existsSync(keyPath) && !process.argv.includes("--force")) {
  console.error(`
A key already exists at ${keyPath}

Replacing it invalidates every licence already activated — everyone would have
to activate again. If that is really what you want, re-run with --force.
`);
  process.exit(1);
}

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const jwk = crypto.createPublicKey(publicKey).export({ format: "jwk" });
const extensionJwk = { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true };

fs.mkdirSync(keyDir, { recursive: true });
fs.writeFileSync(keyPath, privateKey, { mode: 0o600 });
fs.writeFileSync(path.join(keyDir, "filmlens-public.jwk.json"), JSON.stringify(extensionJwk, null, 2));

console.log(`
Private key written to  .keys/filmlens-private.pem   (git-ignored, mode 600)
Public JWK written to   .keys/filmlens-public.jwk.json

server/filmlens.js reads the private key from that path automatically — no .env
entry needed. (The hub's .env loader cannot hold multi-line values, which is
why the key lives in a file.)

================================================================
 Paste this over PUBLIC_JWK in the extension's src/licence.js
================================================================

  const PUBLIC_JWK = ${JSON.stringify(extensionJwk, null, 4).replace(/\n/g, "\n  ")};

Then: pm2 restart u2berhub
`);
