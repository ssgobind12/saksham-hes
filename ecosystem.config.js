module.exports = {
  apps: [
    {
      name: 'ssgobind-server',
      script: 'server.js',
      cwd: '/var/www/ssgobind/server',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_file: '.env',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/var/log/pm2/ssgobind-error.log',
      out_file: '/var/log/pm2/ssgobind-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
