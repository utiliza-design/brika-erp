import { uploadedFiles, type UploadedFile, type InsertUploadedFile, type FileType, centroCostosRules, type CentroCostosRule, type InsertCentroCostosRule, centroCostosReviews, facturaReviews, type FacturaReview, facturaPropuestas, type FacturaPropuesta, appUsers, type AppUser, type InsertAppUser, ventasAmigo, type VentaAmigo, type InsertVentaAmigo, cartolaRows, cartolaSecurityRows, cartolaFalabellaRows, cobranzaRows, factVentasRows, factComprasRows, stockRows, cartolaGlobal66ClpRows, cartolaGlobal66UsdRows, clientes, type Cliente, type InsertCliente, emailLogs, type EmailLog, type InsertEmailLog, discontinuedProducts, type DiscontinuedProduct, facturaAutoMatchRejections, type FacturaAutoMatchRejection } from "@shared/schema";
import { db } from "./db";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { hasValidEmail, insertAndFetch, insertBatch } from "./db-helpers";

export interface IStorage {
  createUploadedFile(file: InsertUploadedFile): Promise<UploadedFile>;
  getUploadedFiles(fileType?: FileType): Promise<UploadedFile[]>;
  deduplicateFactVentas(): Promise<{ cleaned: number; filesUpdated: number }>;
  deleteNonCartolaUploadedFiles(): Promise<number>;
  deleteAllUploadedFilesByType(fileType: FileType): Promise<number>;
  getUploadedFile(id: string): Promise<UploadedFile | undefined>;
  deleteUploadedFile(id: string): Promise<void>;
  updateUploadedFileData(id: string, data: unknown[], rowCount: number): Promise<void>;
  getCentroCostosRules(): Promise<CentroCostosRule[]>;
  createCentroCostosRule(rule: InsertCentroCostosRule): Promise<CentroCostosRule>;
  upsertCentroCostosRule(rule: InsertCentroCostosRule): Promise<CentroCostosRule>;
  updateCentroCostosRule(id: string, updates: Partial<InsertCentroCostosRule>): Promise<CentroCostosRule | undefined>;
  deleteCentroCostosRule(id: string): Promise<void>;
  getReviewedKeys(): Promise<Set<string>>;
  setReview(movementKey: string, revisado: boolean): Promise<void>;
  getSavedCentroCostosMap(): Promise<Map<string, string | null>>;
  saveCentroCostosForMovement(movementKey: string, centroCostos: string | null): Promise<void>;
  getNDocumentoOverrideMap(): Promise<Map<string, string[]>>;
  saveNDocumentoOverride(movementKey: string, nDocumentos: string[]): Promise<void>;
  getFechaCobroMap(): Promise<Map<string, string>>;
  saveFechaCobro(movementKey: string, fechaCobro: string | null): Promise<void>;
  getFacturaReviews(): Promise<FacturaReview[]>;
  upsertFacturaReview(facturaKey: string, estado: "pendiente" | "pagado" | "propuesto", cartolaMovementKey?: string | null): Promise<FacturaReview>;
  getFacturaPropuestas(facturaKey?: string): Promise<FacturaPropuesta[]>;
  addFacturaPropuesta(facturaKey: string, tipo: string, cartolaMovementKey?: string | null, notaManual?: string | null): Promise<FacturaPropuesta>;
  deleteFacturaPropuesta(id: string): Promise<void>;
  getAppUser(email: string): Promise<AppUser | undefined>;
  getAppUserById(id: string): Promise<AppUser | undefined>;
  getAllAppUsers(): Promise<AppUser[]>;
  createAppUser(data: InsertAppUser): Promise<AppUser>;
  updateAppUserStatus(id: string, status: string): Promise<AppUser | undefined>;
  updateAppUserRole(id: string, role: string): Promise<AppUser | undefined>;
  updateAppUserOnLogin(id: string, name: string): Promise<void>;
  deleteAppUser(id: string): Promise<void>;
  countAppUsers(): Promise<number>;
  getVentasAmigo(): Promise<VentaAmigo[]>;
  createVentaAmigo(data: InsertVentaAmigo): Promise<VentaAmigo>;
  updateVentaAmigoEstado(id: number, estado: string): Promise<VentaAmigo | undefined>;
  updateVentaAmigo(id: number, data: Partial<InsertVentaAmigo>): Promise<VentaAmigo | undefined>;
  deleteVentaAmigo(id: number): Promise<boolean>;
  bulkUpsertCentroCostosImport(items: { movementKey: string; centroCostos: string; revisado: number; fechaCobroOverride?: string | null; nDocumentoOverride?: string | null }[]): Promise<void>;
  bulkInsertCartolaRows(uploadedFileId: string, rows: Record<string, unknown>[]): Promise<number>;
  bulkInsertCartolaSecurityRows(uploadedFileId: string, rows: Record<string, unknown>[]): Promise<number>;
  bulkInsertCartolaFalabellaRows(uploadedFileId: string, rows: Record<string, unknown>[]): Promise<number>;
  bulkInsertCobranzaRows(uploadedFileId: string, rows: Record<string, unknown>[]): Promise<number>;
  bulkInsertFactVentasRows(uploadedFileId: string, rows: Record<string, unknown>[]): Promise<number>;
  bulkInsertFactComprasRows(uploadedFileId: string, rows: Record<string, unknown>[]): Promise<number>;
  bulkInsertStockRows(uploadedFileId: string, rows: Record<string, unknown>[]): Promise<number>;
  bulkInsertGlobal66ClpRows(uploadedFileId: string, rows: Record<string, unknown>[]): Promise<number>;
  bulkInsertGlobal66UsdRows(uploadedFileId: string, rows: Record<string, unknown>[]): Promise<number>;
  getClientes(): Promise<Cliente[]>;
  getCliente(id: string): Promise<Cliente | undefined>;
  createCliente(data: InsertCliente): Promise<Cliente>;
  updateCliente(id: string, data: Partial<InsertCliente>): Promise<Cliente | undefined>;
  deleteCliente(id: string): Promise<void>;
  lookupClienteData(q: string): Promise<{ nombre: string; razonSocial: string | null; rut: string | null; emails: string[] } | null>;
  getClientesSugeridos(): Promise<{ nombre: string; rut: string | null; emailsSugeridos: string[] }[]>;
  createEmailLog(data: InsertEmailLog): Promise<EmailLog>;
  getEmailLogsByFactura(facturaKey: string): Promise<EmailLog[]>;
  getEmailLogsByFacturas(facturaKeys: string[]): Promise<EmailLog[]>;
  seedClientesFromData(): Promise<{ created: number; skipped: number; total: number; backfilled?: number }>;
  backfillEmailsFromVentas(): Promise<{ updated: number; skippedNoMatch: number; skippedHadEmail: number }>;
  backfillContactosFromBSale(): Promise<{ updated: number; skippedNoBSale: number; skippedNoRut: number; skippedHadContacto: number }>;
  syncNombresFromBSale(): Promise<{ updated: number; alreadyCorrect: number; skippedNoBSale: number; skippedNoRut: number; skippedNoCompany: number }>;
  getAutoMatchRejections(): Promise<Map<string, Set<string>>>;
  addAutoMatchRejection(facturaKey: string, cartolaMovementKey: string): Promise<FacturaAutoMatchRejection>;
  listDiscontinued(): Promise<DiscontinuedProduct[]>;
  addDiscontinued(sku: string, nombre?: string | null): Promise<DiscontinuedProduct>;
  removeDiscontinued(sku: string): Promise<boolean>;
  getDiscontinuedSet(): Promise<Set<string>>;
}

