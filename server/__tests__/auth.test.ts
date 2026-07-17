import { describe, it, expect, vi, beforeEach } from "vitest";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import { storage } from "../storage";

// Helper para extraer el callback de verificación de la estrategia
function getVerifyCallback(strategy: any) {
  return strategy._verify;
}

vi.mock("../storage", () => ({
  storage: {
    getAppUser: vi.fn(),
  },
}));

describe("Local Authentication Strategy", () => {
  let verifyCallback: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Instanciamos una estrategia para extraer su verify callback
    const strategy = new LocalStrategy(async (username, password, done) => {
      try {
        const appUser = await storage.getAppUser(username);
        if (!appUser) {
          return done(null, false, { message: "Credenciales inválidas" });
        }
        if (!appUser.password) {
          return done(null, false, { message: "Credenciales inválidas" });
        }
        const isValid = await bcrypt.compare(password, appUser.password);
        if (!isValid) {
          return done(null, false, { message: "Credenciales inválidas" });
        }
        return done(null, appUser);
      } catch (err) {
        return done(err);
      }
    });
    verifyCallback = getVerifyCallback(strategy);
  });

  it("should authenticate successfully with correct credentials", async () => {
    const passwordHash = await bcrypt.hash("correct-password", 10);
    vi.mocked(storage.getAppUser).mockResolvedValue({
      id: "user-123",
      email: "user@brika.cl",
      password: passwordHash,
      role: "user",
      status: "active",
    } as any);

    const done = vi.fn();
    await verifyCallback("user@brika.cl", "correct-password", done);

    expect(done).toHaveBeenCalledWith(null, expect.objectContaining({ id: "user-123" }));
  });

  it("should fail authentication with incorrect password", async () => {
    const passwordHash = await bcrypt.hash("correct-password", 10);
    vi.mocked(storage.getAppUser).mockResolvedValue({
      id: "user-123",
      email: "user@brika.cl",
      password: passwordHash,
      role: "user",
      status: "active",
    } as any);

    const done = vi.fn();
    await verifyCallback("user@brika.cl", "wrong-password", done);

    expect(done).toHaveBeenCalledWith(null, false, { message: "Credenciales inválidas" });
  });

  it("should fail authentication safely when password in db is null/undefined", async () => {
    // Usuario sin contraseña (password: null)
    vi.mocked(storage.getAppUser).mockResolvedValue({
      id: "user-123",
      email: "user@brika.cl",
      password: null,
      role: "user",
      status: "active",
    } as any);

    const done = vi.fn();
    // No debe lanzar error ni crashear en bcrypt.compare
    await expect(verifyCallback("user@brika.cl", "any-password", done)).resolves.not.toThrow();

    expect(done).toHaveBeenCalledWith(null, false, { message: "Credenciales inválidas" });
  });

  it("should fail authentication if user does not exist", async () => {
    vi.mocked(storage.getAppUser).mockResolvedValue(undefined as any);

    const done = vi.fn();
    await verifyCallback("nonexistent@brika.cl", "password", done);

    expect(done).toHaveBeenCalledWith(null, false, { message: "Credenciales inválidas" });
  });
});
