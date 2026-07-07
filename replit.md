# Brika - Gestión de Archivos Excel

## Overview
Plataforma web para la empresa Brika que permite cargar, procesar y almacenar distintos tipos de archivos Excel con histórico en base de datos PostgreSQL. Acceso protegido con autenticación Google + sistema de invitaciones por email.

## Tipos de Archivos Soportados
1. **Cartola Banco de Chile** - Extractos bancarios
2. **Cobranza / Facturas** - Archivos descargados desde BSale
3. **Fact Ventas** - Ventas y devoluciones

## Design & Branding
- **Logo**: `attached_assets/image_1772290961922.png` (Brika Natural Organic — caligrafía + pluma verde salvia)
- **Color palette**: Verde salvia/orgánico como primario (`145 28% 38%`), fondos crema cálida (`40 25% 97%`), sidebar crema (`40 18% 92%`)
- **Font**: Nunito (Google Fonts)
- **Theme**: Light mode con verde salvia; dark mode con verdes más luminosos sobre fondo oscuro cálido

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + Shadcn UI
- **Backend**: Express.js + Multer (file uploads) + xlsx (Excel parsing)
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: Wouter (client-side)
- **Auth**: Replit Auth (OIDC) → Google OAuth

## Authentication & Access Control
- All routes protected by Google OAuth via Replit Auth
- `app_users` table controls who has access (whitelist approach)
- First user to log in auto-becomes admin
- Admins can invite users by email; invitees log in with their Google account
- Status: `invited` → `active` (on first login) | `revoked`
- Email invitations sent via Resend (if `RESEND_API_KEY` set); fallback: copy invite link
- Auth routes (public): `/api/login`, `/api/logout`, `/api/callback`, `/api/auth/user`

## BSale API Integration
- **Token**: `BSALE_ACCESS_TOKEN` environment secret (required)
- **Base URL**: `https://api.bsale.io/v1`
- **Client**: `server/bsale.ts` — handles pagination, variant/product/office/docType caching
- **Sync endpoint**: `POST /api/bsale/sync-ventas` — fetches documents with `expand=[details]`, maps to fact_ventas format, uses same dedup as manual upload
- **Status endpoint**: `GET /api/bsale/status` — returns `{configured: true/false}`
- **Document types mapped**: codeSii 39 (Boleta)→Venta, 33 (Factura)→Venta, 61 (NC)→Devolución
- **Field mapping**: emissionDate→"Fecha Venta", number→"Numero Documento", variant.code→"SKU", detail.netAmount→"Venta Total Neta", etc.
- **Frontend**: Collapsible "Sincronizar desde BSale" panel on Detalle Ventas page with date pickers

## Key Files
- `shared/schema.ts` - Data models (includes export from models/auth)
- `shared/models/auth.ts` - Blueprint auth tables (users, sessions)
- `server/routes.ts` - API endpoints; requireAppAccess + requireAdmin middleware
- `server/bsale.ts` - BSale API client with sync, caching, and field mapping
- `server/storage.ts` - DatabaseStorage with IStorage interface
- `server/db.ts` - Database connection
- `server/email.ts` - Resend email service for invitations
- `server/replit_integrations/auth/` - OIDC auth setup (replitAuth.ts, storage.ts, routes.ts)
- `server/parsers/cartola-parser.ts` - Parser for Cartola Banco de Chile
- `server/parsers/cobranza-parser.ts` - Specialized parser for BSale HTML-as-XLS files
- `client/src/App.tsx` - App with AuthGuard (redirects to /login if no session)
- `client/src/pages/login.tsx` - Split-screen login page with Google OAuth button
- `client/src/pages/usuarios.tsx` - User management page (admin only)
- `client/src/components/app-sidebar.tsx` - Navigation sidebar with user profile + logout
- `client/src/hooks/use-auth.ts` - useAuth hook for Replit Auth state

## API Endpoints
### Auth (public)
- `GET /api/login` - Start Google OAuth flow
- `GET /api/logout` - End session
- `GET /api/callback` - OAuth callback
- `GET /api/auth/user` - Replit Auth user info

