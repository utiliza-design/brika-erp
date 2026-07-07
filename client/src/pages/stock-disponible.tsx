import { Fragment, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PackageSearch, Download, ChevronDown, ChevronRight, Zap, Trash2, RotateCcw, Ban } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { downloadAsXlsx } from "@/lib/download-xlsx";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DiscontinuedProduct {
  sku: string;
  nombre: string;
  fechaDescontinuado: string;
}

interface DetalleRow {
  sku: string;
  tipoProducto: string;
  producto: string;
  variante: string;
  marca: string;
  stockInicial: number;
  vendidas: number;
  stockActual: number;
}

interface ResumenRow {
  tipoProducto: string;
  stockInicial: number;
  vendidas: number;
  stockActual: number;
}

interface StockDisponibleData {
  stockDate: string | null;
  source?: "bsale" | "upload";
  bsaleConfigured?: boolean;
  detalle: DetalleRow[];
  resumen: ResumenRow[];
}

type StockFilter = "todos" | "sin-stock" | "menos-10" | "resto";

const RESUMEN_COLS = [
  { key: "tipoProducto", label: "Tipo de Producto" },
  { key: "stockInicial", label: "Stock Inicial" },
  { key: "vendidas", label: "Unidades Vendidas" },
  { key: "stockActual", label: "Stock Actual" },
];

