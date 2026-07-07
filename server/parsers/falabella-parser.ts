import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;
import * as XLSX from "xlsx";

const FALABELLA_HEADERS = ["Fecha", "Oficina", "Nro Doc", "Descripción", "Cargo", "Abono", "Saldo"];

function parseMonto(str: string): number {
  return parseInt(str.replace(/\$/g, "").replace(/\./g, "").replace(/\s/g, ""), 10) || 0;
}

function isXlsBuffer(buffer: Buffer): boolean {
  // XLS magic: D0 CF 11 E0
  if (buffer.length >= 4 &&
    buffer[0] === 0xD0 && buffer[1] === 0xCF &&
    buffer[2] === 0x11 && buffer[3] === 0xE0) return true;
  // XLSX magic: PK (ZIP)
  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4B) return true;
  return false;
}

function parseXlsFalabella(buffer: Buffer): { headers: string[]; data: Record<string, unknown>[] } {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { header: 1, defval: "" }) as string[][];

  // Find header row (contains "Fecha")
  let headerRowIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some(cell => String(cell).trim().toLowerCase() === "fecha")) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) return { headers: FALABELLA_HEADERS, data: [] };

  const headerRow = rows[headerRowIdx].map(h => String(h).trim());
  const colFecha = headerRow.findIndex(h => h.toLowerCase() === "fecha");
  const colDesc = headerRow.findIndex(h => h.toLowerCase().startsWith("descripci"));
  const colCargo = headerRow.findIndex(h => h.toLowerCase() === "cargo");
  const colAbono = headerRow.findIndex(h => h.toLowerCase() === "abono");
  const colSaldo = headerRow.findIndex(h => h.toLowerCase() === "saldo");

  const data: Record<string, unknown>[] = [];
  const dateRegex = /^\d{2}[-/]\d{2}[-/]\d{4}$/;

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const rawFecha = colFecha >= 0 ? String(row[colFecha] ?? "").trim() : "";
    if (!dateRegex.test(rawFecha)) continue;

    // Normalize date separators to DD/MM/YYYY
    const fecha = rawFecha.replace(/-/g, "/");

    const rawDesc = colDesc >= 0 ? String(row[colDesc] ?? "").trim() : "";
    const rawCargo = colCargo >= 0 ? String(row[colCargo] ?? "").trim() : "";
    const rawAbono = colAbono >= 0 ? String(row[colAbono] ?? "").trim() : "";
    const rawSaldo = colSaldo >= 0 ? String(row[colSaldo] ?? "").trim() : "";

    const cargo = rawCargo ? parseMonto(rawCargo) : 0;
    const abono = rawAbono ? parseMonto(rawAbono) : 0;
    const saldo = rawSaldo ? parseMonto(rawSaldo) : 0;

    data.push({
      Fecha: fecha,
      Oficina: "",
      "Nro Doc": "",
      "Descripción": rawDesc,
      Cargo: cargo,
      Abono: abono,
      Saldo: saldo,
    });
  }

  return { headers: FALABELLA_HEADERS, data };
}

export async function parseFalabellaFile(buffer: Buffer): Promise<{ headers: string[]; data: Record<string, unknown>[] }> {
  if (isXlsBuffer(buffer)) {
    try {
      return parseXlsFalabella(buffer);
    } catch {
      return { headers: FALABELLA_HEADERS, data: [] };
    }
  }

  let pdfData: { text: string };
  try {
    pdfData = await pdfParse(buffer);
  } catch {
    return { headers: FALABELLA_HEADERS, data: [] };
  }

  const text = pdfData.text;
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  let saldoInicial = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes("saldo inicial")) {
      const combined = lines.slice(i, i + 3).join(" ");
      const match = combined.match(/\$\s*[\d.]+/);
      if (match) {
        saldoInicial = parseMonto(match[0]);
        break;
      }
    }
  }

  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].toLowerCase();
    if (l.includes("fecha") && (l.includes("cargo") || l.includes("abono")) && l.includes("saldo")) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].toLowerCase();
      if (l.includes("fecha") && l.includes("descripci")) {
        headerIdx = i;
        break;
      }
    }
  }

  if (headerIdx === -1) {
    return { headers: FALABELLA_HEADERS, data: [] };
  }

  const transactionLines = lines.slice(headerIdx + 1);
  const dateRegex = /^(\d{2}\/\d{2}\/\d{4})/;
  const amountRegex = /\$\s*([\d.]+)/g;

  const rawRows: { fecha: string; descripcion: string; amounts: number[] }[] = [];

  for (const line of transactionLines) {
    const dateMatch = line.match(dateRegex);
    if (!dateMatch) continue;

    const fecha = dateMatch[1];

    const amounts: number[] = [];
    let m: RegExpExecArray | null;
    amountRegex.lastIndex = 0;
    while ((m = amountRegex.exec(line)) !== null) {
      amounts.push(parseMonto(m[0]));
    }

    if (amounts.length === 0) continue;

    let rest = line.slice(dateMatch[0].length).trim();
    rest = rest.replace(/\$\s*[\d.]+/g, "").replace(/\s{2,}/g, " ").trim();

    rawRows.push({ fecha, descripcion: rest, amounts });
  }

  const result: Record<string, unknown>[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const { amounts } = row;

    if (amounts.length === 0) continue;

    const saldo = amounts[amounts.length - 1];
    let cargo = 0;
    let abono = 0;

    if (amounts.length >= 3) {
      cargo = amounts[0];
      abono = amounts[1];
    } else if (amounts.length === 2) {
      const transAmount = amounts[0];
      const prevSaldo = i + 1 < rawRows.length
        ? rawRows[i + 1].amounts[rawRows[i + 1].amounts.length - 1]
        : saldoInicial;
      const delta = saldo - prevSaldo;
      if (delta >= 0) {
        abono = transAmount;
      } else {
        cargo = transAmount;
      }
    } else {
      continue;
    }

    result.push({
      Fecha: row.fecha,
      Oficina: "",
      "Nro Doc": "",
      "Descripción": row.descripcion,
      Cargo: cargo,
      Abono: abono,
      Saldo: saldo,
    });
  }

  return { headers: FALABELLA_HEADERS, data: result };
}
