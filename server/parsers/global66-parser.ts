import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;

const GLOBAL66_HEADERS = ["Fecha", "Descripción", "Movimiento", "Débito", "Abono", "Saldo"];

/**
 * Parse a monetary string from a Global66 PDF.
 *
 * CLP amounts: "$5,000,000" (comma = thousands separator, no decimals)
 *              "$1.234" (dot = thousands separator alternative, no decimals)
 *   → Remove both commas and dots, then parseInt.
 *
 * USD amounts: "$10,736.86" (comma = thousands separator, dot = decimal)
 *   → Remove commas only, keep dot, then parseFloat.
 */
function parseMonto(str: string, currency: "CLP" | "USD"): number {
  const noSign = str.replace(/\$/g, "").replace(/\s/g, "").trim();
  if (currency === "USD") {
    // Remove thousand-separator commas; keep decimal dot
    return parseFloat(noSign.replace(/,/g, "")) || 0;
  }
  // CLP: no decimals — remove BOTH commas and dots (both used as thousands separators)
  return parseInt(noSign.replace(/[,\.]/g, ""), 10) || 0;
}

function convertDate(dateTimeStr: string): string {
  // Input: "2026-03-27 10:39:42" → "27/03/2026"
  const date = dateTimeStr.slice(0, 10);
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Parse the "Inicio de período" opening balance from the PDF header section.
 * This is used as the initial prevSaldo for correct Débito/Abono classification.
 */
function parseOpeningBalance(lines: string[], currency: "CLP" | "USD"): number {
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("inicio de período:") || lower.startsWith("inicio de periodo:")) {
      const amountMatch = line.match(/\$[\d,\.]+/);
      if (amountMatch) return parseMonto(amountMatch[0], currency);
    }
  }
  return 0;
}

export async function parseGlobal66File(
  buffer: Buffer,
  currency: "CLP" | "USD"
): Promise<{ headers: string[]; data: Record<string, unknown>[] }> {
  let pdfData: { text: string };
  try {
    pdfData = await pdfParse(buffer);
  } catch {
    return { headers: GLOBAL66_HEADERS, data: [] };
  }

  const allLines = pdfData.text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Regexes for classifying lines
  const dateRegex = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/;
  const movementRegex = /^\d{5,}$/;   // 5+ pure digits → movement number
  const continuationRegex = /^\d+$/;   // any pure digits → broken-amount continuation
  const amountStartRegex = /^\$/;      // line starts with $ → amount line

  // Parse opening balance from header lines (before first date line)
  let firstDateIdx = 0;
  for (let i = 0; i < allLines.length; i++) {
    if (dateRegex.test(allLines[i])) { firstDateIdx = i; break; }
  }
  const headerLines = allLines.slice(0, firstDateIdx);
  const openingBalance = parseOpeningBalance(headerLines, currency);

  const transactionLines = allLines.slice(firstDateIdx);

  // Split lines into per-transaction blocks, each starting with a date line.
  // Each transaction block: [dateTime, description, movementNumber, ...amountLines]
  const blocks: string[][] = [];
  let currentBlock: string[] | null = null;

  for (const line of transactionLines) {
    if (dateRegex.test(line)) {
      if (currentBlock && currentBlock.length > 1) blocks.push(currentBlock);
      currentBlock = [line];
    } else if (currentBlock) {
      const lower = line.toLowerCase();
      if (lower === "totales" || lower.startsWith("totales")) break;
      currentBlock.push(line);
    }
  }
  if (currentBlock && currentBlock.length > 1) blocks.push(currentBlock);

  const result: Record<string, unknown>[] = [];
  // Use parsed opening balance so that the very first transaction is classified correctly
  let prevSaldo = openingBalance;

  for (const block of blocks) {
    const [dateLine, ...rest] = block;
    const fecha = convertDate(dateLine.trim());

    // Classify remaining lines into description, movement, and amount lines.
    let descripcion = "";
    let movimiento = "";
    const amountLines: string[] = [];

    for (const line of rest) {
      if (
        !descripcion &&
        !movementRegex.test(line) &&
        !amountStartRegex.test(line) &&
        !continuationRegex.test(line)
      ) {
        // First ordinary text line → description
        descripcion = line;
      } else if (!movimiento && movementRegex.test(line) && !amountStartRegex.test(line)) {
        // First pure-digit (≥5 chars) line after description → movement number
        movimiento = line;
      } else {
        // Amount lines and digit continuations accumulate here
        amountLines.push(line);
      }
    }

    // Reconstruct broken amounts caused by PDF text-extraction line wrapping.
    // e.g. "$10,000,00" + "0" (continuation) → "$10,000,000"
    const joinedAmountLines: string[] = [];
    for (const line of amountLines) {
      if (continuationRegex.test(line) && joinedAmountLines.length > 0) {
        joinedAmountLines[joinedAmountLines.length - 1] += line;
      } else {
        joinedAmountLines.push(line);
      }
    }

    // Extract all dollar amounts from the concatenated amount string.
    const amountStr = joinedAmountLines.join("");
    const amountMatches = Array.from(amountStr.matchAll(/\$[\d,]+(?:\.\d+)?/g));
    const amounts = amountMatches.map((m) => parseMonto(m[0], currency));

    // Need at least: [transactionAmount, saldo]
    if (amounts.length < 2) continue;

    const saldo = amounts[amounts.length - 1];
    const transactionAmount = amounts[amounts.length - 2];

    // Determine Débito vs Abono from the change in balance.
    // Global66 PDF columns (Débito/Abono) are not individually identifiable in extracted text
    // because zero-valued columns are omitted. The saldo delta unambiguously identifies direction.
    const delta = saldo - prevSaldo;
    let debito = 0;
    let abono = 0;
    if (delta >= 0) {
      abono = transactionAmount;
    } else {
      debito = transactionAmount;
    }

    prevSaldo = saldo;

    result.push({
      Fecha: fecha,
      Descripción: descripcion,
      Movimiento: movimiento,
      Débito: debito,
      Abono: abono,
      Saldo: saldo,
    });
  }

  return { headers: GLOBAL66_HEADERS, data: result };
}
