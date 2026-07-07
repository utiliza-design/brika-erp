import { useState } from "react";
import { Upload, Building2, TrendingUp, ChevronDown, Landmark, CreditCard, Receipt, FileSpreadsheet } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileUploadZone } from "@/components/file-upload-zone";
import { FileHistoryTable } from "@/components/file-history-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery } from "@tanstack/react-query";
import type { UploadedFile, FileType } from "@shared/schema";
import cartolaNuevoFormatoImg from "@assets/image_1774879414796.png";
import cartolaSecurity from "@assets/image_1772507338360.png";
import cartolaFalabella from "@assets/image_1772510126665.png";
import detalleVentasImg from "@assets/image_1773926583781.png";
import global66ClpImg from "@assets/image_1775739402222.png";
import global66UsdImg from "@assets/image_1775739416557.png";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface FormatGuideProps {
  source: string;
  columns: string[];
  imagePath?: string;
}

function FormatGuideCard({ source, columns, imagePath }: FormatGuideProps) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-card-border">
        <CollapsibleTrigger asChild>
          <button
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors rounded-lg"
            data-testid="button-toggle-format-guide"
          >
            <span className="text-sm font-medium text-muted-foreground">Ver formato de ejemplo</span>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Exportado desde:</span> {source}
            </p>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Columnas esperadas:</p>
              <div className="flex flex-wrap gap-1.5">
                {columns.map((col) => (
                  <Badge key={col} variant="secondary" className="text-xs font-normal">
                    {col}
                  </Badge>
                ))}
              </div>
            </div>
            {imagePath && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Vista previa del archivo:</p>
                <img
                  src={imagePath}
                  alt="Ejemplo de formato de archivo"
                  className="rounded-md border border-border w-full object-contain max-h-96"
                  data-testid="img-format-example"
                />
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];


function formatYearMonth(ym: string): string {
  const [year, month] = ym.split("-");
  return `${MONTH_NAMES[parseInt(month) - 1]} ${year.slice(2)}`;
}

interface MonthlyChartProps {
  fileType: FileType;
  dateField: string;
}

