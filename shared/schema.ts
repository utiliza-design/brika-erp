import { sql } from "drizzle-orm";
import { mysqlTable, varchar, integer, timestamp, json, int, decimal, uniqueIndex, index, text } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const fileTypeEnum = ["cartola", "cobranza", "fact_ventas", "fact_ventas_bsale", "fact_compras", "cartola_security", "cartola_falabella", "cartola_global66_clp", "cartola_global66_usd"] as const;
export type FileType = typeof fileTypeEnum[number];

export const uploadedFiles = mysqlTable("uploaded_files", {
  id: varchar("id", { length: 36 }).primaryKey(),
  fileType: varchar("file_type", { length: 50 }).notNull().$type<FileType>(),
  originalFilename: varchar("original_filename", { length: 255 }).notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  rowCount: integer("row_count").notNull().default(0),
  status: varchar("status", { length: 50 }).notNull().default("processed"),
  headers: json("headers").$type<string[]>(),
  data: json("data"),
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

export const centroCostosRules = mysqlTable("centro_costos_rules", {
  id: varchar("id", { length: 36 }).primaryKey(),
  pattern: varchar("pattern", { length: 255 }).notNull(),
  centroCostos: varchar("centro_costos", { length: 255 }).notNull(),
  matchType: varchar("match_type", { length: 50 }).notNull().default("contains"),
  priority: integer("priority").notNull().default(0),
});

export const insertCentroCostosRuleSchema = createInsertSchema(centroCostosRules).omit({
  id: true,
});

export type InsertCentroCostosRule = z.infer<typeof insertCentroCostosRuleSchema>;
export type CentroCostosRule = typeof centroCostosRules.$inferSelect;

export const centroCostosReviews = mysqlTable("centro_costos_reviews", {
  id: varchar("id", { length: 36 }).primaryKey(),
  movementKey: varchar("movement_key", { length: 255 }).notNull().unique(),
  revisado: integer("revisado").notNull().default(0),
  centroCostos: varchar("centro_costos", { length: 255 }),
  nDocumentoOverride: varchar("n_documento_override", { length: 100 }),
  fechaCobroOverride: varchar("fecha_cobro_override", { length: 100 }),
});

export type CentroCostosReview = typeof centroCostosReviews.$inferSelect;

export const facturaReviews = mysqlTable("factura_reviews", {
  id: varchar("id", { length: 36 }).primaryKey(),
  facturaKey: varchar("factura_key", { length: 255 }).notNull().unique(),
  estado: varchar("estado", { length: 50 }).notNull().default("pendiente"),
  cartolaMovementKey: varchar("cartola_movement_key", { length: 255 }),
});

export type FacturaReview = typeof facturaReviews.$inferSelect;

export const facturaAutoMatchRejections = mysqlTable("factura_auto_match_rejections", {
  id: varchar("id", { length: 36 }).primaryKey(),
  facturaKey: varchar("factura_key", { length: 255 }).notNull(),
  cartolaMovementKey: varchar("cartola_movement_key", { length: 255 }).notNull(),
  fechaRechazo: timestamp("fecha_rechazo").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uniq_factura_automatch").on(table.facturaKey, table.cartolaMovementKey),
]);

export type FacturaAutoMatchRejection = typeof facturaAutoMatchRejections.$inferSelect;

export const facturaPropuestas = mysqlTable("factura_propuestas", {
  id: varchar("id", { length: 36 }).primaryKey(),
  facturaKey: varchar("factura_key", { length: 255 }).notNull(),
  tipo: varchar("tipo", { length: 50 }).notNull(),
  cartolaMovementKey: varchar("cartola_movement_key", { length: 255 }),
  notaManual: varchar("nota_manual", { length: 1024 }),
});

export type FacturaPropuesta = typeof facturaPropuestas.$inferSelect;

export const appUsers = mysqlTable("app_users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  role: varchar("role", { length: 50 }).notNull().default("user"),
  status: varchar("status", { length: 50 }).notNull().default("invited"),
  invitedBy: varchar("invited_by", { length: 255 }),
  invitedAt: timestamp("invited_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

export type AppUser = typeof appUsers.$inferSelect;
export type InsertAppUser = typeof appUsers.$inferInsert;

export const ventasAmigo = mysqlTable("ventas_amigo", {
  id: int("id").primaryKey().autoincrement(),
  fechaRegistro: timestamp("fecha_registro").defaultNow().notNull(),
  fechaCompra: varchar("fecha_compra", { length: 50 }).notNull(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  monto: integer("monto").notNull(),
  unidades: integer("unidades").notNull(),
  costoProducto: integer("costo_producto"),
  estado: varchar("estado", { length: 50 }).notNull().default("pendiente"),
});

export const insertVentaAmigoSchema = createInsertSchema(ventasAmigo).omit({
  id: true,
  fechaRegistro: true,
});

export type InsertVentaAmigo = z.infer<typeof insertVentaAmigoSchema>;
export type VentaAmigo = typeof ventasAmigo.$inferSelect;

export const discontinuedProducts = mysqlTable("discontinued_products", {
  sku: varchar("sku", { length: 100 }).primaryKey(),
  nombre: varchar("nombre", { length: 255 }),
  fechaDescontinuado: timestamp("fecha_descontinuado").defaultNow().notNull(),
});

export const insertDiscontinuedProductSchema = createInsertSchema(discontinuedProducts).omit({
  fechaDescontinuado: true,
});

export type InsertSampleProduct = z.infer<typeof insertDiscontinuedProductSchema>;
export type DiscontinuedProduct = typeof discontinuedProducts.$inferSelect;

export const cartolaRows = mysqlTable("cartola_rows", {
  id: int("id").primaryKey().autoincrement(),
  uploadedFileId: varchar("uploaded_file_id", { length: 36 }).notNull(),
  fecha: varchar("fecha", { length: 50 }).notNull(),
  detalleMovimiento: varchar("detalle_movimiento", { length: 512 }).notNull(),
  chequeOCargo: decimal("cheque_o_cargo", { precision: 15, scale: 2 }).notNull().default("0.00"),
  depositoOAbono: decimal("deposito_o_abono", { precision: 15, scale: 2 }).notNull().default("0.00"),
  saldo: decimal("saldo", { precision: 15, scale: 2 }).notNull().default("0.00"),
  doctoNro: varchar("docto_nro", { length: 100 }),
  trn: varchar("trn", { length: 100 }),
  caja: varchar("caja", { length: 100 }),
  sucursal: varchar("sucursal", { length: 100 }),
}, (table) => [
  uniqueIndex("cartola_rows_dedup_idx").on(
    table.fecha,
    table.detalleMovimiento,
    table.chequeOCargo,
    table.depositoOAbono,
  ),
]);

export type CartolaRow = typeof cartolaRows.$inferSelect;

export const cartolaSecurityRows = mysqlTable("cartola_security_rows", {
  id: int("id").primaryKey().autoincrement(),
  uploadedFileId: varchar("uploaded_file_id", { length: 36 }).notNull(),
  fecha: varchar("fecha", { length: 50 }).notNull(),
  detalleMovimiento: varchar("detalle_movimiento", { length: 512 }).notNull(),
  doctoNro: varchar("docto_nro", { length: 100 }),
  cargo: decimal("cargo", { precision: 15, scale: 2 }).notNull().default("0.00"),
  abono: decimal("abono", { precision: 15, scale: 2 }).notNull().default("0.00"),
  saldo: decimal("saldo", { precision: 15, scale: 2 }).notNull().default("0.00"),
}, (table) => [
  uniqueIndex("cartola_security_rows_dedup_idx").on(
    table.fecha,
    table.detalleMovimiento,
    table.cargo,
    table.abono,
  ),
]);

export type CartolaSecurityRow = typeof cartolaSecurityRows.$inferSelect;

export const cartolaFalabellaRows = mysqlTable("cartola_falabella_rows", {
  id: int("id").primaryKey().autoincrement(),
  uploadedFileId: varchar("uploaded_file_id", { length: 36 }).notNull(),
  fecha: varchar("fecha", { length: 50 }).notNull(),
  oficina: varchar("oficina", { length: 100 }),
  nroDoc: varchar("nro_doc", { length: 100 }),
  descripcion: varchar("descripcion", { length: 512 }).notNull().default(""),
  cargo: decimal("cargo", { precision: 15, scale: 2 }).notNull().default("0.00"),
  abono: decimal("abono", { precision: 15, scale: 2 }).notNull().default("0.00"),
  saldo: decimal("saldo", { precision: 15, scale: 2 }).notNull().default("0.00"),
}, (table) => [
  uniqueIndex("cartola_falabella_rows_dedup_idx").on(
    table.fecha,
    table.descripcion,
    table.cargo,
    table.abono,
  ),
]);

export type CartolaFalabellaRow = typeof cartolaFalabellaRows.$inferSelect;

export const cobranzaRows = mysqlTable("cobranza_rows", {
  id: int("id").primaryKey().autoincrement(),
  uploadedFileId: varchar("uploaded_file_id", { length: 36 }).notNull(),
  tipoDocumento: varchar("tipo_documento", { length: 100 }).notNull().default(""),
  nDocumento: varchar("n_documento", { length: 100 }).notNull().default(""),
  rutCliente: varchar("rut_cliente", { length: 50 }).notNull().default(""),
  fechaEmision: varchar("fecha_emision", { length: 50 }).notNull().default(""),
  montoExento: varchar("monto_exento", { length: 50 }),
  montoNeto: varchar("monto_neto", { length: 50 }),
  montoIva: varchar("monto_iva", { length: 50 }),
  imptoEspecifico: varchar("impto_especifico", { length: 50 }),
  montoTotal: varchar("monto_total", { length: 50 }),
  fechaAcuse: varchar("fecha_acuse", { length: 50 }),
  notificacionComercial: varchar("notificacion_comercial", { length: 255 }),
  fechaNotificacionComercial: varchar("fecha_notificacion_comercial", { length: 50 }),
  xmlRecepcionado: varchar("xml_recepcionado", { length: 50 }),
  estado: varchar("estado", { length: 50 }),
}, (table) => [
  uniqueIndex("cobranza_rows_dedup_idx").on(
    table.tipoDocumento,
    table.nDocumento,
    table.rutCliente,
    table.fechaEmision,
  ),
]);

export type CobranzaRow = typeof cobranzaRows.$inferSelect;

export const factVentasRows = mysqlTable("fact_ventas_rows", {
  id: int("id").primaryKey().autoincrement(),
  uploadedFileId: varchar("uploaded_file_id", { length: 36 }).notNull(),
  tipoMovimiento: varchar("tipo_movimiento", { length: 100 }).notNull().default(""),
  tipoDeDocumento: varchar("tipo_de_documento", { length: 100 }),
  numeroDocumento: varchar("numero_documento", { length: 100 }).notNull().default(""),
  fechaDeEmision: varchar("fecha_de_emision", { length: 50 }),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  fechaVenta: varchar("fecha_venta", { length: 50 }),
  horaVenta: varchar("hora_venta", { length: 50 }),
  sucursal: varchar("sucursal", { length: 100 }),
  vendedor: varchar("vendedor", { length: 100 }),
  nombreCliente: varchar("nombre_cliente", { length: 255 }),
  clienteRut: varchar("cliente_rut", { length: 50 }),
  emailCliente: varchar("email_cliente", { length: 255 }),
  clienteDireccion: varchar("cliente_direccion", { length: 255 }),
  clienteComuna: varchar("cliente_comuna", { length: 100 }),
  clienteCiudad: varchar("cliente_ciudad", { length: 100 }),
  listaDePrecio: varchar("lista_de_precio", { length: 100 }),
  tipoDeEntrega: varchar("tipo_de_entrega", { length: 100 }),
  moneda: varchar("moneda", { length: 50 }),
  tipoDeProductoServicio: varchar("tipo_de_producto_servicio", { length: 100 }),
  sku: varchar("sku", { length: 100 }).notNull().default(""),
  productoServicio: varchar("producto_servicio", { length: 255 }),
  variante: varchar("variante", { length: 100 }),
  otrosAtributos: varchar("otros_atributos", { length: 255 }),
  marca: varchar("marca", { length: 100 }),
  detallePackPromo: varchar("detalle_pack_promo", { length: 512 }),
  precioDeLista: decimal("precio_de_lista", { precision: 15, scale: 2 }),
  precioNetoUnitario: decimal("precio_neto_unitario", { precision: 15, scale: 2 }),
  precioBrutoUnitario: decimal("precio_bruto_unitario", { precision: 15, scale: 2 }),
  cantidad: decimal("cantidad", { precision: 15, scale: 2 }).notNull().default("0.00"),
  ventaTotalNeta: decimal("venta_total_neta", { precision: 15, scale: 2 }),
  totalImpuestos: decimal("total_impuestos", { precision: 15, scale: 2 }),
  ventaTotalBruta: decimal("venta_total_bruta", { precision: 15, scale: 2 }),
  nombreDeDcto: varchar("nombre_de_dcto", { length: 100 }),
  descuentoNeto: decimal("descuento_neto", { precision: 15, scale: 2 }),
  descuentoBruto: decimal("descuento_bruto", { precision: 15, scale: 2 }),
  porcentajeDescuento: varchar("porcentaje_descuento", { length: 50 }),
  costoNetoUnitario: decimal("costo_neto_unitario", { precision: 15, scale: 2 }),
  costoTotalNeto: decimal("costo_total_neto", { precision: 15, scale: 2 }),
  margen: decimal("margen", { precision: 15, scale: 2 }),
  porcentajeMargen: varchar("porcentaje_margen", { length: 50 }),
}, (table) => [
  uniqueIndex("fact_ventas_rows_dedup_idx").on(
    table.numeroDocumento,
    table.sku,
    table.tipoMovimiento,
    table.cantidad,
  ),
]);

export type FactVentasRow = typeof factVentasRows.$inferSelect;

export const factComprasRows = mysqlTable("fact_compras_rows", {
  id: int("id").primaryKey().autoincrement(),
  uploadedFileId: varchar("uploaded_file_id", { length: 36 }).notNull(),
  folio: varchar("folio", { length: 100 }).notNull().default(""),
  rut: varchar("rut", { length: 50 }).notNull().default(""),
  fechaEmision: varchar("fecha_emision", { length: 50 }).notNull().default(""),
  estado: varchar("estado", { length: 50 }).notNull().default(""),
  razonSocial: varchar("razon_social", { length: 255 }),
  montoExento: decimal("monto_exento", { precision: 15, scale: 2 }),
  montoNeto: decimal("monto_neto", { precision: 15, scale: 2 }),
  montoIva: decimal("monto_iva", { precision: 15, scale: 2 }),
  imptoEspecifico: decimal("impto_especifico", { precision: 15, scale: 2 }),
  montoTotal: decimal("monto_total", { precision: 15, scale: 2 }),
  fechaAcuse: varchar("fecha_acuse", { length: 50 }),
  notificacionComercial: varchar("notificacion_comercial", { length: 255 }),
  fechaNotificacionComercial: varchar("fecha_notificacion_comercial", { length: 50 }),
  xmlRecepcionado: varchar("xml_recepcionado", { length: 50 }),
}, (table) => [
  uniqueIndex("fact_compras_rows_dedup_idx").on(
    table.folio,
    table.rut,
    table.fechaEmision,
    table.estado,
  ),
]);

export type FactComprasRow = typeof factComprasRows.$inferSelect;

export const stockRows = mysqlTable("stock_rows", {
  id: int("id").primaryKey().autoincrement(),
  uploadedFileId: varchar("uploaded_file_id", { length: 36 }).notNull(),
  sku: varchar("sku", { length: 100 }).notNull(),
  producto: varchar("producto", { length: 255 }),
  stockDate: varchar("stock_date", { length: 50 }).notNull(),
  extraData: json("extra_data"),
}, (table) => [
  uniqueIndex("stock_rows_dedup_idx").on(
    table.sku,
    table.stockDate,
  ),
]);

export type StockRow = typeof stockRows.$inferSelect;

export const cartolaGlobal66ClpRows = mysqlTable("cartola_global66_clp_rows", {
  id: int("id").primaryKey().autoincrement(),
  uploadedFileId: varchar("uploaded_file_id", { length: 36 }).notNull(),
  fecha: varchar("fecha", { length: 50 }).notNull(),
  descripcion: varchar("descripcion", { length: 512 }).notNull().default(""),
  movimiento: varchar("movimiento", { length: 100 }),
  debito: decimal("debito", { precision: 15, scale: 2 }).notNull().default("0.00"),
  abono: decimal("abono", { precision: 15, scale: 2 }).notNull().default("0.00"),
  saldo: decimal("saldo", { precision: 15, scale: 2 }),
}, (table) => [
  uniqueIndex("global66_clp_rows_dedup_idx").on(
    table.fecha,
    table.descripcion,
    table.debito,
    table.abono,
  ),
]);

export const clientes = mysqlTable("clientes", {
  id: varchar("id", { length: 36 }).primaryKey(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  razonSocial: varchar("razon_social", { length: 255 }),
  rut: varchar("rut", { length: 50 }),
  emails: json("emails").$type<string[]>().notNull(),
  telefono: varchar("telefono", { length: 50 }),
  nombreContacto: varchar("nombre_contacto", { length: 255 }),
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

export const emailLogs = mysqlTable("email_logs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  facturaKey: varchar("factura_key", { length: 255 }).notNull(),
  clienteId: varchar("cliente_id", { length: 36 }),
  destinatarios: json("destinatarios").$type<string[]>().notNull(),
  asunto: varchar("asunto", { length: 255 }).notNull(),
  template: varchar("template", { length: 50 }).notNull().default("cobranza"),
  cuerpo: text("cuerpo"),
  enviadoAt: timestamp("enviado_at").defaultNow().notNull(),
});

export const insertEmailLogSchema = createInsertSchema(emailLogs).omit({
  id: true,
  enviadoAt: true,
});

export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;
export type EmailLog = typeof emailLogs.$inferSelect;

export const cartolaGlobal66UsdRows = mysqlTable("cartola_global66_usd_rows", {
  id: int("id").primaryKey().autoincrement(),
  uploadedFileId: varchar("uploaded_file_id", { length: 36 }).notNull(),
  fecha: varchar("fecha", { length: 50 }).notNull(),
  descripcion: varchar("descripcion", { length: 512 }).notNull().default(""),
  movimiento: varchar("movimiento", { length: 100 }),
  debito: decimal("debito", { precision: 15, scale: 2 }).notNull().default("0.00"),
  abono: decimal("abono", { precision: 15, scale: 2 }).notNull().default("0.00"),
  saldo: decimal("saldo", { precision: 15, scale: 2 }),
}, (table) => [
  uniqueIndex("global66_usd_rows_dedup_idx").on(
    table.fecha,
    table.descripcion,
    table.debito,
    table.abono,
  ),
]);
