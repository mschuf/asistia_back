/* eslint-disable no-console */
require("dotenv").config();
const { Pool } = require("pg");

async function main() {
  const password = process.env.POSTGRES_PASSWORD ?? "";
  const sslEnabled = ["1", "true", "yes", "si", "on"].includes(
    String(process.env.POSTGRES_SSL ?? "").toLowerCase(),
  );
  const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER,
    password,
    database: process.env.POSTGRES_DATABASE,
    connectionTimeoutMillis: Number(process.env.POSTGRES_CONNECT_TIMEOUT_MS || 5000),
    ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
  });

  const query = async (sql, params) => {
    const result = await pool.query(sql, params);
    return result.rows;
  };

  console.log("OK_CONNECTED", {
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DATABASE,
    user: process.env.POSTGRES_USER,
    passwordLength: password.length,
  });

  console.log("VERSION", await query("SELECT version() AS db_version"));

  const companies = await query("SELECT * FROM companies LIMIT 10");
  console.log("COMPANIES_COUNT", companies.length);
  console.log("COMPANIES", companies);

  await pool.end();
}

main().catch((error) => {
  console.error("PREFLIGHT_FAILED", error.message);
  process.exit(1);
});
