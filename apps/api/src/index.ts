import { buildServer } from './server.js';
import { PostgresDealStore } from './postgres-store.js';
import { DealStore } from './store.js';
import { PostgresRateLimiter } from './rate-limit.js';
import { externalAuthFromEnvironment } from './external-auth.js';
import { HttpEmbeddingProvider, SupermemoryAdapter } from '@deal/memory';
import { SkillSigner } from './skill-signing.js';
import { createDealAuth } from './auth.js';

const isProduction = process.env.NODE_ENV === 'production';
const agentToken = process.env.DEAL_API_KEY ?? 'local-agent-key';
const humanToken = process.env.DEAL_HUMAN_API_KEY ?? 'local-human-key';

if (
  isProduction &&
  (!process.env.DEAL_API_KEY || !process.env.DEAL_HUMAN_API_KEY)
)
  throw new Error(
    'DEAL_API_KEY and DEAL_HUMAN_API_KEY must be configured in production',
  );

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
const skillSigner = new SkillSigner({
  privateKeyPem: process.env.DEAL_SKILL_SIGNING_PRIVATE_KEY,
  publicKeyPem: process.env.DEAL_SKILL_SIGNING_PUBLIC_KEY,
  keyId: process.env.DEAL_SKILL_SIGNING_KEY_ID,
});
const store = process.env.DATABASE_URL
  ? new PostgresDealStore(process.env.DATABASE_URL, {
      embeddingProvider,
      semanticAdapter,
    })
  : new DealStore();
await store.ready;
const auth =
  store instanceof PostgresDealStore ? createDealAuth(store.pool) : undefined;
const seedDemo =
  process.env.DEAL_SEED_DEMO === 'true' ||
  (!isProduction && process.env.DEAL_SEED_DEMO !== 'false');
if (seedDemo) await store.seedDemo(agentToken, humanToken);
const app = buildServer({
  store,
  externalAuth: externalAuthFromEnvironment(),
  auth,
  rateLimiter:
    store instanceof PostgresDealStore
      ? new PostgresRateLimiter(store.pool)
      : undefined,
  skillSigner,
});
const port = Number(process.env.PORT ?? process.env.DEAL_PORT ?? 3000);

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
