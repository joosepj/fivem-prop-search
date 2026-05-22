import { useState, useEffect, useRef, useMemo } from "react";

const DEBOUNCE_MS = 400;
const API = import.meta.env.VITE_API_URL ?? "";
const R2  = "https://pub-c1d30e6aba3a4fca841cd417ecbe67e0.r2.dev";

function getPrefix(name) {
  const m = name.match(/^([a-z]+_)/i);
  return m ? m[1] : null;
}

function joaatHash(key) {
  key = key.toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash += key.charCodeAt(i);
    hash += hash << 10;
    hash ^= hash >>> 6;
  }
  hash += hash << 3;
  hash ^= hash >>> 11;
  hash += hash << 15;
  return "0x" + (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

function CopyButton({ text, label = "Copy", onCopy }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={handleCopy} style={styles.copyBtn}>
      {copied ? "Copied!" : label}
    </button>
  );
}

function StarButton({ name, favorites, onToggle }) {
  const active = favorites.has(name);
  return (
    <button
      onClick={() => onToggle(name)}
      style={{ ...styles.starBtn, ...(active ? styles.starBtnActive : {}) }}
      title={active ? "Remove from favorites" : "Add to favorites"}
    >
      {active ? "★" : "☆"}
    </button>
  );
}

function PropImage({ name }) {
  const [view, setView]     = useState("overview");
  const [status, setStatus] = useState("loading"); // "loading" | "loaded" | "error"

  const src = `${R2}/${name}_${view}.png`;

  // Reset on prop change
  useEffect(() => { setView("overview"); setStatus("loading"); }, [name]);

  function toggle() {
    setView((v) => (v === "overview" ? "player" : "overview"));
    setStatus("loading");
  }

  // Overview failed/timed-out → hide the entire image section, no broken icon
  if (status === "error" && view === "overview") return null;

  return (
    <div style={imgStyles.wrapper}>
      {/* opacity instead of display:none so the browser actually fetches the image */}
      <img
        key={src}
        src={src}
        alt=""
        style={{ ...imgStyles.img, opacity: status === "loaded" ? 1 : 0 }}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
      />
      {status === "loading" && <div style={imgStyles.skeleton} />}
      {status === "error" && view === "player" && (
        <div style={imgStyles.noPlayer}>No player view available</div>
      )}
      {(status === "loaded" || (status === "error" && view === "player")) && (
        <button style={imgStyles.toggle} onClick={toggle}>
          {view === "overview" ? "Player view" : "Overview"}
        </button>
      )}
    </div>
  );
}

function PropItem({ name, favorites, onToggle, onCopy }) {
  const hash = useMemo(() => joaatHash(name), [name]);
  return (
    <li style={styles.item}>
      <PropImage name={name} />
      <div style={styles.itemRow}>
        <div style={styles.itemLeft}>
          <StarButton name={name} favorites={favorites} onToggle={onToggle} />
          <div style={styles.itemInfo}>
            <span style={styles.name}>{name}</span>
            <span style={styles.hash}>{hash}</span>
          </div>
        </div>
        <div style={styles.itemRight}>
          <CopyButton text={name} label="Copy" onCopy={() => onCopy(name)} />
          <CopyButton text={hash} label="Copy Hash" onCopy={() => onCopy(name)} />
        </div>
      </div>
    </li>
  );
}

