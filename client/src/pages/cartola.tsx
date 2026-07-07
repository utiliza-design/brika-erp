import { Building2 } from "lucide-react";
import { FileUploadZone } from "@/components/file-upload-zone";
import { FileHistoryTable } from "@/components/file-history-table";

export default function CartolaPage() {
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md bg-primary/10">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-cartola-title">Cartola Banco de Chile</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Carga y gestiona las cartolas bancarias</p>
        </div>
      </div>

      <FileUploadZone
        fileType="cartola"
        title="Subir Cartola"
        description="Sube el archivo Excel de la cartola del Banco de Chile. Se aceptan formatos .xlsx, .xls y .csv"
      />

      <FileHistoryTable
        fileType="cartola"
        title="Historial de Cartolas"
      />
    </div>
  );
}
