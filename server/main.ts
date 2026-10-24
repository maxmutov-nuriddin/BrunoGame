import { startServer } from './index.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const server = await startServer(config);
const origins = config.allowedOrigins.length ? config.allowedOrigins.join(', ') : 'any (set ALLOWED_ORIGINS in production)';
console.log(`[server] listening on ${config.host}:${server.port} | ws: /ws | health: /health | origins: ${origins}`);

const shutdown = (signal: string) => {
  console.log(`[server] ${signal}, closing rooms`);
  server.close().then(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
