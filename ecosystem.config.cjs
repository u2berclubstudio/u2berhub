// No secrets here — they live in .env, which git ignores.
// Safe to commit and safe to overwrite on every git pull.
module.exports = {
  apps: [{
    name: "u2berhub",
    script: "server/index.js",
    cwd: "/root/u2berhub",
    env: { NODE_ENV: "production" },
  }],
};
