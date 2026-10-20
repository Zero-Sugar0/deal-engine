import { buildServer } from './server.js';
import { PostgresDealStore } from './postgres-store.js';
import { DealStore } from './store.js';

const agentToken = process.env.DEAL_API_KEY ?? 'local-agent-key';
const humanToken = process.env.DEAL_HUMAN_API_KEY ?? 'local-human-key';
const store = process.env.DATABASE_URL
  ? new PostgresDealStore(process.env.DATABASE_URL)
  : new DealStore();
await store.seedDemo(agentToken, humanToken);
const app = buildServer({ store });
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
