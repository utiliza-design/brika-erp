import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ShoppingCart, Download, RefreshCw, CalendarIcon, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, TrendingUp, Package, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MonthFilter, mesFromDDMMYYYY } from "@/components/month-filter";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadAsXlsx } from "@/lib/download-xlsx";

const COLUMNS: { key: string; label: string; align?: "right" }[] = [
  { key: "Fecha Venta",                                 label: "Fecha Venta" },
  { key: "Tipo de Documento",                           label: "Tipo Doc." },
  { key: "Numero Documento",                            label: "N° Doc." },
  { key: "Tipo Movimiento",                             label: "Tipo Mov." },
  { key: "Nombre Cliente",                              label: "Cliente" },
  { key: "Cliente RUT",                                 label: "RUT" },
  { key: "Sucursal",                                    label: "Sucursal" },
  { key: "Vendedor",                                    label: "Vendedor" },
  { key: "SKU",                                         label: "SKU" },
  { key: "Producto / Servicio",                         label: "Producto" },
  { key: "Variante",                                    label: "Variante" },
  { key: "Marca",                                       label: "Marca" },
  { key: "Tipo de Producto / Servicio",                 label: "Tipo Producto" },
  { key: "Cantidad",                                    label: "Cantidad",          align: "right" },
  { key: "Precio de Lista",                             label: "Precio Lista",       align: "right" },
  { key: "Precio Neto Unitario",                        label: "P. Neto Unit.",      align: "right" },
  { key: "Precio Bruto Unitario",                       label: "P. Bruto Unit.",     align: "right" },
  { key: "% Descuento",                                 label: "% Desc.",            align: "right" },
  { key: "Descuento Neto",                              label: "Desc. Neto",         align: "right" },
  { key: "Descuento Bruto",                             label: "Desc. Bruto",        align: "right" },
  { key: "Venta Total Neta",                            label: "Venta Neta",         align: "right" },
  { key: "Venta Total Bruta",                           label: "Venta Bruta",        align: "right" },
  { key: "Total Impuestos",                             label: "Impuestos",          align: "right" },
  { key: "Costo neto unitario",                         label: "Costo Unit.",        align: "right" },
  { key: "Costo Total Neto",                            label: "Costo Total",        align: "right" },
  { key: "Margen",                                      label: "Margen",             align: "right" },
  { key: "% Margen",                                    label: "% Margen",           align: "right" },
  { key: "Moneda",                                      label: "Moneda" },
  { key: "Lista de Precio",                             label: "Lista Precio" },
  { key: "Tipo de entrega",                             label: "Entrega" },
  { key: "Nombre de dcto",                              label: "Nombre Dcto." },
  { key: "Hora Venta",                                  label: "Hora" },
  { key: "Cliente Ciudad",                              label: "Ciudad" },
  { key: "Cliente Comuna",                              label: "Comuna" },
  { key: "Cliente Dirección",                           label: "Dirección" },
  { key: "Email Cliente",                               label: "Email" },
  { key: "Tracking number",                             label: "Tracking" },
  { key: "Otros Atributos",                             label: "Otros Atrib." },
  { key: "Detalle de Productos/Servicios Pack/Promo",   label: "Detalle Pack" },
];

const TRUNCATE_KEYS = new Set(["Producto / Servicio", "Variante"]);
const MAX_DISPLAY_LEN = 30;

const CURRENCY_KEYS = new Set([
  "Precio de Lista", "Precio Neto Unitario", "Precio Bruto Unitario",
  "Descuento Neto", "Descuento Bruto", "Venta Total Neta", "Venta Total Bruta",
  "Total Impuestos", "Costo neto unitario", "Costo Total Neto", "Margen",
]);

const PERCENT_KEYS = new Set(["% Descuento", "% Margen"]);

