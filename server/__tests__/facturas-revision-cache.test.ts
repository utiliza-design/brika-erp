import { describe, it, expect, beforeEach } from "vitest";
import { cacheGet, cacheSet, cacheInvalidatePrefix, cacheInvalidateAll, cachePatchArrayItem } from "../cache";
import { computeFacturaEstado } from "../db-helpers";

describe("computeFacturaEstado (Pure Function)", () => {
  it("debe retornar el estado explícito del savedReview si existe", () => {
    expect(computeFacturaEstado({ estado: "pagado" }, 0, null)).toBe("pagado");
    expect(computeFacturaEstado({ estado: "pendiente" }, 2, { movementKey: "m1" })).toBe("pendiente");
    expect(computeFacturaEstado({ estado: "propuesto" }, 0, null)).toBe("propuesto");
  });

  it("debe retornar 'propuesto' si no hay review pero existen propuestas manuales", () => {
    expect(computeFacturaEstado(null, 1, null)).toBe("propuesto");
    expect(computeFacturaEstado(undefined, 3, null)).toBe("propuesto");
  });

  it("debe retornar 'propuesto' si no hay review pero existe matchCartola (automatch)", () => {
    const mockMatch = { movementKey: "mov-1", fecha: "01/05/2026", detalle: "PAGO", monto: 10000, banco: "Banco de Chile" };
    expect(computeFacturaEstado(null, 0, mockMatch)).toBe("propuesto");
    expect(computeFacturaEstado(undefined, 0, mockMatch)).toBe("propuesto");
  });

  it("debe retornar 'pendiente' si no hay review, no hay propuestas y matchCartola es null", () => {
    expect(computeFacturaEstado(null, 0, null)).toBe("pendiente");
    expect(computeFacturaEstado(undefined, 0, null)).toBe("pendiente");
  });
});

describe("cachePatchArrayItem (Server Cache)", () => {
  beforeEach(() => {
    cacheInvalidateAll();
  });

  it("debe retornar false si la clave no existe en el cache", () => {
    const updated = cachePatchArrayItem<{ id: string; val: number }>(
      "nonexistent_key",
      item => item.id === "1",
      item => ({ ...item, val: item.val + 1 })
    );
    expect(updated).toBe(false);
  });

  it("debe actualizar quirúrgicamente un elemento en un array cacheado", () => {
    const initialList = [
      { facturaKey: "FACTURA|100", estado: "pendiente", propuestas: [] },
      { facturaKey: "FACTURA|200", estado: "pendiente", propuestas: [] },
    ];
    cacheSet("fr:main", initialList, 60_000);

    const patched = cachePatchArrayItem<{ facturaKey: string; estado: string; propuestas: any[] }>(
      "fr:main",
      item => item.facturaKey === "FACTURA|100",
      item => ({ ...item, estado: "pagado" })
    );

    expect(patched).toBe(true);

    const cached = cacheGet<typeof initialList>("fr:main");
    expect(cached).toBeDefined();
    expect(cached).toHaveLength(2);
    expect(cached?.find(f => f.facturaKey === "FACTURA|100")?.estado).toBe("pagado");
    expect(cached?.find(f => f.facturaKey === "FACTURA|200")?.estado).toBe("pendiente");
  });

  it("no debe modificar el caché ni fallar si ningún elemento cumple el predicado", () => {
    const initialList = [
      { facturaKey: "FACTURA|100", estado: "pendiente" }
    ];
    cacheSet("fr:main", initialList, 60_000);

    const patched = cachePatchArrayItem<{ facturaKey: string; estado: string }>(
      "fr:main",
      item => item.facturaKey === "FACTURA|999",
      item => ({ ...item, estado: "pagado" })
    );

    expect(patched).toBe(false);
    const cached = cacheGet<typeof initialList>("fr:main");
    expect(cached?.[0].estado).toBe("pendiente");
  });

  it("debe retornar false si el elemento cacheado ya expiró", () => {
    cacheSet("fr:main", [{ facturaKey: "F1" }], -1000);

    const patched = cachePatchArrayItem<{ facturaKey: string }>(
      "fr:main",
      item => item.facturaKey === "F1",
      item => ({ ...item })
    );

    expect(patched).toBe(false);
    expect(cacheGet("fr:main")).toBeUndefined();
  });
});