function MonthlyRecordsChart({ fileType, dateField }: MonthlyChartProps) {
  const { data: rawChart, isLoading } = useQuery<{ mes: string; registros: number }[]>({
    queryKey: ["/api/files/monthly-chart", fileType, dateField],
    queryFn: async () => {
      const res = await fetch(`/api/files/monthly-chart?fileType=${fileType}&dateField=${encodeURIComponent(dateField)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error al cargar gráfico");
      return res.json();
    },
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <Card className="border-card-border">
        <CardContent className="p-5">
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!rawChart || rawChart.length === 0) return null;

  const chartData = rawChart.map(d => ({ mes: formatYearMonth(d.mes), registros: d.registros }));

  return (
    <Card className="border-card-border" data-testid="card-monthly-chart">
      <CardHeader className="pb-2 px-5 pt-5">
        <CardTitle className="text-sm font-medium text-muted-foreground">Registros por mes</CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="mes"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: 12,
                color: "hsl(var(--foreground))",
              }}
              cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
              formatter={(value: number) => [value, "Registros"]}
            />
            <Bar
              dataKey="registros"
              fill="hsl(var(--primary))"
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function StatCard({ title, count, icon: Icon, color, onTabClick }: {
  title: string;
  count: number;
  icon: typeof Building2;
  color: string;
  onTabClick: () => void;
}) {
  return (
    <Card className="border-card-border hover-elevate cursor-pointer transition-all" onClick={onTabClick}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{count}</p>
            <p className="text-xs text-muted-foreground mt-1">archivos cargados</p>
          </div>
          <div className={`p-3 rounded-md ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


function DashboardTab({ onNavigateToTab }: { onNavigateToTab: (tab: string) => void }) {
  const { data: files, isLoading } = useQuery<UploadedFile[]>({
    queryKey: ["/api/files"],
  });

  const countByType = (type: FileType) => files?.filter(f => f.fileType === type).length || 0;
  const countManualFactVentas = () =>
    files?.filter(f => f.fileType === "fact_ventas").length || 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          [1, 2, 3, 4].map((i) => (
            <Card key={i} className="border-card-border">
              <CardContent className="p-5">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              title="Cartolas Banco de Chile"
              count={countByType("cartola")}
              icon={Building2}
              color="bg-primary/10 text-primary"
              onTabClick={() => onNavigateToTab("cartolas")}
            />
            <StatCard
              title="Cartola Banco Security"
              count={countByType("cartola_security")}
              icon={Landmark}
              color="bg-secondary text-secondary-foreground"
              onTabClick={() => onNavigateToTab("security")}
            />
            <StatCard
              title="Cartola Banco Falabella"
              count={countByType("cartola_falabella")}
              icon={CreditCard}
              color="bg-primary/10 text-primary"
              onTabClick={() => onNavigateToTab("falabella")}
            />
            <StatCard
              title="Cartola Global66 CLP"
              count={countByType("cartola_global66_clp")}
              icon={CreditCard}
              color="bg-primary/10 text-primary"
              onTabClick={() => onNavigateToTab("global66-clp")}
            />
            <StatCard
              title="Cartola Global66 USD"
              count={countByType("cartola_global66_usd")}
              icon={CreditCard}
              color="bg-secondary text-secondary-foreground"
              onTabClick={() => onNavigateToTab("global66-usd")}
            />
            <StatCard
              title="Detalle de Ventas"
              count={countManualFactVentas()}
              icon={Receipt}
              color="bg-primary/10 text-primary"
              onTabClick={() => onNavigateToTab("detalle-ventas")}
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
                      <p className="text-xs text-muted-foreground">{file.rowCount} filas</p>
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
              <button
                onClick={() => onNavigateToTab("cartolas")}
                className="flex items-center gap-2 w-full px-4 py-2 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
                data-testid="button-quick-cartolas"
              >
                <Building2 className="h-4 w-4" />
                Subir Cartola Banco de Chile
              </button>
              <button
                onClick={() => onNavigateToTab("security")}
                className="flex items-center gap-2 w-full px-4 py-2 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
                data-testid="button-quick-security"
              >
                <Landmark className="h-4 w-4" />
                Subir Cartola Banco Security
              </button>
              <button
                onClick={() => onNavigateToTab("falabella")}
                className="flex items-center gap-2 w-full px-4 py-2 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
                data-testid="button-quick-falabella"
              >
                <CreditCard className="h-4 w-4" />
                Subir Cartola Banco Falabella (PDF)
              </button>
              <button
                onClick={() => onNavigateToTab("global66-clp")}
                className="flex items-center gap-2 w-full px-4 py-2 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
                data-testid="button-quick-global66-clp"
              >
                <CreditCard className="h-4 w-4" />
                Subir Cartola Global66 CLP (PDF)
              </button>
              <button
                onClick={() => onNavigateToTab("global66-usd")}
                className="flex items-center gap-2 w-full px-4 py-2 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
                data-testid="button-quick-global66-usd"
              >
                <CreditCard className="h-4 w-4" />
                Subir Cartola Global66 USD (PDF)
              </button>
              <button
                onClick={() => onNavigateToTab("detalle-ventas")}
                className="flex items-center gap-2 w-full px-4 py-2 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
                data-testid="button-quick-detalle-ventas"
              >
                <Receipt className="h-4 w-4" />
                Subir Detalle de Ventas (BSale)
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      <FileHistoryTable fileType={undefined} title="Todos los archivos" showTypeColumn />
    </div>
  );
}

const uploadTabs = [
  {
    value: "detalle-ventas",
    label: "Detalle de Ventas",
    fileType: "fact_ventas" as const,
    dateField: "Fecha Venta",
    uploadTitle: "Subir Detalle de Ventas",
    uploadDescription: "Sube el reporte de Detalle de Ventas exportado desde BSale. Se aceptan formatos .xlsx, .xls y .csv",
    historyTitle: "Historial de Detalle de Ventas",
    formatGuide: {
      source: "BSale › Reportes › Ventas › Detalle de Ventas › Exportar Excel",
      imagePath: detalleVentasImg,
      columns: [
        "Tipo Movimiento",
        "Tipo de Documento",
        "Numero del documento",
        "Fecha de Emisión",
        "Tracking number",
        "Fecha Venta",
        "Hora Venta",
        "Sucursal",
        "Vendedor",
        "Nombre Cliente",
        "Cliente RUT",
        "Email Cliente",
        "Venta Total Neta",
        "Costo Total Neto",
      ],
    },
  },
  {
    value: "cartolas",
    label: "Cartolas Banco de Chile",
    fileType: "cartola" as const,
    dateField: "Fecha",
    uploadTitle: "Subir Cartola",
    uploadDescription: "Sube el archivo Excel de la cartola del Banco de Chile. Se aceptan formatos .xlsx, .xls y .csv",
    historyTitle: "Historial de Cartolas Banco de Chile",
    formatGuide: {
      source: "Banco de Chile › Mi Cuenta › Movimientos › Exportar Excel (ambos formatos aceptados)",
      imagePath: cartolaNuevoFormatoImg,
      columns: ["Fecha", "Descripción", "Canal o Sucursal", "Nro. Docto.", "Cargos (CLP)", "Abonos (CLP)", "Saldo (CLP)"],
    },
  },
  {
    value: "security",
    label: "Cartola Banco Security",
    fileType: "cartola_security" as const,
    dateField: "Fecha",
    uploadTitle: "Subir Cartola Banco Security",
    uploadDescription: "Sube el archivo Excel de la cartola del Banco Security. Se aceptan formatos .xlsx y .xls",
    historyTitle: "Historial de Cartolas Banco Security",
    formatGuide: {
      source: "Banco Security › Banca en Línea › Cuenta Corriente › Cartola Histórica",
      columns: ["Fecha", "Descripción", "Número de Documentos", "Cargos", "Abonos", "Saldos"],
      imagePath: cartolaSecurity,
    },
  },
  {
    value: "falabella",
    label: "Cartola Banco Falabella",
    fileType: "cartola_falabella" as const,
    dateField: "Fecha",
    uploadTitle: "Subir Cartola Banco Falabella",
    uploadDescription: "Sube el archivo PDF de la Cartola Banco Falabella. Se acepta formato .pdf",
    historyTitle: "Historial de Cartolas Banco Falabella",
    acceptedFormats: ".pdf",
    formatGuide: {
      source: "Banco Falabella › Banca en Línea › Cuenta Corriente › Cartola Histórica (PDF)",
      columns: ["Fecha", "Oficina", "Nro Doc", "Descripción", "Cargo", "Abono", "Saldo"],
      imagePath: cartolaFalabella,
    },
  },
  {
    value: "global66-clp",
    label: "Global66 CLP",
    fileType: "cartola_global66_clp" as const,
    dateField: "Fecha",
    uploadTitle: "Subir Cartola Global66 CLP",
    uploadDescription: "Sube el archivo PDF del estado de cuenta Global66 en pesos chilenos. Se acepta formato .pdf",
    historyTitle: "Historial de Cartolas Global66 CLP",
    acceptedFormats: ".pdf",
    formatGuide: {
      source: "Global66 › Mi Cuenta › Movimientos › Exportar PDF (cuenta CLP)",
      columns: ["Fecha", "Descripción", "Movimiento", "Tarjeta", "Débito", "Abono", "Saldo"],
      imagePath: global66ClpImg,
    },
  },
  {
    value: "global66-usd",
    label: "Global66 USD",
    fileType: "cartola_global66_usd" as const,
    dateField: "Fecha",
    uploadTitle: "Subir Cartola Global66 USD",
    uploadDescription: "Sube el archivo PDF del estado de cuenta Global66 en dólares. Se acepta formato .pdf",
    historyTitle: "Historial de Cartolas Global66 USD",
    acceptedFormats: ".pdf",
    formatGuide: {
      source: "Global66 › Mi Cuenta › Movimientos › Exportar PDF (cuenta USD)",
      columns: ["Fecha", "Descripción", "Movimiento", "Tarjeta", "Débito", "Abono", "Saldo"],
      imagePath: global66UsdImg,
    },
  },
];

export default function SubirArchivosPage() {
  const [activeTab, setActiveTab] = useState("resumen");

  function handleTabChange(value: string) {
    setActiveTab(value);
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md bg-primary/10">
          <Upload className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-subir-archivos-title">Subir Archivos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Carga y gestiona archivos de cartolas bancarias y reportes de ventas</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-2" data-testid="tabs-subir-archivos">
          <TabsTrigger value="resumen" data-testid="tab-resumen">Resumen</TabsTrigger>
          {uploadTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} data-testid={`tab-${tab.value}`}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen">
          <DashboardTab onNavigateToTab={handleTabChange} />
        </TabsContent>

        {uploadTabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="space-y-6">
            <FileUploadZone
              fileType={tab.fileType}
              title={tab.uploadTitle}
              description={tab.uploadDescription}
              acceptedFormats={"acceptedFormats" in tab ? tab.acceptedFormats : undefined}
            />
            <FormatGuideCard {...tab.formatGuide} />
            <MonthlyRecordsChart fileType={tab.fileType} dateField={tab.dateField} />
            <FileHistoryTable
              fileType={tab.fileType}
              title={tab.historyTitle}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
