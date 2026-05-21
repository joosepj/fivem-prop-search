import { useState, useEffect, useRef, useMemo } from "react";

const DEBOUNCE_MS = 400;
const API = import.meta.env.VITE_API_URL ?? "";

function getPrefix(name) {
  const m = name.match(/^([a-z]+_)/i);
  return m ? m[1] : null;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button onClick={handleCopy} style={styles.copyBtn}>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("search"); // "search" | "best-match"
  const [results, setResults] = useState([]);
  const [best, setBest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    setActiveFilter(null);
    if (!query.trim()) {
      setResults([]);
      setBest(null);
      setError(null);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      setBest(null);
      try {
        const endpoint =
          mode === "best-match"
            ? `${API}/best-match?q=${encodeURIComponent(query)}`
            : `${API}/search?q=${encodeURIComponent(query)}&limit=30`;

        const res = await fetch(endpoint);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setResults(data.results);
        if (data.best) setBest(data.best);
      } catch (e) {
        setError(e.message);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [query, mode]);

  const prefixes = useMemo(() => {
    const counts = {};
    for (const r of results) {
      const p = getPrefix(r.name);
      if (p) counts[p] = (counts[p] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([prefix, count]) => ({ prefix, count }));
  }, [results]);

  const filteredResults = useMemo(
    () =>
      activeFilter
        ? results.filter((r) => r.name.startsWith(activeFilter))
        : results,
    [results, activeFilter]
  );

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>FiveM Prop Search</h1>
        <p style={styles.subtitle}>Semantic search across 21,631 GTA V props</p>

        <div style={styles.controls}>
          <input
            style={styles.input}
            type="text"
            placeholder={
              mode === "best-match"
                ? "Describe what you need, e.g. a rusty dumpster for a back alley scene…"
                : "e.g. wooden crate, traffic cone, park bench…"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button
            style={{
              ...styles.modeBtn,
              ...(mode === "best-match" ? styles.modeBtnActive : {}),
            }}
            onClick={() => setMode((m) => (m === "search" ? "best-match" : "search"))}
            title="Toggle Best Match mode (uses Claude AI)"
          >
            {mode === "best-match" ? "✦ Best Match ON" : "✦ Best Match"}
          </button>
        </div>

        {loading && (
          <p style={styles.status}>
            {mode === "best-match" ? "Searching + asking Claude…" : "Searching…"}
          </p>
        )}
        {error && <p style={{ ...styles.status, color: "#fc8181" }}>{error}</p>}

        {best && (
          <div style={styles.bestCard}>
            <div style={styles.bestHeader}>
              <span style={styles.bestLabel}>✦ Best Match</span>
              <span style={styles.bestBadge}>
                {(best.similarity * 100).toFixed(1)}%
              </span>
            </div>
            <div style={styles.bestNameRow}>
              <div style={styles.bestName}>{best.name}</div>
              <CopyButton text={best.name} />
            </div>
            <div style={styles.bestReason}>{best.reason}</div>
          </div>
        )}

        {results.length > 0 && (
          <>
            {prefixes.length > 1 && (
              <div style={styles.filters}>
                <button
                  style={{
                    ...styles.filterChip,
                    ...(activeFilter === null ? styles.filterChipActive : {}),
                  }}
                  onClick={() => setActiveFilter(null)}
                >
                  All <span style={styles.filterCount}>{results.length}</span>
                </button>
                {prefixes.map(({ prefix, count }) => (
                  <button
                    key={prefix}
                    style={{
                      ...styles.filterChip,
                      ...(activeFilter === prefix ? styles.filterChipActive : {}),
                    }}
                    onClick={() =>
                      setActiveFilter((f) => (f === prefix ? null : prefix))
                    }
                  >
                    {prefix} <span style={styles.filterCount}>{count}</span>
                  </button>
                ))}
              </div>
            )}

            {best && <p style={styles.allResultsLabel}>All candidates</p>}
            <ul style={styles.list}>
              {filteredResults.map((r) => (
                <li key={r.id} style={styles.item}>
                  <span style={styles.name}>{r.name}</span>
                  <div style={styles.itemRight}>
                    <CopyButton text={r.name} />
                    <span style={styles.badge}>
                      {(r.similarity * 100).toFixed(1)}%
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {!loading && !error && query.trim() && results.length === 0 && (
          <p style={styles.status}>No results.</p>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    padding: "48px 16px",
  },
  container: {
    width: "100%",
    maxWidth: "720px",
  },
  title: {
    fontSize: "2rem",
    fontWeight: 700,
    marginBottom: "6px",
    color: "#f7fafc",
  },
  subtitle: {
    fontSize: "0.9rem",
    color: "#718096",
    marginBottom: "28px",
  },
  controls: {
    display: "flex",
    gap: "10px",
    marginBottom: "24px",
    alignItems: "stretch",
  },
  input: {
    flex: 1,
    padding: "14px 18px",
    fontSize: "1rem",
    background: "#1a1d27",
    border: "1px solid #2d3748",
    borderRadius: "10px",
    color: "#e2e8f0",
    outline: "none",
  },
  modeBtn: {
    padding: "0 16px",
    fontSize: "0.85rem",
    fontWeight: 600,
    background: "#1a1d27",
    border: "1px solid #2d3748",
    borderRadius: "10px",
    color: "#718096",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "all 0.15s",
  },
  modeBtnActive: {
    background: "#1a2744",
    border: "1px solid #4a6fa5",
    color: "#90cdf4",
  },
  status: {
    color: "#718096",
    fontSize: "0.9rem",
    marginBottom: "16px",
  },
  bestCard: {
    background: "#141c2e",
    border: "1px solid #4a6fa5",
    borderRadius: "12px",
    padding: "18px 20px",
    marginBottom: "24px",
  },
  bestHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "10px",
  },
  bestLabel: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#90cdf4",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  bestBadge: {
    fontSize: "0.8rem",
    color: "#68d391",
    background: "#1a3329",
    padding: "2px 8px",
    borderRadius: "999px",
  },
  bestNameRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "8px",
  },
  bestName: {
    fontFamily: "monospace",
    fontSize: "1.1rem",
    color: "#e2e8f0",
  },
  bestReason: {
    fontSize: "0.875rem",
    color: "#a0aec0",
    lineHeight: 1.5,
  },
  filters: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginBottom: "16px",
  },
  filterChip: {
    fontSize: "0.78rem",
    fontWeight: 600,
    fontFamily: "monospace",
    padding: "4px 10px",
    borderRadius: "999px",
    border: "1px solid #2d3748",
    background: "#1a1d27",
    color: "#718096",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  filterChipActive: {
    background: "#1a2744",
    border: "1px solid #4a6fa5",
    color: "#90cdf4",
  },
  filterCount: {
    opacity: 0.6,
    marginLeft: "3px",
  },
  allResultsLabel: {
    fontSize: "0.75rem",
    color: "#4a5568",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: "10px",
  },
  list: {
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  item: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    background: "#1a1d27",
    border: "1px solid #2d3748",
    borderRadius: "8px",
  },
  name: {
    fontFamily: "monospace",
    fontSize: "0.95rem",
    color: "#90cdf4",
  },
  badge: {
    fontSize: "0.8rem",
    color: "#68d391",
    background: "#1a3329",
    padding: "2px 8px",
    borderRadius: "999px",
  },
  itemRight: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  copyBtn: {
    fontSize: "0.75rem",
    fontWeight: 600,
    padding: "2px 10px",
    borderRadius: "6px",
    border: "1px solid #4a5568",
    background: "transparent",
    color: "#a0aec0",
    cursor: "pointer",
  },
};
