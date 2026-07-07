import { useState } from "react";
import { ChevronDown, Upload } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileUploadZone } from "@/components/file-upload-zone";
import { FileHistoryTable } from "@/components/file-history-table";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { FileType } from "@shared/schema";
import cartolaBdechileImg from "@assets/image_1774879414796.png";
import cartolaBdechileCsvImg from "@assets/image_1777917076451.png";
import cartolaSecurityImg from "@assets/image_1772507338360.png";
import cartolaSecurityUltimosImg from "@assets/image_1776441103940.png";
import cartolaFalabellaImg from "@assets/image_1772510126665.png";
import cartolaFalabellaXlsImg from "@assets/image_1777916806283.png";
import global66ClpImg from "@assets/image_1775739402222.png";
import global66UsdImg from "@assets/image_1775739416557.png";

type BankKey = "bdechile" | "security" | "falabella" | "global66-clp" | "global66-usd";

interface BankUploadConfig {
  fileType: FileType;
  dateField: string;
  uploadTitle: string;
  uploadDescription: string;
  historyTitle: string;
  acceptedFormats?: string;
  formatGuide: {
    source: string;
    columns: string[];
    imagePath?: string;
    images?: { label: string; src: string }[];
  };
}

const BANK_UPLOAD_CONFIGS: Record<BankKey, BankUploadConfig> = {
  "bdechile": {
    fileType: "cartola",
    dateField: "Fecha",
    uploadTitle: "Subir Cartola Banco de Chile",
    uploadDescription: "Sube el archivo Excel de la cartola del Banco de Chile. Se aceptan formatos .xlsx, .xls y .csv",
    historyTitle: "Historial de Cartolas Banco de Chile",
    formatGuide: {
      source: "Banco de Chile › Mi Cuenta › Movimientos › Exportar Excel (todos los formatos aceptados)",
      columns: ["Fecha", "Detalle Movimiento", "Cheque o Cargo", "Deposito o Abono", "Saldo"],
      images: [
        { label: "Exportar Excel (formato web)", src: cartolaBdechileImg },
        { label: "Cartola XLS (formato legacy)", src: cartolaBdechileCsvImg },
      ],
    },
  },
  "security": {
    fileType: "cartola_security",
    dateField: "Fecha",
    uploadTitle: "Subir Cartola Banco Security",
    uploadDescription: "Sube el archivo Excel de la cartola del Banco Security. Se aceptan los formatos Cartola Histórica y Últimos Movimientos (.xlsx y .xls).",
    historyTitle: "Historial de Cartolas Banco Security",
    formatGuide: {
      source: "Banca en Línea › Cuenta Corriente › Cartola Histórica o Últimos Movimientos",
      columns: ["Fecha", "Descripción", "Número de Documentos", "Cargos", "Abonos", "Saldos"],
      images: [
        { label: "Cartola Histórica", src: cartolaSecurityImg },
        { label: "Últimos Movimientos", src: cartolaSecurityUltimosImg },
      ],
    },
  },
  "falabella": {
    fileType: "cartola_falabella",
    dateField: "Fecha",
    uploadTitle: "Subir Cartola Banco Falabella",
    uploadDescription: "Sube el archivo PDF o XLS de la Cartola Banco Falabella. Se aceptan los formatos Cartola Histórica (PDF) y Reporte de Colección (XLS).",
    historyTitle: "Historial de Cartolas Banco Falabella",
    acceptedFormats: ".pdf,.xls,.xlsx",
    formatGuide: {
      source: "Banco Falabella › Banca en Línea › Cuenta Corriente › Cartola Histórica (PDF) o Reporte de Colección (XLS)",
      columns: ["Fecha", "Descripción", "Cargo", "Abono", "Saldo"],
      images: [
        { label: "Cartola Histórica (PDF)", src: cartolaFalabellaImg },
        { label: "Reporte de Colección (XLS)", src: cartolaFalabellaXlsImg },
      ],
    },
  },
  "global66-clp": {
    fileType: "cartola_global66_clp",
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
  "global66-usd": {
    fileType: "cartola_global66_usd",
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
};

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function formatYearMonth(ym: string): string {
  const [year, month] = ym.split("-");
  return `${MONTH_NAMES[parseInt(month) - 1]} ${year.slice(2)}`;
}

function FormatGuideCard({ source, columns, imagePath, images }: { source: string; columns: string[]; imagePath?: string; images?: { label: string; src: string }[] }) {
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
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
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
                  <Badge key={col} variant="secondary" className="text-xs font-normal">{col}</Badge>
                ))}
              </div>
            </div>
            {images && images.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {images.length > 1 ? "Vistas previas (ambos formatos aceptados):" : "Vista previa del archivo:"}
                </p>
                <div className={`grid gap-3 ${images.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
                  {images.map((img) => (
                    <div key={img.label} className="space-y-1.5">
                      <p className="text-[11px] font-medium text-muted-foreground">{img.label}</p>
                      <img
                        src={img.src}
                        alt={`Ejemplo de formato: ${img.label}`}
                        className="rounded-md border border-border w-full object-contain max-h-96"
                        data-testid={`img-format-example-${img.label.toLowerCase().replace(/\s+/g, "-")}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : imagePath && (
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

function MonthlyRecordsChart({ fileType, dateField }: { fileType: FileType; dateField: string }) {
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
        <CardContent className="p-5"><Skeleton className="h-48 w-full" /></CardContent>
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
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12, color: "hsl(var(--foreground))" }}
              cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
              formatter={(value: number) => [value, "Registros"]}
            />
            <Bar dataKey="registros" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

interface BancoUploadPanelProps {
  bank: BankKey;
}

export function BancoUploadPanel({ bank }: BancoUploadPanelProps) {
  const [open, setOpen] = useState(false);
  const config = BANK_UPLOAD_CONFIGS[bank];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-left bg-muted/40 hover:bg-muted/60 transition-colors rounded-lg border border-border"
          data-testid={`button-toggle-upload-${bank}`}
        >
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Subir archivos</span>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-4 space-y-4">
          <FileUploadZone
            fileType={config.fileType}
            title={config.uploadTitle}
            description={config.uploadDescription}
            acceptedFormats={config.acceptedFormats}
          />
          <FormatGuideCard {...config.formatGuide} />
          <MonthlyRecordsChart fileType={config.fileType} dateField={config.dateField} />
          <FileHistoryTable fileType={config.fileType} title={config.historyTitle} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
