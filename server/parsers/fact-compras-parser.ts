import * as XLSX from "xlsx";

interface ParsedFactCompras {
  headers: string[];
  data: Record<string, unknown>[];
}

const SECTION_LABELS = new Set(["Recepcionados", "Reclamados", "Aceptados", "Sin Considerar"]);

const FIELD_HEADERS = [
  "Fecha Emisión",
  "Tipo Documento",
  "Folio",
  "RUT",
  "Razón Social",
  "Monto Exento",
  "Monto Neto",
  "Monto Iva",
  "Impto. Especifico",
  "Monto Total",
  "Fecha Acuse de Mercadería",
  "Notificación Comercial",
  "Fecha Notificación Comercial",
  "XML recepcionado",
];

const OUTPUT_HEADERS = [...FIELD_HEADERS, "Estado"];

function excelSerialToDate(serial: number | null): string {
  if (serial === null || isNaN(Number(serial))) return "";
  try {
    return XLSX.SSF.format("dd/mm/yyyy", serial);
  } catch {
    return String(serial);
  }
}

export function parseFactComprasFile(buffer: Buffer): ParsedFactCompras {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
  }) as (string | number | null)[][];

  const result: Record<string, unknown>[] = [];
  let currentSection = "";

  for (const row of rawRows) {
    if (!row || row.every((c) => c === null || c === "")) continue;

    const col0 = row[0] !== null && row[0] !== undefined ? String(row[0]).trim() : "";

    if (SECTION_LABELS.has(col0)) {
      currentSection = col0;
      continue;
    }

    if (col0 === "Fecha Emisión") {
      continue;
    }

    const col3 = row[3] !== null && row[3] !== undefined ? String(row[3]).trim() : "";
    if (col3 === "Total") {
      continue;
    }

    if (!currentSection) continue;

    const fechaEmision = typeof row[0] === "number" ? excelSerialToDate(row[0]) : String(row[0] ?? "").trim();
    const fechaAcuse =
      row[10] !== null && row[10] !== undefined
        ? typeof row[10] === "number"
          ? excelSerialToDate(row[10])
          : String(row[10]).trim()
        : "";
    const fechaNotif =
      row[12] !== null && row[12] !== undefined
        ? typeof row[12] === "number"
          ? excelSerialToDate(row[12])
          : String(row[12]).trim()
        : "";

    const obj: Record<string, unknown> = {
      "Fecha Emisión": fechaEmision,
      "Tipo Documento": row[1] !== null ? String(row[1] ?? "").trim() : "",
      "Folio": row[2] !== null ? row[2] : "",
      "RUT": row[3] !== null ? String(row[3] ?? "").trim() : "",
      "Razón Social": row[4] !== null ? String(row[4] ?? "").trim() : "",
      "Monto Exento": row[5] !== null ? Number(row[5]) : 0,
      "Monto Neto": row[6] !== null ? Number(row[6]) : 0,
      "Monto Iva": row[7] !== null ? Number(row[7]) : 0,
      "Impto. Especifico": row[8] !== null ? Number(row[8]) : 0,
      "Monto Total": row[9] !== null ? Number(row[9]) : 0,
      "Fecha Acuse de Mercadería": fechaAcuse,
      "Notificación Comercial": row[11] !== null ? String(row[11] ?? "").trim() : "",
      "Fecha Notificación Comercial": fechaNotif,
      "XML recepcionado": row[13] !== null ? String(row[13] ?? "").trim() : "",
      "Estado": currentSection,
    };

    result.push(obj);
  }

  return { headers: OUTPUT_HEADERS, data: result };
}
