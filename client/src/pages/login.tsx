import React, { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] || "");
  const isDenied = params.get("denied") === "true";
  const isRevoked = params.get("revoked") === "true";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg("Por favor, completa todos los campos.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: email,
          password: password,
        }),
      });

      if (response.ok) {
        toast({
          title: "Acceso exitoso",
          description: "Redirigiendo a la plataforma...",
        });
        // Forzamos recarga de página para refrescar el estado de sesión
        window.location.href = "/";
      } else {
        const errData = await response.json().catch(() => ({}));
        setErrorMsg(errData.message || "Credenciales inválidas o acceso no autorizado.");
        setPassword(""); // Limpiar input de contraseña por seguridad
      }
    } catch (err) {
      console.error("Login error:", err);
      setErrorMsg("Error de red. No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Panel Izquierdo Informativo */}
      <div className="hidden lg:flex lg:w-1/2 bg-gray-900 flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-8 w-8 text-white" />
          <span className="text-white text-xl font-bold tracking-tight">Brika</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Gestión financiera<br />inteligente para<br />tu empresa
          </h1>
          <p className="text-gray-400 text-lg">
            Centraliza cartolas, facturas y ventas en un solo lugar. Analiza costos, revisa facturas y toma decisiones con datos reales.
          </p>
        </div>
        <p className="text-gray-600 text-sm">© 2026 Brika. Todos los derechos reservados.</p>
      </div>

      {/* Panel Derecho Formulario */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <FileSpreadsheet className="h-6 w-6 text-gray-900" />
            <span className="text-gray-900 text-lg font-bold">Brika</span>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Bienvenido</h2>
          <p className="text-gray-500 mb-8">
            Ingresa tus credenciales para acceder a la plataforma.
          </p>

          {isDenied && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700 font-medium">Acceso no autorizado</p>
              <p className="text-sm text-red-600 mt-1">
                Tu cuenta no tiene acceso a esta aplicación. Contacta al administrador para recibir una invitación.
              </p>
            </div>
          )}

          {isRevoked && (
            <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-sm text-orange-700 font-medium">Acceso revocado</p>
              <p className="text-sm text-orange-600 mt-1">
                Tu acceso ha sido revocado. Contacta al administrador para recuperar el acceso.
              </p>
            </div>
          )}

          {errorMsg && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700 font-medium">Error de acceso</p>
              <p className="text-sm text-red-600 mt-1">{errorMsg}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="ejemplo@brika.cl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full h-11" size="lg" disabled={loading}>
              {loading ? "Iniciando sesión..." : "Iniciar Sesión"}
            </Button>
          </form>

          <div className="mt-6 text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              ¿Olvidaste tu contraseña? Contacta al administrador de tu cuenta para restablecerla.
            </p>
            <p className="text-xs text-gray-400">
              Solo usuarios registrados pueden acceder. Si no tienes acceso, solicítalo al administrador de la plataforma.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