### App (protected by requireAppAccess)
- `GET /api/me` - Current user from app_users {id, email, name, role, status, profileImageUrl}
- `GET /api/app-users` - List all app users (admin only)
- `POST /api/app-users/invite` - Invite user by email (admin only)
- `PATCH /api/app-users/:id/status` - Change user status active/revoked (admin only)
- `DELETE /api/app-users/:id` - Delete user (admin only)
- `POST /api/upload/:fileType` - Upload and process file
- `GET /api/files` - List files (optional ?fileType filter)
- `GET /api/files/:id` - Get file with data
- `DELETE /api/files/:id` - Delete file
- `GET /api/estado-resultados?year=YYYY` - Monthly P&L from Fact Ventas
- `GET /api/costos-operacionales?year=YYYY` - Costos operacionales from Cartola
- `GET /api/centro-costos` - Cartola movements with centroCostos, revisado, nDocumento, nDocIsOverride
- `POST /api/centro-costos/review` - Toggle revisado for a movement
- `POST /api/centro-costos/save-cc` - Save centro de costos for a movement
- `GET /api/centro-costos/candidatos-ndoc` - All BSale/fact_compras facturas for N° Doc picker
- `POST /api/centro-costos/save-ndocumento` - Save manual N° Documento override for a movement
- `GET/POST/PATCH/DELETE /api/centro-costos/rules` - Manage prediction rules
- `GET /api/facturas-revision` - Facturas with cartola matches + propuestas array
- `GET /api/facturas-revision/movimientos` - All abono movements from 3 banks with `usadoEn` usage info
- `POST /api/facturas-revision/:facturaKey` - Update factura estado (pagado/pendiente)
- `POST /api/facturas-revision/:facturaKey/propuestas` - Add a payment proposal (movimiento or nota)
- `DELETE /api/facturas-revision/:facturaKey/propuestas/:id` - Remove a payment proposal
- `GET /api/bsale/status` - Check if BSALE_ACCESS_TOKEN is configured
- `POST /api/bsale/sync-ventas` - Sync ventas from BSale API {desde, hasta} → imports into fact_ventas with dedup
- `GET /api/stock-disponible` - Stock actual por SKU con ventas post-fecha de stock descontadas
- `GET /api/siguiente-pedido` - SKUs a reponer con consumo mensual histórico (todo el historial de ventas)
- `GET /api/ventas-amigo` - List all ventas amigo
- `POST /api/ventas-amigo` - Create new venta amigo {fechaCompra, nombre, monto, unidades}
- `PATCH /api/ventas-amigo/:id/estado` - Update venta estado {estado: pagado|pendiente}

## Database Schema
- `sessions` - Express session storage (connect-pg-simple)
- `users` - Replit Auth user profiles (sub, email, firstName, lastName, profileImageUrl)
- `app_users` - Brika access control (email, name, role, status, invitedBy, invitedAt, lastLoginAt)
- `uploaded_files` - id, file_type, original_filename, uploaded_at, row_count, status, headers, data (jsonb)
- `centro_costos_rules` - id, pattern, centro_costos, match_type (contains/exact), priority
- `centro_costos_reviews` - id, movement_key (fileId|rowIdx), revisado (0/1), centro_costos, n_documento_override
- `factura_reviews` - id, factura_key, estado, cartola_movement_key (synced from first propuesta on confirm)
- `factura_propuestas` - id, factura_key, tipo (movimiento|nota), cartola_movement_key, nota_manual (many-to-many proposals)
- `ventas_amigo` - id (serial), fecha_registro (timestamp), fecha_compra (text), nombre (text), monto (integer), unidades (integer), costo_producto (integer, nullable), estado (text: pagado|pendiente)
- `discontinued_products` - sku (text PK, lowercase), nombre (text snapshot), fecha_descontinuado (timestamp). Filters BSale stock results in /api/stock-disponible and /api/siguiente-pedido.

### Dedicated Row Tables (additive, dual-write alongside uploaded_files JSONB)
All have FK `uploaded_file_id → uploaded_files.id` (cascade delete), serial PK, and unique expression indexes with LOWER() on text keys and raw numeric keys for dedup:
- `cartola_rows` - fecha, detalle_movimiento, cheque_o_cargo, deposito_o_abono, saldo, docto_nro, trn, caja, sucursal
- `cartola_security_rows` - fecha, detalle_movimiento, docto_nro, cargo, abono, saldo
- `cartola_falabella_rows` - fecha, oficina, nro_doc, descripcion, cargo, abono, saldo
- `cartola_global66_clp_rows` - fecha, descripcion, movimiento, debito, abono, saldo (CLP integers)
- `cartola_global66_usd_rows` - fecha, descripcion, movimiento, debito, abono, saldo (USD floats)
- `cobranza_rows` - tipo_documento, n_documento, rut_cliente, fecha_emision, + montos + estado
- `fact_ventas_rows` - numero_documento, sku, tipo_movimiento, cantidad, venta_total_neta, costo_total_neto, fecha_venta, extra_data (jsonb)
- `fact_compras_rows` - folio, rut, fecha_emision, estado, razon_social, + montos, + acuse/notificacion
- `stock_rows` - sku, producto, stock_date, extra_data (jsonb)
- Backfill script: `npx tsx server/scripts/backfill-dedicated-tables.ts` (idempotent)

## Centro de Costos Prediction
- Rules-based: matches "Detalle Movimiento" against patterns in centro_costos_rules table
- Exact > contains; among contains, higher priority + longer pattern wins
- Positive monto with no match → default C-VENTA

## Email Invitations
- Uses Resend API (package installed, requires RESEND_API_KEY env var)
- If not configured, gracefully shows invite link to copy
- Email template: branded, shows who invited, CTA button to app URL

## Parsing Notes
- BSale Cobranza: HTML disguised as .xls → use HTML parser
- Cartola dates: mix of Excel serials and dd/mm/yyyy text
- Cartola values: stored as "+0001999497" format → strip non-numeric chars
