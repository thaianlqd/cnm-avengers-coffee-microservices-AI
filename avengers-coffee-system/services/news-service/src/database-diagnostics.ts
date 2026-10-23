import { performance } from 'node:perf_hooks';
import { diagnosticEnabled, record } from './capacity-diagnostics';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';

/** Only activated in diagnostics; preserves original queries/results/errors.
 * query runner acquire includes physical connection if pool has no idle client.
 * pg query promise time includes wire, server execution and row decoding.
 */
export function installDatabaseDiagnostics() {
  if (!diagnosticEnabled) return;
  const proto = PostgresQueryRunner.prototype as any;
  const connect = proto.connect;
  proto.connect = async function (...args: any[]) {
    const start = performance.now();
    try { return await connect.apply(this, args); }
    finally { record('db_acquire', performance.now() - start); }
  };
  // pg callbacks and query streams are intentionally untouched. TypeORM uses promises.
  const client = require('pg').Client.prototype;
  const query = client.query;
  client.query = function (...args: any[]) {
    const start = performance.now();
    const result = query.apply(this, args);
    if (result && typeof result.then === 'function') {
      return result.then((value: any) => { record('db_query', performance.now() - start); return value; },
        (error: any) => { record('db_query', performance.now() - start); record('db_error', 1); throw error; });
    }
    return result;
  };
  const physicalConnect = client.connect;
  client.connect = function (...args: any[]) {
    const start = performance.now();
    if (typeof args[0] === 'function') {
      const callback = args[0];
      args[0] = function (...values: any[]) { record('db_connect', performance.now() - start); return callback.apply(this, values); };
      return physicalConnect.apply(this, args);
    }
    return physicalConnect.apply(this, args).finally(() => record('db_connect', performance.now() - start));
  };
}
