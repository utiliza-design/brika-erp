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

## Usuarios de Prueba (Desarrollo únicamente)

> [!WARNING]
> Los siguientes usuarios de prueba fueron creados localmente en MariaDB para validar la autenticación local (Tarea 4). **Bajo ninguna circunstancia** deben ser importados o creados en el entorno de producción:
> * `test@brika.cl` (contraseña: `testpassword` - cuenta administradora de prueba)
> * `nullpass@brika.cl` (sin contraseña - cuenta de prueba para validación de robustez de nulos)

> [!CAUTION]
> Durante la importación de datos reales de producción (Tarea 3), a los siguientes 4 usuarios reales de la tabla `app_users` **se les asigna una contraseña local de desarrollo (`testlocal123`)** para permitir pruebas locales. **En el entorno de producción final, estas cuentas deben permanecer sin contraseña de test local**:
> * `naty@buscalibre.com`
> * `natalia@brikaorganics.cl`
> * `colorina00@gmail.com`
> * `natyjelen@gmail.com`

## Notas de Despliegue y Construcción en Servidor Compartido (v2nets)

> [!IMPORTANT]
> El servidor `v2nets` es un hosting compartido gestionado por CloudLinux con límites estrictos de LVE (Límites de Procesos Virtuales y Hilos por usuario). 

### 1. Construcción del Proyecto
Para evitar fallos por creación excesiva de hilos del runtime de Go utilizado por `esbuild` (`runtime: failed to create new OS thread`), la compilación de producción debe ejecutarse limitando el paralelismo de Go:
```bash
source /opt/alt/alt-nodejs20/enable
GOMAXPROCS=1 npm run build
```
De omitirse `GOMAXPROCS=1`, el compilador excederá el límite de procesos del LVE (Límites de Usuario de CloudLinux) y el proceso de compilación fallará con `exit code 1` (error de creación de hilos).

### 2. Carga de Variables de Entorno en Producción
El código fuente **no utiliza `dotenv`** en runtime, sino que asume que las variables de entorno ya están cargadas en `process.env` (en desarrollo local se inicia con `--env-file=.env` nativo de Node.js).
Para producción en cPanel (Phusion Passenger):
* **Opción Recomendada:** Cargar las variables de entorno (`DATABASE_URL`, `SESSION_SECRET`, `BSALE_ACCESS_TOKEN`, `NODE_ENV=production`) directamente en la sección de **Variables de Entorno** dentro del panel de configuración **"Setup Node.js App"** de cPanel. Passenger inyecta automáticamente estas variables en el proceso de Node.js.

