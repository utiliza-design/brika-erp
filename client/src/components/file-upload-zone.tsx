import { useCallback, useState } from "react";
import { Upload, FileSpreadsheet, X, Loader2, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { FileType } from "@shared/schema";

interface FileUploadZoneProps {
  fileType: FileType;
  title: string;
  description: string;
  acceptedFormats?: string;
}

export function FileUploadZone({ fileType, title, description, acceptedFormats = ".xlsx,.xls,.csv" }: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const { toast } = useToast();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setUploadSuccess(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setSelectedFile(files[0]);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadSuccess(false);
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch(`/api/upload/${fileType}`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Error al subir el archivo");
      }

      const result = await res.json();

      let toastTitle = "Archivo procesado";
      let toastDescription = `Se procesaron ${result.rowCount} filas de "${selectedFile.name}"`;

      if (result.duplicateCount !== undefined) {
        if (result.newCount === 0) {
          toastTitle = "Sin datos nuevos";
          toastDescription = `Todas las ${result.duplicateCount} filas ya existían en la base de datos`;
        } else if (result.duplicateCount > 0) {
          toastDescription = `Se agregaron ${result.newCount} filas nuevas (${result.duplicateCount} duplicadas ignoradas)`;
        } else {
          toastDescription = `Se agregaron ${result.newCount} filas nuevas de "${selectedFile.name}"`;
        }
      }

      toast({ title: toastTitle, description: toastDescription });

      setUploadSuccess(true);
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estado-resultados"] });
      queryClient.invalidateQueries({ queryKey: ["/api/costos-operacionales"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Error al procesar el archivo",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setUploadSuccess(false);
  };

  return (
    <Card className="border-card-border">
      <CardContent className="p-6">
        <div className="mb-4">
          <h3 className="text-base font-semibold" data-testid={`text-upload-title-${fileType}`}>{title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            relative border-2 border-dashed rounded-md p-8 text-center transition-colors cursor-pointer
            ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"}
            ${uploadSuccess ? "border-green-500/50 bg-green-500/5" : ""}
          `}
          data-testid={`dropzone-${fileType}`}
          onClick={() => document.getElementById(`file-input-${fileType}`)?.click()}
        >
          <input
            id={`file-input-${fileType}`}
            type="file"
            accept={acceptedFormats}
            onChange={handleFileSelect}
            className="hidden"
            data-testid={`input-file-${fileType}`}
          />

          {uploadSuccess ? (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-400">Archivo procesado correctamente</p>
                <p className="text-xs text-muted-foreground mt-1">Puedes subir otro archivo</p>
              </div>
            </div>
          ) : selectedFile ? (
            <div className="flex flex-col items-center gap-3">
              <FileSpreadsheet className="h-10 w-10 text-primary" />
              <div>
                <p className="text-sm font-medium" data-testid={`text-filename-${fileType}`}>{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  onClick={handleUpload}
                  disabled={isUploading}
                  data-testid={`button-upload-${fileType}`}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-1" />
                      Subir archivo
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={clearFile}
                  disabled={isUploading}
                  data-testid={`button-clear-${fileType}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="h-10 w-10 text-muted-foreground/50" />
              <div>
                <p className="text-sm font-medium">Arrastra un archivo o haz clic para seleccionar</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Formatos: {acceptedFormats}
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
