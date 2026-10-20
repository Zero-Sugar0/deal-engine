import { Pool } from 'pg';
import { createDealAuth } from './src/auth.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error('DATABASE_URL is required to migrate Better Auth');

const pool = new Pool({
  connectionString,
  ...(process.env.DEAL_DATABASE_SSL === 'true'
    ? {
        ssl: {
          rejectUnauthorized: process.env.DEAL_DATABASE_SSL_VERIFY !== 'false',
        },
      }
    : {}),
});

export const auth = createDealAuth(pool);
export default auth;
