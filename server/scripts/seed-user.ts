import { db, pool } from "../db";
import { appUsers } from "@shared/schema";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { insertAndFetch } from "../db-helpers";

async function main() {
  const email = process.env.SEED_EMAIL || process.argv[2];
  const password = process.env.SEED_PASSWORD || process.argv[3];
  const name = process.env.SEED_NAME || process.argv[4] || "Administrador";

  if (!email || !password) {
    console.error("Uso: npx tsx server/scripts/seed-user.ts <email> <password> [name]");
    console.error("O define las variables de entorno SEED_EMAIL y SEED_PASSWORD.");
    process.exit(1);
  }

  console.log(`Hasheando contraseña para ${email}...`);
  const hashedPassword = await bcrypt.hash(password, 10);

  // Buscar si ya existe
  const [existing] = await db.select().from(appUsers).where(eq(appUsers.email, email));

  if (existing) {
    console.log(`Usuario ${email} ya existe. Actualizando contraseña y rol a admin...`);
    await db.update(appUsers)
      .set({
        password: hashedPassword,
        role: "admin",
        status: "active",
        name: name,
      })
      .where(eq(appUsers.id, existing.id));
    console.log("¡Usuario actualizado con éxito!");
  } else {
    console.log(`Creando nuevo usuario admin: ${email}...`);
    await insertAndFetch(db, appUsers, {
      email,
      name,
      role: "admin",
      status: "active",
      password: hashedPassword,
    });
    console.log("¡Usuario creado con éxito!");
  }

  // Cerrar el pool
  await pool.end();
}

main().catch((err) => {
  console.error("Error en el script de seed:", err);
  pool.end().then(() => process.exit(1));
});
