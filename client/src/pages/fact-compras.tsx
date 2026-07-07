import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ShoppingBag, Download, RefreshCw, CalendarIcon, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MonthFilter, mesFromDDMMYYYY, mesFromExcelSerial } from "@/components/month-filter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadAsXlsx } from "@/lib/download-xlsx";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const COLUMNS: { key: string; label: string; align?: "right" }[] = [
  { key: "Fecha Emisión",                   label: "Fecha Emisión" },
  { key: "Estado",                           label: "Estado" },
  { key: "Tipo Documento",                   label: "Tipo Doc." },
  { key: "Folio",                            label: "Folio" },
  { key: "RUT",                              label: "RUT" },
  { key: "Razón Social",                     label: "Razón Social" },
  { key: "Monto Exento",                     label: "M. Exento",    align: "right" },
  { key: "Monto Neto",                       label: "M. Neto",      align: "right" },
  { key: "Monto Iva",                        label: "IVA",          align: "right" },
  { key: "Impto. Especifico",                label: "Impto. Esp.",  align: "right" },
  { key: "Monto Total",                      label: "Total",        align: "right" },
  { key: "Fecha Acuse de Mercadería",        label: "Acuse" },
  { key: "Notificación Comercial",           label: "Notif. Comercial" },
  { key: "Fecha Notificación Comercial",     label: "Fecha Notif." },
  { key: "XML recepcionado",                 label: "XML" },
];

const CURRENCY_KEYS = new Set([
  "Monto Exento", "Monto Neto", "Monto Iva", "Impto. Especifico", "Monto Total",
]);

const ESTADO_COLORS: Record<string, string> = {
  "Recepcionados":   "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "Aceptados":       "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  "Reclamados":      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  "Sin Considerar":  "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function formatCell(key: string, value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "Estado") {
    const label = String(value);
    const cls = ESTADO_COLORS[label] ?? "bg-muted text-muted-foreground";
    return <Badge className={`text-xs font-medium ${cls} border-0`}>{label}</Badge>;
  }
  if (CURRENCY_KEYS.has(key)) {
    const num = Number(value);
    if (!isNaN(num)) return `$${Math.round(num).toLocaleString("es-CL")}`;
  }
  return String(value);
}

function getDefaultDates() {
  const now = new Date();
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { desde: fmt(firstOfLastMonth), hasta: fmt(lastOfLastMonth) };
}

function BsaleFactComprasSyncPanel() {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const defaults = getDefaultDates();
  const [desde, setDesde] = useState(defaults.desde);
  const [hasta, setHasta] = useState(defaults.hasta);

  const { data: bsaleStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/bsale/status"],
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/bsale/sync-fact-compras", { desde, hasta });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/fact-compras"] });
      if (data.insertadas === 0 && data.duplicadas === 0) {
        toast({
          title: "Sin datos",
          description: data.message || "No se encontraron documentos en el período seleccionado.",
        });
      } else {
        toast({
          title: "Sincronización completada",
          description: `${data.insertadas.toLocaleString("es-CL")} documentos importados${data.duplicadas > 0 ? `, ${data.duplicadas.toLocaleString("es-CL")} duplicados omitidos` : ""}.`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error de sincronización",
        description: error.message || "No se pudo conectar con BSale.",
        variant: "destructive",
      });
    },
  });

  if (!bsaleStatus) return null;

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
        onClick={() => setExpanded(!expanded)}
        data-testid="button-toggle-bsale-fact-compras-sync"
      >
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Sincronizar desde BSale</span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t">
          {!bsaleStatus.configured ? (
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Configura el secreto <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/50 px-1 py-0.5 rounded">BSALE_ACCESS_TOKEN</code> en los Secrets del proyecto para activar la sincronización.</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Desde</label>
                <div className="relative">
                  <CalendarIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    type="date"
                    value={desde}
                    onChange={(e) => setDesde(e.target.value)}
                    className="pl-8 h-9 w-40 text-sm"
                    data-testid="input-bsale-fact-compras-desde"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Hasta</label>
                <div className="relative">
                  <CalendarIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    type="date"
                    value={hasta}
                    onChange={(e) => setHasta(e.target.value)}
                    className="pl-8 h-9 w-40 text-sm"
                    data-testid="input-bsale-fact-compras-hasta"
                  />
                </div>
              </div>
              <Button
                onClick={() => syncMutation.mutate()}
                disabled={!desde || !hasta || syncMutation.isPending}
                size="sm"
                className="gap-2"
                data-testid="button-bsale-fact-compras-sync"
              >
                {syncMutation.isPending ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Sincronizando…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Sincronizar
                  </>
                )}
              </Button>
              {syncMutation.isSuccess && (
                <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{(syncMutation.data as any)?.insertadas ?? 0} importados</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FactComprasPage() {
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const { data: rows, isLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ["/api/fact-compras"],
  });

  const parseFecha = (val: unknown): string => {
    const s = String(val ?? "");
    if (!s) return "";
    if (s.includes("/")) return mesFromDDMMYYYY(s);
    const n = parseFloat(s);
    if (!isNaN(n) && n > 1000) return mesFromExcelSerial(n);
    return "";
  };

  const availableMonths = useMemo(() => {
    if (!rows) return [];
    const set = new Set<string>();
    for (const r of rows) {
      const m = parseFecha(r["Fecha Emisión"]);
      if (m) set.add(m);
    }
    return Array.from(set);
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (selectedMonths.length === 0) return rows;
    return rows.filter(r => {
      const m = parseFecha(r["Fecha Emisión"]);
      return selectedMonths.includes(m);
    });
  }, [rows, selectedMonths]);

  return (
    <div className="p-6 space-y-4 max-w-full mx-auto">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-md bg-primary/10 mt-1">
          <ShoppingBag className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-fact-compras-title">
            Facturas de Compra
          </h1>
          <p className="text-sm text-muted-foreground">
            {rows ? `${filtered.length.toLocaleString("es-CL")} registros` : "Cargando..."}
          </p>
          <div className="mt-2">
            <MonthFilter
              availableMonths={availableMonths}
              selectedMonths={selectedMonths}
              onChange={setSelectedMonths}
              className="w-48"
            />
          </div>
        </div>
        {filtered.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-2"
            data-testid="button-download-fact-compras"
            onClick={() => downloadAsXlsx(filtered as Record<string, unknown>[], COLUMNS, "facturas-de-compra")}
          >
            <Download className="h-4 w-4" />
            Descargar xlsx
          </Button>
        )}
      </div>

      <BsaleFactComprasSyncPanel />

      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((col) => (
                <TableHead
                  key={col.key}
                  className={`text-xs font-semibold whitespace-nowrap ${col.align === "right" ? "text-right" : ""}`}
                >
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  {COLUMNS.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !rows || rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS.length} className="text-center py-12 text-muted-foreground">
                  No hay datos de facturas de compra cargados
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS.length} className="text-center py-12 text-muted-foreground">
                  No hay registros para los meses seleccionados
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row, i) => (
                <TableRow key={i} data-testid={`row-fact-compra-${i}`}>
                  {COLUMNS.map((col) => (
                    <TableCell
                      key={col.key}
                      className={`text-xs whitespace-nowrap ${col.align === "right" ? "text-right tabular-nums" : ""}`}
                    >
                      {formatCell(col.key, row[col.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
