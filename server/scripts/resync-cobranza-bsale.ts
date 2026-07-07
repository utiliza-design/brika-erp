import { db } from "../db";
import { uploadedFiles, clientes, cobranzaRows } from "@shared/schema";
import { DatabaseStorage } from "../storage";
import { syncCobranza, syncFactCompras, isConfigured } from "../bsale";
import { eq, like, and } from "drizzle-orm";

const storage = new DatabaseStorage();

type Row = Record<string, unknown> & { __deleted?: boolean };

const FILENAME_RE = /^BSale Cobranza\s+(\d{4}-\d{2}-\d{2})\s*[–-]\s*(\d{4}-\d{2}-\d{2})$/;

function parseFilename(name: string): { desde: string; hasta: string } | null {
  const m = name.trim().match(FILENAME_RE);
  if (!m) return null;
  return { desde: m[1], hasta: m[2] };
}

function rowKey(r: Record<string, unknown>): string {
  const t = String(r["Tipo Documento"] ?? "").trim().toUpperCase();
  const n = String(r["Nº Documento"] ?? "").trim();
  return `${t}|${n}`;
}

async function resyncOne(file: { id: string; originalFilename: string; data: unknown }) {
  const parsed = parseFilename(file.originalFilename);
  if (!parsed) {
    console.log(`  SKIP ${file.originalFilename} (filename does not match)`);
    return { changed: 0, total: 0 };
  }
  const { desde, hasta } = parsed;
  console.log(`  Resyncing ${file.originalFilename}  (${desde} → ${hasta})`);

  const result = await syncCobranza(desde, hasta);
  const newRows = result.rows;
  console.log(`    BSale returned ${newRows.length} rows`);

  const oldRows = (file.data as Row[] | null) || [];
  const newByKey = new Map<string, Record<string, unknown>>();
  for (const r of newRows) newByKey.set(rowKey(r), r);

  let updatedCount = 0;
  let deletedCount = 0;

  const merged: Row[] = oldRows.map(old => {
    if (old.__deleted) return old;
    const k = rowKey(old);
    const fresh = newByKey.get(k);
    if (!fresh) {
      // doc no longer present in BSale for this range — soft delete
      deletedCount++;
      return { __deleted: true };
    }
    newByKey.delete(k);
    // overwrite all fields with fresh data, preserving rowIdx
    const oldClient = String(old["Cliente"] ?? "");
    const newClient = String(fresh["Cliente"] ?? "");
    if (oldClient !== newClient) updatedCount++;
    return { ...fresh };
  });

  // Append leftover new rows that didn't match any old row
  let appended = 0;
  for (const fresh of newByKey.values()) {
    merged.push({ ...fresh });
    appended++;
  }

  const liveCount = merged.filter(r => !r.__deleted).length;
  await storage.updateUploadedFileData(file.id, merged, liveCount);

  console.log(`    updated_clientes=${updatedCount} appended=${appended} soft_deleted=${deletedCount} live=${liveCount}`);
  return { changed: updatedCount, total: liveCount };
}

