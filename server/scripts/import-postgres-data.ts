import fs from "fs";
import readline from "readline";
import path from "path";
import bcrypt from "bcrypt";
import { db, pool } from "../db";
import {
  uploadedFiles,
  clientes,
  appUsers,
  centroCostosRules,
  discontinuedProducts,
  ventasAmigo,
  cartolaRows,
  cartolaFalabellaRows,
  cartolaGlobal66ClpRows,
  cartolaGlobal66UsdRows,
  cartolaSecurityRows,
  cobranzaRows,
  factComprasRows,
  factVentasRows,
  stockRows,
  centroCostosReviews,
  facturaReviews,
  facturaPropuestas,
  facturaAutoMatchRejections,
  emailLogs,
} from "@shared/schema";
import { insertBatch } from "../db-helpers";

// Función de des-escape estándar del formato Postgres COPY
function unescapePostgresCopy(str: string): string {
  let result = "";
  let i = 0;
  while (i < str.length) {
    if (str[i] === "\\" && i + 1 < str.length) {
      const nextChar = str[i + 1];
      if (nextChar === "n") result += "\n";
      else if (nextChar === "r") result += "\r";
      else if (nextChar === "t") result += "\t";
      else if (nextChar === "b") result += "\b";
      else if (nextChar === "f") result += "\f";
      else result += nextChar; // \" -> ", \\ -> \, etc.
      i += 2;
    } else {
      result += str[i];
      i++;
    }
  }
  return result;
}

// Función para parsear arrays nativos de Postgres (ej. {"email1","email2"}) a JS arrays
function parsePostgresArray(str: string | null): string[] {
  if (!str) return [];
  const clean = str.trim().replace(/^\{|\}$/g, "");
  if (!clean) return [];
  return clean.split(",").map(item => {
    // Preservar elementos tal cual, removiendo comillas externas
    return item.replace(/^"|"$/g, "");
  });
}

// Mapeo lógico de tablas para Drizzle
const drizzleTables: Record<string, any> = {
  uploaded_files: uploadedFiles,
  clientes: clientes,
  app_users: appUsers,
  centro_costos_rules: centroCostosRules,
  discontinued_products: discontinuedProducts,
  ventas_amigo: ventasAmigo,
  cartola_rows: cartolaRows,
  cartola_falabella_rows: cartolaFalabellaRows,
  cartola_global66_clp_rows: cartolaGlobal66ClpRows,
  cartola_global66_usd_rows: cartolaGlobal66UsdRows,
  cartola_security_rows: cartolaSecurityRows,
  cobranza_rows: cobranzaRows,
  fact_compras_rows: factComprasRows,
  fact_ventas_rows: factVentasRows,
  stock_rows: stockRows,
  centro_costos_reviews: centroCostosReviews,
  factura_reviews: facturaReviews,
  factura_propuestas: facturaPropuestas,
  factura_auto_match_rejections: facturaAutoMatchRejections,
  email_logs: emailLogs,
};

// Orden de importación respetando dependencias
const importOrder = [
  "uploaded_files",
  "clientes",
  "app_users",
  "centro_costos_rules",
  "discontinued_products",
  "ventas_amigo",
  "cartola_rows",
  "cartola_falabella_rows",
  "cartola_global66_clp_rows",
  "cartola_global66_usd_rows",
  "cartola_security_rows",
  "cobranza_rows",
  "fact_compras_rows",
  "fact_ventas_rows",
  "stock_rows",
  "centro_costos_reviews",
  "factura_reviews",
  "factura_propuestas",
  "factura_auto_match_rejections",
  "email_logs",
];

