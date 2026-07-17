CREATE TABLE `app_users` (
	`id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`name` varchar(255),
	`role` varchar(50) NOT NULL DEFAULT 'user',
	`status` varchar(50) NOT NULL DEFAULT 'invited',
	`invited_by` varchar(255),
	`invited_at` timestamp DEFAULT (now()),
	`last_login_at` timestamp,
	`password` varchar(255),
	CONSTRAINT `app_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `cartola_falabella_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploaded_file_id` varchar(36) NOT NULL,
	`fecha` varchar(50) NOT NULL,
	`oficina` varchar(100),
	`nro_doc` varchar(100),
	`descripcion` varchar(512) NOT NULL DEFAULT '',
	`cargo` decimal(15,2) NOT NULL DEFAULT '0.00',
	`abono` decimal(15,2) NOT NULL DEFAULT '0.00',
	`saldo` decimal(15,2) NOT NULL DEFAULT '0.00',
	CONSTRAINT `cartola_falabella_rows_id` PRIMARY KEY(`id`),
	CONSTRAINT `cartola_falabella_rows_dedup_idx` UNIQUE(`fecha`,`descripcion`,`cargo`,`abono`)
);
--> statement-breakpoint
CREATE TABLE `cartola_global66_clp_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploaded_file_id` varchar(36) NOT NULL,
	`fecha` varchar(50) NOT NULL,
	`descripcion` varchar(512) NOT NULL DEFAULT '',
	`movimiento` varchar(100),
	`debito` decimal(15,2) NOT NULL DEFAULT '0.00',
	`abono` decimal(15,2) NOT NULL DEFAULT '0.00',
	`saldo` decimal(15,2),
	CONSTRAINT `cartola_global66_clp_rows_id` PRIMARY KEY(`id`),
	CONSTRAINT `global66_clp_rows_dedup_idx` UNIQUE(`fecha`,`descripcion`,`debito`,`abono`)
);
--> statement-breakpoint
CREATE TABLE `cartola_global66_usd_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploaded_file_id` varchar(36) NOT NULL,
	`fecha` varchar(50) NOT NULL,
	`descripcion` varchar(512) NOT NULL DEFAULT '',
	`movimiento` varchar(100),
	`debito` decimal(15,2) NOT NULL DEFAULT '0.00',
	`abono` decimal(15,2) NOT NULL DEFAULT '0.00',
	`saldo` decimal(15,2),
	CONSTRAINT `cartola_global66_usd_rows_id` PRIMARY KEY(`id`),
	CONSTRAINT `global66_usd_rows_dedup_idx` UNIQUE(`fecha`,`descripcion`,`debito`,`abono`)
);
--> statement-breakpoint
CREATE TABLE `cartola_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploaded_file_id` varchar(36) NOT NULL,
	`fecha` varchar(50) NOT NULL,
	`detalle_movimiento` varchar(512) NOT NULL,
	`cheque_o_cargo` decimal(15,2) NOT NULL DEFAULT '0.00',
	`deposito_o_abono` decimal(15,2) NOT NULL DEFAULT '0.00',
	`saldo` decimal(15,2) NOT NULL DEFAULT '0.00',
	`docto_nro` varchar(100),
	`trn` varchar(100),
	`caja` varchar(100),
	`sucursal` varchar(100),
	CONSTRAINT `cartola_rows_id` PRIMARY KEY(`id`),
	CONSTRAINT `cartola_rows_dedup_idx` UNIQUE(`fecha`,`detalle_movimiento`,`cheque_o_cargo`,`deposito_o_abono`)
);
--> statement-breakpoint
CREATE TABLE `cartola_security_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploaded_file_id` varchar(36) NOT NULL,
	`fecha` varchar(50) NOT NULL,
	`detalle_movimiento` varchar(512) NOT NULL,
	`docto_nro` varchar(100),
	`cargo` decimal(15,2) NOT NULL DEFAULT '0.00',
	`abono` decimal(15,2) NOT NULL DEFAULT '0.00',
	`saldo` decimal(15,2) NOT NULL DEFAULT '0.00',
	CONSTRAINT `cartola_security_rows_id` PRIMARY KEY(`id`),
	CONSTRAINT `cartola_security_rows_dedup_idx` UNIQUE(`fecha`,`detalle_movimiento`,`cargo`,`abono`)
);
--> statement-breakpoint
CREATE TABLE `centro_costos_reviews` (
	`id` varchar(36) NOT NULL,
	`movement_key` varchar(255) NOT NULL,
	`revisado` int NOT NULL DEFAULT 0,
	`centro_costos` varchar(255),
	`n_documento_override` varchar(100),
	`fecha_cobro_override` varchar(100),
	CONSTRAINT `centro_costos_reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `centro_costos_reviews_movement_key_unique` UNIQUE(`movement_key`)
);
--> statement-breakpoint
CREATE TABLE `centro_costos_rules` (
	`id` varchar(36) NOT NULL,
	`pattern` varchar(255) NOT NULL,
	`centro_costos` varchar(255) NOT NULL,
	`match_type` varchar(50) NOT NULL DEFAULT 'contains',
	`priority` int NOT NULL DEFAULT 0,
	CONSTRAINT `centro_costos_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clientes` (
	`id` varchar(36) NOT NULL,
	`nombre` varchar(255) NOT NULL,
	`razon_social` varchar(255),
	`rut` varchar(50),
	`emails` json NOT NULL,
	`telefono` varchar(50),
	`nombre_contacto` varchar(255),
	`notas` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `clientes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cobranza_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploaded_file_id` varchar(36) NOT NULL,
	`tipo_documento` varchar(100) NOT NULL DEFAULT '',
	`n_documento` varchar(100) NOT NULL DEFAULT '',
	`rut_cliente` varchar(50) NOT NULL DEFAULT '',
	`fecha_emision` varchar(50) NOT NULL DEFAULT '',
	`monto_exento` varchar(50),
	`monto_neto` varchar(50),
	`monto_iva` varchar(50),
	`impto_especifico` varchar(50),
	`monto_total` varchar(50),
	`fecha_acuse` varchar(50),
	`notificacion_comercial` varchar(255),
	`fecha_notificacion_comercial` varchar(50),
	`xml_recepcionado` varchar(50),
	`estado` varchar(50),
	CONSTRAINT `cobranza_rows_id` PRIMARY KEY(`id`),
	CONSTRAINT `cobranza_rows_dedup_idx` UNIQUE(`tipo_documento`,`n_documento`,`rut_cliente`,`fecha_emision`)
);
--> statement-breakpoint
CREATE TABLE `discontinued_products` (
	`sku` varchar(100) NOT NULL,
	`nombre` varchar(255),
	`fecha_descontinuado` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `discontinued_products_sku` PRIMARY KEY(`sku`)
);
--> statement-breakpoint
CREATE TABLE `email_logs` (
	`id` varchar(36) NOT NULL,
	`factura_key` varchar(255) NOT NULL,
	`cliente_id` varchar(36),
	`destinatarios` json NOT NULL,
	`asunto` varchar(255) NOT NULL,
	`template` varchar(50) NOT NULL DEFAULT 'cobranza',
	`cuerpo` text,
	`enviado_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fact_compras_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploaded_file_id` varchar(36) NOT NULL,
	`folio` varchar(100) NOT NULL DEFAULT '',
	`rut` varchar(50) NOT NULL DEFAULT '',
	`fecha_emision` varchar(50) NOT NULL DEFAULT '',
	`estado` varchar(50) NOT NULL DEFAULT '',
	`razon_social` varchar(255),
	`monto_exento` decimal(15,2),
	`monto_neto` decimal(15,2),
	`monto_iva` decimal(15,2),
	`impto_especifico` decimal(15,2),
	`monto_total` decimal(15,2),
	`fecha_acuse` varchar(50),
	`notificacion_comercial` varchar(255),
	`fecha_notificacion_comercial` varchar(50),
	`xml_recepcionado` varchar(50),
	CONSTRAINT `fact_compras_rows_id` PRIMARY KEY(`id`),
	CONSTRAINT `fact_compras_rows_dedup_idx` UNIQUE(`folio`,`rut`,`fecha_emision`,`estado`)
);
--> statement-breakpoint
CREATE TABLE `fact_ventas_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploaded_file_id` varchar(36) NOT NULL,
	`tipo_movimiento` varchar(100) NOT NULL DEFAULT '',
	`tipo_de_documento` varchar(100),
	`numero_documento` varchar(100) NOT NULL DEFAULT '',
	`fecha_de_emision` varchar(50),
	`tracking_number` varchar(100),
	`fecha_venta` varchar(50),
	`hora_venta` varchar(50),
	`sucursal` varchar(100),
	`vendedor` varchar(100),
	`nombre_cliente` varchar(255),
	`cliente_rut` varchar(50),
	`email_cliente` varchar(255),
	`cliente_direccion` varchar(255),
	`cliente_comuna` varchar(100),
	`cliente_ciudad` varchar(100),
	`lista_de_precio` varchar(100),
	`tipo_de_entrega` varchar(100),
	`moneda` varchar(50),
	`tipo_de_producto_servicio` varchar(100),
	`sku` varchar(100) NOT NULL DEFAULT '',
	`producto_servicio` varchar(255),
	`variante` varchar(100),
	`otros_atributos` varchar(255),
	`marca` varchar(100),
	`detalle_pack_promo` varchar(512),
	`precio_de_lista` decimal(15,2),
	`precio_neto_unitario` decimal(15,2),
	`precio_bruto_unitario` decimal(15,2),
	`cantidad` decimal(15,2) NOT NULL DEFAULT '0.00',
	`venta_total_neta` decimal(15,2),
	`total_impuestos` decimal(15,2),
	`venta_total_bruta` decimal(15,2),
	`nombre_de_dcto` varchar(100),
	`descuento_neto` decimal(15,2),
	`descuento_bruto` decimal(15,2),
	`porcentaje_descuento` varchar(50),
	`costo_neto_unitario` decimal(15,2),
	`costo_total_neto` decimal(15,2),
	`margen` decimal(15,2),
	`porcentaje_margen` varchar(50),
	CONSTRAINT `fact_ventas_rows_id` PRIMARY KEY(`id`),
	CONSTRAINT `fact_ventas_rows_dedup_idx` UNIQUE(`numero_documento`,`sku`,`tipo_movimiento`,`cantidad`)
);
--> statement-breakpoint
CREATE TABLE `factura_auto_match_rejections` (
	`id` varchar(36) NOT NULL,
	`factura_key` varchar(255) NOT NULL,
	`cartola_movement_key` varchar(255) NOT NULL,
	`fecha_rechazo` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `factura_auto_match_rejections_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_factura_automatch` UNIQUE(`factura_key`,`cartola_movement_key`)
);
--> statement-breakpoint
CREATE TABLE `factura_propuestas` (
	`id` varchar(36) NOT NULL,
	`factura_key` varchar(255) NOT NULL,
	`tipo` varchar(50) NOT NULL,
	`cartola_movement_key` varchar(255),
	`nota_manual` varchar(1024),
	CONSTRAINT `factura_propuestas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `factura_reviews` (
	`id` varchar(36) NOT NULL,
	`factura_key` varchar(255) NOT NULL,
	`estado` varchar(50) NOT NULL DEFAULT 'pendiente',
	`cartola_movement_key` varchar(255),
	CONSTRAINT `factura_reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `factura_reviews_factura_key_unique` UNIQUE(`factura_key`)
);
--> statement-breakpoint
CREATE TABLE `stock_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploaded_file_id` varchar(36) NOT NULL,
	`sku` varchar(100) NOT NULL,
	`producto` varchar(255),
	`stock_date` varchar(50) NOT NULL,
	`extra_data` json,
	CONSTRAINT `stock_rows_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_rows_dedup_idx` UNIQUE(`sku`,`stock_date`)
);
--> statement-breakpoint
CREATE TABLE `uploaded_files` (
	`id` varchar(36) NOT NULL,
	`file_type` varchar(50) NOT NULL,
	`original_filename` varchar(255) NOT NULL,
	`uploaded_at` timestamp NOT NULL DEFAULT (now()),
	`row_count` int NOT NULL DEFAULT 0,
	`status` varchar(50) NOT NULL DEFAULT 'processed',
	`headers` json,
	`data` json,
	CONSTRAINT `uploaded_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ventas_amigo` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fecha_registro` timestamp NOT NULL DEFAULT (now()),
	`fecha_compra` varchar(50) NOT NULL,
	`nombre` varchar(255) NOT NULL,
	`monto` int NOT NULL,
	`unidades` int NOT NULL,
	`costo_producto` int,
	`estado` varchar(50) NOT NULL DEFAULT 'pendiente',
	CONSTRAINT `ventas_amigo_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`email` varchar(255),
	`first_name` varchar(255),
	`last_name` varchar(255),
	`profile_image_url` varchar(512),
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE INDEX `clientes_rut_idx` ON `clientes` (`rut`);--> statement-breakpoint
CREATE INDEX `clientes_nombre_idx` ON `clientes` (`nombre`);--> statement-breakpoint
CREATE INDEX `uploaded_files_file_type_idx` ON `uploaded_files` (`file_type`);