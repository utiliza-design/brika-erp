import { useState, useMemo, useRef, useCallback, memo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { FileCheck, CheckCircle2, XCircle, AlertCircle, Filter, Download, Plus, X, StickyNote, Search, RefreshCw, CalendarIcon, ChevronDown, ChevronUp, Upload, FileSpreadsheet, Loader2, Mail, UserPlus, Eye, Send } from "lucide-react";
import { MonthFilter, mesFromISO } from "@/components/month-filter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { downloadAsXlsx } from "@/lib/download-xlsx";

interface MatchCartola {
  movementKey: string;
  fecha: string;
  detalle: string;
  monto: number;
  banco: string;
}

interface Propuesta {
  id: string;
  tipo: "movimiento" | "nota";
  cartolaMovementKey?: string | null;
  notaManual?: string | null;
  fecha?: string;
  detalle?: string;
  monto?: number;
  banco?: string;
}

interface EmailLogEntry {
  id: string;
  numeroAviso: number;
  destinatarios: string[];
  asunto: string;
  enviadoAt: string;
}

interface FacturaRow {
  facturaKey: string;
  tipoDocumento: string;
  nDocumento: string;
  cliente: string;
  rutCliente: string;
  fechaEmision: string;
  montoNeto: number;
  montoDocumento: number;
  estado: "propuesto" | "pagado" | "pendiente";
  matchCartola: MatchCartola | null;
  propuestas: Propuesta[];
  clienteId: string | null;
  clienteNombre: string | null;
  clienteEmails: string[];
  emailLogs: EmailLogEntry[];
}

interface MovimientoDisponible {
  movementKey: string;
  fecha: string;
  detalle: string;
  monto: number;
  banco: string;
  usadoEn: string[];
}

function formatCLP(value: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
}

function avisoLabel(n: number): string {
  if (n === 1) return "1er aviso";
  if (n === 2) return "2do aviso";
  if (n === 3) return "3er aviso";
  return `${n}° aviso`;
}

function BancoBadge({ banco }: { banco: string }) {
  const cls =
    banco === "Banco Security"
      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
      : banco === "Banco Falabella"
      ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
      : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>
      {banco}
    </span>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  if (estado === "pagado") {
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">Pagado</Badge>;
  }
  return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-0">Pendiente</Badge>;
}

interface PropuestaPagoCellProps {
  factura: FacturaRow;
  onDelete: (facturaKey: string, propuestaId: string) => void;
  onAdd: (facturaKey: string, tipo: "movimiento" | "nota", cartolaMovementKey?: string, notaManual?: string) => void;
  onRejectAutoMatch: (facturaKey: string, cartolaMovementKey: string) => void;
  movimientosDisponibles: MovimientoDisponible[];
  toast: ReturnType<typeof useToast>["toast"];
}

function PropuestaPagoCell({ factura, onDelete, onAdd, onRejectAutoMatch, movimientosDisponibles, toast }: PropuestaPagoCellProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"buscar" | "nota">("buscar");
  const [searchQuery, setSearchQuery] = useState("");
  const [notaText, setNotaText] = useState("");

  const filteredMovimientos = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return movimientosDisponibles;
    return movimientosDisponibles.filter(m =>
      m.detalle.toLowerCase().includes(q) ||
      m.fecha.includes(q) ||
      m.monto.toString().includes(q) ||
      m.banco.toLowerCase().includes(q)
    );
  }, [movimientosDisponibles, searchQuery]);

  const isPagado = factura.estado === "pagado";
  const hasManualPropuestas = (factura.propuestas ?? []).length > 0;

  function handleSelectMovimiento(mov: MovimientoDisponible) {
    if (hasManualPropuestas) {
      toast({ title: "Advertencia", description: "Esta factura ya tiene una propuesta registrada. Se agregará otra de todas formas.", variant: "default", className: "border-yellow-400 bg-yellow-50 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200" });
    }
    const otrasFacturas = mov.usadoEn.filter(fk => fk !== factura.facturaKey);
    if (otrasFacturas.length > 0) {
      toast({ title: "Advertencia", description: `Este movimiento ya está asociado a otra factura de cobranza.`, variant: "default", className: "border-yellow-400 bg-yellow-50 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200" });
    }
    onAdd(factura.facturaKey, "movimiento", mov.movementKey);
    setOpen(false);
    setSearchQuery("");
  }

  function handleAgregarNota() {
    if (!notaText.trim()) return;
    if (hasManualPropuestas) {
      toast({ title: "Advertencia", description: "Esta factura ya tiene una propuesta registrada. Se agregará otra de todas formas.", variant: "default", className: "border-yellow-400 bg-yellow-50 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200" });
    }
    onAdd(factura.facturaKey, "nota", undefined, notaText.trim());
    setNotaText("");
    setOpen(false);
  }

  return (
    <div className="space-y-1.5">
      {hasManualPropuestas ? (
        (factura.propuestas ?? []).map(p => (
          <div key={p.id} className="flex items-start gap-1.5 text-xs rounded-md bg-muted/40 px-2 py-1.5 group" data-testid={`propuesta-chip-${p.id}`}>
            <div className="flex-1 min-w-0">
              {p.tipo === "movimiento" ? (
                <div className="space-y-0.5">
                  <div className="font-medium text-foreground">{p.fecha}</div>
                  <div className="truncate text-muted-foreground max-w-[150px]">{p.detalle}</div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-green-600 dark:text-green-400">{formatCLP(p.monto ?? 0)}</span>
                    {p.banco && <BancoBadge banco={p.banco} />}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-1.5">
                  <StickyNote className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-muted-foreground truncate max-w-[130px]">{p.notaManual}</span>
                </div>
              )}
            </div>
            {!isPagado && (
              <button onClick={() => onDelete(factura.facturaKey, p.id)} className="shrink-0 text-muted-foreground hover:text-red-500 transition-colors mt-0.5" data-testid={`button-delete-propuesta-${p.id}`} title="Eliminar propuesta">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))
      ) : factura.matchCartola ? (
        <div className="flex items-start gap-1.5 text-xs rounded-md bg-muted/40 px-2 py-1.5 group" data-testid={`automatch-chip-${factura.nDocumento}`}>
          <div className="flex-1 min-w-0 text-muted-foreground space-y-0.5 opacity-70 italic">
            <div className="font-medium text-foreground not-italic">{factura.matchCartola.fecha}</div>
            <div className="truncate max-w-[150px]">{factura.matchCartola.detalle}</div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-green-600 dark:text-green-400 not-italic">{formatCLP(factura.matchCartola.monto)}</span>
              <BancoBadge banco={factura.matchCartola.banco} />
              <span className="text-[10px] text-muted-foreground">(auto)</span>
            </div>
          </div>
          {!isPagado && (
            <button
              onClick={() => onRejectAutoMatch(factura.facturaKey, factura.matchCartola!.movementKey)}
              className="shrink-0 text-muted-foreground hover:text-red-500 transition-colors mt-0.5"
              data-testid={`button-reject-automatch-${factura.nDocumento}`}
              title="Descartar recomendación automática"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">-</span>
      )}

      <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1" data-testid={`button-add-propuesta-${factura.nDocumento}`}>
              <Plus className="h-3 w-3" />
              Transferencia de pago
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start" side="bottom">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "buscar" | "nota")} className="w-full">
              <div className="px-3 pt-3 pb-0">
                <TabsList className="w-full">
                  <TabsTrigger value="buscar" className="flex-1 text-xs" data-testid="tab-buscar-movimiento">
                    <Search className="h-3 w-3 mr-1" />Buscar movimiento
                  </TabsTrigger>
                  <TabsTrigger value="nota" className="flex-1 text-xs" data-testid="tab-nota-libre">
                    <StickyNote className="h-3 w-3 mr-1" />Nota libre
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="buscar" className="mt-0 p-3 space-y-2">
                <Input placeholder="Buscar por descripción, monto, fecha..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="h-8 text-xs" data-testid="input-buscar-movimiento" />
                <div className="max-h-[200px] overflow-y-auto space-y-1 rounded-md border bg-background p-1">
                  {filteredMovimientos.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-4">{searchQuery ? "Sin resultados" : "No hay movimientos disponibles"}</div>
                  ) : (
                    filteredMovimientos.map(mov => {
                      const otrasFacturas = mov.usadoEn.filter(fk => fk !== factura.facturaKey);
                      const yaUsado = otrasFacturas.length > 0;
                      const yaEnEstaFactura = mov.usadoEn.includes(factura.facturaKey);
                      return (
                        <button key={mov.movementKey} onClick={() => !yaEnEstaFactura && handleSelectMovimiento(mov)} disabled={yaEnEstaFactura}
                          className={`w-full text-left px-2 py-2 rounded text-xs hover:bg-muted transition-colors ${yaEnEstaFactura ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                          data-testid={`option-movimiento-${mov.movementKey}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-muted-foreground">{mov.fecha}</span>
                                <BancoBadge banco={mov.banco} />
                                {yaUsado && !yaEnEstaFactura && <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">Ya usado</span>}
                                {yaEnEstaFactura && <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-gray-100 text-gray-500">Ya agregado</span>}
                              </div>
                              <div className="truncate text-foreground">{mov.detalle}</div>
                            </div>
                            <span className="shrink-0 font-semibold text-green-600 dark:text-green-400">{formatCLP(mov.monto)}</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </TabsContent>
              <TabsContent value="nota" className="mt-0 p-3 space-y-2">
                <Textarea placeholder="Escribe una nota sobre el pago de esta factura..." value={notaText} onChange={e => setNotaText(e.target.value)} className="text-xs resize-none" rows={3} data-testid="textarea-nota-libre" />
                <Button size="sm" className="w-full h-8 text-xs" onClick={handleAgregarNota} disabled={!notaText.trim()} data-testid="button-guardar-nota">Agregar nota</Button>
              </TabsContent>
            </Tabs>
          </PopoverContent>
        </Popover>
    </div>
  );
}

// --- Quick-create cliente modal ---
interface QuickCreateClienteProps {
  open: boolean;
  onClose: () => void;
  initialNombre: string;
  initialRut: string;
  onCreated: () => void;
}

function QuickCreateClienteModal({ open, onClose, initialNombre, initialRut, onCreated }: QuickCreateClienteProps) {
  const { toast } = useToast();
  const [nombre, setNombre] = useState(initialNombre);
  const [rut, setRut] = useState(initialRut);
  const [email, setEmail] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/clientes", {
        nombre: nombre.trim(),
        rut: rut.trim() || null,
        emails: email.trim() ? [email.trim()] : [],
        telefono: null,
        notas: null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clientes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/facturas-revision"] });
      toast({ title: "Cliente creado", description: `${nombre} fue creado correctamente.` });
      onClose();
      onCreated();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Crear cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label className="text-xs">Nombre *</Label>
            <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del cliente" data-testid="input-qc-nombre" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">RUT</Label>
            <Input value={rut} onChange={e => setRut(e.target.value)} placeholder="12.345.678-9" data-testid="input-qc-rut" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@ejemplo.com" data-testid="input-qc-email" />
          </div>
        </div>
        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" onClick={onClose} data-testid="button-qc-cancel">Cancelar</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!nombre.trim() || createMutation.isPending} data-testid="button-qc-save">
            {createMutation.isPending ? "Guardando..." : "Crear cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Add email to existing cliente modal ---
interface AddEmailModalProps {
  open: boolean;
  onClose: () => void;
  clienteId: string;
  clienteNombre: string;
  currentEmails: string[];
  onUpdated: () => void;
}

function AddEmailModal({ open, onClose, clienteId, clienteNombre, currentEmails, onUpdated }: AddEmailModalProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");

  const updateMutation = useMutation({
    mutationFn: async () => {
      const newEmails = [...currentEmails.filter(Boolean), email.trim()].filter(Boolean);
      const res = await apiRequest("PUT", `/api/clientes/${clienteId}`, { emails: newEmails });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clientes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/facturas-revision"] });
      toast({ title: "Email agregado", description: `Email añadido a ${clienteNombre}.` });
      setEmail("");
      onClose();
      onUpdated();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Agregar email a {clienteNombre}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label className="text-xs">Email *</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@ejemplo.com" data-testid="input-add-email" />
          </div>
        </div>
        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" onClick={onClose} data-testid="button-add-email-cancel">Cancelar</Button>
          <Button onClick={() => updateMutation.mutate()} disabled={!email.trim() || updateMutation.isPending} data-testid="button-add-email-save">
            {updateMutation.isPending ? "Guardando..." : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Email send modal ---
interface EmailModalProps {
  open: boolean;
  onClose: () => void;
  factura: FacturaRow;
  onSent: () => void;
}

function buildSaludo(factura: FacturaRow): string {
  const nombre = factura.clienteNombre?.trim();
  const empresa = factura.cliente?.trim();
  if (nombre && empresa && nombre.toLowerCase() !== empresa.toLowerCase()) {
    return `${nombre} (${empresa})`;
  }
  return nombre || empresa || "cliente";
}

function buildDefaultCuerpo(factura: FacturaRow): string {
  const saludo = `Estimado/a ${buildSaludo(factura)},`;
  const linea1 = `Le informamos que tenemos pendiente el pago de la factura N° ${factura.nDocumento}.`;
  const linea2 = `Le agradecemos gestionar su pago a la brevedad posible. Si ya realizó el pago, por favor ignore este mensaje.`;
  const cierre = `Atentamente,\nBrika SpA`;
  return [saludo, linea1, linea2, cierre].join("\n\n");
}

function EmailModal({ open, onClose, factura, onSent }: EmailModalProps) {
  const { toast } = useToast();
  const numeroAviso = (factura.emailLogs?.length ?? 0) + 1;
  const defaultAsunto = `Cobranza — Factura N° ${factura.nDocumento}`;
  const [asunto, setAsunto] = useState(defaultAsunto);
  const [cuerpo, setCuerpo] = useState(() => buildDefaultCuerpo(factura));
  const [showPreview, setShowPreview] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);

  const sendMutation = useMutation({
    mutationFn: async (payload: { testEmail?: string }) => {
      const res = await apiRequest("POST", "/api/email/send", {
        facturaKey: factura.facturaKey,
        clienteId: factura.clienteId,
        destinatarios: factura.clienteEmails,
        asunto,
        cuerpo,
        numeroAviso,
        nDocumento: factura.nDocumento,
        montoDocumento: factura.montoDocumento,
        fechaEmision: factura.fechaEmision,
        clienteNombre: factura.clienteNombre || factura.cliente,
        testEmail: payload.testEmail || undefined,
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Error al enviar"); }
      return res.json();
    },
    onSuccess: (data, vars) => {
      if (vars.testEmail) {
        toast({ title: "Email de prueba enviado", description: `Email enviado a ${vars.testEmail}` });
        setTestSending(false);
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/facturas-revision"] });
        toast({ title: "Email enviado", description: `Email enviado a: ${factura.clienteEmails.join(", ")}` });
        onSent();
        onClose();
      }
    },
    onError: (e: any) => {
      setTestSending(false);
      toast({ title: "Error al enviar", description: e.message, variant: "destructive" });
    },
  });

  const handleTestSend = () => {
    if (!testEmail.trim()) return;
    setTestSending(true);
    sendMutation.mutate({ testEmail: testEmail.trim() });
  };

  const previewHtml = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:6px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#4a7c59;padding:20px 24px;">
        <div style="color:#fff;font-weight:700;font-size:18px;">Brika</div>
        <div style="color:rgba(255,255,255,0.75);font-size:12px;margin-top:2px;">Aviso de cobranza</div>
      </div>
      <div style="padding:24px;">
        ${cuerpo.split("\n").map(l => l.trim() ? `<p style="margin:0 0 10px;color:#374151;font-size:14px;">${l}</p>` : "").join("")}
        <div style="background:#f3f4f6;border-radius:6px;padding:16px;margin-top:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="font-size:13px;color:#6b7280;">N° Doc.</span><span style="font-size:13px;font-weight:600;">${factura.nDocumento}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="font-size:13px;color:#6b7280;">Fecha</span><span style="font-size:13px;">${factura.fechaEmision}</span></div>
          <div style="display:flex;justify-content:space-between;border-top:1px solid #e5e7eb;padding-top:10px;margin-top:6px;"><span style="font-size:13px;font-weight:600;">Total</span><span style="font-size:14px;font-weight:700;color:#4a7c59;">${formatCLP(factura.montoDocumento)}</span></div>
        </div>
      </div>
    </div>`;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Enviar email — Factura N° {factura.nDocumento}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="flex gap-1.5 flex-wrap">
            {(factura.clienteEmails || []).map((e, i) => (
              <Badge key={i} variant="secondary" className="text-xs gap-1">
                <Mail className="h-3 w-3" />
                {e}
              </Badge>
            ))}
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium">Asunto</Label>
            <Input value={asunto} onChange={e => setAsunto(e.target.value)} className="text-sm" data-testid="input-email-asunto" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Cuerpo del email</Label>
              </div>
              <Textarea
                value={cuerpo}
                onChange={e => setCuerpo(e.target.value)}
                rows={10}
                className="text-xs resize-none font-mono"
                data-testid="textarea-email-cuerpo"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                <Label className="text-xs font-medium">Vista previa</Label>
              </div>
              <div
                className="rounded-md border bg-white overflow-y-auto"
                style={{ minHeight: "240px", maxHeight: "280px" }}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
                data-testid="div-email-preview"
              />
            </div>
          </div>

          {/* Test send */}
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Envío de prueba</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                placeholder="tu@email.com"
                className="text-sm flex-1"
                data-testid="input-test-email"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestSend}
                disabled={!testEmail.trim() || testSending || sendMutation.isPending}
                className="gap-1.5 shrink-0"
                data-testid="button-send-test"
              >
                {testSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Enviar prueba
              </Button>
            </div>
          </div>

          {/* Email history */}
          {factura.emailLogs?.length > 0 && (
            <div className="rounded-md border p-3 space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Historial de avisos enviados</Label>
              {factura.emailLogs.map(log => (
                <div key={log.id} className="text-xs flex items-center gap-2 text-muted-foreground" data-testid={`email-log-${log.id}`}>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{avisoLabel(log.numeroAviso)}</Badge>
                  <span>{new Date(log.enviadoAt).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="truncate">{log.destinatarios.join(", ")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" onClick={onClose} data-testid="button-email-cancel">Cancelar</Button>
          <Button
            onClick={() => sendMutation.mutate({})}
            disabled={!asunto.trim() || !cuerpo.trim() || factura.clienteEmails.length === 0 || sendMutation.isPending}
            className="gap-2"
            data-testid="button-email-send"
          >
            {sendMutation.isPending && !testSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar a {factura.clienteEmails.length > 0 ? factura.clienteEmails.join(", ") : "destinatarios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- ClienteCell component (name/rut + micro-actions only, no email button) ---
interface ClienteCellProps {
  factura: FacturaRow;
  onCreateCliente: (factura: FacturaRow) => void;
  onAddEmail: (factura: FacturaRow) => void;
}

function ClienteCell({ factura, onCreateCliente, onAddEmail }: ClienteCellProps) {
  const hasCliente = !!factura.clienteId;
  const hasEmails = (factura.clienteEmails?.length ?? 0) > 0;

  return (
    <div className="space-y-0.5">
      <div className="text-sm font-medium" data-testid={`text-cliente-nombre-${factura.nDocumento}`}>
        {factura.clienteNombre || factura.cliente || "—"}
      </div>
      {hasCliente && hasEmails && (
        <div className="text-xs text-muted-foreground truncate max-w-[180px]">{factura.clienteEmails[0]}</div>
      )}
      <div className="flex flex-wrap gap-1 mt-1">
        {!hasCliente && (
          <button
            onClick={() => onCreateCliente(factura)}
            className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            data-testid={`button-crear-cliente-${factura.nDocumento}`}
          >
            <UserPlus className="h-3 w-3" />
            Crear cliente
          </button>
        )}
        {hasCliente && !hasEmails && (
          <button
            onClick={() => onAddEmail(factura)}
            className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            data-testid={`button-agregar-email-${factura.nDocumento}`}
          >
            <Mail className="h-3 w-3" />
            Agregar email
          </button>
        )}
      </div>
    </div>
  );
}

// Shared hover-popover helpers used by EmailActionCell
function useHoverPopover() {
  const [open, setOpen] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onEnter = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    openTimer.current = setTimeout(() => setOpen(true), 120);
  };
  const onLeave = () => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
    closeTimer.current = setTimeout(() => setOpen(false), 100);
  };

  return { open, setOpen, onEnter, onLeave };
}

// Shared history popover content
function EmailHistoryContent({ logs }: { logs: EmailLogEntry[] }) {
  return (
    <>
      <div className="font-semibold text-foreground mb-2 flex items-center gap-1.5">
        <Mail className="h-3.5 w-3.5 text-primary" />
        Emails enviados ({logs.length})
      </div>
      <div className="space-y-2">
        {logs.map((log) => (
          <div key={log.id} className="rounded-md bg-muted/50 px-2.5 py-2 space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium">
                {avisoLabel(log.numeroAviso)}
              </Badge>
              <span className="text-muted-foreground text-[10px]">
                {new Date(log.enviadoAt).toLocaleDateString("es-CL", {
                  day: "2-digit", month: "2-digit", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>
            </div>
            <div className="text-muted-foreground truncate">{log.destinatarios.join(", ")}</div>
          </div>
        ))}
      </div>
    </>
  );
}

// --- EmailActionCell — dedicated column for email send / history ---
interface EmailActionCellProps {
  factura: FacturaRow;
  onOpenEmail: (factura: FacturaRow) => void;
}

function EmailActionCell({ factura, onOpenEmail }: EmailActionCellProps) {
  const isPendiente = factura.estado !== "pagado";
  const hasCliente = !!factura.clienteId;
  const hasEmails = (factura.clienteEmails?.length ?? 0) > 0;
  const logs = factura.emailLogs ?? [];
  const hasHistory = logs.length > 0;

  const { open, setOpen, onEnter, onLeave } = useHoverPopover();

  // No cliente linked → nothing to show
  if (!hasCliente) return null;

  // Factura pagada — show history only if available
  if (!isPendiente) {
    if (!hasHistory) return null;
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
            data-testid={`button-historial-email-${factura.nDocumento}`}
          >
            <Mail className="h-3.5 w-3.5" />
            {logs.length} {logs.length === 1 ? "email enviado" : "emails enviados"}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-72 p-3 text-xs"
          side="bottom"
          align="start"
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          <EmailHistoryContent logs={logs} />
        </PopoverContent>
      </Popover>
    );
  }

  // Factura pendiente, no email configured → disabled + tooltip
  if (!hasEmails) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {/* wrapper span so disabled button still receives mouse events */}
          <span
            className="inline-flex"
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
            data-testid={`span-email-disabled-${factura.nDocumento}`}
          >
            <button
              disabled
              className="inline-flex items-center text-[11px] font-medium px-2 py-1 rounded bg-muted/50 text-muted-foreground/50 cursor-not-allowed select-none"
              data-testid={`button-email-disabled-${factura.nDocumento}`}
            >
              Enviar email de cobranza
            </button>
          </span>
        </PopoverTrigger>
        <PopoverContent
          className="w-64 p-3 text-xs"
          side="top"
          align="start"
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          <div className="flex items-start gap-2 text-muted-foreground">
            <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
            <span>Agrega email del cliente para poder enviar el mail de cobranza.</span>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // Factura pendiente, has email → active button, optional history on hover
  return (
    <Popover open={hasHistory && open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={() => onOpenEmail(factura)}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all shadow-sm"
          data-testid={`button-enviar-email-${factura.nDocumento}`}
        >
          Enviar email de cobranza
        </button>
      </PopoverTrigger>
      {hasHistory && (
        <PopoverContent
          className="w-72 p-3 text-xs"
          side="bottom"
          align="start"
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          <EmailHistoryContent logs={logs} />
        </PopoverContent>
      )}
    </Popover>
  );
}

function getDefaultDates() {
  const now = new Date();
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { desde: fmt(firstOfLastMonth), hasta: fmt(lastOfLastMonth) };
}

function BsaleCobranzaSyncPanel() {
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
      const res = await apiRequest("POST", "/api/bsale/sync-cobranza", { desde, hasta });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/facturas-revision"] });
      if (data.insertadas === 0 && data.duplicadas === 0) {
        toast({ title: "Sin datos", description: data.message || "No se encontraron documentos en el período seleccionado." });
      } else {
        toast({ title: "Sincronización completada", description: `${data.insertadas.toLocaleString("es-CL")} documentos importados${data.duplicadas > 0 ? `, ${data.duplicadas.toLocaleString("es-CL")} duplicados omitidos` : ""}.` });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error de sincronización", description: error.message || "No se pudo conectar con BSale.", variant: "destructive" });
    },
  });

  if (!bsaleStatus) return null;

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
      <button className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors rounded-lg" onClick={() => setExpanded(!expanded)} data-testid="button-toggle-bsale-cobranza-sync">
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
                  <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="pl-8 h-9 w-40 text-sm" data-testid="input-bsale-cobranza-desde" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Hasta</label>
                <div className="relative">
                  <CalendarIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="pl-8 h-9 w-40 text-sm" data-testid="input-bsale-cobranza-hasta" />
                </div>
              </div>
              <Button onClick={() => syncMutation.mutate()} disabled={!desde || !hasta || syncMutation.isPending} size="sm" className="gap-2" data-testid="button-bsale-cobranza-sync">
                {syncMutation.isPending ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Sincronizando…</> : <><RefreshCw className="h-3.5 w-3.5" />Sincronizar</>}
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

function ImportEstadoPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ matched: number; noMatch: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
    setError(null);
  }

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/cobranza/import-estado", { method: "POST", body: formData });
      const contentType = res.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      if (!res.ok) {
        if (res.status === 401 || res.status === 403 || !isJson) throw new Error("Sesión expirada. Recarga la página e intenta de nuevo.");
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || data.message || `Error ${res.status}`);
      }
      if (!isJson) throw new Error("Sesión expirada. Recarga la página e intenta de nuevo.");
      const data = await res.json();
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/facturas-revision"] });
    } catch (err: any) {
      setError(err.message || "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-card-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Importar estados de pago desde Excel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Sube el Excel con columnas <span className="font-mono text-xs">FACTURA, ESTADO</span>. Las filas con ESTADO="OK" se marcarán como pagadas. Boletas con prefijo "B" (ej: "B 237") son detectadas automáticamente.
        </p>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} data-testid="button-select-import-estado-file">
            <Upload className="h-4 w-4 mr-2" />Seleccionar archivo
          </Button>
          {file && <span className="text-sm text-muted-foreground truncate max-w-xs">{file.name}</span>}
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} data-testid="input-import-estado-file" />
        </div>
        {file && (
          <Button size="sm" onClick={handleImport} disabled={loading} data-testid="button-run-import-estado">
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Procesando...</> : "Marcar como pagadas"}
          </Button>
        )}
        {result && (
          <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 space-y-1" data-testid="import-estado-result">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium text-sm mb-2">
              <CheckCircle2 className="h-4 w-4" />
              Importación completada — {result.total} documentos procesados
            </div>
            <p className="text-xs text-muted-foreground">Marcadas como pagado: <span className="font-semibold text-foreground">{result.matched}</span></p>
            <p className="text-xs text-muted-foreground">No encontradas en cobranza: <span className="font-semibold text-foreground">{result.noMatch}</span></p>
          </div>
        )}
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 flex items-center gap-2 text-red-700 dark:text-red-400 text-sm" data-testid="import-estado-error">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface FacturaTableRowProps {
  factura: FacturaRow;
  movimientosDisponibles: MovimientoDisponible[];
  toast: ReturnType<typeof useToast>["toast"];
  onDelete: (facturaKey: string, propuestaId: string) => void;
  onAdd: (facturaKey: string, tipo: "movimiento" | "nota", cartolaMovementKey?: string, notaManual?: string) => void;
  onRejectAutoMatch: (facturaKey: string, cartolaMovementKey: string) => void;
  onTogglePagado: (factura: FacturaRow) => void;
  onCreateCliente: (value: FacturaRow | null) => void;
  onAddEmail: (value: FacturaRow | null) => void;
  onOpenEmail: (value: FacturaRow | null) => void;
}

const FacturaTableRow = memo(function FacturaTableRow({
  factura, movimientosDisponibles, toast, onDelete, onAdd, onRejectAutoMatch, onTogglePagado, onCreateCliente, onAddEmail, onOpenEmail,
}: FacturaTableRowProps) {
  const isPagado = factura.estado === "pagado";
  return (
    <TableRow
      data-testid={`row-factura-${factura.nDocumento}`}
      className={isPagado ? "bg-green-50/80 dark:bg-green-950/20" : undefined}
    >
      <TableCell className="text-xs">
        <Badge variant="outline" className="text-xs font-normal">{factura.tipoDocumento}</Badge>
      </TableCell>
      <TableCell className="text-sm font-medium" data-testid={`text-ndoc-${factura.nDocumento}`}>
        {factura.nDocumento}
      </TableCell>
      <TableCell className="py-2 align-top">
        <ClienteCell factura={factura} onCreateCliente={onCreateCliente} onAddEmail={onAddEmail} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{factura.fechaEmision}</TableCell>
      <TableCell className="text-sm text-right tabular-nums text-muted-foreground">{formatCLP(factura.montoNeto)}</TableCell>
      <TableCell className="text-sm text-right tabular-nums font-medium">{formatCLP(factura.montoDocumento)}</TableCell>
      <TableCell className="py-2 align-top">
        <PropuestaPagoCell factura={factura} onDelete={onDelete} onAdd={onAdd} onRejectAutoMatch={onRejectAutoMatch} movimientosDisponibles={movimientosDisponibles} toast={toast} />
      </TableCell>
      <TableCell className="py-2 align-top">
        <EmailActionCell factura={factura} onOpenEmail={onOpenEmail} />
      </TableCell>
      <TableCell><EstadoBadge estado={factura.estado} /></TableCell>
      <TableCell>
        <button type="button" role="switch" aria-checked={isPagado} onClick={() => onTogglePagado(factura)}
          data-testid={`button-pagado-${factura.nDocumento}`}
          className={`inline-flex items-center gap-1 px-1 py-0.5 rounded-full transition-colors duration-300 focus:outline-none ${isPagado ? "bg-green-600" : "bg-gray-400 dark:bg-zinc-600"}`}>
          <span className="w-4 h-4 rounded-full bg-white shadow-md shrink-0" />
          <span className="text-[10px] font-bold text-white leading-none pr-0.5">{isPagado ? "Sí" : "No"}</span>
        </button>
      </TableCell>
    </TableRow>
  );
});

export default function FacturasRevisionPage() {
  const { user } = useAuth();
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroMeses, setFiltroMeses] = useState<string[]>([]);
  const [filtroNombre, setFiltroNombre] = useState<string>("");
  const [revertirFactura, setRevertirFactura] = useState<FacturaRow | null>(null);
  const { toast } = useToast();

  // Modal states
  const [createClienteFactura, setCreateClienteFactura] = useState<FacturaRow | null>(null);
  const [addEmailFactura, setAddEmailFactura] = useState<FacturaRow | null>(null);
  const [emailFactura, setEmailFactura] = useState<FacturaRow | null>(null);

  const { data: facturas = [], isLoading } = useQuery<FacturaRow[]>({
    queryKey: ["/api/facturas-revision"],
    queryFn: async () => {
      const res = await fetch("/api/facturas-revision", { credentials: "include" });
      if (!res.ok) throw new Error("Error al obtener facturas");
      return res.json();
    },
  });

  const { data: movimientosDisponibles = [] } = useQuery<MovimientoDisponible[]>({
    queryKey: ["/api/facturas-revision/movimientos"],
    staleTime: 5 * 60 * 1000,
  });

  const estadoMutation = useMutation({
    mutationFn: async ({ facturaKey, estado, cartolaMovementKey }: { facturaKey: string; estado: string; cartolaMovementKey?: string }) => {
      return apiRequest("POST", `/api/facturas-revision/${encodeURIComponent(facturaKey)}`, { estado, cartolaMovementKey });
    },
    onMutate: async ({ facturaKey, estado }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/facturas-revision"] });
      const snapshot = queryClient.getQueryData<FacturaRow[]>(["/api/facturas-revision"]);
      queryClient.setQueryData<FacturaRow[]>(["/api/facturas-revision"], (old) =>
        old ? old.map(f => f.facturaKey === facturaKey ? { ...f, estado } : f) : old
      );
      return { snapshot };
    },
    onError: (err: unknown, _vars: unknown, context: { snapshot?: FacturaRow[] } | undefined) => {
      if (context?.snapshot) queryClient.setQueryData(["/api/facturas-revision"], context.snapshot);
      const msg = err instanceof Error ? err.message : undefined;
      toast({ title: "Error", description: msg || "No se pudo actualizar la factura", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/facturas-revision"] });
    },
  });

  const addPropuestaMutation = useMutation({
    mutationFn: async ({ facturaKey, tipo, cartolaMovementKey, notaManual }: { facturaKey: string; tipo: "movimiento" | "nota"; cartolaMovementKey?: string; notaManual?: string }) => {
      return apiRequest("POST", `/api/facturas-revision/${encodeURIComponent(facturaKey)}/propuestas`, { tipo, cartolaMovementKey: cartolaMovementKey ?? null, notaManual: notaManual ?? null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/facturas-revision"] });
      queryClient.invalidateQueries({ queryKey: ["/api/facturas-revision/movimientos"] });
      toast({ title: "Propuesta agregada", description: "La propuesta de pago fue guardada correctamente." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "No se pudo agregar la propuesta", variant: "destructive" });
    },
  });

  const deletePropuestaMutation = useMutation({
    mutationFn: async ({ facturaKey, id }: { facturaKey: string; id: string }) => {
      return apiRequest("DELETE", `/api/facturas-revision/${encodeURIComponent(facturaKey)}/propuestas/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/facturas-revision"] });
      queryClient.invalidateQueries({ queryKey: ["/api/facturas-revision/movimientos"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "No se pudo eliminar la propuesta", variant: "destructive" });
    },
  });

  const handleTogglePagado = useCallback((factura: FacturaRow) => {
    if (factura.estado === "pagado") {
      setRevertirFactura(factura);
    } else {
      const firstMovimiento = (factura.propuestas ?? []).find(p => p.tipo === "movimiento" && p.cartolaMovementKey);
      const cartolaMovementKey = firstMovimiento?.cartolaMovementKey ?? factura.matchCartola?.movementKey;
      estadoMutation.mutate({ facturaKey: factura.facturaKey, estado: "pagado", cartolaMovementKey });
      toast({ title: "Factura pagada", description: `Nº ${factura.nDocumento} marcada como pagada` });
    }
  }, [estadoMutation.mutate, setRevertirFactura, toast]);

  const handleConfirmarRevertir = useCallback(() => {
    if (!revertirFactura) return;
    estadoMutation.mutate({ facturaKey: revertirFactura.facturaKey, estado: "pendiente" });
    toast({ title: "Factura pendiente", description: `Nº ${revertirFactura.nDocumento} marcada como pendiente` });
    setRevertirFactura(null);
  }, [revertirFactura, estadoMutation.mutate, toast]);

  const handleAddPropuesta = useCallback((facturaKey: string, tipo: "movimiento" | "nota", cartolaMovementKey?: string, notaManual?: string) => {
    addPropuestaMutation.mutate({ facturaKey, tipo, cartolaMovementKey, notaManual });
  }, [addPropuestaMutation.mutate]);

  const handleDeletePropuesta = useCallback((facturaKey: string, id: string) => {
    deletePropuestaMutation.mutate({ facturaKey, id });
  }, [deletePropuestaMutation.mutate]);

  const rejectAutoMatchMutation = useMutation({
    mutationFn: async ({ facturaKey, cartolaMovementKey }: { facturaKey: string; cartolaMovementKey: string }) => {
      return apiRequest("POST", `/api/facturas-revision/${encodeURIComponent(facturaKey)}/reject-automatch`, { cartolaMovementKey });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/facturas-revision"] });
      queryClient.invalidateQueries({ queryKey: ["/api/facturas-revision/movimientos"] });
      toast({ title: "Recomendación descartada", description: "La sugerencia automática fue descartada." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "No se pudo descartar la recomendación", variant: "destructive" });
    },
  });

  const handleRejectAutoMatch = useCallback((facturaKey: string, cartolaMovementKey: string) => {
    rejectAutoMatchMutation.mutate({ facturaKey, cartolaMovementKey });
  }, [rejectAutoMatchMutation.mutate]);

  const mesesDisponibles = useMemo(() =>
    [...new Set(facturas.map(f => mesFromISO(f.fechaEmision)).filter(Boolean))].sort().reverse()
  , [facturas]);

  const filtradas = useMemo(() => facturas
    .filter(f => {
      if (filtroEstado === "pagado" && f.estado !== "pagado") return false;
      if (filtroEstado === "pendiente" && f.estado === "pagado") return false;
      if (filtroTipo !== "todos" && f.tipoDocumento !== filtroTipo) return false;
      if (filtroMeses.length > 0 && !filtroMeses.includes(mesFromISO(f.fechaEmision))) return false;
      if (filtroNombre.trim()) {
        const q = filtroNombre.trim().toLowerCase();
        const nombre = (f.clienteNombre || f.cliente || "").toLowerCase();
        if (!nombre.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const byDate = b.fechaEmision.localeCompare(a.fechaEmision);
      if (byDate !== 0) return byDate;
      return String(b.nDocumento).localeCompare(String(a.nDocumento), undefined, { numeric: true });
    })
  , [facturas, filtroEstado, filtroTipo, filtroMeses, filtroNombre]);

  const total = filtradas.length;
  const pagadas = useMemo(() => filtradas.filter(f => f.estado === "pagado").length, [filtradas]);
  const pendientes = useMemo(() => filtradas.filter(f => f.estado !== "pagado").length, [filtradas]);

  return (
    <div className="p-6 space-y-6 max-w-full mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <FileCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-facturas-revision-title">Cobranza</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Controla el estado de pago de tus facturas cruzando con la cartola</p>
          </div>
        </div>
        {filtradas.length > 0 && (
          <Button variant="outline" size="sm" className="gap-2" data-testid="button-download-cobranza"
            onClick={() => {
              const DOWNLOAD_COLS = [
                { key: "nDocumento", label: "N° Doc." }, { key: "tipoDocumento", label: "Tipo Documento" },
                { key: "cliente", label: "Cliente" }, { key: "rutCliente", label: "RUT" },
                { key: "fechaEmision", label: "Fecha Emisión" }, { key: "montoNeto", label: "Monto Neto" },
                { key: "montoDocumento", label: "Monto Documento" }, { key: "estado", label: "Estado" },
                { key: "fechaPago", label: "Fecha Pago" }, { key: "montoPago", label: "Monto Pago" }, { key: "banco", label: "Banco" },
              ];
              const data = filtradas.map(f => {
                const primerMovimiento = (f.propuestas ?? []).find(p => p.tipo === "movimiento");
                return {
                  nDocumento: f.nDocumento, tipoDocumento: f.tipoDocumento, cliente: f.clienteNombre || f.cliente, rutCliente: f.rutCliente,
                  fechaEmision: f.fechaEmision, montoNeto: f.montoNeto, montoDocumento: f.montoDocumento, estado: f.estado,
                  fechaPago: primerMovimiento?.fecha ?? f.matchCartola?.fecha ?? "",
                  montoPago: primerMovimiento?.monto ?? f.matchCartola?.monto ?? "",
                  banco: primerMovimiento?.banco ?? f.matchCartola?.banco ?? "",
                };
              });
              downloadAsXlsx(data, DOWNLOAD_COLS, "cobranza");
            }}>
            <Download className="h-4 w-4" />Descargar xlsx
          </Button>
        )}
      </div>

      <BsaleCobranzaSyncPanel />
      {user?.email === "natyjelen@gmail.com" && <ImportEstadoPanel />}

      <Card className="border-card-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Mes</Label>
              <MonthFilter availableMonths={mesesDisponibles} selectedMonths={filtroMeses} onChange={setFiltroMeses} label="Todos los meses" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tipo documento</Label>
              <Select value={filtroTipo} onValueChange={setFiltroTipo} data-testid="select-tipo-filter">
                <SelectTrigger className="h-8 text-sm" data-testid="select-tipo-trigger"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="FACTURA ELECTRÓNICA">Factura</SelectItem>
                  <SelectItem value="BOLETA ELECTRÓNICA">Boleta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Estado</Label>
              <Select value={filtroEstado} onValueChange={setFiltroEstado} data-testid="select-estado-filter">
                <SelectTrigger className="h-8 text-sm" data-testid="select-estado-trigger"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pagado">Pagado</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nombre cliente</Label>
              <Input
                value={filtroNombre}
                onChange={e => setFiltroNombre(e.target.value)}
                placeholder="Buscar por nombre..."
                className="h-8 text-sm"
                data-testid="input-filtro-nombre"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 text-sm" data-testid="badge-total">
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Total:</span>
          <span className="font-semibold">{total}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-50 dark:bg-green-900/20 text-sm" data-testid="badge-pagadas">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <span className="text-green-700 dark:text-green-300">Pagadas:</span>
          <span className="font-semibold text-green-800 dark:text-green-200">{pagadas}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 text-sm" data-testid="badge-pendientes">
          <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
          <span className="text-red-700 dark:text-red-300">Pendientes:</span>
          <span className="font-semibold text-red-800 dark:text-red-200">{pendientes}</span>
        </div>
      </div>

      <Card className="border-card-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold" data-testid="text-facturas-table-title">
            Facturas ({filtradas.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : facturas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileCheck className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Sin facturas disponibles</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Sube un archivo de Cobranza para ver las facturas</p>
            </div>
          ) : filtradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-muted-foreground">No hay facturas con este estado</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-semibold min-w-[130px]">Tipo Doc.</TableHead>
                    <TableHead className="text-xs font-semibold min-w-[70px]">Nº Doc.</TableHead>
                    <TableHead className="text-xs font-semibold min-w-[200px]">Cliente</TableHead>
                    <TableHead className="text-xs font-semibold min-w-[90px]">Fecha Emisión</TableHead>
                    <TableHead className="text-xs font-semibold text-right min-w-[110px]">Monto Neto</TableHead>
                    <TableHead className="text-xs font-semibold text-right min-w-[110px]">Monto Total</TableHead>
                    <TableHead className="text-xs font-semibold min-w-[180px]">Transferencia de pago</TableHead>
                    <TableHead className="text-xs font-semibold min-w-[160px]">Email</TableHead>
                    <TableHead className="text-xs font-semibold min-w-[100px]">Estado</TableHead>
                    <TableHead className="text-xs font-semibold min-w-[60px]">Pagado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.map(factura => (
                    <FacturaTableRow
                      key={factura.facturaKey}
                      factura={factura}
                      movimientosDisponibles={movimientosDisponibles}
                      toast={toast}
                      onDelete={handleDeletePropuesta}
                      onAdd={handleAddPropuesta}
                      onRejectAutoMatch={handleRejectAutoMatch}
                      onTogglePagado={handleTogglePagado}
                      onCreateCliente={setCreateClienteFactura}
                      onAddEmail={setAddEmailFactura}
                      onOpenEmail={setEmailFactura}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={revertirFactura !== null} onOpenChange={(open) => { if (!open) setRevertirFactura(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cambiar estado a Pendiente?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás cambiando el estado de la factura Nº <strong>{revertirFactura?.nDocumento}</strong> de <strong>Pagada</strong> a <strong>Pendiente</strong>. ¿Deseas continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmarRevertir}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quick create cliente modal */}
      {createClienteFactura && (
        <QuickCreateClienteModal
          open={true}
          onClose={() => setCreateClienteFactura(null)}
          initialNombre={createClienteFactura.cliente}
          initialRut={createClienteFactura.rutCliente}
          onCreated={() => setCreateClienteFactura(null)}
        />
      )}

      {/* Add email to cliente modal */}
      {addEmailFactura && addEmailFactura.clienteId && (
        <AddEmailModal
          open={true}
          onClose={() => setAddEmailFactura(null)}
          clienteId={addEmailFactura.clienteId}
          clienteNombre={addEmailFactura.clienteNombre || addEmailFactura.cliente}
          currentEmails={addEmailFactura.clienteEmails}
          onUpdated={() => setAddEmailFactura(null)}
        />
      )}

      {/* Email send modal */}
      {emailFactura && (
        <EmailModal
          open={true}
          onClose={() => setEmailFactura(null)}
          factura={emailFactura}
          onSent={() => setEmailFactura(null)}
        />
      )}
    </div>
  );
}