async function main() {
  const dumpPath = process.argv[2];
  if (!dumpPath) {
    console.error("Uso: npx tsx server/scripts/import-postgres-data.ts <ruta_al_dump.sql>");
    process.exit(1);
  }

  if (!fs.existsSync(dumpPath)) {
    console.error(`El archivo no existe en la ruta: ${dumpPath}`);
    process.exit(1);
  }

  console.log("Iniciando parseo del dump de Postgres...");
  const fileStream = fs.createReadStream(dumpPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const parsedData: Record<string, { columns: string[]; rows: string[][] }> = {};
  let currentTable: string | null = null;
  let currentColumns: string[] = [];

  for await (const line of rl) {
    if (line.startsWith("COPY public.")) {
      const match = line.match(/^COPY public\.([a-zA-Z0-9_]+)\s+\((.+)\)\s+FROM stdin;/);
      if (match) {
        currentTable = match[1];
        currentColumns = match[2].split(",").map(c => c.trim());
        parsedData[currentTable] = {
          columns: currentColumns,
          rows: [],
        };
      }
    } else if (line === "\\.") {
      currentTable = null;
    } else if (currentTable !== null && parsedData[currentTable]) {
      const rowValues = line.split("\t");
      parsedData[currentTable].rows.push(rowValues);
    }
  }

  console.log("Parseo finalizado con éxito. Iniciando transformación e importación...");

  // Pre-hashear contraseña para app_users (permite parametrizarla en producción)
  const seedPassword = process.env.SEED_PASSWORD || "testlocal123";
  const devPasswordHash = await bcrypt.hash(seedPassword, 10);

  for (const tableName of importOrder) {
    const tableData = parsedData[tableName];
    if (!tableData || tableData.rows.length === 0) {
      console.log(`Tabla [${tableName}]: Sin datos en el backup.`);
      continue;
    }

    const tableSchema = drizzleTables[tableName];
    if (!tableSchema) {
      console.log(`Tabla [${tableName}]: No está definida en el esquema de Drizzle.`);
      continue;
    }

    console.log(`Tabla [${tableName}]: Transformando ${tableData.rows.length} filas...`);

    const valuesToInsert = tableData.rows.map(row => {
      const obj: Record<string, any> = {};
      tableData.columns.forEach((colName, index) => {
        let val: any = row[index];
        
        // En COPY de Postgres, \N representa un valor nulo
        if (val === "\\N") {
          val = null;
        } else if (val !== null) {
          // Des-escapar el valor de Postgres COPY
          val = unescapePostgresCopy(val);
        }

        // 1. Transformación de nulos a defaults seguros según data_migration_notes.md
        if (val === null) {
          if (tableName === "cartola_falabella_rows" && colName === "descripcion") val = "";
          else if (tableName === "cobranza_rows" && ["tipo_documento", "n_documento", "rut_cliente", "fecha_emision"].includes(colName)) val = "";
          else if (tableName === "fact_ventas_rows" && ["numero_documento", "sku", "tipo_movimiento"].includes(colName)) val = "";
          else if (tableName === "fact_compras_rows" && ["folio", "rut", "fecha_emision", "estado"].includes(colName)) val = "";
          else if (["cartola_global66_clp_rows", "cartola_global66_usd_rows"].includes(tableName) && colName === "descripcion") val = "";
          
          else if (tableName === "cartola_rows" && ["cheque_o_cargo", "deposito_o_abono", "saldo"].includes(colName)) val = "0.00";
          else if (tableName === "cartola_security_rows" && ["cargo", "abono", "saldo"].includes(colName)) val = "0.00";
          else if (tableName === "cartola_falabella_rows" && ["cargo", "abono", "saldo"].includes(colName)) val = "0.00";
          else if (tableName === "fact_ventas_rows" && colName === "cantidad") val = "0.00";
          else if (["cartola_global66_clp_rows", "cartola_global66_usd_rows"].includes(tableName) && ["debito", "abono"].includes(colName)) val = "0.00";
        }

        // 2. Formatear booleanos / enteros (revisado)
        if (tableName === "centro_costos_reviews" && colName === "revisado") {
          val = val === "t" || val === "1" ? 1 : 0;
        }

        // 3. Formatear arrays de Postgres a arrays nativos de JS
        if (colName === "emails" || colName === "destinatarios" || colName === "headers") {
          val = parsePostgresArray(val);
        }

        // 4. Formatear strings JSON
        if (colName === "data" || colName === "extra_data") {
          val = val ? JSON.parse(val) : null;
        }

        const drizzleCol = Object.keys(tableSchema).find(
          k => tableSchema[k].name === colName
        );
        if (drizzleCol) {
          const colSchema = tableSchema[drizzleCol];
          // Convertir strings de fechas a objetos Date reales para columnas timestamp/datetime
          if (val !== null && (colSchema.columnType === "MySqlTimestamp" || colSchema.columnType === "MySqlDateTime" || colSchema.dataType === "date")) {
            val = new Date(val);
          }
          obj[drizzleCol] = val;
        }
      });

      // 5. Inyección de contraseña de prueba para app_users
      if (tableName === "app_users") {
        obj.password = devPasswordHash;
      }

      return obj;
    });

    console.log(`Tabla [${tableName}]: Insertando en lotes...`);
    const BATCH_SIZE = 400;
    let insertedCount = 0;
    for (let i = 0; i < valuesToInsert.length; i += BATCH_SIZE) {
      const batch = valuesToInsert.slice(i, i + BATCH_SIZE);
      insertedCount += await insertBatch(db, tableSchema, batch);
    }
    console.log(`Tabla [${tableName}]: Insertados ${insertedCount} registros con éxito.`);
  }

  console.log("\n==============================================");
  console.log("PROCESO DE MIGRACIÓN COMPLETADO");
  console.log("==============================================");

  // Cerrar pool
  await pool.end();
}

main().catch(async (err) => {
  console.error("Fallo crítico en el proceso de migración:", err);
  await pool.end();
  process.exit(1);
});
