import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Dual-database write mirroring
// ---------------------------------------------------------------------------
// This project runs against two independent Postgres databases depending on
// environment (Replit's built-in dev Postgres in the workspace preview, Neon
// in the production deployment). Historically only ONE of them ever received
// a given write (whichever DATABASE_URL happened to be active), which is why
// a token created in one environment could be invisible to the other.
//
// Fix: every write (insert/update/delete) made through `db` is now
// automatically mirrored to a second database if one is configured, so both
// databases stay in sync no matter which environment the write came from.
// Reads always come from the environment's own primary database (fast, no
// cross-network round trip on every query).
//
// Configuration (Secrets):
//   DATABASE_URL            - this environment's primary DB (reads + writes)
//   DATABASE_URL_SECONDARY  - the OTHER environment's DB (writes only, mirrored)
//
// Example setup:
//   Dev workspace   -> DATABASE_URL = Replit Postgres,  DATABASE_URL_SECONDARY = Neon
//   Production      -> DATABASE_URL = Neon,             DATABASE_URL_SECONDARY = Replit Postgres
//
// If DATABASE_URL_SECONDARY is not set, behavior is identical to before
// (single database, no mirroring, zero overhead).
// ---------------------------------------------------------------------------

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function sslConfigFor(connectionString: string): false | { rejectUnauthorized: boolean } {
  // Neon (and most managed Postgres reached over the public internet)
  // require TLS. Local/Replit-internal Postgres over a private connection
  // typically does not advertise sslmode=require. We infer the right
  // setting from the connection string rather than hardcoding one provider.
  if (/sslmode=require/i.test(connectionString) || /neon\.tech/i.test(connectionString)) {
    return { rejectUnauthorized: true };
  }
  return false;
}

function makePool(connectionString: string): pg.Pool {
  return new Pool({
    connectionString,
    ssl: sslConfigFor(connectionString),
  });
}

export const pool = makePool(process.env.DATABASE_URL);
const primaryDb = drizzle(pool, { schema });

const secondaryUrl = process.env.DATABASE_URL_SECONDARY;
export const secondaryPool: pg.Pool | null =
  secondaryUrl && secondaryUrl !== process.env.DATABASE_URL
    ? makePool(secondaryUrl)
    : null;

if (secondaryUrl && secondaryPool === null) {
  console.log(
    "[db] DATABASE_URL_SECONDARY matches DATABASE_URL — mirroring disabled (nothing to mirror to).",
  );
} else if (secondaryPool) {
  console.log("[db] dual-write mirroring enabled — writes will be mirrored to DATABASE_URL_SECONDARY.");
} else {
  console.log("[db] DATABASE_URL_SECONDARY not set — running against a single database, no mirroring.");
}

// Fires the same SQL that's about to run against the primary DB against the
// secondary DB too. Best-effort and non-blocking-on-failure: a mirror
// failure is logged but never fails, delays, or rolls back the primary
// write, since the primary DB must remain the source of truth for the
// request that's actually in flight.
function mirrorWrite(queryLike: { toSQL?: () => { sql: string; params: unknown[] } }, label: string) {
  if (!secondaryPool || typeof queryLike.toSQL !== "function") return;
  try {
    const { sql, params } = queryLike.toSQL();
    secondaryPool.query(sql, params as unknown[]).catch((err: unknown) => {
      console.error(`[db] mirror (${label}) to secondary DB failed (non-fatal):`, err);
    });
  } catch (err) {
    console.error(`[db] could not build SQL to mirror (${label}) (non-fatal):`, err);
  }
}

// Wraps a drizzle query-builder chain (e.g. the object returned by
// db.insert(table)) so that the moment it's actually awaited/executed, the
// exact same SQL is also fired at the secondary database. Every method call
// in the chain (.values(), .set(), .where(), .returning(), ...) is
// transparently forwarded and re-wrapped so mirroring still triggers no
// matter how long the chain is.
function proxyWriteQuery<T extends object>(query: T, label: string): T {
  return new Proxy(query, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (prop === "then" && typeof value === "function") {
        return (onFulfilled?: unknown, onRejected?: unknown) => {
          mirrorWrite(target as { toSQL?: () => { sql: string; params: unknown[] } }, label);
          return (value as Function).call(target, onFulfilled, onRejected);
        };
      }

      if (typeof value === "function") {
        return (...args: unknown[]) => {
          const result = (value as Function).apply(target, args);
          if (result && typeof result === "object" && typeof (result as any).then === "function") {
            return proxyWriteQuery(result, label);
          }
          return result;
        };
      }

      return value;
    },
  });
}

// Wraps the `tx` object handed to a db.transaction(async (tx) => {...})
// callback the same way `db` itself is wrapped, so writes made inside a
// transaction are mirrored too. The mirror itself is fire-and-forget (not
// part of the primary transaction) — if the primary transaction rolls back,
// already-mirrored statements on the secondary are NOT rolled back. For
// this project's use (keeping two independently-reachable databases roughly
// in sync so either environment can serve reads) that tradeoff is fine; it
// is not meant to provide cross-database atomicity.
function wrapTx<T extends object>(tx: T): T {
  return new Proxy(tx, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if ((prop === "insert" || prop === "update" || prop === "delete") && typeof value === "function") {
        return (...args: unknown[]) => {
          const builder = (value as Function).apply(target, args);
          return proxyWriteQuery(builder, `tx.${String(prop)}`);
        };
      }
      return value;
    },
  });
}

// The `db` every route/module imports. Behaves exactly like a normal
// drizzle instance — `db.select(...)` is untouched — but `db.insert(...)`,
// `db.update(...)`, `db.delete(...)`, and writes inside `db.transaction(...)`
// now auto-mirror to the secondary database (when configured), with no
// changes needed at any call site.
export const db = new Proxy(primaryDb, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);

    if ((prop === "insert" || prop === "update" || prop === "delete") && typeof value === "function") {
      return (...args: unknown[]) => {
        const builder = (value as Function).apply(target, args);
        return proxyWriteQuery(builder, String(prop));
      };
    }

    if (prop === "transaction" && typeof value === "function") {
      return (callback: (tx: unknown) => Promise<unknown>, ...rest: unknown[]) => {
        return (value as Function).call(
          target,
          (tx: object) => callback(wrapTx(tx)),
          ...rest,
        );
      };
    }

    return value;
  },
}) as typeof primaryDb;

export * from "./schema";
