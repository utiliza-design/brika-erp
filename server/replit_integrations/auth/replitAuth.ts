import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import bcrypt from "bcrypt";
import MySQLStoreFactory from "express-mysql-session";
import { pool } from "../../db";
import { storage } from "../../storage";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const MySQLStore = MySQLStoreFactory(session as any);
  const sessionStore = new MySQLStore({
    createDatabaseTable: true,
    schema: {
      tableName: "sessions",
    },
    clearExpired: true,
    checkExpirationInterval: 900000, // 15 mins
    expiration: sessionTtl,
  }, pool.pool as any);

  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore as any,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
      sameSite: "lax",
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(new LocalStrategy(async (username, password, done) => {
    try {
      const appUser = await storage.getAppUser(username);
      if (!appUser) {
        return done(null, false, { message: "Credenciales inválidas" });
      }

      // PASSWORD NULL: si el usuario no tiene contraseña (por ejemplo, appUsers existentes
      // de la migración previa), rechazamos de forma silenciosa para evitar crasheos
      // al pasar un valor null a bcrypt.compare y evitar revelar que la cuenta no tiene clave.
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
  }));

  passport.serializeUser((user: any, cb) => {
    cb(null, user.id);
  });

  passport.deserializeUser(async (id: string, cb) => {
    try {
      const appUser = await storage.getAppUserById(id);
      // Si el usuario no existe (usuario eliminado o base recreada), la sesión es inválida
      // y se debe tratar como no-autenticado en lugar de lanzar un error 500 de infraestructura.
      if (!appUser) return cb(null, false);

      // PUENTE claims: inyectamos claims { email, first_name } por compatibilidad
      // heredada del sistema de autenticación de Replit Auth para no forzar una refactorización
      // del archivo routes.ts.
      // TODO: Limpieza futura para que routes.ts consuma req.user.email directamente.
      const sessionUser = {
        ...appUser,
        claims: {
          email: appUser.email,
          first_name: appUser.name ?? appUser.email,
        }
      };
      cb(null, sessionUser);
    } catch (err) {
      cb(err);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Credenciales inválidas" });
      }
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.json({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          profileImageUrl: null,
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy((destroyErr) => {
        if (destroyErr) return next(destroyErr);
        res.json({ success: true });
      });
    });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (process.env.BYPASS_AUTH === "true") {
    if (!req.user) {
      const mockUser = {
        id: "mock-admin-id-123",
        email: "admin@brika.cl",
        name: "Admin Local",
        role: "admin",
        status: "active",
        claims: {
          email: "admin@brika.cl",
          first_name: "Admin Local",
        }
      };
      req.login(mockUser, (err) => {
        if (err) return res.status(401).json({ message: "Unauthorized" });
        return next();
      });
      return;
    }
    return next();
  }

  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};
