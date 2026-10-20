import { buildServer } from './server.js';
import { PostgresDealStore } from './postgres-store.js';
import { DealStore } from './store.js';
import { PostgresRateLimiter } from './rate-limit.js';
import { externalAuthFromEnvironment } from './external-auth.js';
import { HttpEmbeddingProvider, SupermemoryAdapter } from '@deal/memory';

const agentToken = process.env.DEAL_API_KEY ?? 'local-agent-key';
const humanToken = process.env.DEAL_HUMAN_API_KEY ?? 'local-human-key';
const embeddingProvider = process.env.DEAL_EMBEDDING_URL
  ? new HttpEmbeddingProvider({
      url: process.env.DEAL_EMBEDDING_URL,
      apiKey: process.env.DEAL_EMBEDDING_API_KEY,
      model: process.env.DEAL_EMBEDDING_MODEL,
    })
  : undefined;
const semanticAdapter = process.env.SUPERMEMORY_API_KEY
  ? new SupermemoryAdapter({
      apiKey: process.env.SUPERMEMORY_API_KEY,
      baseUrl: process.env.SUPERMEMORY_BASE_URL,
      apiVersion: process.env.SUPERMEMORY_API_VERSION === 'v3' ? 'v3' : 'v4',
      searchMode: 'hybrid',
      timeoutMs: Number(process.env.SUPERMEMORY_TIMEOUT_MS ?? 10_000),
    })
  : undefined;
const store = process.env.DATABASE_URL
  ? new PostgresDealStore(process.env.DATABASE_URL, {
      embeddingProvider,
      semanticAdapter,
    })
  : new DealStore();
await store.seedDemo(agentToken, humanToken);
const app = buildServer({
  store,
  externalAuth: externalAuthFromEnvironment(),
  rateLimiter:
    store instanceof PostgresDealStore
      ? new PostgresRateLimiter(store.pool)
      : undefined,
});
const port = Number(process.env.DEAL_PORT ?? 3000);

await app.listen({ host: '0.0.0.0', port });
app.log.info(
  {
    port,
    agentTokenConfigured: Boolean(agentToken),
    humanTokenConfigured: Boolean(humanToken),
  },
  'DEAL API listening',
);

const shutdown = async () => {
  await app.close();
  await store.close();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
