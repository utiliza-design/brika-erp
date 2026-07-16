# Notas de Migración de Datos (PostgreSQL → MySQL/MariaDB)

Durante la migración técnica del schema a MySQL/MariaDB, se modificó la definición de varias columnas de `NULLABLE` a `NOT NULL DEFAULT`. Esto se realizó para garantizar que los índices únicos de desduplicación de MySQL detecten correctamente los registros duplicados en sentencias `INSERT IGNORE`, ya que en MySQL los valores `NULL` no disparan la restricción `UNIQUE`.

Al realizar la migración de datos (Tarea 3), se deben convertir de forma explícitamente los valores nulos provenientes de Postgres de la siguiente manera:

## Mapeo de Conversiones

### 1. Conversión de NULL a "" (Cadenas vacías)
* **Tabla `cartola_falabella_rows`**:
  * `descripcion`
* **Tabla `cobranza_rows`**:
  * `tipo_documento`
  * `n_documento`
  * `rut_cliente`
  * `fecha_emision`
* **Tabla `fact_ventas_rows`**:
  * `numero_documento`
  * `sku`
  * `tipo_movimiento`
* **Tabla `fact_compras_rows`**:
  * `folio`
  * `rut`
  * `fecha_emision`
  * `estado`
* **Tablas `cartola_global66_clp_rows` y `cartola_global66_usd_rows`**:
  * `descripcion`

### 2. Conversión de NULL a "0.00" / 0 (Decimales/Numéricos)
* **Tabla `cartola_rows`**:
  * `cheque_o_cargo`
  * `deposito_o_abono`
  * `saldo`
* **Tabla `cartola_security_rows`**:
  * `cargo`
  * `abono`
  * `saldo`
* **Tabla `cartola_falabella_rows`**:
  * `cargo`
  * `abono`
  * `saldo`
* **Tabla `fact_ventas_rows`**:
  * `cantidad`
* **Tablas `cartola_global66_clp_rows` y `cartola_global66_usd_rows`**:
  * `debito`
  * `abono`
