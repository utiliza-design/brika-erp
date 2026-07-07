-- Migration: Change facturaKey from `fileId|rowIndex` to `tipoDocumento|nDocumento`
-- This makes the key stable across re-imports of the same cobranza file.
--
-- Old format: <uuid>|<rowIndex>  (e.g. "c643c4f9-...|38")
-- New format: <tipoDoc>|<nDoc>   (e.g. "FACTURA ELECTRÓNICA|2530")
-- tipoDocumento is normalized to UPPER() for consistent casing.

-- Step 1: Delete duplicate factura_reviews that would map to the same new key.
-- When the same document appears in multiple uploaded files, keep only the best record
-- (prefer: has cartola_movement_key, then estado=pagado, then estado=propuesto).
WITH parsed AS (
  SELECT
    id,
    factura_key AS old_key,
    SPLIT_PART(factura_key, '|', 1) AS file_id,
    (SPLIT_PART(factura_key, '|', 2))::int AS row_idx
  FROM factura_reviews
  WHERE factura_key ~ '^[0-9a-f-]{36}\|[0-9]+$'
),
new_keys AS (
  SELECT
    p.id,
    UPPER(TRIM(uf.data->p.row_idx->>'Tipo Documento')) || '|' ||
    TRIM(uf.data->p.row_idx->>'Nº Documento') AS new_key,
    fr.cartola_movement_key,
    fr.estado
  FROM parsed p
  JOIN uploaded_files uf ON uf.id = p.file_id
  JOIN factura_reviews fr ON fr.id = p.id
  WHERE uf.data->p.row_idx IS NOT NULL
    AND TRIM(uf.data->p.row_idx->>'Nº Documento') != ''
    AND TRIM(uf.data->p.row_idx->>'Tipo Documento') != ''
),
ranked AS (
  SELECT
    id,
    new_key,
    ROW_NUMBER() OVER (
      PARTITION BY new_key
      ORDER BY
        CASE WHEN cartola_movement_key IS NOT NULL AND cartola_movement_key != '' THEN 0 ELSE 1 END,
        CASE estado WHEN 'pagado' THEN 0 WHEN 'propuesto' THEN 1 ELSE 2 END
    ) AS rn
  FROM new_keys
)
DELETE FROM factura_reviews
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2: Update remaining factura_reviews to new key format.
WITH parsed AS (
  SELECT
    id,
    SPLIT_PART(factura_key, '|', 1) AS file_id,
    (SPLIT_PART(factura_key, '|', 2))::int AS row_idx
  FROM factura_reviews
  WHERE factura_key ~ '^[0-9a-f-]{36}\|[0-9]+$'
),
new_keys AS (
  SELECT
    p.id,
    UPPER(TRIM(uf.data->p.row_idx->>'Tipo Documento')) || '|' ||
    TRIM(uf.data->p.row_idx->>'Nº Documento') AS new_key
  FROM parsed p
  JOIN uploaded_files uf ON uf.id = p.file_id
  WHERE uf.data->p.row_idx IS NOT NULL
    AND TRIM(uf.data->p.row_idx->>'Nº Documento') != ''
    AND TRIM(uf.data->p.row_idx->>'Tipo Documento') != ''
)
UPDATE factura_reviews fr
SET factura_key = nk.new_key
FROM new_keys nk
WHERE fr.id = nk.id;

-- Step 3: Same for factura_auto_match_rejections (deduplicate then update).
WITH parsed AS (
  SELECT
    id,
    factura_key AS old_key,
    SPLIT_PART(factura_key, '|', 1) AS file_id,
    (SPLIT_PART(factura_key, '|', 2))::int AS row_idx,
    cartola_movement_key
  FROM factura_auto_match_rejections
  WHERE factura_key ~ '^[0-9a-f-]{36}\|[0-9]+$'
),
new_keys AS (
  SELECT
    p.id,
    UPPER(TRIM(uf.data->p.row_idx->>'Tipo Documento')) || '|' ||
    TRIM(uf.data->p.row_idx->>'Nº Documento') AS new_key,
    p.cartola_movement_key
  FROM parsed p
  JOIN uploaded_files uf ON uf.id = p.file_id
  WHERE uf.data->p.row_idx IS NOT NULL
    AND TRIM(uf.data->p.row_idx->>'Nº Documento') != ''
),
ranked AS (
  SELECT id, new_key,
    ROW_NUMBER() OVER (PARTITION BY new_key, cartola_movement_key ORDER BY id) AS rn
  FROM new_keys
)
DELETE FROM factura_auto_match_rejections
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

WITH parsed AS (
  SELECT
    id,
    SPLIT_PART(factura_key, '|', 1) AS file_id,
    (SPLIT_PART(factura_key, '|', 2))::int AS row_idx
  FROM factura_auto_match_rejections
  WHERE factura_key ~ '^[0-9a-f-]{36}\|[0-9]+$'
)
UPDATE factura_auto_match_rejections r
SET factura_key = UPPER(TRIM(uf.data->p.row_idx->>'Tipo Documento')) || '|' ||
                  TRIM(uf.data->p.row_idx->>'Nº Documento')
FROM parsed p
JOIN uploaded_files uf ON uf.id = p.file_id
WHERE r.id = p.id
  AND uf.data->p.row_idx IS NOT NULL
  AND TRIM(uf.data->p.row_idx->>'Nº Documento') != '';

-- Step 4: Same for factura_propuestas.
WITH parsed AS (
  SELECT
    id,
    factura_key AS old_key,
    SPLIT_PART(factura_key, '|', 1) AS file_id,
    (SPLIT_PART(factura_key, '|', 2))::int AS row_idx
  FROM factura_propuestas
  WHERE factura_key ~ '^[0-9a-f-]{36}\|[0-9]+$'
)
UPDATE factura_propuestas fp
SET factura_key = UPPER(TRIM(uf.data->p.row_idx->>'Tipo Documento')) || '|' ||
                  TRIM(uf.data->p.row_idx->>'Nº Documento')
FROM parsed p
JOIN uploaded_files uf ON uf.id = p.file_id
WHERE fp.id = p.id
  AND uf.data->p.row_idx IS NOT NULL
  AND TRIM(uf.data->p.row_idx->>'Nº Documento') != '';

-- Step 5: Same for email_logs (if any have old-format facturaKey).
WITH parsed AS (
  SELECT
    id,
    SPLIT_PART(factura_key, '|', 1) AS file_id,
    (SPLIT_PART(factura_key, '|', 2))::int AS row_idx
  FROM email_logs
  WHERE factura_key IS NOT NULL
    AND factura_key ~ '^[0-9a-f-]{36}\|[0-9]+$'
)
UPDATE email_logs el
SET factura_key = UPPER(TRIM(uf.data->p.row_idx->>'Tipo Documento')) || '|' ||
                  TRIM(uf.data->p.row_idx->>'Nº Documento')
FROM parsed p
JOIN uploaded_files uf ON uf.id = p.file_id
WHERE el.id = p.id
  AND uf.data->p.row_idx IS NOT NULL
  AND TRIM(uf.data->p.row_idx->>'Nº Documento') != '';
