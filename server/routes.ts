import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import * as XLSX from "xlsx";
import type { FileType, CentroCostosRule } from "@shared/schema";
import { parseCartolaFile } from "./parsers/cartola-parser";
import { parseSecurityFile } from "./parsers/security-parser";
import { parseFalabellaFile } from "./parsers/falabella-parser";
import { parseGlobal66File } from "./parsers/global66-parser";
import { isAuthenticated } from "./replit_integrations/auth";
import { sendInvitationEmail, sendEmail } from "./email";
import { isConfigured as isBsaleConfigured, syncVentas, syncCobranza, syncFactCompras, fetchBsaleStock } from "./bsale";
import { cacheGet, cacheSet, cacheInvalidateAll, cacheInvalidatePrefix } from "./cache";

type DataRow = Record<string, unknown> & { __deleted?: boolean };

function predictCentroCostos(detalle: string, rules: CentroCostosRule[]): string | null {
  const detalleUpper = detalle.toUpperCase();
  let bestMatch: CentroCostosRule | null = null;

  for (const rule of rules) {
    const patternUpper = rule.pattern.toUpperCase();

    if (rule.matchType === "exact") {
      if (detalleUpper === patternUpper) {
        return rule.centroCostos;
      }
    } else {
      if (detalleUpper.includes(patternUpper)) {
        if (!bestMatch || rule.priority > bestMatch.priority ||
            (rule.priority === bestMatch.priority && rule.pattern.length > bestMatch.pattern.length)) {
          bestMatch = rule;
        }
      }
    }
  }

  return bestMatch ? bestMatch.centroCostos : null;
}

function predictBuiltInCCCartola(detalle: string): string | null {
  const up = detalle.toUpperCase();
  const isTraspasoA = up.includes("TRASPASO A:");
  if (isTraspasoA && (up.includes("ANDRES MINGO") || up.includes("ANDRÉS MINGO"))) return "C-ENVIOS";
  if (isTraspasoA && up.includes("BSALE CHILE")) return "C-SISTEMA DE FACTURACION";
  if (isTraspasoA && up.includes("BRIKA SPA")) return "C-NADA";
  if (up.includes("PAGO EN SII.CL")) return "C-IVA - PPM";
  if (isTraspasoA) return "C-SUELDOS";
  return null;
}

const upload = multer({ storage: multer.memoryStorage() });

