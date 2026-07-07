import * as XLSX from "xlsx";

interface ParsedSecurity {
  headers: string[];
  data: Record<string, unknown>[];
}

const SECURITY_HEADERS = ["Fecha", "Detalle Movimiento", "Docto. Nro.", "Cargo", "Abono", "Saldo"];

function excelSerialToDate(serial: number): string {
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400000);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function parseSecurityDate(value: unknown): string {
  if (typeof value === "number" && value > 30000 && value < 70000) {
    return excelSerialToDate(value);
  }
  const str = String(value ?? "").trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const parts = str.split("/");
    return `${parts[0].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[2]}`;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(str)) {
    const [m, d, y] = str.split("/").map(Number);
    const fullYear = y + 2000;
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${fullYear}`;
  }
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(str)) {
    const [d, m, y] = str.split("-");
    return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(str)) {
    const [y, m, d] = str.slice(0, 10).split("-");
    return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
  }
  return str;
}

// Parse amounts that may use Spanish locale formatting (comma as decimal separator).
// Examples: "20473,00" → 20473, "-1.234,56" → -1234.56, "892500,00" → 892500.
// Falls back to stripping non-numeric chars for other formats.
function parseSpanishAmount(val: unknown): number {
  const str = String(val ?? "0").trim();
  // Spanish format: optional sign, optional thousands dots, comma as decimal
  // e.g. "1.234,56", "20473,00", "-123,00", "-1.234,56"
  if (/^-?[\d.]*,\d+$/.test(str)) {
    return parseFloat(str.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return Number(str.replace(/[^0-9.-]/g, "")) || 0;
}

function normalizeCell(val: unknown): string {
  return String(val ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/[^\x20-\x7E\u00C0-\u024F]/g, "")
    .trim()
    .toLowerCase();
}

export function parseSecurityFile(buffer: Buffer): ParsedSecurity {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: true });

  let headerRowIndex = -1;
  let dataSheet: XLSX.WorkSheet | null = null;
  let rawRows: (string | number | undefined)[][] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: (string | number | undefined)[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: true,
    });

    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const row = rows[i];
      if (!row || row.length < 4) continue;
      const col0 = normalizeCell(row[0]);
      const col5 = normalizeCell(row[row.length - 1]);
      const col4 = normalizeCell(row[row.length - 2]);
      if (col0.includes("fecha") && (col5.includes("saldo") || col4.includes("saldo"))) {
        headerRowIndex = i;
        dataSheet = sheet;
        rawRows = rows;
        break;
      }
    }
    if (dataSheet) break;
  }

  if (!dataSheet || headerRowIndex === -1) {
    return { headers: SECURITY_HEADERS, data: [] };
  }

  // Detect format from header text. The "Últimos Movimientos" export uses
  // plural headers ("Cargos"/"Abonos"/"Saldos") and stores amounts in pesos
  // directly. The classic "Cartola Histórica" export uses singular headers
  // ("Cargo"/"Abono"/"Saldo") and stores amounts in centavos (×100).
  const headerRow = rawRows[headerRowIndex] ?? [];
  const headerText = headerRow.map((c) => normalizeCell(c)).join("|");
  const isUltimosMovimientos =
    headerText.includes("descripcion") ||
    headerText.includes("cargos") ||
    headerText.includes("abonos") ||
    headerText.includes("saldos");
  const amountDivisor = isUltimosMovimientos ? 1 : 100;

  const dataRows = rawRows.slice(headerRowIndex + 1);
  const data: Record<string, unknown>[] = [];

  for (const row of dataRows) {
    if (!row || row.length === 0) continue;
    const isEmpty = row.every((c) => String(c ?? "").trim() === "");
    if (isEmpty) continue;

    const fecha = parseSecurityDate(row[0]);
    if (!fecha || fecha.trim() === "") continue;
    // Skip summary/footer rows that don't have a real date in col 0.
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(fecha)) continue;

    const detalle = String(row[1] ?? "")
      .replace(/<[^>]+>/g, "")
      .replace(/[^\x20-\x7E\u00C0-\u024F ]/g, "")
      .trim();

    const nDocBanco = String(row[2] ?? "").trim();
    const cargo = Math.round(parseSpanishAmount(row[3]) / amountDivisor);
    const abono = Math.round(parseSpanishAmount(row[4]) / amountDivisor);
    const saldo = Math.round(parseSpanishAmount(row[5]) / amountDivisor);

    data.push({
      Fecha: fecha,
      "Detalle Movimiento": detalle,
      "Docto. Nro.": nDocBanco,
      Cargo: cargo,
      Abono: abono,
      Saldo: saldo,
    });
  }

  return { headers: SECURITY_HEADERS, data };
}
