module.exports = {
  apps: [
    {
      name: process.env.PM2_PROCESS_NAME || 'catraserver',
      script: 'server.js',
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
