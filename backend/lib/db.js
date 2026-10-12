import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import mysql from "mysql2/promise";

export async function openDatabase(config) {
  if (config.driver === "mysql") {
    const pool = mysql.createPool(config.mysql);
    const adapter = (connection) => ({
      all: async (sql, params = []) =>
        (await connection.execute(sql, params))[0],
      one: async (sql, params = []) =>
        (await connection.execute(sql, params))[0][0],
      run: async (sql, params = []) => {
        const [result] = await connection.execute(sql, params);
        return { changes: result.affectedRows };
      },
      lock: " FOR UPDATE",
    });
    return {
      ...adapter(pool),
      driver: "mysql",
      close: () => pool.end(),
      tx: async (fn) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const conn = await pool.getConnection();
          try {
            await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
            await conn.beginTransaction();
            const result = await fn(adapter(conn));
            await conn.commit();
            return result;
          } catch (error) {
            await conn.rollback();
            if (
              !["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(
                error.code,
              ) ||
              attempt === 2
            )
              throw error;
          } finally {
            conn.release();
          }
        }
      },
    };
  }
  if (config.driver !== "sqlite") throw new Error("Unknown DATABASE_DRIVER");
  if (config.sqlitePath !== ":memory:")
    mkdirSync(dirname(config.sqlitePath), { recursive: true });
  const sqlite = new DatabaseSync(config.sqlitePath);
  sqlite.exec(
    "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
  );
  let queue = Promise.resolve();
  const serial = (fn) => {
    const task = queue.then(fn);
    queue = task.catch(() => {});
    return task;
  };
  const adapter = {
    all: async (sql, params = []) => sqlite.prepare(sql).all(...params),
    one: async (sql, params = []) => sqlite.prepare(sql).get(...params),
    run: async (sql, params = []) => sqlite.prepare(sql).run(...params),
    lock: "",
  };
  return {
    driver: "sqlite",
    lock: "",
    all: (...args) => serial(() => adapter.all(...args)),
    one: (...args) => serial(() => adapter.one(...args)),
    run: (...args) => serial(() => adapter.run(...args)),
    close: async () => {
      await queue;
      sqlite.close();
    },
    tx: (fn) =>
      serial(async () => {
        sqlite.exec("BEGIN IMMEDIATE");
        try {
          const result = await fn(adapter);
          sqlite.exec("COMMIT");
          return result;
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      }),
  };
}
export async function migrate(db) {
  await db.run(
    "CREATE TABLE IF NOT EXISTS moli_migrations (name VARCHAR(120) PRIMARY KEY, checksum VARCHAR(64) NOT NULL, applied_at VARCHAR(30) NOT NULL)",
  );
  const directory = new URL("../migrations/", import.meta.url);
  for (const name of readdirSync(directory)
    .filter((x) => /^\d+.*\.sql$/.test(x))
    .sort()) {
    const schema = readFileSync(new URL(name, directory), "utf8"),
      checksum = createHash("sha256").update(schema).digest("hex");
    const applied = await db.one(
      "SELECT checksum FROM moli_migrations WHERE name=?",
      [name],
    );
    if (applied) {
      if (applied.checksum !== checksum)
        throw new Error("Migration checksum changed: " + name);
      continue;
    }
    for (const sql of schema
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean)) {
      const index = sql.match(/^CREATE INDEX (\w+) ON (\w+)\(/i);
      if (index) {
        const exists =
          db.driver === "mysql"
            ? await db.one(
                "SELECT 1 AS found FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=? LIMIT 1",
                [index[2], index[1]],
              )
            : await db.one(
                "SELECT 1 AS found FROM sqlite_master WHERE type='index' AND name=?",
                [index[1]],
              );
        if (exists) continue;
      }
      await db.run(sql);
    }
    await db.run(
      "INSERT INTO moli_migrations (name,checksum,applied_at) VALUES (?,?,?)",
      [name, checksum, new Date().toISOString()],
    );
  }
}
