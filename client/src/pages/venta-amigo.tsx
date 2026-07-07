import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Heart, Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MonthFilter, mesFromISO } from "@/components/month-filter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface VentaAmigo {
  id: number;
  fechaRegistro: string;
  fechaCompra: string;
  nombre: string;
  monto: number;
  unidades: number;
  costoProducto: number | null;
  estado: string;
}

type FormData = { fechaCompra: string; nombre: string; monto: string; unidades: string; costoProducto: string };

function formatCLP(value: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
}

function formatFecha(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return isoStr;
  }
}

const emptyForm: FormData = { fechaCompra: "", nombre: "", monto: "", unidades: "", costoProducto: "" };

function ventaToForm(v: VentaAmigo): FormData {
  return {
    fechaCompra: v.fechaCompra,
    nombre: v.nombre,
    monto: String(v.monto),
    unidades: String(v.unidades),
    costoProducto: v.costoProducto != null ? String(v.costoProducto) : "",
  };
}

function formatMargen(monto: number, costo: number | null): { text: string; className: string } {
  if (costo == null) return { text: "—", className: "text-muted-foreground" };
  if (monto === 0) return { text: "—", className: "text-muted-foreground" };
  const margen = ((monto - costo) / monto) * 100;
  const text = `${margen.toFixed(1).replace(".", ",")}%`;
  const className = margen < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400";
  return { text, className };
}

