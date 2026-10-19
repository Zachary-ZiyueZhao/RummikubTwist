// PM2 进程配置：在服务器上 `pm2 start ecosystem.config.cjs`
// 需要 Node >= 20.6（tsx 作为 loader）。若用其它版本，改成 pm2 start "npm run start"
module.exports = {
  apps: [
    {
      name: 'rummikub-server',
      script: 'server/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        WS_PORT: '8787',
      },
    },
  ],
}
