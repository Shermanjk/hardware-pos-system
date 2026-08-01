import mysql from "mysql2/promise";

const DB_HOST     = process.env.DB_HOST;
const DB_PORT     = process.env.DB_PORT;
const DB_USER     = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME     = process.env.DB_NAME;

if (!DB_HOST || !DB_USER || DB_PASSWORD === undefined || !DB_NAME) {
  throw new Error(
    "Missing required database environment variables: DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME must all be set in .env"
  );
}

export const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT ? Number(DB_PORT) : 3306,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // ─── Long-session resilience ─────────────────────────────────────────────
  // enableKeepAlive prevents idle pool connections from being silently dropped
  // by MySQL's wait_timeout (default 8h) or intermediate network equipment.
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000, // 10 s — send first keepalive after 10s idle
  // connectTimeout: how long to wait for a new connection to be established.
  connectTimeout: 10000,       // 10 s
});
