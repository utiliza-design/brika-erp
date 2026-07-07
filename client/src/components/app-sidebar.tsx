import brikaLogo from "@assets/image_1772290961922.png";
import { BarChart3, Landmark, FileCheck, Users, LogOut, ShoppingCart, ShoppingBag, Heart, PackageSearch, ClipboardList, Contact } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface AppUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  profileImageUrl: string | null;
}

const modules = [
  { title: "Estado Resultados", url: "/estado-resultados", icon: BarChart3 },
  { title: "Cobranza", url: "/facturas-revision", icon: FileCheck },
  { title: "Clientes", url: "/clientes", icon: Contact },
  { title: "Movimientos Bancos", url: "/movimientos-bancos", icon: Landmark },
  { title: "Detalle Ventas", url: "/fact-ventas", icon: ShoppingCart },
  { title: "Facturas de Compra", url: "/fact-compras", icon: ShoppingBag },
  { title: "Venta amigo", url: "/venta-amigo", icon: Heart },
  { title: "Stock Disponible", url: "/stock-disponible", icon: PackageSearch },
  { title: "Siguiente Pedido", url: "/siguiente-pedido", icon: ClipboardList },
];

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  }
  return email[0].toUpperCase();
}

export function AppSidebar({ user }: { user: AppUser }) {
  const [location] = useLocation();

  const allModules = user.role === "admin"
    ? [...modules, { title: "Usuarios", url: "/usuarios", icon: Users }]
    : modules;

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center justify-center mb-4 pt-1">
          <img
            src={brikaLogo}
            alt="Brika Natural Organic"
            className="h-14 w-auto object-contain"
            data-testid="img-brika-logo"
          />
        </div>
        <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
          <Avatar className="h-8 w-8 shrink-0">
            {user.profileImageUrl && <AvatarImage src={user.profileImageUrl} alt={user.name || user.email} />}
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">
              {getInitials(user.name, user.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate" data-testid="text-user-name">
              {user.name || user.email}
            </p>
            <p className="text-xs text-muted-foreground truncate" data-testid="text-user-email">
              {user.name ? user.email : user.role}
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Módulos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {allModules.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    data-active={location === item.url}
                    className="data-[active=true]:bg-sidebar-accent"
                    data-testid={`link-${item.url.replace("/", "") || "dashboard"}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => { window.location.href = "/api/logout"; }}
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
