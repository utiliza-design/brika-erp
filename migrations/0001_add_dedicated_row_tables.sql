CREATE TABLE IF NOT EXISTS "cartola_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"uploaded_file_id" varchar NOT NULL,
	"fecha" text NOT NULL,
	"detalle_movimiento" text NOT NULL,
	"cheque_o_cargo" numeric,
	"deposito_o_abono" numeric,
	"saldo" numeric,
	"docto_nro" text,
	"trn" text,
	"caja" text,
	"sucursal" text
);
--> statement-breakpoint
ALTER TABLE "cartola_rows" ADD CONSTRAINT "cartola_rows_uploaded_file_id_uploaded_files_id_fk" FOREIGN KEY ("uploaded_file_id") REFERENCES "public"."uploaded_files"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cartola_rows_dedup_idx" ON "cartola_rows" USING btree (LOWER("fecha"), LOWER("detalle_movimiento"), "cheque_o_cargo", "deposito_o_abono");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cartola_security_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"uploaded_file_id" varchar NOT NULL,
	"fecha" text NOT NULL,
	"detalle_movimiento" text NOT NULL,
	"docto_nro" text,
	"cargo" numeric,
	"abono" numeric,
	"saldo" numeric
);
--> statement-breakpoint
ALTER TABLE "cartola_security_rows" ADD CONSTRAINT "cartola_security_rows_uploaded_file_id_uploaded_files_id_fk" FOREIGN KEY ("uploaded_file_id") REFERENCES "public"."uploaded_files"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cartola_security_rows_dedup_idx" ON "cartola_security_rows" USING btree (LOWER("fecha"), LOWER("detalle_movimiento"), "cargo", "abono");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cartola_falabella_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"uploaded_file_id" varchar NOT NULL,
	"fecha" text NOT NULL,
	"oficina" text,
	"nro_doc" text,
	"descripcion" text,
	"cargo" numeric,
	"abono" numeric,
	"saldo" numeric
);
--> statement-breakpoint
ALTER TABLE "cartola_falabella_rows" ADD CONSTRAINT "cartola_falabella_rows_uploaded_file_id_uploaded_files_id_fk" FOREIGN KEY ("uploaded_file_id") REFERENCES "public"."uploaded_files"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cartola_falabella_rows_dedup_idx" ON "cartola_falabella_rows" USING btree (LOWER("fecha"), LOWER("descripcion"), "cargo", "abono");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cobranza_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"uploaded_file_id" varchar NOT NULL,
	"tipo_documento" text,
	"n_documento" text,
	"rut_cliente" text,
	"fecha_emision" text,
	"monto_exento" text,
	"monto_neto" text,
	"monto_iva" text,
	"impto_especifico" text,
	"monto_total" text,
	"fecha_acuse" text,
	"notificacion_comercial" text,
	"fecha_notificacion_comercial" text,
	"xml_recepcionado" text,
	"estado" text
);
--> statement-breakpoint
ALTER TABLE "cobranza_rows" ADD CONSTRAINT "cobranza_rows_uploaded_file_id_uploaded_files_id_fk" FOREIGN KEY ("uploaded_file_id") REFERENCES "public"."uploaded_files"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cobranza_rows_dedup_idx" ON "cobranza_rows" USING btree (LOWER("tipo_documento"), LOWER("n_documento"), LOWER("rut_cliente"), LOWER("fecha_emision"));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fact_ventas_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"uploaded_file_id" varchar NOT NULL,
	"tipo_movimiento" text,
	"tipo_de_documento" text,
	"numero_documento" text,
	"fecha_de_emision" text,
	"tracking_number" text,
	"fecha_venta" text,
	"hora_venta" text,
	"sucursal" text,
	"vendedor" text,
	"nombre_cliente" text,
	"cliente_rut" text,
	"email_cliente" text,
	"cliente_direccion" text,
	"cliente_comuna" text,
	"cliente_ciudad" text,
	"lista_de_precio" text,
	"tipo_de_entrega" text,
	"moneda" text,
	"tipo_de_producto_servicio" text,
	"sku" text,
	"producto_servicio" text,
	"variante" text,
	"otros_atributos" text,
	"marca" text,
	"detalle_pack_promo" text,
	"precio_de_lista" numeric,
	"precio_neto_unitario" numeric,
	"precio_bruto_unitario" numeric,
	"cantidad" numeric,
	"venta_total_neta" numeric,
	"total_impuestos" numeric,
	"venta_total_bruta" numeric,
	"nombre_de_dcto" text,
	"descuento_neto" numeric,
	"descuento_bruto" numeric,
	"porcentaje_descuento" text,
	"costo_neto_unitario" numeric,
	"costo_total_neto" numeric,
	"margen" numeric,
	"porcentaje_margen" text
);
--> statement-breakpoint
ALTER TABLE "fact_ventas_rows" ADD CONSTRAINT "fact_ventas_rows_uploaded_file_id_uploaded_files_id_fk" FOREIGN KEY ("uploaded_file_id") REFERENCES "public"."uploaded_files"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fact_ventas_rows_dedup_idx" ON "fact_ventas_rows" USING btree (LOWER("numero_documento"), LOWER("sku"), LOWER("tipo_movimiento"), "cantidad");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fact_compras_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"uploaded_file_id" varchar NOT NULL,
	"folio" text,
	"rut" text,
	"fecha_emision" text,
	"estado" text,
	"razon_social" text,
	"monto_exento" numeric,
	"monto_neto" numeric,
	"monto_iva" numeric,
	"impto_especifico" numeric,
	"monto_total" numeric,
	"fecha_acuse" text,
	"notificacion_comercial" text,
	"fecha_notificacion_comercial" text,
	"xml_recepcionado" text
);
--> statement-breakpoint
ALTER TABLE "fact_compras_rows" ADD CONSTRAINT "fact_compras_rows_uploaded_file_id_uploaded_files_id_fk" FOREIGN KEY ("uploaded_file_id") REFERENCES "public"."uploaded_files"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fact_compras_rows_dedup_idx" ON "fact_compras_rows" USING btree (LOWER("folio"), LOWER("rut"), LOWER("fecha_emision"), LOWER("estado"));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"uploaded_file_id" varchar NOT NULL,
	"sku" text NOT NULL,
	"producto" text,
	"stock_date" text NOT NULL,
	"extra_data" jsonb
);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD CONSTRAINT "stock_rows_uploaded_file_id_uploaded_files_id_fk" FOREIGN KEY ("uploaded_file_id") REFERENCES "public"."uploaded_files"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stock_rows_dedup_idx" ON "stock_rows" USING btree (LOWER("sku"), LOWER("stock_date"));
