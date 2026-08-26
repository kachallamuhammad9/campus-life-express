/**
 * Database Connection Module
 * Manages PostgreSQL connection pool via Supabase
 */

const { Pool } = require('pg');
const config = require('./env');

// Create connection pool
let pool = null;

const buildSslConfig = (isProduction, certificateAuthority = null) => {
  if (!isProduction) return undefined;

  return {
    rejectUnauthorized: true,
    ...(certificateAuthority ? { ca: certificateAuthority.replace(/\\n/g, '\n') } : {}),
  };
};

const getPool = () => {
  if (!pool) {
    if (!config.databaseUrl) {
      console.warn(
        'WARNING: DATABASE_URL not configured. Database features will not work.\n' +
        'Set DATABASE_URL in .env file to enable database connectivity.\n' +
        'Format: postgresql://user:password@host:port/database'
      );
      return null;
    }

    const ssl = buildSslConfig(config.isProduction(), config.databaseSslCa);

    pool = new Pool({
      connectionString: config.databaseUrl,
      ...(ssl ? { ssl } : {}),
      max: 20, // maximum number of connections in the pool
      idleTimeoutMillis: 30000, // close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // return an error after 2 seconds if connection cannot be established
    });

    // Listen for pool errors
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });

    pool.on('connect', () => {
      if (config.isDevelopment()) {
        console.log('[DB] New connection established');
      }
    });
  }

  return pool;
};

/**
 * Test database connection
 * @returns {Promise<boolean>} true if connection successful
 */
const testConnection = async () => {
  const dbPool = getPool();

  if (!dbPool) {
    return false;
  }

  try {
    const result = await dbPool.query('SELECT NOW()');
    if (config.isDevelopment()) {
      console.log('[DB] Connection test successful:', result.rows[0]);
    }
    return true;
  } catch (error) {
    console.error('[DB] Connection test failed:', error.message);
    return false;
  }
};

/**
 * Close database connection pool
 */
const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[DB] Connection pool closed');
  }
};

/**
 * Execute a query on the pool
 * @param {string} text SQL query text
 * @param {array} params Query parameters
 * @returns {Promise<QueryResult>}
 */
const query = async (text, params) => {
  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Database connection not available');
  }
  return dbPool.query(text, params);
};

/**
 * Execute operations within a database transaction
 * @param {Function} callback Function receiving client (query, etc.)
 * @returns {Promise<any>}
 */
const withTransaction = async (callback) => {
  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Database connection not available');
  }
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[DB] Rollback failed:', rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  getPool,
  testConnection,
  closePool,
  query,
  withTransaction,
  buildSslConfig,
};
