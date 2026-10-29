import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { neon, Pool } from "@neondatabase/serverless";
import log from "electron-log";
import { IS_TEST_BUILD } from "./test_utils";

const logger = log.scope("neon_branch_data");

// Neon Auth service metadata. A provisioned branch creates its own copies, and
// overwriting them with another branch's rows breaks every auth request.
const NEON_AUTH_SERVICE_TABLES = new Set(["project_config", "jwks"]);
const COPY_BATCH_SIZE = 500;

export interface ForeignKeyDefinition {
  schema: string;
  table: string;
  name: string;
  definition: string;
}

interface Queryable {
  query(text: string, params?: unknown[]): Promise<Record<string, any>[]>;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function qualifiedName(schema: string, name: string): string {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`;
}

function httpQueryable(connectionUri: string): Queryable {
  const sql = neon(connectionUri);
  return { query: (text, params = []) => sql.query(text, params) };
}

const USER_SCHEMA_FILTER = `n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
  and n.nspname not like 'pg\\_temp%'
  and n.nspname not like 'pg\\_toast\\_temp%'`;

async function listForeignKeysWith(
  db: Queryable,
): Promise<ForeignKeyDefinition[]> {
  const rows = await db.query(`
    select n.nspname as schema, c.relname as "table", con.conname as name,
      pg_get_constraintdef(con.oid) as definition
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'f' and ${USER_SCHEMA_FILTER}
    order by 1, 2, 3`);
  return rows as ForeignKeyDefinition[];
}

/** Lists every foreign key outside the Postgres system schemas. */
export async function listForeignKeys(
  connectionUri: string,
): Promise<ForeignKeyDefinition[]> {
  return listForeignKeysWith(httpQueryable(connectionUri));
}

/**
 * Prepares a schema-only branch for Neon Auth provisioning.
 *
 * Schema-only branches copy the parent's `neon_auth` schema and role but not
 * Neon Auth's provisioning or any role memberships. Verified against the live
 * Neon API (dyad-sh/dyad#4943), provisioning then fails until:
 * - the copied `neon_auth` schema is gone (409 "schema already exists"),
 * - the copied `neon_auth` role is gone (412 "must be able to SET ROLE"), and
 * - `neon_service` can create in the database, which it otherwise gets
 *   through `neon_superuser` (412 "permission denied for database").
 *
 * Dropping the schema cascades to foreign keys that reference it; callers that
 * copy data restore those from a list captured beforehand.
 */
export async function prepareSchemaOnlyBranchForNeonAuth(
  connectionUri: string,
): Promise<void> {
  // Test builds use a fake Neon client whose connection strings go nowhere.
  if (IS_TEST_BUILD) return;
  const db = httpQueryable(connectionUri);
  await db.query("drop schema if exists neon_auth cascade");
  await db.query(`
    do $$
    begin
      if exists (select 1 from pg_roles where rolname = 'neon_auth') then
        execute 'drop role neon_auth';
      end if;
      if exists (select 1 from pg_roles where rolname = 'neon_service') then
        execute format('grant create on database %I to neon_service', current_database());
      end if;
    end $$`);
}

interface CopyTable {
  schema: string;
  name: string;
}

async function listCopyTables(db: Queryable): Promise<CopyTable[]> {
  // Ordinary and partitioned parent tables; partitions are copied through their
  // parent. Extension-owned tables belong to the extension on each branch.
  const rows = await db.query(`
    select n.nspname as schema, c.relname as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and not c.relispartition
      and ${USER_SCHEMA_FILTER}
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
      )
    order by 1, 2`);
  return (rows as CopyTable[]).filter(
    (t) => !(t.schema === "neon_auth" && NEON_AUTH_SERVICE_TABLES.has(t.name)),
  );
}

async function listInsertableColumns(
  db: Queryable,
  table: CopyTable,
): Promise<{ name: string; identityAlways: boolean }[]> {
  const rows = await db.query(
    `select a.attname as name, a.attidentity = 'a' as "identityAlways"
     from pg_attribute a
     where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped
       and a.attgenerated = ''
     order by a.attnum`,
    [qualifiedName(table.schema, table.name)],
  );
  return rows as { name: string; identityAlways: boolean }[];
}

interface ExportedTable extends CopyTable {
  columns: string[];
  file: string;
  rows: number;
}

interface ExportManifest {
  tables: ExportedTable[];
  sequences: { schema: string; name: string; lastValue: string }[];
}

const MANIFEST_FILE = "manifest.json";

/**
 * Writes every user table's rows from `sourceUri` to `dir` (one JSON batch per
 * line), plus the sequence positions. Staging on disk lets the caller delete
 * the source branch before creating the target, which a project at its
 * branch limit needs.
 */
export async function exportBranchData({
  sourceUri,
  dir,
}: {
  sourceUri: string;
  dir: string;
}): Promise<{ tables: number; rows: number }> {
  const source = httpQueryable(sourceUri);
  await fs.mkdir(dir, { recursive: true });
  const manifest: ExportManifest = { tables: [], sequences: [] };
  let totalRows = 0;
  for (const [index, table] of (await listCopyTables(source)).entries()) {
    const columns = (await listInsertableColumns(source, table)).map(
      (c) => c.name,
    );
    const file = `table-${index}.jsonl`;
    const handle = await fs.open(path.join(dir, file), "w");
    let rows = 0;
    try {
      if (columns.length > 0) {
        const tableName = qualifiedName(table.schema, table.name);
        const columnList = columns.map(quoteIdentifier).join(", ");
        // Keyset pagination on ctid: nothing writes the source meanwhile.
        let lastCtid = "(0,0)";
        for (;;) {
          const [{ rows: batch, last }] = await source.query(
            `select coalesce(json_agg(to_json(x)), '[]'::json) as rows,
               max(x_ctid)::text as last
             from (
               select ${columnList}, ctid as x_ctid from ${tableName}
               where ctid > $1::tid order by ctid limit ${COPY_BATCH_SIZE}
             ) x`,
            [lastCtid],
          );
          const cleaned = (batch as Record<string, unknown>[]).map(
            ({ x_ctid: _ctid, ...row }) => row,
          );
          if (cleaned.length === 0) break;
          await handle.write(`${JSON.stringify(cleaned)}\n`);
          rows += cleaned.length;
          lastCtid = last;
          if (cleaned.length < COPY_BATCH_SIZE) break;
        }
      }
    } finally {
      await handle.close();
    }
    manifest.tables.push({ ...table, columns, file, rows });
    totalRows += rows;
  }
  manifest.sequences = (await source.query(`
    select schemaname as schema, sequencename as name, last_value::text as "lastValue"
    from pg_sequences
    where schemaname not in ('pg_catalog', 'information_schema')
      and last_value is not null`)) as ExportManifest["sequences"];
  await fs.writeFile(
    path.join(dir, MANIFEST_FILE),
    JSON.stringify(manifest),
    "utf8",
  );
  return { tables: manifest.tables.length, rows: totalRows };
}

/**
 * Loads data written by `exportBranchData` into `targetUri`, which must
 * already have the same schema (a schema-only branch).
 *
 * The target is written in one transaction: if anything fails, the target is
 * left as it was. The app role cannot set `session_replication_role`, so
 * foreign keys are dropped for the load and re-added afterwards (re-adding
 * validates them), and user triggers are disabled per table.
 *
 * `extraForeignKeys` are constraints captured from the target before
 * `prepareSchemaOnlyBranchForNeonAuth` dropped them along with the copied
 * `neon_auth` schema; they are restored once the data is in place.
 */
export async function importBranchData({
  targetUri,
  dir,
  extraForeignKeys = [],
}: {
  targetUri: string;
  dir: string;
  extraForeignKeys?: ForeignKeyDefinition[];
}): Promise<void> {
  const manifest = JSON.parse(
    await fs.readFile(path.join(dir, MANIFEST_FILE), "utf8"),
  ) as ExportManifest;

  const pool = new Pool({ connectionString: targetUri });
  const client = await pool.connect();
  const target: Queryable = {
    query: async (text, params) => (await client.query(text, params)).rows,
  };
  try {
    await target.query("begin");

    const targetTables = new Set(
      (await listCopyTables(target)).map((t) => `${t.schema}.${t.name}`),
    );
    const currentForeignKeys = await listForeignKeysWith(target);
    const foreignKeysToRestore = new Map<string, ForeignKeyDefinition>();
    for (const fk of [...currentForeignKeys, ...extraForeignKeys]) {
      if (!targetTables.has(`${fk.schema}.${fk.table}`)) continue;
      foreignKeysToRestore.set(`${fk.schema}.${fk.table}.${fk.name}`, fk);
    }
    for (const fk of currentForeignKeys) {
      await target.query(
        `alter table ${qualifiedName(fk.schema, fk.table)} drop constraint ${quoteIdentifier(fk.name)}`,
      );
    }

    for (const table of manifest.tables) {
      if (!targetTables.has(`${table.schema}.${table.name}`)) {
        logger.warn(
          `Skipping ${table.schema}.${table.name}: missing on the target branch`,
        );
        continue;
      }
      const tableName = qualifiedName(table.schema, table.name);
      const targetColumns = new Map(
        (await listInsertableColumns(target, table)).map((c) => [c.name, c]),
      );
      const columns = table.columns.filter((c) => targetColumns.has(c));
      if (columns.length === 0) continue;
      const columnList = columns.map(quoteIdentifier).join(", ");
      const overriding = columns.some(
        (c) => targetColumns.get(c)?.identityAlways,
      )
        ? "overriding system value"
        : "";

      await target.query(`alter table ${tableName} disable trigger user`);
      await target.query(`delete from ${tableName}`);
      const lines = readline.createInterface({
        input: createReadStream(path.join(dir, table.file), "utf8"),
        crlfDelay: Infinity,
      });
      for await (const line of lines) {
        if (!line) continue;
        await target.query(
          `insert into ${tableName} (${columnList}) ${overriding}
           select ${columnList} from json_populate_recordset(null::${tableName}, $1::json)`,
          [line],
        );
      }
      await target.query(`alter table ${tableName} enable trigger user`);
    }

    for (const seq of manifest.sequences) {
      const exists = await target.query(
        "select to_regclass($1) is not null as exists",
        [qualifiedName(seq.schema, seq.name)],
      );
      if (!exists[0]?.exists) continue;
      await target.query("select setval($1::regclass, $2::bigint, true)", [
        qualifiedName(seq.schema, seq.name),
        seq.lastValue,
      ]);
    }

    for (const fk of foreignKeysToRestore.values()) {
      await target.query(
        `alter table ${qualifiedName(fk.schema, fk.table)} add constraint ${quoteIdentifier(fk.name)} ${fk.definition}`,
      );
    }

    await target.query("commit");
  } catch (error) {
    await target.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
