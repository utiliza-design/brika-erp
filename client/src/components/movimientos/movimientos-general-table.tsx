import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Filter, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { downloadAsXlsx } from "@/lib/download-xlsx";

const BANCOS = ["Banco de Chile", "Banco Security", "Falabella", "Global66 CLP", "Global66 USD"] as const;

const CENTROS_DE_COSTOS = [
  "C-ASESORIAS", "C-BODEGA", "C-DEVOLUCION DE PRESTAMOS", "C-ENVIOS", "C-ETIQUETAS",
  "C-FERIAS", "C-GASTOS BANCARIOS", "C-GASTOS RELACIONADOS POR LA SOCIEDAD", "C-IMPORTACION",
  "C-IMPUESTO A LA RENTA", "C-IVA - PPM", "C-LIBRERÍA", "C-MARKETING Y PUBLICIDAD",
  "C-MATERIALES", "C-MUESTRAS CLIENTES", "C-NADA", "C-OTRAS DEVOLUCIONES", "C-PATENTE",
  "C-PRESTAMOS", "C-PRODUCTOS NUEVOS", "C-REGISTRO", "C-SISTEMA DE FACTURACION",
  "C-SUELDOS", "C-TELEFONO", "C-VARIOS AYUDA", "C-VENTA", "C-VIATICOS - BENCINA - PEAJES",
];

interface GenRow {
  banco: string;
  fecha: string;
  fechaCobro: string;
  detalle: string;
  monto: number;
  moneda: "CLP" | "USD";
  saldo: number | null;
  centroCostos: string | null;
  nDocumentos: string[];
  revisado: boolean;
  movementKey: string;
}

function parseFechaCmp(s: string): number {
  const [d, m, y] = s.split("/").map(Number);
  return (y || 0) * 10000 + (m || 0) * 100 + (d || 0);
}