async function updateMasterClientes() {
  console.log("\nUpdating master clientes from re-synced data...");
  const cobFiles = await db.select().from(uploadedFiles).where(eq(uploadedFiles.fileType, "cobranza"));

  // Pass A: aggregate per RUT from BSale Cobranza JSONB:
  //   bsaleNombre = "Cliente" field (already = company || firstName+lastName via clienteDisplayName)
  //   bsaleRazon  = "Razón Social" field (= company.trim() or "")
  type BsaleAggr = { nombre: string; razonSocial: string | null; lastDate: string };
  const bsaleByRut = new Map<string, BsaleAggr>();

  for (const f of cobFiles) {
    if (!f.originalFilename.startsWith("BSale Cobranza")) continue;
    const rows = (f.data as Row[] | null) || [];
    for (const r of rows) {
      if (r.__deleted) continue;
      const rut = String(r["Rut Cliente"] ?? "").trim();
      const nombre = String(r["Cliente"] ?? "").trim();
      if (!rut || !nombre) continue;
      const razon = String(r["Razón Social"] ?? "").trim() || null;
      const fecha = String(r["Fecha Emisión"] ?? "");
      const rutKey = rut.toLowerCase();
      const cur = bsaleByRut.get(rutKey);
      if (!cur || fecha > cur.lastDate) {
        bsaleByRut.set(rutKey, { nombre, razonSocial: razon, lastDate: fecha });
      }
    }
  }
  console.log(`  ${bsaleByRut.size} RUTs aggregated from BSale Cobranza`);

  // Pass B: collect Excel manual upload names (user-curated) per RUT.
  const excelByRut = new Map<string, string>();
  const manualFiles = cobFiles.filter(f => !f.originalFilename.startsWith("BSale Cobranza"));
  for (const f of manualFiles) {
    const rows = (f.data as Row[] | null) || [];
    for (const r of rows) {
      if (r.__deleted) continue;
      const rut = String(r["Rut Cliente"] ?? "").trim();
      const nombre = String(r["Cliente"] ?? "").trim();
      if (!rut || !nombre) continue;
      const k = rut.toLowerCase();
      const existing = excelByRut.get(k);
      if (!existing || nombre.length > existing.length) excelByRut.set(k, nombre);
    }
  }
  console.log(`  ${excelByRut.size} RUTs with Excel manual names`);

  // Apply updates to master clientes (preserve emails, telefono, notas).
  // Rule:
  //   - If BSale entry exists with razón social populated → set both nombre and razonSocial to BSale company (authoritative).
  //   - If BSale entry exists without razón social (persona natural) → if Excel has a longer/curated name, use Excel; else use BSale firstName+lastName.
  //   - If no BSale entry → leave alone.
  const allClientes = await db.select().from(clientes);
  let updatedFromBsaleCompany = 0;
  let updatedFromBsaleContact = 0;
  let restoredFromExcel = 0;

  for (const c of allClientes) {
    if (!c.rut) continue;
    const rutKey = c.rut.toLowerCase().trim();
    const bsale = bsaleByRut.get(rutKey);
    if (!bsale) continue;

    let newNombre = bsale.nombre;
    let newRazon = bsale.razonSocial;

    if (!newRazon) {
      // No BSale company → maybe Excel has a more curated name.
      const excelNombre = excelByRut.get(rutKey);
      if (excelNombre && excelNombre.length > newNombre.length) {
        newNombre = excelNombre;
      }
    }

    if (c.nombre === newNombre && c.razonSocial === newRazon) continue;

    await db.update(clientes)
      .set({ nombre: newNombre, razonSocial: newRazon })
      .where(eq(clientes.id, c.id));

    if (bsale.razonSocial) {
      updatedFromBsaleCompany++;
      console.log(`    [BSale company ${c.rut}] "${c.nombre}" → "${newNombre}"`);
    } else if (newNombre !== bsale.nombre) {
      restoredFromExcel++;
      console.log(`    [Excel ${c.rut}] "${c.nombre}" → "${newNombre}"`);
    } else {
      updatedFromBsaleContact++;
      console.log(`    [BSale contact ${c.rut}] "${c.nombre}" → "${newNombre}"`);
    }
  }
  console.log(`  Updated ${updatedFromBsaleCompany} from BSale company + ${updatedFromBsaleContact} from BSale contact + ${restoredFromExcel} from Excel`);
}

async function syncCobranzaRowsTable() {
  console.log("\nRebuilding dedicated cobranza_rows table from re-synced JSONB...");
  const cobFiles = await db.select().from(uploadedFiles).where(eq(uploadedFiles.fileType, "cobranza"));
  let totalInserted = 0;
  for (const f of cobFiles) {
    if (!f.originalFilename.startsWith("BSale Cobranza")) continue;
    // Always delete existing rows for this file first to keep cobranza_rows in
    // strict parity with JSONB (handles files that resolve to 0 live rows).
    await db.delete(cobranzaRows).where(eq(cobranzaRows.uploadedFileId, f.id));
    const rows = (f.data as Row[] | null) || [];
    const liveRows = rows.filter(r => !r.__deleted);
    if (liveRows.length === 0) continue;
    const toInsert = liveRows.map(r => ({
      uploadedFileId: f.id,
      tipoDocumento: String(r["Tipo Documento"] ?? "") || null,
      nDocumento: String(r["Nº Documento"] ?? "") || null,
      rutCliente: String(r["Rut Cliente"] ?? "") || null,
      fechaEmision: String(r["Fecha Emisión"] ?? "") || null,
      montoExento: r["Monto Exento Documento"] != null ? String(r["Monto Exento Documento"]) : null,
      montoNeto: r["Monto Neto Documento"] != null ? String(r["Monto Neto Documento"]) : null,
      montoIva: r["Monto IVA Documento"] != null ? String(r["Monto IVA Documento"]) : null,
      imptoEspecifico: null,
      montoTotal: r["Monto Documento"] != null ? String(r["Monto Documento"]) : null,
      fechaAcuse: null,
      notificacionComercial: null,
      fechaNotificacionComercial: null,
      xmlRecepcionado: null,
      estado: null,
    }));
    if (toInsert.length > 0) {
      await db.insert(cobranzaRows).values(toInsert).onConflictDoNothing();
      totalInserted += toInsert.length;
    }
  }
  console.log(`  Re-inserted ${totalInserted} rows into cobranza_rows`);
}

const COMPRAS_FILENAME_RE = /^BSale Fact\. Compras\s+(\d{4}-\d{2}-\d{2})\s*[–-]\s*(\d{4}-\d{2}-\d{2})$/;

function comprasRowKey(r: Record<string, unknown>): string {
  const t = String(r["Tipo Documento"] ?? "").trim().toUpperCase();
  const f = String(r["Folio"] ?? "").trim();
  const rut = String(r["RUT"] ?? "").trim();
  return `${t}|${f}|${rut}`;
}

