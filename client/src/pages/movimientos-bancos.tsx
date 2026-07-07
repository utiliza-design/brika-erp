import { useState } from "react";
import { Landmark } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BancoUploadPanel } from "@/components/movimientos/banco-upload-panel";
import { BancoMovimientosTable } from "@/components/movimientos/banco-movimientos-table";
import { MovimientosGeneralTable } from "@/components/movimientos/movimientos-general-table";
import type { BankKey } from "@/components/movimientos/banco-movimientos-table";

const BANK_TABS: { key: BankKey; label: string }[] = [
  { key: "bdechile",    label: "Banco de Chile" },
  { key: "security",   label: "Banco Security" },
  { key: "falabella",  label: "Falabella" },
  { key: "global66-clp", label: "Global66 CLP" },
  { key: "global66-usd", label: "Global66 USD" },
];

export default function MovimientosBancosPage() {
  const [activeTab, setActiveTab] = useState<string>("general");

  return (
    <div className="px-6 py-6 pb-8 space-y-6" style={{ width: "max-content", minWidth: "100%" }}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <Landmark className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-movimientos-bancos-title">
              Movimientos Bancos
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Movimientos y cartolas de todas las cuentas bancarias
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList data-testid="tabs-movimientos-bancos">
            <TabsTrigger value="general" data-testid="tab-general">
              General
            </TabsTrigger>
            {BANK_TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} data-testid={`tab-${tab.key}`}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="general" className="mt-4">
            <MovimientosGeneralTable />
          </TabsContent>

          {BANK_TABS.map((tab) => (
            <TabsContent key={tab.key} value={tab.key} className="mt-4 space-y-6">
              <BancoUploadPanel bank={tab.key} />
              <BancoMovimientosTable bank={tab.key} />
            </TabsContent>
          ))}
        </Tabs>
    </div>
  );
}
