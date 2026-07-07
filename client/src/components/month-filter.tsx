import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MESES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function formatMesLabel(yyyymm: string): string {
  const [year, month] = yyyymm.split("-");
  return `${MESES_ES[parseInt(month, 10) - 1]} ${year}`;
}

export function mesFromDDMMYYYY(ddmmyyyy: string): string {
  const parts = ddmmyyyy.split("/");
  if (parts.length !== 3) return "";
  return `${parts[2]}-${parts[1]}`;
}

export function mesFromISO(iso: string): string {
  return iso.substring(0, 7);
}

export function mesFromExcelSerial(serial: number | string): string {
  const n = typeof serial === "string" ? parseFloat(serial) : serial;
  if (!n || isNaN(n) || n < 1) return "";
  const d = new Date((n - 25569) * 86400000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}`;
}

interface MonthFilterProps {
  availableMonths: string[];
  selectedMonths: string[];
  onChange: (months: string[]) => void;
  label?: string;
  className?: string;
}

export function MonthFilter({ availableMonths, selectedMonths, onChange, label = "Mes", className }: MonthFilterProps) {
  const [open, setOpen] = useState(false);

  const sorted = [...availableMonths].sort().reverse();

  const toggle = (mes: string) => {
    if (selectedMonths.includes(mes)) {
      onChange(selectedMonths.filter(m => m !== mes));
    } else {
      onChange([...selectedMonths, mes]);
    }
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const allSelected = selectedMonths.length === 0;
  const labelText = allSelected
    ? label
    : selectedMonths.length === 1
      ? formatMesLabel(selectedMonths[0])
      : `${selectedMonths.length} meses`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 data-[placeholder]:text-muted-foreground",
            className
          )}
          data-testid="button-month-filter"
        >
          <span className={cn("truncate", allSelected ? "text-muted-foreground" : "")}>
            {labelText}
          </span>
          <span className="flex items-center gap-0.5 shrink-0 ml-1">
            {!allSelected && (
              <span
                role="button"
                onClick={clearAll}
                className="p-0.5 hover:text-destructive transition-colors"
                data-testid="button-clear-month-filter"
              >
                <X className="h-3 w-3" />
              </span>
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {sorted.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1">Sin datos</p>
          )}
          {sorted.length > 0 && (
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer border-b mb-1 pb-2"
              onClick={() => {
                const allChecked = sorted.every(m => selectedMonths.includes(m));
                onChange(allChecked ? [] : sorted);
              }}
            >
              <Checkbox
                id="mes-todos"
                checked={sorted.length > 0 && sorted.every(m => selectedMonths.includes(m))}
                onCheckedChange={() => {
                  const allChecked = sorted.every(m => selectedMonths.includes(m));
                  onChange(allChecked ? [] : sorted);
                }}
              />
              <Label htmlFor="mes-todos" className="text-sm cursor-pointer select-none font-medium">
                Seleccionar todos
              </Label>
            </div>
          )}
          {sorted.map(mes => (
            <div
              key={mes}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer"
              onClick={() => toggle(mes)}
            >
              <Checkbox
                id={`mes-${mes}`}
                checked={selectedMonths.includes(mes)}
                onCheckedChange={() => toggle(mes)}
              />
              <Label
                htmlFor={`mes-${mes}`}
                className="text-sm cursor-pointer select-none"
              >
                {formatMesLabel(mes)}
              </Label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