function RightSidebar({ favorites, onRemove, onClearAll, recentlyCopied, onClearRecent }) {
  const favList = useMemo(() => [...favorites].reverse().slice(0, 15), [favorites]);

  function handleRemove(name) {
    if (window.confirm(`Remove "${name}" from favorites?`)) onRemove(name);
  }
  function handleClearAll() {
    if (window.confirm("Clear all favorites?")) onClearAll();
  }
  function handleClearRecent() {
    if (window.confirm("Clear recently copied history?")) onClearRecent();
  }

  return (
    <aside style={styles.sidebar}>

      {/* ── Favorites ── */}
      <div style={styles.sidebarSection}>
        <div style={styles.sidebarHeader}>
          <span style={{ ...styles.sidebarTitle, color: "#f6ad55" }}>★ Favorites</span>
          {favorites.size > 0 && (
            <button onClick={handleClearAll} style={styles.clearBtn}>Clear all</button>
          )}
        </div>

        {favorites.size === 0 ? (
          <p style={styles.sidebarEmpty}>Star a prop to save it here.</p>
        ) : (
          <>
            <ul style={styles.sidebarList}>
              {favList.map((name) => (
                <li key={name} style={{ ...styles.sidebarItem, borderColor: "#3d2e0a" }}>
                  <span style={styles.sidebarName} title={name}>{name}</span>
                  <div style={styles.sidebarActions}>
                    <CopyButton text={name} label="Copy" />
                    <button onClick={() => handleRemove(name)} style={styles.removeBtn} title="Remove">×</button>
                  </div>
                </li>
              ))}
            </ul>
            {favorites.size > 15 && (
              <p style={styles.sidebarMore}>+{favorites.size - 15} more</p>
            )}
          </>
        )}
      </div>

      {/* ── Divider ── */}
      <div style={styles.sidebarDivider} />

      {/* ── Recently Copied ── */}
      <div style={styles.sidebarSection}>
        <div style={styles.sidebarHeader}>
          <span style={{ ...styles.sidebarTitle, color: "#68d391" }}>◷ Recently Copied</span>
          {recentlyCopied.length > 0 && (
            <button onClick={handleClearRecent} style={styles.clearBtn}>Clear</button>
          )}
        </div>

        {recentlyCopied.length === 0 ? (
          <p style={styles.sidebarEmpty}>Copy a prop name or hash to track it here.</p>
        ) : (
          <ul style={styles.sidebarList}>
            {recentlyCopied.map((name) => (
              <li key={name} style={{ ...styles.sidebarItem, borderColor: "#1a3329" }}>
                <span style={{ ...styles.sidebarName, color: "#68d391" }} title={name}>{name}</span>
                <div style={styles.sidebarActions}>
                  <CopyButton text={name} label="Copy" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

    </aside>
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

  const [favorites, setFavorites] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("prop-favorites") || "[]")); }
    catch { return new Set(); }
  });

  const [recentlyCopied, setRecentlyCopied] = useState(() => {
    try { return JSON.parse(localStorage.getItem("prop-recently-copied") || "[]"); }
    catch { return []; }
  });

  const searchDebounce = useRef(null);

  function trackCopy(name) {
    setRecentlyCopied((prev) => {
      const next = [name, ...prev.filter((n) => n !== name)].slice(0, 10);
      localStorage.setItem("prop-recently-copied", JSON.stringify(next));
      return next;
    });
  }

  function toggleFavorite(name) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        if (!window.confirm(`Remove "${name}" from favorites?`)) return prev;
        next.delete(name);
      } else {
        next.add(name);
      }
      localStorage.setItem("prop-favorites", JSON.stringify([...next]));
      return next;
    });
  }

  function removeFavorite(name) {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.delete(name);
      localStorage.setItem("prop-favorites", JSON.stringify([...next]));
      return next;
    });
  }

  function clearAllFavorites() {
    setFavorites(new Set());
    localStorage.removeItem("prop-favorites");
  }

  function clearRecentlyCopied() {
    setRecentlyCopied([]);
    localStorage.removeItem("prop-recently-copied");
  }

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

  async function submitDescribe() {
    if (!describeQuery.trim() || describeLoading) return;
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
  }

  const prefixes = useMemo(() => {
    const counts = {};
    for (const r of searchResults) {
      const p = getPrefix(r.name);
      if (p) counts[p] = (counts[p] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([prefix, count]) => ({ prefix, count }));
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
        .ai-input { animation: aiPulse 3s ease-in-out infinite; transition: border-color 0.2s; }
        .ai-input.focused { animation: aiPulseFocused 2s ease-in-out infinite; border-color: #a78bfa !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2d3748; border-radius: 4px; }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div style={styles.layout}>
        {/* Main content */}
        <div style={styles.main}>
          <h1 style={styles.title}>FiveM Prop Search</h1>
          <p style={styles.subtitle}>Semantic search across 21,631 GTA V props</p>

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
                <span style={styles.aiSubLabel}>Describe the desired prop with your own words</span>
              </div>
              <div style={styles.describeRow}>
                <input
                  style={styles.describeInput}
                  className={`ai-input${describeFocused ? " focused" : ""}`}
                  type="text"
                  placeholder="Describe the prop you need, e.g. a rusty dumpster for a back alley scene…"
                  value={describeQuery}
                  onChange={(e) => setDescribeQuery(e.target.value)}
                  onFocus={() => setDescribeFocused(true)}
                  onBlur={() => setDescribeFocused(false)}
                  onKeyDown={(e) => e.key === "Enter" && submitDescribe()}
                />
                <button
                  style={{ ...styles.findBtn, ...(describeLoading || !describeQuery.trim() ? styles.findBtnDisabled : {}) }}
                  onClick={submitDescribe}
                  disabled={describeLoading || !describeQuery.trim()}
                >
                  {describeLoading ? "…" : "Find"}
                </button>
              </div>
            </div>
          </div>

          <div style={styles.results}>
            {best && (
              <div style={styles.bestCard}>
                <div style={styles.bestHeader}>
                  <span style={styles.bestLabel}>✦ Best Match</span>
                </div>
                <div style={styles.bestNameRow}>
                  <div>
                    <div style={styles.bestName}>{best.name}</div>
                    <div style={styles.hash}>{joaatHash(best.name)}</div>
                  </div>
                  <div style={styles.itemRight}>
                    <StarButton name={best.name} favorites={favorites} onToggle={toggleFavorite} />
                    <CopyButton text={best.name} label="Copy" onCopy={() => trackCopy(best.name)} />
                    <CopyButton text={joaatHash(best.name)} label="Copy Hash" onCopy={() => trackCopy(best.name)} />
                  </div>
                </div>
                <PropImage name={best.name} />
                <div style={styles.bestReason}>{best.reason}</div>
              </div>
            )}

            {describeLoading && <p style={styles.status}>Finding best match…</p>}
            {describeError && <p style={{ ...styles.status, color: "#fc8181" }}>{describeError}</p>}
            {!describeLoading && !describeError && describeQuery.trim() && !best && (
              <p style={styles.status}>No result.</p>
            )}

            {searchResults.length > 0 && prefixes.length > 1 && (
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

            {filteredResults.length > 0 && (
              <ul style={styles.list}>
                {filteredResults.map((r) => (
                  <PropItem
                    key={r.id}
                    name={r.name}
                    favorites={favorites}
                    onToggle={toggleFavorite}
                    onCopy={trackCopy}
                  />
                ))}
              </ul>
            )}

            {searchLoading && <p style={styles.status}>Searching…</p>}
            {searchError && <p style={{ ...styles.status, color: "#fc8181" }}>{searchError}</p>}
            {!searchLoading && !searchError && searchQuery.trim() && searchResults.length === 0 && (
              <p style={styles.status}>No results.</p>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <RightSidebar
          favorites={favorites}
          onRemove={removeFavorite}
          onClearAll={clearAllFavorites}
          recentlyCopied={recentlyCopied}
          onClearRecent={clearRecentlyCopied}
        />
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", padding: "0 16px" },
  layout: {
    display: "flex", gap: "24px", maxWidth: "1080px",
    margin: "0 auto", alignItems: "flex-start", padding: "48px 0",
  },
  main: { flex: 1, minWidth: 0, maxWidth: "720px" },
  title: { fontSize: "2rem", fontWeight: 700, marginBottom: "6px", color: "#f7fafc" },
  subtitle: { fontSize: "0.9rem", color: "#718096", marginBottom: "36px" },
  inputs: { display: "flex", flexDirection: "column", marginBottom: "28px" },
  results: { display: "flex", flexDirection: "column", gap: "12px" },
  section: { display: "flex", flexDirection: "column", gap: "12px" },
  sectionLabel: { fontSize: "0.7rem", fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.1em" },
  searchInput: {
    width: "100%", padding: "16px 20px", fontSize: "1.05rem",
    background: "#1a1d27", border: "1px solid #2d3748", borderRadius: "12px",
    color: "#e2e8f0", outline: "none", boxSizing: "border-box",
  },
  divider: { display: "flex", alignItems: "center", gap: "12px", margin: "32px 0" },
  dividerLine: { flex: 1, height: "1px", background: "#2d3748" },
  dividerText: { fontSize: "0.8rem", color: "#4a5568", fontWeight: 500 },
  aiHeader: { display: "flex", alignItems: "baseline", gap: "10px" },
  aiLabel: { fontSize: "0.7rem", fontWeight: 700, color: "#90cdf4", textTransform: "uppercase", letterSpacing: "0.1em" },
  aiSubLabel: { fontSize: "0.78rem", color: "#4a5568" },
  describeRow: { display: "flex", gap: "8px", alignItems: "stretch" },
  findBtn: {
    padding: "0 20px", fontSize: "0.9rem", fontWeight: 700,
    background: "#3b1fa8", border: "1px solid #7c3aed", borderRadius: "10px",
    color: "#e9d5ff", cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s",
  },
  findBtnDisabled: { opacity: 0.4, cursor: "not-allowed" },
  describeInput: {
    width: "100%", padding: "12px 16px", fontSize: "0.95rem",
    background: "#141c2e", border: "1px solid #4a6fa5", borderRadius: "10px",
    color: "#e2e8f0", outline: "none", boxSizing: "border-box",
  },
  status: { color: "#718096", fontSize: "0.9rem" },
  filters: { display: "flex", flexWrap: "wrap", gap: "6px" },
  filterChip: {
    fontSize: "0.78rem", fontWeight: 600, fontFamily: "monospace",
    padding: "4px 10px", borderRadius: "999px", border: "1px solid #2d3748",
    background: "#1a1d27", color: "#718096", cursor: "pointer", transition: "all 0.15s",
  },
  filterChipActive: { background: "#1a2744", border: "1px solid #4a6fa5", color: "#90cdf4" },
  filterCount: { opacity: 0.6, marginLeft: "3px" },
  list: { listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" },
  item: {
    display: "flex", flexDirection: "column",
    background: "#1a1d27", border: "1px solid #2d3748",
    borderRadius: "8px", overflow: "hidden",
  },
  itemRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 16px", gap: "8px",
  },
  itemLeft: { display: "flex", alignItems: "center", gap: "10px", minWidth: 0 },
  itemInfo: { display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 },
  name: { fontFamily: "monospace", fontSize: "0.95rem", color: "#90cdf4" },
  hash: { fontFamily: "monospace", fontSize: "0.75rem", color: "#4a5568" },
  itemRight: { display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 },
  starBtn: {
    background: "transparent", border: "none", fontSize: "1.1rem",
    color: "#4a5568", cursor: "pointer", padding: "2px 4px", lineHeight: 1, flexShrink: 0,
  },
  starBtnActive: { color: "#f6ad55" },
  copyBtn: {
    fontSize: "0.75rem", fontWeight: 600, padding: "2px 10px", borderRadius: "6px",
    border: "1px solid #4a5568", background: "transparent", color: "#a0aec0", cursor: "pointer",
  },
  bestCard: { background: "#141c2e", border: "1px solid #4a6fa5", borderRadius: "12px", padding: "18px 20px" },
  bestHeader: { marginBottom: "10px" },
  bestLabel: { fontSize: "0.75rem", fontWeight: 700, color: "#90cdf4", textTransform: "uppercase", letterSpacing: "0.08em" },
  bestNameRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "8px", gap: "8px" },
  bestName: { fontFamily: "monospace", fontSize: "1.1rem", color: "#e2e8f0" },
  bestReason: { fontSize: "0.875rem", color: "#a0aec0", lineHeight: 1.5, marginTop: "10px" },

  // Sidebar
  sidebar: {
    width: "240px", flexShrink: 0, position: "sticky", top: "48px",
    maxHeight: "calc(100vh - 96px)", overflowY: "auto",
    background: "#0f1117", border: "1px solid #2d3748", borderRadius: "12px",
    display: "flex", flexDirection: "column", gap: "0",
  },
  sidebarSection: {
    padding: "14px 14px",
    display: "flex", flexDirection: "column", gap: "10px",
  },
  sidebarDivider: {
    height: "1px",
    background: "#2d3748",
    margin: "0 14px",
  },
  sidebarHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  sidebarTitle: {
    fontSize: "0.68rem", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.1em",
  },
  clearBtn: {
    fontSize: "0.68rem", fontWeight: 600, background: "transparent",
    border: "1px solid #2d3748", borderRadius: "4px",
    color: "#4a5568", cursor: "pointer", padding: "2px 7px",
  },
  sidebarEmpty: { fontSize: "0.75rem", color: "#4a5568", lineHeight: 1.5 },
  sidebarList: { listStyle: "none", display: "flex", flexDirection: "column", gap: "4px" },
  sidebarItem: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: "6px", padding: "5px 7px", background: "#13161f",
    borderRadius: "6px", border: "1px solid",
  },
  sidebarName: {
    fontFamily: "monospace", fontSize: "0.7rem",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
  },
  sidebarActions: { display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 },
  removeBtn: {
    background: "transparent", border: "none", color: "#4a5568",
    cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: "0 2px", flexShrink: 0,
  },
  sidebarMore: { fontSize: "0.7rem", color: "#4a5568", textAlign: "center" },
};

const imgStyles = {
  wrapper: {
    position: "relative",
    height: "160px",
    background: "#0d1117",
    overflow: "hidden",
    flexShrink: 0,
  },
  img: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },
  skeleton: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(90deg, #1a1d27 25%, #22263a 50%, #1a1d27 75%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.4s ease-in-out infinite",
  },
  noPlayer: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#4a5568",
    fontSize: "0.78rem",
  },
  toggle: {
    position: "absolute",
    bottom: "7px",
    right: "8px",
    fontSize: "0.68rem",
    fontWeight: 600,
    padding: "3px 9px",
    borderRadius: "999px",
    border: "1px solid #4a5568",
    background: "rgba(13, 17, 23, 0.82)",
    color: "#a0aec0",
    cursor: "pointer",
    backdropFilter: "blur(4px)",
  },
};
