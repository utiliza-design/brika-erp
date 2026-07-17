import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { UserPlus, Users, Pencil, KeyRound } from "lucide-react";

interface AppUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  invitedBy: string | null;
  invitedAt: string | null;
  lastLoginAt: string | null;
}

interface CurrentUser {
  id: string;
  email: string;
  role: string;
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  }
  return email[0].toUpperCase();
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Activo</Badge>;
  if (status === "invited") return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Invitado</Badge>;
  if (status === "revoked") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Revocado</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function UsuariosPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("user");
  const [inviteOpen, setInviteOpen] = useState(false);

  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [editRole, setEditRole] = useState<string>("user");
  const [editOpen, setEditOpen] = useState(false);

  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [tempPasswordUser, setTempPasswordUser] = useState<AppUser | null>(null);
  const [tempOpen, setTempOpen] = useState(false);


  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["/api/me"],
    retry: false,
  });

  const { data: users = [], isLoading } = useQuery<AppUser[]>({
    queryKey: ["/api/app-users"],
    retry: false,
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; name: string; role: string }) => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al agregar usuario");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/app-users"] });
      setTempPasswordUser(data.user);
      setTempPassword(data.temporaryPassword);
      setTempOpen(true);
      toast({ title: "Usuario agregado", description: "El usuario ha sido creado con clave temporal" });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("user");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/app-users/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al actualizar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/app-users"] });
      toast({ title: "Acceso actualizado" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const res = await fetch(`/api/app-users/${id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al actualizar rol");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/app-users"] });
      toast({ title: "Rol actualizado" });
      setEditOpen(false);
      setEditUser(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/app-users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al eliminar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/app-users"] });
      toast({ title: "Usuario eliminado" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/users/${id}/reset-password`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Error al restablecer contraseña");
      }
      return res.json();
    },
    onSuccess: (data, id) => {
      const user = users.find((u) => u.id === id);
      setTempPasswordUser(user || null);
      setTempPassword(data.temporaryPassword);
      setTempOpen(true);
      toast({ title: "Contraseña restablecida", description: "Se ha generado una clave temporal" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });


  if (currentUser && currentUser.role !== "admin") {
    setLocation("/");
    return null;
  }

  const openEdit = (user: AppUser) => {
    setEditUser(user);
    setEditRole(user.role);
    setEditOpen(true);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-gray-600" />
          <div>
            <h1 className="text-2xl font-bold">Gestión de Usuarios</h1>
            <p className="text-sm text-muted-foreground">{users.length} usuario{users.length !== 1 ? "s" : ""} registrados</p>
          </div>
        </div>

        <Dialog open={inviteOpen} onOpenChange={(open) => { if (!open) { setInviteOpen(false); setInviteEmail(""); setInviteName(""); setInviteRole("user"); } else setInviteOpen(true); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-invite-user" className="gap-2">
              <UserPlus className="h-4 w-4" />
              Agregar usuario
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agregar usuario</DialogTitle>
              <DialogDescription>
                Crea un nuevo usuario en la plataforma. Se le generará una clave temporal que deberá cambiar al iniciar sesión.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="invite-name">Nombre</Label>
                <Input
                  id="invite-name"
                  type="text"
                  placeholder="Nombre del usuario"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  data-testid="input-invite-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Correo Electrónico</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  data-testid="input-invite-email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Rol</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger id="invite-role" data-testid="select-invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuario</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setInviteOpen(false); setInviteEmail(""); setInviteName(""); setInviteRole("user"); }}>Cancelar</Button>
              <Button
                onClick={() => inviteMutation.mutate({ email: inviteEmail, name: inviteName, role: inviteRole })}
                disabled={!inviteEmail || !inviteName || inviteMutation.isPending}
                data-testid="button-confirm-invite"
              >
                {inviteMutation.isPending ? "Creando..." : "Crear Usuario"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={editOpen} onOpenChange={(open) => { if (!open) { setEditOpen(false); setEditUser(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>
              Cambia el rol de <strong>{editUser?.name || editUser?.email}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <p className="text-sm text-muted-foreground">{editUser?.email}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-role">Rol</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger id="edit-role" data-testid="select-edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuario</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              {editRole === "admin" && (
                <p className="text-xs text-muted-foreground">
                  Los admins pueden gestionar usuarios, crear y eliminar accesos.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditOpen(false); setEditUser(null); }}>Cancelar</Button>
            <Button
              onClick={() => editUser && roleMutation.mutate({ id: editUser.id, role: editRole })}
              disabled={!editUser || roleMutation.isPending || editRole === editUser?.role}
              data-testid="button-confirm-edit-role"
            >
              {roleMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left p-3 font-medium">Usuario</th>
              <th className="text-left p-3 font-medium">Rol</th>
              <th className="text-left p-3 font-medium">Estado</th>
              <th className="text-left p-3 font-medium hidden md:table-cell">Último acceso</th>
              <th className="text-left p-3 font-medium hidden lg:table-cell">Invitado por</th>
              <th className="text-right p-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">Cargando...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">No hay usuarios</td>
              </tr>
            ) : (
              users.map((user) => {
                const isCurrentUser = user.email === currentUser?.email;
                return (
                  <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-user-${user.id}`}>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="text-xs bg-gray-200">
                            {getInitials(user.name, user.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{user.name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="capitalize text-muted-foreground">{user.role === "admin" ? "Admin" : "Usuario"}</span>
                    </td>
                    <td className="p-3">
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground">
                      {formatDate(user.lastLoginAt)}
                    </td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">
                      {user.invitedBy || "—"}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-2">
                        {!isCurrentUser && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => openEdit(user)}
                            data-testid={`button-edit-${user.id}`}
                          >
                            <Pencil className="h-3 w-3" />
                            Editar
                          </Button>
                        )}

                        {!isCurrentUser && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50"
                                disabled={resetPasswordMutation.isPending}
                                data-testid={`button-reset-password-${user.id}`}
                              >
                                <KeyRound className="h-3 w-3" />
                                Restablecer
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Restablecer contraseña?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Se generará una clave temporal para <strong>{user.name || user.email}</strong> y se le obligará a cambiarla en su próximo inicio de sesión. La contraseña actual quedará invalidada de inmediato.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => resetPasswordMutation.mutate(user.id)}
                                >
                                  Restablecer
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}

                        {user.status !== "revoked" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            disabled={isCurrentUser || statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: user.id, status: "revoked" })}
                            data-testid={`button-revoke-${user.id}`}
                          >
                            Revocar
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            disabled={isCurrentUser || statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: user.id, status: "active" })}
                            data-testid={`button-reactivate-${user.id}`}
                          >
                            Reactivar
                          </Button>
                        )}

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              disabled={isCurrentUser}
                              data-testid={`button-delete-${user.id}`}
                            >
                              Eliminar
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Se eliminará el acceso de <strong>{user.email}</strong> permanentemente. Esta acción no se puede deshacer.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 hover:bg-red-700"
                                onClick={() => deleteMutation.mutate(user.id)}
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={tempOpen} onOpenChange={(open) => { if (!open) { setTempOpen(false); setTempPassword(null); setTempPasswordUser(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Clave Temporal</DialogTitle>
            <DialogDescription>
              Se ha generado una contraseña temporal para <strong>{tempPasswordUser?.name || tempPasswordUser?.email}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800 space-y-2">
              <p className="font-semibold">⚠️ IMPORTANTE:</p>
              <p>Esta contraseña solo se mostrará <strong>una vez</strong>. Cópiala ahora y entrégala al usuario por un canal seguro (WhatsApp, en persona, etc.).</p>
            </div>
            
            <div className="flex items-center gap-3">
              <Input
                readOnly
                value={tempPassword || ""}
                className="font-mono text-lg text-center tracking-wider bg-gray-50 h-12"
              />
              <Button
                onClick={() => {
                  if (tempPassword) {
                    navigator.clipboard.writeText(tempPassword);
                    toast({ title: "Copiado", description: "Clave temporal copiada al portapapeles" });
                  }
                }}
              >
                Copiar
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => { setTempOpen(false); setTempPassword(null); setTempPasswordUser(null); }}>Cerrar y Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