export default function VentaAmigoPage() {
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [filtroMeses, setFiltroMeses] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editando, setEditando] = useState<VentaAmigo | null>(null);
  const [eliminarVenta, setEliminarVenta] = useState<VentaAmigo | null>(null);
  const [revertirVenta, setRevertirVenta] = useState<VentaAmigo | null>(null);
  const [confirmarPagoSinCosto, setConfirmarPagoSinCosto] = useState<VentaAmigo | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const { toast } = useToast();

  const { data: ventas = [], isLoading } = useQuery<VentaAmigo[]>({
    queryKey: ["/api/ventas-amigo"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { fechaCompra: string; nombre: string; monto: number; unidades: number; costoProducto: number }) => {
      return apiRequest("POST", "/api/ventas-amigo", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ventas-amigo"] });
      toast({ title: "Venta registrada", description: "La venta amigo fue creada correctamente." });
      setCreateOpen(false);
      setFormData(emptyForm);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "No se pudo crear la venta", variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { fechaCompra: string; nombre: string; monto: number; unidades: number; costoProducto: number } }) => {
      return apiRequest("PUT", `/api/ventas-amigo/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ventas-amigo"] });
      toast({ title: "Venta actualizada", description: "Los cambios fueron guardados." });
      setEditando(null);
      setFormData(emptyForm);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "No se pudo actualizar la venta", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/ventas-amigo/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ventas-amigo"] });
      toast({ title: "Venta eliminada", description: "La venta fue eliminada correctamente." });
      setEliminarVenta(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "No se pudo eliminar la venta", variant: "destructive" });
    },
  });

  const estadoMutation = useMutation({
    mutationFn: async ({ id, estado }: { id: number; estado: string }) => {
      return apiRequest("PATCH", `/api/ventas-amigo/${id}/estado`, { estado });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ventas-amigo"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "No se pudo actualizar el estado", variant: "destructive" });
    },
  });

  const marcarComoPagada = (venta: VentaAmigo) => {
    estadoMutation.mutate({ id: venta.id, estado: "pagado" });
    toast({ title: "Venta pagada", description: `${venta.nombre} marcada como pagada` });
  };

  const handleTogglePagado = (venta: VentaAmigo) => {
    if (venta.estado === "pagado") {
      setRevertirVenta(venta);
    } else if (!venta.costoProducto || venta.costoProducto <= 0) {
      setConfirmarPagoSinCosto(venta);
    } else {
      marcarComoPagada(venta);
    }
  };

  const handleConfirmarPagoSinCosto = () => {
    if (!confirmarPagoSinCosto) return;
    marcarComoPagada(confirmarPagoSinCosto);
    setConfirmarPagoSinCosto(null);
  };

  const handleConfirmarRevertir = () => {
    if (!revertirVenta) return;
    estadoMutation.mutate({ id: revertirVenta.id, estado: "pendiente" });
    toast({ title: "Venta pendiente", description: `${revertirVenta.nombre} marcada como pendiente` });
    setRevertirVenta(null);
  };

  const validateAndSubmit = (mode: "create" | "edit") => {
    const monto = parseInt(formData.monto, 10);
    const unidades = parseInt(formData.unidades, 10);
    const costoProducto = parseInt(formData.costoProducto, 10);
    if (
      !formData.fechaCompra ||
      !formData.nombre.trim() ||
      isNaN(monto) ||
      isNaN(unidades) ||
      unidades < 1 ||
      isNaN(costoProducto) ||
      costoProducto < 0
    ) {
      toast({ title: "Error", description: "Completa todos los campos correctamente", variant: "destructive" });
      return;
    }
    const payload = { fechaCompra: formData.fechaCompra, nombre: formData.nombre.trim(), monto, unidades, costoProducto };
    if (mode === "create") {
      createMutation.mutate(payload);
    } else if (editando) {
      editMutation.mutate({ id: editando.id, data: payload });
    }
  };

  const mesesDisponibles = useMemo(() =>
    [...new Set(ventas.map(v => mesFromISO(v.fechaCompra)).filter(Boolean))].sort()
  , [ventas]);

  const filtradas = useMemo(() =>
    ventas
      .filter(v => {
        if (filtroEstado !== "todos" && v.estado !== filtroEstado) return false;
        if (filtroMeses.length > 0 && !filtroMeses.includes(mesFromISO(v.fechaCompra))) return false;
        return true;
      })
      .sort((a, b) => b.id - a.id)
  , [ventas, filtroEstado, filtroMeses]);

  const total = ventas.length;
  const pagadas = ventas.filter(v => v.estado === "pagado").length;
  const pendientes = ventas.filter(v => v.estado !== "pagado").length;
  const pagadasSinCosto = ventas.filter(v => v.estado === "pagado" && v.costoProducto == null).length;

  const renderVentaForm = (_mode: "create" | "edit") => (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label htmlFor="fechaCompra">Fecha compra</Label>
        <Input
          id="fechaCompra"
          type="date"
          value={formData.fechaCompra}
          onChange={e => setFormData(prev => ({ ...prev, fechaCompra: e.target.value }))}
          data-testid="input-fecha-compra"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nombre">Nombre</Label>
        <Input
          id="nombre"
          placeholder="Nombre del comprador"
          value={formData.nombre}
          onChange={e => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
          data-testid="input-nombre"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="monto">Monto (CLP)</Label>
        <Input
          id="monto"
          type="number"
          placeholder="0"
          value={formData.monto}
          onChange={e => setFormData(prev => ({ ...prev, monto: e.target.value }))}
          data-testid="input-monto"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="costoProducto">Costo producto (CLP)</Label>
        <Input
          id="costoProducto"
          type="number"
          placeholder="0"
          min="0"
          value={formData.costoProducto}
          onChange={e => setFormData(prev => ({ ...prev, costoProducto: e.target.value }))}
          data-testid="input-costo-producto"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="unidades">Unidades</Label>
        <Input
          id="unidades"
          type="number"
          placeholder="1"
          min="1"
          value={formData.unidades}
          onChange={e => setFormData(prev => ({ ...prev, unidades: e.target.value }))}
          data-testid="input-unidades"
        />
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-full mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <Heart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-venta-amigo-title">Venta amigo</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Registra ventas directas a amigos sin factura</p>
          </div>
        </div>
        <Button
          className="gap-2"
          onClick={() => { setFormData(emptyForm); setCreateOpen(true); }}
          data-testid="button-nueva-venta-amigo"
        >
          <Plus className="h-4 w-4" />
          Nueva venta amigo
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-muted-foreground">Total ventas</p>
            <p className="text-2xl font-bold" data-testid="text-total-ventas">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-muted-foreground">Pagadas</p>
            <p className="text-2xl font-bold text-green-600" data-testid="text-pagadas">{pagadas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-muted-foreground">Pendientes</p>
            <p className="text-2xl font-bold text-red-600" data-testid="text-pendientes">{pendientes}</p>
          </CardContent>
        </Card>
      </div>

      {pagadasSinCosto > 0 && (
        <div
          className="flex items-start gap-2 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
          data-testid="alert-ventas-sin-costo"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <span>
            Hay <strong data-testid="text-pagadas-sin-costo">{pagadasSinCosto}</strong>{" "}
            {pagadasSinCosto === 1 ? "venta pagada sin costo registrado" : "ventas pagadas sin costo registrado"}.
            Estas ventas se contabilizan con costo 0 en el Estado de Resultados, lo que puede inflar la utilidad. Edítalas para asignar el costo correcto.
          </span>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-lg">Registro de ventas</CardTitle>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="space-y-1 w-48">
                <Label className="text-xs text-muted-foreground">Mes</Label>
                <MonthFilter
                  availableMonths={mesesDisponibles}
                  selectedMonths={filtroMeses}
                  onChange={setFiltroMeses}
                  className="h-8"
                />
              </div>
              <div className="space-y-1 w-40">
                <Label className="text-xs text-muted-foreground">Estado</Label>
                <Select value={filtroEstado} onValueChange={setFiltroEstado} data-testid="select-estado-filter">
                  <SelectTrigger className="h-8 text-sm" data-testid="select-estado-trigger">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="pagado">Pagado</SelectItem>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtradas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Heart className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay ventas registradas</p>
              <p className="text-xs mt-1">Haz clic en "Nueva venta amigo" para agregar una</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-semibold min-w-[120px]">Fecha registro</TableHead>
                    <TableHead className="text-xs font-semibold min-w-[120px]">Fecha compra</TableHead>
                    <TableHead className="text-xs font-semibold min-w-[150px]">Nombre</TableHead>
                    <TableHead className="text-xs font-semibold text-right min-w-[110px]">Monto</TableHead>
                    <TableHead className="text-xs font-semibold text-right min-w-[110px]">Costo</TableHead>
                    <TableHead className="text-xs font-semibold text-right min-w-[90px]">Margen</TableHead>
                    <TableHead className="text-xs font-semibold text-center min-w-[80px]">Unidades</TableHead>
                    <TableHead className="text-xs font-semibold min-w-[130px]">Estado</TableHead>
                    <TableHead className="text-xs font-semibold w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.map(venta => {
                    const isPagado = venta.estado === "pagado";
                    const sinCosto = isPagado && venta.costoProducto == null;
                    const margen = formatMargen(venta.monto, venta.costoProducto);
                    return (
                      <TableRow
                        key={venta.id}
                        data-testid={`row-venta-${venta.id}`}
                        className={sinCosto ? "bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-100/60 dark:hover:bg-amber-950/30" : undefined}
                      >
                        <TableCell className="text-sm text-muted-foreground">
                          {formatFecha(venta.fechaRegistro)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {venta.fechaCompra}
                        </TableCell>
                        <TableCell className="text-sm font-medium" data-testid={`text-nombre-${venta.id}`}>
                          {venta.nombre}
                        </TableCell>
                        <TableCell className="text-sm text-right tabular-nums font-medium">
                          {formatCLP(venta.monto)}
                        </TableCell>
                        <TableCell className="text-sm text-right tabular-nums" data-testid={`text-costo-${venta.id}`}>
                          {venta.costoProducto != null ? (
                            formatCLP(venta.costoProducto)
                          ) : sinCosto ? (
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium cursor-help"
                                    data-testid={`badge-sin-costo-${venta.id}`}
                                  >
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    Sin costo
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-xs text-xs">
                                  Esta venta está pagada pero no tiene costo registrado. Se contabiliza como costo 0 en el Estado de Resultados.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className={`text-sm text-right tabular-nums font-medium ${margen.className}`} data-testid={`text-margen-${venta.id}`}>
                          {margen.text}
                        </TableCell>
                        <TableCell className="text-sm text-center tabular-nums">
                          {venta.unidades}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isPagado}
                            disabled={estadoMutation.isPending}
                            onClick={() => handleTogglePagado(venta)}
                            data-testid={`button-pagado-${venta.id}`}
                            className={`relative inline-flex items-center h-7 w-[112px] rounded-full px-1 transition-colors duration-300 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                              isPagado
                                ? "bg-green-600"
                                : "bg-gray-200 dark:bg-zinc-700"
                            }`}
                          >
                            <span className={`absolute inset-0 flex items-center text-xs font-medium select-none ${
                              isPagado ? "justify-end pr-2.5 text-white" : "justify-start pl-2.5 text-gray-500 dark:text-zinc-400"
                            }`}>
                              {isPagado ? "Pagado" : "Pendiente"}
                            </span>
                            <span className={`relative z-10 inline-block w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                              isPagado ? "translate-x-0" : "translate-x-[84px]"
                            }`} />
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => { setEditando(venta); setFormData(ventaToForm(venta)); }}
                              data-testid={`button-edit-${venta.id}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setEliminarVenta(venta)}
                              data-testid={`button-delete-${venta.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva venta amigo</DialogTitle>
          </DialogHeader>
          {renderVentaForm("create")}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} data-testid="button-cancelar-venta">
              Cancelar
            </Button>
            <Button
              onClick={() => validateAndSubmit("create")}
              disabled={createMutation.isPending}
              data-testid="button-guardar-venta"
            >
              {createMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editando !== null} onOpenChange={(open) => { if (!open) { setEditando(null); setFormData(emptyForm); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar venta amigo</DialogTitle>
          </DialogHeader>
          {renderVentaForm("edit")}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditando(null); setFormData(emptyForm); }} data-testid="button-cancelar-edicion">
              Cancelar
            </Button>
            <Button
              onClick={() => validateAndSubmit("edit")}
              disabled={editMutation.isPending}
              data-testid="button-guardar-edicion"
            >
              {editMutation.isPending ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={revertirVenta !== null} onOpenChange={(open) => { if (!open) setRevertirVenta(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cambiar estado a Pendiente?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás cambiando el estado de la venta de <strong>{revertirVenta?.nombre}</strong> de <strong>Pagada</strong> a <strong>Pendiente</strong>. ¿Deseas continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmarRevertir}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmarPagoSinCosto !== null} onOpenChange={(open) => { if (!open) setConfirmarPagoSinCosto(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Marcar como pagada sin costo?</AlertDialogTitle>
            <AlertDialogDescription>
              La venta de <strong>{confirmarPagoSinCosto?.nombre}</strong> no tiene costo de producto registrado. Si la marcas como pagada, se contabilizará en el Estado de Resultados con costo 0, lo que puede inflar la utilidad. ¿Deseas continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancelar-pago-sin-costo">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmarPagoSinCosto} data-testid="button-confirmar-pago-sin-costo">
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={eliminarVenta !== null} onOpenChange={(open) => { if (!open) setEliminarVenta(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar venta?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás por eliminar la venta de <strong>{eliminarVenta?.nombre}</strong> por <strong>{eliminarVenta ? formatCLP(eliminarVenta.monto) : ""}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => eliminarVenta && deleteMutation.mutate(eliminarVenta.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirmar-eliminar"
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
