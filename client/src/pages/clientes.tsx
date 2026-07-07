import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Users, Plus, Pencil, Trash2, X, Sparkles, Mail, Loader2, Download, MailPlus, UserPlus, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Cliente {
  id: string;
  nombre: string;
  razonSocial: string | null;
  rut: string | null;
  emails: string[];
  telefono: string | null;
  nombreContacto: string | null;
  notas: string | null;
  createdAt: string;
}


const EMPTY_FORM = {
  nombre: "",
  razonSocial: "",
  rut: "",
  emails: [""],
  telefono: "",
  notas: "",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

interface LookupResult {
  nombre: string;
  rut: string | null;
  emails: string[];
}

function ClienteForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial: typeof EMPTY_FORM;
  onSave: (data: typeof EMPTY_FORM) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runLookup = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q || q.length < 2) { setLookupResult(null); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clientes/lookup?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data: LookupResult | null = await res.json();
          if (data) {
            setForm(f => {
              const filled: typeof EMPTY_FORM = { ...f };
              if (!f.nombre.trim() && data.nombre) filled.nombre = data.nombre;
              if (!f.rut.trim() && data.rut) filled.rut = data.rut;
              const hasEmails = f.emails.some(e => e.trim());
              if (!hasEmails && data.emails.length > 0) filled.emails = data.emails;
              const changed = filled.nombre !== f.nombre || filled.rut !== f.rut || filled.emails !== f.emails;
              if (changed) setLookupResult(data);
              return filled;
            });
          } else {
            setLookupResult(null);
          }
        }
      } catch { setLookupResult(null); }
    }, 500);
  };

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const setField = (field: keyof typeof EMPTY_FORM, value: string) => {
    setForm(f => ({ ...f, [field]: value }));
    if (field === "rut" || field === "nombre") runLookup(value);
  };

  const setEmail = (i: number, val: string) =>
    setForm(f => { const emails = [...f.emails]; emails[i] = val; return { ...f, emails }; });

  const addEmail = () => setForm(f => ({ ...f, emails: [...f.emails, ""] }));

  const removeEmail = (i: number) =>
    setForm(f => ({ ...f, emails: f.emails.filter((_, idx) => idx !== i) }));

  return (
    <div className="space-y-4">
      {lookupResult && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" data-testid="banner-autofill-ventas">
          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-muted-foreground">
            Campos autocompletados con datos de ventas para <strong>{lookupResult.nombre}</strong>
          </span>
          <button
            type="button"
            onClick={() => setLookupResult(null)}
            className="ml-auto text-muted-foreground hover:text-foreground"
            data-testid="button-dismiss-autofill"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="nombre" className="text-sm font-medium">Nombre *</Label>
        <Input
          id="nombre"
          value={form.nombre}
          onChange={e => setField("nombre", e.target.value)}
          placeholder="Nombre del cliente"
          data-testid="input-cliente-nombre"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="razonSocial" className="text-sm font-medium">Razón Social</Label>
        <Input
          id="razonSocial"
          value={form.razonSocial}
          onChange={e => setField("razonSocial", e.target.value)}
          placeholder="Razón social (empresas)"
          data-testid="input-cliente-razon-social"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rut" className="text-sm font-medium">RUT</Label>
        <Input
          id="rut"
          value={form.rut}
          onChange={e => setField("rut", e.target.value)}
          placeholder="12.345.678-9"
          data-testid="input-cliente-rut"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Emails</Label>
        <div className="space-y-2">
          {form.emails.map((email, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={email}
                onChange={e => setEmail(i, e.target.value)}
                placeholder="email@ejemplo.com"
                type="email"
                data-testid={`input-cliente-email-${i}`}
              />
              {form.emails.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={() => removeEmail(i)}
                  data-testid={`button-remove-email-${i}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={addEmail}
            data-testid="button-add-email"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Agregar email
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="telefono" className="text-sm font-medium">Teléfono</Label>
        <Input
          id="telefono"
          value={form.telefono}
          onChange={e => setField("telefono", e.target.value)}
          placeholder="+56 9 1234 5678"
          data-testid="input-cliente-telefono"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notas" className="text-sm font-medium">Notas</Label>
        <Textarea
          id="notas"
          value={form.notas}
          onChange={e => setField("notas", e.target.value)}
          placeholder="Notas adicionales..."
          rows={3}
          data-testid="input-cliente-notas"
        />
      </div>
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel-cliente">
          Cancelar
        </Button>
        <Button
          onClick={() => onSave(form)}
          disabled={isPending || !form.nombre.trim()}
          data-testid="button-save-cliente"
        >
          {isPending ? "Guardando..." : "Guardar"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function ClientesPage() {
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Cliente | null>(null);
  const [backfillConfirmOpen, setBackfillConfirmOpen] = useState(false);
  const [backfillContactosConfirmOpen, setBackfillContactosConfirmOpen] = useState(false);
  const [syncNombresConfirmOpen, setSyncNombresConfirmOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: clientes = [], isLoading } = useQuery<Cliente[]>({
    queryKey: ["/api/clientes"],
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) =>
      apiRequest("POST", "/api/clientes", {
        nombre: data.nombre,
        razonSocial: data.razonSocial || null,
        rut: data.rut || null,
        emails: data.emails.filter(Boolean),
        telefono: data.telefono || null,
        notas: data.notas || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clientes"] });
      setModalOpen(false);
      setEditingCliente(null);
      toast({ title: "Cliente creado correctamente" });
    },
    onError: (e: any) => toast({ title: "Error al crear cliente", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof EMPTY_FORM }) =>
      apiRequest("PUT", `/api/clientes/${id}`, {
        nombre: data.nombre,
        razonSocial: data.razonSocial || null,
        rut: data.rut || null,
        emails: data.emails.filter(Boolean),
        telefono: data.telefono || null,
        notas: data.notas || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clientes"] });
      setEditingCliente(null);
      toast({ title: "Cliente actualizado correctamente" });
    },
    onError: (e: any) => toast({ title: "Error al actualizar cliente", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/clientes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clientes"] });
      setDeleteConfirm(null);
      toast({ title: "Cliente eliminado" });
    },
    onError: (e: any) => toast({ title: "Error al eliminar cliente", description: e.message, variant: "destructive" }),
  });

  const backfillEmailsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/clientes/backfill-emails", {});
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Error al recuperar emails"); }
      return res.json() as Promise<{ updated: number; skippedNoMatch: number; skippedHadEmail: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clientes"] });
      setBackfillConfirmOpen(false);
      toast({
        title: `${data.updated} clientes actualizados / ${data.skippedNoMatch} sin email recuperable`,
        description: `${data.skippedHadEmail} ya tenían email y no fueron modificados.`,
      });
    },
    onError: (e: any) => toast({ title: "Error al recuperar emails", description: e.message, variant: "destructive" }),
  });

  const backfillContactosMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/clientes/backfill-contactos", {});
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Error al recuperar contactos"); }
      return res.json() as Promise<{ updated: number; skippedNoBSale: number; skippedNoRut: number; skippedHadContacto: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clientes"] });
      setBackfillContactosConfirmOpen(false);
      toast({
        title: `${data.updated} contactos actualizados / ${data.skippedNoBSale} sin contacto en BSale`,
        description: `${data.skippedHadContacto} ya tenían contacto, ${data.skippedNoRut} sin RUT.`,
      });
    },
    onError: (e: any) => toast({ title: "Error al recuperar contactos", description: e.message, variant: "destructive" }),
  });

  const syncNombresMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/clientes/sync-nombres-bsale", {});
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Error al corregir nombres"); }
      return res.json() as Promise<{ updated: number; alreadyCorrect: number; skippedNoBSale: number; skippedNoRut: number; skippedNoCompany: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clientes"] });
      setSyncNombresConfirmOpen(false);
      toast({
        title: `${data.updated} nombres corregidos · ${data.alreadyCorrect} ya estaban bien`,
        description: `${data.skippedNoCompany} personas naturales · ${data.skippedNoBSale} sin match en BSale · ${data.skippedNoRut} sin RUT.`,
      });
    },
    onError: (e: any) => toast({ title: "Error al corregir nombres", description: e.message, variant: "destructive" }),
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/clientes/seed", {});
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Error al poblar clientes"); }
      return res.json() as Promise<{ created: number; skipped: number; total: number; backfilled?: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clientes"] });
      const backfillNote = typeof data.backfilled === "number" && data.backfilled > 0
        ? ` · ${data.backfilled} emails recuperados`
        : "";
      toast({
        title: `${data.created} clientes importados`,
        description: `${data.created} nuevos · ${data.skipped} ya existían · ${data.total} candidatos en total${backfillNote}`,
      });
    },
    onError: (e: any) => toast({ title: "Error al poblar clientes", description: e.message, variant: "destructive" }),
  });

  const filteredClientes = clientes.filter(c => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.nombre.toLowerCase().includes(q) ||
      (c.razonSocial && c.razonSocial.toLowerCase().includes(q)) ||
      (c.rut && c.rut.toLowerCase().includes(q)) ||
      c.emails.some(e => e.toLowerCase().includes(q)) ||
      (c.telefono && c.telefono.toLowerCase().includes(q)) ||
      (c.nombreContacto && c.nombreContacto.toLowerCase().includes(q))
    );
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-clientes-title">Clientes</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Gestiona la información de tus clientes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setBackfillConfirmOpen(true)}
            disabled={backfillEmailsMutation.isPending}
            data-testid="button-backfill-emails"
          >
            {backfillEmailsMutation.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Recuperando...</>
              : <><MailPlus className="h-4 w-4 mr-2" />Recuperar emails desde ventas</>}
          </Button>
          <Button
            variant="outline"
            onClick={() => setBackfillContactosConfirmOpen(true)}
            disabled={backfillContactosMutation.isPending}
            data-testid="button-backfill-contactos"
          >
            {backfillContactosMutation.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Recuperando...</>
              : <><UserPlus className="h-4 w-4 mr-2" />Recuperar contactos desde BSale</>}
          </Button>
          <Button
            variant="outline"
            onClick={() => setSyncNombresConfirmOpen(true)}
            disabled={syncNombresMutation.isPending}
            data-testid="button-sync-nombres-bsale"
          >
            {syncNombresMutation.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Corrigiendo...</>
              : <><Building2 className="h-4 w-4 mr-2" />Corregir nombres desde BSale</>}
          </Button>
          <Button
            variant="outline"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            data-testid="button-poblar-clientes"
          >
            {seedMutation.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando...</>
              : <><Download className="h-4 w-4 mr-2" />Poblar desde datos</>}
          </Button>
          <Button onClick={() => { setEditingCliente(null); setModalOpen(true); }} data-testid="button-crear-cliente">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo cliente
          </Button>
        </div>
      </div>

      <Card className="border-card-border">
        <CardContent className="p-4">
          <div className="mb-4">
            <Input
              placeholder="Buscar por nombre, RUT o email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-w-sm"
              data-testid="input-search-clientes"
            />
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Cargando...</div>
          ) : filteredClientes.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              {search ? "No se encontraron clientes con ese criterio" : "Aún no hay clientes. Crea el primero."}
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground">Nombre</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground">Contacto</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground">RUT</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground">Emails</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground">Teléfono</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground">Creado</th>
                    <th className="px-4 py-3 font-semibold text-xs text-muted-foreground text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClientes.map(c => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`row-cliente-${c.id}`}>
                      <td className="px-4 py-3 font-medium">{c.nombre}</td>
                      <td className="px-4 py-3 text-muted-foreground" data-testid={`text-nombre-contacto-${c.id}`}>
                        {c.nombreContacto || <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{c.rut || <span className="text-muted-foreground/50">—</span>}</td>
                      <td className="px-4 py-3">
                        {c.emails.length === 0 ? (
                          <span className="text-muted-foreground/50">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {c.emails.map((e, i) => (
                              <span key={i} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                {e}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{c.telefono || <span className="text-muted-foreground/50">—</span>}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(c.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setEditingCliente(c)}
                            data-testid={`button-edit-cliente-${c.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteConfirm(c)}
                            data-testid={`button-delete-cliente-${c.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog
        open={modalOpen || editingCliente !== null}
        onOpenChange={open => {
          if (!open) { setModalOpen(false); setEditingCliente(null); }
        }}
      >
        <DialogContent className="sm:max-w-md" data-testid="dialog-cliente">
          <DialogHeader>
            <DialogTitle>
              {editingCliente ? (editingCliente.id === "__new__" ? "Crear cliente" : "Editar cliente") : "Nuevo cliente"}
            </DialogTitle>
          </DialogHeader>
          <ClienteForm
            initial={
              editingCliente
                ? {
                    nombre: editingCliente.nombre,
                    razonSocial: editingCliente.razonSocial || "",
                    rut: editingCliente.rut || "",
                    emails: editingCliente.emails.length > 0 ? editingCliente.emails : [""],
                    telefono: editingCliente.telefono || "",
                    notas: editingCliente.notas || "",
                  }
                : EMPTY_FORM
            }
            onSave={data => {
              if (editingCliente && editingCliente.id !== "__new__") {
                updateMutation.mutate({ id: editingCliente.id, data });
              } else {
                createMutation.mutate(data);
              }
            }}
            onCancel={() => { setModalOpen(false); setEditingCliente(null); }}
            isPending={createMutation.isPending || updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={open => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará a <strong>{deleteConfirm?.nombre}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-cliente"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sync nombres BSale confirmation */}
      <AlertDialog open={syncNombresConfirmOpen} onOpenChange={open => { if (!open && !syncNombresMutation.isPending) setSyncNombresConfirmOpen(false); }}>
        <AlertDialogContent data-testid="dialog-sync-nombres-bsale">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Corregir nombres desde BSale?</AlertDialogTitle>
            <AlertDialogDescription>
              Para cada cliente con RUT, se consultará a BSale y si tiene una empresa registrada (<em>razón social</em>), se actualizará el campo "Nombre" con el nombre de la empresa.
              El nombre de persona que tenía anteriormente pasará a ser el "Contacto" (si no tenía uno ya).
              Los clientes que son personas naturales <strong>no serán modificados</strong>.
              Esta acción puede tardar varios segundos porque consulta el API de BSale por cada cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={syncNombresMutation.isPending} data-testid="button-cancel-sync-nombres">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); syncNombresMutation.mutate(); }}
              disabled={syncNombresMutation.isPending}
              data-testid="button-confirm-sync-nombres"
            >
              {syncNombresMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Corrigiendo...</>
                : "Corregir nombres"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Backfill contactos confirmation */}
      <AlertDialog open={backfillContactosConfirmOpen} onOpenChange={open => { if (!open && !backfillContactosMutation.isPending) setBackfillContactosConfirmOpen(false); }}>
        <AlertDialogContent data-testid="dialog-backfill-contactos">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Recuperar contactos desde BSale?</AlertDialogTitle>
            <AlertDialogDescription>
              Para cada cliente con RUT, se consultará a BSale el nombre y apellido del contacto registrado y se guardará en la columna "Contacto".
              Los clientes que ya tengan un contacto <strong>no serán modificados</strong>.
              Esta acción puede tardar varios segundos porque consulta el API de BSale por cada cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={backfillContactosMutation.isPending} data-testid="button-cancel-backfill-contactos">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); backfillContactosMutation.mutate(); }}
              disabled={backfillContactosMutation.isPending}
              data-testid="button-confirm-backfill-contactos"
            >
              {backfillContactosMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Recuperando...</>
                : "Recuperar contactos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Backfill emails confirmation */}
      <AlertDialog open={backfillConfirmOpen} onOpenChange={open => { if (!open && !backfillEmailsMutation.isPending) setBackfillConfirmOpen(false); }}>
        <AlertDialogContent data-testid="dialog-backfill-emails">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Recuperar emails desde ventas?</AlertDialogTitle>
            <AlertDialogDescription>
              Se buscará en el historial de ventas el email más frecuente para cada cliente sin email,
              cruzando por RUT. Los clientes que ya tengan email <strong>no serán modificados</strong>.
              Esta acción puede tardar unos segundos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={backfillEmailsMutation.isPending} data-testid="button-cancel-backfill">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); backfillEmailsMutation.mutate(); }}
              disabled={backfillEmailsMutation.isPending}
              data-testid="button-confirm-backfill-emails"
            >
              {backfillEmailsMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Recuperando...</>
                : "Recuperar emails"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
