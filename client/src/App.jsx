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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [activeFilter, setActiveFilter] = useState(null);

  const [describeQuery, setDescribeQuery] = useState("");
  const [best, setBest] = useState(null);
  const [describeLoading, setDescribeLoading] = useState(false);
  const [describeError, setDescribeError] = useState(null);
  const [describeFocused, setDescribeFocused] = useState(false);

  const searchDebounce = useRef(null);
  const describeDebounce = useRef(null);

  useEffect(() => {
    setActiveFilter(null);
    if (!searchQuery.trim()) { setSearchResults([]); setSearchError(null); return; }
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const res = await fetch(`${API}/search?q=${encodeURIComponent(searchQuery)}&limit=30`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setSearchResults(data.results);
      } catch (e) {
        setSearchError(e.message);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(searchDebounce.current);
  }, [searchQuery]);

  useEffect(() => {
    if (!describeQuery.trim()) { setBest(null); setDescribeError(null); return; }
    clearTimeout(describeDebounce.current);
    describeDebounce.current = setTimeout(async () => {
      setDescribeLoading(true);
      setDescribeError(null);
      setBest(null);
      try {
        const res = await fetch(`${API}/best-match?q=${encodeURIComponent(describeQuery)}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setBest(data.best);
      } catch (e) {
        setDescribeError(e.message);
      } finally {
        setDescribeLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(describeDebounce.current);
  }, [describeQuery]);

  const prefixes = useMemo(() => {
    const counts = {};
    for (const r of searchResults) {
      const p = getPrefix(r.name);
      if (p) counts[p] = (counts[p] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([prefix, count]) => ({ prefix, count }));
  }, [searchResults]);

  const filteredResults = useMemo(
    () => activeFilter ? searchResults.filter((r) => r.name.startsWith(activeFilter)) : searchResults,
    [searchResults, activeFilter]
  );

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes aiPulse {
          0%, 100% { box-shadow: 0 0 8px 2px rgba(139,92,246,0.3), 0 0 24px 6px rgba(99,102,241,0.12); }
          50%       { box-shadow: 0 0 18px 5px rgba(139,92,246,0.55), 0 0 48px 12px rgba(99,102,241,0.22); }
        }
        @keyframes aiPulseFocused {
          0%, 100% { box-shadow: 0 0 18px 5px rgba(139,92,246,0.65), 0 0 48px 14px rgba(99,102,241,0.35); }
          50%       { box-shadow: 0 0 30px 10px rgba(139,92,246,0.9), 0 0 72px 20px rgba(99,102,241,0.5); }
        }
        .ai-input {
          animation: aiPulse 3s ease-in-out infinite;
          transition: border-color 0.2s;
        }
        .ai-input.focused {
          animation: aiPulseFocused 2s ease-in-out infinite;
          border-color: #a78bfa !important;
        }
      `}</style>
      <div style={styles.container}>
        <h1 style={styles.title}>FiveM Prop Search</h1>
        <p style={styles.subtitle}>Semantic search across 21,631 GTA V props</p>

        {/* Both inputs always at the top */}
        <div style={styles.inputs}>
          <div style={styles.section}>
            <label style={styles.sectionLabel}>Search</label>
            <input
              style={styles.searchInput}
              type="text"
              placeholder="e.g. wooden crate, traffic cone, park bench…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div style={styles.divider}>
            <div style={styles.dividerLine} />
            <span style={styles.dividerText}>or</span>
            <div style={styles.dividerLine} />
          </div>

          <div style={styles.section}>
            <div style={styles.aiHeader}>
              <span style={styles.aiLabel}>✦ AI Best Match</span>
              <span style={styles.aiSubLabel}>Describes the single best prop for your use case</span>
            </div>
            <input
              style={styles.describeInput}
              className={`ai-input${describeFocused ? " focused" : ""}`}
              type="text"
              placeholder="Describe the prop you need, e.g. a rusty dumpster for a back alley scene…"
              value={describeQuery}
              onChange={(e) => setDescribeQuery(e.target.value)}
              onFocus={() => setDescribeFocused(true)}
              onBlur={() => setDescribeFocused(false)}
            />
          </div>
        </div>

        {/* Results below both inputs */}
        <div style={styles.results}>
          {best && (
            <div style={styles.bestCard}>
              <div style={styles.bestHeader}>
                <span style={styles.bestLabel}>✦ Best Match</span>
              </div>
              <div style={styles.bestNameRow}>
                <div style={styles.bestName}>{best.name}</div>
                <CopyButton text={best.name} />
              </div>
              <div style={styles.bestReason}>{best.reason}</div>
            </div>
          )}

          {describeLoading && <p style={styles.status}>Finding best match…</p>}
          {describeError && <p style={{ ...styles.status, color: "#fc8181" }}>{describeError}</p>}
          {!describeLoading && !describeError && describeQuery.trim() && !best && (
            <p style={styles.status}>No result.</p>
          )}

          {searchResults.length > 0 && (
            <>
              {prefixes.length > 1 && (
                <div style={styles.filters}>
                  <button
                    style={{ ...styles.filterChip, ...(activeFilter === null ? styles.filterChipActive : {}) }}
                    onClick={() => setActiveFilter(null)}
                  >
                    All <span style={styles.filterCount}>{searchResults.length}</span>
                  </button>
                  {prefixes.map(({ prefix, count }) => (
                    <button
                      key={prefix}
                      style={{ ...styles.filterChip, ...(activeFilter === prefix ? styles.filterChipActive : {}) }}
                      onClick={() => setActiveFilter((f) => (f === prefix ? null : prefix))}
                    >
                      {prefix} <span style={styles.filterCount}>{count}</span>
                    </button>
                  ))}
                </div>
              )}
              <ul style={styles.list}>
                {filteredResults.map((r) => (
                  <li key={r.id} style={styles.item}>
                    <span style={styles.name}>{r.name}</span>
                    <div style={styles.itemRight}>
                      <CopyButton text={r.name} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {searchLoading && <p style={styles.status}>Searching…</p>}
          {searchError && <p style={{ ...styles.status, color: "#fc8181" }}>{searchError}</p>}
          {!searchLoading && !searchError && searchQuery.trim() && searchResults.length === 0 && (
            <p style={styles.status}>No results.</p>
          )}
        </div>
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
    marginBottom: "36px",
  },
  inputs: {
    display: "flex",
    flexDirection: "column",
    gap: "0",
    marginBottom: "28px",
  },
  results: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  sectionLabel: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "#4a5568",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  searchInput: {
    width: "100%",
    padding: "16px 20px",
    fontSize: "1.05rem",
    background: "#1a1d27",
    border: "1px solid #2d3748",
    borderRadius: "12px",
    color: "#e2e8f0",
    outline: "none",
    boxSizing: "border-box",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    margin: "32px 0",
  },
  dividerLine: {
    flex: 1,
    height: "1px",
    background: "#2d3748",
  },
  dividerText: {
    fontSize: "0.8rem",
    color: "#4a5568",
    fontWeight: 500,
  },
  aiHeader: {
    display: "flex",
    alignItems: "baseline",
    gap: "10px",
  },
  aiLabel: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "#90cdf4",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  aiSubLabel: {
    fontSize: "0.78rem",
    color: "#4a5568",
  },
  describeInput: {
    width: "100%",
    padding: "12px 16px",
    fontSize: "0.95rem",
    background: "#141c2e",
    border: "1px solid #4a6fa5",
    borderRadius: "10px",
    color: "#e2e8f0",
    outline: "none",
    boxSizing: "border-box",
  },
  status: {
    color: "#718096",
    fontSize: "0.9rem",
  },
  filters: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
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
  itemRight: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  badge: {
    fontSize: "0.8rem",
    color: "#68d391",
    background: "#1a3329",
    padding: "2px 8px",
    borderRadius: "999px",
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
  bestCard: {
    background: "#141c2e",
    border: "1px solid #4a6fa5",
    borderRadius: "12px",
    padding: "18px 20px",
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
};
