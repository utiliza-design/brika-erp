import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, serial, numeric, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const fileTypeEnum = ["cartola", "cobranza", "fact_ventas", "fact_ventas_bsale", "fact_compras", "cartola_security", "cartola_falabella", "cartola_global66_clp", "cartola_global66_usd"] as const;
export type FileType = typeof fileTypeEnum[number];

export const uploadedFiles = pgTable("uploaded_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileType: text("file_type").notNull().$type<FileType>(),
  originalFilename: text("original_filename").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  rowCount: integer("row_count").notNull().default(0),
  status: text("status").notNull().default("processed"),
  headers: text("headers").array(),
  data: jsonb("data"),
}, (table) => [
  index("uploaded_files_file_type_idx").on(table.fileType),
]);

export const insertUploadedFileSchema = createInsertSchema(uploadedFiles).omit({
  id: true,
  uploadedAt: true,
});

export type InsertUploadedFile = z.infer<typeof insertUploadedFileSchema>;
export type UploadedFile = typeof uploadedFiles.$inferSelect;

export const CENTROS_DE_COSTOS = [
  "C-MARKETING Y PUBLICIDAD",
  "C-TELEFONO",
  "C-SUELDOS",
  "C-IMPORTACION",
  "C-REGISTRO",
  "C-LIBRERÍA",
  "C-IVA - PPM",
  "C-BODEGA",
  "C-ENVIOS",
  "C-GASTOS RELACIONADOS POR LA SOCIEDAD",
  "C-SISTEMA DE FACTURACION",
  "C-PATENTE",
  "C-PRESTAMOS",
  "C-VENTA",
  "C-GASTOS BANCARIOS",
  "C-MUESTRAS CLIENTES",
  "C-PRODUCTOS NUEVOS",
  "C-ETIQUETAS",
  "C-VIATICOS - BENCINA - PEAJES",
  "C-ASESORIAS",
  "C-IMPUESTO A LA RENTA",
  "C-VARIOS AYUDA",
  "C-OTRAS DEVOLUCIONES",
  "C-MATERIALES",
  "C-FERIAS",
  "C-DEVOLUCION DE PRESTAMOS",
] as const;

export type CentroCostos = typeof CENTROS_DE_COSTOS[number];

export const centroCostosRules = pgTable("centro_costos_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pattern: text("pattern").notNull(),
  centroCostos: text("centro_costos").notNull(),
  matchType: text("match_type").notNull().default("contains"),
  priority: integer("priority").notNull().default(0),
});

export const insertCentroCostosRuleSchema = createInsertSchema(centroCostosRules).omit({
  id: true,
});

export type InsertCentroCostosRule = z.infer<typeof insertCentroCostosRuleSchema>;
export type CentroCostosRule = typeof centroCostosRules.$inferSelect;

export const centroCostosReviews = pgTable("centro_costos_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  movementKey: text("movement_key").notNull().unique(),
  revisado: integer("revisado").notNull().default(0),
  centroCostos: text("centro_costos"),
  nDocumentoOverride: text("n_documento_override"),
  fechaCobroOverride: text("fecha_cobro_override"),
});

export type CentroCostosReview = typeof centroCostosReviews.$inferSelect;

export const facturaReviews = pgTable("factura_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facturaKey: text("factura_key").notNull().unique(),
  estado: text("estado").notNull().default("pendiente"),
  cartolaMovementKey: text("cartola_movement_key"),
});

export type FacturaReview = typeof facturaReviews.$inferSelect;

export const facturaAutoMatchRejections = pgTable("factura_auto_match_rejections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facturaKey: text("factura_key").notNull(),
  cartolaMovementKey: text("cartola_movement_key").notNull(),
  fechaRechazo: timestamp("fecha_rechazo").defaultNow().notNull(),
}, (table) => ({
  uniqFacturaMovement: uniqueIndex("uniq_factura_automatch").on(table.facturaKey, table.cartolaMovementKey),
}));

export type FacturaAutoMatchRejection = typeof facturaAutoMatchRejections.$inferSelect;

export const facturaPropuestas = pgTable("factura_propuestas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facturaKey: text("factura_key").notNull(),
  tipo: text("tipo").notNull(),
  cartolaMovementKey: text("cartola_movement_key"),
  notaManual: text("nota_manual"),
});

export type FacturaPropuesta = typeof facturaPropuestas.$inferSelect;