function toInputDate(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split("/");
  if (!d || !m || !y) return "";
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function fromInputDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

function formatMonto(value: number, moneda: "CLP" | "USD"): string {
  const abs = Math.abs(value);
  if (moneda === "USD") {
    const f = abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return value < 0 ? `-US$${f}` : `US$${f}`;
  }
  const f = abs.toLocaleString("es-CL");
  return value < 0 ? `-$${f}` : `$${f}`;
}

const CC_TONE: Record<string, { pos: string; neg: string }> = {
  "C-ASESORIAS":                           { pos: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",  neg: "bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-200" },
  "C-BODEGA":                              { pos: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",              neg: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  "C-DEVOLUCION DE PRESTAMOS":             { pos: "bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-200",          neg: "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-200" },
  "C-ENVIOS":                              { pos: "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200",              neg: "bg-orange-200 text-orange-900 dark:bg-orange-900 dark:text-orange-200" },
  "C-ETIQUETAS":                           { pos: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",          neg: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200" },
  "C-FERIAS":                              { pos: "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200",  neg: "bg-red-300 text-red-900 dark:bg-red-900 dark:text-red-200" },
  "C-GASTOS BANCARIOS":                    { pos: "bg-teal-200 text-teal-900 dark:bg-teal-900 dark:text-teal-200",             neg: "bg-rose-300 text-rose-900 dark:bg-rose-900 dark:text-rose-200" },
  "C-GASTOS RELACIONADOS POR LA SOCIEDAD": { pos: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",             neg: "bg-pink-200 text-pink-900 dark:bg-pink-900 dark:text-pink-200" },
  "C-IMPORTACION":                         { pos: "bg-lime-200 text-lime-900 dark:bg-lime-900 dark:text-lime-200",             neg: "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-200" },
  "C-IMPUESTO A LA RENTA":                 { pos: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",          neg: "bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-200" },
  "C-IVA - PPM":                           { pos: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",  neg: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  "C-LIBRERÍA":                            { pos: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",              neg: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  "C-MARKETING Y PUBLICIDAD":              { pos: "bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-200",          neg: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200" },
  "C-MATERIALES":                          { pos: "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200",              neg: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  "C-MUESTRAS CLIENTES":                   { pos: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",  neg: "bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-200" },
  "C-NADA":                                { pos: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",           neg: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
  "C-OTRAS DEVOLUCIONES":                  { pos: "bg-teal-200 text-teal-900 dark:bg-teal-900 dark:text-teal-200",              neg: "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-200" },
  "C-PATENTE":                             { pos: "bg-cyan-200 text-cyan-900 dark:bg-cyan-900 dark:text-cyan-200",              neg: "bg-rose-300 text-rose-900 dark:bg-rose-900 dark:text-rose-200" },
  "C-PRESTAMOS":                           { pos: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",  neg: "bg-red-300 text-red-900 dark:bg-red-900 dark:text-red-200" },
  "C-PRODUCTOS NUEVOS":                    { pos: "bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-200",          neg: "bg-orange-200 text-orange-900 dark:bg-orange-900 dark:text-orange-200" },
  "C-REGISTRO":                            { pos: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",              neg: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200" },
  "C-SISTEMA DE FACTURACION":              { pos: "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200",              neg: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  "C-SUELDOS":                             { pos: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",          neg: "bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-200" },
  "C-TELEFONO":                            { pos: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",  neg: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  "C-VARIOS AYUDA":                        { pos: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",              neg: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200" },
  "C-VENTA":                               { pos: "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200",  neg: "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-200" },
  "C-VIATICOS - BENCINA - PEAJES":         { pos: "bg-lime-200 text-lime-900 dark:bg-lime-900 dark:text-lime-200",              neg: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200" },
};

function ccClass(cc: string, monto: number): string {
  const tone = CC_TONE[cc];
  if (!tone) return monto >= 0
    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  return monto >= 0 ? tone.pos : tone.neg;
}

export function MovimientosGeneralTable() {
  const { data: rows = [], isLoading, isError, refetch } = useQuery<GenRow[]>({
    queryKey: ["/api/movimientos-general"],
    staleTime: 2 * 60 * 1000,
    refetchOnMount: "always",
    retry: 2,
  });

  const [filterDesde, setFilterDesde] = useState("");
  const [filterHasta, setFilterHasta] = useState("");
  const [filterBanco, setFilterBanco] = useState("todos");
  const [filterCC, setFilterCC] = useState("todos");

  const filtered = useMemo(() => {
    let r = rows;
    if (filterDesde) {
      const desdeCmp = parseFechaCmp(fromInputDate(filterDesde));
      r = r.filter(x => parseFechaCmp(x.fecha) >= desdeCmp);
    }
    if (filterHasta) {
      const hastaCmp = parseFechaCmp(fromInputDate(filterHasta));
      r = r.filter(x => parseFechaCmp(x.fecha) <= hastaCmp);
    }
    if (filterBanco !== "todos") {
      r = r.filter(x => x.banco === filterBanco);
    }
    if (filterCC !== "todos") {
      r = r.filter(x => x.centroCostos === filterCC);
    }
    return r;
  }, [rows, filterDesde, filterHasta, filterBanco, filterCC]);

  const hasFilters = filterDesde || filterHasta || filterBanco !== "todos" || filterCC !== "todos";

  const clearFilters = () => {
    setFilterDesde("");
    setFilterHasta("");
    setFilterBanco("todos");
    setFilterCC("todos");
  };

  const handleDownload = () => {
    const columns = [
      { key: "fecha", label: "Fecha" },
      { key: "banco", label: "Banco" },
      { key: "detalle", label: "Detalle" },
      { key: "montoFmt", label: "Monto" },
      { key: "moneda", label: "Moneda" },
      { key: "saldoFmt", label: "Saldo" },
      { key: "centroCostos", label: "Centro de Costos" },
      { key: "nDocumentos", label: "N° Documento" },
      { key: "estado", label: "Estado" },
    ];

    const exportData = filtered.map(r => ({
      fecha: r.fecha,
      banco: r.banco,
      detalle: r.detalle,
      montoFmt: r.monto,
      moneda: r.moneda,
      saldoFmt: r.saldo ?? "",
      centroCostos: r.centroCostos ?? "",
      nDocumentos: r.nDocumentos.join(", "),
      estado: r.revisado ? "Revisado" : "Pendiente",
    }));

    const today = new Date().toISOString().slice(0, 10);
    downloadAsXlsx(exportData, columns, `movimientos-general-${today}`);
  };

  const totalMonto = useMemo(() =>
    filtered.filter(r => r.moneda === "CLP").reduce((s, r) => s + r.monto, 0),
    [filtered]
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="pt-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">No se pudo cargar la vista general.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <CardTitle className="text-base font-semibold">
            Todos los movimientos
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({filtered.length.toLocaleString()} registros)
            </span>
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 text-xs"
            onClick={handleDownload}
            disabled={filtered.length === 0}
            data-testid="btn-download-general"
          >
            <Download className="h-3.5 w-3.5" />
            Descargar Excel
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Filtros:</span>
          </div>

          <div className="flex items-center gap-1">
            <label className="text-xs text-muted-foreground">Desde</label>
            <input
              type="date"
              value={filterDesde}
              onChange={e => setFilterDesde(e.target.value)}
              className="text-xs border border-border rounded px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary h-7"
              data-testid="input-filter-desde"
            />
          </div>

          <div className="flex items-center gap-1">
            <label className="text-xs text-muted-foreground">Hasta</label>
            <input
              type="date"
              value={filterHasta}
              onChange={e => setFilterHasta(e.target.value)}
              className="text-xs border border-border rounded px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary h-7"
              data-testid="input-filter-hasta"
            />
          </div>

          <Select value={filterBanco} onValueChange={setFilterBanco}>
            <SelectTrigger className="h-7 text-xs w-36" data-testid="select-filter-banco">
              <SelectValue placeholder="Banco" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los bancos</SelectItem>
              {BANCOS.map(b => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterCC} onValueChange={setFilterCC}>
            <SelectTrigger className="h-7 text-xs w-44" data-testid="select-filter-cc">
              <SelectValue placeholder="Centro de Costos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los CC</SelectItem>
              {CENTROS_DE_COSTOS.map(cc => (
                <SelectItem key={cc} value={cc}>{cc}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground gap-1"
              onClick={clearFilters}
              data-testid="btn-clear-filters"
            >
              <X className="h-3 w-3" />
              Limpiar
            </Button>
          )}
        </div>

        {/* Summary bar */}
        {filtered.length > 0 && (
          <div className="flex flex-wrap gap-4 pt-1 text-xs text-muted-foreground border-t mt-2">
            <span>
              Balance CLP:{" "}
              <span className={`font-semibold ${totalMonto >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {formatMonto(totalMonto, "CLP")}
              </span>
            </span>
            <span>
              Revisados:{" "}
              <span className="font-semibold text-foreground">
                {filtered.filter(r => r.revisado).length}
              </span>
              {" / "}{filtered.length}
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No hay movimientos. Sube cartolas en cada pestaña de banco.
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Ningún movimiento coincide con los filtros aplicados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="w-24">Fecha</TableHead>
                  <TableHead className="w-32">Banco</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead className="w-28 text-right">Monto</TableHead>
                  <TableHead className="w-28 text-right">Saldo</TableHead>
                  <TableHead className="w-44">Centro de Costos</TableHead>
                  <TableHead className="w-24">N° Doc</TableHead>
                  <TableHead className="w-24">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow
                    key={row.movementKey}
                    className={`text-xs ${row.revisado ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""}`}
                    data-testid={`row-general-${row.movementKey}`}
                  >
                    <TableCell className="font-mono text-xs whitespace-nowrap py-2">
                      {row.fecha}
                    </TableCell>
                    <TableCell className="py-2">
                      <span className="text-xs text-muted-foreground">{row.banco}</span>
                    </TableCell>
                    <TableCell className="py-2 max-w-xs">
                      <span className="line-clamp-2 text-xs leading-snug">{row.detalle}</span>
                    </TableCell>
                    <TableCell className={`py-2 text-right font-mono text-xs whitespace-nowrap ${row.monto >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                      {formatMonto(row.monto, row.moneda)}
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {row.saldo !== null ? formatMonto(row.saldo, row.moneda) : "—"}
                    </TableCell>
                    <TableCell className="py-2">
                      {row.centroCostos ? (
                        <Badge className={`text-[10px] px-1.5 py-0 font-medium border-0 ${ccClass(row.centroCostos, row.monto)}`}>
                          {row.centroCostos}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      {row.nDocumentos.length > 0 ? (
                        <div className="flex flex-wrap gap-0.5">
                          {row.nDocumentos.map(d => (
                            <Badge key={d} variant="outline" className="text-[10px] px-1 py-0 font-mono">
                              #{d}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 border-0 ${
                          row.revisado
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                        }`}
                      >
                        {row.revisado ? "Revisado" : "Pendiente"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
