import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiGoogle } from "react-icons/si";
import { useLocation } from "wouter";

export default function LoginPage() {
  const [location] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] || "");
  const isDenied = params.get("denied") === "true";
  const isRevoked = params.get("revoked") === "true";

  return (
    <div className="min-h-screen flex">
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

      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <FileSpreadsheet className="h-6 w-6 text-gray-900" />
            <span className="text-gray-900 text-lg font-bold">Brika</span>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Bienvenido</h2>
          <p className="text-gray-500 mb-8">
            Inicia sesión con tu cuenta de Google para acceder a la plataforma.
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

          <a href="/api/login" data-testid="button-google-login">
            <Button className="w-full gap-3 h-11" size="lg">
              <SiGoogle className="h-4 w-4" />
              Iniciar sesión con Google
            </Button>
          </a>

          <p className="text-xs text-gray-400 text-center mt-6">
            Solo usuarios invitados pueden acceder. Si no tienes acceso, solicítalo al administrador de la plataforma.
          </p>
        </div>
      </div>
    </div>
  );
}
