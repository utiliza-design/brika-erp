import { Receipt } from "lucide-react";
import { FileUploadZone } from "@/components/file-upload-zone";
import { FileHistoryTable } from "@/components/file-history-table";

export default function CobranzaPage() {
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md bg-secondary">
          <Receipt className="h-5 w-5 text-secondary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-cobranza-title">Cobranza / Facturas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Carga y gestiona archivos de cobranza descargados desde BSale</p>
        </div>
      </div>

      <FileUploadZone
        fileType="cobranza"
        title="Subir Archivo de Cobranza"
        description="Sube el archivo Excel de Cobranza/Facturas exportado desde BSale. Se aceptan formatos .xlsx, .xls y .csv"
      />

      <FileHistoryTable
        fileType="cobranza"
        title="Historial de Cobranza"
      />
    </div>
  );
}
