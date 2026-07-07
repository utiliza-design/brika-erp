import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import SubirArchivosPage from "@/pages/subir-archivos";
import EstadoResultadosPage from "@/pages/estado-resultados";
import CentroCostosPage from "@/pages/centro-costos";
import CajaSecurityPage from "@/pages/caja-security";
import CajaFalabellaPage from "@/pages/caja-falabella";
import CajaGlobal66ClpPage from "@/pages/caja-global66-clp";
import CajaGlobal66UsdPage from "@/pages/caja-global66-usd";
import FacturasRevisionPage from "@/pages/facturas-revision";
import FactVentasPage from "@/pages/fact-ventas";
import FactComprasPage from "@/pages/fact-compras";
import VentaAmigoPage from "@/pages/venta-amigo";
import StockDisponiblePage from "@/pages/stock-disponible";
import SiguientePedidoPage from "@/pages/siguiente-pedido";
import UsuariosPage from "@/pages/usuarios";
import ClientesPage from "@/pages/clientes";
import MovimientosBancosPage from "@/pages/movimientos-bancos";
import LoginPage from "@/pages/login";
import { useEffect } from "react";

interface AppUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  profileImageUrl: string | null;
}

function AppRoutes({ user }: { user: AppUser }) {
  return (
    <SidebarProvider style={{ "--sidebar-width": "16rem", "--sidebar-width-icon": "3rem" } as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar user={user} />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-2 p-2 border-b shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto">
            <Switch>
              <Route path="/"><Redirect to="/estado-resultados" /></Route>
              <Route path="/estado-resultados" component={EstadoResultadosPage} />
              <Route path="/subir-archivos" component={SubirArchivosPage} />
              <Route path="/centro-costos" component={CentroCostosPage} />
              <Route path="/caja-security" component={CajaSecurityPage} />
              <Route path="/caja-falabella" component={CajaFalabellaPage} />
              <Route path="/caja-global66-clp" component={CajaGlobal66ClpPage} />
              <Route path="/caja-global66-usd" component={CajaGlobal66UsdPage} />
              <Route path="/facturas-revision" component={FacturasRevisionPage} />
              <Route path="/fact-ventas" component={FactVentasPage} />
              <Route path="/fact-compras" component={FactComprasPage} />
              <Route path="/venta-amigo" component={VentaAmigoPage} />
              <Route path="/stock-disponible" component={StockDisponiblePage} />
              <Route path="/siguiente-pedido" component={SiguientePedidoPage} />
              <Route path="/usuarios" component={UsuariosPage} />
              <Route path="/clientes" component={ClientesPage} />
              <Route path="/movimientos-bancos" component={MovimientosBancosPage} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AuthGuard() {
  const [, setLocation] = useLocation();

  const { data: user, isLoading, isError, error } = useQuery<AppUser>({
    queryKey: ["/api/me"],
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!isLoading && isError) {
      const errMsg = (error as any)?.message || "";
      const statusMatch = errMsg.match(/^(\d+):/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 0;
      if (status === 403) {
        if (errMsg.includes('"revoked"')) {
          setLocation("/login?revoked=true");
        } else {
          setLocation("/login?denied=true");
        }
      } else {
        setLocation("/login");
      }
    }
  }, [isLoading, isError, error, setLocation]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-800" />
      </div>
    );
  }

  if (!user) return null;

  return <AppRoutes user={user} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route>
        <AuthGuard />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
