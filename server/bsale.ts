const BASE_URL = "https://api.bsale.io/v1";

function getToken(): string {
  const token = process.env.BSALE_ACCESS_TOKEN;
  if (!token) throw new Error("BSALE_ACCESS_TOKEN no configurado");
  return token;
}

interface BsalePaginatedResponse {
  href: string;
  count: number;
  limit: number;
  offset: number;
  items: any[];
}

async function bsaleFetch(path: string, params: Record<string, string> = {}): Promise<BsalePaginatedResponse> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { access_token: getToken() },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`BSale API ${res.status}: ${text}`);
  }

  return res.json();
}

async function bsaleFetchSingle(path: string): Promise<any> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { access_token: getToken() },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`BSale API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function testConnection(): Promise<boolean> {
  try {
    await bsaleFetch("/document_types.json", { limit: "1" });
    return true;
  } catch {
    return false;
  }
}

export function isConfigured(): boolean {
  return !!process.env.BSALE_ACCESS_TOKEN;
}

interface VariantInfo {
  code: string;
  description: string;
  productName: string;
  productTypeName: string;
  brandName: string;
  cost: number | null;
}

const variantCache = new Map<string, VariantInfo>();

async function getVariant(variantId: string): Promise<VariantInfo> {
  if (variantCache.has(variantId)) return variantCache.get(variantId)!;

  try {
    const data = await bsaleFetchSingle(`/variants/${variantId}.json?expand=[costs]`);

    let productName = "";
    let productTypeName = "";
    let brandName = "";

    if (data.product?.href) {
      try {
        const product = await bsaleFetchSingle(data.product.href.replace(BASE_URL, "").replace("https://api.bsale.cl/v1", ""));
        productName = product.name || "";

        if (product.product_type?.href) {
          try {
            const pt = await bsaleFetchSingle(product.product_type.href.replace(BASE_URL, "").replace("https://api.bsale.cl/v1", ""));
            productTypeName = pt.name || "";
          } catch { }
        }
        if (product.brand?.href) {
          try {
            const br = await bsaleFetchSingle(product.brand.href.replace(BASE_URL, "").replace("https://api.bsale.cl/v1", ""));
            brandName = br.name || "";
          } catch { }
        }
      } catch { }
    }

    const rawCost = data.costs?.averageCost ?? null;
    const cost = rawCost != null && rawCost !== "" ? Number(rawCost) : null;

    const info: VariantInfo = {
      code: data.code || data.barCode || "",
      description: data.description || "",
      productName,
      productTypeName,
      brandName,
      cost: cost !== null && !isNaN(cost) ? cost : null,
    };

    variantCache.set(variantId, info);
    return info;
  } catch {
    const fallback: VariantInfo = { code: "", description: "", productName: "", productTypeName: "", brandName: "", cost: null };
    variantCache.set(variantId, fallback);
    return fallback;
  }
}

interface DocumentTypeInfo {
  id: number;
  name: string;
  codeSii: number;
}

const docTypeCache = new Map<string, DocumentTypeInfo>();

async function getDocumentType(dtRef: { href?: string; id?: string }): Promise<DocumentTypeInfo> {
  const dtId = String(dtRef.id || "");
  if (docTypeCache.has(dtId)) return docTypeCache.get(dtId)!;

  try {
    if (dtRef.href) {
      const data = await bsaleFetchSingle(dtRef.href.replace(BASE_URL, "").replace("https://api.bsale.cl/v1", ""));
      const info: DocumentTypeInfo = {
        id: data.id,
        name: data.name || "",
        codeSii: data.codeSii || 0,
      };
      docTypeCache.set(dtId, info);
      return info;
    }
  } catch { }

  const fallback: DocumentTypeInfo = { id: Number(dtId), name: "", codeSii: 0 };
  docTypeCache.set(dtId, fallback);
  return fallback;
}

interface ClientInfo {
  firstName: string;
  lastName: string;
  company: string;
  code: string;
  email: string;
  municipality: string;
  city: string;
}

const clientCache = new Map<string, ClientInfo>();

async function getClient(clientRef: { href?: string; id?: string }): Promise<ClientInfo> {
  const clientId = String(clientRef?.id || "");
  if (clientId && clientCache.has(clientId)) return clientCache.get(clientId)!;
  const fallback: ClientInfo = { firstName: "", lastName: "", company: "", code: "", email: "", municipality: "", city: "" };
  if (!clientRef?.href) return fallback;

  try {
    const data = await bsaleFetchSingle(clientRef.href.replace(BASE_URL, "").replace("https://api.bsale.cl/v1", ""));
    const info: ClientInfo = {
      firstName: data.firstName || "",
      lastName: data.lastName || "",
      company: data.company || "",
      code: data.code || "",
      email: data.email || "",
      municipality: data.municipality || "",
      city: data.city || "",
    };
    if (clientId) clientCache.set(clientId, info);
    return info;
  } catch {
    return fallback;
  }
}

function clienteDisplayName(client: ClientInfo): string {
  const company = (client.company || "").trim();
  if (company) return company;
  return [client.firstName, client.lastName].filter(Boolean).join(" ").trim();
}

export async function lookupContactByRut(rut: string): Promise<{ firstName: string; lastName: string } | null> {
  const code = rut.trim();
  if (!code) return null;
  const codeKey = code.toLowerCase();
  try {
    const resp = await bsaleFetch("/clients.json", { code, limit: "10" });
    if (!resp.items || resp.items.length === 0) return null;
    // Strict exact-code match only. The BSale `?code=` filter is reportedly
    // exact, but we double-check defensively to avoid persisting the wrong
    // contact (idempotent skip would lock a wrong value in place).
    const match = resp.items.find((it: any) => (it.code || "").trim().toLowerCase() === codeKey);
    if (!match) return null;
    const firstName = (match.firstName || "").trim();
    const lastName = (match.lastName || "").trim();
    if (!firstName && !lastName) return null;
    return { firstName, lastName };
  } catch {
    return null;
  }
}

export async function lookupClientInfoByRut(rut: string): Promise<{ company: string; firstName: string; lastName: string } | null> {
  const code = rut.trim();
  if (!code) return null;
  const codeKey = code.toLowerCase();
  try {
    const resp = await bsaleFetch("/clients.json", { code, limit: "10" });
    if (!resp.items || resp.items.length === 0) return null;
    const match = resp.items.find((it: any) => (it.code || "").trim().toLowerCase() === codeKey);
    if (!match) return null;
    const company = (match.company || "").trim();
    const firstName = (match.firstName || "").trim();
    const lastName = (match.lastName || "").trim();
    if (!company && !firstName && !lastName) return null;
    return { company, firstName, lastName };
  } catch {
    return null;
  }
}

interface OfficeInfo {
  name: string;
}

const officeCache = new Map<string, OfficeInfo>();

async function getOffice(officeRef: { href?: string; id?: string }): Promise<OfficeInfo> {
  const offId = String(officeRef?.id || "");
  if (officeCache.has(offId)) return officeCache.get(offId)!;
  const fallback: OfficeInfo = { name: "" };
  if (!officeRef?.href) return fallback;

  try {
    const data = await bsaleFetchSingle(officeRef.href.replace(BASE_URL, "").replace("https://api.bsale.cl/v1", ""));
    const info: OfficeInfo = { name: data.name || "" };
    officeCache.set(offId, info);
    return info;
  } catch {
    officeCache.set(offId, fallback);
    return fallback;
  }
}

function unixToDate(ts: number): string {
  const d = new Date(ts * 1000);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function dateToUnixStart(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  return Math.floor(d.getTime() / 1000);
}

function dateToUnixEnd(dateStr: string): number {
  const d = new Date(dateStr + "T23:59:59Z");
  return Math.floor(d.getTime() / 1000);
}

function getTipoMovimiento(codeSii: number): string {
  if (codeSii === 61) return "Devolución";
  return "Venta";
}

export interface BsaleStockItem {
  sku: string;
  tipoProducto: string;
  producto: string;
  variante: string;
  quantityAvailable: number;
}

interface StockCacheEntry {
  items: BsaleStockItem[];
  fetchedAt: number;
}

let stockCache: StockCacheEntry | null = null;
const STOCK_CACHE_TTL_MS = 5 * 60 * 1000;

export async function fetchBsaleStock(): Promise<BsaleStockItem[]> {
  const now = Date.now();
  if (stockCache && now - stockCache.fetchedAt < STOCK_CACHE_TTL_MS) {
    return stockCache.items;
  }

  const skuMap = new Map<string, BsaleStockItem>();
  let offset = 0;
  const limit = 50;

  while (true) {
    const resp = await bsaleFetch("/stocks.json", {
      expand: "[variant[product[product_type]]]",
      limit: String(limit),
      offset: String(offset),
    });

    if (!resp.items || resp.items.length === 0) break;

    for (const item of resp.items) {
      const variant = item.variant;
      if (!variant) continue;

      const sku = String(variant.code || "").trim();
      if (!sku) continue;

      const product = variant.product;
      const productType = product?.product_type;
      const tipoProducto = String(productType?.name || "").trim();
      const producto = String(product?.name || "").trim();
      const variante = String(variant.description || "").trim();
      const qty = Number(item.quantityAvailable ?? 0);

      const existing = skuMap.get(sku);
      if (existing) {
        existing.quantityAvailable += qty;
      } else {
        skuMap.set(sku, { sku, tipoProducto, producto, variante, quantityAvailable: qty });
      }
    }

    if (resp.items.length < limit) break;
    offset += limit;
  }

  const items = Array.from(skuMap.values());
  stockCache = { items, fetchedAt: now };
  return items;
}

export function clearStockCache(): void {
  stockCache = null;
}

export interface SyncResult {
  totalBsale: number;
  insertadas: number;
  duplicadas: number;
  rows: Record<string, unknown>[];
}

export async function syncVentas(desde: string, hasta: string): Promise<SyncResult> {
  const desdeUnix = dateToUnixStart(desde);
  const hastaUnix = dateToUnixEnd(hasta);

  variantCache.clear();
  docTypeCache.clear();
  officeCache.clear();
  clientCache.clear();

  const allDocs: any[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const resp = await bsaleFetch("/documents.json", {
      emissiondaterange: `[${desdeUnix},${hastaUnix}]`,
      limit: String(limit),
      offset: String(offset),
      state: "0",
      expand: "[details]",
    });

    if (!resp.items || resp.items.length === 0) break;
    allDocs.push(...resp.items);

    if (resp.items.length < limit) break;
    offset += limit;
  }

  if (allDocs.length > 2000) {
    console.warn(`BSale sync: ${allDocs.length} documentos encontrados (> 2000)`);
  }

  const rows: Record<string, unknown>[] = [];

  let firstDetailLogged = false;

  for (const doc of allDocs) {
    if (doc.state === 1) continue;

    const docType = await getDocumentType(doc.document_type || {});
    const tipoMovimiento = getTipoMovimiento(docType.codeSii);
    const fechaVenta = unixToDate(doc.emissionDate);
    const numDocumento = String(doc.number || "");

    const client = await getClient(doc.client || {});
    const office = await getOffice(doc.office || {});

    let details: any[] = [];
    if (doc.details?.items && Array.isArray(doc.details.items)) {
      details = doc.details.items;
    } else if (doc.details?.href) {
      try {
        const detailsResp = await bsaleFetchSingle(doc.details.href.replace(BASE_URL, "").replace("https://api.bsale.cl/v1", ""));
        details = detailsResp.items || [];
      } catch (e) {
        console.error(`Error fetching details for doc ${doc.id}:`, e);
      }
    }

    for (const detail of details) {
      if (!firstDetailLogged) {
        firstDetailLogged = true;
        console.log("[BSale cost debug] Raw detail keys:", Object.keys(detail));
        console.log("[BSale cost debug] Cost-related fields:", {
          unitCost: detail.unitCost,
          averageCost: detail.averageCost,
          cost: detail.cost,
          netUnitValue: detail.netUnitValue,
          quantity: detail.quantity,
        });
      }

      let variant: VariantInfo = {
        code: detail.variant?.code || "",
        description: detail.variant?.description || "",
        productName: "",
        productTypeName: "",
        brandName: "",
        cost: null,
      };
      if (detail.variant?.id) {
        const fetched = await getVariant(String(detail.variant.id));
        variant = {
          code: fetched.code || variant.code,
          description: fetched.description || variant.description,
          productName: fetched.productName,
          productTypeName: fetched.productTypeName,
          brandName: fetched.brandName,
          cost: fetched.cost,
        };
      }

      const cantidad = detail.quantity ?? 0;
      const netUnitValue = detail.netUnitValue ?? 0;
      const netAmount = detail.netAmount ?? 0;

      const unitCost = variant.cost ?? null;

      const costoTotalNeto = unitCost != null ? unitCost * cantidad : null;
      const margen = unitCost != null ? netAmount - unitCost * cantidad : null;
      const pctMargen = margen != null && netAmount !== 0 ? margen / netAmount : null;
      const discountPct = detail.discount != null ? Number(detail.discount) : null;
      const descuentoNeto = discountPct != null ? Math.round(netUnitValue * cantidad * discountPct) : null;

      const row: Record<string, unknown> = {
        "Fecha Venta": fechaVenta,
        "Tipo de Documento": docType.name,
        "Numero Documento": numDocumento,
        "Tipo Movimiento": tipoMovimiento,
        "Nombre Cliente": clienteDisplayName(client),
        "Cliente RUT": client.code,
        "Sucursal": office.name,
        "Vendedor": "",
        "SKU": variant.code,
        "Producto / Servicio": variant.productName,
        "Variante": variant.description,
        "Marca": variant.brandName,
        "Tipo de Producto / Servicio": variant.productTypeName,
        "Cantidad": cantidad,
        "Precio de Lista": "",
        "Precio Neto Unitario": netUnitValue,
        "Precio Bruto Unitario": detail.totalUnitValue ?? 0,
        "% Descuento": discountPct ?? "",
        "Descuento Neto": descuentoNeto ?? "",
        "Descuento Bruto": "",
        "Venta Total Neta": netAmount,
        "Venta Total Bruta": detail.totalAmount ?? 0,
        "Total Impuestos": detail.taxAmount ?? 0,
        "Costo neto unitario": unitCost ?? "",
        "Costo Total Neto": costoTotalNeto ?? "",
        "Margen": margen ?? "",
        "% Margen": pctMargen ?? "",
        "Moneda": "CLP",
        "Lista de Precio": "",
        "Tipo de entrega": "",
        "Nombre de dcto": "",
        "Hora Venta": "",
        "Cliente Ciudad": client.city,
        "Cliente Comuna": client.municipality,
        "Cliente Dirección": "",
        "Email Cliente": client.email,
        "Tracking number": "",
        "Otros Atributos": "",
        "Detalle de Productos/Servicios Pack/Promo": "",
      };

      rows.push(row);
    }
  }

  return {
    totalBsale: allDocs.length,
    insertadas: 0,
    duplicadas: 0,
    rows,
  };
}

function unixToISO(ts: number): string {
  const d = new Date(ts * 1000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const COBRANZA_TIPOS_VALIDOS = new Set(["BOLETA ELECTRÓNICA", "FACTURA ELECTRÓNICA"]);

const FACT_COMPRAS_CODESII: Record<string, string> = {
  "30": "FACTURA",
  "32": "FACTURA EXENTA",
  "33": "FACTURA ELECTRÓNICA",
  "34": "FACTURA NO AFECTA O EXENTA ELECTRÓNICA",
  "43": "LIQUIDACIÓN-FACTURA ELECTRÓNICA",
  "46": "FACTURA DE COMPRA ELECTRÓNICA",
  "55": "NOTA DE DÉBITO DE COMPRA",
  "56": "NOTA DE DÉBITO ELECTRÓNICA",
  "61": "NOTA DE CRÉDITO ELECTRÓNICA",
};

function codeSiiToTipoDocumento(codeSii: string): string {
  return FACT_COMPRAS_CODESII[String(codeSii)] || `DTE ${codeSii}`;
}

function bsaleEstado(canceled: number, include: number): string {
  if (canceled === 1) return "Reclamados";
  if (include === 0) return "Sin Considerar";
  return "Aceptados";
}

export async function syncFactCompras(desde: string, hasta: string): Promise<SyncResult> {
  const [desdeYear, desdeMonth] = desde.split("-").map(Number);
  const [hastaYear, hastaMonth] = hasta.split("-").map(Number);

  // Exact unix bounds for post-filtering by emissionDate
  const desdeUnix = dateToUnixStart(desde);
  const hastaUnix = dateToUnixEnd(hasta);

  const allDocs: any[] = [];

  let year = desdeYear;
  let month = desdeMonth;

  while (year < hastaYear || (year === hastaYear && month <= hastaMonth)) {
    let offset = 0;
    const limit = 50;

    while (true) {
      const resp = await bsaleFetch("/third_party_documents.json", {
        month: String(month),
        year: String(year),
        limit: String(limit),
        offset: String(offset),
      });

      if (!resp.items || resp.items.length === 0) break;
      allDocs.push(...resp.items);
      if (resp.items.length < limit) break;
      offset += limit;
    }

    month++;
    if (month > 12) { month = 1; year++; }
  }

  if (allDocs.length > 5000) {
    console.warn(`BSale syncFactCompras: ${allDocs.length} documentos (> 5000)`);
  }

  const rows: Record<string, unknown>[] = [];

  for (const doc of allDocs) {
    // Strict bookType filter — must be explicitly "compra"
    if (doc.bookType !== "compra") continue;

    // Post-filter by exact emission date within the requested range
    const emissionTs = Number(doc.emissionDate ?? 0);
    if (emissionTs < desdeUnix || emissionTs > hastaUnix) continue;

    const tipoDocumento = codeSiiToTipoDocumento(String(doc.codeSii ?? ""));
    const estado = bsaleEstado(Number(doc.canceled ?? 0), Number(doc.include ?? 1));
    const fechaEmision = doc.emissionDate ? unixToDate(Number(doc.emissionDate)) : "";
    const fechaAcuse = doc.siiReceptionDate && Number(doc.siiReceptionDate) > 0
      ? unixToDate(Number(doc.siiReceptionDate))
      : "";

    const row: Record<string, unknown> = {
      "Fecha Emisión": fechaEmision,
      "Tipo Documento": tipoDocumento,
      "Folio": String(doc.number ?? ""),
      "RUT": String(doc.clientCode ?? ""),
      "Razón Social": String(doc.clientActivity ?? ""),
      "Monto Exento": doc.exemptAmount ?? 0,
      "Monto Neto": doc.netAmount ?? 0,
      "Monto Iva": doc.ivaAmount ?? 0,
      "Impto. Especifico": doc.specificTaxAmount != null && doc.specificTaxAmount !== "" ? Number(doc.specificTaxAmount) : 0,
      "Monto Total": doc.totalAmount ?? 0,
      "Fecha Acuse de Mercadería": fechaAcuse,
      "Notificación Comercial": "",
      "Fecha Notificación Comercial": "",
      "XML recepcionado": "",
      "Estado": estado,
    };

    rows.push(row);
  }

  return {
    totalBsale: allDocs.length,
    insertadas: 0,
    duplicadas: 0,
    rows,
  };
}

export async function syncCobranza(desde: string, hasta: string): Promise<SyncResult> {
  const desdeUnix = dateToUnixStart(desde);
  const hastaUnix = dateToUnixEnd(hasta);

  docTypeCache.clear();
  clientCache.clear();

  const allDocs: any[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const resp = await bsaleFetch("/documents.json", {
      emissiondaterange: `[${desdeUnix},${hastaUnix}]`,
      limit: String(limit),
      offset: String(offset),
      state: "0",
    });

    if (!resp.items || resp.items.length === 0) break;
    allDocs.push(...resp.items);

    if (resp.items.length < limit) break;
    offset += limit;
  }

  if (allDocs.length > 2000) {
    console.warn(`BSale syncCobranza: ${allDocs.length} documentos (> 2000)`);
  }

  const rows: Record<string, unknown>[] = [];

  for (const doc of allDocs) {
    if (doc.state === 1) continue;

    const docType = await getDocumentType(doc.document_type || {});
    const tipoDoc = (docType.name || "").toUpperCase().trim();
    if (!COBRANZA_TIPOS_VALIDOS.has(tipoDoc)) continue;

    const client = await getClient(doc.client || {});
    const clienteNombre = clienteDisplayName(client);
    const razonSocial = (client.company || "").trim();
    const fechaEmision = unixToISO(doc.emissionDate);
    const nDocumento = String(doc.number || "");

    const row: Record<string, unknown> = {
      "Tipo Documento": tipoDoc,
      "Nº Documento": nDocumento,
      "Cliente": clienteNombre,
      "Nombre Cliente": clienteNombre,
      "Razón Social": razonSocial,
      "Rut Cliente": client.code,
      "Fecha Emisión": fechaEmision,
      "Monto Documento": doc.totalAmount ?? 0,
      "Monto Neto Documento": doc.netAmount ?? 0,
      "Monto Exento Documento": doc.exemptAmount ?? 0,
      "Monto IVA Documento": doc.taxAmount ?? 0,
    };

    rows.push(row);
  }

  return {
    totalBsale: allDocs.length,
    insertadas: 0,
    duplicadas: 0,
    rows,
  };
}
