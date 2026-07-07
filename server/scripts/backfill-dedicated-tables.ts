import { db } from "../db";
import { uploadedFiles } from "@shared/schema";
import { DatabaseStorage } from "../storage";

const storage = new DatabaseStorage();

interface UploadedRow extends Record<string, unknown> {
  __deleted?: boolean;
}

type FileType = "cartola" | "cobranza" | "fact_ventas" | "fact_compras" | "cartola_security" | "cartola_falabella" | "stock";

const bulkInsertMap: Record<FileType, (uploadedFileId: string, rows: Record<string, unknown>[]) => Promise<number>> = {
  cartola: (id, rows) => storage.bulkInsertCartolaRows(id, rows),
  cobranza: (id, rows) => storage.bulkInsertCobranzaRows(id, rows),
  fact_ventas: (id, rows) => storage.bulkInsertFactVentasRows(id, rows),
  fact_compras: (id, rows) => storage.bulkInsertFactComprasRows(id, rows),
  cartola_security: (id, rows) => storage.bulkInsertCartolaSecurityRows(id, rows),
  cartola_falabella: (id, rows) => storage.bulkInsertCartolaFalabellaRows(id, rows),
  stock: (id, rows) => storage.bulkInsertStockRows(id, rows),
};

async function backfill() {
  console.log("Starting backfill of dedicated tables...");

  const allFiles = await db.select().from(uploadedFiles);
  console.log(`Found ${allFiles.length} uploaded files to process.`);

  const counts: Record<string, number> = {};

  for (const file of allFiles) {
    const fileType = file.fileType as FileType;
    const bulkInsertFn = bulkInsertMap[fileType];
    if (!bulkInsertFn) {
      console.log(`  Skipping file ${file.id} with unknown type: ${fileType}`);
      continue;
    }

    const rawData = file.data as UploadedRow[] | null;
    if (!rawData || !Array.isArray(rawData)) {
      console.log(`  Skipping file ${file.id} (${fileType}): no data`);
      continue;
    }

    const rows = rawData.filter(r => !r.__deleted);
    if (rows.length === 0) {
      console.log(`  Skipping file ${file.id} (${fileType}): all rows deleted`);
      continue;
    }

    try {
      const inserted = await bulkInsertFn(file.id, rows);
      counts[fileType] = (counts[fileType] || 0) + inserted;
      console.log(`  File ${file.id} (${fileType}): ${inserted}/${rows.length} rows inserted`);
    } catch (err) {
      console.error(`  Error processing file ${file.id} (${fileType}):`, err);
    }
  }

  console.log("\nBackfill complete. Summary:");
  for (const [type, count] of Object.entries(counts)) {
    console.log(`  ${type}: ${count} rows inserted`);
  }

  process.exit(0);
}

backfill().catch(err => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