export class DatabaseStorage implements IStorage {
  async createUploadedFile(file: InsertUploadedFile): Promise<UploadedFile> {
    return await insertAndFetch(db, uploadedFiles, file);
  }

  async getUploadedFiles(fileType?: FileType): Promise<UploadedFile[]> {
    if (fileType) {
      return db.select().from(uploadedFiles).where(eq(uploadedFiles.fileType, fileType)).orderBy(desc(uploadedFiles.uploadedAt));
    }
    return db.select().from(uploadedFiles).orderBy(desc(uploadedFiles.uploadedAt));
  }

  async deleteNonCartolaUploadedFiles(): Promise<number> {
    const bsaleTypes: FileType[] = ["fact_ventas", "fact_ventas_bsale", "cobranza", "fact_compras"];
    const [info] = await db.delete(uploadedFiles).where(inArray(uploadedFiles.fileType, bsaleTypes));
    return (info as any).affectedRows;
  }

  async deleteAllUploadedFilesByType(fileType: FileType): Promise<number> {
    const [info] = await db.delete(uploadedFiles).where(eq(uploadedFiles.fileType, fileType));
    return (info as any).affectedRows;
  }

  async getUploadedFile(id: string): Promise<UploadedFile | undefined> {
    const [file] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, id));
    return file || undefined;
  }

  async deleteUploadedFile(id: string): Promise<void> {
    await db.delete(uploadedFiles).where(eq(uploadedFiles.id, id));
  }

  async updateUploadedFileData(id: string, data: unknown[], rowCount: number): Promise<void> {
    await db.update(uploadedFiles).set({ data: data as any, rowCount }).where(eq(uploadedFiles.id, id));
  }

  async getCentroCostosRules(): Promise<CentroCostosRule[]> {
    return db.select().from(centroCostosRules).orderBy(desc(centroCostosRules.priority));
  }

  async createCentroCostosRule(rule: InsertCentroCostosRule): Promise<CentroCostosRule> {
    return await insertAndFetch(db, centroCostosRules, rule);
  }

  async upsertCentroCostosRule(rule: InsertCentroCostosRule): Promise<CentroCostosRule> {
    const patternUpper = rule.pattern.toUpperCase();
    const allRules = await db.select().from(centroCostosRules);
    const existing = allRules.find(r => r.pattern.toUpperCase() === patternUpper);
    if (existing) {
      await db
        .update(centroCostosRules)
        .set({ centroCostos: rule.centroCostos, priority: rule.priority, matchType: rule.matchType })
        .where(eq(centroCostosRules.id, existing.id));
      const [updated] = await db.select().from(centroCostosRules).where(eq(centroCostosRules.id, existing.id));
      if (!updated) {
        throw new Error("Failed to fetch updated rule");
      }
      return updated;
    }
    return await insertAndFetch(db, centroCostosRules, rule);
  }

  async updateCentroCostosRule(id: string, updates: Partial<InsertCentroCostosRule>): Promise<CentroCostosRule | undefined> {
    await db.update(centroCostosRules).set(updates).where(eq(centroCostosRules.id, id));
    const [updated] = await db.select().from(centroCostosRules).where(eq(centroCostosRules.id, id));
    return updated || undefined;
  }

  async deleteCentroCostosRule(id: string): Promise<void> {
    await db.delete(centroCostosRules).where(eq(centroCostosRules.id, id));
  }

  async getReviewedKeys(): Promise<Set<string>> {
    const rows = await db.select().from(centroCostosReviews).where(eq(centroCostosReviews.revisado, 1));
    return new Set(rows.map(r => r.movementKey));
  }

  async setReview(movementKey: string, revisado: boolean): Promise<void> {
    await db.insert(centroCostosReviews)
      .values({ movementKey, revisado: revisado ? 1 : 0 })
      .onDuplicateKeyUpdate({
        set: {
          revisado: revisado ? 1 : 0
        }
      });
  }

  async getSavedCentroCostosMap(): Promise<Map<string, string | null>> {
    const rows = await db.select().from(centroCostosReviews);
    const map = new Map<string, string | null>();
    for (const row of rows) {
      if (row.centroCostos !== null && row.centroCostos !== undefined) {
        map.set(row.movementKey, row.centroCostos);
      }
    }
    return map;
  }

  async saveCentroCostosForMovement(movementKey: string, centroCostos: string | null): Promise<void> {
    const [existing] = await db.select().from(centroCostosReviews).where(eq(centroCostosReviews.movementKey, movementKey));
    if (existing) {
      await db.update(centroCostosReviews).set({ centroCostos }).where(eq(centroCostosReviews.id, existing.id));
    } else {
      await db.insert(centroCostosReviews).values({ movementKey, revisado: 0, centroCostos });
    }
  }

  async getNDocumentoOverrideMap(): Promise<Map<string, string[]>> {
    const rows = await db.select().from(centroCostosReviews);
    const map = new Map<string, string[]>();
    for (const row of rows) {
      if (row.nDocumentoOverride) {
        map.set(row.movementKey, row.nDocumentoOverride.split("|").filter(Boolean));
      }
    }
    return map;
  }

  async saveNDocumentoOverride(movementKey: string, nDocumentos: string[]): Promise<void> {
    const stored = nDocumentos.length > 0 ? nDocumentos.join("|") : null;
    const [existing] = await db.select().from(centroCostosReviews).where(eq(centroCostosReviews.movementKey, movementKey));
    if (existing) {
      await db.update(centroCostosReviews).set({ nDocumentoOverride: stored }).where(eq(centroCostosReviews.id, existing.id));
    } else {
      await db.insert(centroCostosReviews).values({ movementKey, revisado: 0, nDocumentoOverride: stored });
    }
  }

  async getFechaCobroMap(): Promise<Map<string, string>> {
    const rows = await db.select().from(centroCostosReviews);
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.fechaCobroOverride) {
        map.set(row.movementKey, row.fechaCobroOverride);
      }
    }
    return map;
  }

  async saveFechaCobro(movementKey: string, fechaCobro: string | null): Promise<void> {
    const [existing] = await db.select().from(centroCostosReviews).where(eq(centroCostosReviews.movementKey, movementKey));
    if (existing) {
      await db.update(centroCostosReviews).set({ fechaCobroOverride: fechaCobro }).where(eq(centroCostosReviews.id, existing.id));
    } else {
      await db.insert(centroCostosReviews).values({ movementKey, revisado: 0, fechaCobroOverride: fechaCobro });
    }
  }

  async getFacturaReviews(): Promise<FacturaReview[]> {
    return db.select().from(facturaReviews);
  }

  async upsertFacturaReview(facturaKey: string, estado: "pendiente" | "pagado" | "propuesto", cartolaMovementKey?: string | null): Promise<FacturaReview> {
    await db.insert(facturaReviews)
      .values({ facturaKey, estado, cartolaMovementKey: cartolaMovementKey ?? null })
      .onDuplicateKeyUpdate({
        set: {
          estado,
          cartolaMovementKey: cartolaMovementKey ?? null
        }
      });
    const [updated] = await db.select().from(facturaReviews).where(eq(facturaReviews.facturaKey, facturaKey));
    if (!updated) {
      throw new Error("Failed to fetch updated factura review");
    }
    return updated;
  }

  async getFacturaPropuestas(facturaKey?: string): Promise<FacturaPropuesta[]> {
    if (facturaKey) {
      return db.select().from(facturaPropuestas).where(eq(facturaPropuestas.facturaKey, facturaKey));
    }
    return db.select().from(facturaPropuestas);
  }

  async addFacturaPropuesta(facturaKey: string, tipo: string, cartolaMovementKey?: string | null, notaManual?: string | null): Promise<FacturaPropuesta> {
    return await insertAndFetch(db, facturaPropuestas, {
      facturaKey,
      tipo,
      cartolaMovementKey: cartolaMovementKey ?? null,
      notaManual: notaManual ?? null,
    });
  }

  async deleteFacturaPropuesta(id: string): Promise<void> {
    await db.delete(facturaPropuestas).where(eq(facturaPropuestas.id, id));
  }

  async getAutoMatchRejections(): Promise<Map<string, Set<string>>> {
    const rows = await db.select().from(facturaAutoMatchRejections);
    const map = new Map<string, Set<string>>();
    for (const r of rows) {
      const set = map.get(r.facturaKey) ?? new Set<string>();
      set.add(r.cartolaMovementKey);
      map.set(r.facturaKey, set);
    }
    return map;
  }

  async addAutoMatchRejection(facturaKey: string, cartolaMovementKey: string): Promise<FacturaAutoMatchRejection> {
    const [existing] = await db.select().from(facturaAutoMatchRejections)
      .where(sql`${facturaAutoMatchRejections.facturaKey} = ${facturaKey} AND ${facturaAutoMatchRejections.cartolaMovementKey} = ${cartolaMovementKey}`);
    if (existing) return existing;
    return await insertAndFetch(db, facturaAutoMatchRejections, { facturaKey, cartolaMovementKey });
  }

  async getAppUser(email: string): Promise<AppUser | undefined> {
    const [user] = await db.select().from(appUsers).where(eq(appUsers.email, email));
    return user || undefined;
  }

  async getAppUserById(id: string): Promise<AppUser | undefined> {
    const [user] = await db.select().from(appUsers).where(eq(appUsers.id, id));
    return user || undefined;
  }

  async getAllAppUsers(): Promise<AppUser[]> {
    return db.select().from(appUsers).orderBy(desc(appUsers.invitedAt));
  }

  async createAppUser(data: InsertAppUser): Promise<AppUser> {
    return await insertAndFetch(db, appUsers, data);
  }

  async updateAppUserStatus(id: string, status: string): Promise<AppUser | undefined> {
    await db.update(appUsers).set({ status }).where(eq(appUsers.id, id));
    const [updated] = await db.select().from(appUsers).where(eq(appUsers.id, id));
    return updated || undefined;
  }

  async updateAppUserRole(id: string, role: string): Promise<AppUser | undefined> {
    await db.update(appUsers).set({ role }).where(eq(appUsers.id, id));
    const [updated] = await db.select().from(appUsers).where(eq(appUsers.id, id));
    return updated || undefined;
  }

  async updateAppUserOnLogin(id: string, name: string): Promise<void> {
    await db.update(appUsers).set({ status: "active", name, lastLoginAt: new Date() }).where(eq(appUsers.id, id));
  }

  async deleteAppUser(id: string): Promise<void> {
    await db.delete(appUsers).where(eq(appUsers.id, id));
  }

  async countAppUsers(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(appUsers);
    return Number(result[0]?.count ?? 0);
  }

  async getVentasAmigo(): Promise<VentaAmigo[]> {
    return db.select().from(ventasAmigo).orderBy(desc(ventasAmigo.id));
  }

  async createVentaAmigo(data: InsertVentaAmigo): Promise<VentaAmigo> {
    return await insertAndFetch(db, ventasAmigo, data);
  }

  async updateVentaAmigoEstado(id: number, estado: string): Promise<VentaAmigo | undefined> {
    await db.update(ventasAmigo).set({ estado }).where(eq(ventasAmigo.id, id));
    const [updated] = await db.select().from(ventasAmigo).where(eq(ventasAmigo.id, id));
    return updated || undefined;
  }

  async updateVentaAmigo(id: number, data: Partial<InsertVentaAmigo>): Promise<VentaAmigo | undefined> {
    await db.update(ventasAmigo).set(data).where(eq(ventasAmigo.id, id));
    const [updated] = await db.select().from(ventasAmigo).where(eq(ventasAmigo.id, id));
    return updated || undefined;
  }

  async deleteVentaAmigo(id: number): Promise<boolean> {
    const [info] = await db.delete(ventasAmigo).where(eq(ventasAmigo.id, id));
    return info.affectedRows > 0;
  }

  async bulkUpsertCentroCostosImport(items: { movementKey: string; centroCostos: string; revisado: number; fechaCobroOverride?: string | null; nDocumentoOverride?: string | null }[]): Promise<void> {
    if (items.length === 0) return;
    const BATCH = 100;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      await db
        .insert(centroCostosReviews)
        .values(batch.map(item => ({
          movementKey: item.movementKey,
          centroCostos: item.centroCostos,
          revisado: item.revisado,
          fechaCobroOverride: item.fechaCobroOverride ?? undefined,
          nDocumentoOverride: item.nDocumentoOverride ?? undefined,
        })))
        .onDuplicateKeyUpdate({
          set: {
            centroCostos: sql`CASE WHEN revisado = 1 THEN centro_costos ELSE VALUES(centro_costos) END`,
            revisado: sql`CASE WHEN revisado = 1 THEN 1 ELSE VALUES(revisado) END`,
            fechaCobroOverride: sql`VALUES(fecha_cobro_override)`,
            nDocumentoOverride: sql`CASE WHEN VALUES(n_documento_override) IS NOT NULL THEN VALUES(n_documento_override) ELSE n_documento_override END`,
          },
        });
    }
  }

  private toNumericOrUndefined(val: unknown): string | undefined {
    if (val == null) return undefined;
    const s = String(val).trim();
    if (s === "" || isNaN(Number(s))) return undefined;
    return s;
  }


  async bulkInsertCartolaRows(uploadedFileId: string, rows: Record<string, unknown>[]): Promise<number> {
    if (rows.length === 0) return 0;
    const values = rows.map(r => ({
      uploadedFileId,
      fecha: String(r["Fecha"] ?? ""),
      detalleMovimiento: String(r["Detalle Movimiento"] ?? ""),
      chequeOCargo: this.toNumericOrUndefined(r["Cheque o Cargo"]),
      depositoOAbono: this.toNumericOrUndefined(r["Deposito o Abono"]),
      saldo: this.toNumericOrUndefined(r["Saldo"]),
      doctoNro: r["Docto. Nro."] != null ? String(r["Docto. Nro."]) : undefined,
      trn: r["Trn"] != null ? String(r["Trn"]) : undefined,
      caja: r["Caja"] != null ? String(r["Caja"]) : undefined,
      sucursal: r["Sucursal"] != null ? String(r["Sucursal"]) : undefined,
    }));
    return await insertBatch(db, cartolaRows, values);
  }

  async bulkInsertCartolaSecurityRows(uploadedFileId: string, rows: Record<string, unknown>[]): Promise<number> {
    if (rows.length === 0) return 0;
    const values = rows.map(r => ({
      uploadedFileId,
      fecha: String(r["Fecha"] ?? ""),
      detalleMovimiento: String(r["Detalle Movimiento"] ?? ""),
      doctoNro: r["Docto. Nro."] != null ? String(r["Docto. Nro."]) : undefined,
      cargo: this.toNumericOrUndefined(r["Cargo"]),
      abono: this.toNumericOrUndefined(r["Abono"]),
      saldo: this.toNumericOrUndefined(r["Saldo"]),
    }));
    return await insertBatch(db, cartolaSecurityRows, values);
  }

  async bulkInsertCartolaFalabellaRows(uploadedFileId: string, rows: Record<string, unknown>[]): Promise<number> {
    if (rows.length === 0) return 0;
    const values = rows.map(r => ({
      uploadedFileId,
      fecha: String(r["Fecha"] ?? ""),
      oficina: r["Oficina"] != null ? String(r["Oficina"]) : undefined,
      nroDoc: r["Nro Doc"] != null ? String(r["Nro Doc"]) : undefined,
      descripcion: r["Descripción"] != null ? String(r["Descripción"]) : undefined,
      cargo: this.toNumericOrUndefined(r["Cargo"]),
      abono: this.toNumericOrUndefined(r["Abono"]),
      saldo: this.toNumericOrUndefined(r["Saldo"]),
    }));
    return await insertBatch(db, cartolaFalabellaRows, values);
  }

  async bulkInsertCobranzaRows(uploadedFileId: string, rows: Record<string, unknown>[]): Promise<number> {
    if (rows.length === 0) return 0;
    const values = rows.map(r => ({
      uploadedFileId,
      tipoDocumento: r["Tipo Documento"] != null ? String(r["Tipo Documento"]) : undefined,
      nDocumento: r["Nº Documento"] != null ? String(r["Nº Documento"]) : undefined,
      rutCliente: r["Rut Cliente"] != null ? String(r["Rut Cliente"]) : undefined,
      fechaEmision: r["Fecha Emisión"] != null ? String(r["Fecha Emisión"]) : undefined,
      montoExento: r["Monto Exento"] != null ? String(r["Monto Exento"]) : undefined,
      montoNeto: r["Monto Neto"] != null ? String(r["Monto Neto"]) : undefined,
      montoIva: r["Monto Iva"] != null ? String(r["Monto Iva"]) : undefined,
      imptoEspecifico: r["Impto. Especifico"] != null ? String(r["Impto. Especifico"]) : undefined,
      montoTotal: r["Monto Total"] != null ? String(r["Monto Total"]) : undefined,
      fechaAcuse: r["Fecha Acuse"] != null ? String(r["Fecha Acuse"]) : undefined,
      notificacionComercial: r["Notificación Comercial"] != null ? String(r["Notificación Comercial"]) : undefined,
      fechaNotificacionComercial: r["Fecha Notificación Comercial"] != null ? String(r["Fecha Notificación Comercial"]) : undefined,
      xmlRecepcionado: r["XML recepcionado"] != null ? String(r["XML recepcionado"]) : undefined,
      estado: r["Estado"] != null ? String(r["Estado"]) : undefined,
    }));
    return await insertBatch(db, cobranzaRows, values);
  }

  async bulkInsertFactVentasRows(uploadedFileId: string, rows: Record<string, unknown>[]): Promise<number> {
    if (rows.length === 0) return 0;
    const toStr = (v: unknown) => v != null ? String(v) : null;
    const values = rows.map(r => ({
      uploadedFileId,
      tipoMovimiento: toStr(r["Tipo Movimiento"]) ?? undefined,
      tipoDeDocumento: toStr(r["Tipo de Documento"]) ?? undefined,
      numeroDocumento: toStr(r["Numero Documento"]) ?? undefined,
      fechaDeEmision: toStr(r["Fecha de Emisión"]) ?? undefined,
      trackingNumber: toStr(r["Tracking number"]) ?? undefined,
      fechaVenta: toStr(r["Fecha Venta"]) ?? undefined,
      horaVenta: toStr(r["Hora Venta"]) ?? undefined,
      sucursal: toStr(r["Sucursal"]) ?? undefined,
      vendedor: toStr(r["Vendedor"]) ?? undefined,
      nombreCliente: toStr(r["Nombre Cliente"]) ?? undefined,
      clienteRut: toStr(r["Cliente RUT"]) ?? undefined,
      emailCliente: toStr(r["Email Cliente"]) ?? undefined,
      clienteDireccion: toStr(r["Cliente Dirección"]) ?? undefined,
      clienteComuna: toStr(r["Cliente Comuna"]) ?? undefined,
      clienteCiudad: toStr(r["Cliente Ciudad"]) ?? undefined,
      listaDePrecio: toStr(r["Lista de Precio"]) ?? undefined,
      tipoDeEntrega: toStr(r["Tipo de entrega"]) ?? undefined,
      moneda: toStr(r["Moneda"]) ?? undefined,
      tipoDeProductoServicio: toStr(r["Tipo de Producto / Servicio"]) ?? undefined,
      sku: toStr(r["SKU"]) ?? undefined,
      productoServicio: toStr(r["Producto / Servicio"]) ?? undefined,
      variante: toStr(r["Variante"]) ?? undefined,
      otrosAtributos: toStr(r["Otros Atributos"]) ?? undefined,
      marca: toStr(r["Marca"]) ?? undefined,
      detallePackPromo: toStr(r["Detalle de Productos/Servicios Pack/Promo"]) ?? undefined,
      precioDeLista: this.toNumericOrUndefined(r["Precio de Lista"]),
      precioNetoUnitario: this.toNumericOrUndefined(r["Precio Neto Unitario"]),
      precioBrutoUnitario: this.toNumericOrUndefined(r["Precio Bruto Unitario"]),
      cantidad: this.toNumericOrUndefined(r["Cantidad"]),
      ventaTotalNeta: this.toNumericOrUndefined(r["Venta Total Neta"]),
      totalImpuestos: this.toNumericOrUndefined(r["Total Impuestos"]),
      ventaTotalBruta: this.toNumericOrUndefined(r["Venta Total Bruta"]),
      nombreDeDcto: toStr(r["Nombre de dcto"]) ?? undefined,
      descuentoNeto: this.toNumericOrUndefined(r["Descuento Neto"]),
      descuentoBruto: this.toNumericOrUndefined(r["Descuento Bruto"]),
      porcentajeDescuento: toStr(r["% Descuento"]) ?? undefined,
      costoNetoUnitario: this.toNumericOrUndefined(r["Costo neto unitario"]),
      costoTotalNeto: this.toNumericOrUndefined(r["Costo Total Neto"]),
      margen: this.toNumericOrUndefined(r["Margen"]),
      porcentajeMargen: toStr(r["% Margen"]) ?? undefined,
    }));
    const BATCH_SIZE = 500;
    let total = 0;
    for (let i = 0; i < values.length; i += BATCH_SIZE) {
      const batch = values.slice(i, i + BATCH_SIZE);
      const inserted = await insertBatch(db, factVentasRows, batch);
      total += inserted;
    }
    return total;
  }

  async bulkInsertFactComprasRows(uploadedFileId: string, rows: Record<string, unknown>[]): Promise<number> {
    if (rows.length === 0) return 0;
    const values = rows.map(r => ({
      uploadedFileId,
      folio: r["Folio"] != null ? String(r["Folio"]) : undefined,
      rut: r["RUT"] != null ? String(r["RUT"]) : undefined,
      fechaEmision: r["Fecha Emisión"] != null ? String(r["Fecha Emisión"]) : undefined,
      estado: r["Estado"] != null ? String(r["Estado"]) : undefined,
      razonSocial: r["Razón Social"] != null ? String(r["Razón Social"]) : undefined,
      montoExento: this.toNumericOrUndefined(r["Monto Exento"]),
      montoNeto: this.toNumericOrUndefined(r["Monto Neto"]),
      montoIva: this.toNumericOrUndefined(r["Monto Iva"]),
      imptoEspecifico: this.toNumericOrUndefined(r["Impto. Especifico"]),
      montoTotal: this.toNumericOrUndefined(r["Monto Total"]),
      fechaAcuse: r["Fecha Acuse de Mercadería"] != null ? String(r["Fecha Acuse de Mercadería"]) : undefined,
      notificacionComercial: r["Notificación Comercial"] != null ? String(r["Notificación Comercial"]) : undefined,
      fechaNotificacionComercial: r["Fecha Notificación Comercial"] != null ? String(r["Fecha Notificación Comercial"]) : undefined,
      xmlRecepcionado: r["XML recepcionado"] != null ? String(r["XML recepcionado"]) : undefined,
    }));
    return await insertBatch(db, factComprasRows, values);
  }

  async bulkInsertStockRows(uploadedFileId: string, rows: Record<string, unknown>[]): Promise<number> {
    if (rows.length === 0) return 0;
    const values = rows.map(r => {
      const { SKU, Producto, _stockDate, ...rest } = r as Record<string, unknown>;
      return {
        uploadedFileId,
        sku: String(SKU ?? ""),
        producto: Producto != null ? String(Producto) : undefined,
        stockDate: String(_stockDate ?? ""),
        extraData: Object.keys(rest).length > 0 ? rest : undefined,
      };
    });
    return await insertBatch(db, stockRows, values);
  }

  async bulkInsertGlobal66ClpRows(uploadedFileId: string, rows: Record<string, unknown>[]): Promise<number> {
    if (rows.length === 0) return 0;
    const values = rows.map(r => ({
      uploadedFileId,
      fecha: String(r["Fecha"] ?? ""),
      descripcion: r["Descripción"] != null ? String(r["Descripción"]) : undefined,
      movimiento: r["Movimiento"] != null ? String(r["Movimiento"]) : undefined,
      debito: this.toNumericOrUndefined(r["Débito"]) ?? "0.00",
      abono: this.toNumericOrUndefined(r["Abono"]) ?? "0.00",
      saldo: r["Saldo"] != null ? String(r["Saldo"]) : undefined,
    }));
    return await insertBatch(db, cartolaGlobal66ClpRows, values);
  }

  async bulkInsertGlobal66UsdRows(uploadedFileId: string, rows: Record<string, unknown>[]): Promise<number> {
    if (rows.length === 0) return 0;
    const values = rows.map(r => ({
      uploadedFileId,
      fecha: String(r["Fecha"] ?? ""),
      descripcion: r["Descripción"] != null ? String(r["Descripción"]) : undefined,
      movimiento: r["Movimiento"] != null ? String(r["Movimiento"]) : undefined,
      debito: this.toNumericOrUndefined(r["Débito"]) ?? "0.00",
      abono: this.toNumericOrUndefined(r["Abono"]) ?? "0.00",
      saldo: r["Saldo"] != null ? String(r["Saldo"]) : undefined,
    }));
    return await insertBatch(db, cartolaGlobal66UsdRows, values);
  }

  async getClientes(): Promise<Cliente[]> {
    return db.select().from(clientes).orderBy(desc(clientes.createdAt));
  }

  async getCliente(id: string): Promise<Cliente | undefined> {
    const [c] = await db.select().from(clientes).where(eq(clientes.id, id));
    return c || undefined;
  }

  async createCliente(data: InsertCliente): Promise<Cliente> {
    return await insertAndFetch(db, clientes, data);
  }

  async updateCliente(id: string, data: Partial<InsertCliente>): Promise<Cliente | undefined> {
    await db.update(clientes).set(data).where(eq(clientes.id, id));
    const [c] = await db.select().from(clientes).where(eq(clientes.id, id));
    return c || undefined;
  }

  async deleteCliente(id: string): Promise<void> {
    await db.delete(clientes).where(eq(clientes.id, id));
  }

  async lookupClienteData(q: string): Promise<{ nombre: string; razonSocial: string | null; rut: string | null; emails: string[] } | null> {
    const qLower = q.toLowerCase().trim();
    if (!qLower) return null;
    const rows = await db
      .selectDistinct({ nombre: factVentasRows.nombreCliente, rut: factVentasRows.clienteRut, email: factVentasRows.emailCliente })
      .from(factVentasRows)
      .where(sql`LOWER(${factVentasRows.clienteRut}) = ${qLower} OR LOWER(${factVentasRows.nombreCliente}) = ${qLower}`);
    if (rows.length === 0) return null;
    const nombre = rows[0].nombre?.trim() || "";
    const rut = rows[0].rut?.trim() || null;
    const emails = [...new Set(rows.map(r => r.email?.trim()).filter(Boolean) as string[])];
    // Look up razón social from master clientes by RUT (preferred) or by nombre.
    let razonSocial: string | null = null;
    if (rut) {
      const [m] = await db.select({ razonSocial: clientes.razonSocial })
        .from(clientes)
        .where(sql`LOWER(${clientes.rut}) = ${rut.toLowerCase()}`)
        .limit(1);
      razonSocial = m?.razonSocial?.trim() || null;
    }
    if (!razonSocial && nombre) {
      const [m] = await db.select({ razonSocial: clientes.razonSocial })
        .from(clientes)
        .where(sql`LOWER(${clientes.nombre}) = ${nombre.toLowerCase()}`)
        .limit(1);
      razonSocial = m?.razonSocial?.trim() || null;
    }
    return { nombre, razonSocial, rut, emails };
  }

  async getClientesSugeridos(): Promise<{ nombre: string; rut: string | null; emailsSugeridos: string[] }[]> {
    const existingClientes = await db.select().from(clientes);
    const existingRuts = new Set(existingClientes.map(c => c.rut?.toLowerCase()).filter(Boolean));
    const existingNombres = new Set(existingClientes.map(c => c.nombre.toLowerCase().trim()));

    const ventasRows = await db
      .selectDistinct({ nombre: factVentasRows.nombreCliente, rut: factVentasRows.clienteRut, email: factVentasRows.emailCliente })
      .from(factVentasRows)
      .where(sql`${factVentasRows.nombreCliente} IS NOT NULL AND ${factVentasRows.nombreCliente} != ''`);

    const cobranzaRawRows = await db
      .selectDistinct({ rut: cobranzaRows.rutCliente })
      .from(cobranzaRows)
      .where(sql`${cobranzaRows.rutCliente} IS NOT NULL AND ${cobranzaRows.rutCliente} != ''`);

    const sugeridosMap = new Map<string, { nombre: string; rut: string | null; emails: Set<string> }>();

    for (const row of ventasRows) {
      const rut = row.rut?.trim() || null;
      const nombre = row.nombre?.trim() || rut || "";
      const email = row.email?.trim() || null;
      if (!nombre) continue;
      const nombreLower = nombre.toLowerCase();
      const rutLower = rut?.toLowerCase() || "";
      if (existingNombres.has(nombreLower) || (rutLower && existingRuts.has(rutLower))) continue;
      const key = rutLower || nombreLower;
      if (!sugeridosMap.has(key)) {
        sugeridosMap.set(key, { nombre, rut, emails: new Set() });
      }
      if (email) sugeridosMap.get(key)!.emails.add(email);
    }

    for (const row of cobranzaRawRows) {
      const rut = row.rut?.trim() || null;
      if (!rut) continue;
      const rutLower = rut.toLowerCase();
      if (existingRuts.has(rutLower)) continue;
      if (!sugeridosMap.has(rutLower)) {
        const match = ventasRows.find(v => v.rut?.toLowerCase() === rutLower);
        const nombre = match?.nombre?.trim() || rut;
        sugeridosMap.set(rutLower, { nombre, rut, emails: new Set(match?.email ? [match.email] : []) });
      }
    }

    return [...sugeridosMap.values()].map(s => ({
      nombre: s.nombre,
      rut: s.rut,
      emailsSugeridos: [...s.emails],
    }));
  }

  async createEmailLog(data: InsertEmailLog): Promise<EmailLog> {
    return await insertAndFetch(db, emailLogs, data);
  }

  async getEmailLogsByFactura(facturaKey: string): Promise<EmailLog[]> {
    return db.select().from(emailLogs).where(eq(emailLogs.facturaKey, facturaKey)).orderBy(emailLogs.enviadoAt);
  }

  async getEmailLogsByFacturas(facturaKeys: string[]): Promise<EmailLog[]> {
    if (facturaKeys.length === 0) return [];
    return db.select().from(emailLogs).where(inArray(emailLogs.facturaKey, facturaKeys)).orderBy(emailLogs.enviadoAt);
  }

  async backfillEmailsFromVentas(): Promise<{ updated: number; skippedNoMatch: number; skippedHadEmail: number }> {
    const allClientes = await db.select().from(clientes);

    const ventasRows = await db
      .select({ rut: factVentasRows.clienteRut, email: factVentasRows.emailCliente })
      .from(factVentasRows)
      .where(sql`${factVentasRows.emailCliente} IS NOT NULL AND TRIM(${factVentasRows.emailCliente}) != ''
             AND ${factVentasRows.clienteRut} IS NOT NULL AND TRIM(${factVentasRows.clienteRut}) != ''`);

    const countByRutEmail = new Map<string, Map<string, { email: string; count: number }>>();
    for (const row of ventasRows) {
      const rutKey = row.rut!.toLowerCase().trim();
      const email = row.email!.trim();
      const emailKey = email.toLowerCase();
      if (!countByRutEmail.has(rutKey)) countByRutEmail.set(rutKey, new Map());
      const inner = countByRutEmail.get(rutKey)!;
      const existing = inner.get(emailKey);
      if (existing) existing.count++;
      else inner.set(emailKey, { email, count: 1 });
    }

    const mostFrequentByRut = new Map<string, string>();
    countByRutEmail.forEach((inner, rutKey) => {
      let best: { email: string; count: number } | null = null;
      inner.forEach(candidate => {
        if (!best
          || candidate.count > best.count
          || (candidate.count === best.count && candidate.email.toLowerCase() < best.email.toLowerCase())) {
          best = candidate;
        }
      });
      if (best !== null) mostFrequentByRut.set(rutKey, (best as { email: string; count: number }).email);
    });

    let updated = 0;
    let skippedNoMatch = 0;
    let skippedHadEmail = 0;

    for (const c of allClientes) {
      const hasEmail = hasValidEmail(c.emails);
      if (hasEmail) { skippedHadEmail++; continue; }
      if (!c.rut || !c.rut.trim()) { skippedNoMatch++; continue; }
      const email = mostFrequentByRut.get(c.rut.toLowerCase().trim());
      if (!email) { skippedNoMatch++; continue; }
      // Defensive WHERE: solo actualiza si el cliente sigue sin email (evita race
      // contra una escritura concurrente que pudo agregar email entre el SELECT y el UPDATE).
      const result = await db.update(clientes)
        .set({ emails: [email] })
        .where(sql`${clientes.id} = ${c.id} AND (
          ${clientes.emails} IS NULL
          OR JSON_LENGTH(${clientes.emails}) = 0
        )`);
      const [info] = result as any;
      if (info && info.affectedRows > 0) {
        updated++;
      } else {
        skippedHadEmail++;
      }
    }

    return { updated, skippedNoMatch, skippedHadEmail };
  }

  async backfillContactosFromBSale(): Promise<{ updated: number; skippedNoBSale: number; skippedNoRut: number; skippedHadContacto: number }> {
    const { lookupContactByRut } = await import("./bsale");
    const allClientes = await db.select().from(clientes);

    let updated = 0;
    let skippedNoBSale = 0;
    let skippedNoRut = 0;
    let skippedHadContacto = 0;

    for (const c of allClientes) {
      if (c.nombreContacto && c.nombreContacto.trim()) { skippedHadContacto++; continue; }
      if (!c.rut || !c.rut.trim()) { skippedNoRut++; continue; }

      const contact = await lookupContactByRut(c.rut);
      if (!contact) { skippedNoBSale++; continue; }

      const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
      if (!fullName) { skippedNoBSale++; continue; }

      // Defensive WHERE: solo actualiza si el cliente sigue sin contacto.
      const [info] = await db.update(clientes)
        .set({ nombreContacto: fullName })
        .where(sql`${clientes.id} = ${c.id} AND (${clientes.nombreContacto} IS NULL OR TRIM(${clientes.nombreContacto}) = '')`);
      if ((info as any).affectedRows > 0) updated++;
      else skippedHadContacto++;
    }

    return { updated, skippedNoBSale, skippedNoRut, skippedHadContacto };
  }

  async syncNombresFromBSale(): Promise<{ updated: number; alreadyCorrect: number; skippedNoBSale: number; skippedNoRut: number; skippedNoCompany: number }> {
    const { lookupClientInfoByRut } = await import("./bsale");
    const allClientes = await db.select().from(clientes);

    let updated = 0;
    let alreadyCorrect = 0;
    let skippedNoBSale = 0;
    let skippedNoRut = 0;
    let skippedNoCompany = 0;

    for (const c of allClientes) {
      if (!c.rut || !c.rut.trim()) { skippedNoRut++; continue; }

      const info = await lookupClientInfoByRut(c.rut);
      if (!info) { skippedNoBSale++; continue; }

      const { company, firstName, lastName } = info;
      if (!company) { skippedNoCompany++; continue; }

      // Skip if nombre already matches company (normalized compare)
      if (c.nombre.trim().toLowerCase() === company.toLowerCase()) {
        alreadyCorrect++;
        continue;
      }

      const personName = [firstName, lastName].filter(Boolean).join(" ").trim();
      const updates: Record<string, string | null> = { nombre: company };
      if (personName && (!c.nombreContacto || !c.nombreContacto.trim())) {
        updates.nombreContacto = personName;
      }

      const [infoUpdate] = await db.update(clientes)
        .set(updates)
        .where(sql`${clientes.id} = ${c.id} AND LOWER(TRIM(${clientes.nombre})) != LOWER(${company})`);
      if ((infoUpdate as any).affectedRows > 0) updated++;
      else alreadyCorrect++;
    }

    return { updated, alreadyCorrect, skippedNoBSale, skippedNoRut, skippedNoCompany };
  }

  async seedClientesFromData(): Promise<{ created: number; skipped: number; total: number; backfilled?: number }> {
    // 1. Collect candidates from fact_ventas_rows (nombre + rut + email)
    const ventasRows = await db
      .select({
        nombre: factVentasRows.nombreCliente,
        rut: factVentasRows.clienteRut,
        email: factVentasRows.emailCliente,
      })
      .from(factVentasRows)
      .where(sql`(${factVentasRows.nombreCliente} IS NOT NULL AND TRIM(${factVentasRows.nombreCliente}) != '')
             OR (${factVentasRows.clienteRut} IS NOT NULL AND TRIM(${factVentasRows.clienteRut}) != '')`);

    // 2. Collect ruts from cobranza_rows
    const cobranzaRutRows = await db
      .selectDistinct({ rut: cobranzaRows.rutCliente })
      .from(cobranzaRows)
      .where(sql`${cobranzaRows.rutCliente} IS NOT NULL AND TRIM(${cobranzaRows.rutCliente}) != ''`);

    // 3. Collect "Cliente" + "Rut Cliente" from uploaded_files cobranza JSONB
    const cobranzaFiles = await db
      .select({ data: uploadedFiles.data })
      .from(uploadedFiles)
      .where(eq(uploadedFiles.fileType, "cobranza"));

    const cobranzaJsonRows: { nombre: string; rut: string; razonSocial: string | null } [] = [];
    for (const file of cobranzaFiles) {
      const rows = (file.data as Record<string, unknown>[]) || [];
      for (const row of rows) {
        if ((row as { __deleted?: boolean }).__deleted) continue;
        const nombre = String(row["Cliente"] ?? "").trim();
        const rut = String(row["Rut Cliente"] ?? "").trim();
        const razonSocial = String(row["Razón Social"] ?? "").trim() || null;
        if (nombre || rut) {
          cobranzaJsonRows.push({ nombre, rut, razonSocial });
        }
      }
    }

    // 4. Build deduplicated candidates map keyed by normalized RUT (fallback: nombre)
    // candidateMap[key] = { nombre, razonSocial, rut, emails }
    const candidateMap = new Map<string, { nombre: string; razonSocial: string | null; rut: string | null; emails: Set<string> }>();

    const addCandidate = (nombre: string | null, rut: string | null, email: string | null, razonSocial: string | null = null) => {
      const n = nombre?.trim() || "";
      const r = rut?.trim() || null;
      const e = email?.trim() || null;
      const rs = razonSocial?.trim() || null;
      if (!n && !r) return;
      const key = r ? r.toLowerCase() : n.toLowerCase();
      if (!candidateMap.has(key)) {
        candidateMap.set(key, { nombre: n || r || "", razonSocial: rs, rut: r, emails: new Set() });
      } else {
        // Prefer longer / non-empty nombre
        const existing = candidateMap.get(key)!;
        if (n && n.length > existing.nombre.length) existing.nombre = n;
        if (r && !existing.rut) existing.rut = r;
        if (rs && !existing.razonSocial) existing.razonSocial = rs;
      }
      if (e) candidateMap.get(key)!.emails.add(e);
    };

    for (const row of ventasRows) addCandidate(row.nombre, row.rut, row.email);
    for (const row of cobranzaRutRows) addCandidate(null, row.rut, null);
    for (const row of cobranzaJsonRows) addCandidate(row.nombre, row.rut, null, row.razonSocial);

    // 5. Get existing clientes to avoid duplicates
    const existingClientes = await db.select({ rut: clientes.rut, nombre: clientes.nombre }).from(clientes);
    const existingRuts = new Set(existingClientes.map(c => c.rut?.toLowerCase().trim()).filter(Boolean));
    const existingNombres = new Set(existingClientes.map(c => c.nombre.toLowerCase().trim()));

    // 6. Insert new candidates
    let created = 0;
    let skipped = 0;
    const total = candidateMap.size;

    for (const candidate of candidateMap.values()) {
      const rutLower = candidate.rut?.toLowerCase() || null;
      const nombreLower = candidate.nombre.toLowerCase().trim();
      if ((rutLower && existingRuts.has(rutLower)) || existingNombres.has(nombreLower)) {
        skipped++;
        continue;
      }
      await db.insert(clientes).values({
        nombre: candidate.nombre || candidate.rut || "Sin nombre",
        razonSocial: candidate.razonSocial,
        rut: candidate.rut,
        emails: [...candidate.emails],
        telefono: null,
        notas: null,
      });
      existingRuts.add(rutLower || "");
      existingNombres.add(nombreLower);
      created++;
    }

    // Auto-backfill emails desde fact_ventas_rows para clientes recién sembrados
    // (cobranza no aporta emails, pero sí lo hacen las ventas).
    const { updated: backfilled } = await this.backfillEmailsFromVentas();

    return { created, skipped, total, backfilled };
  }

  async listDiscontinued(): Promise<DiscontinuedProduct[]> {
    return db.select().from(discontinuedProducts).orderBy(desc(discontinuedProducts.fechaDescontinuado));
  }

  async addDiscontinued(sku: string, nombre?: string | null): Promise<DiscontinuedProduct> {
    const skuLower = sku.trim().toLowerCase();
    const nombreClean = nombre?.trim() ? nombre.trim() : null;
    const existing = await db.select().from(discontinuedProducts).where(eq(discontinuedProducts.sku, skuLower));
    if (existing.length > 0) {
      await db.update(discontinuedProducts).set({ nombre: nombreClean, fechaDescontinuado: new Date() }).where(eq(discontinuedProducts.sku, skuLower));
      const [updated] = await db.select().from(discontinuedProducts).where(eq(discontinuedProducts.sku, skuLower));
      if (!updated) {
        throw new Error("Failed to fetch updated discontinued product");
      }
      return updated;
    }
    return await insertAndFetch(db, discontinuedProducts, { sku: skuLower, nombre: nombreClean }, 'sku');
  }

  async removeDiscontinued(sku: string): Promise<boolean> {
    const skuLower = sku.trim().toLowerCase();
    const [info] = await db.delete(discontinuedProducts).where(eq(discontinuedProducts.sku, skuLower));
    return (info as any).affectedRows > 0;
  }

  async getDiscontinuedSet(): Promise<Set<string>> {
    const rows = await db.select({ sku: discontinuedProducts.sku }).from(discontinuedProducts);
    return new Set(rows.map(r => r.sku));
  }

  async deduplicateFactVentas(): Promise<{ cleaned: number; filesUpdated: number }> {
    const buildFVKey = (row: Record<string, unknown>) => {
      const numDoc = String(row["Numero del documento"] ?? row["Numero Documento"] ?? "").trim().toLowerCase();
      const sku = String(row["SKU"] ?? "").trim().toLowerCase();
      const tipo = String(row["Tipo Movimiento"] ?? "").trim().toLowerCase();
      const cantidad = String(row["Cantidad"] ?? "").trim().toLowerCase();
      const venta = String(row["Venta Total Neta"] ?? "").trim().toLowerCase();
      return `${numDoc}|${sku}|${tipo}|${cantidad}|${venta}`;
    };

    const allFiles = [
      ...await this.getUploadedFiles("fact_ventas_bsale"),
      ...await this.getUploadedFiles("fact_ventas"),
    ];

    const seenKeys = new Set<string>();
    let cleaned = 0;
    let filesUpdated = 0;

    for (const file of allFiles) {
      const rows = (file.data || []) as Record<string, unknown>[];
      let changed = false;
      const updatedRows = rows.map(row => {
        if ((row as { __deleted?: boolean }).__deleted) return row;
        const key = buildFVKey(row as Record<string, unknown>);
        if (seenKeys.has(key)) { cleaned++; changed = true; return { __deleted: true }; }
        seenKeys.add(key);
        return row;
      });
      if (changed) {
        const activeCount = updatedRows.filter(r => !(r as { __deleted?: boolean }).__deleted).length;
        await this.updateUploadedFileData(file.id, updatedRows, activeCount);
        filesUpdated++;
      }
    }

    return { cleaned, filesUpdated };
  }
}

export const storage = new DatabaseStorage();
