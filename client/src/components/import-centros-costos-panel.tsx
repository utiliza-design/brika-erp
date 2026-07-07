import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ImportResult = {
  pasada1: number;
  pasada2: number;
  sinMatch: number;
  ambiguos: number;
  total: number;
};

interface ImportCentrosCostosPanelProps {
  apiEndpoint?: string;
  label?: string;
  columnDescription?: string;
}

export function ImportCentrosCostosPanel({
  apiEndpoint = "/api/cartola/import-centros-costos",
  label = "Banco de Chile",
  columnDescription = "FECHA, OBS, RS, CENTROS DE COSTO, FACTURA/BOLETA, GIRO, DEPOSITOS",
}: ImportCentrosCostosPanelProps = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
    setError(null);
  }

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(apiEndpoint, {
        method: "POST",
        body: formData,
      });
      const contentType = res.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      if (!res.ok) {
        if (res.status === 401 || res.status === 403 || !isJson) {
          throw new Error("Sesión expirada. Recarga la página e intenta de nuevo.");
        }
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || data.message || `Error ${res.status}`);
      }
      if (!isJson) {
        throw new Error("Sesión expirada. Recarga la página e intenta de nuevo.");
      }
      const data: ImportResult = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-card-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Importar centros de costos desde Excel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Sube el Excel de control con columnas: <span className="font-mono text-xs">{columnDescription}</span>. Solo se modificarán movimientos del mismo año que el Excel.
        </p>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            data-testid="button-select-import-file"
          >
            <Upload className="h-4 w-4 mr-2" />
            Seleccionar archivo
          </Button>
          {file && (
            <span className="text-sm text-muted-foreground truncate max-w-xs">{file.name}</span>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
            data-testid="input-import-file"
          />
        </div>

        {file && (
          <Button
            size="sm"
            onClick={handleImport}
            disabled={loading}
            data-testid="button-run-import"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Procesando...</>
            ) : (
              "Ejecutar importación"
            )}
          </Button>
        )}

        {result && (
          <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 space-y-1" data-testid="import-result">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium text-sm mb-2">
              <CheckCircle2 className="h-4 w-4" />
              Importación completada — {result.total} movimientos procesados
            </div>
            <p className="text-xs text-muted-foreground">Pasada 1 (fecha+monto exacto): <span className="font-semibold text-foreground">{result.pasada1}</span></p>
            <p className="text-xs text-muted-foreground">Pasada 2 (monto+texto±30 días): <span className="font-semibold text-foreground">{result.pasada2}</span></p>
            <p className="text-xs text-muted-foreground">Sin match: <span className="font-semibold text-foreground">{result.sinMatch}</span></p>
            <p className="text-xs text-muted-foreground">Ambiguos (omitidos): <span className="font-semibold text-foreground">{result.ambiguos}</span></p>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 flex items-center gap-2 text-red-700 dark:text-red-400 text-sm" data-testid="import-error">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
