import { useQuery } from "@tanstack/react-query";
import { Building2, Receipt, ShoppingCart, FileSpreadsheet, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { FileHistoryTable } from "@/components/file-history-table";
import { Skeleton } from "@/components/ui/skeleton";
import type { UploadedFile, FileType } from "@shared/schema";

function StatCard({ title, count, icon: Icon, href, color }: {
  title: string;
  count: number;
  icon: typeof Building2;
  href: string;
  color: string;
}) {
  return (
    <Link href={href}>
      <Card className="border-card-border hover-elevate cursor-pointer transition-all">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className="text-2xl font-bold mt-1" data-testid={`text-stat-${href.replace("/", "")}`}>{count}</p>
              <p className="text-xs text-muted-foreground mt-1">archivos cargados</p>
            </div>
            <div className={`p-3 rounded-md ${color}`}>
              <Icon className="h-5 w-5" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const { data: files, isLoading } = useQuery<UploadedFile[]>({
    queryKey: ["/api/files"],
  });

  const countByType = (type: FileType) => files?.filter(f => f.fileType === type).length || 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Resumen de archivos cargados en la plataforma</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          [1, 2, 3].map((i) => (
            <Card key={i} className="border-card-border">
              <CardContent className="p-5">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              title="Cartola Banco"
              count={countByType("cartola")}
              icon={Building2}
              href="/cartola"
              color="bg-primary/10 text-primary"
            />
            <StatCard
              title="Cobranza / Facturas"
              count={countByType("cobranza")}
              icon={Receipt}
              href="/cobranza"
              color="bg-secondary text-secondary-foreground"
            />
            <StatCard
              title="Fact Ventas"
              count={countByType("fact_ventas")}
              icon={ShoppingCart}
              href="/fact-ventas"
              color="bg-accent text-accent-foreground"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-card-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Actividad reciente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !files || files.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileSpreadsheet className="h-10 w-10 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">Sin actividad reciente</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Sube tu primer archivo para comenzar</p>
              </div>
            ) : (
              <div className="space-y-2">
                {files.slice(0, 5).map((file) => (
                  <div key={file.id} className="flex items-center gap-3 p-2 rounded-md" data-testid={`text-recent-${file.id}`}>
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.originalFilename}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.rowCount} filas
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short" }).format(new Date(file.uploadedAt))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-card-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              Accesos rápidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <Link href="/cartola">
                <Button variant="secondary" className="w-full justify-start gap-2" data-testid="button-quick-cartola">
                  <Building2 className="h-4 w-4" />
                  Subir Cartola Banco de Chile
                </Button>
              </Link>
              <Link href="/cobranza">
                <Button variant="secondary" className="w-full justify-start gap-2" data-testid="button-quick-cobranza">
                  <Receipt className="h-4 w-4" />
                  Subir Cobranza / Facturas BSale
                </Button>
              </Link>
              <Link href="/fact-ventas">
                <Button variant="secondary" className="w-full justify-start gap-2" data-testid="button-quick-fact-ventas">
                  <ShoppingCart className="h-4 w-4" />
                  Subir Fact Ventas
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <FileHistoryTable fileType={undefined} title="Todos los archivos" showTypeColumn />
    </div>
  );
}