export const appUsers = pgTable("app_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: text("role").notNull().default("user"),
  status: text("status").notNull().default("invited"),
  invitedBy: text("invited_by"),
  invitedAt: timestamp("invited_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

export type AppUser = typeof appUsers.$inferSelect;
export type InsertAppUser = typeof appUsers.$inferInsert;

export const ventasAmigo = pgTable("ventas_amigo", {
  id: serial("id").primaryKey(),
  fechaRegistro: timestamp("fecha_registro").defaultNow().notNull(),
  fechaCompra: text("fecha_compra").notNull(),
  nombre: text("nombre").notNull(),
  monto: integer("monto").notNull(),
  unidades: integer("unidades").notNull(),
  costoProducto: integer("costo_producto"),
  estado: text("estado").notNull().default("pendiente"),
});

export const insertVentaAmigoSchema = createInsertSchema(ventasAmigo).omit({
  id: true,
  fechaRegistro: true,
});

export type InsertVentaAmigo = z.infer<typeof insertVentaAmigoSchema>;
export type VentaAmigo = typeof ventasAmigo.$inferSelect;

export const discontinuedProducts = pgTable("discontinued_products", {
  sku: text("sku").primaryKey(),
  nombre: text("nombre"),
  fechaDescontinuado: timestamp("fecha_descontinuado").defaultNow().notNull(),
});

export const insertDiscontinuedProductSchema = createInsertSchema(discontinuedProducts).omit({
  fechaDescontinuado: true,
});

export type InsertDiscontinuedProduct = z.infer<typeof insertDiscontinuedProductSchema>;
export type DiscontinuedProduct = typeof discontinuedProducts.$inferSelect;

export const cartolaRows = pgTable("cartola_rows", {
  id: serial("id").primaryKey(),
  uploadedFileId: varchar("uploaded_file_id").notNull().references(() => uploadedFiles.id, { onDelete: "cascade" }),
  fecha: text("fecha").notNull(),
  detalleMovimiento: text("detalle_movimiento").notNull(),
  chequeOCargo: numeric("cheque_o_cargo"),
  depositoOAbono: numeric("deposito_o_abono"),
  saldo: numeric("saldo"),
  doctoNro: text("docto_nro"),
  trn: text("trn"),
  caja: text("caja"),
  sucursal: text("sucursal"),
}, (table) => [
  uniqueIndex("cartola_rows_dedup_idx").on(
    sql`LOWER(${table.fecha})`,
    sql`LOWER(${table.detalleMovimiento})`,
    table.chequeOCargo,
    table.depositoOAbono,
  ),
]);

export type CartolaRow = typeof cartolaRows.$inferSelect;

export const cartolaSecurityRows = pgTable("cartola_security_rows", {
  id: serial("id").primaryKey(),
  uploadedFileId: varchar("uploaded_file_id").notNull().references(() => uploadedFiles.id, { onDelete: "cascade" }),
  fecha: text("fecha").notNull(),
  detalleMovimiento: text("detalle_movimiento").notNull(),
  doctoNro: text("docto_nro"),
  cargo: numeric("cargo"),
  abono: numeric("abono"),
  saldo: numeric("saldo"),
}, (table) => [
  uniqueIndex("cartola_security_rows_dedup_idx").on(
    sql`LOWER(${table.fecha})`,
    sql`LOWER(${table.detalleMovimiento})`,
    table.cargo,
    table.abono,
  ),
]);

export type CartolaSecurityRow = typeof cartolaSecurityRows.$inferSelect;

export const cartolaFalabellaRows = pgTable("cartola_falabella_rows", {
  id: serial("id").primaryKey(),
  uploadedFileId: varchar("uploaded_file_id").notNull().references(() => uploadedFiles.id, { onDelete: "cascade" }),
  fecha: text("fecha").notNull(),
  oficina: text("oficina"),
  nroDoc: text("nro_doc"),
  descripcion: text("descripcion"),
  cargo: numeric("cargo"),
  abono: numeric("abono"),
  saldo: numeric("saldo"),
}, (table) => [
  uniqueIndex("cartola_falabella_rows_dedup_idx").on(
    sql`LOWER(${table.fecha})`,
    sql`LOWER(${table.descripcion})`,
    table.cargo,
    table.abono,
  ),
]);

export type CartolaFalabellaRow = typeof cartolaFalabellaRows.$inferSelect;

export const cobranzaRows = pgTable("cobranza_rows", {
  id: serial("id").primaryKey(),
  uploadedFileId: varchar("uploaded_file_id").notNull().references(() => uploadedFiles.id, { onDelete: "cascade" }),
  tipoDocumento: text("tipo_documento"),
  nDocumento: text("n_documento"),
  rutCliente: text("rut_cliente"),
  fechaEmision: text("fecha_emision"),
  montoExento: text("monto_exento"),
  montoNeto: text("monto_neto"),
  montoIva: text("monto_iva"),
  imptoEspecifico: text("impto_especifico"),
  montoTotal: text("monto_total"),
  fechaAcuse: text("fecha_acuse"),
  notificacionComercial: text("notificacion_comercial"),
  fechaNotificacionComercial: text("fecha_notificacion_comercial"),
  xmlRecepcionado: text("xml_recepcionado"),
  estado: text("estado"),
}, (table) => [
  uniqueIndex("cobranza_rows_dedup_idx").on(
    sql`LOWER(${table.tipoDocumento})`,
    sql`LOWER(${table.nDocumento})`,
    sql`LOWER(${table.rutCliente})`,
    sql`LOWER(${table.fechaEmision})`,
  ),
]);

export type CobranzaRow = typeof cobranzaRows.$inferSelect;

export const factVentasRows = pgTable("fact_ventas_rows", {
  id: serial("id").primaryKey(),
  uploadedFileId: varchar("uploaded_file_id").notNull().references(() => uploadedFiles.id, { onDelete: "cascade" }),
  tipoMovimiento: text("tipo_movimiento"),
  tipoDeDocumento: text("tipo_de_documento"),
  numeroDocumento: text("numero_documento"),
  fechaDeEmision: text("fecha_de_emision"),
  trackingNumber: text("tracking_number"),
  fechaVenta: text("fecha_venta"),
  horaVenta: text("hora_venta"),
  sucursal: text("sucursal"),
  vendedor: text("vendedor"),
  nombreCliente: text("nombre_cliente"),
  clienteRut: text("cliente_rut"),
  emailCliente: text("email_cliente"),
  clienteDireccion: text("cliente_direccion"),
  clienteComuna: text("cliente_comuna"),
  clienteCiudad: text("cliente_ciudad"),
  listaDePrecio: text("lista_de_precio"),
  tipoDeEntrega: text("tipo_de_entrega"),
  moneda: text("moneda"),
  tipoDeProductoServicio: text("tipo_de_producto_servicio"),
  sku: text("sku"),
  productoServicio: text("producto_servicio"),
  variante: text("variante"),
  otrosAtributos: text("otros_atributos"),
  marca: text("marca"),
  detallePackPromo: text("detalle_pack_promo"),
  precioDeLista: numeric("precio_de_lista"),
  precioNetoUnitario: numeric("precio_neto_unitario"),
  precioBrutoUnitario: numeric("precio_bruto_unitario"),
  cantidad: numeric("cantidad"),
  ventaTotalNeta: numeric("venta_total_neta"),
  totalImpuestos: numeric("total_impuestos"),
  ventaTotalBruta: numeric("venta_total_bruta"),
  nombreDeDcto: text("nombre_de_dcto"),
  descuentoNeto: numeric("descuento_neto"),
  descuentoBruto: numeric("descuento_bruto"),
  porcentajeDescuento: text("porcentaje_descuento"),
  costoNetoUnitario: numeric("costo_neto_unitario"),
  costoTotalNeto: numeric("costo_total_neto"),
  margen: numeric("margen"),
  porcentajeMargen: text("porcentaje_margen"),
}, (table) => [
  uniqueIndex("fact_ventas_rows_dedup_idx").on(
    sql`LOWER(${table.numeroDocumento})`,
    sql`LOWER(${table.sku})`,
    sql`LOWER(${table.tipoMovimiento})`,
    table.cantidad,
  ),
]);

export type FactVentasRow = typeof factVentasRows.$inferSelect;

export const factComprasRows = pgTable("fact_compras_rows", {
  id: serial("id").primaryKey(),
  uploadedFileId: varchar("uploaded_file_id").notNull().references(() => uploadedFiles.id, { onDelete: "cascade" }),
  folio: text("folio"),
  rut: text("rut"),
  fechaEmision: text("fecha_emision"),
  estado: text("estado"),
  razonSocial: text("razon_social"),
  montoExento: numeric("monto_exento"),
  montoNeto: numeric("monto_neto"),
  montoIva: numeric("monto_iva"),
  imptoEspecifico: numeric("impto_especifico"),
  montoTotal: numeric("monto_total"),
  fechaAcuse: text("fecha_acuse"),
  notificacionComercial: text("notificacion_comercial"),
  fechaNotificacionComercial: text("fecha_notificacion_comercial"),
  xmlRecepcionado: text("xml_recepcionado"),
}, (table) => [
  uniqueIndex("fact_compras_rows_dedup_idx").on(
    sql`LOWER(${table.folio})`,
    sql`LOWER(${table.rut})`,
    sql`LOWER(${table.fechaEmision})`,
    sql`LOWER(${table.estado})`,
  ),
]);

export type FactComprasRow = typeof factComprasRows.$inferSelect;

export const stockRows = pgTable("stock_rows", {
  id: serial("id").primaryKey(),
  uploadedFileId: varchar("uploaded_file_id").notNull().references(() => uploadedFiles.id, { onDelete: "cascade" }),
  sku: text("sku").notNull(),
  producto: text("producto"),
  stockDate: text("stock_date").notNull(),
  extraData: jsonb("extra_data"),
}, (table) => [
  uniqueIndex("stock_rows_dedup_idx").on(
    sql`LOWER(${table.sku})`,
    sql`LOWER(${table.stockDate})`,
  ),
]);

export type StockRow = typeof stockRows.$inferSelect;

export const cartolaGlobal66ClpRows = pgTable("cartola_global66_clp_rows", {
  id: serial("id").primaryKey(),
  uploadedFileId: varchar("uploaded_file_id").notNull().references(() => uploadedFiles.id, { onDelete: "cascade" }),
  fecha: text("fecha").notNull(),
  descripcion: text("descripcion"),
  movimiento: text("movimiento"),
  debito: numeric("debito"),
  abono: numeric("abono"),
  saldo: numeric("saldo"),
}, (table) => [
  uniqueIndex("global66_clp_rows_dedup_idx").on(
    table.fecha,
    sql`LOWER(COALESCE(${table.descripcion}, ''))`,
    sql`COALESCE(${table.debito}::text, '0')`,
    sql`COALESCE(${table.abono}::text, '0')`,
  ),
]);

export const clientes = pgTable("clientes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nombre: text("nombre").notNull(),
  razonSocial: text("razon_social"),
  rut: text("rut"),
  emails: text("emails").array().notNull().default(sql`ARRAY[]::text[]`),
  telefono: text("telefono"),
  nombreContacto: text("nombre_contacto"),
  notas: text("notas"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("clientes_rut_idx").on(table.rut),
  index("clientes_nombre_idx").on(table.nombre),
]);

export const insertClienteSchema = createInsertSchema(clientes).omit({
  id: true,
  createdAt: true,
});

export type InsertCliente = z.infer<typeof insertClienteSchema>;
export type Cliente = typeof clientes.$inferSelect;

export const emailLogs = pgTable("email_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facturaKey: text("factura_key").notNull(),
  clienteId: varchar("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
  destinatarios: text("destinatarios").array().notNull().default(sql`ARRAY[]::text[]`),
  asunto: text("asunto").notNull(),
  template: text("template").notNull().default("cobranza"),
  cuerpo: text("cuerpo"),
  enviadoAt: timestamp("enviado_at").defaultNow().notNull(),
});

export const insertEmailLogSchema = createInsertSchema(emailLogs).omit({
  id: true,
  enviadoAt: true,
});

export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;
export type EmailLog = typeof emailLogs.$inferSelect;

export const cartolaGlobal66UsdRows = pgTable("cartola_global66_usd_rows", {
  id: serial("id").primaryKey(),
  uploadedFileId: varchar("uploaded_file_id").notNull().references(() => uploadedFiles.id, { onDelete: "cascade" }),
  fecha: text("fecha").notNull(),
  descripcion: text("descripcion"),
  movimiento: text("movimiento"),
  debito: numeric("debito"),
  abono: numeric("abono"),
  saldo: numeric("saldo"),
}, (table) => [
  uniqueIndex("global66_usd_rows_dedup_idx").on(
    table.fecha,
    sql`LOWER(COALESCE(${table.descripcion}, ''))`,
    sql`COALESCE(${table.debito}::text, '0')`,
    sql`COALESCE(${table.abono}::text, '0')`,
  ),
]);
