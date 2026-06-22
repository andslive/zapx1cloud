// PM2 — Fase A (DRY_RUN)
// Uso (na VPS, dentro de /opt/x1zap/edge-mini):
//   pm2 start ecosystem.config.cjs
//   pm2 save
//   pm2 startup systemd -u x1zap --hp /home/x1zap
module.exports = {
  apps: [
    {
      name: "edge-api",
      script: "dist/server.js",
      cwd: "/opt/x1zap/edge-mini",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "512M",
      env: { NODE_ENV: "production" },
      out_file: "/var/log/x1zap/edge-api.out.log",
      error_file: "/var/log/x1zap/edge-api.err.log",
      time: true,
    },
    {
      name: "wa-inbound",
      script: "dist/workers/wa-inbound.js",
      cwd: "/opt/x1zap/edge-mini",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "512M",
      env: { NODE_ENV: "production" },
      out_file: "/var/log/x1zap/wa-inbound.out.log",
      error_file: "/var/log/x1zap/wa-inbound.err.log",
      time: true,
    },
    {
      name: "wa-outbound",
      script: "dist/workers/wa-outbound.js",
      cwd: "/opt/x1zap/edge-mini",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "512M",
      env: { NODE_ENV: "production" },
      out_file: "/var/log/x1zap/wa-outbound.out.log",
      error_file: "/var/log/x1zap/wa-outbound.err.log",
      time: true,
    },
  ],
};