function formatCell(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (CURRENCY_KEYS.has(key)) {
    const num = Number(value);
    if (!isNaN(num)) return `$${Math.round(num).toLocaleString("es-CL")}`;
  }
  if (PERCENT_KEYS.has(key)) {
    const num = Number(value);
    if (!isNaN(num)) return `${(num * 100).toFixed(1)}%`;
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

function BsaleSyncPanel() {
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
      const res = await apiRequest("POST", "/api/bsale/sync-ventas", { desde, hasta });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/fact-ventas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-disponible"] });
      queryClient.invalidateQueries({ queryKey: ["/api/siguiente-pedido"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estado-resultados"] });
      if (data.insertadas === 0 && data.duplicadas === 0) {
        toast({
          title: "Sin datos",
          description: data.message || "No se encontraron ventas en el período seleccionado.",
        });
      } else {
        toast({
          title: "Sincronización completada",
          description: `${data.insertadas.toLocaleString("es-CL")} filas importadas${data.duplicadas > 0 ? `, ${data.duplicadas.toLocaleString("es-CL")} duplicadas omitidas` : ""}.`,
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
        data-testid="button-toggle-bsale-sync"
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
            <div className="space-y-2">
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
                      data-testid="input-bsale-desde"
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
                      data-testid="input-bsale-hasta"
                    />
                  </div>
                </div>
                <Button
                  onClick={() => syncMutation.mutate()}
                  disabled={!desde || !hasta || syncMutation.isPending}
                  size="sm"
                  className="gap-2"
                  data-testid="button-bsale-sync"
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
                    <span>{(syncMutation.data as any)?.insertadas ?? 0} importadas</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Si los costos aparecen vacíos en datos anteriores, re-sincroniza ese período para recalcularlos.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FactVentasPage() {
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [selectedTiposDocs, setSelectedTiposDocs] = useState<string[]>([]);
  const [tipoDocOpen, setTipoDocOpen] = useState(false);
  const { data: rows, isLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ["/api/fact-ventas"],
    staleTime: 2 * 60 * 1000,
  });

  const availableMonths = useMemo(() => {
    if (!rows) return [];
    const set = new Set<string>();
    for (const r of rows) {
      const d = String(r["Fecha Venta"] ?? "");
      const m = mesFromDDMMYYYY(d);
      if (m) set.add(m);
    }
    return Array.from(set);
  }, [rows]);

  const availableTiposDocs = useMemo(() => {
    if (!rows) return [];
    const set = new Set<string>();
    for (const r of rows) {
      const t = String(r["Tipo de Documento"] ?? "").trim();
      if (t) set.add(t);
    }
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const result = rows.filter(r => {
      if (selectedMonths.length > 0) {
        const m = mesFromDDMMYYYY(String(r["Fecha Venta"] ?? ""));
        if (!selectedMonths.includes(m)) return false;
      }
      if (selectedTiposDocs.length > 0) {
        if (!selectedTiposDocs.includes(String(r["Tipo de Documento"] ?? "").trim())) return false;
      }
      return true;
    });
    result.sort((a, b) => {
      const parseDMY = (s: string) => {
        const [d, m, y] = s.split("/").map(Number);
        return new Date(y, m - 1, d).getTime();
      };
      return parseDMY(String(b["Fecha Venta"] ?? "")) - parseDMY(String(a["Fecha Venta"] ?? ""));
    });
    return result;
  }, [rows, selectedMonths, selectedTiposDocs]);

  const totals = useMemo(() => {
    let ventaTotal = 0;
    let costoTotal = 0;
    for (const r of filtered) {
      const tipo = String(r["Tipo de Documento"] ?? "").toLowerCase().trim();
      const esSuma = tipo.includes("factura electr") || tipo.includes("boleta electr") || tipo.includes("comprobante de venta");
      const esNota = tipo.includes("nota de cr");
      if (!esSuma && !esNota) continue;
      const vn = Number(r["Venta Total Neta"] || 0);
      const cn = Number(r["Costo Total Neto"] || 0);
      const signoVenta = (esNota && vn > 0) ? -1 : 1;
      const signoCosto = (esNota && cn > 0) ? -1 : 1;
      ventaTotal += signoVenta * vn;
      costoTotal += signoCosto * cn;
    }
    const margen = ventaTotal > 0 ? (ventaTotal - costoTotal) / ventaTotal : 0;
    return { ventaTotal, costoTotal, margen };
  }, [filtered]);

  const fmtCLP = (n: number) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="p-6 space-y-4 max-w-full mx-auto">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-md bg-primary/10 mt-1">
          <ShoppingCart className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-fact-ventas-title">
            Detalle Ventas
          </h1>
          <p className="text-sm text-muted-foreground">
            {rows ? `${filtered.length.toLocaleString("es-CL")} registros` : "Cargando..."}
          </p>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <MonthFilter
              availableMonths={availableMonths}
              selectedMonths={selectedMonths}
              onChange={setSelectedMonths}
              className="w-48"
            />
            <Popover open={tipoDocOpen} onOpenChange={setTipoDocOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-9 w-52 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  )}
                  data-testid="button-tipo-doc-filter"
                >
                  <span className={cn("truncate", selectedTiposDocs.length === 0 ? "text-muted-foreground" : "")}>
                    {selectedTiposDocs.length === 0
                      ? "Tipo de documento"
                      : selectedTiposDocs.length === 1
                        ? selectedTiposDocs[0]
                        : `${selectedTiposDocs.length} tipos`}
                  </span>
                  <span className="flex items-center gap-0.5 shrink-0 ml-1">
                    {selectedTiposDocs.length > 0 && (
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedTiposDocs([]); }}
                        className="p-0.5 hover:text-destructive transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    )}
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-2" align="start">
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {availableTiposDocs.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 py-1">Sin datos</p>
                  )}
                  {availableTiposDocs.length > 0 && (
                    <div
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer border-b mb-1 pb-2"
                      onClick={() => {
                        const allChecked = availableTiposDocs.every(t => selectedTiposDocs.includes(t));
                        setSelectedTiposDocs(allChecked ? [] : [...availableTiposDocs]);
                      }}
                    >
                      <Checkbox
                        id="tipo-todos"
                        checked={availableTiposDocs.length > 0 && availableTiposDocs.every(t => selectedTiposDocs.includes(t))}
                        style={{ pointerEvents: "none" }}
                      />
                      <Label htmlFor="tipo-todos" className="text-sm cursor-pointer select-none font-medium">
                        Seleccionar todos
                      </Label>
                    </div>
                  )}
                  {availableTiposDocs.map(t => (
                    <div
                      key={t}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer"
                      onClick={() => {
                        setSelectedTiposDocs(prev =>
                          prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
                        );
                      }}
                    >
                      <Checkbox
                        id={`tipo-${t}`}
                        checked={selectedTiposDocs.includes(t)}
                        style={{ pointerEvents: "none" }}
                      />
                      <Label htmlFor={`tipo-${t}`} className="text-sm cursor-pointer select-none leading-tight">
                        {t}
                      </Label>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        {filtered.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-2"
            data-testid="button-download-fact-ventas"
            onClick={() => downloadAsXlsx(filtered as Record<string, unknown>[], COLUMNS, "detalle-ventas")}
          >
            <Download className="h-4 w-4" />
            Descargar xlsx
          </Button>
        )}
      </div>

      <BsaleSyncPanel />

      {rows && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-primary" />
                <p className="text-sm text-muted-foreground">Venta Total Neta</p>
              </div>
              <p className="text-2xl font-bold tabular-nums" data-testid="text-venta-total">{fmtCLP(totals.ventaTotal)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Package className="h-4 w-4 text-primary" />
                <p className="text-sm text-muted-foreground">Costo Total Neto</p>
              </div>
              <p className="text-2xl font-bold tabular-nums" data-testid="text-costo-total">{fmtCLP(totals.costoTotal)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingCart className="h-4 w-4 text-primary" />
                <p className="text-sm text-muted-foreground">Margen Bruto</p>
              </div>
              <p className="text-2xl font-bold tabular-nums" data-testid="text-margen-bruto">
                {fmtCLP(totals.ventaTotal - totals.costoTotal)}
                <span className="text-base font-normal text-muted-foreground ml-2">
                  {(totals.margen * 100).toFixed(1)}%
                </span>
              </p>
            </CardContent>
          </Card>
        </div>
      )}

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
                  No hay datos de ventas cargados
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
                <TableRow key={i} data-testid={`row-fact-venta-${i}`}>
                  {COLUMNS.map((col) => {
                    const cellValue = formatCell(col.key, row[col.key]);
                    const needsTruncation = TRUNCATE_KEYS.has(col.key) && cellValue.length > MAX_DISPLAY_LEN;
                    return (
                      <TableCell
                        key={col.key}
                        className={`text-xs whitespace-nowrap ${col.align === "right" ? "text-right tabular-nums" : ""}`}
                        title={needsTruncation ? cellValue : undefined}
                      >
                        {needsTruncation ? cellValue.slice(0, MAX_DISPLAY_LEN) + "…" : cellValue}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
