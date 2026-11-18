// Where the webhook listener binds and the secret it checks: read from the environment when it is started.
export const webhookConfig = (env: NodeJS.ProcessEnv = process.env) => ({
  secret: env.WEBHOOK_SECRET,
  port: Number(env.WEBHOOK_PORT) || 4478,
  host: env.WEBHOOK_HOST || '127.0.0.1',
});
