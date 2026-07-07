import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Download, PackageX, AlertTriangle, Clock, Zap, ChevronUp, ChevronDown, ChevronsUpDown, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadAsXlsx } from "@/lib/download-xlsx";

interface SkuRow {
  sku: string;
  tipoProducto: string;
  producto: string;
  variante: string;
  marca: string;
  stockActual: number;
  consumoTotalHistorico: number;
  consumoMensualHistorico: number;
  diasParaQuiebreHistorico: number | null;
  fechaQuiebreHistorico: string | null;
}

interface SiguientePedidoData {
  stockDate: string | null;
  source?: "bsale" | "upload";
  bsaleConfigured?: boolean;
  skus: SkuRow[];
  mesesHistorico: number;
}

type EstadoPedido = "agotado" | "urgente" | "proximo";

type SortKey = "stockActual" | "consumoMensualHistorico" | "diasParaQuiebreHistorico" | "cantidadSugerida";
type SortDir = "asc" | "desc";

function SortableHeader({ label, sortKey, active, dir, onClick }: {
  label: string; sortKey: SortKey; active: boolean; dir: SortDir; onClick: (k: SortKey) => void;
}) {
  const Icon = active ? (dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <button
      className={`flex items-center gap-1 text-right w-full justify-end cursor-pointer select-none hover:text-foreground transition-colors ${active ? "text-foreground font-semibold" : "text-muted-foreground"}`}
      onClick={() => onClick(sortKey)}
      data-testid={`sort-${sortKey}`}
    >
      {label}
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${active ? "text-primary" : "text-muted-foreground/50"}`} />
    </button>
  );
}

function formatDate(dateStr: string): string {
  const [yyyy, mm, dd] = dateStr.split("-");
  const months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${parseInt(dd)} de ${months[parseInt(mm) - 1]} de ${yyyy}`;
}

function formatQuiebreDate(fechaQuiebre: string | null): string {
  if (!fechaQuiebre) return "Sin movimiento";
  if (fechaQuiebre === "Agotado") return "Agotado";
  return formatDate(fechaQuiebre);
}

function getEstado(stockActual: number, diasQuiebre: number | null, horizonteDias: number): EstadoPedido | null {
  if (stockActual <= 0) return "agotado";
  if (diasQuiebre === null) return null;
  if (diasQuiebre < 15) return "urgente";
  if (diasQuiebre <= horizonteDias) return "proximo";
  return null;
}

function StatCard({ label, value, sub, icon: Icon, iconColor }: {
  label: string; value: string | number; sub?: string;
  icon?: LucideIcon; iconColor?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm" data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon && <Icon className={`h-5 w-5 ${iconColor || "text-muted-foreground"}`} />}
      </div>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

const DOWNLOAD_COLS = [
  { key: "tipoProducto", label: "Tipo de Producto" },
  { key: "sku", label: "SKU" },
  { key: "producto", label: "Producto" },
  { key: "variante", label: "Variante" },
  { key: "stockActual", label: "Stock Actual" },
  { key: "consumoMensualHistorico", label: "Consumo Mensual Histórico" },
  { key: "fechaQuiebreDisplay", label: "Fecha Quiebre Estimada" },
  { key: "cantidadSugerida", label: "Cantidad Sugerida" },
  { key: "estadoDisplay", label: "Estado" },
];

export default function SiguientePedidoPage() {
  const [leadTimeMeses, setLeadTimeMeses] = useState(3);
  const [cicloMeses, setCicloMeses] = useState(3.5);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortKey(null); setSortDir("asc"); }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const { data, isLoading, isError } = useQuery<SiguientePedidoData>({
    queryKey: ["/api/siguiente-pedido"],
  });

  const horizonteDias = useMemo(() => Math.round((leadTimeMeses + cicloMeses) * 30), [leadTimeMeses, cicloMeses]);
  const coberturaMeses = useMemo(() => leadTimeMeses + cicloMeses, [leadTimeMeses, cicloMeses]);

  const enrichedSkus = useMemo(() => {
    if (!data?.skus) return [];
    return data.skus.map(row => {
      const cantidadSugerida = Math.max(0, Math.ceil(row.consumoMensualHistorico * coberturaMeses - row.stockActual));
      const estado = getEstado(row.stockActual, row.diasParaQuiebreHistorico, horizonteDias);
      return { ...row, cantidadSugerida, estado };
    });
  }, [data?.skus, coberturaMeses, horizonteDias]);

  const filteredSkus = useMemo(() => {
    return enrichedSkus.filter(row => {
      if (row.stockActual <= 0) return true;
      if (row.diasParaQuiebreHistorico !== null && row.diasParaQuiebreHistorico <= horizonteDias) return true;
      return false;
    });
  }, [enrichedSkus, horizonteDias]);

  const sortedSkus = useMemo(() => {
    if (!sortKey) return filteredSkus;

    type EnrichedRow = (typeof filteredSkus)[number];
    const accessor: Record<SortKey, (row: EnrichedRow) => number | null> = {
      stockActual: (row) => row.stockActual,
      consumoMensualHistorico: (row) => row.consumoMensualHistorico,
      diasParaQuiebreHistorico: (row) => row.diasParaQuiebreHistorico,
      cantidadSugerida: (row) => row.cantidadSugerida,
    };
    const getValue = accessor[sortKey];

    return [...filteredSkus].sort((a, b) => {
      const aRaw = getValue(a);
      const bRaw = getValue(b);
      // Nulls always sort to the end regardless of direction
      if (aRaw === null && bRaw === null) return 0;
      if (aRaw === null) return 1;
      if (bRaw === null) return -1;
      return sortDir === "asc" ? aRaw - bRaw : bRaw - aRaw;
    });
  }, [filteredSkus, sortKey, sortDir]);

  const cards = useMemo(() => {
    let agotados = 0, urgentes = 0, proximos = 0;
    for (const row of filteredSkus) {
      if (row.estado === "agotado") agotados++;
      else if (row.estado === "urgente") urgentes++;
      else if (row.estado === "proximo") proximos++;
    }
    return { agotados, urgentes, proximos, total: filteredSkus.length };
  }, [filteredSkus]);

  const handleDownload = () => {
    if (!sortedSkus.length) return;
    const downloadRows = sortedSkus.map(row => ({
      ...row,
      fechaQuiebreDisplay: formatQuiebreDate(row.fechaQuiebreHistorico),
      estadoDisplay: row.estado === "agotado" ? "Agotado" : row.estado === "urgente" ? "Urgente" : "Próximo",
    }));
    downloadAsXlsx(
      downloadRows as unknown as Record<string, unknown>[],
      DOWNLOAD_COLS,
      `siguiente-pedido-${data?.stockDate || "sin-fecha"}`
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
        <ClipboardList className="h-14 w-14 text-destructive/40" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">Error al cargar datos</h2>
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
        <ClipboardList className="h-14 w-14 text-muted-foreground/40" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">No se encontró stock en BSale</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            La cuenta BSale está configurada pero no retornó ítems de stock. Verifica que existan productos con stock en BSale.
          </p>
        </div>
      </div>
    );
  }

  const fromBsale = data?.source === "bsale";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2" data-testid="text-titulo-siguiente-pedido">
          <ClipboardList className="h-6 w-6 text-primary" />
          Siguiente Pedido
          {fromBsale && (
            <Badge variant="secondary" className="gap-1 text-xs font-normal" data-testid="badge-bsale-pedido">
              <Zap className="h-3 w-3 text-primary" />
              Stock real · BSale
            </Badge>
          )}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {fromBsale
            ? `Stock en tiempo real desde BSale, consumo basado en ${data.mesesHistorico} meses de historial de ventas.`
            : `SKUs a reponer en la próxima orden, basado en ${data.mesesHistorico} meses de historial de ventas.`}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 rounded-xl border bg-card p-5 shadow-sm">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Lead Time (meses de espera)</Label>
            <span className="text-sm font-bold text-primary" data-testid="text-lead-time-value">{leadTimeMeses}</span>
          </div>
          <Slider
            value={[leadTimeMeses]}
            onValueChange={([v]) => setLeadTimeMeses(v)}
            min={1}
            max={6}
            step={0.5}
            data-testid="slider-lead-time"
          />
          <p className="text-xs text-muted-foreground">Tiempo desde que haces el pedido hasta que llega la mercadería.</p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Ciclo de pedido (meses entre pedidos)</Label>
            <span className="text-sm font-bold text-primary" data-testid="text-ciclo-value">{cicloMeses}</span>
          </div>
          <Slider
            value={[cicloMeses]}
            onValueChange={([v]) => setCicloMeses(v)}
            min={1}
            max={6}
            step={0.5}
            data-testid="slider-ciclo"
          />
          <p className="text-xs text-muted-foreground">Cada cuántos meses haces un nuevo pedido de reposición.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="SKUs a pedir"
          value={cards.total}
          icon={ClipboardList}
          iconColor="text-primary"
          sub={`horizonte ${leadTimeMeses + cicloMeses} meses`}
        />
        <StatCard
          label="Agotados"
          value={cards.agotados}
          icon={PackageX}
          iconColor="text-red-500"
          sub="sin stock actualmente"
        />
        <StatCard
          label="Urgentes"
          value={cards.urgentes}
          icon={AlertTriangle}
          iconColor="text-yellow-500"
          sub="quiebre en menos de 15 días"
        />
        <StatCard
          label="Próximos"
          value={cards.proximos}
          icon={Clock}
          iconColor="text-blue-500"
          sub={`quiebre dentro de ${horizonteDias} días`}
        />
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={handleDownload}
          disabled={sortedSkus.length === 0}
          data-testid="button-download-pedido"
        >
          <Download className="h-4 w-4" />
          Descargar Excel ({sortedSkus.length} SKUs)
        </Button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">
                <SortableHeader label="Stock Actual" sortKey="stockActual" active={sortKey === "stockActual"} dir={sortDir} onClick={handleSort} />
              </TableHead>
              <TableHead className="text-right">
                <SortableHeader label="Consumo Mensual" sortKey="consumoMensualHistorico" active={sortKey === "consumoMensualHistorico"} dir={sortDir} onClick={handleSort} />
              </TableHead>
              <TableHead>
                <SortableHeader label="Quiebre Estimado" sortKey="diasParaQuiebreHistorico" active={sortKey === "diasParaQuiebreHistorico"} dir={sortDir} onClick={handleSort} />
              </TableHead>
              <TableHead className="text-right">
                <SortableHeader label="Cantidad Sugerida" sortKey="cantidadSugerida" active={sortKey === "cantidadSugerida"} dir={sortDir} onClick={handleSort} />
              </TableHead>
              <TableHead className="w-24">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedSkus.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  No hay SKUs que requieran reposición en el horizonte seleccionado.
                </TableCell>
              </TableRow>
            ) : (
              sortedSkus.map((row) => (
                <TableRow key={row.sku} data-testid={`row-pedido-${row.sku}`}>
                  <TableCell className="text-sm text-muted-foreground">{row.tipoProducto || "Sin Tipo"}</TableCell>
                  <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                  <TableCell className="text-sm">
                    {row.producto}
                    {row.variante ? <span className="text-muted-foreground"> · {row.variante}</span> : ""}
                  </TableCell>
                  <TableCell className={`text-right font-medium ${row.stockActual <= 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                    {row.stockActual.toLocaleString("es-CL")}
                  </TableCell>
                  <TableCell className="text-right">{row.consumoMensualHistorico.toLocaleString("es-CL", { maximumFractionDigits: 1 })}</TableCell>
                  <TableCell className={
                    row.estado === "agotado" ? "text-red-600 dark:text-red-400 font-semibold" :
                    row.estado === "urgente" ? "text-yellow-600 dark:text-yellow-400 font-semibold" :
                    "text-blue-600 dark:text-blue-400"
                  }>
                    {formatQuiebreDate(row.fechaQuiebreHistorico)}
                  </TableCell>
                  <TableCell className="text-right font-bold text-primary">
                    {row.cantidadSugerida.toLocaleString("es-CL")}
                  </TableCell>
                  <TableCell>
                    {row.estado === "agotado" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                        <PackageX className="h-3 w-3" /> Agotado
                      </span>
                    )}
                    {row.estado === "urgente" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-400">
                        <AlertTriangle className="h-3 w-3" /> Urgente
                      </span>
                    )}
                    {row.estado === "proximo" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">
                        <Clock className="h-3 w-3" /> Próximo
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
