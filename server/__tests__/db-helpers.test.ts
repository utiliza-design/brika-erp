import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { mysqlTable, varchar, int } from "drizzle-orm/mysql-core";
import { insertAndFetch, insertBatch, hasValidEmail } from "../db-helpers";
import { eq } from "drizzle-orm";

// 1. Declarar tablas de prueba locales simulando el entorno real
const testUsersUuid = mysqlTable("test_users_uuid", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
});

const testItemsAuto = mysqlTable("test_items_auto", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
});

const testUniqueStr = mysqlTable("test_unique_str", {
  id: varchar("id", { length: 36 }).primaryKey(),
  code: varchar("code", { length: 100 }).notNull(),
});

describe("Database Helpers (MySQL/MariaDB)", () => {
  let connection: mysql.Connection;
  let db: any;

  beforeAll(async () => {
    // Conectar a la MariaDB local levantada en Docker (puerto 3309)
    connection = await mysql.createConnection({
      host: "127.0.0.1",
      port: 3309,
      user: "brika_user",
      password: "brika_password_dev",
      database: "cloudbrika",
    });
    db = drizzle(connection);

    // Crear tablas temporales de pruebas
    await connection.query(`
      CREATE TABLE IF NOT EXISTS test_users_uuid (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(255) NOT NULL
      );
    `);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS test_items_auto (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL
      );
    `);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS test_unique_str (
        id VARCHAR(36) PRIMARY KEY,
        code VARCHAR(100) NOT NULL UNIQUE
      );
    `);
  });

  afterAll(async () => {
    // Limpieza
    await connection.query(`DROP TABLE IF EXISTS test_users_uuid;`);
    await connection.query(`DROP TABLE IF EXISTS test_items_auto;`);
    await connection.query(`DROP TABLE IF EXISTS test_unique_str;`);
    await connection.end();
  });

  describe("insertAndFetch", () => {
    it("debe autogenerar un UUID si no se provee el campo ID en una clave string/varchar", async () => {
      // Pasamos un objeto SIN la propiedad "id"
      const result = await insertAndFetch(db, testUsersUuid, {
        email: "test-uuid@example.com",
      } as any);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.id).toHaveLength(36); // Longitud estándar del UUID v4
      expect(result.email).toBe("test-uuid@example.com");

      // Verificar persistencia en base de datos
      const [dbRecord] = await db.select().from(testUsersUuid).where(eq(testUsersUuid.id, result.id));
      expect(dbRecord).toBeDefined();
      expect(dbRecord.email).toBe("test-uuid@example.com");
    });

    it("debe usar el ID provisto si ya viene definido en el objeto", async () => {
      const customId = "custom-id-123456";
      const result = await insertAndFetch(db, testUsersUuid, {
        id: customId,
        email: "custom@example.com",
      });

      expect(result.id).toBe(customId);
      expect(result.email).toBe("custom@example.com");
    });

    it("debe funcionar con tablas autoincrementables", async () => {
      const result = await insertAndFetch(db, testItemsAuto, {
        name: "Item de prueba",
      });

      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe("number");
      expect(result.name).toBe("Item de prueba");
    });
  });

  describe("insertBatch", () => {
    it("debe ignorar duplicados y retornar el conteo exacto de filas insertadas", async () => {
      // Limpiar tabla de prueba
      await connection.query(`TRUNCATE test_items_auto;`);

      // Lote inicial
      const initialBatch = [
        { id: 1, name: "item1" },
        { id: 2, name: "item2" },
      ];
      const insertedCount = await insertBatch(db, testItemsAuto, initialBatch);
      expect(insertedCount).toBe(2);

      // Lote con duplicados: id 1 (duplicado), id 3 (nuevo), id 4 (nuevo)
      const duplicateBatch = [
        { id: 1, name: "item1-changed" },
        { id: 3, name: "item3" },
        { id: 4, name: "item4" },
      ];
      const affectedRows = await insertBatch(db, testItemsAuto, duplicateBatch);

      // Debe retornar exactamente 2 (solo id 3 e id 4 se insertan, el 1 se ignora)
      expect(affectedRows).toBe(2);

      // Verificar que los registros en la BD son exactamente 4
      const allItems = await db.select().from(testItemsAuto);
      expect(allItems).toHaveLength(4);
    });

    it("debe deduplicar registros case-insensitively en base a la collation de MySQL/MariaDB", async () => {
      await connection.query(`TRUNCATE test_unique_str;`);

      // Lote inicial
      await insertBatch(db, testUniqueStr, [
        { id: "1", code: "SKU-ABC" }
      ]);

      // Insertar lote con la versión en minúscula: "sku-abc"
      const count = await insertBatch(db, testUniqueStr, [
        { id: "2", code: "sku-abc" }, // Debería chocar con "SKU-ABC" por la colación general_ci
        { id: "3", code: "SKU-DEF" }  // Nuevo
      ]);

      expect(count).toBe(1); // Solo SKU-DEF se inserta

      const all = await db.select().from(testUniqueStr);
      expect(all).toHaveLength(2);
      expect(all.map((r: any) => r.code)).toContain("SKU-ABC");
      expect(all.map((r: any) => r.code)).toContain("SKU-DEF");
    });
  });

  describe("hasValidEmail (Pure Function)", () => {
    it("debe retornar false para null o undefined", () => {
      expect(hasValidEmail(null)).toBe(false);
      expect(hasValidEmail(undefined)).toBe(false);
    });

    it("debe retornar false para arrays vacíos", () => {
      expect(hasValidEmail([])).toBe(false);
    });

    it("debe retornar false para arrays con solo strings vacíos o con espacios", () => {
      expect(hasValidEmail([""])).toBe(false);
      expect(hasValidEmail(["   ", ""])).toBe(false);
    });

    it("debe retornar true si el primer elemento es vacío pero el segundo es válido", () => {
      expect(hasValidEmail(["", "email@real.cl"])).toBe(true);
    });

    it("debe retornar true si contiene emails válidos", () => {
      expect(hasValidEmail(["email@real.cl"])).toBe(true);
      expect(hasValidEmail(["email1@real.cl", "email2@real.cl"])).toBe(true);
    });
  });
});