const requireAppAccess: RequestHandler = (req, res, next) => {
  isAuthenticated(req, res, async () => {
    const user = req.user as any;
    const email = user.claims?.email;

    if (!email) {
      return res.status(401).json({ message: "No email in session" });
    }

    try {
      const count = await storage.countAppUsers();
      if (count === 0) {
        const name = [user.claims?.first_name, user.claims?.last_name].filter(Boolean).join(" ") || email;
        await storage.createAppUser({ email, name, role: "admin", status: "active" });
        return next();
      }

      const appUser = await storage.getAppUser(email);

      if (!appUser) {
        return res.status(403).json({ denied: true, reason: "not_invited" });
      }

      if (appUser.status === "revoked") {
        return res.status(403).json({ denied: true, reason: "revoked" });
      }

      const name = [user.claims?.first_name, user.claims?.last_name].filter(Boolean).join(" ") || email;
      await storage.updateAppUserOnLogin(appUser.id, name);

      return next();
    } catch (error) {
      console.error("requireAppAccess error:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  });
};

const requireAdmin: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  const email = user.claims?.email;
  try {
    const appUser = await storage.getAppUser(email);
    if (!appUser || appUser.role !== "admin") {
      return res.status(403).json({ message: "Se requieren permisos de administrador" });
    }
    next();
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const PUBLIC_PATHS = ["/login", "/logout", "/callback"];

  app.use("/api", (req, res, next) => {
    if (PUBLIC_PATHS.includes(req.path) || req.path.startsWith("/auth/")) {
      return next();
    }
    requireAppAccess(req, res, next);
  });

  app.get("/api/me", async (req, res) => {
    try {
      const user = req.user as any;
      const email = user.claims?.email;
      const appUser = await storage.getAppUser(email);
      if (!appUser) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      res.json({
        id: appUser.id,
        email: appUser.email,
        name: appUser.name,
        role: appUser.role,
        status: appUser.status,
        profileImageUrl: user.claims?.profile_image_url ?? null,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/app-users", requireAdmin, async (_req, res) => {
    try {
      const users = await storage.getAllAppUsers();
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/app-users/invite", requireAdmin, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email requerido" });
      }

      const trimmedEmail = email.trim().toLowerCase();

      const existing = await storage.getAppUser(trimmedEmail);
      if (existing) {
        return res.status(409).json({ error: "Este email ya tiene acceso o invitación" });
      }

      const currentUser = req.user as any;
      const invitedByEmail = currentUser.claims?.email;
      const invitedByAppUser = await storage.getAppUser(invitedByEmail);
      const invitedByName = invitedByAppUser?.name || invitedByEmail;

      const newUser = await storage.createAppUser({
        email: trimmedEmail,
        role: "user",
        status: "invited",
        invitedBy: invitedByEmail,
      });

      const appUrl = `${req.protocol}://${req.hostname}`;
      const emailResult = await sendInvitationEmail({
        toEmail: trimmedEmail,
        invitedByName: invitedByName || "Un administrador",
        appUrl,
      });

      res.json({
        user: newUser,
        emailSent: emailResult.sent,
        inviteLink: appUrl,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/app-users/:id/resend-invite", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllAppUsers();
      const user = users.find((u) => u.id === req.params.id);
      if (!user) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      const currentUser = req.user as any;
      const invitedByEmail = currentUser.claims?.email;
      const invitedByAppUser = await storage.getAppUser(invitedByEmail);
      const invitedByName = invitedByAppUser?.name || invitedByEmail;

      const appUrl = `${req.protocol}://${req.hostname}`;
      const emailResult = await sendInvitationEmail({
        toEmail: user.email,
        invitedByName: invitedByName || "Un administrador",
        appUrl,
      });

      res.json({ emailSent: emailResult.sent, inviteLink: appUrl });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/app-users/:id/status", requireAdmin, async (req, res) => {
    try {
      const { status } = req.body;
      if (!status || !["active", "revoked", "invited"].includes(status)) {
        return res.status(400).json({ error: "Estado inválido" });
      }

      const currentUser = req.user as any;
      const currentEmail = currentUser.claims?.email;
      const targetUser = await storage.getAppUserById(req.params.id as string);

      if (!targetUser) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      if (targetUser.email === currentEmail) {
        return res.status(400).json({ error: "No puedes modificar tu propio acceso" });
      }

      const updated = await storage.updateAppUserStatus(req.params.id as string, status);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/app-users/:id/role", requireAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      if (!role || !["admin", "user"].includes(role)) {
        return res.status(400).json({ error: "Rol inválido" });
      }

      const currentUser = req.user as any;
      const currentEmail = currentUser.claims?.email;
      const targetUser = await storage.getAppUserById(req.params.id as string);

      if (!targetUser) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      if (targetUser.email === currentEmail) {
        return res.status(400).json({ error: "No puedes modificar tu propio rol" });
      }

      const updated = await storage.updateAppUserRole(req.params.id as string, role);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/app-users/:id", requireAdmin, async (req, res) => {
    try {
      const currentUser = req.user as any;
      const currentEmail = currentUser.claims?.email;
      const targetUser = await storage.getAppUserById(req.params.id as string);

      if (!targetUser) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      if (targetUser.email === currentEmail) {
        return res.status(400).json({ error: "No puedes eliminar tu propio usuario" });
      }

      await storage.deleteAppUser(req.params.id as string);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/upload/:fileType", upload.single("file"), async (req, res) => {
    try {
      const fileType = req.params.fileType as FileType;
      const validTypes: FileType[] = ["cartola", "cartola_security", "cartola_falabella", "cartola_global66_clp", "cartola_global66_usd", "fact_ventas"];
      if (!validTypes.includes(fileType)) {
        return res.status(400).json({ error: "Tipo de archivo no válido" });
      }
      cacheInvalidateAll();

      if (!req.file) {
        return res.status(400).json({ error: "No se proporcionó un archivo" });
      }

      let headers: string[];
      let jsonData: Record<string, unknown>[];

      if (fileType === "cartola") {
        const parsed = parseCartolaFile(req.file.buffer);
        headers = parsed.headers;
        jsonData = parsed.data;
      } else if (fileType === "cartola_security") {
        const parsed = parseSecurityFile(req.file.buffer);
        headers = parsed.headers;
        jsonData = parsed.data;
      } else if (fileType === "cartola_falabella") {
        const parsed = await parseFalabellaFile(req.file.buffer);
        headers = parsed.headers;
        jsonData = parsed.data;
      } else if (fileType === "cartola_global66_clp") {
        const parsed = await parseGlobal66File(req.file.buffer, "CLP");
        headers = parsed.headers;
        jsonData = parsed.data;
      } else if (fileType === "cartola_global66_usd") {
        const parsed = await parseGlobal66File(req.file.buffer, "USD");
        headers = parsed.headers;
        jsonData = parsed.data;
      } else {
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        headers = jsonData.length > 0 ? Object.keys(jsonData[0] as object) : [];
      }

      if (fileType === "cartola") {
        const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
        const buildCartolKey = (row: Record<string, unknown>) => {
          const fecha = normalize(String(row["Fecha"] ?? ""));
          const detalle = normalize(String(row["Detalle Movimiento"] ?? ""));
          const cargo = normalize(String(row["Cheque o Cargo"] ?? ""));
          const deposito = normalize(String(row["Deposito o Abono"] ?? ""));
          return `${fecha}|${detalle}|${cargo}|${deposito}`;
        };

        const totalRows = jsonData.length;
        const rowMap = new Map<string, Record<string, unknown>>();
        for (const row of jsonData) rowMap.set(buildCartolKey(row as Record<string, unknown>), row as Record<string, unknown>);
        const uniqueNewRows = [...rowMap.values()];
        const withinFileDupes = totalRows - uniqueNewRows.length;

        const existingFiles = await storage.getUploadedFiles("cartola");
        const existingKeys = new Set<string>();
        let crossFileDupes = 0;
        for (const file of existingFiles) {
          const rows = (file.data || []) as Record<string, unknown>[];
          for (const row of rows) {
            if ((row as DataRow).__deleted) continue;
            const key = buildCartolKey(row as Record<string, unknown>);
            if (rowMap.has(key) && !existingKeys.has(key)) { crossFileDupes++; existingKeys.add(key); }
          }
        }
        const trulyNewRows = uniqueNewRows.filter(row => !existingKeys.has(buildCartolKey(row)));

        const duplicateCount = withinFileDupes + crossFileDupes;

        if (trulyNewRows.length === 0) {
          return res.json({ rowCount: 0, newCount: 0, duplicateCount, totalInFile: totalRows, message: "El archivo no contenía filas nuevas" });
        }

        const uploaded = await storage.createUploadedFile({
          fileType,
          originalFilename: req.file.originalname,
          rowCount: trulyNewRows.length,
          status: "processed",
          headers,
          data: trulyNewRows,
        });

        try { await storage.bulkInsertCartolaRows(uploaded.id, trulyNewRows); } catch (e) { console.error("bulkInsertCartolaRows error:", e); }

        return res.json({ ...uploaded, newCount: trulyNewRows.length, duplicateCount, totalInFile: totalRows });
      }

      if (fileType === "cartola_security") {
        const buildSecKey = (row: Record<string, unknown>) => {
          const fecha = String(row["Fecha"] ?? "").trim().toLowerCase().replace(/\s+/g, " ");
          const detalle = String(row["Detalle Movimiento"] ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20);
          const cargo = String(row["Cargo"] ?? "0");
          const abono = String(row["Abono"] ?? "0");
          return `${fecha}|${detalle}|${cargo}|${abono}`;
        };

        const totalRows = jsonData.length;
        const rowMap = new Map<string, Record<string, unknown>>();
        for (const row of jsonData) rowMap.set(buildSecKey(row as Record<string, unknown>), row as Record<string, unknown>);
        const uniqueNewRows = [...rowMap.values()];
        const withinFileDupes = totalRows - uniqueNewRows.length;

        const existingFiles = await storage.getUploadedFiles("cartola_security");
        const existingKeys = new Set<string>();
        let crossFileDupes = 0;
        for (const file of existingFiles) {
          const rows = (file.data || []) as Record<string, unknown>[];
          for (const row of rows) {
            if ((row as DataRow).__deleted) continue;
            const key = buildSecKey(row as Record<string, unknown>);
            if (rowMap.has(key) && !existingKeys.has(key)) { crossFileDupes++; existingKeys.add(key); }
          }
        }
        const trulyNewRows = uniqueNewRows.filter(row => !existingKeys.has(buildSecKey(row)));

        const duplicateCount = withinFileDupes + crossFileDupes;

        if (trulyNewRows.length === 0) {
          return res.json({ rowCount: 0, newCount: 0, duplicateCount, totalInFile: totalRows, message: "El archivo no contenía filas nuevas" });
        }

        const uploaded = await storage.createUploadedFile({
          fileType,
          originalFilename: req.file.originalname,
          rowCount: trulyNewRows.length,
          status: "processed",
          headers,
          data: trulyNewRows,
        });

        try { await storage.bulkInsertCartolaSecurityRows(uploaded.id, trulyNewRows); } catch (e) { console.error("bulkInsertCartolaSecurityRows error:", e); }

        return res.json({ ...uploaded, newCount: trulyNewRows.length, duplicateCount, totalInFile: totalRows });
      }

      if (fileType === "cartola_falabella") {
        const buildFalKey = (row: Record<string, unknown>) => {
          const fecha = String(row["Fecha"] ?? "").trim().toLowerCase();
          const descrip = String(row["Descripción"] ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20);
          const cargo = String(row["Cargo"] ?? "0");
          const abono = String(row["Abono"] ?? "0");
          return `${fecha}|${descrip}|${cargo}|${abono}`;
        };

        const totalRows = jsonData.length;
        const rowMap = new Map<string, Record<string, unknown>>();
        for (const row of jsonData) rowMap.set(buildFalKey(row as Record<string, unknown>), row as Record<string, unknown>);
        const uniqueNewRows = [...rowMap.values()];
        const withinFileDupes = totalRows - uniqueNewRows.length;

        const existingFiles = await storage.getUploadedFiles("cartola_falabella");
        const existingKeys = new Set<string>();
        let crossFileDupes = 0;
        for (const file of existingFiles) {
          const rows = (file.data || []) as Record<string, unknown>[];
          for (const row of rows) {
            if ((row as DataRow).__deleted) continue;
            const key = buildFalKey(row as Record<string, unknown>);
            if (rowMap.has(key) && !existingKeys.has(key)) { crossFileDupes++; existingKeys.add(key); }
          }
        }
        const trulyNewRows = uniqueNewRows.filter(row => !existingKeys.has(buildFalKey(row)));

        const duplicateCount = withinFileDupes + crossFileDupes;

        if (trulyNewRows.length === 0) {
          return res.json({ rowCount: 0, newCount: 0, duplicateCount, totalInFile: totalRows, message: "El archivo no contenía filas nuevas" });
        }

        const uploaded = await storage.createUploadedFile({
          fileType,
          originalFilename: req.file.originalname,
          rowCount: trulyNewRows.length,
          status: "processed",
          headers,
          data: trulyNewRows,
        });

        try { await storage.bulkInsertCartolaFalabellaRows(uploaded.id, trulyNewRows); } catch (e) { console.error("bulkInsertCartolaFalabellaRows error:", e); }

        return res.json({ ...uploaded, newCount: trulyNewRows.length, duplicateCount, totalInFile: totalRows });
      }

      if (fileType === "cartola_global66_clp" || fileType === "cartola_global66_usd") {
        const buildG66Key = (row: Record<string, unknown>) => {
          const fecha = String(row["Fecha"] ?? "").trim().toLowerCase();
          const descrip = String(row["Descripción"] ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20);
          const debito = String(row["Débito"] ?? "0");
          const abono = String(row["Abono"] ?? "0");
          return `${fecha}|${descrip}|${debito}|${abono}`;
        };

        const totalRows = jsonData.length;
        const rowMap = new Map<string, Record<string, unknown>>();
        for (const row of jsonData) rowMap.set(buildG66Key(row as Record<string, unknown>), row as Record<string, unknown>);
        const uniqueNewRows = [...rowMap.values()];
        const withinFileDupes = totalRows - uniqueNewRows.length;

        const existingFiles = await storage.getUploadedFiles(fileType);
        const existingKeys = new Set<string>();
        let crossFileDupes = 0;
        for (const file of existingFiles) {
          const rows = (file.data || []) as Record<string, unknown>[];
          for (const row of rows) {
            if ((row as DataRow).__deleted) continue;
            const key = buildG66Key(row as Record<string, unknown>);
            if (rowMap.has(key) && !existingKeys.has(key)) { crossFileDupes++; existingKeys.add(key); }
          }
        }
        const trulyNewRows = uniqueNewRows.filter(row => !existingKeys.has(buildG66Key(row)));

        const duplicateCount = withinFileDupes + crossFileDupes;

        if (trulyNewRows.length === 0) {
          return res.json({ rowCount: 0, newCount: 0, duplicateCount, totalInFile: totalRows, message: "El archivo no contenía filas nuevas" });
        }

        const uploaded = await storage.createUploadedFile({
          fileType,
          originalFilename: req.file.originalname,
          rowCount: trulyNewRows.length,
          status: "processed",
          headers,
          data: trulyNewRows,
        });

        try {
          if (fileType === "cartola_global66_clp") {
            await storage.bulkInsertGlobal66ClpRows(uploaded.id, trulyNewRows);
          } else {
            await storage.bulkInsertGlobal66UsdRows(uploaded.id, trulyNewRows);
          }
        } catch (e) { console.error("bulkInsertGlobal66Rows error:", e); }

        return res.json({ ...uploaded, newCount: trulyNewRows.length, duplicateCount, totalInFile: totalRows });
      }

      if (fileType === "fact_ventas") {
        const buildFVKey = (row: Record<string, unknown>) => {
          const numDoc = String(row["Numero del documento"] ?? row["Numero Documento"] ?? "").trim().toLowerCase();
          const sku = String(row["SKU"] ?? "").trim().toLowerCase();
          const tipo = String(row["Tipo Movimiento"] ?? "").trim().toLowerCase();
          const cantidad = String(row["Cantidad"] ?? "").trim().toLowerCase();
          const venta = String(row["Venta Total Neta"] ?? "").trim().toLowerCase();
          return `${numDoc}|${sku}|${tipo}|${cantidad}|${venta}`;
        };

        const totalRows = jsonData.length;
        const rowMap = new Map<string, Record<string, unknown>>();
        for (const row of jsonData) rowMap.set(buildFVKey(row as Record<string, unknown>), row as Record<string, unknown>);
        const uniqueNewRows = [...rowMap.values()];
        const withinFileDupes = totalRows - uniqueNewRows.length;

        const existingFiles = [
          ...await storage.getUploadedFiles("fact_ventas"),
          ...await storage.getUploadedFiles("fact_ventas_bsale"),
        ];
        const newKeys = new Set(rowMap.keys());
        let crossFileDupes = 0;
        for (const file of existingFiles) {
          const rows = (file.data || []) as Record<string, unknown>[];
          let changed = false;
          const updatedRows = rows.map(row => {
            if ((row as DataRow).__deleted) return row;
            if (newKeys.has(buildFVKey(row as Record<string, unknown>))) { crossFileDupes++; changed = true; return { __deleted: true }; }
            return row;
          });
          if (changed) await storage.updateUploadedFileData(file.id, updatedRows, updatedRows.filter(r => !(r as DataRow).__deleted).length);
        }

        const duplicateCount = withinFileDupes + crossFileDupes;

        if (uniqueNewRows.length === 0) {
          return res.json({ rowCount: 0, newCount: 0, duplicateCount, totalInFile: totalRows, message: "El archivo no contenía filas nuevas" });
        }

        const uploaded = await storage.createUploadedFile({
          fileType,
          originalFilename: req.file.originalname,
          rowCount: uniqueNewRows.length,
          status: "processed",
          headers,
          data: uniqueNewRows,
        });

        return res.json({ ...uploaded, newCount: uniqueNewRows.length, duplicateCount, totalInFile: totalRows });
      }

      const uploaded = await storage.createUploadedFile({
        fileType,
        originalFilename: req.file.originalname,
        rowCount: jsonData.length,
        status: "processed",
        headers,
        data: jsonData,
      });

      res.json(uploaded);
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ error: error.message || "Error al procesar el archivo" });
    }
  });

  app.get("/api/estado-resultados", async (req, res) => {
    try {
      const yearFilter = req.query.year ? parseInt(req.query.year as string) : undefined;
      const validSources = new Set(["bsale_sync", "manual"]);
      const source = validSources.has(req.query.source as string) ? (req.query.source as string) : undefined;
      const cacheKey = `er:${yearFilter ?? "all"}:${source ?? "all"}`;
      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);
      const files = source === "bsale_sync"
        ? await storage.getUploadedFiles("fact_ventas_bsale")
        : source === "manual"
        ? await storage.getUploadedFiles("fact_ventas")
        : [...await storage.getUploadedFiles("fact_ventas_bsale"), ...await storage.getUploadedFiles("fact_ventas")];

      const yearsSet = new Set<number>();
      const monthlyData: Record<number, { ventaTotalNeta: number; costoTotalNeto: number; ventaFacturas: number; ventaBoletas: number; notaCredito: number }> = {};

      for (let m = 1; m <= 12; m++) {
        monthlyData[m] = { ventaTotalNeta: 0, costoTotalNeto: 0, ventaFacturas: 0, ventaBoletas: 0, notaCredito: 0 };
      }

      for (const file of files) {
        const rows = (file.data || []) as Record<string, unknown>[];
        for (const row of rows) {
          if ((row as DataRow).__deleted) continue;

          const tipoDoc = String(row["Tipo de Documento"] || "").toLowerCase().trim();
          const esFactura = tipoDoc.includes("factura electr") || tipoDoc.includes("comprobante de venta");
          const esBoleta = tipoDoc.includes("boleta electr");
          const esSuma = esFactura || esBoleta;
          const esNota = tipoDoc.includes("nota de cr");

          if (!esSuma && !esNota) continue;

          const fechaVenta = String(row["Fecha Venta"] || "");
          const parts = fechaVenta.split("/");
          if (parts.length !== 3) continue;

          const month = parseInt(parts[1]);
          const year = parseInt(parts[2]);
          if (isNaN(month) || isNaN(year) || month < 1 || month > 12) continue;

          yearsSet.add(year);
          if (yearFilter && year !== yearFilter) continue;

          const ventaNeta = Number(row["Venta Total Neta"] || 0);
          const costoNeto = Number(row["Costo Total Neto"] || 0);
          const signoVenta = (esNota && ventaNeta > 0) ? -1 : 1;
          const signoCosto = (esNota && costoNeto > 0) ? -1 : 1;

          monthlyData[month].ventaTotalNeta += signoVenta * ventaNeta;
          monthlyData[month].costoTotalNeto += signoCosto * costoNeto;

          if (esFactura) monthlyData[month].ventaFacturas += ventaNeta;
          else if (esBoleta) monthlyData[month].ventaBoletas += ventaNeta;
          else if (esNota) monthlyData[month].notaCredito += ventaNeta > 0 ? ventaNeta : -ventaNeta;
        }
      }

      const ventaAmigoMonthly: Record<number, number> = {};
      const costoVentaAmigoMonthly: Record<number, number> = {};
      const ventaAmigoSinCostoMonthly: Record<number, number> = {};
      for (let m = 1; m <= 12; m++) {
        ventaAmigoMonthly[m] = 0;
        costoVentaAmigoMonthly[m] = 0;
        ventaAmigoSinCostoMonthly[m] = 0;
      }
      const allVentasAmigo = await storage.getVentasAmigo();
      for (const va of allVentasAmigo) {
        if (va.estado !== "pagado") continue;
        const fc = va.fechaCompra;
        if (!fc || fc.length < 7) continue;
        const vaYear = parseInt(fc.substring(0, 4));
        const vaMonth = parseInt(fc.substring(5, 7));
        if (isNaN(vaYear) || isNaN(vaMonth) || vaMonth < 1 || vaMonth > 12) continue;
        yearsSet.add(vaYear);
        if (yearFilter && vaYear !== yearFilter) continue;
        ventaAmigoMonthly[vaMonth] += va.monto;
        const costoUnit = va.costoProducto ?? 0;
        costoVentaAmigoMonthly[vaMonth] += costoUnit * va.unidades;
        if (va.costoProducto == null) {
          ventaAmigoSinCostoMonthly[vaMonth] += 1;
        }
      }

      const data = Object.entries(monthlyData).map(([month, values]) => {
        const m = parseInt(month);
        const ventaAmigo = ventaAmigoMonthly[m] || 0;
        const costoVentaAmigo = costoVentaAmigoMonthly[m] || 0;
        const ventaAmigoSinCosto = ventaAmigoSinCostoMonthly[m] || 0;
        const ventaTotal = values.ventaTotalNeta + ventaAmigo;
        const costoTotal = values.costoTotalNeto + costoVentaAmigo;
        const utilidadBruta = ventaTotal - costoTotal;
        const margen = ventaTotal !== 0 ? utilidadBruta / ventaTotal : 0;
        return {
          month: m,
          ventaTotalNeta: values.ventaTotalNeta,
          costoTotalNeto: values.costoTotalNeto,
          ventaFacturas: values.ventaFacturas,
          ventaBoletas: values.ventaBoletas,
          notaCredito: values.notaCredito,
          ventaAmigo,
          costoVentaAmigo,
          ventaAmigoSinCosto,
          utilidadBruta,
          margen,
        };
      });

      const years = Array.from(yearsSet).sort((a, b) => b - a);
      const result = { years, data, sourceFileCount: files.length };
      cacheSet(cacheKey, result, 120_000);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/costos-operacionales", async (req, res) => {
    try {
      const yearFilter = req.query.year ? parseInt(req.query.year as string) : undefined;
      const cacheKey = `co:${yearFilter ?? "all"}`;
      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);
      const files = await storage.getUploadedFiles("cartola");
      const rules = await storage.getCentroCostosRules();
      const savedCentrosMap = await storage.getSavedCentroCostosMap();
      const fechaCobroMap = await storage.getFechaCobroMap();

      const yearsSet = new Set<number>();
      const centroMontos: Record<string, Record<number, number>> = {};
      const seenMovements = new Set<string>();

      for (const file of files) {
        const rows = (file.data || []) as Record<string, unknown>[];
        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx];
          const fecha = String(row["Fecha"] ?? "").trim();
          if (!fecha) continue;

          const cargo = Number(String(row["Cheque o Cargo"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          if (cargo <= 0) continue;

          const detalle = String(row["Detalle Movimiento"] ?? "").trim();

          const detalleFuzzy = detalle.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20);
          const dedupeKey = `${fecha}|${detalleFuzzy}|${cargo}`;
          if (seenMovements.has(dedupeKey)) continue;
          seenMovements.add(dedupeKey);

          const movementKey = `${file.id}|${rowIdx}`;

          // Use fechaCobro if overridden, otherwise fall back to original fecha
          const efectiveFecha = fechaCobroMap.get(movementKey) ?? fecha;
          const parts = efectiveFecha.split("/");
          if (parts.length !== 3) continue;
          const month = parseInt(parts[1]);
          const year = parseInt(parts[2]);
          if (isNaN(month) || isNaN(year) || month < 1 || month > 12) continue;

          yearsSet.add(year);

          if (yearFilter && year !== yearFilter) continue;

          let centroCostos: string | null;
          if (savedCentrosMap.has(movementKey)) {
            centroCostos = savedCentrosMap.get(movementKey) ?? null;
          } else {
            centroCostos = predictCentroCostos(detalle, rules) ?? predictBuiltInCCCartola(detalle);
          }
          if (centroCostos === "C-NADA") continue;

          const ccKey = centroCostos ?? "Sin Asignar";
          if (!centroMontos[ccKey]) {
            centroMontos[ccKey] = {};
          }
          centroMontos[ccKey][month] = (centroMontos[ccKey][month] || 0) + cargo;
        }
      }

      const centros = Object.entries(centroMontos).map(([centroCostos, montosPorMes]) => {
        const montos: Record<string, number> = {};
        let total = 0;
        for (let m = 1; m <= 12; m++) {
          const val = montosPorMes[m] || 0;
          montos[String(m)] = val;
          total += val;
        }
        return { centroCostos, montos, total };
      });

      centros.sort((a, b) => b.total - a.total);

      const years = Array.from(yearsSet).sort((a, b) => b - a);
      const result = { years, centros };
      cacheSet(cacheKey, result, 120_000);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/centro-costos", async (_req, res) => {
    try {
      const cached = cacheGet<unknown[]>("cc:main");
      if (cached) return res.json(cached);
      const files = await storage.getUploadedFiles("cartola");
      const rules = await storage.getCentroCostosRules();
      const reviewedKeys = await storage.getReviewedKeys();
      const savedCentrosMap = await storage.getSavedCentroCostosMap();
      const cobranzaFiles = await storage.getUploadedFiles("cobranza");
      const savedReviews = await storage.getFacturaReviews();
      const factComprasFiles = await storage.getUploadedFiles("fact_compras");
      const nDocOverrideMap = await storage.getNDocumentoOverrideMap();
      const fechaCobroMap = await storage.getFechaCobroMap();

      // Build a map: cobranza fileId -> rows, for fast lookup
      const cobranzaRowMap = new Map<string, Record<string, unknown>[]>();
      for (const cf of cobranzaFiles) {
        cobranzaRowMap.set(cf.id, (cf.data || []) as Record<string, unknown>[]);
      }

      // nDocMap: movementKey -> nDocumentos (array; user overrides take priority)
      const nDocMap = new Map<string, string[]>();

      // 0. User overrides have highest priority — pre-populate before any auto-matching
      for (const [mk, nd] of nDocOverrideMap) {
        nDocMap.set(mk, nd);
      }

      // 1. Saved/confirmed matches from DB (factura_reviews) — skip if override exists
      // facturaKey is now "tipoDocumento|nDocumento", so nDocumento is after the first pipe.
      for (const review of savedReviews) {
        if (!review.cartolaMovementKey || !review.facturaKey) continue;
        if (nDocMap.has(review.cartolaMovementKey)) continue;
        const pipeIdx = review.facturaKey.indexOf("|");
        if (pipeIdx < 0) continue;
        const nDoc = review.facturaKey.slice(pipeIdx + 1).trim();
        if (nDoc) nDocMap.set(review.cartolaMovementKey, [nDoc]);
      }

      // 2. Automatic matching (same logic as /api/facturas-revision)
      const parseCartolaDate = (dateStr: string): Date | null => {
        const parts = dateStr.split("/");
        if (parts.length !== 3) return null;
        const [d, m, y] = parts.map(Number);
        return new Date(y, m - 1, d);
      };
      const parseCobranzaDate = (dateStr: string): Date | null => {
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
      };
      const TIPOS_VALIDOS = ["FACTURA ELECTRÓNICA", "BOLETA ELECTRÓNICA"];
      type FacturaCandidate = { nDocumento: string; montoDocumento: number; emisionDate: Date };
      const facturasCandidatas: FacturaCandidate[] = [];
      for (const cf of cobranzaFiles) {
        const rows = cobranzaRowMap.get(cf.id) || [];
        for (const row of rows) {
          const tipoDoc = String(row["Tipo Documento"] ?? "").trim();
          if (!TIPOS_VALIDOS.includes(tipoDoc)) continue;
          const montoDocumento = Number(String(row["Monto Documento"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          if (montoDocumento <= 0) continue;
          const fechaEmision = String(row["Fecha Emisión"] ?? "").trim();
          const emisionDate = parseCobranzaDate(fechaEmision);
          if (!emisionDate) continue;
          const nDocumento = String(row["Nº Documento"] ?? "").trim();
          facturasCandidatas.push({ nDocumento, montoDocumento, emisionDate });
        }
      }

      // Build fact_compras candidates for matching against negative caja movements
      // Handles both "DD/MM/YYYY" (from parser) and Excel serial numbers (legacy raw uploads)
      const parseCompraDate = (val: unknown): Date | null => {
        const str = String(val ?? "").trim();
        if (!str || str === "null" || str === "undefined") return null;
        // Try DD/MM/YYYY first
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return parseCartolaDate(str);
        // Try Excel serial number
        const serial = Number(str);
        if (!isNaN(serial) && serial > 40000 && serial < 60000) {
          const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
          return isNaN(d.getTime()) ? null : d;
        }
        return null;
      };

      type CompraCandidate = { folio: string; montoTotal: number; emisionDate: Date };
      const comprasCandidatas: CompraCandidate[] = [];
      for (const cf of factComprasFiles) {
        const rows = (cf.data || []) as Record<string, unknown>[];
        for (const row of rows) {
          const montoTotal = Math.abs(Number(row["Monto Total"] ?? 0));
          if (montoTotal <= 0) continue;
          const emisionDate = parseCompraDate(row["Fecha Emisión"]);
          if (!emisionDate) continue;
          const folio = String(row["Folio"] ?? "").trim();
          if (!folio) continue;
          comprasCandidatas.push({ folio, montoTotal, emisionDate });
        }
      }

      const result: { fecha: string; detalle: string; monto: number; sucursal: string; centroCostos: string | null; revisado: boolean; movementKey: string; nDocumentos: string[]; nDocIsOverride: boolean; saldoBanco: number | null; fechaCobro: string }[] = [];
      const seenMovements = new Set<string>();

      for (const file of files) {
        const rows = (file.data || []) as Record<string, unknown>[];
        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx];
          const fecha = String(row["Fecha"] ?? "").trim();
          if (!fecha) continue;

          const detalle = String(row["Detalle Movimiento"] ?? "").trim();
          const sucursal = String(row["Sucursal"] ?? "").trim();

          const cargo = Number(String(row["Cheque o Cargo"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          const deposito = Number(String(row["Deposito o Abono"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;

          let monto = 0;
          if (cargo > 0) {
            monto = -cargo;
          } else if (deposito > 0) {
            monto = deposito;
          }

          const detalleFuzzy = detalle.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20);
          const dedupeKey = `${fecha}|${detalleFuzzy}|${monto}`;
          if (seenMovements.has(dedupeKey)) continue;
          seenMovements.add(dedupeKey);

          const movementKey = `${file.id}|${rowIdx}`;
          let centroCostos: string | null;
          if (savedCentrosMap.has(movementKey)) {
            centroCostos = savedCentrosMap.get(movementKey) ?? null;
          } else {
            centroCostos = predictCentroCostos(detalle, rules) ?? predictBuiltInCCCartola(detalle);
            if (!centroCostos && monto > 0) centroCostos = "C-VENTA";
          }
          const revisado = reviewedKeys.has(movementKey);

          // Auto-match: only for C-VENTA deposits not already in nDocMap
          if (!nDocMap.has(movementKey) && centroCostos === "C-VENTA" && deposito > 0) {
            const rowDate = parseCartolaDate(fecha);
            if (rowDate) {
              const candidates = facturasCandidatas.filter(f => f.montoDocumento === deposito && rowDate >= f.emisionDate);
              candidates.sort((a, b) => a.emisionDate.getTime() - b.emisionDate.getTime());
              if (candidates[0]) nDocMap.set(movementKey, [candidates[0].nDocumento]);
            }
          }

          // Auto-match fact_compras: for negative movements (cargo > 0) not already matched
          if (!nDocMap.has(movementKey) && cargo > 0) {
            const rowDate = parseCartolaDate(fecha);
            if (rowDate) {
              const candidates = comprasCandidatas.filter(c => c.montoTotal === cargo && rowDate >= c.emisionDate);
              candidates.sort((a, b) => b.emisionDate.getTime() - a.emisionDate.getTime());
              if (candidates[0]) nDocMap.set(movementKey, [candidates[0].folio]);
            }
          }

          const rawSaldo = row["Saldo"];
          const saldoBanco = rawSaldo !== undefined && rawSaldo !== ""
            ? Number(String(rawSaldo).replace(/[^0-9.-]/g, "")) || null
            : null;

          const fechaCobro = fechaCobroMap.get(movementKey) ?? fecha;
          result.push({ fecha, detalle, monto, sucursal, centroCostos, revisado, movementKey, nDocumentos: nDocMap.get(movementKey) ?? [], nDocIsOverride: nDocOverrideMap.has(movementKey), saldoBanco, fechaCobro });
        }
      }

      result.sort((a, b) => {
        const [da, ma, ya] = a.fecha.split("/").map(Number);
        const [db, mb, yb] = b.fecha.split("/").map(Number);
        const dateA = ya * 10000 + ma * 100 + da;
        const dateB = yb * 10000 + mb * 100 + db;
        return dateB - dateA;
      });

      cacheSet("cc:main", result, 120_000);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/centro-costos/save-cc", async (req, res) => {
    try {
      const { movementKey, centroCostos } = req.body;
      if (!movementKey) {
        return res.status(400).json({ error: "movementKey es requerido" });
      }
      await storage.saveCentroCostosForMovement(movementKey, centroCostos ?? null);
      cacheInvalidatePrefix("cc:");
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/centro-costos/review", async (req, res) => {
    try {
      const { movementKey, revisado } = req.body;
      if (!movementKey || typeof revisado !== "boolean") {
        return res.status(400).json({ error: "movementKey y revisado son requeridos" });
      }
      await storage.setReview(movementKey, revisado);
      cacheInvalidatePrefix("cc:");
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/centro-costos/candidatos-ndoc", async (_req, res) => {
    try {
      const cachedCand = cacheGet<unknown[]>("cc:candidatos");
      if (cachedCand) return res.json(cachedCand);
      type Candidato = { nDocumento: string; tipo: string; monto: number; fecha: string; descripcion: string };
      const seen = new Set<string>();
      const candidatos: Candidato[] = [];

      // BSale cobranza facturas
      const TIPOS_VALIDOS_CAND = ["FACTURA ELECTRÓNICA", "BOLETA ELECTRÓNICA"];
      const cobranzaFiles = await storage.getUploadedFiles("cobranza");
      for (const cf of cobranzaFiles) {
        const rows = (cf.data || []) as Record<string, unknown>[];
        for (const row of rows) {
          const tipoDoc = String(row["Tipo Documento"] ?? "").trim();
          if (!TIPOS_VALIDOS_CAND.includes(tipoDoc)) continue;
          const nDocumento = String(row["Nº Documento"] ?? "").trim();
          if (!nDocumento || seen.has(`c|${nDocumento}`)) continue;
          seen.add(`c|${nDocumento}`);
          const monto = Number(String(row["Monto Documento"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          const fecha = String(row["Fecha Emisión"] ?? "").trim();
          const descripcion = String(row["Nombre Cliente"] ?? row["Cliente"] ?? "").trim();
          candidatos.push({ nDocumento, tipo: tipoDoc, monto, fecha, descripcion });
        }
      }

      // Fact compras folios
      const factComprasFiles = await storage.getUploadedFiles("fact_compras");
      for (const cf of factComprasFiles) {
        const rows = (cf.data || []) as Record<string, unknown>[];
        for (const row of rows) {
          const folio = String(row["Folio"] ?? "").trim();
          if (!folio || seen.has(`fc|${folio}`)) continue;
          seen.add(`fc|${folio}`);
          const monto = Number(String(row["Monto Total"] ?? row["Monto Neto"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          const fecha = String(row["Fecha Emisión"] ?? "").trim();
          const descripcion = String(row["Proveedor"] ?? row["RazonSocial"] ?? row["Razón Social"] ?? "").trim();
          candidatos.push({ nDocumento: folio, tipo: "FACTURA COMPRA", monto, fecha, descripcion });
        }
      }

      cacheSet("cc:candidatos", candidatos, 300_000);
      res.json(candidatos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/centro-costos/save-ndocumento", async (req, res) => {
    try {
      const { movementKey, nDocumentos } = req.body;
      if (!movementKey) {
        return res.status(400).json({ error: "movementKey es requerido" });
      }
      const docs: string[] = Array.isArray(nDocumentos) ? nDocumentos.filter(Boolean) : [];
      await storage.saveNDocumentoOverride(movementKey, docs);
      cacheInvalidatePrefix("cc:");
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/centro-costos/save-fecha-cobro", async (req, res) => {
    try {
      const { movementKey, fechaCobro } = req.body;
      if (!movementKey) {
        return res.status(400).json({ error: "movementKey es requerido" });
      }
      await storage.saveFechaCobro(movementKey, fechaCobro ?? null);
      cacheInvalidatePrefix("cc:");
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/centro-costos/rules", async (_req, res) => {
    try {
      const rules = await storage.getCentroCostosRules();
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/centro-costos/rules", async (req, res) => {
    try {
      const { pattern, centroCostos, matchType, priority, movementKey } = req.body;
      if (!pattern || !centroCostos) {
        return res.status(400).json({ error: "pattern y centroCostos son requeridos" });
      }

      if (movementKey) {
        // Freeze ALL currently-loaded rows that don't have a saved CC yet,
        // so no existing record is changed by the new rule.
        const oldRules = await storage.getCentroCostosRules();
        const existingSavedMap = await storage.getSavedCentroCostosMap();
        const reviewedKeysForRules = await storage.getReviewedKeys();
        const cartolaFiles = await storage.getUploadedFiles("cartola");

        for (const file of cartolaFiles) {
          const rows = (file.data || []) as Record<string, unknown>[];
          for (let idx = 0; idx < rows.length; idx++) {
            if ((rows[idx] as DataRow).__deleted) continue;
            const rowMovementKey = `${file.id}|${idx}`;
            if (rowMovementKey === movementKey) continue;
            if (existingSavedMap.has(rowMovementKey)) continue;
            if (reviewedKeysForRules.has(rowMovementKey)) continue;

            const detalle = String(rows[idx]["Detalle Movimiento"] ?? "").trim();
            const cargo = Number(String(rows[idx]["Cheque o Cargo"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
            const deposito = Number(String(rows[idx]["Deposito o Abono"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
            const monto = cargo > 0 ? -cargo : deposito > 0 ? deposito : 0;

            let currentCC = predictCentroCostos(detalle, oldRules);
            if (!currentCC && monto > 0) currentCC = "C-VENTA";
            await storage.saveCentroCostosForMovement(rowMovementKey, currentCC);
          }
        }
      }

      const rule = await storage.upsertCentroCostosRule({
        pattern,
        centroCostos,
        matchType: matchType || "contains",
        priority: priority ?? 20,
      });
      if (movementKey) {
        await storage.saveCentroCostosForMovement(movementKey, centroCostos);
      }
      cacheInvalidatePrefix("cc:");
      res.json(rule);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/centro-costos/rules/:id", async (req, res) => {
    try {
      const updated = await storage.updateCentroCostosRule(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Regla no encontrada" });
      }
      cacheInvalidatePrefix("cc:");
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/centro-costos/rules/:id", async (req, res) => {
    try {
      await storage.deleteCentroCostosRule(req.params.id);
      cacheInvalidatePrefix("cc:");
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/cartola/import-centros-costos", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No se proporcionó un archivo" });
      }

      const workbook = XLSX.read(req.file.buffer, { type: "buffer", raw: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: (string | number | undefined)[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1, defval: "", raw: true,
      });

      function excelSerialToDate(serial: number): string {
        const utcDays = Math.floor(serial - 25569);
        const d = new Date(utcDays * 86400000);
        const day = String(d.getUTCDate()).padStart(2, "0");
        const month = String(d.getUTCMonth() + 1).padStart(2, "0");
        return `${day}/${month}/${d.getUTCFullYear()}`;
      }

      function parseDDMMYYYY(str: string): Date | null {
        const parts = str.split("/");
        if (parts.length !== 3) return null;
        const [d, m, y] = parts.map(Number);
        if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
        return new Date(y, m - 1, d);
      }

      function daysDiff(a: string, b: string): number {
        const da = parseDDMMYYYY(a);
        const db = parseDDMMYYYY(b);
        if (!da || !db) return Infinity;
        return Math.abs((da.getTime() - db.getTime()) / 86400000);
      }

      // Columns: [AÑO OK, FECHA, OBS, RS, CENTROS DE COSTO, FACTURA/BOLETA, GIRO, DEPOSITOS, TOTAL]
      const byFechaGiro = new Map<string, { cc: string; folio: string }>();
      const byFechaAbono = new Map<string, { cc: string; folio: string }>();
      const byMontoGiro = new Map<number, { fecha: string; obs: string; cc: string; folio: string }[]>();
      const byMontoAbono = new Map<number, { fecha: string; obs: string; cc: string; folio: string }[]>();

      for (let i = 1; i < rawRows.length; i++) {
        const r = rawRows[i];
        const fechaSerial = r[1];
        if (!fechaSerial || typeof fechaSerial !== "number") continue;
        const fecha = excelSerialToDate(fechaSerial);
        const giro = typeof r[6] === "number" && (r[6] as number) > 0 ? (r[6] as number) : null;
        const dep  = typeof r[7] === "number" && (r[7] as number) > 0 ? (r[7] as number) : null;
        const ccRaw = String(r[4] ?? "").trim().replace(/C-\s+/, "C-").trim();
        const obs   = String(r[2] ?? "").trim().toLowerCase();
        const folio = String(r[5] ?? "").trim();

        if (giro) {
          byFechaGiro.set(`${fecha}|${giro}`, { cc: ccRaw, folio });
          if (!byMontoGiro.has(giro)) byMontoGiro.set(giro, []);
          byMontoGiro.get(giro)!.push({ fecha, obs, cc: ccRaw, folio });
        }
        if (dep) {
          byFechaAbono.set(`${fecha}|${dep}`, { cc: ccRaw, folio });
          if (!byMontoAbono.has(dep)) byMontoAbono.set(dep, []);
          byMontoAbono.get(dep)!.push({ fecha, obs, cc: ccRaw, folio });
        }
      }

      const WINDOW_DAYS = 30;

      // Collect all years present in the Excel — only match cartola rows from those years
      const excelYears = new Set<string>();
      for (const key of byFechaGiro.keys()) {
        const y = key.split("|")[0].split("/")[2];
        if (y) excelYears.add(y);
      }
      for (const key of byFechaAbono.keys()) {
        const y = key.split("|")[0].split("/")[2];
        if (y) excelYears.add(y);
      }
      for (const entries of byMontoGiro.values()) {
        for (const e of entries) { const y = e.fecha.split("/")[2]; if (y) excelYears.add(y); }
      }
      for (const entries of byMontoAbono.values()) {
        for (const e of entries) { const y = e.fecha.split("/")[2]; if (y) excelYears.add(y); }
      }

      const cartolaFiles = await storage.getUploadedFiles("cartola");
      const existingSavedMap = await storage.getSavedCentroCostosMap();
      const upserts: { movementKey: string; centroCostos: string; revisado: number; fechaCobroOverride?: string | null; nDocumentoOverride?: string | null }[] = [];
      let pasada1 = 0, pasada2 = 0, sinMatch = 0, ambiguos = 0;

      for (const file of cartolaFiles) {
        const rows = (file.data || []) as Record<string, unknown>[];
        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx];
          if ((row as DataRow).__deleted) continue;
          const fechaRaw = String(row["Fecha"] ?? "").trim();
          if (!fechaRaw) continue;
          const fechaParts = fechaRaw.split("/");
          const fecha = fechaParts.length === 3
            ? `${fechaParts[0].padStart(2, "0")}/${fechaParts[1].padStart(2, "0")}/${fechaParts[2]}`
            : fechaRaw;

          // Skip rows from years not in the Excel (prevents overwriting other years)
          const rowYear = fechaParts.length === 3 ? fechaParts[2] : "";
          if (excelYears.size > 0 && !excelYears.has(rowYear)) continue;

          const detalle  = String(row["Detalle Movimiento"] ?? "").trim().toLowerCase();
          const cargoRaw = Number(String(row["Cheque o Cargo"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          const abonoRaw = Number(String(row["Deposito o Abono"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          const movementKey = `${file.id}|${rowIdx}`;

          let matchedCC: string | null = null;
          let matchMethod = "";
          let matchedExcelFecha: string | null = null;
          let matchedFolio: string | null = null;

          // Pasada 1: fecha exacta + monto exacto
          if (cargoRaw > 0 && byFechaGiro.has(`${fecha}|${cargoRaw}`)) {
            const entry = byFechaGiro.get(`${fecha}|${cargoRaw}`)!;
            matchedCC = entry.cc;
            matchedFolio = entry.folio || null;
            matchMethod = "pasada1";
          } else if (abonoRaw > 0 && byFechaAbono.has(`${fecha}|${abonoRaw}`)) {
            const entry = byFechaAbono.get(`${fecha}|${abonoRaw}`)!;
            matchedCC = entry.cc;
            matchedFolio = entry.folio || null;
            matchMethod = "pasada1";
          }

          // Pasada 2: monto + texto + ventana ±30 días
          if (matchMethod === "") {
            const candidates = cargoRaw > 0
              ? (byMontoGiro.get(cargoRaw) || [])
              : (byMontoAbono.get(abonoRaw) || []);

            if (candidates.length > 0) {
              const inWindow = candidates.filter(c => daysDiff(fecha, c.fecha) <= WINDOW_DAYS);
              if (inWindow.length > 0) {
                const textMatches = inWindow.filter(c => {
                  const words = c.obs.split(/\s+/).filter((w: string) => w.length >= 4);
                  return words.some((w: string) => detalle.includes(w));
                });
                if (textMatches.length === 1) {
                  matchedCC = textMatches[0].cc;
                  matchedExcelFecha = textMatches[0].fecha;
                  matchedFolio = textMatches[0].folio || null;
                  matchMethod = "pasada2";
                } else if (textMatches.length > 1) {
                  ambiguos++;
                  continue;
                } else if (inWindow.length === 1) {
                  matchedCC = inWindow[0].cc;
                  matchedExcelFecha = inWindow[0].fecha;
                  matchedFolio = inWindow[0].folio || null;
                  matchMethod = "pasada2";
                } else {
                  ambiguos++;
                  continue;
                }
              }
            }
          }

          if (matchMethod !== "") {
            const ccNorm = (matchedCC ?? "").trim().replace(/C-\s+/, "C-").trim();
            const finalCC = ccNorm || "C-NADA";
            const revisado = finalCC !== "C-NADA" ? 1 : 0;
            const fechaCobroOverride = matchMethod === "pasada2" ? matchedExcelFecha : null;
            const nDocumentoOverride = matchedFolio || null;
            upserts.push({ movementKey, centroCostos: finalCC, revisado, fechaCobroOverride, nDocumentoOverride });
            if (matchMethod === "pasada1") pasada1++; else pasada2++;
          } else {
            if (!existingSavedMap.has(movementKey)) {
              upserts.push({ movementKey, centroCostos: "C-NADA", revisado: 0, fechaCobroOverride: null, nDocumentoOverride: null });
            }
            sinMatch++;
          }
        }
      }

      if (upserts.length > 0) {
        await storage.bulkUpsertCentroCostosImport(upserts);
      }
      cacheInvalidateAll();

      const total = pasada1 + pasada2 + sinMatch + ambiguos;
      res.json({ pasada1, pasada2, sinMatch, ambiguos, total });
    } catch (error: any) {
      console.error("Import centros de costos error:", error);
      res.status(500).json({ error: error.message || "Error al importar centros de costos" });
    }
  });

  app.post("/api/security/import-centros-costos", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No se proporcionó un archivo" });
      }

      const workbook = XLSX.read(req.file.buffer, { type: "buffer", raw: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: (string | number | undefined)[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1, defval: "", raw: true,
      });

      function secExcelSerialToDate(serial: number): string {
        const utcDays = Math.floor(serial - 25569);
        const d = new Date(utcDays * 86400000);
        const day = String(d.getUTCDate()).padStart(2, "0");
        const month = String(d.getUTCMonth() + 1).padStart(2, "0");
        return `${day}/${month}/${d.getUTCFullYear()}`;
      }

      function secParseDDMMYYYY(str: string): Date | null {
        const parts = str.split("/");
        if (parts.length !== 3) return null;
        const [d, m, y] = parts.map(Number);
        if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
        return new Date(y, m - 1, d);
      }

      function secDaysDiff(a: string, b: string): number {
        const da = secParseDDMMYYYY(a);
        const db = secParseDDMMYYYY(b);
        if (!da || !db) return Infinity;
        return Math.abs((da.getTime() - db.getTime()) / 86400000);
      }

      // Auto-detect format by header row:
      // Format A (9-col, header starts with "AÑO OK"):
      //   col[0]=AÑO OK, col[1]=FECHA(date), col[2]=OBS, col[3]=RS,
      //   col[4]=CENTROS DE COSTO, col[5]=FACTURA/BOLETA, col[6]=GIRO(debit), col[7]=DEPOSITOS(credit), col[8]=TOTAL
      // Format B (legacy 7-col):
      //   col[0]=FECHA(date), col[1]=OBS(settlement date), col[2]=desc,
      //   col[3]=CC, col[4]=folio, col[5]=debit, col[6]=credit
      const headerRow = rawRows[0] ?? [];
      const isFormatA = String(headerRow[0] ?? "").trim().toUpperCase().includes("AÑO");
      const iCol = isFormatA
        ? { fecha: 1, fechaCobro: -1, obs: 2, cc: 4, folio: 5, debit: 6, credit: 7 }
        : { fecha: 0, fechaCobro: 1, obs: 2, cc: 3, folio: 4, debit: 5, credit: 6 };

      const byFechaGiro = new Map<string, { cc: string; folio: string; fechaCobro: string | null }>();
      const byFechaAbono = new Map<string, { cc: string; folio: string; fechaCobro: string | null }>();
      const byMontoGiro = new Map<number, { fecha: string; obs: string; cc: string; folio: string; fechaCobro: string | null }[]>();
      const byMontoAbono = new Map<number, { fecha: string; obs: string; cc: string; folio: string; fechaCobro: string | null }[]>();

      for (let i = 1; i < rawRows.length; i++) {
        const r = rawRows[i];
        const fechaSerial = r[iCol.fecha];
        if (!fechaSerial || typeof fechaSerial !== "number") continue;
        const fecha = secExcelSerialToDate(fechaSerial);

        const obsSerialRaw = iCol.fechaCobro >= 0 ? r[iCol.fechaCobro] : null;
        const fechaCobro = typeof obsSerialRaw === "number" ? secExcelSerialToDate(obsSerialRaw) : null;

        const ccBase = String(r[iCol.cc] ?? "").trim();
        const ccRaw = ccBase
          ? (ccBase.startsWith("C-") ? ccBase : `C-${ccBase}`)
          : "";
        const obs = String(r[iCol.obs] ?? "").trim().toLowerCase();
        const folio = String(r[iCol.folio] ?? "").trim();

        const debit = typeof r[iCol.debit] === "number" && (r[iCol.debit] as number) > 0 ? (r[iCol.debit] as number) : null;
        const credit = typeof r[iCol.credit] === "number" && (r[iCol.credit] as number) > 0 ? (r[iCol.credit] as number) : null;

        if (debit) {
          byFechaGiro.set(`${fecha}|${debit}`, { cc: ccRaw, folio, fechaCobro });
          if (!byMontoGiro.has(debit)) byMontoGiro.set(debit, []);
          byMontoGiro.get(debit)!.push({ fecha, obs, cc: ccRaw, folio, fechaCobro });
        }
        if (credit) {
          byFechaAbono.set(`${fecha}|${credit}`, { cc: ccRaw, folio, fechaCobro });
          if (!byMontoAbono.has(credit)) byMontoAbono.set(credit, []);
          byMontoAbono.get(credit)!.push({ fecha, obs, cc: ccRaw, folio, fechaCobro });
        }
      }

      const WINDOW_DAYS = 30;

      const excelYears = new Set<string>();
      for (const key of byFechaGiro.keys()) {
        const y = key.split("|")[0].split("/")[2];
        if (y) excelYears.add(y);
      }
      for (const key of byFechaAbono.keys()) {
        const y = key.split("|")[0].split("/")[2];
        if (y) excelYears.add(y);
      }
      for (const entries of byMontoGiro.values()) {
        for (const e of entries) { const y = e.fecha.split("/")[2]; if (y) excelYears.add(y); }
      }
      for (const entries of byMontoAbono.values()) {
        for (const e of entries) { const y = e.fecha.split("/")[2]; if (y) excelYears.add(y); }
      }

      const securityFiles = await storage.getUploadedFiles("cartola_security");
      const existingSavedMap = await storage.getSavedCentroCostosMap();
      const upserts: { movementKey: string; centroCostos: string; revisado: number; fechaCobroOverride?: string | null; nDocumentoOverride?: string | null }[] = [];
      let pasada1 = 0, pasada2 = 0, sinMatch = 0, ambiguos = 0;

      for (const file of securityFiles) {
        const rows = (file.data || []) as Record<string, unknown>[];
        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx];
          if ((row as DataRow).__deleted) continue;
          const fechaRaw = String(row["Fecha"] ?? "").trim();
          if (!fechaRaw) continue;
          const fechaParts = fechaRaw.split("/");
          const fecha = fechaParts.length === 3
            ? `${fechaParts[0].padStart(2, "0")}/${fechaParts[1].padStart(2, "0")}/${fechaParts[2]}`
            : fechaRaw;

          const rowYear = fechaParts.length === 3 ? fechaParts[2] : "";
          if (excelYears.size > 0 && !excelYears.has(rowYear)) continue;

          const detalle = String(row["Detalle Movimiento"] ?? "").trim().toLowerCase();
          const cargoRaw = Number(String(row["Cargo"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          const abonoRaw = Number(String(row["Abono"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          const movementKey = `${file.id}|${rowIdx}`;

          let matchedCC: string | null = null;
          let matchMethod = "";
          let matchedFolio: string | null = null;
          let matchedFechaCobro: string | null = null;

          // Pasada 1: fecha exacta + monto exacto
          if (cargoRaw > 0 && byFechaGiro.has(`${fecha}|${cargoRaw}`)) {
            const entry = byFechaGiro.get(`${fecha}|${cargoRaw}`)!;
            matchedCC = entry.cc;
            matchedFolio = entry.folio || null;
            matchedFechaCobro = entry.fechaCobro;
            matchMethod = "pasada1";
          } else if (abonoRaw > 0 && byFechaAbono.has(`${fecha}|${abonoRaw}`)) {
            const entry = byFechaAbono.get(`${fecha}|${abonoRaw}`)!;
            matchedCC = entry.cc;
            matchedFolio = entry.folio || null;
            matchedFechaCobro = entry.fechaCobro;
            matchMethod = "pasada1";
          }

          // Pasada 2: monto + texto + ventana ±30 días
          if (matchMethod === "") {
            const candidates = cargoRaw > 0
              ? (byMontoGiro.get(cargoRaw) || [])
              : (byMontoAbono.get(abonoRaw) || []);

            if (candidates.length > 0) {
              const inWindow = candidates.filter(c => secDaysDiff(fecha, c.fecha) <= WINDOW_DAYS);
              if (inWindow.length > 0) {
                const textMatches = inWindow.filter(c => {
                  const words = c.obs.split(/\s+/).filter((w: string) => w.length >= 4);
                  return words.some((w: string) => detalle.includes(w));
                });
                if (textMatches.length === 1) {
                  matchedCC = textMatches[0].cc;
                  matchedFolio = textMatches[0].folio || null;
                  matchedFechaCobro = textMatches[0].fechaCobro;
                  matchMethod = "pasada2";
                } else if (textMatches.length > 1) {
                  ambiguos++;
                  continue;
                } else if (inWindow.length === 1) {
                  matchedCC = inWindow[0].cc;
                  matchedFolio = inWindow[0].folio || null;
                  matchedFechaCobro = inWindow[0].fechaCobro;
                  matchMethod = "pasada2";
                } else {
                  ambiguos++;
                  continue;
                }
              }
            }
          }

          if (matchMethod !== "") {
            const ccNorm = (matchedCC ?? "").trim().replace(/C-\s+/, "C-").trim();
            const finalCC = ccNorm || "C-NADA";
            const revisado = finalCC !== "C-NADA" ? 1 : 0;
            const fechaCobroOverride = matchedFechaCobro || null;
            const nDocumentoOverride = matchedFolio || null;
            upserts.push({ movementKey, centroCostos: finalCC, revisado, fechaCobroOverride, nDocumentoOverride });
            if (matchMethod === "pasada1") pasada1++; else pasada2++;
          } else {
            if (!existingSavedMap.has(movementKey)) {
              upserts.push({ movementKey, centroCostos: "C-NADA", revisado: 0, fechaCobroOverride: null, nDocumentoOverride: null });
            }
            sinMatch++;
          }
        }
      }

      if (upserts.length > 0) {
        await storage.bulkUpsertCentroCostosImport(upserts);
      }
      cacheInvalidateAll();

      const total = pasada1 + pasada2 + sinMatch + ambiguos;
      res.json({ pasada1, pasada2, sinMatch, ambiguos, total });
    } catch (error: any) {
      console.error("Import security centros de costos error:", error);
      res.status(500).json({ error: error.message || "Error al importar centros de costos" });
    }
  });

  app.get("/api/security-costos", async (_req, res) => {
    try {
      const files = await storage.getUploadedFiles("cartola_security");
      const rules = await storage.getCentroCostosRules();
      const reviewedKeys = await storage.getReviewedKeys();
      const savedCentrosMap = await storage.getSavedCentroCostosMap();
      const cobranzaFiles = await storage.getUploadedFiles("cobranza");
      const savedReviews = await storage.getFacturaReviews();
      const factComprasFiles = await storage.getUploadedFiles("fact_compras");
      const nDocOverrideMap = await storage.getNDocumentoOverrideMap();
      const fechaCobroMap = await storage.getFechaCobroMap();

      const cobranzaRowMap = new Map<string, Record<string, unknown>[]>();
      for (const cf of cobranzaFiles) {
        cobranzaRowMap.set(cf.id, (cf.data || []) as Record<string, unknown>[]);
      }

      const nDocMap = new Map<string, string[]>();

      for (const [mk, nd] of nDocOverrideMap) {
        nDocMap.set(mk, nd);
      }

      for (const review of savedReviews) {
        if (!review.cartolaMovementKey || !review.facturaKey) continue;
        if (nDocMap.has(review.cartolaMovementKey)) continue;
        const pipeIdx = review.facturaKey.indexOf("|");
        if (pipeIdx < 0) continue;
        const nDoc = review.facturaKey.slice(pipeIdx + 1).trim();
        if (nDoc) nDocMap.set(review.cartolaMovementKey, [nDoc]);
      }

      const parseSecDate = (dateStr: string): Date | null => {
        const parts = dateStr.split("/");
        if (parts.length !== 3) return null;
        const [d, m, y] = parts.map(Number);
        return new Date(y, m - 1, d);
      };
      const parseCobranzaDate = (dateStr: string): Date | null => {
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
      };

      const TIPOS_VALIDOS = ["FACTURA ELECTRÓNICA", "BOLETA ELECTRÓNICA"];
      type FacturaCandidate = { nDocumento: string; montoDocumento: number; emisionDate: Date };
      const facturasCandidatas: FacturaCandidate[] = [];
      for (const cf of cobranzaFiles) {
        const rows = cobranzaRowMap.get(cf.id) || [];
        for (const row of rows) {
          const tipoDoc = String(row["Tipo Documento"] ?? "").trim();
          if (!TIPOS_VALIDOS.includes(tipoDoc)) continue;
          const montoDocumento = Number(String(row["Monto Documento"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          if (montoDocumento <= 0) continue;
          const fechaEmision = String(row["Fecha Emisión"] ?? "").trim();
          const emisionDate = parseCobranzaDate(fechaEmision);
          if (!emisionDate) continue;
          const nDocumento = String(row["Nº Documento"] ?? "").trim();
          facturasCandidatas.push({ nDocumento, montoDocumento, emisionDate });
        }
      }

      const parseCompraDate = (val: unknown): Date | null => {
        const str = String(val ?? "").trim();
        if (!str || str === "null" || str === "undefined") return null;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return parseSecDate(str);
        const serial = Number(str);
        if (!isNaN(serial) && serial > 40000 && serial < 60000) {
          const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
          return isNaN(d.getTime()) ? null : d;
        }
        return null;
      };

      type CompraCandidate = { folio: string; montoTotal: number; emisionDate: Date };
      const comprasCandidatas: CompraCandidate[] = [];
      for (const cf of factComprasFiles) {
        const rows = (cf.data || []) as Record<string, unknown>[];
        for (const row of rows) {
          const montoTotal = Math.abs(Number(row["Monto Total"] ?? 0));
          if (montoTotal <= 0) continue;
          const emisionDate = parseCompraDate(row["Fecha Emisión"]);
          if (!emisionDate) continue;
          const folio = String(row["Folio"] ?? "").trim();
          if (!folio) continue;
          comprasCandidatas.push({ folio, montoTotal, emisionDate });
        }
      }

      const result: { fecha: string; detalle: string; monto: number; sucursal: string; centroCostos: string | null; revisado: boolean; movementKey: string; nDocumentos: string[]; nDocIsOverride: boolean; saldoBanco: number | null; fechaCobro: string }[] = [];
      const seenMovements = new Set<string>();

      for (const file of files) {
        const rows = (file.data || []) as Record<string, unknown>[];
        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx];
          const fecha = String(row["Fecha"] ?? "").trim();
          if (!fecha) continue;

          const detalle = String(row["Detalle Movimiento"] ?? "").trim();
          const cargo = Number(String(row["Cargo"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          const abono = Number(String(row["Abono"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;

          let monto = 0;
          if (cargo > 0) monto = -cargo;
          else if (abono > 0) monto = abono;

          const detalleFuzzy = detalle.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20);
          const dedupeKey = `${fecha}|${detalleFuzzy}|${monto}`;
          if (seenMovements.has(dedupeKey)) continue;
          seenMovements.add(dedupeKey);

          const movementKey = `${file.id}|${rowIdx}`;
          let centroCostos: string | null;
          if (savedCentrosMap.has(movementKey)) {
            centroCostos = savedCentrosMap.get(movementKey) ?? null;
          } else {
            centroCostos = predictCentroCostos(detalle, rules);
            if (!centroCostos && monto > 0) centroCostos = "C-VENTA";
          }
          const revisado = reviewedKeys.has(movementKey);

          if (!nDocMap.has(movementKey) && centroCostos === "C-VENTA" && abono > 0) {
            const rowDate = parseSecDate(fecha);
            if (rowDate) {
              const candidates = facturasCandidatas.filter(f => f.montoDocumento === abono && rowDate >= f.emisionDate);
              candidates.sort((a, b) => a.emisionDate.getTime() - b.emisionDate.getTime());
              if (candidates[0]) nDocMap.set(movementKey, [candidates[0].nDocumento]);
            }
          }

          if (!nDocMap.has(movementKey) && cargo > 0) {
            const rowDate = parseSecDate(fecha);
            if (rowDate) {
              const candidates = comprasCandidatas.filter(c => c.montoTotal === cargo && rowDate >= c.emisionDate);
              candidates.sort((a, b) => b.emisionDate.getTime() - a.emisionDate.getTime());
              if (candidates[0]) nDocMap.set(movementKey, [candidates[0].folio]);
            }
          }

          const rawSaldo = row["Saldo"];
          const saldoBanco = rawSaldo !== undefined && rawSaldo !== ""
            ? Number(String(rawSaldo).replace(/[^0-9.-]/g, "")) || null
            : null;

          const sucursal = String(row["Docto. Nro."] ?? "").trim();
          const fechaCobro = fechaCobroMap.get(movementKey) ?? fecha;
          result.push({ fecha, detalle, monto, sucursal, centroCostos, revisado, movementKey, nDocumentos: nDocMap.get(movementKey) ?? [], nDocIsOverride: nDocOverrideMap.has(movementKey), saldoBanco, fechaCobro });
        }
      }

      result.sort((a, b) => {
        const [da, ma, ya] = a.fecha.split("/").map(Number);
        const [db, mb, yb] = b.fecha.split("/").map(Number);
        return (yb * 10000 + mb * 100 + db) - (ya * 10000 + ma * 100 + da);
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/security-costos/save-cc", async (req, res) => {
    try {
      const { movementKey, centroCostos } = req.body;
      if (!movementKey) return res.status(400).json({ error: "movementKey es requerido" });
      await storage.saveCentroCostosForMovement(movementKey, centroCostos ?? null);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/security-costos/review", async (req, res) => {
    try {
      const { movementKey, revisado } = req.body;
      if (!movementKey || typeof revisado !== "boolean") {
        return res.status(400).json({ error: "movementKey y revisado son requeridos" });
      }
      await storage.setReview(movementKey, revisado);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/security-costos/candidatos-ndoc", async (_req, res) => {
    try {
      type Candidato = { nDocumento: string; tipo: string; monto: number; fecha: string; descripcion: string };
      const seen = new Set<string>();
      const candidatos: Candidato[] = [];

      const TIPOS_VALIDOS_CAND = ["FACTURA ELECTRÓNICA", "BOLETA ELECTRÓNICA"];
      const cobranzaFiles = await storage.getUploadedFiles("cobranza");
      for (const cf of cobranzaFiles) {
        const rows = (cf.data || []) as Record<string, unknown>[];
        for (const row of rows) {
          const tipoDoc = String(row["Tipo Documento"] ?? "").trim();
          if (!TIPOS_VALIDOS_CAND.includes(tipoDoc)) continue;
          const nDocumento = String(row["Nº Documento"] ?? "").trim();
          if (!nDocumento || seen.has(`c|${nDocumento}`)) continue;
          seen.add(`c|${nDocumento}`);
          const monto = Number(String(row["Monto Documento"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          const fecha = String(row["Fecha Emisión"] ?? "").trim();
          const descripcion = String(row["Nombre Cliente"] ?? row["Cliente"] ?? "").trim();
          candidatos.push({ nDocumento, tipo: tipoDoc, monto, fecha, descripcion });
        }
      }

      const factComprasFiles = await storage.getUploadedFiles("fact_compras");
      for (const cf of factComprasFiles) {
        const rows = (cf.data || []) as Record<string, unknown>[];
        for (const row of rows) {
          const folio = String(row["Folio"] ?? "").trim();
          if (!folio || seen.has(`fc|${folio}`)) continue;
          seen.add(`fc|${folio}`);
          const monto = Number(String(row["Monto Total"] ?? row["Monto Neto"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          const fecha = String(row["Fecha Emisión"] ?? "").trim();
          const descripcion = String(row["Proveedor"] ?? row["RazonSocial"] ?? row["Razón Social"] ?? "").trim();
          candidatos.push({ nDocumento: folio, tipo: "FACTURA COMPRA", monto, fecha, descripcion });
        }
      }

      res.json(candidatos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/security-costos/save-ndocumento", async (req, res) => {
    try {
      const { movementKey, nDocumentos } = req.body;
      if (!movementKey) return res.status(400).json({ error: "movementKey es requerido" });
      const docs: string[] = Array.isArray(nDocumentos) ? nDocumentos.filter(Boolean) : [];
      await storage.saveNDocumentoOverride(movementKey, docs);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/security-costos/save-fecha-cobro", async (req, res) => {
    try {
      const { movementKey, fechaCobro } = req.body;
      if (!movementKey) return res.status(400).json({ error: "movementKey es requerido" });
      await storage.saveFechaCobro(movementKey, fechaCobro ?? null);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/security-costos/rules", async (_req, res) => {
    try {
      const rules = await storage.getCentroCostosRules();
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/security-costos/rules", async (req, res) => {
    try {
      const { pattern, centroCostos, matchType, priority, movementKey } = req.body;
      if (!pattern || !centroCostos) return res.status(400).json({ error: "pattern y centroCostos son requeridos" });

      if (movementKey) {
        const oldRules = await storage.getCentroCostosRules();
        const existingSavedMap = await storage.getSavedCentroCostosMap();
        const reviewedKeysForRules = await storage.getReviewedKeys();
        const securityFiles = await storage.getUploadedFiles("cartola_security");

        for (const file of securityFiles) {
          const rows = (file.data || []) as Record<string, unknown>[];
          for (let idx = 0; idx < rows.length; idx++) {
            if ((rows[idx] as DataRow).__deleted) continue;
            const rowMovementKey = `${file.id}|${idx}`;
            if (rowMovementKey === movementKey) continue;
            if (existingSavedMap.has(rowMovementKey)) continue;
            if (reviewedKeysForRules.has(rowMovementKey)) continue;

            const detalle = String(rows[idx]["Detalle Movimiento"] ?? "").trim();
            const cargo = Number(String(rows[idx]["Cargo"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
            const abono = Number(String(rows[idx]["Abono"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
            const monto = cargo > 0 ? -cargo : abono > 0 ? abono : 0;

            let currentCC = predictCentroCostos(detalle, oldRules);
            if (!currentCC && monto > 0) currentCC = "C-VENTA";
            await storage.saveCentroCostosForMovement(rowMovementKey, currentCC);
          }
        }
      }

      const rule = await storage.upsertCentroCostosRule({
        pattern,
        centroCostos,
        matchType: matchType || "contains",
        priority: priority ?? 20,
      });
      if (movementKey) await storage.saveCentroCostosForMovement(movementKey, centroCostos);
      res.json(rule);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/security-costos/rules/:id", async (req, res) => {
    try {
      const updated = await storage.updateCentroCostosRule(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Regla no encontrada" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/security-costos/rules/:id", async (req, res) => {
    try {
      await storage.deleteCentroCostosRule(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/falabella-costos", async (_req, res) => {
    try {
      const files = await storage.getUploadedFiles("cartola_falabella");
      const rules = await storage.getCentroCostosRules();
      const reviewedKeys = await storage.getReviewedKeys();
      const savedCentrosMap = await storage.getSavedCentroCostosMap();
      const cobranzaFiles = await storage.getUploadedFiles("cobranza");
      const savedReviews = await storage.getFacturaReviews();
      const factComprasFiles = await storage.getUploadedFiles("fact_compras");
      const nDocOverrideMap = await storage.getNDocumentoOverrideMap();
      const fechaCobroMap = await storage.getFechaCobroMap();

      const cobranzaRowMap = new Map<string, Record<string, unknown>[]>();
      for (const cf of cobranzaFiles) {
        cobranzaRowMap.set(cf.id, (cf.data || []) as Record<string, unknown>[]);
      }

      const nDocMap = new Map<string, string[]>();
      for (const [mk, nd] of nDocOverrideMap) {
        nDocMap.set(mk, nd);
      }

      for (const review of savedReviews) {
        if (!review.cartolaMovementKey || !review.facturaKey) continue;
        if (nDocMap.has(review.cartolaMovementKey)) continue;
        const pipeIdx = review.facturaKey.indexOf("|");
        if (pipeIdx < 0) continue;
        const nDoc = review.facturaKey.slice(pipeIdx + 1).trim();
        if (nDoc) nDocMap.set(review.cartolaMovementKey, [nDoc]);
      }

      const parseFalDate = (dateStr: string): Date | null => {
        const parts = dateStr.split("/");
        if (parts.length !== 3) return null;
        const [d, m, y] = parts.map(Number);
        return new Date(y, m - 1, d);
      };
      const parseCobranzaDateFal = (dateStr: string): Date | null => {
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
      };

      const TIPOS_VALIDOS_FAL = ["FACTURA ELECTRÓNICA", "BOLETA ELECTRÓNICA"];
      type FacturaCandidateFal = { nDocumento: string; montoDocumento: number; emisionDate: Date };
      const facturasCandidatas: FacturaCandidateFal[] = [];
      for (const cf of cobranzaFiles) {
        const rows = cobranzaRowMap.get(cf.id) || [];
        for (const row of rows) {
          const tipoDoc = String(row["Tipo Documento"] ?? "").trim();
          if (!TIPOS_VALIDOS_FAL.includes(tipoDoc)) continue;
          const montoDocumento = Number(String(row["Monto Documento"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          if (montoDocumento <= 0) continue;
          const fechaEmision = String(row["Fecha Emisión"] ?? "").trim();
          const emisionDate = parseCobranzaDateFal(fechaEmision);
          if (!emisionDate) continue;
          const nDocumento = String(row["Nº Documento"] ?? "").trim();
          facturasCandidatas.push({ nDocumento, montoDocumento, emisionDate });
        }
      }

      const parseCompraDateFal = (val: unknown): Date | null => {
        const str = String(val ?? "").trim();
        if (!str || str === "null" || str === "undefined") return null;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return parseFalDate(str);
        const serial = Number(str);
        if (!isNaN(serial) && serial > 40000 && serial < 60000) {
          const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
          return isNaN(d.getTime()) ? null : d;
        }
        return null;
      };

      type CompraCandidateFal = { folio: string; montoTotal: number; emisionDate: Date };
      const comprasCandidatas: CompraCandidateFal[] = [];
      for (const cf of factComprasFiles) {
        const rows = (cf.data || []) as Record<string, unknown>[];
        for (const row of rows) {
          const montoTotal = Math.abs(Number(row["Monto Total"] ?? 0));
          if (montoTotal <= 0) continue;
          const emisionDate = parseCompraDateFal(row["Fecha Emisión"]);
          if (!emisionDate) continue;
          const folio = String(row["Folio"] ?? "").trim();
          if (!folio) continue;
          comprasCandidatas.push({ folio, montoTotal, emisionDate });
        }
      }

      const result: { fecha: string; detalle: string; monto: number; sucursal: string; centroCostos: string | null; revisado: boolean; movementKey: string; nDocumentos: string[]; nDocIsOverride: boolean; saldoBanco: number | null; fechaCobro: string }[] = [];
      const seenMovements = new Set<string>();

      for (const file of files) {
        const rows = (file.data || []) as Record<string, unknown>[];
        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx];
          const fecha = String(row["Fecha"] ?? "").trim();
          if (!fecha) continue;

          const detalle = String(row["Descripción"] ?? "").trim();
          const cargo = Number(row["Cargo"] ?? 0) || 0;
          const abono = Number(row["Abono"] ?? 0) || 0;

          let monto = 0;
          if (cargo > 0) monto = -cargo;
          else if (abono > 0) monto = abono;

          const detalleFuzzy = detalle.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20);
          const dedupeKey = `${fecha}|${detalleFuzzy}|${monto}`;
          if (seenMovements.has(dedupeKey)) continue;
          seenMovements.add(dedupeKey);

          const movementKey = `${file.id}|${rowIdx}`;
          let centroCostos: string | null;
          if (savedCentrosMap.has(movementKey)) {
            centroCostos = savedCentrosMap.get(movementKey) ?? null;
          } else {
            centroCostos = predictCentroCostos(detalle, rules);
            if (!centroCostos && monto > 0) centroCostos = "C-VENTA";
          }
          const revisado = reviewedKeys.has(movementKey);

          if (!nDocMap.has(movementKey) && centroCostos === "C-VENTA" && abono > 0) {
            const rowDate = parseFalDate(fecha);
            if (rowDate) {
              const candidates = facturasCandidatas.filter(f => f.montoDocumento === abono && rowDate >= f.emisionDate);
              candidates.sort((a, b) => a.emisionDate.getTime() - b.emisionDate.getTime());
              if (candidates[0]) nDocMap.set(movementKey, [candidates[0].nDocumento]);
            }
          }

          if (!nDocMap.has(movementKey) && cargo > 0) {
            const rowDate = parseFalDate(fecha);
            if (rowDate) {
              const candidates = comprasCandidatas.filter(c => c.montoTotal === cargo && rowDate >= c.emisionDate);
              candidates.sort((a, b) => b.emisionDate.getTime() - a.emisionDate.getTime());
              if (candidates[0]) nDocMap.set(movementKey, [candidates[0].folio]);
            }
          }

          const rawSaldo = row["Saldo"];
          const saldoBanco = rawSaldo !== undefined && rawSaldo !== ""
            ? Number(String(rawSaldo).replace(/[^0-9.-]/g, "")) || null
            : null;

          const sucursal = String(row["Nro Doc"] ?? "").trim();
          const fechaCobro = fechaCobroMap.get(movementKey) ?? fecha;
          result.push({ fecha, detalle, monto, sucursal, centroCostos, revisado, movementKey, nDocumentos: nDocMap.get(movementKey) ?? [], nDocIsOverride: nDocOverrideMap.has(movementKey), saldoBanco, fechaCobro });
        }
      }

      result.sort((a, b) => {
        const [da, ma, ya] = a.fecha.split("/").map(Number);
        const [db, mb, yb] = b.fecha.split("/").map(Number);
        return (yb * 10000 + mb * 100 + db) - (ya * 10000 + ma * 100 + da);
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/falabella-costos/save-cc", async (req, res) => {
    try {
      const { movementKey, centroCostos } = req.body;
      if (!movementKey) return res.status(400).json({ error: "movementKey es requerido" });
      await storage.saveCentroCostosForMovement(movementKey, centroCostos ?? null);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/falabella-costos/review", async (req, res) => {
    try {
      const { movementKey, revisado } = req.body;
      if (!movementKey || typeof revisado !== "boolean") {
        return res.status(400).json({ error: "movementKey y revisado son requeridos" });
      }
      await storage.setReview(movementKey, revisado);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/falabella-costos/candidatos-ndoc", async (_req, res) => {
    try {
      type Candidato = { nDocumento: string; tipo: string; monto: number; fecha: string; descripcion: string };
      const seen = new Set<string>();
      const candidatos: Candidato[] = [];

      const TIPOS_VALIDOS_CAND = ["FACTURA ELECTRÓNICA", "BOLETA ELECTRÓNICA"];
      const cobranzaFiles = await storage.getUploadedFiles("cobranza");
      for (const cf of cobranzaFiles) {
        const rows = (cf.data || []) as Record<string, unknown>[];
        for (const row of rows) {
          const tipoDoc = String(row["Tipo Documento"] ?? "").trim();
          if (!TIPOS_VALIDOS_CAND.includes(tipoDoc)) continue;
          const nDocumento = String(row["Nº Documento"] ?? "").trim();
          if (!nDocumento || seen.has(`c|${nDocumento}`)) continue;
          seen.add(`c|${nDocumento}`);
          const monto = Number(String(row["Monto Documento"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          const fecha = String(row["Fecha Emisión"] ?? "").trim();
          const descripcion = String(row["Nombre Cliente"] ?? row["Cliente"] ?? "").trim();
          candidatos.push({ nDocumento, tipo: tipoDoc, monto, fecha, descripcion });
        }
      }

      const factComprasFiles = await storage.getUploadedFiles("fact_compras");
      for (const cf of factComprasFiles) {
        const rows = (cf.data || []) as Record<string, unknown>[];
        for (const row of rows) {
          const folio = String(row["Folio"] ?? "").trim();
          if (!folio || seen.has(`fc|${folio}`)) continue;
          seen.add(`fc|${folio}`);
          const monto = Number(String(row["Monto Total"] ?? row["Monto Neto"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          const fecha = String(row["Fecha Emisión"] ?? "").trim();
          const descripcion = String(row["Proveedor"] ?? row["RazonSocial"] ?? row["Razón Social"] ?? "").trim();
          candidatos.push({ nDocumento: folio, tipo: "FACTURA COMPRA", monto, fecha, descripcion });
        }
      }

      res.json(candidatos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/falabella-costos/save-ndocumento", async (req, res) => {
    try {
      const { movementKey, nDocumentos } = req.body;
      if (!movementKey) return res.status(400).json({ error: "movementKey es requerido" });
      const docs: string[] = Array.isArray(nDocumentos) ? nDocumentos.filter(Boolean) : [];
      await storage.saveNDocumentoOverride(movementKey, docs);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/falabella-costos/save-fecha-cobro", async (req, res) => {
    try {
      const { movementKey, fechaCobro } = req.body;
      if (!movementKey) return res.status(400).json({ error: "movementKey es requerido" });
      await storage.saveFechaCobro(movementKey, fechaCobro ?? null);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/falabella-costos/rules", async (_req, res) => {
    try {
      const rules = await storage.getCentroCostosRules();
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/falabella-costos/rules", async (req, res) => {
    try {
      const { pattern, centroCostos, matchType, priority, movementKey } = req.body;
      if (!pattern || !centroCostos) return res.status(400).json({ error: "pattern y centroCostos son requeridos" });

      if (movementKey) {
        const oldRules = await storage.getCentroCostosRules();
        const existingSavedMap = await storage.getSavedCentroCostosMap();
        const reviewedKeysForRules = await storage.getReviewedKeys();
        const falabellaFiles = await storage.getUploadedFiles("cartola_falabella");

        for (const file of falabellaFiles) {
          const rows = (file.data || []) as Record<string, unknown>[];
          for (let idx = 0; idx < rows.length; idx++) {
            if ((rows[idx] as DataRow).__deleted) continue;
            const rowMovementKey = `${file.id}|${idx}`;
            if (rowMovementKey === movementKey) continue;
            if (existingSavedMap.has(rowMovementKey)) continue;
            if (reviewedKeysForRules.has(rowMovementKey)) continue;

            const detalle = String(rows[idx]["Descripción"] ?? "").trim();
            const cargo = Number(rows[idx]["Cargo"] ?? 0) || 0;
            const abono = Number(rows[idx]["Abono"] ?? 0) || 0;
            const monto = cargo > 0 ? -cargo : abono > 0 ? abono : 0;

            let currentCC = predictCentroCostos(detalle, oldRules);
            if (!currentCC && monto > 0) currentCC = "C-VENTA";
            await storage.saveCentroCostosForMovement(rowMovementKey, currentCC);
          }
        }
      }

      const rule = await storage.upsertCentroCostosRule({
        pattern,
        centroCostos,
        matchType: matchType || "contains",
        priority: priority ?? 20,
      });
      if (movementKey) await storage.saveCentroCostosForMovement(movementKey, centroCostos);
      res.json(rule);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/falabella-costos/rules/:id", async (req, res) => {
    try {
      const updated = await storage.updateCentroCostosRule(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Regla no encontrada" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/falabella-costos/rules/:id", async (req, res) => {
    try {
      await storage.deleteCentroCostosRule(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Helper: build a Global66 Caja API for one currency ───────────────────
  function registerGlobal66CajaRoutes(fileType: "cartola_global66_clp" | "cartola_global66_usd") {
    const prefix = fileType === "cartola_global66_clp" ? "/api/global66-clp-costos" : "/api/global66-usd-costos";

    app.get(prefix, async (_req, res) => {
      try {
        const files = await storage.getUploadedFiles(fileType);
        const rules = await storage.getCentroCostosRules();
        const reviewedKeys = await storage.getReviewedKeys();
        const savedCentrosMap = await storage.getSavedCentroCostosMap();
        const cobranzaFiles = await storage.getUploadedFiles("cobranza");
        const savedReviews = await storage.getFacturaReviews();
        const factComprasFiles = await storage.getUploadedFiles("fact_compras");
        const nDocOverrideMap = await storage.getNDocumentoOverrideMap();
        const fechaCobroMap = await storage.getFechaCobroMap();

        const cobranzaRowMap = new Map<string, Record<string, unknown>[]>();
        for (const cf of cobranzaFiles) {
          cobranzaRowMap.set(cf.id, (cf.data || []) as Record<string, unknown>[]);
        }

        const nDocMap = new Map<string, string[]>();
        for (const [mk, nd] of nDocOverrideMap) nDocMap.set(mk, nd);

        for (const review of savedReviews) {
          if (!review.cartolaMovementKey || !review.facturaKey) continue;
          if (nDocMap.has(review.cartolaMovementKey)) continue;
          const pipeIdx = review.facturaKey.indexOf("|");
          if (pipeIdx < 0) continue;
          const nDoc = review.facturaKey.slice(pipeIdx + 1).trim();
          if (nDoc) nDocMap.set(review.cartolaMovementKey, [nDoc]);
        }

        const parseG66Date = (dateStr: string): Date | null => {
          const parts = dateStr.split("/");
          if (parts.length !== 3) return null;
          const [d, m, y] = parts.map(Number);
          return new Date(y, m - 1, d);
        };
        const parseCobranzaDate = (dateStr: string): Date | null => {
          const d = new Date(dateStr);
          return isNaN(d.getTime()) ? null : d;
        };
        const parseCompraDate = (val: unknown): Date | null => {
          const str = String(val ?? "").trim();
          if (!str || str === "null") return null;
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return parseG66Date(str);
          const serial = Number(str);
          if (!isNaN(serial) && serial > 40000 && serial < 60000) {
            const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
            return isNaN(d.getTime()) ? null : d;
          }
          return null;
        };

        const TIPOS_VALIDOS = ["FACTURA ELECTRÓNICA", "BOLETA ELECTRÓNICA"];
        type FacturaCandidateG66 = { nDocumento: string; montoDocumento: number; emisionDate: Date };
        const facturasCandidatas: FacturaCandidateG66[] = [];
        for (const cf of cobranzaFiles) {
          const rows = cobranzaRowMap.get(cf.id) || [];
          for (const row of rows) {
            const tipoDoc = String(row["Tipo Documento"] ?? "").trim();
            if (!TIPOS_VALIDOS.includes(tipoDoc)) continue;
            const montoDocumento = Number(String(row["Monto Documento"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
            if (montoDocumento <= 0) continue;
            const emisionDate = parseCobranzaDate(String(row["Fecha Emisión"] ?? "").trim());
            if (!emisionDate) continue;
            const nDocumento = String(row["Nº Documento"] ?? "").trim();
            facturasCandidatas.push({ nDocumento, montoDocumento, emisionDate });
          }
        }

        type CompraCandidateG66 = { folio: string; montoTotal: number; emisionDate: Date };
        const comprasCandidatas: CompraCandidateG66[] = [];
        for (const cf of factComprasFiles) {
          const rows = (cf.data || []) as Record<string, unknown>[];
          for (const row of rows) {
            const montoTotal = Math.abs(Number(row["Monto Total"] ?? 0));
            if (montoTotal <= 0) continue;
            const emisionDate = parseCompraDate(row["Fecha Emisión"]);
            if (!emisionDate) continue;
            const folio = String(row["Folio"] ?? "").trim();
            if (!folio) continue;
            comprasCandidatas.push({ folio, montoTotal, emisionDate });
          }
        }

        const result: {
          fecha: string; detalle: string; monto: number; debito: number; abono: number;
          movimientoNro: string; centroCostos: string | null; revisado: boolean;
          movementKey: string; nDocumentos: string[]; nDocIsOverride: boolean;
          saldoBanco: number | null; fechaCobro: string;
        }[] = [];
        const seenMovements = new Set<string>();

        for (const file of files) {
          const rows = (file.data || []) as Record<string, unknown>[];
          for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
            const row = rows[rowIdx];
            if ((row as DataRow).__deleted) continue;
            const fecha = String(row["Fecha"] ?? "").trim();
            if (!fecha) continue;

            const detalle = String(row["Descripción"] ?? "").trim();
            const debito = Number(row["Débito"] ?? 0) || 0;
            const abono = Number(row["Abono"] ?? 0) || 0;
            const movimientoNro = String(row["Movimiento"] ?? "").trim();

            let monto = 0;
            if (debito > 0) monto = -debito;
            else if (abono > 0) monto = abono;

            const detalleFuzzy = detalle.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20);
            const dedupeKey = `${fecha}|${detalleFuzzy}|${monto}`;
            if (seenMovements.has(dedupeKey)) continue;
            seenMovements.add(dedupeKey);

            const movementKey = `${file.id}|${rowIdx}`;
            let centroCostos: string | null;
            if (savedCentrosMap.has(movementKey)) {
              centroCostos = savedCentrosMap.get(movementKey) ?? null;
            } else {
              centroCostos = predictCentroCostos(detalle, rules);
              if (!centroCostos && monto > 0) centroCostos = "C-VENTA";
            }
            const revisado = reviewedKeys.has(movementKey);

            if (!nDocMap.has(movementKey) && centroCostos === "C-VENTA" && abono > 0) {
              const rowDate = parseG66Date(fecha);
              if (rowDate) {
                const candidates = facturasCandidatas.filter(f => f.montoDocumento === abono && rowDate >= f.emisionDate);
                candidates.sort((a, b) => a.emisionDate.getTime() - b.emisionDate.getTime());
                if (candidates[0]) nDocMap.set(movementKey, [candidates[0].nDocumento]);
              }
            }

            if (!nDocMap.has(movementKey) && debito > 0) {
              const rowDate = parseG66Date(fecha);
              if (rowDate) {
                const candidates = comprasCandidatas.filter(c => c.montoTotal === debito && rowDate >= c.emisionDate);
                candidates.sort((a, b) => b.emisionDate.getTime() - a.emisionDate.getTime());
                if (candidates[0]) nDocMap.set(movementKey, [candidates[0].folio]);
              }
            }

            const rawSaldo = row["Saldo"];
            const saldoBanco = rawSaldo !== undefined && rawSaldo !== ""
              ? Number(String(rawSaldo).replace(/[^0-9.-]/g, "")) || null
              : null;

            const fechaCobro = fechaCobroMap.get(movementKey) ?? fecha;
            result.push({ fecha, detalle, monto, debito, abono, movimientoNro, centroCostos, revisado, movementKey, nDocumentos: nDocMap.get(movementKey) ?? [], nDocIsOverride: nDocOverrideMap.has(movementKey), saldoBanco, fechaCobro });
          }
        }

        result.sort((a, b) => {
          const [da, ma, ya] = a.fecha.split("/").map(Number);
          const [db, mb, yb] = b.fecha.split("/").map(Number);
          return (yb * 10000 + mb * 100 + db) - (ya * 10000 + ma * 100 + da);
        });

        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post(`${prefix}/save-cc`, async (req, res) => {
      try {
        const { movementKey, centroCostos } = req.body;
        if (!movementKey) return res.status(400).json({ error: "movementKey es requerido" });
        await storage.saveCentroCostosForMovement(movementKey, centroCostos ?? null);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post(`${prefix}/review`, async (req, res) => {
      try {
        const { movementKey, revisado } = req.body;
        if (!movementKey || typeof revisado !== "boolean") {
          return res.status(400).json({ error: "movementKey y revisado son requeridos" });
        }
        await storage.setReview(movementKey, revisado);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post(`${prefix}/save-ndocumento`, async (req, res) => {
      try {
        const { movementKey, nDocumentos } = req.body;
        if (!movementKey) return res.status(400).json({ error: "movementKey es requerido" });
        const docs: string[] = Array.isArray(nDocumentos) ? nDocumentos.filter(Boolean) : [];
        await storage.saveNDocumentoOverride(movementKey, docs);
        res.json({ ok: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post(`${prefix}/save-fecha-cobro`, async (req, res) => {
      try {
        const { movementKey, fechaCobro } = req.body;
        if (!movementKey) return res.status(400).json({ error: "movementKey es requerido" });
        await storage.saveFechaCobro(movementKey, fechaCobro ?? null);
        res.json({ ok: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    app.get(`${prefix}/candidatos-ndoc`, async (_req, res) => {
      try {
        type Candidato = { nDocumento: string; tipo: string; monto: number; fecha: string; descripcion: string };
        const seen = new Set<string>();
        const candidatos: Candidato[] = [];

        const TIPOS_VALIDOS_CAND = ["FACTURA ELECTRÓNICA", "BOLETA ELECTRÓNICA"];
        const cobranzaFiles = await storage.getUploadedFiles("cobranza");
        for (const cf of cobranzaFiles) {
          const rows = (cf.data || []) as Record<string, unknown>[];
          for (const row of rows) {
            const tipoDoc = String(row["Tipo Documento"] ?? "").trim();
            if (!TIPOS_VALIDOS_CAND.includes(tipoDoc)) continue;
            const nDocumento = String(row["Nº Documento"] ?? "").trim();
            if (!nDocumento || seen.has(`c|${nDocumento}`)) continue;
            seen.add(`c|${nDocumento}`);
            const monto = Number(String(row["Monto Documento"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
            const fecha = String(row["Fecha Emisión"] ?? "").trim();
            const descripcion = String(row["Nombre Cliente"] ?? row["Cliente"] ?? "").trim();
            candidatos.push({ nDocumento, tipo: tipoDoc, monto, fecha, descripcion });
          }
        }

        const factComprasFiles = await storage.getUploadedFiles("fact_compras");
        for (const cf of factComprasFiles) {
          const rows = (cf.data || []) as Record<string, unknown>[];
          for (const row of rows) {
            const folio = String(row["Folio"] ?? "").trim();
            if (!folio || seen.has(`fc|${folio}`)) continue;
            seen.add(`fc|${folio}`);
            const monto = Number(String(row["Monto Total"] ?? row["Monto Neto"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
            const fecha = String(row["Fecha Emisión"] ?? "").trim();
            const descripcion = String(row["Proveedor"] ?? row["RazonSocial"] ?? row["Razón Social"] ?? "").trim();
            candidatos.push({ nDocumento: folio, tipo: "FACTURA COMPRA", monto, fecha, descripcion });
          }
        }

        res.json(candidatos);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  registerGlobal66CajaRoutes("cartola_global66_clp");
  registerGlobal66CajaRoutes("cartola_global66_usd");

  // ─── Vista general: todos los movimientos de todos los bancos ─────────────
  app.get("/api/movimientos-general", requireAppAccess, async (_req, res) => {
    try {
      const cached = cacheGet<unknown[]>("cc:general");
      if (cached !== undefined && cached.length > 0) return res.json(cached);

      const [rules, reviewedKeys, savedCentrosMap, nDocOverrideMap, fechaCobroMap, savedReviews] = await Promise.all([
        storage.getCentroCostosRules(),
        storage.getReviewedKeys(),
        storage.getSavedCentroCostosMap(),
        storage.getNDocumentoOverrideMap(),
        storage.getFechaCobroMap(),
        storage.getFacturaReviews(),
      ]);

      const nDocMap = new Map<string, string[]>();
      for (const [mk, nd] of nDocOverrideMap) nDocMap.set(mk, nd);
      for (const review of savedReviews) {
        if (!review.cartolaMovementKey || !review.facturaKey) continue;
        if (nDocMap.has(review.cartolaMovementKey)) continue;
        const pipeIdx = review.facturaKey.indexOf("|");
        if (pipeIdx < 0) continue;
        const nDoc = review.facturaKey.slice(pipeIdx + 1).trim();
        if (nDoc) nDocMap.set(review.cartolaMovementKey, [nDoc]);
      }

      type GenRow = {
        banco: string; fecha: string; fechaCobro: string; detalle: string;
        monto: number; moneda: "CLP" | "USD"; saldo: number | null;
        centroCostos: string | null; nDocumentos: string[]; revisado: boolean; movementKey: string;
      };

      const getCC = (movementKey: string, detalle: string, monto: number, builtIn?: string | null): string | null => {
        if (savedCentrosMap.has(movementKey)) return savedCentrosMap.get(movementKey) ?? null;
        const predicted = predictCentroCostos(detalle, rules) ?? builtIn ?? null;
        if (!predicted && monto > 0) return "C-VENTA";
        return predicted;
      };

      const parseSaldo = (raw: unknown): number | null => {
        if (raw === undefined || raw === "" || raw === null) return null;
        return Number(String(raw).replace(/[^0-9.-]/g, "")) || null;
      };

      const result: GenRow[] = [];

      // 1. Banco de Chile
      const cartolaFiles = await storage.getUploadedFiles("cartola");
      console.log("[movimientos-general] cartola files:", cartolaFiles.length);
      for (const file of cartolaFiles) {
        const rows = (file.data || []) as Record<string, unknown>[];
        console.log("[movimientos-general] cartola file", file.id, "rows:", rows.length);
        if (rows.length > 0) console.log("[movimientos-general] first row keys:", Object.keys(rows[0] as object));
        const seen = new Set<string>();
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const fecha = String(row["Fecha"] ?? "").trim(); if (!fecha) continue;
          const detalle = String(row["Detalle Movimiento"] ?? "").trim();
          const cargo = Number(String(row["Cheque o Cargo"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          const deposito = Number(String(row["Deposito o Abono"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          const monto = cargo > 0 ? -cargo : deposito > 0 ? deposito : 0;
          const dk = `${fecha}|${detalle.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20)}|${monto}`;
          if (seen.has(dk)) continue; seen.add(dk);
          const movementKey = `${file.id}|${i}`;
          result.push({ banco: "Banco de Chile", fecha, fechaCobro: fechaCobroMap.get(movementKey) ?? fecha, detalle, monto, moneda: "CLP", saldo: parseSaldo(row["Saldo"]), centroCostos: getCC(movementKey, detalle, monto, predictBuiltInCCCartola(detalle)), nDocumentos: nDocMap.get(movementKey) ?? [], revisado: reviewedKeys.has(movementKey), movementKey });
        }
      }

      // 2. Banco Security
      for (const file of await storage.getUploadedFiles("cartola_security")) {
        const rows = (file.data || []) as Record<string, unknown>[];
        const seen = new Set<string>();
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const fecha = String(row["Fecha"] ?? "").trim(); if (!fecha) continue;
          const detalle = String(row["Detalle Movimiento"] ?? "").trim();
          const cargo = Number(String(row["Cargo"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          const abono = Number(String(row["Abono"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          const monto = cargo > 0 ? -cargo : abono > 0 ? abono : 0;
          const dk = `${fecha}|${detalle.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20)}|${monto}`;
          if (seen.has(dk)) continue; seen.add(dk);
          const movementKey = `${file.id}|${i}`;
          result.push({ banco: "Banco Security", fecha, fechaCobro: fechaCobroMap.get(movementKey) ?? fecha, detalle, monto, moneda: "CLP", saldo: parseSaldo(row["Saldo"]), centroCostos: getCC(movementKey, detalle, monto), nDocumentos: nDocMap.get(movementKey) ?? [], revisado: reviewedKeys.has(movementKey), movementKey });
        }
      }

      // 3. Falabella
      for (const file of await storage.getUploadedFiles("cartola_falabella")) {
        const rows = (file.data || []) as Record<string, unknown>[];
        const seen = new Set<string>();
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const fecha = String(row["Fecha"] ?? "").trim(); if (!fecha) continue;
          const detalle = String(row["Descripción"] ?? "").trim();
          const cargo = Number(row["Cargo"] ?? 0) || 0;
          const abono = Number(row["Abono"] ?? 0) || 0;
          const monto = cargo > 0 ? -cargo : abono > 0 ? abono : 0;
          const dk = `${fecha}|${detalle.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20)}|${monto}`;
          if (seen.has(dk)) continue; seen.add(dk);
          const movementKey = `${file.id}|${i}`;
          result.push({ banco: "Falabella", fecha, fechaCobro: fechaCobroMap.get(movementKey) ?? fecha, detalle, monto, moneda: "CLP", saldo: parseSaldo(row["Saldo"]), centroCostos: getCC(movementKey, detalle, monto), nDocumentos: nDocMap.get(movementKey) ?? [], revisado: reviewedKeys.has(movementKey), movementKey });
        }
      }

      // 4. Global66 CLP
      for (const file of await storage.getUploadedFiles("cartola_global66_clp")) {
        const rows = (file.data || []) as Record<string, unknown>[];
        const seen = new Set<string>();
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if ((row as DataRow).__deleted) continue;
          const fecha = String(row["Fecha"] ?? "").trim(); if (!fecha) continue;
          const detalle = String(row["Descripción"] ?? "").trim();
          const debito = Number(row["Débito"] ?? 0) || 0;
          const abono = Number(row["Abono"] ?? 0) || 0;
          const monto = debito > 0 ? -debito : abono > 0 ? abono : 0;
          const dk = `${fecha}|${detalle.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20)}|${monto}`;
          if (seen.has(dk)) continue; seen.add(dk);
          const movementKey = `${file.id}|${i}`;
          result.push({ banco: "Global66 CLP", fecha, fechaCobro: fechaCobroMap.get(movementKey) ?? fecha, detalle, monto, moneda: "CLP", saldo: parseSaldo(row["Saldo"]), centroCostos: getCC(movementKey, detalle, monto), nDocumentos: nDocMap.get(movementKey) ?? [], revisado: reviewedKeys.has(movementKey), movementKey });
        }
      }

      // 5. Global66 USD
      for (const file of await storage.getUploadedFiles("cartola_global66_usd")) {
        const rows = (file.data || []) as Record<string, unknown>[];
        const seen = new Set<string>();
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if ((row as DataRow).__deleted) continue;
          const fecha = String(row["Fecha"] ?? "").trim(); if (!fecha) continue;
          const detalle = String(row["Descripción"] ?? "").trim();
          const debito = Number(row["Débito"] ?? 0) || 0;
          const abono = Number(row["Abono"] ?? 0) || 0;
          const monto = debito > 0 ? -debito : abono > 0 ? abono : 0;
          const dk = `${fecha}|${detalle.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20)}|${monto}`;
          if (seen.has(dk)) continue; seen.add(dk);
          const movementKey = `${file.id}|${i}`;
          result.push({ banco: "Global66 USD", fecha, fechaCobro: fechaCobroMap.get(movementKey) ?? fecha, detalle, monto, moneda: "USD", saldo: parseSaldo(row["Saldo"]), centroCostos: getCC(movementKey, detalle, monto), nDocumentos: nDocMap.get(movementKey) ?? [], revisado: reviewedKeys.has(movementKey), movementKey });
        }
      }

      result.sort((a, b) => {
        const [da, ma, ya] = a.fecha.split("/").map(Number);
        const [db, mb, yb] = b.fecha.split("/").map(Number);
        return (yb * 10000 + mb * 100 + db) - (ya * 10000 + ma * 100 + da);
      });

      console.log("[movimientos-general] result rows:", result.length, "| bancos:", [...new Set(result.map(r => r.banco))]);
      if (result.length > 0) cacheSet("cc:general", result, 120_000);
      res.json(result);
    } catch (error: any) {
      console.error("[movimientos-general] error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/files", async (_req, res) => {
    try {
      const ALLOWED_TYPES: FileType[] = ["cartola", "cartola_security", "cartola_falabella", "cartola_global66_clp", "cartola_global66_usd", "fact_ventas", "fact_ventas_bsale"];
      const CARTOLA_TYPES: FileType[] = ["cartola", "cartola_security", "cartola_falabella", "cartola_global66_clp", "cartola_global66_usd"];
      const fileType = _req.query.fileType as FileType | undefined;
      if (fileType && !ALLOWED_TYPES.includes(fileType)) {
        return res.json([]);
      }
      const files = fileType
        ? await storage.getUploadedFiles(fileType)
        : await Promise.all(CARTOLA_TYPES.map(t => storage.getUploadedFiles(t))).then(r => r.flat().sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()));
      const slim = files.map(({ data: _data, ...meta }) => meta);
      res.json(slim);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/files/monthly-chart", async (req, res) => {
    try {
      const fileType = req.query.fileType as FileType | undefined;
      const dateField = req.query.dateField as string | undefined;
      if (!fileType || !dateField) return res.json([]);

      const parseDateToYearMonth = (value: unknown): string | null => {
        const raw = String(value ?? "").trim();
        if (!raw || raw === "null" || raw === "undefined") return null;
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
          const parts = raw.split("/");
          return `${parts[2]}-${parts[1].padStart(2, "0")}`;
        }
        const serial = Number(raw);
        if (!isNaN(serial) && serial > 40000 && serial < 60000) {
          const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
          if (isNaN(d.getTime())) return null;
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        }
        return null;
      };

      const files = await storage.getUploadedFiles(fileType);
      const monthlyCounts: Record<string, number> = {};

      for (const file of files) {
        const rows = (file.data || []) as Record<string, unknown>[];
        for (const row of rows) {
          if ((row as DataRow).__deleted) continue;
          const ym = parseDateToYearMonth(row[dateField]);
          if (!ym) continue;
          monthlyCounts[ym] = (monthlyCounts[ym] || 0) + 1;
        }
      }

      const sortedKeys = Object.keys(monthlyCounts).sort();
      if (sortedKeys.length === 0) return res.json([]);

      const [sy, sm] = sortedKeys[0].split("-").map(Number);
      const [ey, em] = sortedKeys[sortedKeys.length - 1].split("-").map(Number);
      const result: { mes: string; registros: number }[] = [];
      let y = sy, m = sm;
      while (y < ey || (y === ey && m <= em)) {
        const ym = `${y}-${String(m).padStart(2, "0")}`;
        result.push({ mes: ym, registros: monthlyCounts[ym] || 0 });
        m++; if (m > 12) { m = 1; y++; }
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/files/:id", async (req, res) => {
    try {
      const file = await storage.getUploadedFile(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "Archivo no encontrado" });
      }
      res.json(file);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/files/type/:fileType", async (req, res) => {
    try {
      const fileType = req.params.fileType as FileType;
      const count = await storage.deleteAllUploadedFilesByType(fileType);
      cacheInvalidateAll();
      res.json({ success: true, deleted: count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/files/:id", async (req, res) => {
    try {
      await storage.deleteUploadedFile(req.params.id);
      cacheInvalidateAll();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/facturas-revision/movimientos", async (_req, res) => {
    try {
      const cached = cacheGet<unknown[]>("fr:movimientos");
      if (cached) return res.json(cached);

      const cartolaFiles = await storage.getUploadedFiles("cartola");
      const securityFiles = await storage.getUploadedFiles("cartola_security");
      const falabellaFiles = await storage.getUploadedFiles("cartola_falabella");
      const rules = await storage.getCentroCostosRules();
      const allPropuestas = await storage.getFacturaPropuestas();

      const usadoEnMap = new Map<string, string[]>();
      for (const p of allPropuestas) {
        if (p.cartolaMovementKey) {
          const existing = usadoEnMap.get(p.cartolaMovementKey) ?? [];
          existing.push(p.facturaKey);
          usadoEnMap.set(p.cartolaMovementKey, existing);
        }
      }

      const parseDDMMYYYY = (dateStr: string): Date | null => {
        const parts = dateStr.split("/");
        if (parts.length !== 3) return null;
        const [d, m, y] = parts.map(Number);
        return new Date(y, m - 1, d);
      };

      type MovimientoResult = { movementKey: string; fecha: string; detalle: string; monto: number; banco: string; usadoEn: string[] };
      const movimientos: MovimientoResult[] = [];

      for (const file of cartolaFiles) {
        const rows = (file.data || []) as Record<string, unknown>[];
        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx];
          const deposito = Number(String(row["Deposito o Abono"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          if (deposito <= 0) continue;
          const detalle = String(row["Detalle Movimiento"] ?? "").trim();
          const centro = predictCentroCostos(detalle, rules) ?? "C-VENTA";
          if (centro !== "C-VENTA") continue;
          const fecha = String(row["Fecha"] ?? "").trim();
          if (!parseDDMMYYYY(fecha)) continue;
          const movementKey = `${file.id}|${rowIdx}`;
          movimientos.push({ movementKey, fecha, detalle, monto: deposito, banco: "Banco de Chile", usadoEn: usadoEnMap.get(movementKey) ?? [] });
        }
      }

      for (const file of securityFiles) {
        const rows = (file.data || []) as Record<string, unknown>[];
        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx];
          const abono = Number(String(row["Abono"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          if (abono <= 0) continue;
          const detalle = String(row["Detalle Movimiento"] ?? "").trim();
          const centro = predictCentroCostos(detalle, rules) ?? "C-VENTA";
          if (centro !== "C-VENTA") continue;
          const fecha = String(row["Fecha"] ?? "").trim();
          if (!parseDDMMYYYY(fecha)) continue;
          const movementKey = `${file.id}|${rowIdx}`;
          movimientos.push({ movementKey, fecha, detalle, monto: abono, banco: "Banco Security", usadoEn: usadoEnMap.get(movementKey) ?? [] });
        }
      }

      for (const file of falabellaFiles) {
        const rows = (file.data || []) as Record<string, unknown>[];
        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx];
          const abono = Number(row["Abono"] ?? 0) || 0;
          if (abono <= 0) continue;
          const detalle = String(row["Descripción"] ?? "").trim();
          const centro = predictCentroCostos(detalle, rules) ?? "C-VENTA";
          if (centro !== "C-VENTA") continue;
          const fecha = String(row["Fecha"] ?? "").trim();
          if (!parseDDMMYYYY(fecha)) continue;
          const movementKey = `${file.id}|${rowIdx}`;
          movimientos.push({ movementKey, fecha, detalle, monto: abono, banco: "Banco Falabella", usadoEn: usadoEnMap.get(movementKey) ?? [] });
        }
      }

      movimientos.sort((a, b) => {
        const toDate = (s: string) => {
          const [d, m, y] = s.split("/").map(Number);
          return new Date(y, m - 1, d).getTime();
        };
        return toDate(b.fecha) - toDate(a.fecha);
      });

      cacheSet("fr:movimientos", movimientos, 300_000);
      res.json(movimientos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/facturas-revision", async (_req, res) => {
    try {
      const cached = cacheGet<unknown[]>("fr:main");
      if (cached) return res.json(cached);

      const cobranzaFiles = await storage.getUploadedFiles("cobranza");
      const cartolaFiles = await storage.getUploadedFiles("cartola");
      const securityFiles = await storage.getUploadedFiles("cartola_security");
      const falabellaFiles = await storage.getUploadedFiles("cartola_falabella");
      const rules = await storage.getCentroCostosRules();
      const savedReviews = await storage.getFacturaReviews();
      const savedPropuestas = await storage.getFacturaPropuestas();
      const autoMatchRejections = await storage.getAutoMatchRejections();
      const allClientes = await storage.getClientes();

      // Build cliente lookup maps: by rut (lowercase) and by nombre (lowercase)
      const clienteByRut = new Map<string, typeof allClientes[0]>();
      const clienteByNombre = new Map<string, typeof allClientes[0]>();
      for (const c of allClientes) {
        if (c.rut) clienteByRut.set(c.rut.toLowerCase().trim(), c);
        clienteByNombre.set(c.nombre.toLowerCase().trim(), c);
      }

      const reviewMap = new Map(savedReviews.map(r => [r.facturaKey, r]));
      const propuestasMap = new Map<string, typeof savedPropuestas>();
      for (const p of savedPropuestas) {
        const arr = propuestasMap.get(p.facturaKey) ?? [];
        arr.push(p);
        propuestasMap.set(p.facturaKey, arr);
      }

      const parseDDMMYYYY = (dateStr: string): Date | null => {
        const parts = dateStr.split("/");
        if (parts.length !== 3) return null;
        const [d, m, y] = parts.map(Number);
        return new Date(y, m - 1, d);
      };

      const parseCobranzaDate = (dateStr: string): Date | null => {
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
      };

      type CartolaVentaRow = { movementKey: string; fecha: string; detalle: string; monto: number; dateObj: Date; banco: string };
      const cventaRows: CartolaVentaRow[] = [];

      for (const file of cartolaFiles) {
        const rows = (file.data || []) as Record<string, unknown>[];
        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx];
          const deposito = Number(String(row["Deposito o Abono"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          if (deposito <= 0) continue;
          const detalle = String(row["Detalle Movimiento"] ?? "").trim();
          let centro = predictCentroCostos(detalle, rules);
          if (!centro) centro = "C-VENTA";
          if (centro !== "C-VENTA") continue;
          const fecha = String(row["Fecha"] ?? "").trim();
          const dateObj = parseDDMMYYYY(fecha);
          if (!dateObj) continue;
          cventaRows.push({ movementKey: `${file.id}|${rowIdx}`, fecha, detalle, monto: deposito, dateObj, banco: "Banco de Chile" });
        }
      }

      for (const file of securityFiles) {
        const rows = (file.data || []) as Record<string, unknown>[];
        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx];
          const abono = Number(String(row["Abono"] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
          if (abono <= 0) continue;
          const detalle = String(row["Detalle Movimiento"] ?? "").trim();
          let centro = predictCentroCostos(detalle, rules);
          if (!centro) centro = "C-VENTA";
          if (centro !== "C-VENTA") continue;
          const fecha = String(row["Fecha"] ?? "").trim();
          const dateObj = parseDDMMYYYY(fecha);
          if (!dateObj) continue;
          cventaRows.push({ movementKey: `${file.id}|${rowIdx}`, fecha, detalle, monto: abono, dateObj, banco: "Banco Security" });
        }
      }

      for (const file of falabellaFiles) {
        const rows = (file.data || []) as Record<string, unknown>[];
        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx];
          const abono = Number(row["Abono"] ?? 0) || 0;
          if (abono <= 0) continue;
          const detalle = String(row["Descripción"] ?? "").trim();
          let centro = predictCentroCostos(detalle, rules);
          if (!centro) centro = "C-VENTA";
          if (centro !== "C-VENTA") continue;
          const fecha = String(row["Fecha"] ?? "").trim();
          const dateObj = parseDDMMYYYY(fecha);
          if (!dateObj) continue;
          cventaRows.push({ movementKey: `${file.id}|${rowIdx}`, fecha, detalle, monto: abono, dateObj, banco: "Banco Falabella" });
        }
      }

      const movDetailMap = new Map<string, { fecha: string; detalle: string; monto: number; banco: string }>();
      const cventaByMonto = new Map<number, typeof cventaRows>();
      for (const r of cventaRows) {
        movDetailMap.set(r.movementKey, { fecha: r.fecha, detalle: r.detalle, monto: r.monto, banco: r.banco });
        const existing = cventaByMonto.get(r.monto) ?? [];
        existing.push(r);
        cventaByMonto.set(r.monto, existing);
      }

      const TIPOS_VALIDOS = ["FACTURA ELECTRÓNICA", "BOLETA ELECTRÓNICA"];

      // Build deduplication map: facturaKey (tipoDoc|nDoc) → row data.
      // Files come in DESC order (newest first), so first-seen wins = newest file wins.
      const facturaRowMap = new Map<string, Record<string, unknown>>();
      for (const file of cobranzaFiles) {
        const rows = (file.data || []) as Record<string, unknown>[];
        for (const row of rows) {
          const tipoDoc = String(row["Tipo Documento"] ?? "").trim().toUpperCase();
          if (!TIPOS_VALIDOS.includes(tipoDoc)) continue;
          const nDocRaw = String(row["Nº Documento"] ?? "").trim();
          if (!nDocRaw) continue;
          const key = `${tipoDoc}|${nDocRaw}`;
          if (!facturaRowMap.has(key)) facturaRowMap.set(key, row);
        }
      }

      const result: unknown[] = [];
      for (const [facturaKey, row] of facturaRowMap) {
          const montoNetoStr = String(row["Monto Neto Documento"] ?? "0").replace(/[^0-9.-]/g, "");
          const montoNeto = Number(montoNetoStr) || 0;
          const montoDocStr = String(row["Monto Documento"] ?? "0").replace(/[^0-9.-]/g, "");
          const montoDocumento = Number(montoDocStr) || 0;
          const fechaEmision = String(row["Fecha Emisión"] ?? "").trim();
          const emisionDate = parseCobranzaDate(fechaEmision);

          let matchCartola: CartolaVentaRow | null = null;
          if (montoDocumento > 0 && emisionDate) {
            const rejectedSet = autoMatchRejections.get(facturaKey);
            const candidates = (cventaByMonto.get(montoDocumento) ?? []).filter(c =>
              c.dateObj >= emisionDate &&
              !(rejectedSet?.has(c.movementKey))
            );
            candidates.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
            matchCartola = candidates[0] ?? null;
          }

          const savedReview = reviewMap.get(facturaKey);
          const facturaPropuestasArr = propuestasMap.get(facturaKey) ?? [];

          const propuestasEnriquecidas = facturaPropuestasArr.map(p => ({
            id: p.id,
            tipo: p.tipo,
            cartolaMovementKey: p.cartolaMovementKey,
            notaManual: p.notaManual,
            ...(p.cartolaMovementKey && movDetailMap.has(p.cartolaMovementKey)
              ? movDetailMap.get(p.cartolaMovementKey)
              : {}),
          }));

          let estado: string;
          if (savedReview) {
            estado = savedReview.estado;
          } else if (facturaPropuestasArr.length > 0 || matchCartola) {
            estado = "propuesto";
          } else {
            estado = "pendiente";
          }

          const rutClienteRaw = String(row["Rut Cliente"] ?? "").trim();
          const clienteNameRaw = String(row["Cliente"] ?? "").trim();
          const matchedCliente =
            (rutClienteRaw && clienteByRut.get(rutClienteRaw.toLowerCase())) ||
            (clienteNameRaw && clienteByNombre.get(clienteNameRaw.toLowerCase())) ||
            null;

          result.push({
            facturaKey,
            tipoDocumento: String(row["Tipo Documento"] ?? ""),
            nDocumento: String(row["Nº Documento"] ?? ""),
            cliente: clienteNameRaw,
            rutCliente: rutClienteRaw,
            fechaEmision,
            montoNeto,
            montoDocumento,
            estado,
            matchCartola: matchCartola
              ? { movementKey: matchCartola.movementKey, fecha: matchCartola.fecha, detalle: matchCartola.detalle, monto: matchCartola.monto, banco: matchCartola.banco }
              : null,
            propuestas: propuestasEnriquecidas,
            clienteId: matchedCliente?.id ?? null,
            clienteNombre: matchedCliente?.nombre ?? null,
            clienteEmails: matchedCliente?.emails ?? [],
          });
      }

      // Load email logs for all facturaKeys
      const allFacturaKeys = (result as { facturaKey: string }[]).map(r => r.facturaKey);
      const allEmailLogs = await storage.getEmailLogsByFacturas(allFacturaKeys);
      const emailLogsByFactura = new Map<string, typeof allEmailLogs>();
      for (const log of allEmailLogs) {
        const arr = emailLogsByFactura.get(log.facturaKey) ?? [];
        arr.push(log);
        emailLogsByFactura.set(log.facturaKey, arr);
      }

      const resultWithLogs = (result as any[]).map((r) => ({
        ...r,
        emailLogs: (emailLogsByFactura.get(r.facturaKey) ?? []).map((l, i) => ({
          id: l.id,
          numeroAviso: i + 1,
          destinatarios: l.destinatarios,
          asunto: l.asunto,
          enviadoAt: l.enviadoAt,
        })),
      }));

      cacheSet("fr:main", resultWithLogs, 300_000);
      res.json(resultWithLogs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/facturas-revision/:facturaKey", async (req, res) => {
    try {
      const facturaKey = decodeURIComponent(req.params.facturaKey);
      const { estado, cartolaMovementKey } = req.body;
      if (!estado || !["pagado", "pendiente"].includes(estado)) {
        return res.status(400).json({ error: "estado debe ser 'pagado' o 'pendiente'" });
      }
      let syncedMovementKey = cartolaMovementKey ?? null;
      if (estado === "pagado" && !syncedMovementKey) {
        const propuestas = await storage.getFacturaPropuestas(facturaKey);
        const firstMovimiento = propuestas.find(p => p.tipo === "movimiento" && p.cartolaMovementKey);
        if (firstMovimiento) syncedMovementKey = firstMovimiento.cartolaMovementKey;
      }
      const review = await storage.upsertFacturaReview(facturaKey, estado, syncedMovementKey);
      cacheInvalidatePrefix("fr:");
      cacheInvalidatePrefix("cc:");
      res.json(review);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/facturas-revision/:facturaKey/propuestas", async (req, res) => {
    try {
      const facturaKey = decodeURIComponent(req.params.facturaKey);
      const { tipo, cartolaMovementKey, notaManual } = req.body;
      if (!tipo || !["movimiento", "nota"].includes(tipo)) {
        return res.status(400).json({ error: "tipo debe ser 'movimiento' o 'nota'" });
      }
      if (tipo === "movimiento" && !cartolaMovementKey) {
        return res.status(400).json({ error: "cartolaMovementKey requerido para tipo movimiento" });
      }
      if (tipo === "nota" && !notaManual) {
        return res.status(400).json({ error: "notaManual requerido para tipo nota" });
      }
      const propuesta = await storage.addFacturaPropuesta(facturaKey, tipo, cartolaMovementKey ?? null, notaManual ?? null);
      cacheInvalidatePrefix("fr:");
      cacheInvalidatePrefix("cc:");
      res.json(propuesta);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/facturas-revision/:facturaKey/propuestas/:id", async (req, res) => {
    try {
      const id = req.params.id;
      await storage.deleteFacturaPropuesta(id);
      cacheInvalidatePrefix("fr:");
      cacheInvalidatePrefix("cc:");
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/facturas-revision/:facturaKey/reject-automatch", requireAppAccess, async (req, res) => {
    try {
      const facturaKey = decodeURIComponent(req.params.facturaKey as string);
      const { cartolaMovementKey } = req.body ?? {};
      if (!cartolaMovementKey || typeof cartolaMovementKey !== "string") {
        return res.status(400).json({ error: "cartolaMovementKey requerido" });
      }
      const rejection = await storage.addAutoMatchRejection(facturaKey, cartolaMovementKey);
      cacheInvalidatePrefix("fr:");
      cacheInvalidatePrefix("cc:");
      res.json(rejection);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/cobranza/import-estado", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No se proporcionó un archivo" });
      }

      const workbook = XLSX.read(req.file.buffer, { type: "buffer", raw: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: (string | number | undefined)[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1, defval: "", raw: true,
      });

      // Build set of document numbers to mark as pagado
      // Excel: col[0]=FACTURA, col[1]=ESTADO ("OK"/"Ok" → pagado)
      // Numeric: factura electrónica; "B xxx": boleta electrónica
      const toMarkPagado: { docNum: string; esBoleta: boolean }[] = [];

      for (let i = 1; i < rawRows.length; i++) {
        const r = rawRows[i];
        const facturaVal = r[0];
        const estadoVal = String(r[1] ?? "").trim().toLowerCase();
        if (estadoVal !== "ok") continue;

        if (typeof facturaVal === "number" && facturaVal > 0) {
          toMarkPagado.push({ docNum: String(Math.round(facturaVal)), esBoleta: false });
        } else if (typeof facturaVal === "string" && facturaVal.trim() !== "") {
          const trimmed = facturaVal.trim();
          if (/^B\s+\d+$/i.test(trimmed)) {
            const num = trimmed.replace(/^B\s+/i, "").trim();
            toMarkPagado.push({ docNum: num, esBoleta: true });
          } else if (/^\d+$/.test(trimmed)) {
            toMarkPagado.push({ docNum: trimmed, esBoleta: false });
          }
        }
      }

      // Build lookup map from cobranza files
      // map key: `${nDocumento}|boleta` or `${nDocumento}|factura` → facturaKey
      const cobranzaFiles = await storage.getUploadedFiles("cobranza");
      const facturaMap = new Map<string, string>(); // `${docNum}|tipo` → facturaKey
      const boletaMap = new Map<string, string>();  // docNum → facturaKey (with or without B prefix)

      for (const file of cobranzaFiles) {
        const rows = (file.data || []) as Record<string, unknown>[];
        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx];
          const tipoDoc = String(row["Tipo Documento"] ?? "").trim().toUpperCase();
          const nDoc = String(row["Nº Documento"] ?? "").trim();
          if (!nDoc) continue;
          const facturaKey = `${tipoDoc}|${nDoc}`;

          if (tipoDoc === "FACTURA ELECTRÓNICA") {
            if (!facturaMap.has(nDoc)) facturaMap.set(nDoc, facturaKey);
          } else if (tipoDoc === "BOLETA ELECTRÓNICA") {
            // Store by bare number (without B prefix) and also with "B " prefix
            if (!boletaMap.has(nDoc)) boletaMap.set(nDoc, facturaKey);
            const bPrefixed = `B ${nDoc}`;
            if (!boletaMap.has(bPrefixed)) boletaMap.set(bPrefixed, facturaKey);
          }
        }
      }

      let matched = 0;
      let noMatch = 0;

      for (const { docNum, esBoleta } of toMarkPagado) {
        let facturaKey: string | undefined;
        if (esBoleta) {
          facturaKey = boletaMap.get(docNum) ?? boletaMap.get(`B ${docNum}`);
        } else {
          facturaKey = facturaMap.get(docNum);
        }

        if (facturaKey) {
          await storage.upsertFacturaReview(facturaKey, "pagado", null);
          matched++;
        } else {
          noMatch++;
        }
      }

      cacheInvalidatePrefix("fr:");
      cacheInvalidatePrefix("cc:");
      const total = matched + noMatch;
      res.json({ matched, noMatch, total });
    } catch (error: any) {
      console.error("Import estado cobranza error:", error);
      res.status(500).json({ error: error.message || "Error al importar estado de facturas" });
    }
  });

  app.get("/api/bsale/status", async (_req, res) => {
    try {
      res.json({ configured: isBsaleConfigured() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/bsale/debug-detail", isAuthenticated as RequestHandler, async (_req, res) => {
    try {
      if (!isBsaleConfigured()) {
        return res.status(400).json({ error: "BSALE_ACCESS_TOKEN no configurado" });
      }
      const token = process.env.BSALE_ACCESS_TOKEN!;
      const now = Math.floor(Date.now() / 1000);
      const weekAgo = now - 7 * 24 * 3600;
      const url = `https://api.bsale.io/v1/documents.json?emissiondaterange=[${weekAgo},${now}]&limit=1&state=0&expand=[details]`;
      const docResp = await fetch(url, { headers: { access_token: token } });
      if (!docResp.ok) {
        return res.status(502).json({ error: `BSale HTTP ${docResp.status}` });
      }
      const docData: any = await docResp.json();
      const doc = docData.items?.[0];
      if (!doc) return res.json({ message: "Sin documentos en los últimos 7 días", rawDoc: null });

      const details = doc.details?.items ?? [];
      const firstDetail = details[0] ?? null;

      let variantRaw: any = null;
      if (firstDetail?.variant?.id) {
        const vUrl = `https://api.bsale.io/v1/variants/${firstDetail.variant.id}.json?expand=[costs]`;
        const vResp = await fetch(vUrl, { headers: { access_token: token } });
        if (vResp.ok) variantRaw = await vResp.json();
      }

      res.json({
        docId: doc.id,
        docState: doc.state,
        detailCount: details.length,
        firstDetailKeys: firstDetail ? Object.keys(firstDetail) : [],
        firstDetailCostFields: firstDetail ? {
          unitCost: firstDetail.unitCost,
          averageCost: firstDetail.averageCost,
          cost: firstDetail.cost,
          netUnitValue: firstDetail.netUnitValue,
          quantity: firstDetail.quantity,
        } : null,
        variantCosts: variantRaw?.costs ?? null,
        note: "BSale does not return unitCost in document details. Use variant.costs.averageCost instead.",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/bsale/sync-ventas", async (req, res) => {
    try {
      if (!isBsaleConfigured()) {
        return res.status(400).json({ error: "BSALE_ACCESS_TOKEN no está configurado en los Secrets del proyecto" });
      }

      const { desde, hasta } = req.body;
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!desde || !hasta || !dateRegex.test(desde) || !dateRegex.test(hasta)) {
        return res.status(400).json({ error: "Se requieren las fechas 'desde' y 'hasta' en formato YYYY-MM-DD" });
      }
      if (desde > hasta) {
        return res.status(400).json({ error: "La fecha 'desde' no puede ser posterior a 'hasta'" });
      }

      const result = await syncVentas(desde, hasta);
      const jsonData = result.rows;
      cacheInvalidateAll();

      if (jsonData.length === 0) {
        return res.json({ insertadas: 0, duplicadas: 0, totalBsale: result.totalBsale, stockDate: null, message: "No se encontraron líneas de detalle en el período" });
      }

      const buildKey = (row: Record<string, unknown>) => {
        const numDoc = String(row["Numero Documento"] ?? "").trim().toLowerCase();
        const sku = String(row["SKU"] ?? "").trim().toLowerCase();
        const tipo = String(row["Tipo Movimiento"] ?? "").trim().toLowerCase();
        const cantidad = String(row["Cantidad"] ?? "").trim().toLowerCase();
        const venta = String(row["Venta Total Neta"] ?? "").trim().toLowerCase();
        return `${numDoc}|${sku}|${tipo}|${cantidad}|${venta}`;
      };

      const totalRows = jsonData.length;
      const rowMap = new Map<string, Record<string, unknown>>();
      for (const row of jsonData) rowMap.set(buildKey(row), row);
      const uniqueNewRows = [...rowMap.values()];
      const withinFileDupes = totalRows - uniqueNewRows.length;

      const existingFiles = [
        ...await storage.getUploadedFiles("fact_ventas_bsale"),
        ...await storage.getUploadedFiles("fact_ventas"),
      ];
      const newKeys = new Set(rowMap.keys());
      let crossFileDupes = 0;
      for (const file of existingFiles) {
        const rows = (file.data || []) as Record<string, unknown>[];
        let changed = false;
        const updatedRows = rows.map(row => {
          if ((row as DataRow).__deleted) return row;
          if (newKeys.has(buildKey(row))) { crossFileDupes++; changed = true; return { __deleted: true }; }
          return row;
        });
        if (changed) await storage.updateUploadedFileData(file.id, updatedRows, updatedRows.filter(r => !(r as DataRow).__deleted).length);
      }

      const duplicateCount = withinFileDupes + crossFileDupes;

      if (uniqueNewRows.length === 0) {
        return res.json({ insertadas: 0, duplicadas: duplicateCount, totalBsale: result.totalBsale, stockDate: null, message: "No hay filas nuevas para importar" });
      }

      const uploaded = await storage.createUploadedFile({
        fileType: "fact_ventas_bsale",
        originalFilename: `BSale Sync ${desde} – ${hasta}`,
        rowCount: uniqueNewRows.length,
        status: "processed",
        headers: Object.keys(uniqueNewRows[0]),
        data: uniqueNewRows,
      });

      try { await storage.bulkInsertFactVentasRows(uploaded.id, uniqueNewRows); } catch (e) { console.error("bulkInsertFactVentasRows error:", e); }

      return res.json({
        insertadas: uniqueNewRows.length,
        duplicadas: duplicateCount,
        totalBsale: result.totalBsale,
        stockDate: null,
      });
    } catch (error: any) {
      console.error("BSale sync error:", error);
      res.status(502).json({ error: error.message || "Error al conectar con BSale" });
    }
  });

  app.post("/api/bsale/sync-cobranza", async (req, res) => {
    try {
      if (!isBsaleConfigured()) {
        return res.status(400).json({ error: "BSALE_ACCESS_TOKEN no está configurado en los Secrets del proyecto" });
      }

      const { desde, hasta } = req.body;
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!desde || !hasta || !dateRegex.test(desde) || !dateRegex.test(hasta)) {
        return res.status(400).json({ error: "Se requieren las fechas 'desde' y 'hasta' en formato YYYY-MM-DD" });
      }
      if (desde > hasta) {
        return res.status(400).json({ error: "La fecha 'desde' no puede ser posterior a 'hasta'" });
      }

      const result = await syncCobranza(desde, hasta);
      const jsonData = result.rows;

      if (jsonData.length === 0) {
        return res.json({ insertadas: 0, duplicadas: 0, totalBsale: result.totalBsale, stockDate: null, message: "No se encontraron documentos de cobranza en el período" });
      }

      const buildCobranzaKey = (row: Record<string, unknown>) => {
        const tipo = String(row["Tipo Documento"] ?? "").trim().toLowerCase();
        const nDoc = String(row["Nº Documento"] ?? "").trim().toLowerCase();
        const rut = String(row["Rut Cliente"] ?? "").trim().toLowerCase();
        const fecha = String(row["Fecha Emisión"] ?? "").trim().toLowerCase();
        return `${tipo}|${nDoc}|${rut}|${fecha}`;
      };

      const totalRows = jsonData.length;
      const rowMap = new Map<string, Record<string, unknown>>();
      for (const row of jsonData) rowMap.set(buildCobranzaKey(row), row);
      const uniqueNewRows = [...rowMap.values()];
      const withinFileDupes = totalRows - uniqueNewRows.length;

      const existingFiles = await storage.getUploadedFiles("cobranza");
      const newKeys = new Set(rowMap.keys());
      let crossFileDupes = 0;
      for (const file of existingFiles) {
        const rows = (file.data || []) as Record<string, unknown>[];
        let changed = false;
        const updatedRows = rows.map(row => {
          if ((row as DataRow).__deleted) return row;
          if (newKeys.has(buildCobranzaKey(row))) { crossFileDupes++; changed = true; return { __deleted: true }; }
          return row;
        });
        if (changed) await storage.updateUploadedFileData(file.id, updatedRows, updatedRows.filter(r => !(r as DataRow).__deleted).length);
      }

      const duplicateCount = withinFileDupes + crossFileDupes;

      if (uniqueNewRows.length === 0) {
        return res.json({ insertadas: 0, duplicadas: duplicateCount, totalBsale: result.totalBsale, stockDate: null, message: "No hay filas nuevas para importar" });
      }

      const uploaded = await storage.createUploadedFile({
        fileType: "cobranza",
        originalFilename: `BSale Cobranza ${desde} – ${hasta}`,
        rowCount: uniqueNewRows.length,
        status: "processed",
        headers: Object.keys(uniqueNewRows[0]),
        data: uniqueNewRows,
      });

      return res.json({
        insertadas: uniqueNewRows.length,
        duplicadas: duplicateCount,
        totalBsale: result.totalBsale,
        stockDate: null,
        uploadedFileId: uploaded.id,
      });
    } catch (error: any) {
      console.error("BSale sync-cobranza error:", error);
      res.status(502).json({ error: error.message || "Error al conectar con BSale" });
    }
  });

  app.post("/api/bsale/sync-fact-compras", async (req, res) => {
    try {
      if (!isBsaleConfigured()) {
        return res.status(400).json({ error: "BSALE_ACCESS_TOKEN no está configurado en los Secrets del proyecto" });
      }

      const { desde, hasta } = req.body;
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!desde || !hasta || !dateRegex.test(desde) || !dateRegex.test(hasta)) {
        return res.status(400).json({ error: "Se requieren las fechas 'desde' y 'hasta' en formato YYYY-MM-DD" });
      }
      if (desde > hasta) {
        return res.status(400).json({ error: "La fecha 'desde' no puede ser posterior a 'hasta'" });
      }

      const result = await syncFactCompras(desde, hasta);
      const jsonData = result.rows;

      if (jsonData.length === 0) {
        return res.json({ insertadas: 0, duplicadas: 0, totalBsale: result.totalBsale, stockDate: null, message: "No se encontraron documentos de compra en el período" });
      }

      const buildFactComprasKey = (row: Record<string, unknown>) => {
        const folio = String(row["Folio"] ?? "").trim().toLowerCase();
        const rut = String(row["RUT"] ?? "").trim().toLowerCase();
        const fecha = String(row["Fecha Emisión"] ?? "").trim().toLowerCase();
        const estado = String(row["Estado"] ?? "").trim().toLowerCase();
        return `${folio}|${rut}|${fecha}|${estado}`;
      };

      const totalRows = jsonData.length;
      const rowMap = new Map<string, Record<string, unknown>>();
      for (const row of jsonData) rowMap.set(buildFactComprasKey(row), row);
      const uniqueNewRows = [...rowMap.values()];
      const withinFileDupes = totalRows - uniqueNewRows.length;

      const existingFiles = await storage.getUploadedFiles("fact_compras");
      const newKeys = new Set(rowMap.keys());
      let crossFileDupes = 0;
      for (const file of existingFiles) {
        const rows = (file.data || []) as Record<string, unknown>[];
        let changed = false;
        const updatedRows = rows.map(row => {
          if ((row as DataRow).__deleted) return row;
          if (newKeys.has(buildFactComprasKey(row))) { crossFileDupes++; changed = true; return { __deleted: true }; }
          return row;
        });
        if (changed) await storage.updateUploadedFileData(file.id, updatedRows, updatedRows.filter(r => !(r as DataRow).__deleted).length);
      }

      const duplicateCount = withinFileDupes + crossFileDupes;

      if (uniqueNewRows.length === 0) {
        return res.json({ insertadas: 0, duplicadas: duplicateCount, totalBsale: result.totalBsale, stockDate: null, message: "No hay filas nuevas para importar" });
      }

      await storage.createUploadedFile({
        fileType: "fact_compras",
        originalFilename: `BSale Fact. Compras ${desde} – ${hasta}`,
        rowCount: uniqueNewRows.length,
        status: "processed",
        headers: Object.keys(uniqueNewRows[0]),
        data: uniqueNewRows,
      });

      return res.json({
        insertadas: uniqueNewRows.length,
        duplicadas: duplicateCount,
        totalBsale: result.totalBsale,
        stockDate: null,
      });
    } catch (error: any) {
      console.error("BSale sync-fact-compras error:", error);
      res.status(502).json({ error: error.message || "Error al conectar con BSale" });
    }
  });

  app.get("/api/fact-ventas", async (_req, res) => {
    try {
      const cached = cacheGet<Record<string, unknown>[]>("fv:all");
      if (cached) return res.json(cached);
      const files = await storage.getUploadedFiles("fact_ventas_bsale");
      const rows: Record<string, unknown>[] = [];
      for (const file of files) {
        const data = (file.data || []) as Record<string, unknown>[];
        rows.push(...data);
      }
      cacheSet("fv:all", rows, 120_000);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/fact-compras", async (_req, res) => {
    try {
      const files = await storage.getUploadedFiles("fact_compras");
      const rows: Record<string, unknown>[] = [];
      for (const file of files) {
        const data = (file.data || []) as Record<string, unknown>[];
        rows.push(...data);
      }
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/stock-disponible", requireAppAccess, async (_req, res) => {
    try {
      const bsaleConfigured = isBsaleConfigured();

      // Helper: build response from a stockMap + optional ventasMap
      const buildStockResponse = (
        stockEntries: { sku: string; tipoProducto: string; producto: string; variante: string; marca: string; stockInicial: number }[],
        ventasMap: Map<string, number>,
        stockDate: string,
        source: "bsale" | "upload"
      ) => {
        const detalle = stockEntries.map(info => {
          const vendidas = ventasMap.get(info.sku) || 0;
          return {
            sku: info.sku,
            tipoProducto: info.tipoProducto,
            producto: info.producto,
            variante: info.variante,
            marca: info.marca,
            stockInicial: info.stockInicial,
            vendidas,
            stockActual: info.stockInicial - vendidas,
          };
        });

        detalle.sort((a, b) => {
          if (a.tipoProducto !== b.tipoProducto) return a.tipoProducto.localeCompare(b.tipoProducto, "es");
          if (a.producto !== b.producto) return a.producto.localeCompare(b.producto, "es");
          return a.variante.localeCompare(b.variante, "es");
        });

        const resumenMap = new Map<string, { stockInicial: number; vendidas: number; stockActual: number }>();
        for (const row of detalle) {
          const tipo = row.tipoProducto || "Sin Tipo";
          const existing = resumenMap.get(tipo) || { stockInicial: 0, vendidas: 0, stockActual: 0 };
          existing.stockInicial += row.stockInicial;
          existing.vendidas += row.vendidas;
          existing.stockActual += row.stockActual;
          resumenMap.set(tipo, existing);
        }

        const resumen = Array.from(resumenMap.entries())
          .map(([tipoProducto, d]) => ({ tipoProducto, ...d }))
          .sort((a, b) => a.tipoProducto.localeCompare(b.tipoProducto, "es"));

        return { stockDate, bsaleConfigured, source, detalle, resumen };
      };

      // ─── BSale real-time path ───────────────────────────────────────────────
      if (bsaleConfigured) {
        const [bsaleItems, discontinuedSet] = await Promise.all([
          fetchBsaleStock(),
          storage.getDiscontinuedSet(),
        ]);
        const today = new Date();
        const stockDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

        const stockEntries = bsaleItems
          .filter(item => !discontinuedSet.has(item.sku.trim().toLowerCase()))
          .map(item => ({
            sku: item.sku,
            tipoProducto: item.tipoProducto,
            producto: item.producto,
            variante: item.variante,
            marca: "",
            stockInicial: item.quantityAvailable,
          }));

        return res.json(buildStockResponse(stockEntries, new Map(), stockDate, "bsale"));
      }

      return res.json({ stockDate: null, bsaleConfigured: false, source: "bsale", detalle: [], resumen: [] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/discontinued-products", requireAppAccess, async (_req, res) => {
    try {
      const items = await storage.listDiscontinued();
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/discontinued-products", requireAppAccess, async (req, res) => {
    try {
      const { sku, nombre } = req.body;
      if (!sku || typeof sku !== "string" || !sku.trim()) {
        return res.status(400).json({ error: "SKU es requerido" });
      }
      const nombreSafe = typeof nombre === "string" ? nombre : null;
      const item = await storage.addDiscontinued(sku, nombreSafe);
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/discontinued-products/:sku", requireAppAccess, async (req, res) => {
    try {
      const sku = req.params.sku as string;
      if (!sku) return res.status(400).json({ error: "SKU es requerido" });
      const deleted = await storage.removeDiscontinued(sku);
      if (!deleted) return res.status(404).json({ error: "SKU no encontrado" });
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ventas-amigo", async (_req, res) => {
    try {
      const ventas = await storage.getVentasAmigo();
      res.json(ventas);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ventas-amigo", async (req, res) => {
    try {
      const { fechaCompra, nombre, monto, unidades, costoProducto } = req.body;
      if (!fechaCompra || typeof fechaCompra !== "string") {
        return res.status(400).json({ error: "Fecha de compra es requerida" });
      }
      if (!nombre || typeof nombre !== "string" || !nombre.trim()) {
        return res.status(400).json({ error: "Nombre es requerido" });
      }
      const montoNum = Number(monto);
      const unidadesNum = Number(unidades);
      if (!Number.isFinite(montoNum) || !Number.isInteger(montoNum)) {
        return res.status(400).json({ error: "Monto debe ser un número entero válido" });
      }
      if (!Number.isFinite(unidadesNum) || !Number.isInteger(unidadesNum) || unidadesNum < 1) {
        return res.status(400).json({ error: "Unidades debe ser un número entero positivo" });
      }
      if (costoProducto === null || costoProducto === undefined || costoProducto === "") {
        return res.status(400).json({ error: "Costo producto es requerido" });
      }
      const costoNum = Number(costoProducto);
      if (!Number.isFinite(costoNum) || !Number.isInteger(costoNum) || costoNum < 0) {
        return res.status(400).json({ error: "Costo producto debe ser un número entero válido (>= 0)" });
      }
      const venta = await storage.createVentaAmigo({
        fechaCompra: fechaCompra.trim(),
        nombre: nombre.trim(),
        monto: montoNum,
        unidades: unidadesNum,
        costoProducto: costoNum,
        estado: "pendiente",
      });
      res.json(venta);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/ventas-amigo/:id/estado", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ error: "ID inválido" });
      }
      const { estado } = req.body;
      if (!estado || !["pagado", "pendiente"].includes(estado)) {
        return res.status(400).json({ error: "Estado inválido" });
      }
      const updated = await storage.updateVentaAmigoEstado(id, estado);
      if (!updated) {
        return res.status(404).json({ error: "Venta no encontrada" });
      }
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/ventas-amigo/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ error: "ID inválido" });
      }
      const { fechaCompra, nombre, monto, unidades, costoProducto } = req.body;
      if (!fechaCompra || typeof fechaCompra !== "string") {
        return res.status(400).json({ error: "Fecha de compra es requerida" });
      }
      if (!nombre || typeof nombre !== "string" || !nombre.trim()) {
        return res.status(400).json({ error: "Nombre es requerido" });
      }
      const montoNum = Number(monto);
      const unidadesNum = Number(unidades);
      if (!Number.isFinite(montoNum) || !Number.isInteger(montoNum)) {
        return res.status(400).json({ error: "Monto debe ser un número entero válido" });
      }
      if (!Number.isFinite(unidadesNum) || !Number.isInteger(unidadesNum) || unidadesNum < 1) {
        return res.status(400).json({ error: "Unidades debe ser un número entero positivo" });
      }
      if (costoProducto === null || costoProducto === undefined || costoProducto === "") {
        return res.status(400).json({ error: "Costo producto es requerido" });
      }
      const costoNum = Number(costoProducto);
      if (!Number.isFinite(costoNum) || !Number.isInteger(costoNum) || costoNum < 0) {
        return res.status(400).json({ error: "Costo producto debe ser un número entero válido (>= 0)" });
      }
      const updated = await storage.updateVentaAmigo(id, {
        fechaCompra: fechaCompra.trim(),
        nombre: nombre.trim(),
        monto: montoNum,
        unidades: unidadesNum,
        costoProducto: costoNum,
      });
      if (!updated) {
        return res.status(404).json({ error: "Venta no encontrada" });
      }
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/ventas-amigo/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ error: "ID inválido" });
      }
      const deleted = await storage.deleteVentaAmigo(id);
      if (!deleted) {
        return res.status(404).json({ error: "Venta no encontrada" });
      }
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/siguiente-pedido", requireAppAccess, async (_req, res) => {
    try {
      interface StockEntry { sku: string; tipoProducto: string; producto: string; variante: string; marca: string; stockActual: number; }
      interface SiguientePedidoRow {
        sku: string; tipoProducto: string; producto: string; variante: string; marca: string;
        stockActual: number; consumoTotalHistorico: number; consumoMensualHistorico: number;
        diasParaQuiebreHistorico: number | null; fechaQuiebreHistorico: string | null;
      }

      const bsaleConfigured = isBsaleConfigured();

      const buildSiguientePedidoResponse = (
        stockEntries: StockEntry[],
        consumoTotalMap: Map<string, number>,
        mesesHistorico: number,
        stockDate: string,
        source: "bsale" | "upload"
      ) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const skus: SiguientePedidoRow[] = [];

        for (const info of stockEntries) {
          const { sku, stockActual } = info;
          const consumoTotal = consumoTotalMap.get(sku) || 0;
          const consumoMensual = Math.round((consumoTotal / mesesHistorico) * 100) / 100;
          const consumoDiario = consumoMensual / 30;

          let diasParaQuiebreHistorico: number | null = null;
          let fechaQuiebreHistorico: string | null = null;

          if (stockActual <= 0) {
            diasParaQuiebreHistorico = 0;
            fechaQuiebreHistorico = "Agotado";
          } else if (consumoDiario > 0) {
            diasParaQuiebreHistorico = Math.ceil(stockActual / consumoDiario);
            const fechaEstimada = new Date(today);
            fechaEstimada.setDate(fechaEstimada.getDate() + diasParaQuiebreHistorico);
            const y = fechaEstimada.getFullYear();
            const m = String(fechaEstimada.getMonth() + 1).padStart(2, "0");
            const d = String(fechaEstimada.getDate()).padStart(2, "0");
            fechaQuiebreHistorico = `${y}-${m}-${d}`;
          }

          skus.push({ sku, tipoProducto: info.tipoProducto, producto: info.producto, variante: info.variante, marca: info.marca, stockActual, consumoTotalHistorico: consumoTotal, consumoMensualHistorico: consumoMensual, diasParaQuiebreHistorico, fechaQuiebreHistorico });
        }

        skus.sort((a, b) => {
          if (a.stockActual <= 0 && b.stockActual > 0) return -1;
          if (a.stockActual > 0 && b.stockActual <= 0) return 1;
          if (a.stockActual <= 0 && b.stockActual <= 0) return a.sku.localeCompare(b.sku, "es");
          if (a.diasParaQuiebreHistorico !== null && b.diasParaQuiebreHistorico !== null) return a.diasParaQuiebreHistorico - b.diasParaQuiebreHistorico;
          if (a.diasParaQuiebreHistorico !== null) return -1;
          if (b.diasParaQuiebreHistorico !== null) return 1;
          return a.sku.localeCompare(b.sku, "es");
        });

        return { stockDate, bsaleConfigured, source, skus, mesesHistorico: Math.round(mesesHistorico * 10) / 10 };
      };

      // Build consumption map from both BSale sync and manual fact_ventas
      const ventasFiles = [
        ...await storage.getUploadedFiles("fact_ventas_bsale"),
        ...await storage.getUploadedFiles("fact_ventas"),
      ];
      const consumoTotalMap = new Map<string, number>();
      let minDate: Date | null = null;
      let maxDate: Date | null = null;

      for (const file of ventasFiles) {
        const rows = (file.data || []) as DataRow[];
        for (const row of rows) {
          if (row.__deleted) continue;
          const sku = String(row["SKU"] || "").trim();
          if (!sku) continue;
          const fechaStr = String(row["Fecha Venta"] || "");
          const parts = fechaStr.split("/");
          if (parts.length !== 3) continue;
          const [dd, mm, yyyy] = parts;
          const ventaDate = new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T00:00:00`);
          if (isNaN(ventaDate.getTime())) continue;
          const cantidad = Number(row["Cantidad"] || 0);
          consumoTotalMap.set(sku, (consumoTotalMap.get(sku) || 0) + cantidad);
          if (!minDate || ventaDate < minDate) minDate = ventaDate;
          if (!maxDate || ventaDate > maxDate) maxDate = ventaDate;
        }
      }

      let mesesHistorico = 1;
      if (minDate && maxDate) {
        const diffMs = maxDate.getTime() - minDate.getTime();
        mesesHistorico = Math.max(1, diffMs / (1000 * 60 * 60 * 24 * 30));
      }

      // ─── BSale real-time path ───────────────────────────────────────────────
      if (bsaleConfigured) {
        const [bsaleItemsRaw, discontinuedSet] = await Promise.all([
          fetchBsaleStock(),
          storage.getDiscontinuedSet(),
        ]);
        const bsaleItems = bsaleItemsRaw.filter(item => !discontinuedSet.has(item.sku.trim().toLowerCase()));
        const today = new Date();
        const stockDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

        const stockEntries: StockEntry[] = bsaleItems.map(item => ({
          sku: item.sku,
          tipoProducto: item.tipoProducto,
          producto: item.producto,
          variante: item.variante,
          marca: "",
          stockActual: item.quantityAvailable,
        }));

        return res.json(buildSiguientePedidoResponse(stockEntries, consumoTotalMap, mesesHistorico, stockDate, "bsale"));
      }

      return res.json({ stockDate: null, bsaleConfigured: false, source: "bsale", skus: [], mesesHistorico: 0 });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Clientes ────────────────────────────────────────────────────────────────
  app.post("/api/clientes/seed", async (_req, res) => {
    try {
      const result = await storage.seedClientesFromData();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/clientes", async (_req, res) => {
    try {
      const all = await storage.getClientes();
      res.json(all);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/clientes/lookup", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (!q) return res.json(null);
      const data = await storage.lookupClienteData(q);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/clientes/sugeridos", async (_req, res) => {
    try {
      const sugeridos = await storage.getClientesSugeridos();
      res.json(sugeridos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clientes/backfill-emails", async (_req, res) => {
    try {
      const result = await storage.backfillEmailsFromVentas();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clientes/backfill-contactos", async (_req, res) => {
    try {
      const result = await storage.backfillContactosFromBSale();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clientes/sync-nombres-bsale", async (_req, res) => {
    try {
      const result = await storage.syncNombresFromBSale();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clientes", async (req, res) => {
    try {
      const { nombre, razonSocial, rut, emails, telefono, notas } = req.body;
      if (!nombre || typeof nombre !== "string" || nombre.trim() === "") {
        return res.status(400).json({ error: "Nombre es requerido" });
      }
      const cliente = await storage.createCliente({
        nombre: nombre.trim(),
        razonSocial: razonSocial?.trim() || null,
        rut: rut?.trim() || null,
        emails: Array.isArray(emails) ? emails.map((e: string) => e.trim()).filter(Boolean) : [],
        telefono: telefono?.trim() || null,
        nombreContacto: null,
        notas: notas?.trim() || null,
      });
      res.json(cliente);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/clientes/:id", async (req, res) => {
    try {
      const { nombre, razonSocial, rut, emails, telefono, notas } = req.body;
      const updates: Partial<import("@shared/schema").InsertCliente> = {};
      if (nombre !== undefined) {
        if (!nombre.trim()) return res.status(400).json({ error: "El nombre no puede estar vacío" });
        updates.nombre = nombre.trim();
      }
      if (razonSocial !== undefined) updates.razonSocial = razonSocial?.trim() || null;
      if (rut !== undefined) updates.rut = rut?.trim() || null;
      if (emails !== undefined) updates.emails = Array.isArray(emails) ? emails.map((e: string) => e.trim()).filter(Boolean) : [];
      if (telefono !== undefined) updates.telefono = telefono?.trim() || null;
      if (notas !== undefined) updates.notas = notas?.trim() || null;
      const updated = await storage.updateCliente(req.params.id, updates);
      if (!updated) return res.status(404).json({ error: "Cliente no encontrado" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/clientes/:id", async (req, res) => {
    try {
      await storage.deleteCliente(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/email/send", async (req, res) => {
    try {
      const { facturaKey, clienteId, destinatarios, asunto, cuerpo, numeroAviso, nDocumento, montoDocumento, fechaEmision, clienteNombre, testEmail } = req.body;

      if (!destinatarios || !Array.isArray(destinatarios) || destinatarios.length === 0) {
        return res.status(400).json({ error: "Se requieren destinatarios" });
      }
      if (!asunto || !asunto.trim()) {
        return res.status(400).json({ error: "Se requiere asunto" });
      }
      if (!cuerpo || !cuerpo.trim()) {
        return res.status(400).json({ error: "Se requiere cuerpo del email" });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const allRecipientAddresses = testEmail
        ? [String(testEmail).trim()]
        : destinatarios.map((e: string) => e.trim()).filter(Boolean);
      const invalid = allRecipientAddresses.filter(e => !emailRegex.test(e));
      if (invalid.length > 0) {
        return res.status(400).json({ error: `Email(s) inválido(s): ${invalid.join(", ")}` });
      }

      const isTest = !!testEmail;
      const recipients: string[] = isTest
        ? [String(testEmail).trim()].filter(Boolean)
        : destinatarios.map((e: string) => e.trim()).filter(Boolean);

      if (recipients.length === 0) {
        return res.status(400).json({ error: "No hay destinatarios válidos" });
      }

      const result = await sendEmail(
        "cobranza",
        {
          clienteNombre: String(clienteNombre || "Cliente"),
          nDocumento: String(nDocumento || ""),
          montoDocumento: Number(montoDocumento || 0),
          fechaEmision: String(fechaEmision || ""),
          numeroAviso: Number(numeroAviso || 1),
          cuerpoEditable: String(cuerpo),
        },
        recipients,
        String(asunto),
      );

      if (!result.sent) {
        return res.status(500).json({ error: result.error || "Error al enviar email" });
      }

      // Only log real sends (not test)
      if (!isTest && facturaKey) {
        await storage.createEmailLog({
          facturaKey: String(facturaKey),
          clienteId: clienteId || null,
          destinatarios: recipients,
          asunto: String(asunto),
          template: "cobranza",
          cuerpo: String(cuerpo),
        });
        cacheInvalidateAll();
      }

      res.json({ sent: true, recipients, isTest });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
