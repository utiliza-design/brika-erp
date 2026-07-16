import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { insertAndFetch } from "../../db-helpers";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const userId = userData.id;
    if (!userId) {
      throw new Error("User ID is required for upsert");
    }
    const existing = await this.getUser(userId);
    if (existing) {
      await db.update(users).set({ ...userData, updatedAt: new Date() }).where(eq(users.id, userId));
      const [updated] = await db.select().from(users).where(eq(users.id, userId));
      if (!updated) {
        throw new Error("Failed to fetch updated user");
      }
      return updated;
    } else {
      return await insertAndFetch(db, users, userData);
    }
  }
}

export const authStorage = new AuthStorage();
