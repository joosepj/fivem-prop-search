CREATE TABLE searches_log (
  id BIGSERIAL PRIMARY KEY,
  query TEXT NOT NULL,
  type TEXT NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX searches_log_created_at_idx ON searches_log (created_at DESC);
CREATE INDEX searches_log_type_idx ON searches_log (type);

CREATE OR REPLACE FUNCTION admin_top_searches(p_days INTEGER DEFAULT 7, p_limit INTEGER DEFAULT 10)
RETURNS TABLE(query TEXT, count BIGINT) LANGUAGE sql STABLE AS $$
  SELECT query, COUNT(*) AS count
  FROM searches_log
  WHERE type = 'search' AND created_at > NOW() - (p_days || ' days')::INTERVAL
  GROUP BY query ORDER BY count DESC LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION admin_top_copies(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(query TEXT, count BIGINT) LANGUAGE sql STABLE AS $$
  SELECT query, COUNT(*) AS count
  FROM searches_log
  WHERE type = 'copy'
  GROUP BY query ORDER BY count DESC LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION admin_daily_searches(p_days INTEGER DEFAULT 7)
RETURNS TABLE(day DATE, count BIGINT) LANGUAGE sql STABLE AS $$
  SELECT created_at::DATE AS day, COUNT(*) AS count
  FROM searches_log
  WHERE type IN ('search', 'ai_best_match')
    AND created_at > NOW() - (p_days || ' days')::INTERVAL
  GROUP BY day ORDER BY day;
$$;

CREATE OR REPLACE FUNCTION admin_type_counts()
RETURNS TABLE(type TEXT, count BIGINT) LANGUAGE sql STABLE AS $$
  SELECT type, COUNT(*) AS count
  FROM searches_log
  GROUP BY type;
$$;
