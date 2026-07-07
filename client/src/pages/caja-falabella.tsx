import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CreditCard, Calendar, Filter, Check, Download, Pencil, X, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { MonthFilter, mesFromDDMMYYYY } from "@/components/month-filter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { downloadAsXlsx } from "@/lib/download-xlsx";

const CENTROS_DE_COSTOS = [
  "C-ASESORIAS",
  "C-BODEGA",
  "C-DEVOLUCION DE PRESTAMOS",
  "C-ENVIOS",
  "C-ETIQUETAS",
  "C-FERIAS",
  "C-GASTOS BANCARIOS",
  "C-GASTOS RELACIONADOS POR LA SOCIEDAD",
  "C-IMPORTACION",
  "C-IMPUESTO A LA RENTA",
  "C-IVA - PPM",
  "C-LIBRERÍA",
  "C-MARKETING Y PUBLICIDAD",
  "C-MATERIALES",
  "C-MUESTRAS CLIENTES",
  "C-NADA",
  "C-OTRAS DEVOLUCIONES",
  "C-PATENTE",
  "C-PRESTAMOS",
  "C-PRODUCTOS NUEVOS",
  "C-REGISTRO",
  "C-SISTEMA DE FACTURACION",
  "C-SUELDOS",
  "C-TELEFONO",
  "C-VARIOS AYUDA",
  "C-VENTA",
  "C-VIATICOS - BENCINA - PEAJES",
];

interface Candidato {
  nDocumento: string;
  tipo: string;
  monto: number;
  fecha: string;
  descripcion: string;
}

interface FalabellaRow {
  fecha: string;
  fechaCobro: string;
  detalle: string;
  monto: number;
  sucursal: string;
  centroCostos: string | null;
  revisado: boolean;
  movementKey: string;
  nDocumentos: string[];
  nDocIsOverride: boolean;
  saldoBanco: number | null;
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

function getColorClass(centro: string, monto: number): string {
  const tone = CC_TONE[centro];
  if (!tone) return monto >= 0
    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  return monto >= 0 ? tone.pos : tone.neg;
}

function parseDDMMYYYY(dateStr: string): Date | null {
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1;
  const year = parseInt(parts[2]);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return new Date(year, month, day);
}

function formatMonto(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("es-CL");
  if (value < 0) return `-$${formatted}`;
  return `$${formatted}`;
}

function NDocCell({
  movementKey,
  nDocumentos,
  nDocIsOverride,
  candidatos,
  allRows,
  onSave,
}: {
  movementKey: string;
  nDocumentos: string[];
  nDocIsOverride: boolean;
  candidatos: Candidato[];
  allRows: FalabellaRow[];
  onSave: (movementKey: string, nDocumentos: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const candidatoMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of candidatos) {
      if (c.descripcion) m.set(c.nDocumento, c.descripcion);
    }
    return m;
  }, [candidatos]);

  const filtered = useMemo(() => {
    if (!search.trim()) return candidatos.slice(0, 60);
    const q = search.toLowerCase();
    return candidatos.filter(
      (c) => c.nDocumento.toLowerCase().includes(q) || c.descripcion.toLowerCase().includes(q)
    ).slice(0, 60);
  }, [candidatos, search]);

