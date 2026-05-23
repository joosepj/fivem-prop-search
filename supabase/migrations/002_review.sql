ALTER TABLE props
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT NULL;

-- Valid values: null (unreviewed), 'kept', 'deleted', 'skipped', 'no_image'
CREATE INDEX IF NOT EXISTS props_review_status_idx ON props (review_status, id);
