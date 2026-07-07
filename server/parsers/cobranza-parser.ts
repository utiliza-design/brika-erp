import * as XLSX from "xlsx";

const ALLOWED_TYPES = ["BOLETA ELECTRÓNICA", "FACTURA ELECTRÓNICA"];

interface ParsedCobranza {
  headers: string[];
  data: Record<string, string>[];
}

function parseHtmlCobranza(html: string): ParsedCobranza {
  const rowMatches = html.match(/<tr>(.*?)<\/tr>/g) || [];

  const allRows: string[][] = rowMatches.map((row) => {
    const cells = row.match(/<td[^>]*>(.*?)<\/td>/g) || [];
    return cells.map((cell) => {
      let text = cell.replace(/<[^>]*>/g, "").trim();
      if (text === "&nbsp;" || text === "<nil>") text = "";
      return text;
    });
  });

  const sections: { headers: string[]; rows: string[][] }[] = [];
  let currentHeaders: string[] | null = null;
  let currentRows: string[][] = [];
  let currentSectionAllowed = false;

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    const firstCell = row[0] || "";

    const isSectionTitle = row.length <= 2 && firstCell !== "" && firstCell !== "&nbsp;" && !/^<b>/.test(row[0] || "");

    if (isSectionTitle) {
      if (currentHeaders && currentRows.length > 0 && currentSectionAllowed) {
        sections.push({ headers: currentHeaders, rows: currentRows });
      }
      currentHeaders = null;
      currentRows = [];
      currentSectionAllowed = ALLOWED_TYPES.some((t) => firstCell.toUpperCase().startsWith(t));
      continue;
    }

    if (firstCell === "Tipo Documento" && row.length > 5) {
      if (currentHeaders && currentRows.length > 0 && currentSectionAllowed) {
        sections.push({ headers: currentHeaders, rows: currentRows });
      }
      currentHeaders = row;
      currentRows = [];
      continue;
    }

    const isEmpty = row.every((c) => c === "" || c === "&nbsp;");
    if (isEmpty) {
      if (currentHeaders && currentRows.length > 0 && currentSectionAllowed) {
        sections.push({ headers: currentHeaders, rows: currentRows });
      }
      currentHeaders = null;
      currentRows = [];
      continue;
    }

    if (currentHeaders && currentSectionAllowed) {
      currentRows.push(row);
    }
  }

  if (currentHeaders && currentRows.length > 0 && currentSectionAllowed) {
    sections.push({ headers: currentHeaders, rows: currentRows });
  }

  const allHeadersSet = new Set<string>();
  const orderedHeaders: string[] = [];
  for (const section of sections) {
    for (const h of section.headers) {
      if (!allHeadersSet.has(h)) {
        allHeadersSet.add(h);
        orderedHeaders.push(h);
      }
    }
  }

  const unifiedData: Record<string, string>[] = [];
  for (const section of sections) {
    const colMap: Record<string, number> = {};
    section.headers.forEach((h, idx) => {
      colMap[h] = idx;
    });

    for (const row of section.rows) {
      const record: Record<string, string> = {};
      for (const col of orderedHeaders) {
        const idx = colMap[col];
        if (idx !== undefined && idx < row.length) {
          record[col] = row[idx];
        } else {
          record[col] = "";
        }
      }
      unifiedData.push(record);
    }
  }

  return {
    headers: orderedHeaders,
    data: unifiedData,
  };
}

function parseExcelCobranza(buffer: Buffer): ParsedCobranza {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rawRows: (string | number | undefined)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });

  const sections: { headers: string[]; rows: (string | number | undefined)[][] }[] = [];
  let currentHeaders: string[] | null = null;
  let currentRows: (string | number | undefined)[][] = [];
  let currentSectionAllowed = false;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const firstCell = String(row[0] ?? "").trim();

    const isSectionTitle = /^(BOLETA|FACTURA|COTIZACION|NOTA DE|GUIA)/i.test(firstCell) &&
      !row.slice(1).some((c) => String(c ?? "").trim() !== "");

    if (isSectionTitle) {
      if (currentHeaders && currentRows.length > 0 && currentSectionAllowed) {
        sections.push({ headers: currentHeaders, rows: currentRows });
      }
      currentHeaders = null;
      currentRows = [];
      currentSectionAllowed = ALLOWED_TYPES.some((t) => firstCell.toUpperCase().startsWith(t));
      continue;
    }

    if (firstCell === "Tipo Documento" && row.length > 5) {
      if (currentHeaders && currentRows.length > 0 && currentSectionAllowed) {
        sections.push({ headers: currentHeaders, rows: currentRows });
      }
      currentHeaders = row.map((c) => String(c ?? "").trim());
      currentRows = [];
      continue;
    }

    const isEmpty = row.every((c) => String(c ?? "").trim() === "");
    if (isEmpty) {
      if (currentHeaders && currentRows.length > 0 && currentSectionAllowed) {
        sections.push({ headers: currentHeaders, rows: currentRows });
      }
      currentHeaders = null;
      currentRows = [];
      continue;
    }

    if (currentHeaders && currentSectionAllowed) {
      currentRows.push(row);
    }
  }

  if (currentHeaders && currentRows.length > 0 && currentSectionAllowed) {
    sections.push({ headers: currentHeaders, rows: currentRows });
  }

  const allHeadersSet = new Set<string>();
  const orderedHeaders: string[] = [];
  for (const section of sections) {
    for (const h of section.headers) {
      if (!allHeadersSet.has(h)) {
        allHeadersSet.add(h);
        orderedHeaders.push(h);
      }
    }
  }

  const unifiedData: Record<string, string>[] = [];
  for (const section of sections) {
    const colMap: Record<string, number> = {};
    section.headers.forEach((h, idx) => {
      colMap[h] = idx;
    });

    for (const row of section.rows) {
      const record: Record<string, string> = {};
      for (const col of orderedHeaders) {
        const idx = colMap[col];
        if (idx !== undefined && idx < row.length) {
          record[col] = String(row[idx] ?? "");
        } else {
          record[col] = "";
        }
      }
      unifiedData.push(record);
    }
  }

  return {
    headers: orderedHeaders,
    data: unifiedData,
  };
}

export function parseCobranzaFile(buffer: Buffer): ParsedCobranza {
  const head = buffer.subarray(0, 200).toString("utf-8").trim().toLowerCase();
  const isHtml = head.startsWith("<html") || head.startsWith("<!doctype") || head.startsWith("<table");

  if (isHtml) {
    const html = buffer.toString("utf-8");
    return parseHtmlCobranza(html);
  }

  return parseExcelCobranza(buffer);
}
