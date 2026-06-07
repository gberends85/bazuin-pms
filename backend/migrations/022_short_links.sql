CREATE TABLE IF NOT EXISTS short_links (
  code        VARCHAR(10) PRIMARY KEY,
  destination TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-cleanup: remove links older than 2 years (optional, run manually)
-- DELETE FROM short_links WHERE created_at < NOW() - INTERVAL '2 years';
