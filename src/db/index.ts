/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const isDatabaseConfigured = (): boolean => {
  return Boolean(
    process.env.SQL_HOST &&
      process.env.SQL_USER &&
      process.env.SQL_PASSWORD &&
      process.env.SQL_DB_NAME
  );
};

export const createPool = () => {
  if (!global._postgresPool) {
    const sqlHost = process.env.SQL_HOST;
    const useSsl =
      Boolean(sqlHost) &&
      !sqlHost!.startsWith('/') &&
      sqlHost !== 'localhost' &&
      sqlHost !== '127.0.0.1';

    global._postgresPool = new Pool({
      host: sqlHost,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      // Небольшой пул для экономии RAM (512 MB на Render Free)
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();
export const db = drizzle(pool, { schema });