async function resyncOneCompras(file: { id: string; originalFilename: string; data: unknown }) {
  // Compras uses third_party_documents (provider name = doc.clientActivity directly,
  // no getClient call) — therefore the firstName/lastName cliente bug from this task
  // does not exist in compras. We still re-sync to refresh any other drift in BSale
  // data (montos, estado, etc.) for completeness.
  const m = file.originalFilename.trim().match(COMPRAS_FILENAME_RE);
  if (!m) {
    console.log(`  SKIP ${file.originalFilename} (filename does not match)`);
    return { changed: 0, total: 0 };
  }
  const desde = m[1];
  const hasta = m[2];
  console.log(`  Resyncing ${file.originalFilename}  (${desde} → ${hasta})`);

  const result = await syncFactCompras(desde, hasta);
  const newRows = result.rows;
  console.log(`    BSale returned ${newRows.length} rows`);

  const oldRows = (file.data as Row[] | null) || [];
  const newByKey = new Map<string, Record<string, unknown>>();
  for (const r of newRows) newByKey.set(comprasRowKey(r), r);

  let updatedCount = 0;
  let deletedCount = 0;

  const merged: Row[] = oldRows.map(old => {
    if (old.__deleted) return old;
    const k = comprasRowKey(old);
    const fresh = newByKey.get(k);
    if (!fresh) {
      deletedCount++;
      return { __deleted: true };
    }
    newByKey.delete(k);
    const oldRazon = String(old["Razón Social"] ?? "");
    const newRazon = String(fresh["Razón Social"] ?? "");
    if (oldRazon !== newRazon) updatedCount++;
    return { ...fresh };
  });

  let appended = 0;
  for (const fresh of newByKey.values()) {
    merged.push({ ...fresh });
    appended++;
  }

  const liveCount = merged.filter(r => !r.__deleted).length;
  await storage.updateUploadedFileData(file.id, merged, liveCount);
  console.log(`    updated_razon=${updatedCount} appended=${appended} soft_deleted=${deletedCount} live=${liveCount}`);
  return { changed: updatedCount, total: liveCount };
}

async function resyncComprasAll() {
  const compras = await db.select().from(uploadedFiles).where(
    and(eq(uploadedFiles.fileType, "fact_compras"), like(uploadedFiles.originalFilename, "BSale Fact. Compras%"))
  );
  console.log(`\nFound ${compras.length} BSale-synced fact_compras files (compras uses third_party_documents — no firstName/lastName bug, but re-syncing for parity).`);
  if (compras.length === 0) return;
  compras.sort((a, b) => a.originalFilename.localeCompare(b.originalFilename));
  let totalChanged = 0;
  for (const f of compras) {
    try {
      const r = await resyncOneCompras(f);
      totalChanged += r.changed;
    } catch (e: any) {
      console.error(`  ERROR on ${f.originalFilename}: ${e.message}`);
    }
  }
  console.log(`  Total razón-social changes across compras files: ${totalChanged}`);
}

async function main() {
  if (!isConfigured()) {
    console.error("BSale not configured. Aborting.");
    process.exit(1);
  }

  const allFiles = await db.select().from(uploadedFiles).where(
    and(eq(uploadedFiles.fileType, "cobranza"), like(uploadedFiles.originalFilename, "BSale Cobranza%"))
  );
  const limitArg = process.argv.find(a => a.startsWith("--limit="));
  const fileArg = process.argv.find(a => a.startsWith("--file="));
  const startArg = process.argv.find(a => a.startsWith("--start="));
  const skipMaster = process.argv.includes("--skip-master");
  // Sort deterministically for consistent batching.
  allFiles.sort((a, b) => a.originalFilename.localeCompare(b.originalFilename));
  let files = allFiles;
  if (fileArg) {
    const want = fileArg.slice("--file=".length);
    files = allFiles.filter(f => f.originalFilename.includes(want));
  } else {
    const start = startArg ? parseInt(startArg.slice("--start=".length), 10) || 0 : 0;
    const n = limitArg ? parseInt(limitArg.slice("--limit=".length), 10) || allFiles.length : allFiles.length;
    files = allFiles.slice(start, start + n);
  }
  console.log(`Found ${allFiles.length} BSale cobranza files; processing ${files.length}.\n`);

  let totalChanged = 0;
  for (const f of files) {
    try {
      const r = await resyncOne(f);
      totalChanged += r.changed;
    } catch (e: any) {
      console.error(`  ERROR on ${f.originalFilename}: ${e.message}`);
    }
  }
  console.log(`\nTotal client-name changes across all files: ${totalChanged}`);

  if (skipMaster) {
    console.log("Skipping master clientes update + cobranza_rows + compras check (--skip-master)");
  } else {
    await syncCobranzaRowsTable();
    await updateMasterClientes();
    await resyncComprasAll();
  }

  console.log("\n✅ Done.");
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
