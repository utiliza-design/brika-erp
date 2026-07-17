import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, Lock, LogOut } from "lucide-react";

export default function CambioClaveObligatorioPage() {
  const { logout, isLoggingOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMsg("Por favor, completa todos los campos.");
      return;
    }

    if (newPassword.length < 8) {
      setErrorMsg("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("La nueva contraseña y su confirmación no coinciden.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/account/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (response.ok) {
        toast({
          title: "Contraseña actualizada",
          description: "Tu contraseña ha sido cambiada y ahora tienes acceso completo.",
        });

        // Forzar actualización de la consulta de sesión para que el AuthGuard vuelva a evaluar mustChangePassword
        await queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      } else {
        const errData = await response.json().catch(() => ({}));
        setErrorMsg(errData.message || "Error al intentar cambiar la contraseña. Verifica tu clave temporal.");
      }
    } catch (err) {
      console.error("Error changing password:", err);
      setErrorMsg("Error de red. No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md space-y-6">
        <Card className="shadow-lg border-red-100">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold text-gray-900">Cambio Obligatorio</CardTitle>
                <CardDescription>Debes cambiar tu contraseña para continuar</CardDescription>
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Estás usando una clave temporal provista por el administrador o una cuenta nueva. Por seguridad, define una contraseña propia de al menos 8 caracteres.
            </p>
          </CardHeader>
          <CardContent>
            {errorMsg && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Contraseña Temporal / Actual</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="currentPassword"
                    type="password"
                    className="pl-9"
                    placeholder="Contraseña actual"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">Nueva Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="newPassword"
                    type="password"
                    className="pl-9"
                    placeholder="Mínimo 8 caracteres"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Nueva Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    className="pl-9"
                    placeholder="Mínimo 8 caracteres"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <Button type="submit" disabled={loading} className="flex-1 h-11">
                  {loading ? "Guardando..." : "Guardar y Entrar"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => logout()}
                  disabled={isLoggingOut}
                  className="h-11 gap-2 text-muted-foreground hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
