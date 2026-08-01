module.exports = {
  apps: [{
    name: "u2berhub",
    script: "server/index.js",
    env: {
      PORT: 4000,
      NODE_ENV: "production",
      DATABASE_URL: process.env.DATABASE_URL || "postgres://u2ber:CHANGE_ME@localhost:5432/u2berhub",
      ADMIN_EMAIL: process.env.ADMIN_EMAIL || "",
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "",
      ADMIN_NAME: process.env.ADMIN_NAME || "Admin",
    },
  }],
};
