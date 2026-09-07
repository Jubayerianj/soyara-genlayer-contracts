module.exports = {
  apps: [
    {
      name: 'soyara-keeper-web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'soyara-keeper-daemon',
      script: 'scripts/keeper-daemon.mjs',
      restart_delay: 5000,
      max_restarts: 10,
      env: {
        KEEPER_POLL_INTERVAL_MS: 4000,
      },
    },
  ],
};
