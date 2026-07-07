import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2, Eye, FileSpreadsheet, Loader2, Calendar, Hash, FileText, Eraser } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UploadedFile, FileType } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

interface FileHistoryTableProps {
  fileType?: FileType;
  title: string;
  showTypeColumn?: boolean;
}

function fileTypeLabel(type: FileType): string {
  switch (type) {
    case "cartola": return "Cartola Banco";
    case "cobranza": return "Cobranza / Facturas";
    case "fact_ventas": return "Detalle Ventas (Manual)";
    case "fact_ventas_bsale": return "Detalle Ventas (BSale)";
    case "fact_compras": return "Facturas de Compra";
    case "cartola_security": return "Cartola Security";
    case "cartola_falabella": return "Cartola Falabella";
    case "cartola_global66_clp": return "Cartola Global66 CLP";
    case "cartola_global66_usd": return "Cartola Global66 USD";
    case "stock": return "Stock";
    default: return type;
  }
}

function fileTypeBadgeVariant(type: FileType): "default" | "secondary" | "destructive" | "outline" {
  switch (type) {
    case "cartola": return "default";
    case "cobranza": return "secondary";
    case "fact_ventas": return "outline";
    case "fact_ventas_bsale": return "secondary";
    default: return "default";
  }
}

function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function DataPreviewDialog({ file }: { file: UploadedFile }) {
  const [open, setOpen] = useState(false);

  const { data: fullFile, isLoading } = useQuery<UploadedFile>({
    queryKey: ["/api/files", file.id],
    queryFn: async () => {
      const res = await fetch(`/api/files/${file.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error al cargar datos");
      return res.json();
    },
    enabled: open,
    staleTime: 60000,
  });

  const dataArray = (fullFile?.data || []) as Record<string, unknown>[];
  const headers = file.headers || (dataArray.length > 0 ? Object.keys(dataArray[0]) : []);
  const previewRows = dataArray.slice(0, 20);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" data-testid={`button-preview-${file.id}`}>
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {file.originalFilename}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> {file.rowCount} filas</span>
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(file.uploadedAt)}</span>
            <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {headers.length} columnas</span>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center h-[50vh]">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <ScrollArea className="h-[50vh] rounded-md border">
                <div className="min-w-max">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {headers.map((h, i) => (
                          <TableHead key={i} className="whitespace-nowrap text-xs font-semibold">{String(h)}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={headers.length} className="text-center text-muted-foreground py-8">
                            Sin datos para previsualizar
                          </TableCell>
                        </TableRow>
                      ) : (
                        previewRows.map((row, i) => (
                          <TableRow key={i}>
                            {headers.map((h, j) => (
                              <TableCell key={j} className="text-xs whitespace-nowrap max-w-[200px] truncate">
                                {String(row[String(h)] ?? "")}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </ScrollArea>
              {dataArray.length > 20 && (
                <p className="text-xs text-muted-foreground text-center">
                  Mostrando 20 de {dataArray.length} filas
                </p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FileHistoryTable({ fileType, title, showTypeColumn = false }: FileHistoryTableProps) {
  const { toast } = useToast();
  const queryKey = fileType ? ["/api/files", `?fileType=${fileType}`] : ["/api/files"];
  const url = fileType ? `/api/files?fileType=${fileType}` : "/api/files";

  const { data: files, isLoading } = useQuery<UploadedFile[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Error al obtener archivos");
      return res.json();
    },
  });

  const invalidateAfterDelete = () => {
    const keys = [
      "/api/files",
      "/api/estado-resultados",
      "/api/costos-operacionales",
      "/api/centro-costos",
      "/api/security-costos",
      "/api/falabella-costos",
      "/api/global66-clp-costos",
      "/api/global66-usd-costos",
      "/api/facturas-revision",
      "/api/facturas-revision/movimientos",
      "/api/files/monthly-chart",
    ];
    keys.forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/files/${id}`);
    },
    onSuccess: () => {
      invalidateAfterDelete();
      toast({ title: "Archivo eliminado" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/files/type/${fileType}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidateAfterDelete();
      toast({ title: "Archivos eliminados", description: `${data.deleted} archivo${data.deleted !== 1 ? "s" : ""} eliminado${data.deleted !== 1 ? "s" : ""}` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card className="border-card-border">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
        <CardTitle className="text-base font-semibold" data-testid={`text-history-title-${fileType || "all"}`}>{title}</CardTitle>
        <div className="flex items-center gap-2">
          {files && files.length > 0 && (
            <Badge variant="secondary" className="text-xs">{files.length} archivo{files.length !== 1 ? "s" : ""}</Badge>
          )}
          {fileType && files && files.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10 gap-1.5"
              onClick={() => {
                if (confirm(`¿Eliminar todos los ${files.length} archivo${files.length !== 1 ? "s" : ""} de ${title}? Esta acción no se puede deshacer.`)) {
                  deleteAllMutation.mutate();
                }
              }}
              disabled={deleteAllMutation.isPending}
              data-testid={`button-delete-all-${fileType}`}
            >
              {deleteAllMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eraser className="h-3 w-3" />}
              Limpiar todo
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !files || files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No hay archivos cargados</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Los archivos que subas aparecerán aquí</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Archivo</TableHead>
                  {showTypeColumn && <TableHead className="text-xs">Tipo</TableHead>}
                  <TableHead className="text-xs">Filas</TableHead>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                  <TableHead className="text-xs text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id} data-testid={`row-file-${file.id}`}>
                    <TableCell className="text-sm font-medium max-w-[200px] truncate" data-testid={`text-filename-row-${file.id}`}>
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate">{file.originalFilename}</span>
                      </div>
                    </TableCell>
                    {showTypeColumn && (
                      <TableCell>
                        <Badge variant={fileTypeBadgeVariant(file.fileType as FileType)} className="text-xs">
                          {fileTypeLabel(file.fileType as FileType)}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell className="text-sm text-muted-foreground">{file.rowCount}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(file.uploadedAt)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs capitalize">{file.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <DataPreviewDialog file={file} />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(file.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${file.id}`}
                        >
                          {deleteMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