describe("Facturas Revisión Mutations & Centro de Costos Isolation (Spec 004)", () => {
  beforeEach(() => {
    cacheInvalidateAll();
  });

  it("Mutación 1 (Marcar pagado): actualiza el estado en fr:main sin tocar cc:main", () => {
    const frCache = [
      { facturaKey: "FACTURA|100", estado: "pendiente", propuestas: [], matchCartola: null },
      { facturaKey: "FACTURA|200", estado: "pendiente", propuestas: [], matchCartola: null },
    ];
    const ccCache = [{ movementKey: "m-1", centro: "VENTAS" }];

    cacheSet("fr:main", frCache, 300_000);
    cacheSet("cc:main", ccCache, 300_000);

    const review = { estado: "pagado" };
    cachePatchArrayItem<any>("fr:main", item => item.facturaKey === "FACTURA|100", item => ({
      ...item,
      estado: computeFacturaEstado(review, (item.propuestas ?? []).length, item.matchCartola),
    }));

    const updatedFr = cacheGet<any[]>("fr:main");
    expect(updatedFr?.find(f => f.facturaKey === "FACTURA|100")?.estado).toBe("pagado");
    expect(updatedFr?.find(f => f.facturaKey === "FACTURA|200")?.estado).toBe("pendiente");

    const untouchedCc = cacheGet<any[]>("cc:main");
    expect(untouchedCc).toEqual(ccCache);
  });

  it("Mutación 2 (Agregar propuesta): agrega la propuesta y transiciona a 'propuesto' sin tocar cc:", () => {
    const frCache = [
      { facturaKey: "FACTURA|100", estado: "pendiente", propuestas: [], matchCartola: null },
    ];
    cacheSet("fr:main", frCache, 300_000);
    cacheSet("cc:main", [{ id: "cc1" }], 300_000);

    const nuevaPropuesta = {
      id: "prop-1",
      tipo: "movimiento",
      cartolaMovementKey: "cartola-1",
      monto: 50000,
      banco: "Banco de Chile",
    };

    cachePatchArrayItem<any>("fr:main", item => item.facturaKey === "FACTURA|100", item => {
      const currentPropuestas = [...(item.propuestas ?? []), nuevaPropuesta];
      const savedReview = item.estado === "pagado" ? { estado: "pagado" } : null;
      return {
        ...item,
        propuestas: currentPropuestas,
        estado: computeFacturaEstado(savedReview, currentPropuestas.length, item.matchCartola),
      };
    });

    const updatedFr = cacheGet<any[]>("fr:main");
    const item = updatedFr?.find(f => f.facturaKey === "FACTURA|100");
    expect(item?.estado).toBe("propuesto");
    expect(item?.propuestas).toHaveLength(1);
    expect(item?.propuestas[0].id).toBe("prop-1");

    expect(cacheGet("cc:main")).toBeDefined();
  });

  it("Mutación 3 (Eliminar propuesta): elimina la propuesta y vuelve a 'pendiente' si no hay más propuestas ni match", () => {
    const frCache = [
      {
        facturaKey: "FACTURA|100",
        estado: "propuesto",
        propuestas: [{ id: "prop-1", tipo: "nota", notaManual: "esperando comprobante" }],
        matchCartola: null,
      },
    ];
    cacheSet("fr:main", frCache, 300_000);
    cacheSet("cc:main", [{ id: "cc1" }], 300_000);

    cachePatchArrayItem<any>("fr:main", item => item.facturaKey === "FACTURA|100", item => {
      const currentPropuestas = (item.propuestas ?? []).filter((p: any) => p.id !== "prop-1");
      const savedReview = item.estado === "pagado" ? { estado: "pagado" } : null;
      return {
        ...item,
        propuestas: currentPropuestas,
        estado: computeFacturaEstado(savedReview, currentPropuestas.length, item.matchCartola),
      };
    });

    const updatedFr = cacheGet<any[]>("fr:main");
    const item = updatedFr?.find(f => f.facturaKey === "FACTURA|100");
    expect(item?.estado).toBe("pendiente");
    expect(item?.propuestas).toHaveLength(0);
    expect(cacheGet("cc:main")).toBeDefined();
  });

  it("Mutación 4 (Rechazar automatch): descarta matchCartola y vuelve a 'pendiente' sin tocar cc:", () => {
    const frCache = [
      {
        facturaKey: "FACTURA|100",
        estado: "propuesto",
        propuestas: [],
        matchCartola: { movementKey: "mov-1", fecha: "01/05/2026", detalle: "TRANSF", monto: 12000, banco: "Banco de Chile" },
      },
    ];
    cacheSet("fr:main", frCache, 300_000);
    cacheSet("cc:main", [{ id: "cc1" }], 300_000);

    cachePatchArrayItem<any>("fr:main", item => item.facturaKey === "FACTURA|100", item => {
      const currentPropuestas = item.propuestas ?? [];
      const savedReview = item.estado === "pagado" ? { estado: "pagado" } : null;
      return {
        ...item,
        matchCartola: null,
        estado: computeFacturaEstado(savedReview, currentPropuestas.length, null),
      };
    });

    const updatedFr = cacheGet<any[]>("fr:main");
    const item = updatedFr?.find(f => f.facturaKey === "FACTURA|100");
    expect(item?.estado).toBe("pendiente");
    expect(item?.matchCartola).toBeNull();
    expect(cacheGet("cc:main")).toBeDefined();
  });

  it("Camino frío (Tarea 4.4): importación masiva invalida fr: forzando recálculo en siguiente GET", () => {
    const frCache = [{ facturaKey: "FACTURA|100", estado: "pendiente" }];
    cacheSet("fr:main", frCache, 300_000);

    cacheInvalidatePrefix("fr:");

    const cachedAfterMassiveImport = cacheGet<any[]>("fr:main");
    expect(cachedAfterMassiveImport).toBeUndefined();
  });
});
