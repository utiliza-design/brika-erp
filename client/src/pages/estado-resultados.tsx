import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Info, Upload, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const EXCLUIR_GASTOS_OP = new Set(["C-IMPORTACION", "C-IVA - PPM", "C-OTRAS DEVOLUCIONES"]);

interface MonthData {
  month: number;
  ventaTotalNeta: number;
  costoTotalNeto: number;
  ventaFacturas: number;
  ventaBoletas: number;
  notaCredito: number;
  ventaAmigo: number;
  costoVentaAmigo: number;
  ventaAmigoSinCosto?: number;
  utilidadBruta: number;
  margen: number;
}

interface EstadoResultadosResponse {
  years: number[];
  data: MonthData[];
  sourceFileCount: number;
}

interface CentroMes {
  centroCostos: string;
  montos: Record<string, number>;
  total: number;
}

interface CostosOperacionalesResponse {
  years: number[];
  centros: CentroMes[];
}

interface ActiveMonth {
  year: number;
  month: number;
  label: string;
}

function formatCLP(value: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("es-CL", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

function getActivePeriodMonths(period: string): ActiveMonth[] {
  if (period !== "last12" && period !== "last6") {
    const year = parseInt(period);
    return MONTH_NAMES.map((label, i) => ({ year, month: i + 1, label }));
  }
  const count = period === "last12" ? 12 : 6;
  const now = new Date();
  const months: ActiveMonth[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const label = `${MONTH_NAMES[month - 1]}'${String(year).slice(2)}`;
    months.push({ year, month, label });
  }
  return months;
}

export default function EstadoResultadosPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [source, setSource] = useState<"bsale_sync" | "manual">("bsale_sync");

  const isRolling = selectedPeriod === "last12" || selectedPeriod === "last6";
  const activeMonths: ActiveMonth[] = selectedPeriod ? getActivePeriodMonths(selectedPeriod) : [];
  const neededYears = isRolling
    ? [...new Set(activeMonths.map((m) => m.year))]
    : selectedPeriod ? [parseInt(selectedPeriod)] : [];

  const primaryYear = neededYears[0];
  const secondaryYear = neededYears[1];

  const { data: primaryResult, isLoading: isLoadingPrimary } = useQuery<EstadoResultadosResponse>({
    queryKey: ["/api/estado-resultados", primaryYear ? String(primaryYear) : "", source],
    queryFn: async () => {
      const base = primaryYear ? `/api/estado-resultados?year=${primaryYear}` : "/api/estado-resultados?";
      const url = `${base}${primaryYear ? "&" : ""}source=${source}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Error al obtener datos");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: secondaryResult, isLoading: isLoadingSecondary } = useQuery<EstadoResultadosResponse>({
    queryKey: ["/api/estado-resultados", secondaryYear ? String(secondaryYear) : "skip", source],
    queryFn: async () => {
      const res = await fetch(`/api/estado-resultados?year=${secondaryYear}&source=${source}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    enabled: !!secondaryYear,
    staleTime: 2 * 60 * 1000,
  });

  const { data: primaryCostos, isLoading: isLoadingCostosPrimary } = useQuery<CostosOperacionalesResponse>({
    queryKey: ["/api/costos-operacionales", primaryYear ? String(primaryYear) : ""],
    queryFn: async () => {
      const url = primaryYear ? `/api/costos-operacionales?year=${primaryYear}` : "/api/costos-operacionales";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Error al obtener costos");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: secondaryCostos, isLoading: isLoadingCostosSecondary } = useQuery<CostosOperacionalesResponse>({
    queryKey: ["/api/costos-operacionales", secondaryYear ? String(secondaryYear) : "skip"],
    queryFn: async () => {
      const res = await fetch(`/api/costos-operacionales?year=${secondaryYear}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    enabled: !!secondaryYear,
    staleTime: 2 * 60 * 1000,
  });

  const years = primaryResult?.years || [];

  useEffect(() => {
    if (isLoadingPrimary || !primaryResult || primaryResult.years.length === 0) return;
    if (!selectedPeriod) {
      setSelectedPeriod(String(primaryResult.years[0]));
    } else if (!isRolling) {
      const periodYear = parseInt(selectedPeriod);
      if (!isNaN(periodYear) && !primaryResult.years.includes(periodYear)) {
        setSelectedPeriod(String(primaryResult.years[0]));
      }
    }
  }, [isLoadingPrimary, primaryResult]);

  type TaggedMonthData = MonthData & { dataYear: number };

  const allMonthlyData: TaggedMonthData[] = [
    ...(primaryResult?.data || []).map((d) => ({ ...d, dataYear: primaryYear })),
    ...(secondaryResult?.data || []).map((d) => ({ ...d, dataYear: secondaryYear! })),
  ];

  const getMonthValue = (year: number, month: number, field: keyof MonthData): number => {
    const d = allMonthlyData.find((m) => m.dataYear === year && m.month === month);
    return d ? (d[field] as number) : 0;
  };

  const totalVenta = activeMonths.reduce((s, { year, month }) => s + getMonthValue(year, month, "ventaTotalNeta"), 0);
  const totalVentaFacturas = activeMonths.reduce((s, { year, month }) => s + getMonthValue(year, month, "ventaFacturas"), 0);
  const totalVentaBoletas = activeMonths.reduce((s, { year, month }) => s + getMonthValue(year, month, "ventaBoletas"), 0);
  const totalNotaCredito = activeMonths.reduce((s, { year, month }) => s + getMonthValue(year, month, "notaCredito"), 0);
  const totalVentaAmigo = activeMonths.reduce((s, { year, month }) => s + getMonthValue(year, month, "ventaAmigo"), 0);
  const totalCosto = activeMonths.reduce((s, { year, month }) => s + getMonthValue(year, month, "costoTotalNeto"), 0);
  const totalCostoVentaAmigo = activeMonths.reduce((s, { year, month }) => s + getMonthValue(year, month, "costoVentaAmigo"), 0);
  const ventasAmigoSinCostoPorMes = activeMonths.map(({ year, month, label }) => ({
    year,
    month,
    label,
    count: getMonthValue(year, month, "ventaAmigoSinCosto"),
  }));
  const totalVentasAmigoSinCosto = ventasAmigoSinCostoPorMes.reduce((s, m) => s + m.count, 0);
  const totalUtilidad = totalVenta + totalVentaAmigo - totalCosto - totalCostoVentaAmigo;
  const totalMargen = (totalVenta + totalVentaAmigo) !== 0 ? totalUtilidad / (totalVenta + totalVentaAmigo) : 0;

  const allCentroNames = [
    ...new Set([
      ...(primaryCostos?.centros || []).map((c) => c.centroCostos),
      ...(secondaryCostos?.centros || []).map((c) => c.centroCostos),
    ]),
  ];

  const getCostoValue = (centroCostos: string, year: number, month: number): number => {
    const sourceYear = year === primaryYear ? primaryCostos : secondaryCostos;
    const centro = sourceYear?.centros.find((c) => c.centroCostos === centroCostos);
    return centro?.montos[String(month)] || 0;
  };

  const getCostoTotalForCentro = (centroCostos: string): number =>
    activeMonths.reduce((s, { year, month }) => s + getCostoValue(centroCostos, year, month), 0);

  const centrosGastosOp = allCentroNames.filter((n) => !EXCLUIR_GASTOS_OP.has(n));

  const gastosOpMes = (year: number, month: number) =>
    centrosGastosOp.reduce((s, c) => s + getCostoValue(c, year, month), 0);

  const otrasDevMes = (year: number, month: number) =>
    getCostoValue("C-OTRAS DEVOLUCIONES", year, month);

  const ivaMes = (year: number, month: number) =>
    getCostoValue("C-IVA - PPM", year, month);

  const importacionMes = (year: number, month: number) =>
    getCostoValue("C-IMPORTACION", year, month);

  const totalGastosMinusDevMes = (year: number, month: number) =>
    gastosOpMes(year, month) - otrasDevMes(year, month);

  const utilidadBrutaAjustadaMes = (year: number, month: number) =>
    getMonthValue(year, month, "ventaTotalNeta")
    + getMonthValue(year, month, "ventaAmigo")
    - getMonthValue(year, month, "costoTotalNeto")
    - getMonthValue(year, month, "costoVentaAmigo");

  const utilidadOpAntesMes = (year: number, month: number) =>
    utilidadBrutaAjustadaMes(year, month) - totalGastosMinusDevMes(year, month);

  const utilidadNetaMes = (year: number, month: number) =>
    utilidadOpAntesMes(year, month) - ivaMes(year, month);

  const utilidadAcumuladaByIndex: number[] = activeMonths.map((_, i) =>
    activeMonths.slice(0, i + 1).reduce((s, { year, month }) => s + utilidadOpAntesMes(year, month), 0)
  );

  const totalGastosOp = activeMonths.reduce((s, { year, month }) => s + gastosOpMes(year, month), 0);
  const totalOtrasDev = activeMonths.reduce((s, { year, month }) => s + otrasDevMes(year, month), 0);
  const totalIva = activeMonths.reduce((s, { year, month }) => s + ivaMes(year, month), 0);
  const totalImportacion = activeMonths.reduce((s, { year, month }) => s + importacionMes(year, month), 0);
  const totalGastosMinusDev = totalGastosOp - totalOtrasDev;
  const totalUtilOpAntes = totalUtilidad - totalGastosMinusDev;
  const totalUtilNeta = totalUtilOpAntes - totalIva;
  const totalUtilAcumulada = utilidadAcumuladaByIndex[utilidadAcumuladaByIndex.length - 1] ?? 0;

  const hasCentros = allCentroNames.length > 0;
  const isAnyLoading = isLoadingPrimary || isLoadingSecondary || isLoadingCostosPrimary || isLoadingCostosSecondary;
  const sourceFileCount = primaryResult?.sourceFileCount ?? (isLoadingPrimary ? undefined : 0);
  const hasSourceFiles = sourceFileCount === undefined || sourceFileCount > 0;
  const hasData = activeMonths.length > 0 && years.length > 0 && hasSourceFiles;

  const periodLabel = isRolling
    ? selectedPeriod === "last12" ? "Últimos 12 meses" : "Últimos 6 meses"
    : selectedPeriod;

  const sectionHeaderClass = "text-xs font-bold uppercase tracking-wider text-muted-foreground sticky left-0 z-10 py-2 px-3 bg-muted";
  const sectionRowClass = "bg-muted/60 hover:bg-muted/60";
  const thBaseSticky = "text-xs font-semibold sticky left-0 bg-card z-10";

  const cellNum = (val: number, pos?: "green" | "red" | "auto", bold?: boolean) => {
    const color =
      pos === "green" ? "text-green-600 dark:text-green-400"
      : pos === "red" ? "text-red-600 dark:text-red-400"
      : pos === "auto" ? (val > 0 ? "text-green-600 dark:text-green-400" : val < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")
      : val === 0 ? "text-muted-foreground" : "text-red-600 dark:text-red-400";
    return `text-sm text-right tabular-nums ${bold ? "font-bold" : ""} ${val === 0 ? "text-muted-foreground" : color}`;
  };

  return (
    <div className="p-6 space-y-6 max-w-full mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-estado-resultados-title">Estado de Resultados</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Resumen mensual basado en datos de Detalle Ventas y Cartola</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-md border border-border overflow-hidden text-sm" data-testid="toggle-source">
            <button
              onClick={() => setSource("bsale_sync")}
              className={`px-3 py-1.5 font-medium transition-colors ${source === "bsale_sync" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
              data-testid="button-source-bsale"
            >
              Automático (BSale Sync)
            </button>
            <button
              onClick={() => setSource("manual")}
              className={`px-3 py-1.5 font-medium transition-colors border-l border-border ${source === "manual" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
              data-testid="button-source-manual"
            >
              Manual (Reporte BSale)
            </button>
          </div>

          <Select value={selectedPeriod} onValueChange={setSelectedPeriod} data-testid="select-period">
            <SelectTrigger className="w-[180px]" data-testid="select-period-trigger">
              <SelectValue placeholder="Seleccionar período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last12" data-testid="option-last12">Últimos 12 meses</SelectItem>
              <SelectItem value="last6" data-testid="option-last6">Últimos 6 meses</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)} data-testid={`option-year-${y}`}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {source === "bsale_sync" && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground" data-testid="note-bsale-sync">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary/70" />
          <span>Modo automático: los costos se obtienen desde la API de BSale usando el costo promedio actual de inventario por variante. Pueden diferir del reporte exacto de BSale. Para ver el costo exacto, sube el reporte manual y cambia a <strong>Manual (Reporte BSale)</strong>.</span>
        </div>
      )}

      <Card className="border-card-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold" data-testid="text-table-title">
            Resultados — {periodLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isAnyLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !hasData ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart3 className="h-12 w-12 text-muted-foreground/30 mb-3" />
              {source === "manual" && sourceFileCount === 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">No hay archivos cargados manualmente</p>
                  <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">
                    Descarga el reporte <strong>Detalle de Ventas</strong> desde BSale y súbelo en Subir Archivos para ver los costos exactos históricos.
                  </p>
                  <a
                    href="/subir-archivos"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                    data-testid="link-ir-subir-archivos"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Ir a Subir Archivos
                  </a>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Sin datos disponibles</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Selecciona un período o sincroniza datos de ventas</p>
                </>
              )}
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-semibold sticky left-0 bg-card z-10 min-w-[240px]">Métrica</TableHead>
                    {activeMonths.map(({ year, month, label }) => (
                      <TableHead key={`${year}-${month}`} className="text-xs font-semibold text-right min-w-[110px]">{label}</TableHead>
                    ))}
                    <TableHead className="text-xs font-semibold text-right min-w-[120px] bg-muted/50">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>

                  {/* ── Venta / Costo / Utilidad Bruta / Margen ── */}
                  <TableRow data-testid="row-metric-ventaTotalNeta">
                    <TableCell className={`${thBaseSticky} text-sm font-medium`}>Venta Total Neta</TableCell>
                    {activeMonths.map(({ year, month }) => {
                      const v = getMonthValue(year, month, "ventaTotalNeta");
                      return (
                        <TableCell key={`${year}-${month}`} className={`text-sm text-right tabular-nums ${v === 0 ? "text-muted-foreground" : "text-green-600 dark:text-green-400"}`}>
                          {v === 0 ? "-" : formatCLP(v)}
                        </TableCell>
                      );
                    })}
                    <TableCell className={`text-sm text-right tabular-nums bg-muted/50 font-medium ${totalVenta > 0 ? "text-green-600 dark:text-green-400" : ""}`}>
                      {formatCLP(totalVenta)}
                    </TableCell>
                  </TableRow>

                  <TableRow data-testid="row-metric-ventaFacturas" className="bg-muted/20">
                    <TableCell className={`${thBaseSticky} text-xs text-muted-foreground pl-7 bg-muted/20`}>↳ Facturas</TableCell>
                    {activeMonths.map(({ year, month }) => {
                      const v = getMonthValue(year, month, "ventaFacturas");
                      return (
                        <TableCell key={`${year}-${month}`} className={`text-xs text-right tabular-nums ${v === 0 ? "text-muted-foreground" : "text-green-600 dark:text-green-400"}`}>
                          {v === 0 ? "-" : formatCLP(v)}
                        </TableCell>
                      );
                    })}
                    <TableCell className={`text-xs text-right tabular-nums bg-muted/50 ${totalVentaFacturas > 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                      {totalVentaFacturas === 0 ? "-" : formatCLP(totalVentaFacturas)}
                    </TableCell>
                  </TableRow>

                  <TableRow data-testid="row-metric-ventaBoletas" className="bg-muted/20">
                    <TableCell className={`${thBaseSticky} text-xs text-muted-foreground pl-7 bg-muted/20`}>↳ Boletas</TableCell>
                    {activeMonths.map(({ year, month }) => {
                      const v = getMonthValue(year, month, "ventaBoletas");
                      return (
                        <TableCell key={`${year}-${month}`} className={`text-xs text-right tabular-nums ${v === 0 ? "text-muted-foreground" : "text-green-600 dark:text-green-400"}`}>
                          {v === 0 ? "-" : formatCLP(v)}
                        </TableCell>
                      );
                    })}
                    <TableCell className={`text-xs text-right tabular-nums bg-muted/50 ${totalVentaBoletas > 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                      {totalVentaBoletas === 0 ? "-" : formatCLP(totalVentaBoletas)}
                    </TableCell>
                  </TableRow>

                  <TableRow data-testid="row-metric-notaCredito" className="bg-muted/20">
                    <TableCell className={`${thBaseSticky} text-xs text-muted-foreground pl-7 bg-muted/20`}>↳ Nota de Crédito</TableCell>
                    {activeMonths.map(({ year, month }) => {
                      const v = getMonthValue(year, month, "notaCredito");
                      return (
                        <TableCell key={`${year}-${month}`} className={`text-xs text-right tabular-nums ${v === 0 ? "text-muted-foreground" : "text-red-600 dark:text-red-400"}`}>
                          {v === 0 ? "-" : `-${formatCLP(v)}`}
                        </TableCell>
                      );
                    })}
                    <TableCell className={`text-xs text-right tabular-nums bg-muted/50 ${totalNotaCredito > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                      {totalNotaCredito === 0 ? "-" : `-${formatCLP(totalNotaCredito)}`}
                    </TableCell>
                  </TableRow>

                  <TableRow data-testid="row-metric-ventaAmigo">
                    <TableCell className={`${thBaseSticky} text-sm`}>Venta Amigo</TableCell>
                    {activeMonths.map(({ year, month }) => {
                      const v = getMonthValue(year, month, "ventaAmigo");
                      return (
                        <TableCell key={`${year}-${month}`} className={`text-sm text-right tabular-nums ${v === 0 ? "text-muted-foreground" : "text-green-600 dark:text-green-400"}`}>
                          {v === 0 ? "-" : formatCLP(v)}
                        </TableCell>
                      );
                    })}
                    <TableCell className={`text-sm text-right tabular-nums bg-muted/50 font-medium ${totalVentaAmigo > 0 ? "text-green-600 dark:text-green-400" : ""}`}>
                      {formatCLP(totalVentaAmigo)}
                    </TableCell>
                  </TableRow>

                  <TableRow data-testid="row-metric-costoTotalNeto">
                    <TableCell className={`${thBaseSticky} text-sm`}>Costo Total Neto</TableCell>
                    {activeMonths.map(({ year, month }) => {
                      const v = getMonthValue(year, month, "costoTotalNeto");
                      return (
                        <TableCell key={`${year}-${month}`} className={`text-sm text-right tabular-nums ${v === 0 ? "text-muted-foreground" : "text-red-600 dark:text-red-400"}`}>
                          {v === 0 ? "-" : formatCLP(v)}
                        </TableCell>
                      );
                    })}
                    <TableCell className={`text-sm text-right tabular-nums bg-muted/50 font-medium ${totalCosto > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                      {formatCLP(totalCosto)}
                    </TableCell>
                  </TableRow>

                  <TableRow data-testid="row-metric-costoVentaAmigo">
                    <TableCell className={`${thBaseSticky} text-sm`}>
                      <span className="inline-flex items-center gap-1.5">
                        Costo Venta Amigo
                        {totalVentasAmigoSinCosto > 0 && (
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="inline-flex items-center text-amber-600 dark:text-amber-400 cursor-help"
                                  data-testid="warn-costo-venta-amigo"
                                >
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-xs text-xs">
                                <div className="font-medium mb-1">
                                  {totalVentasAmigoSinCosto}{" "}
                                  {totalVentasAmigoSinCosto === 1 ? "venta sin costo registrado" : "ventas sin costo registrado"}
                                </div>
                                <div className="text-muted-foreground mb-1.5">
                                  Estas ventas se asumieron con costo 0, lo que puede inflar la utilidad del período.
                                </div>
                                {ventasAmigoSinCostoPorMes.filter(m => m.count > 0).map(m => (
                                  <div key={`${m.year}-${m.month}`} className="flex justify-between gap-3">
                                    <span>{m.label}</span>
                                    <span className="tabular-nums font-medium">{m.count}</span>
                                  </div>
                                ))}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </span>
                    </TableCell>
                    {activeMonths.map(({ year, month }) => {
                      const v = getMonthValue(year, month, "costoVentaAmigo");
                      return (
                        <TableCell key={`${year}-${month}`} className={`text-sm text-right tabular-nums ${v === 0 ? "text-muted-foreground" : "text-red-600 dark:text-red-400"}`} data-testid={`cell-costoVentaAmigo-${year}-${month}`}>
                          {v === 0 ? "-" : formatCLP(v)}
                        </TableCell>
                      );
                    })}
                    <TableCell className={`text-sm text-right tabular-nums bg-muted/50 font-medium ${totalCostoVentaAmigo > 0 ? "text-red-600 dark:text-red-400" : ""}`} data-testid="cell-costoVentaAmigo-total">
                      {formatCLP(totalCostoVentaAmigo)}
                    </TableCell>
                  </TableRow>

                  <TableRow data-testid="row-metric-utilidadBruta">
                    <TableCell className={`${thBaseSticky} text-sm font-semibold`}>Utilidad Bruta</TableCell>
                    {activeMonths.map(({ year, month }) => {
                      const v = utilidadBrutaAjustadaMes(year, month);
                      return (
                        <TableCell key={`${year}-${month}`} className={`text-sm text-right tabular-nums font-semibold ${v === 0 ? "text-muted-foreground" : v > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {v === 0 ? "-" : formatCLP(v)}
                        </TableCell>
                      );
                    })}
                    <TableCell className={`text-sm text-right tabular-nums bg-muted/50 font-bold ${totalUtilidad > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {formatCLP(totalUtilidad)}
                    </TableCell>
                  </TableRow>

                  <TableRow data-testid="row-metric-margen">
                    <TableCell className={`${thBaseSticky} text-sm font-semibold`}>Margen</TableCell>
                    {activeMonths.map(({ year, month }) => {
                      const vtn = getMonthValue(year, month, "ventaTotalNeta");
                      const va = getMonthValue(year, month, "ventaAmigo");
                      const base = vtn + va;
                      const ub = utilidadBrutaAjustadaMes(year, month);
                      const v = base !== 0 ? ub / base : 0;
                      return (
                        <TableCell key={`${year}-${month}`} className={`text-sm text-right tabular-nums font-semibold ${v > 0 ? "text-green-600 dark:text-green-400" : v < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                          {v === 0 ? "-" : formatPercent(v)}
                        </TableCell>
                      );
                    })}
                    <TableCell className={`text-sm text-right tabular-nums bg-muted/50 font-bold ${totalMargen > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {formatPercent(totalMargen)}
                    </TableCell>
                  </TableRow>

                  {/* ── GASTOS OPERACIONALES ── */}
                      <TableRow className={sectionRowClass} data-testid="row-section-gastos-op">
                        <TableCell className={sectionHeaderClass}>Gastos Operacionales</TableCell>
                        <TableCell colSpan={activeMonths.length + 1} className="bg-muted/60 py-2" />
                      </TableRow>

                      {centrosGastosOp.map((centro) => (
                        <TableRow key={centro} data-testid={`row-centro-${centro}`}>
                          <TableCell className="text-sm sticky left-0 bg-card z-10 pl-5 text-muted-foreground">
                            {centro}
                          </TableCell>
                          {activeMonths.map(({ year, month }) => {
                            const val = getCostoValue(centro, year, month);
                            return (
                              <TableCell key={`${year}-${month}`} className={`text-sm text-right tabular-nums ${val === 0 ? "text-muted-foreground" : "text-red-600 dark:text-red-400"}`}>
                                {val === 0 ? "-" : formatCLP(val)}
                              </TableCell>
                            );
                          })}
                          <TableCell className={`text-sm text-right tabular-nums bg-muted/50 font-medium ${getCostoTotalForCentro(centro) > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                            {formatCLP(getCostoTotalForCentro(centro))}
                          </TableCell>
                        </TableRow>
                      ))}

                      <TableRow className="border-t" data-testid="row-total-gastos-op">
                        <TableCell className="text-sm sticky left-0 bg-card z-10 font-semibold text-red-600 dark:text-red-400 pl-5">
                          Total Gastos Operacionales
                        </TableCell>
                        {activeMonths.map(({ year, month }) => {
                          const val = gastosOpMes(year, month);
                          return (
                            <TableCell key={`${year}-${month}`} className={`text-sm text-right tabular-nums font-semibold ${val === 0 ? "text-muted-foreground" : "text-red-600 dark:text-red-400"}`}>
                              {val === 0 ? "-" : formatCLP(val)}
                            </TableCell>
                          );
                        })}
                        <TableCell className={`text-sm text-right tabular-nums bg-muted/50 font-bold ${totalGastosOp > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                          {formatCLP(totalGastosOp)}
                        </TableCell>
                      </TableRow>

                      {/* ── IMPORTACIÓN CON IVA ADUANERO ── */}
                      <TableRow className={sectionRowClass} data-testid="row-section-importacion">
                        <TableCell className={sectionHeaderClass}>Importación con IVA Aduanero</TableCell>
                        <TableCell colSpan={activeMonths.length + 1} className="bg-muted/60 py-2" />
                      </TableRow>

                      <TableRow data-testid="row-centro-C-IMPORTACION">
                        <TableCell className="text-sm sticky left-0 bg-card z-10 pl-5 text-muted-foreground">
                          C-IMPORTACION
                        </TableCell>
                        {activeMonths.map(({ year, month }) => {
                          const val = importacionMes(year, month);
                          return (
                            <TableCell key={`${year}-${month}`} className={`text-sm text-right tabular-nums ${val === 0 ? "text-muted-foreground" : "text-red-600 dark:text-red-400"}`}>
                              {val === 0 ? "-" : formatCLP(val)}
                            </TableCell>
                          );
                        })}
                        <TableCell className={`text-sm text-right tabular-nums bg-muted/50 font-medium ${totalImportacion > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                          {formatCLP(totalImportacion)}
                        </TableCell>
                      </TableRow>

                      {/* ── RESUMEN DE GASTOS ── */}
                      <TableRow className={sectionRowClass} data-testid="row-section-resumen">
                        <TableCell className={sectionHeaderClass}>Otros Ingresos</TableCell>
                        <TableCell colSpan={activeMonths.length + 1} className="bg-muted/60 py-2" />
                      </TableRow>

                      <TableRow data-testid="row-otras-devoluciones">
                        <TableCell className="text-sm sticky left-0 bg-card z-10 pl-5 text-muted-foreground">
                          Otras Devoluciones
                        </TableCell>
                        {activeMonths.map(({ year, month }) => {
                          const val = otrasDevMes(year, month);
                          return (
                            <TableCell key={`${year}-${month}`} className={`text-sm text-right tabular-nums ${val === 0 ? "text-muted-foreground" : "text-green-600 dark:text-green-400"}`}>
                              {val === 0 ? "-" : formatCLP(val)}
                            </TableCell>
                          );
                        })}
                        <TableCell className={`text-sm text-right tabular-nums bg-muted/50 font-medium ${totalOtrasDev > 0 ? "text-green-600 dark:text-green-400" : ""}`}>
                          {formatCLP(totalOtrasDev)}
                        </TableCell>
                      </TableRow>

                      <TableRow data-testid="row-total-gastos">
                        <TableCell className="text-sm sticky left-0 bg-card z-10 pl-5 font-semibold text-red-600 dark:text-red-400">
                          Total Gastos
                        </TableCell>
                        {activeMonths.map(({ year, month }) => {
                          const val = gastosOpMes(year, month);
                          return (
                            <TableCell key={`${year}-${month}`} className={`text-sm text-right tabular-nums font-semibold ${val === 0 ? "text-muted-foreground" : "text-red-600 dark:text-red-400"}`}>
                              {val === 0 ? "-" : formatCLP(val)}
                            </TableCell>
                          );
                        })}
                        <TableCell className={`text-sm text-right tabular-nums bg-muted/50 font-bold ${totalGastosOp > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                          {formatCLP(totalGastosOp)}
                        </TableCell>
                      </TableRow>

                      <TableRow data-testid="row-total-gastos-menos-dev">
                        <TableCell className="text-sm sticky left-0 bg-card z-10 pl-5 font-semibold text-red-600 dark:text-red-400">
                          Total Gastos menos Devoluciones
                        </TableCell>
                        {activeMonths.map(({ year, month }) => {
                          const val = totalGastosMinusDevMes(year, month);
                          return (
                            <TableCell key={`${year}-${month}`} className={`text-sm text-right tabular-nums font-semibold ${val === 0 ? "text-muted-foreground" : "text-red-600 dark:text-red-400"}`}>
                              {val === 0 ? "-" : formatCLP(val)}
                            </TableCell>
                          );
                        })}
                        <TableCell className={`text-sm text-right tabular-nums bg-muted/50 font-bold ${totalGastosMinusDev > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                          {formatCLP(totalGastosMinusDev)}
                        </TableCell>
                      </TableRow>

                      {/* ── UTILIDAD OPERACIÓN ANTES DE IMPUESTO ── */}
                      <TableRow className="border-t-2 bg-primary/5 hover:bg-primary/5" data-testid="row-utilidad-op-antes">
                        <TableCell className="text-sm sticky left-0 bg-card z-10 font-bold">
                          Utilidad Operación antes de Impuesto
                        </TableCell>
                        {activeMonths.map(({ year, month }) => {
                          const val = utilidadOpAntesMes(year, month);
                          return (
                            <TableCell key={`${year}-${month}`} className={`text-sm text-right tabular-nums font-bold ${val === 0 ? "text-muted-foreground" : val > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                              {val === 0 ? "-" : formatCLP(val)}
                            </TableCell>
                          );
                        })}
                        <TableCell className={`text-sm text-right tabular-nums bg-muted/50 font-bold ${totalUtilOpAntes > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {formatCLP(totalUtilOpAntes)}
                        </TableCell>
                      </TableRow>

                      {/* ── UTILIDAD ACUMULADA ── */}
                      <TableRow className="bg-primary/5 hover:bg-primary/5" data-testid="row-utilidad-acumulada">
                        <TableCell className="text-sm sticky left-0 bg-card z-10 font-bold">
                          Utilidad Operación Acumulada
                        </TableCell>
                        {activeMonths.map(({ year: _y, month: _m }, idx) => {
                          const val = utilidadAcumuladaByIndex[idx] ?? 0;
                          return (
                            <TableCell key={`${_y}-${_m}`} className={`text-sm text-right tabular-nums font-bold ${val === 0 ? "text-muted-foreground" : val > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                              {val === 0 ? "-" : formatCLP(val)}
                            </TableCell>
                          );
                        })}
                        <TableCell className={`text-sm text-right tabular-nums bg-muted/50 font-bold ${totalUtilAcumulada > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {formatCLP(totalUtilAcumulada)}
                        </TableCell>
                      </TableRow>

                      {/* ── IVA & PPM ── */}
                      <TableRow className={sectionRowClass} data-testid="row-section-iva">
                        <TableCell className={sectionHeaderClass}>IVA &amp; PPM</TableCell>
                        <TableCell colSpan={activeMonths.length + 1} className="bg-muted/60 py-2" />
                      </TableRow>

                      <TableRow data-testid="row-centro-C-IVA-PPM">
                        <TableCell className="text-sm sticky left-0 bg-card z-10 pl-5 text-muted-foreground">
                          C-IVA - PPM
                        </TableCell>
                        {activeMonths.map(({ year, month }) => {
                          const val = ivaMes(year, month);
                          return (
                            <TableCell key={`${year}-${month}`} className={`text-sm text-right tabular-nums ${val === 0 ? "text-muted-foreground" : "text-red-600 dark:text-red-400"}`}>
                              {val === 0 ? "-" : formatCLP(val)}
                            </TableCell>
                          );
                        })}
                        <TableCell className={`text-sm text-right tabular-nums bg-muted/50 font-medium ${totalIva > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                          {formatCLP(totalIva)}
                        </TableCell>
                      </TableRow>

                      {/* ── UTILIDAD NETA ── */}
                      <TableRow className="border-t-2 bg-primary/10 hover:bg-primary/10" data-testid="row-utilidad-neta">
                        <TableCell className="text-sm sticky left-0 bg-card z-10 font-bold">
                          Utilidad Neta
                        </TableCell>
                        {activeMonths.map(({ year, month }) => {
                          const val = utilidadNetaMes(year, month);
                          return (
                            <TableCell key={`${year}-${month}`} className={`text-sm text-right tabular-nums font-bold ${val === 0 ? "text-muted-foreground" : val > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                              {val === 0 ? "-" : formatCLP(val)}
                            </TableCell>
                          );
                        })}
                        <TableCell className={`text-sm text-right tabular-nums bg-muted/50 font-bold ${totalUtilNeta > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {formatCLP(totalUtilNeta)}
                        </TableCell>
                      </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
