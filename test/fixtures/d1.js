import { DatabaseSync } from 'node:sqlite';

// Exercise the production SQL against SQLite, including atomic batches.
export function memoryD1() {
  const sqlite = new DatabaseSync(':memory:');
  return {
    sqlite,
    exec(sql) { sqlite.exec(sql); },
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let parameters = [];
      const result = {
        bind(...values) { parameters = values; return result; },
        first() { return statement.get(...parameters) || null; },
        all() { return { results: statement.all(...parameters) }; },
        run() {
          if (statement.columns().length) return { success: true, results: statement.all(...parameters), meta: { changes: 0 } };
          const r = statement.run(...parameters);
          return { success: true, results: [], meta: { changes: Number(r.changes) } };
        },
      };
      return result;
    },
    batch(statements) {
      sqlite.exec('BEGIN');
      try { const results = statements.map(s => s.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    close() { sqlite.close(); },
  };
}
