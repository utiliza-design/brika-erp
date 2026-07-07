import * as XLSX from "xlsx";

export function downloadAsXlsx(
  data: Record<string, unknown>[],
  columns: { key: string; label: string }[],
  filename: string
) {
  const header = columns.map(c => c.label);
  const sheetRows = data.map(row =>
    columns.map(c => {
      const val = row[c.key];
      if (val === null || val === undefined) return "";
      return val;
    })
  );
  const ws = XLSX.utils.aoa_to_sheet([header, ...sheetRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Datos");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
