import * as XLSX from "xlsx";

interface ParsedCartola {
  headers: string[];
  data: Record<string, unknown>[];
}

const CARTOLA_HEADERS = [
  "Fecha",
  "Detalle Movimiento",
  "Cheque o Cargo",
  "Deposito o Abono",
  "Saldo",
  "Docto. Nro.",
  "Trn",
  "Caja",
  "Sucursal",
];

const COLUMN_ALIASES: Record<string, string> = {
  "descripción": "Detalle Movimiento",
  "descripcion": "Detalle Movimiento",
  "cargos (clp)": "Cheque o Cargo",
  "abonos (clp)": "Deposito o Abono",
  "saldo (clp)": "Saldo",
  "nro. docto.": "Docto. Nro.",
  "canal o sucursal": "Sucursal",
};

function excelSerialToDate(serial: number): string {
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400000);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function parseDate(value: unknown): string {
  if (typeof value === "number") {
    return excelSerialToDate(value);
  }
  const str = String(value ?? "").trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    return str;
  }
  return str;
}

export function parseCartolaFile(buffer: Buffer): ParsedCartola {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rawRows: (string | number | undefined)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });

  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rawRows.length, 30); i++) {
    const row = rawRows[i];
    const cells = row.map((c) => String(c ?? "").trim());
    if (cells.includes("Fecha") && (cells.includes("Saldo") || cells.includes("Saldo (CLP)"))) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    headerRowIndex = 1;
  }

  const headerRow = rawRows[headerRowIndex];
  const colMapping: { sourceIndex: number; targetName: string }[] = [];

  for (let j = 0; j < headerRow.length; j++) {
    const cellValue = String(headerRow[j] ?? "").trim();
    const cellLower = cellValue.toLowerCase();

    const matched = CARTOLA_HEADERS.find(
      (h) => h.toLowerCase() === cellLower
    );
    if (matched) {
      colMapping.push({ sourceIndex: j, targetName: matched });
      continue;
    }

    const aliased = COLUMN_ALIASES[cellLower];
    if (aliased) {
      colMapping.push({ sourceIndex: j, targetName: aliased });
    }
  }

  if (colMapping.length === 0) {
    colMapping.push(...CARTOLA_HEADERS.map((h, i) => ({ sourceIndex: i, targetName: h })));
  }

  const dataRows = rawRows.slice(headerRowIndex + 1);
  const data: Record<string, unknown>[] = [];

  for (const row of dataRows) {
    const isEmpty = row.every((c) => String(c ?? "").trim() === "");
    if (isEmpty) continue;

    const record: Record<string, unknown> = {};
    for (const mapping of colMapping) {
      const rawValue = row[mapping.sourceIndex];
      if (mapping.targetName === "Fecha") {
        record[mapping.targetName] = parseDate(rawValue);
      } else if (mapping.targetName === "Detalle Movimiento" || mapping.targetName === "Sucursal") {
        record[mapping.targetName] = String(rawValue ?? "").trim();
      } else {
        record[mapping.targetName] = rawValue ?? "";
      }
    }

    if (!record["Fecha"] || String(record["Fecha"]).trim() === "") continue;

    data.push(record);
  }

  return {
    headers: CARTOLA_HEADERS,
    data,
  };
}
