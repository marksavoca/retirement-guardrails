import mysql from 'mysql2/promise'

export function getPool() {
  const base = {
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'guardrails',
    connectionLimit: 5,
    dateStrings: true as const,
  }
  if (process.env.DB_SOCKET) {
    return mysql.createPool({ ...base, socketPath: process.env.DB_SOCKET as string })
  }
  return mysql.createPool({
    ...base,
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
  })
}