function formatDate(dateStr: string): string {
  const [yyyy, mm, dd] = dateStr.split("-");
  const months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${parseInt(dd)} de ${months[parseInt(mm) - 1]} de ${yyyy}`;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function matchesFilter(row: DetalleRow, filter: StockFilter): boolean {
  if (filter === "todos") return true;
  if (filter === "sin-stock") return row.stockActual <= 0;
  if (filter === "menos-10") return row.stockActual > 0 && row.stockActual < 10;
  return row.stockActual >= 10;
}

export default function StockDisponiblePage() {
  const [expandedTipos, setExpandedTipos] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<StockFilter>("todos");
  const [showDescontinuados, setShowDescontinuados] = useState(false);
  const [confirmDiscontinue, setConfirmDiscontinue] = useState<{ sku: string; nombre: string } | null>(null);
  const { toast } = useToast();
  const isBsale = (data?: StockDisponibleData) => data?.source === "bsale";

  const { data, isLoading, isError } = useQuery<StockDisponibleData>({
    queryKey: ["/api/stock-disponible"],
  });

  const { data: descontinuados = [] } = useQuery<DiscontinuedProduct[]>({
    queryKey: ["/api/discontinued-products"],
  });

  const addDiscontinuedMut = useMutation({
    mutationFn: async (payload: { sku: string; nombre: string }) => {
      await apiRequest("POST", "/api/discontinued-products", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discontinued-products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-disponible"] });
      queryClient.invalidateQueries({ queryKey: ["/api/siguiente-pedido"] });
      toast({ title: "Producto descontinuado", description: "El SKU ya no aparecerá en Stock ni en Siguiente Pedido." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeDiscontinuedMut = useMutation({
    mutationFn: async (sku: string) => {
      await apiRequest("DELETE", `/api/discontinued-products/${encodeURIComponent(sku)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discontinued-products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-disponible"] });
      queryClient.invalidateQueries({ queryKey: ["/api/siguiente-pedido"] });
      toast({ title: "Producto restaurado", description: "El SKU vuelve a aparecer en Stock." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleTipo = (tipo: string) => {
    setExpandedTipos(prev => {
      const next = new Set(prev);
      if (next.has(tipo)) next.delete(tipo);
      else next.add(tipo);
      return next;
    });
  };

  const filterCounts = useMemo(() => {
    if (!data?.detalle) return { todos: 0, "sin-stock": 0, "menos-10": 0, resto: 0 };
    let sinStock = 0, menos10 = 0, resto = 0;
    for (const row of data.detalle) {
      if (row.stockActual <= 0) sinStock++;
      else if (row.stockActual < 10) menos10++;
      else resto++;
    }
    return { todos: data.detalle.length, "sin-stock": sinStock, "menos-10": menos10, resto };
  }, [data?.detalle]);

  const filteredDetalle = useMemo(() => {
    if (!data?.detalle) return [];
    if (activeFilter === "todos") return data.detalle;
    return data.detalle.filter(row => matchesFilter(row, activeFilter));
  }, [data?.detalle, activeFilter]);

  const filteredResumen = useMemo(() => {
    if (!data?.detalle) return [];
    const map = new Map<string, { tipoProducto: string; stockInicial: number; vendidas: number; stockActual: number }>();
    for (const row of filteredDetalle) {
      const tipo = row.tipoProducto || "Sin Tipo";
      const existing = map.get(tipo) || { tipoProducto: tipo, stockInicial: 0, vendidas: 0, stockActual: 0 };
      existing.stockInicial += row.stockInicial;
      existing.vendidas += row.vendidas;
      existing.stockActual += row.stockActual;
      map.set(tipo, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.tipoProducto.localeCompare(b.tipoProducto, "es"));
  }, [filteredDetalle, data?.detalle]);

  const detalleByTipo = useMemo(() => {
    const map = new Map<string, DetalleRow[]>();
    for (const row of filteredDetalle) {
      const tipo = row.tipoProducto || "Sin Tipo";
      if (!map.has(tipo)) map.set(tipo, []);
      map.get(tipo)!.push(row);
    }
    return map;
  }, [filteredDetalle]);

  const totales = useMemo(() => {
    return filteredResumen.reduce(
      (acc, r) => ({
        stockInicial: acc.stockInicial + r.stockInicial,
        vendidas: acc.vendidas + r.vendidas,
        stockActual: acc.stockActual + r.stockActual,
      }),
      { stockInicial: 0, vendidas: 0, stockActual: 0 }
    );
  }, [filteredResumen]);

  const handleDownload = () => {
    if (!filteredResumen.length) return;
    downloadAsXlsx(
      filteredResumen as unknown as Record<string, unknown>[],
      RESUMEN_COLS,
      `stock-resumen-${data?.stockDate || "sin-fecha"}`
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <PackageSearch className="h-14 w-14 text-destructive/40" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">Error al cargar datos de stock</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ocurrió un problema al obtener los datos. Intenta recargar la página.
          </p>
        </div>
      </div>
    );
  }

  if (!data?.stockDate) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <PackageSearch className="h-14 w-14 text-muted-foreground/40" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">No se encontró stock en BSale</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            La cuenta BSale está configurada pero no retornó ítems de stock. Verifica que existan productos con stock en BSale.
          </p>
        </div>
      </div>
    );
  }

  const fromBsale = isBsale(data);

  const filterPills: { key: StockFilter; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "sin-stock", label: "Sin stock" },
    { key: "menos-10", label: "Menos de 10" },
    { key: "resto", label: "Resto" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PackageSearch className="h-6 w-6 text-primary" />
          Stock Disponible Actual
          {fromBsale && (
            <Badge variant="secondary" className="gap-1 text-xs font-normal" data-testid="badge-bsale-source">
              <Zap className="h-3 w-3 text-primary" />
              Tiempo real · BSale
            </Badge>
          )}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {fromBsale
            ? `Stock en tiempo real desde BSale, consultado hoy ${formatDate(data.stockDate)}.`
            : `Stock inicial al ${formatDate(data.stockDate)}, descontando ventas posteriores a esa fecha.`}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {fromBsale
          ? <StatCard label="Fuente" value="BSale" sub="tiempo real" />
          : <StatCard label="Fecha de stock" value={formatDate(data.stockDate)} />}
        <StatCard label="SKUs en stock" value={filteredDetalle.length} />
        <StatCard label="Total unidades" value={totales.stockActual.toLocaleString("es-CL")} />
        {fromBsale
          ? <StatCard label="Sin stock" value={filterCounts["sin-stock"]} sub="SKUs agotados" />
          : <StatCard
              label="Stock actual"
              value={totales.stockActual.toLocaleString("es-CL")}
              sub={`${totales.vendidas.toLocaleString("es-CL")} unidades vendidas`}
            />}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" data-testid="stock-filter-pills">
          {filterPills.map(({ key, label }) => (
            <Button
              key={key}
              variant={activeFilter === key ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveFilter(key)}
              data-testid={`filter-${key}`}
            >
              {label} ({filterCounts[key]})
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowDescontinuados(v => !v)}
            data-testid="button-toggle-descontinuados"
          >
            <Ban className="h-4 w-4" />
            Descontinuados ({descontinuados.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleDownload}
            data-testid="button-download-resumen"
          >
            <Download className="h-4 w-4" />
            Descargar Excel
          </Button>
        </div>
      </div>

      {showDescontinuados && (
        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3" data-testid="panel-descontinuados">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Ban className="h-4 w-4 text-muted-foreground" />
              Productos descontinuados
            </h2>
            <p className="text-xs text-muted-foreground">
              Estos SKU se ocultan en Stock y Siguiente Pedido. Puedes restaurarlos en cualquier momento.
            </p>
          </div>
          {descontinuados.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No hay productos descontinuados.</p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {descontinuados.map(d => (
                    <TableRow key={d.sku} data-testid={`row-descontinuado-${d.sku}`}>
                      <TableCell className="font-mono text-xs">{d.sku}</TableCell>
                      <TableCell className="text-sm">{d.nombre}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(d.fechaDescontinuado).toLocaleDateString("es-CL")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-xs"
                          onClick={() => removeDiscontinuedMut.mutate(d.sku)}
                          disabled={removeDiscontinuedMut.isPending}
                          data-testid={`button-restore-${d.sku}`}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restaurar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Tipo de Producto</TableHead>
              {!fromBsale && <TableHead className="text-right">Stock Inicial</TableHead>}
              {!fromBsale && <TableHead className="text-right">Unidades Vendidas</TableHead>}
              <TableHead className="text-right">Stock Actual</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredResumen.length === 0 ? (
              <TableRow>
                <TableCell colSpan={fromBsale ? 3 : 5} className="text-center py-8 text-muted-foreground">
                  No hay productos que coincidan con el filtro seleccionado.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {filteredResumen.map((row) => {
                  const isExpanded = expandedTipos.has(row.tipoProducto);
                  const skus = detalleByTipo.get(row.tipoProducto) || [];
                  return (
                    <Fragment key={row.tipoProducto}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50 font-medium"
                        onClick={() => toggleTipo(row.tipoProducto)}
                        data-testid={`row-tipo-${row.tipoProducto}`}
                      >
                        <TableCell className="text-muted-foreground">
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4" />
                            : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell>{row.tipoProducto || "Sin Tipo"}</TableCell>
                        {!fromBsale && <TableCell className="text-right">{row.stockInicial.toLocaleString("es-CL")}</TableCell>}
                        {!fromBsale && <TableCell className="text-right">{row.vendidas.toLocaleString("es-CL")}</TableCell>}
                        <TableCell className="text-right font-semibold">{row.stockActual.toLocaleString("es-CL")}</TableCell>
                      </TableRow>
                      {isExpanded && skus.map((sku) => (
                        <TableRow key={sku.sku} className="bg-muted/20 text-sm">
                          <TableCell />
                          <TableCell className="pl-6 text-muted-foreground">
                            <span className="font-mono text-xs">{sku.sku}</span>
                            <span className="ml-2">{sku.producto}{sku.variante ? ` · ${sku.variante}` : ""}</span>
                          </TableCell>
                          {!fromBsale && <TableCell className="text-right text-muted-foreground">{sku.stockInicial.toLocaleString("es-CL")}</TableCell>}
                          {!fromBsale && <TableCell className="text-right text-muted-foreground">{sku.vendidas.toLocaleString("es-CL")}</TableCell>}
                          <TableCell className="text-right font-medium">
                            <div className="flex items-center justify-end gap-1">
                              <span>{sku.stockActual.toLocaleString("es-CL")}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const nombre = `${sku.producto}${sku.variante ? ` · ${sku.variante}` : ""}`;
                                  setConfirmDiscontinue({ sku: sku.sku, nombre });
                                }}
                                data-testid={`button-discontinue-${sku.sku}`}
                                title="Marcar como descontinuado"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  );
                })}
                <TableRow className="border-t-2 font-bold bg-muted/30">
                  <TableCell />
                  <TableCell>Total</TableCell>
                  {!fromBsale && <TableCell className="text-right">{totales.stockInicial.toLocaleString("es-CL")}</TableCell>}
                  {!fromBsale && <TableCell className="text-right">{totales.vendidas.toLocaleString("es-CL")}</TableCell>}
                  <TableCell className="text-right">{totales.stockActual.toLocaleString("es-CL")}</TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!confirmDiscontinue} onOpenChange={(open) => !open && setConfirmDiscontinue(null)}>
        <AlertDialogContent data-testid="dialog-confirm-discontinue">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Marcar como descontinuado?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDiscontinue && (
                <>
                  El SKU <span className="font-mono">{confirmDiscontinue.sku}</span> ({confirmDiscontinue.nombre}) dejará de aparecer en
                  {" "}<strong>Stock Disponible</strong> y <strong>Siguiente Pedido</strong>, incluso si BSale lo sigue informando.
                  Podrás restaurarlo desde el panel "Descontinuados".
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-discontinue">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-discontinue"
              onClick={() => {
                if (confirmDiscontinue) {
                  addDiscontinuedMut.mutate(confirmDiscontinue);
                  setConfirmDiscontinue(null);
                }
              }}
            >
              Sí, descontinuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
