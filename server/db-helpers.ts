import { MySqlTable, InferSelectModel, InferInsertModel } from "drizzle-orm/mysql-core";
import { eq } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import crypto from "crypto";

export function hasValidEmail(emails: string[] | null | undefined): boolean {
  return !!emails && emails.some(e => e && e.trim() !== "");
}

export async function insertAndFetch<
  TTable extends MySqlTable,
  TInsert extends InferInsertModel<TTable>
>(
  db: MySql2Database<any>,
  table: TTable,
  value: TInsert,
  idColumnName: keyof TInsert = 'id' as keyof TInsert
): Promise<InferSelectModel<TTable>> {
  const record = { ...value };
  const column = (table as any)[idColumnName];
  const isStringPk = column && column.dataType === 'string';
  const hasIdValue = record[idColumnName] !== undefined && record[idColumnName] !== null && record[idColumnName] !== '';

  if (isStringPk && !hasIdValue) {
    (record as any)[idColumnName] = crypto.randomUUID();
  }

  const [result] = await db.insert(table).values(record as any);
  const targetId = (record as any)[idColumnName] || result.insertId;

  const [fetched] = await db.select().from(table).where(eq((table as any)[idColumnName], targetId));
  if (!fetched) {
    throw new Error(`Failed to fetch newly created record from ${table._.name}`);
  }
  return fetched;
}

export async function insertBatch<TTable extends MySqlTable>(
  db: MySql2Database<any>,
  table: TTable,
  values: any[]
): Promise<number> {
  if (values.length === 0) return 0;
  const [info] = await db.insert(table).ignore().values(values);
  return info.affectedRows;
}