  const attemptSave = (newVal: string) => {
    if (nDocumentos.includes(newVal)) return;
    const msgs: string[] = [];
    if (nDocumentos.length > 0) {
      msgs.push(`Esta fila ya tiene ${nDocumentos.length === 1 ? "el N°" : "los N°"} ${nDocumentos.map(d => `#${d}`).join(", ")} asociado${nDocumentos.length > 1 ? "s" : ""}. Se agregará #${newVal} como documento adicional.`);
    }
    const duplicate = allRows.find(
      (r) => r.movementKey !== movementKey && r.nDocumentos.includes(newVal)
    );
    if (duplicate) {
      msgs.push(`El N° ${newVal} ya está asociado al movimiento del ${duplicate.fecha} — "${duplicate.detalle.slice(0, 50)}".`);
    }
    if (msgs.length > 0) {
      setPendingValue(newVal);
      setWarnings(msgs);
    } else {
      confirmSave(newVal);
    }
  };

  const confirmSave = (val: string) => {
    onSave(movementKey, [...nDocumentos, val]);
    setOpen(false);
    setSearch("");
    setManualValue("");
    setPendingValue(null);
    setWarnings([]);
  };

  const cancelPending = () => {
    setPendingValue(null);
    setWarnings([]);
  };

  const handleRemoveOne = (doc: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onSave(movementKey, nDocumentos.filter(d => d !== doc));
  };

  const handleClearAll = () => {
    onSave(movementKey, []);
    setOpen(false);
  };

  const TIPO_LABEL: Record<string, string> = {
    "FACTURA ELECTRÓNICA": "Fact.",
    "BOLETA ELECTRÓNICA": "Bol.",
    "FACTURA COMPRA": "Compra",
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setPendingValue(null); setWarnings([]); setSearch(""); } }}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center flex-wrap gap-1 group focus:outline-none"
          data-testid={`btn-ndoc-fal-${movementKey}`}
        >
          {nDocumentos.length > 0 ? (
            <TooltipProvider delayDuration={400}>
              {nDocumentos.map((doc) => {
                const clientName = candidatoMap.get(doc);
                return (
                  <Tooltip key={doc}>
                    <TooltipTrigger asChild>
                      <span>
                        <Badge
                          variant={nDocIsOverride ? "secondary" : "outline"}
                          className={`text-xs font-mono cursor-pointer transition-colors pr-1 ${
                            nDocIsOverride
                              ? "bg-primary/15 text-primary border-0 hover:bg-primary/25"
                              : "text-muted-foreground hover:text-foreground hover:border-foreground/40"
                          }`}
                          data-testid={`badge-ndoc-fal-${doc}`}
                        >
                          #{doc}
                          {nDocIsOverride && (
                            <span
                              role="button"
                              onClick={(e) => handleRemoveOne(doc, e)}
                              className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
                            >
                              <X className="h-2.5 w-2.5 inline" />
                            </span>
                          )}
                        </Badge>
                      </span>
                    </TooltipTrigger>
                    {clientName && (
                      <TooltipContent side="top" className="max-w-[220px] text-center">
                        {clientName}
                      </TooltipContent>
                    )}
                  </Tooltip>
                );
              })}
            </TooltipProvider>
          ) : (
            <span className="text-muted-foreground/40 text-xs hover:text-muted-foreground cursor-pointer transition-colors">
              + Asignar
            </span>
          )}
          {nDocumentos.length > 0 && (
            <span className="opacity-0 group-hover:opacity-60 transition-opacity">
              <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        {warnings.length > 0 ? (
          <div className="p-3 space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">Atención</p>
                {warnings.map((w, i) => (
                  <p key={i} className="text-xs text-muted-foreground leading-snug">{w}</p>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              ¿Deseas guardar igualmente el N° <span className="font-mono font-semibold text-foreground">#{pendingValue}</span>?
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs flex-1" onClick={() => confirmSave(pendingValue!)} data-testid="btn-confirm-ndoc-fal">Confirmar</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={cancelPending} data-testid="btn-cancel-ndoc-fal">Cancelar</Button>
            </div>
          </div>
        ) : (
          <>
            {nDocumentos.length > 0 && (
              <div className="px-3 pt-2.5 pb-1.5 border-b flex flex-wrap gap-1">
                {nDocumentos.map((doc) => (
                  <Badge key={doc} variant="secondary" className="text-xs font-mono bg-primary/10 text-primary border-0 pr-1">
                    #{doc}
                    {nDocIsOverride && (
                      <span role="button" onClick={(e) => { handleRemoveOne(doc, e); setOpen(false); }} className="ml-1 opacity-50 hover:opacity-100 transition-opacity">
                        <X className="h-2.5 w-2.5 inline" />
                      </span>
                    )}
                  </Badge>
                ))}
              </div>
            )}
            <div className="p-2 border-b">
              <Input
                placeholder="Buscar N° documento o cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs"
                autoFocus
                data-testid="input-search-ndoc-fal"
              />
            </div>
            <ScrollArea className="h-44">
              <div className="py-1">
                {filtered.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-6">Sin resultados</p>
                ) : (
                  filtered.map((c) => (
                    <button
                      key={`${c.tipo}|${c.nDocumento}`}
                      onClick={() => attemptSave(c.nDocumento)}
                      disabled={nDocumentos.includes(c.nDocumento)}
                      className={`w-full text-left px-3 py-2 hover:bg-muted transition-colors flex items-start gap-2 ${nDocumentos.includes(c.nDocumento) ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-0.5 shrink-0">
                        {TIPO_LABEL[c.tipo] ?? c.tipo}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-mono font-semibold leading-tight">#{c.nDocumento}</p>
                        {c.descripcion && <p className="text-[11px] text-muted-foreground truncate leading-tight">{c.descripcion}</p>}
                        {c.monto > 0 && <p className="text-[11px] text-muted-foreground leading-tight">${c.monto.toLocaleString("es-CL")}{c.fecha ? ` · ${c.fecha}` : ""}</p>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
            <div className="border-t p-2 space-y-2">
              <p className="text-[11px] text-muted-foreground font-medium">O ingresar manualmente:</p>
              <div className="flex gap-1.5">
                <Input value={manualValue} onChange={(e) => setManualValue(e.target.value)} placeholder="Ej: 12345" className="h-7 text-xs" onKeyDown={(e) => e.key === "Enter" && attemptSave(manualValue.trim())} data-testid="input-manual-ndoc-fal" />
                <Button size="sm" className="h-7 text-xs px-2" onClick={() => attemptSave(manualValue.trim())} disabled={!manualValue.trim()} data-testid="btn-save-ndoc-fal">Guardar</Button>
              </div>
              {nDocIsOverride && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground w-full hover:text-destructive" onClick={handleClearAll} data-testid="btn-clear-ndoc-fal">
                  <X className="h-3 w-3 mr-1" />
                  Quitar todos los documentos
                </Button>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
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

function FechaCobroCell({
  movementKey,
  fechaCobro,
  fechaEmision,
  onSave,
}: {
  movementKey: string;
  fechaCobro: string;
  fechaEmision: string;
  onSave: (movementKey: string, fecha: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const isModified = fechaCobro !== fechaEmision;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    onSave(movementKey, fromInputDate(val));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={toInputDate(fechaCobro)}
        className="text-xs border border-border rounded px-1 py-0.5 w-28 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        onChange={handleChange}
        onBlur={() => setEditing(false)}
        data-testid={`input-fecha-cobro-fal-${movementKey}`}
      />
    );
  }

  return (
    <div className="flex items-center gap-1 group">
      <button
        onClick={() => setEditing(true)}
        className={`text-xs cursor-pointer hover:underline text-left ${isModified ? "text-primary font-medium" : "text-muted-foreground"}`}
        data-testid={`text-fecha-cobro-fal-${movementKey}`}
      >
        {fechaCobro}
      </button>
      {isModified && (
        <button
          onClick={() => onSave(movementKey, null)}
          className="opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
          title="Restaurar a fecha de emisión"
          data-testid={`btn-reset-fecha-cobro-fal-${movementKey}`}
        >
          <X className="h-2.5 w-2.5 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

export default function CajaFalabellaPage() {
  const [filtroMeses, setFiltroMeses] = useState<string[]>([]);
  const [editConfirmKey, setEditConfirmKey] = useState<string | null>(null);
  const [filtroCentro, setFiltroCentro] = useState("todos");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const { toast } = useToast();

  const { data: rows, isLoading } = useQuery<FalabellaRow[]>({
    queryKey: ["/api/falabella-costos"],
  });

  const { data: candidatos = [] } = useQuery<Candidato[]>({
    queryKey: ["/api/falabella-costos/candidatos-ndoc"],
    staleTime: 5 * 60 * 1000,
  });

  const saveNDocMutation = useMutation({
    mutationFn: async ({ movementKey, nDocumentos }: { movementKey: string; nDocumentos: string[] }) => {
      const res = await apiRequest("POST", "/api/falabella-costos/save-ndocumento", { movementKey, nDocumentos });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/falabella-costos"] }); },
    onError: () => { toast({ title: "Error", description: "No se pudo guardar el N° de documento", variant: "destructive" }); },
  });

  const handleSaveNDoc = (movementKey: string, nDocumentos: string[]) => {
    saveNDocMutation.mutate({ movementKey, nDocumentos });
  };

  const saveFechaCobroMutation = useMutation({
    mutationFn: async ({ movementKey, fechaCobro }: { movementKey: string; fechaCobro: string | null }) => {
      const res = await apiRequest("POST", "/api/falabella-costos/save-fecha-cobro", { movementKey, fechaCobro });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/falabella-costos"] }); },
    onError: () => { toast({ title: "Error", description: "No se pudo guardar la fecha de cobro", variant: "destructive" }); },
  });

  const handleSaveFechaCobro = (movementKey: string, fechaCobro: string | null) => {
    saveFechaCobroMutation.mutate({ movementKey, fechaCobro });
  };

  const saveCCMutation = useMutation({
    mutationFn: async ({ movementKey, centroCostos }: { movementKey: string; centroCostos: string }) => {
      const res = await apiRequest("POST", "/api/falabella-costos/save-cc", { movementKey, centroCostos });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/falabella-costos"] }); },
    onError: () => { toast({ title: "Error", description: "No se pudo guardar el centro de costos", variant: "destructive" }); },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ movementKey, revisado }: { movementKey: string; revisado: boolean }) => {
      const res = await apiRequest("POST", "/api/falabella-costos/review", { movementKey, revisado });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/falabella-costos"] }); },
    onError: () => { toast({ title: "Error", description: "No se pudo actualizar el estado", variant: "destructive" }); },
  });

  const handleCentroChange = (_detalle: string, newCentro: string, movementKey: string) => {
    saveCCMutation.mutate({ movementKey, centroCostos: newCentro });
  };

  const handleReviewToggle = (movementKey: string, currentRevisado: boolean) => {
    reviewMutation.mutate({ movementKey, revisado: !currentRevisado });
  };

  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const handleToggleAll = async (filteredRowsSnapshot: FalabellaRow[]) => {
    const allDone = filteredRowsSnapshot.length > 0 && filteredRowsSnapshot.every(r => r.revisado);
    const targetState = !allDone;
    setIsMarkingAll(true);
    try {
      await Promise.all(
        filteredRowsSnapshot
          .filter(r => r.revisado !== targetState)
          .map(r => apiRequest("POST", "/api/falabella-costos/review", { movementKey: r.movementKey, revisado: targetState }).then(res => res.json()))
      );
      queryClient.invalidateQueries({ queryKey: ["/api/falabella-costos"] });
      toast({ title: "Actualizado", description: `Movimientos marcados como ${targetState ? "revisados" : "pendientes"}` });
    } catch {
      toast({ title: "Error", description: "No se pudo actualizar todos los estados", variant: "destructive" });
    } finally {
      setIsMarkingAll(false);
    }
  };

  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    return rows.filter((row) => {
      if (filtroMeses.length > 0 && !filtroMeses.includes(mesFromDDMMYYYY(row.fecha))) return false;
      if (filtroCentro !== "todos") {
        if (filtroCentro === "sin-asignar" && row.centroCostos) return false;
        else if (filtroCentro !== "sin-asignar" && row.centroCostos !== filtroCentro) return false;
      }
      if (filtroEstado === "revisado" && !row.revisado) return false;
      if (filtroEstado === "pendiente" && row.revisado) return false;
      if (filtroTipo === "ventas" && row.monto < 0) return false;
      if (filtroTipo === "costos" && row.monto >= 0) return false;
      return true;
    });
  }, [rows, filtroMeses, filtroCentro, filtroEstado, filtroTipo]);

  const mesesDisponibles = useMemo(() =>
    [...new Set((rows ?? []).map(r => mesFromDDMMYYYY(r.fecha)).filter(Boolean))].sort()
  , [rows]);

  const parseFechaCmp = (s: string) => {
    const [d, m, y] = s.split("/").map(Number);
    return y * 10000 + m * 100 + (d || 0);
  };

  const sortedRows = useMemo(() => {
    if (!sortField) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      let cmp = 0;
      if (sortField === "fecha") cmp = parseFechaCmp(a.fecha) - parseFechaCmp(b.fecha);
      else if (sortField === "fechaCobro") cmp = parseFechaCmp(a.fechaCobro) - parseFechaCmp(b.fechaCobro);
      else if (sortField === "monto") cmp = a.monto - b.monto;
      else if (sortField === "saldoBanco") cmp = (a.saldoBanco ?? 0) - (b.saldoBanco ?? 0);
      else if (sortField === "detalle") cmp = a.detalle.localeCompare(b.detalle, "es");
      else if (sortField === "centroCostos") cmp = (a.centroCostos ?? "").localeCompare(b.centroCostos ?? "", "es");
      else if (sortField === "nDocumentos") cmp = (a.nDocumentos[0] ?? "").localeCompare(b.nDocumentos[0] ?? "", "es");
      else if (sortField === "revisado") cmp = (a.revisado ? 1 : 0) - (b.revisado ? 1 : 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredRows, sortField, sortDir]);

  const centrosUsados = useMemo(() => {
    if (!rows) return [];
    const set = new Set<string>();
    for (const row of rows) { if (row.centroCostos) set.add(row.centroCostos); }
    return Array.from(set).sort();
  }, [rows]);

  const statsResumen = useMemo(() => {
    if (!rows) return { total: 0, revisados: 0, pendientes: 0 };
    const revisados = rows.filter(r => r.revisado).length;
    return { total: rows.length, revisados, pendientes: rows.length - revisados };
  }, [rows]);

  const totales = useMemo(() => {
    let ventas = 0, costos = 0, costossinNada = 0;
    for (const row of filteredRows) {
      if (row.monto >= 0) ventas += row.monto;
      else { costos += row.monto; if (row.centroCostos !== "C-NADA") costossinNada += row.monto; }
    }
    return { ventas, costos, neto: ventas + costos, costossinNada };
  }, [filteredRows]);

  return (
    <div className="px-6 py-6 pb-8" style={{ width: "max-content", minWidth: "100%" }}>
      <div className="max-w-6xl space-y-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-falabella-costos-title">
              Caja - Banco Falabella
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Movimientos bancarios de la Cartola Banco Falabella
            </p>
          </div>
          {rows && rows.length > 0 && (
            <div className="ml-auto flex items-center gap-3">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800" data-testid="badge-fal-revisados">
                <Check className="h-3 w-3 mr-1" />
                {statsResumen.revisados} revisados
              </Badge>
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800" data-testid="badge-fal-pendientes">
                {statsResumen.pendientes} pendientes
              </Badge>
              {filteredRows.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  data-testid="button-download-falabella"
                  onClick={() => {
                    const DOWNLOAD_COLS = [
                      { key: "fecha",           label: "Fecha Emisión" },
                      { key: "fechaCobro",      label: "Fecha Cobro" },
                      { key: "detalle",         label: "Descripción" },
                      { key: "nDocumentos",     label: "N° Doc." },
                      { key: "tipoTransaccion", label: "Tipo Transacción" },
                      { key: "monto",           label: "Monto" },
                      { key: "saldoBanco",      label: "Saldo" },
                      { key: "centroCostos",    label: "Centro de Costos" },
                      { key: "estado",          label: "Estado" },
                    ];
                    const data = filteredRows.map(r => ({
                      fecha:           r.fecha,
                      fechaCobro:      r.fechaCobro,
                      detalle:         r.detalle,
                      nDocumentos:     r.nDocumentos.join(", "),
                      tipoTransaccion: r.monto >= 0 ? "Abono" : "Cargo",
                      monto:           r.monto,
                      saldoBanco:      r.saldoBanco ?? "",
                      centroCostos:    r.centroCostos ?? "",
                      estado:          r.revisado ? "Revisado" : "Pendiente",
                    }));
                    downloadAsXlsx(data, DOWNLOAD_COLS, "caja-falabella");
                  }}
                >
                  <Download className="h-4 w-4" />
                  Descargar xlsx
                </Button>
              )}
            </div>
          )}
        </div>

        <Card className="border-card-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1.5">
                <Label className="text-sm">Mes</Label>
                <MonthFilter
                  availableMonths={mesesDisponibles}
                  selectedMonths={filtroMeses}
                  onChange={setFiltroMeses}
                  label="Todos los meses"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fal-filtro-centro" className="text-sm">Centro de Costos</Label>
                <Select value={filtroCentro} onValueChange={setFiltroCentro}>
                  <SelectTrigger className="w-56" data-testid="select-fal-filtro-centro">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="sin-asignar">Sin asignar</SelectItem>
                    {centrosUsados.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fal-filtro-estado" className="text-sm">Estado</Label>
                <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                  <SelectTrigger className="w-44" data-testid="select-fal-filtro-estado">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="revisado">Revisado</SelectItem>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fal-filtro-tipo" className="text-sm">Tipo transacción</Label>
                <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                  <SelectTrigger className="w-44" data-testid="select-fal-filtro-tipo">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="ventas">Abonos</SelectItem>
                    <SelectItem value="costos">Cargos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {filteredRows.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card className="border-card-border">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Saldo Actual</p>
                <p className={`text-2xl font-bold ${(rows && rows.length > 0 ? (rows[0].saldoBanco ?? 0) : 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} data-testid="text-fal-saldo-actual">
                  {formatMonto(rows && rows.length > 0 ? (rows[0].saldoBanco ?? 0) : 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Saldo banco más reciente</p>
              </CardContent>
            </Card>
            <Card className="border-card-border">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Total Abonos</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-fal-total-abonos">
                  {totales.ventas.toLocaleString("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Suma de montos positivos</p>
              </CardContent>
            </Card>
            <Card className="border-card-border">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Total Cargos</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-fal-total-cargos">
                  {totales.costos.toLocaleString("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Suma de montos negativos</p>
              </CardContent>
            </Card>
            <Card className="border-card-border">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Total Cargos sin "C-Nada"</p>
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400" data-testid="text-fal-total-sin-nada">
                  {totales.costossinNada.toLocaleString("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Cargos excluyendo C-NADA</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Card className="border-card-border w-full">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
          <CardTitle className="text-base font-semibold" data-testid="text-fal-tabla-movimientos">
            Movimientos
          </CardTitle>
          {filteredRows.length > 0 && (
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Saldo</p>
                <p className={`text-lg font-bold tabular-nums ${(rows && rows.length > 0 ? (rows[0].saldoBanco ?? 0) : 0) < 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`} data-testid="text-fal-total-visible">
                  {formatMonto(rows && rows.length > 0 ? (rows[0].saldoBanco ?? 0) : 0)}
                </p>
              </div>
              <span className="text-xs text-muted-foreground border-l pl-4" data-testid="text-fal-row-count">
                {filteredRows.length} movimiento{filteredRows.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !rows || rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CreditCard className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No hay datos de cartola cargados</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Sube un archivo PDF de Cartola Banco Falabella en el módulo correspondiente
              </p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Sin movimientos en el rango seleccionado</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Ajusta los filtros para ver resultados</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                {(() => {
                  const allRevisado = filteredRows.length > 0 && filteredRows.every(r => r.revisado);
                  const someRevisado = !allRevisado && filteredRows.some(r => r.revisado);
                  const SortIcon = ({ field }: { field: string }) =>
                    sortField === field
                      ? sortDir === "asc" ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />
                      : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-30" />;
                  const thBase = "sticky top-0 z-10 bg-card text-xs font-semibold border-b";
                  const SortBtn = ({ field, label, className }: { field: string; label: string; className?: string }) => (
                    <TableHead className={`${thBase} ${className ?? ""}`}>
                      <button className="flex items-center gap-0.5 hover:text-foreground transition-colors" onClick={() => toggleSort(field)} data-testid={`sort-fal-${field}`}>
                        {label}<SortIcon field={field} />
                      </button>
                    </TableHead>
                  );
                  return (
                    <TableHeader>
                      <TableRow>
                        <SortBtn field="fecha" label="Fecha Emisión" className="w-20" />
                        <SortBtn field="fechaCobro" label="Fecha Cobro" className="w-20" />
                        <SortBtn field="detalle" label="Descripción" />
                        <SortBtn field="nDocumentos" label="N° Doc." className="w-20" />
                        <SortBtn field="monto" label="Monto" className="text-right w-24" />
                        <SortBtn field="saldoBanco" label="Saldo" className="text-right w-24" />
                        <SortBtn field="centroCostos" label="Centro de Costos" className="w-44" />
                        <SortBtn field="revisado" label="Estado" className="w-16 text-center" />
                        <TableHead className={`${thBase} w-14 text-center !pr-8`}>
                          <Checkbox
                            checked={allRevisado ? true : someRevisado ? "indeterminate" : false}
                            onCheckedChange={() => handleToggleAll(filteredRows)}
                            disabled={isMarkingAll}
                            data-testid="checkbox-fal-review-all"
                            className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                          />
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                  );
                })()}
                <TableBody>
                  {sortedRows.map((row, i) => (
                    <TableRow key={i} data-testid={`row-fal-movimiento-${i}`} className={row.revisado ? "bg-green-50/50 dark:bg-green-950/20" : ""}>
                      <TableCell className="text-sm" data-testid={`text-fal-fecha-${i}`}>{row.fecha}</TableCell>
                      <TableCell data-testid={`cell-fal-fecha-cobro-${i}`}>
                        <FechaCobroCell movementKey={row.movementKey} fechaCobro={row.fechaCobro} fechaEmision={row.fecha} onSave={handleSaveFechaCobro} />
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px]" data-testid={`text-fal-detalle-${i}`}>
                        <div className="truncate" title={row.detalle}>{row.detalle}</div>
                      </TableCell>
                      <TableCell data-testid={`text-fal-ndocumento-${i}`}>
                        <NDocCell movementKey={row.movementKey} nDocumentos={row.nDocumentos} nDocIsOverride={row.nDocIsOverride} candidatos={candidatos} allRows={rows ?? []} onSave={handleSaveNDoc} />
                      </TableCell>
                      <TableCell className={`text-sm font-medium text-right ${row.monto < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`} data-testid={`text-fal-monto-${i}`}>
                        {formatMonto(row.monto)}
                      </TableCell>
                      <TableCell className={`text-sm font-semibold text-right ${(row.saldoBanco ?? 0) < 0 ? "text-red-600 dark:text-red-400" : "text-foreground"}`} data-testid={`text-fal-saldo-${i}`}>
                        {row.saldoBanco != null ? formatMonto(row.saldoBanco) : "—"}
                      </TableCell>
                      <TableCell data-testid={`cell-fal-centro-costos-${i}`}>
                        {row.centroCostos ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className={`text-xs whitespace-nowrap ${getColorClass(row.centroCostos, row.monto)}`}>
                              {row.centroCostos}
                            </Badge>
                            <Select value={row.centroCostos} onValueChange={(val) => handleCentroChange(row.detalle, val, row.movementKey)}>
                              <SelectTrigger className="h-7 w-7 p-0 border-none shadow-none [&>svg]:h-3 [&>svg]:w-3" data-testid={`btn-fal-change-centro-${i}`}>
                                <span className="sr-only">Cambiar</span>
                              </SelectTrigger>
                              <SelectContent>
                                {CENTROS_DE_COSTOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <Select value="" onValueChange={(val) => handleCentroChange(row.detalle, val, row.movementKey)}>
                            <SelectTrigger className="h-7 w-36 text-xs text-muted-foreground" data-testid={`select-fal-centro-${i}`}>
                              <SelectValue placeholder="Asignar..." />
                            </SelectTrigger>
                            <SelectContent>
                              {CENTROS_DE_COSTOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-center" data-testid={`cell-fal-estado-${i}`}>
                        {row.revisado ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs">Revisado</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 text-xs">Pendiente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center !pr-8">
                        {row.revisado ? (
                          <button
                            type="button"
                            onClick={() => setEditConfirmKey(row.movementKey)}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            data-testid={`btn-fal-edit-${i}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Editar
                          </button>
                        ) : (
                          <Checkbox
                            checked={false}
                            onCheckedChange={() => handleReviewToggle(row.movementKey, row.revisado)}
                            data-testid={`checkbox-fal-review-${i}`}
                            className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={editConfirmKey !== null} onOpenChange={(open) => { if (!open) setEditConfirmKey(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Editar movimiento revisado?</AlertDialogTitle>
            <AlertDialogDescription>
              Este movimiento ya fue revisado y confirmado. Si continúas, quedará como pendiente y podrás modificar sus campos nuevamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (editConfirmKey) handleReviewToggle(editConfirmKey, true);
                setEditConfirmKey(null);
              }}
            >
              Sí, editar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
