import { MySqlTable } from "drizzle-orm/mysql-core";
import { eq, type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import crypto from "crypto";

export function hasValidEmail(emails: string[] | null | undefined): boolean {
  return !!emails && emails.some(e => e && e.trim() !== "");
}

/**
 * Función pura centralizada para derivar el estado de una factura en Facturas Revisión.
 * Usada tanto en el cálculo frío de GET /api/facturas-revision como en el patch de mutaciones.
 */
export function computeFacturaEstado(
  savedReview?: { estado: string } | null,
  propuestasCount: number = 0,
  matchCartola: unknown = null
): "pagado" | "pendiente" | "propuesto" {
  if (savedReview) {
    return savedReview.estado as "pagado" | "pendiente" | "propuesto";
  }
  if (propuestasCount > 0 || matchCartola) {
    return "propuesto";
  }
  return "pendiente";
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
