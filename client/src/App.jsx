import { useState, useEffect, useRef, useMemo, useCallback } from "react";

const DEBOUNCE_MS = 400;
const CACHE_TTL   = 5 * 60 * 1000; // 5 minutes
const API = import.meta.env.VITE_API_URL ?? "";
const R2  = "https://pub-c1d30e6aba3a4fca841cd417ecbe67e0.r2.dev";

const searchCache = new Map(); // query -> { results, ts }

function logEvent(type, query, resultCount = 0) {
  if (!query || query.length < 1) return;
  fetch(`${API}/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, type, result_count: resultCount }),
  }).then((r) => {
    if (!r.ok) r.text().then((t) => console.warn("[log] failed:", r.status, t));
  }).catch((e) => console.warn("[log] network error:", e.message));
}

const rankLabels = ["1st", "2nd", "3rd"];
const rankColors = ["#f6ad55", "#a0aec0", "#c8855a"];

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

function Lightbox({ src, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={lightboxStyles.backdrop} onClick={onClose}>
      <button style={lightboxStyles.close} onClick={onClose} aria-label="Close">×</button>
      <img
        src={src}
        alt=""
        style={lightboxStyles.img}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function CopyButton({ text, label = "Copy", onCopy, btnStyle }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={handleCopy} style={btnStyle ?? styles.copyBtn}>
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
  const [view, setView]         = useState("overview");
  const [status, setStatus]     = useState("loading"); // "loading" | "loaded" | "error"
  const [lightbox, setLightbox] = useState(false);

  const src = `${R2}/${name}_${view}.png`;

  // Reset on prop change
  useEffect(() => { setView("overview"); setStatus("loading"); setLightbox(false); }, [name]);

  const closeLightbox = useCallback(() => setLightbox(false), []);

  function toggle(e) {
    e.stopPropagation();
    setView((v) => (v === "overview" ? "player" : "overview"));
    setStatus("loading");
  }

  if (status === "error" && view === "overview") {
    return (
      <div style={imgStyles.placeholder}>
        <svg style={imgStyles.placeholderIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="12" cy="12" r="3.5" />
          <path d="M8.5 5l1.5-2h4l1.5 2" />
        </svg>
        <span style={imgStyles.placeholderText}>No image yet</span>
      </div>
    );
  }

  return (
    <>
      <div
        style={{ ...imgStyles.wrapper, cursor: status === "loaded" ? "zoom-in" : "default" }}
        onClick={() => status === "loaded" && setLightbox(true)}
      >
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
            {view === "overview" ? "Different angle" : "Overview"}
          </button>
        )}
      </div>
      {lightbox && <Lightbox src={src} onClose={closeLightbox} />}
    </>
  );
}

function PropItem({ name, favorites, onToggle, onCopy }) {
  const hash = useMemo(() => joaatHash(name), [name]);
  return (
    <li style={styles.item}>
      <PropImage name={name} />
      <div style={styles.itemBody}>
        <div style={styles.itemTopRow}>
          <StarButton name={name} favorites={favorites} onToggle={onToggle} />
          <div style={styles.itemInfo}>
            <span style={styles.name}>{name}</span>
            <span style={styles.hash}>{hash}</span>
          </div>
        </div>
        <div style={styles.itemActions}>
          <CopyButton text={name} label="Copy" onCopy={() => onCopy(name)} btnStyle={styles.copyBtnFull} />
          <CopyButton text={hash} label="Hash" onCopy={() => onCopy(name)} btnStyle={styles.copyBtnFull} />
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
  const [top, setTop] = useState([]);
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

  const [recentSearches, setRecentSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem("prop-recent-searches") || "[]"); }
    catch { return []; }
  });

  const searchDebounce = useRef(null);

  function trackCopy(name) {
    setRecentlyCopied((prev) => {
      const next = [name, ...prev.filter((n) => n !== name)].slice(0, 10);
      localStorage.setItem("prop-recently-copied", JSON.stringify(next));
      return next;
    });
    logEvent("copy", name, 0);
  }

  function trackSearch(query) {
    setRecentSearches((prev) => {
      const next = [query, ...prev.filter((q) => q !== query)].slice(0, 8);
      localStorage.setItem("prop-recent-searches", JSON.stringify(next));
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
      const q = searchQuery.trim();
      const cacheKey = q.toLowerCase();
      const cached = searchCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        setSearchResults(cached.results);
        setSearchError(null);
        if (cached.results.length > 0 && q.length >= 3) trackSearch(q);
        return;
      }
      setSearchLoading(true);
      setSearchError(null);
      try {
        const res = await fetch(`${API}/search?q=${encodeURIComponent(q)}&limit=30`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        searchCache.set(cacheKey, { results: data.results, ts: Date.now() });
        setSearchResults(data.results);
        if (data.results.length > 0 && q.length >= 3) trackSearch(q);
        if (q.length >= 3) logEvent("search", q, data.results.length);
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
    setTop([]);
    try {
      const res = await fetch(`${API}/best-match?q=${encodeURIComponent(describeQuery)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTop(data.top ?? []);
      logEvent("ai_best_match", describeQuery.trim(), data.top?.length ?? 0);
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
        .prop-grid { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        @media (min-width: 480px) { .prop-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 720px) { .prop-grid { grid-template-columns: repeat(4, 1fr); } }
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
                onChange={(e) => { setSearchQuery(e.target.value); setTop([]); }}
                autoFocus
              />
              {recentSearches.length > 0 && (
                <div style={styles.recentSearches}>
                  <span style={styles.recentSearchesLabel}>Recent:</span>
                  <div style={styles.recentChips}>
                    {recentSearches.map((q) => (
                      <button key={q} style={styles.recentChip} onClick={() => setSearchQuery(q)}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
            {top.length > 0 && (
              <div style={styles.topSection}>
                <div style={styles.topSectionHeader}>
                  <span style={styles.bestLabel}>✦ AI Best Matches</span>
                </div>
                {top.map((match, i) => (
                  <div key={match.name} style={{ ...styles.bestCard, borderTopColor: rankColors[i], borderTopWidth: "2px" }}>
                    <div style={styles.bestNameRow}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                        <span style={{ ...styles.rankBadge, color: rankColors[i] }}>{rankLabels[i]}</span>
                        <div>
                          <div style={styles.bestName}>{match.name}</div>
                          <div style={styles.hash}>{joaatHash(match.name)}</div>
                        </div>
                      </div>
                      <div style={styles.itemRight}>
                        <StarButton name={match.name} favorites={favorites} onToggle={toggleFavorite} />
                        <CopyButton text={match.name} label="Copy" onCopy={() => trackCopy(match.name)} />
                        <CopyButton text={joaatHash(match.name)} label="Copy Hash" onCopy={() => trackCopy(match.name)} />
                      </div>
                    </div>
                    <PropImage name={match.name} />
                    <div style={styles.bestReason}>{match.reason}</div>
                  </div>
                ))}
              </div>
            )}

            {describeLoading && <p style={styles.status}>Finding best matches…</p>}
            {describeError && <p style={{ ...styles.status, color: "#fc8181" }}>{describeError}</p>}
            {!describeLoading && !describeError && describeQuery.trim() && top.length === 0 && (
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
              <ul className="prop-grid">
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
  main: { flex: 1, minWidth: 0 },
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
  itemBody: { display: "flex", flexDirection: "column", gap: "6px", padding: "8px 10px 10px" },
  itemTopRow: { display: "flex", alignItems: "flex-start", gap: "6px" },
  itemActions: { display: "flex", gap: "5px" },
  itemInfo: { display: "flex", flexDirection: "column", gap: "2px", minWidth: 0, flex: 1 },
  name: {
    fontFamily: "monospace", fontSize: "0.8rem", color: "#90cdf4",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  hash: { fontFamily: "monospace", fontSize: "0.7rem", color: "#4a5568" },
  itemRight: { display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 },
  starBtn: {
    background: "transparent", border: "none", fontSize: "1.1rem",
    color: "#4a5568", cursor: "pointer", padding: "2px 4px", lineHeight: 1, flexShrink: 0,
  },
  starBtnActive: { color: "#f6ad55" },
  copyBtn: {
    fontSize: "0.72rem", fontWeight: 600, padding: "4px 8px", borderRadius: "6px",
    border: "1px solid #4a5568", background: "transparent", color: "#a0aec0", cursor: "pointer",
  },
  copyBtnFull: {
    flex: 1, fontSize: "0.72rem", fontWeight: 600, padding: "4px 6px", borderRadius: "6px",
    border: "1px solid #4a5568", background: "transparent", color: "#a0aec0", cursor: "pointer",
    textAlign: "center",
  },
  topSection: { display: "flex", flexDirection: "column", gap: "8px" },
  topSectionHeader: { marginBottom: "2px" },
  bestCard: { background: "#141c2e", border: "1px solid #4a6fa5", borderRadius: "12px", padding: "18px 20px" },
  bestLabel: { fontSize: "0.75rem", fontWeight: 700, color: "#90cdf4", textTransform: "uppercase", letterSpacing: "0.08em" },
  rankBadge: { fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 },
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
  recentSearches: { display: "flex", alignItems: "flex-start", gap: "8px", flexWrap: "wrap" },
  recentSearchesLabel: {
    fontSize: "0.65rem", fontWeight: 700, color: "#4a5568",
    textTransform: "uppercase", letterSpacing: "0.08em",
    flexShrink: 0, paddingTop: "4px",
  },
  recentChips: { display: "flex", flexWrap: "wrap", gap: "5px" },
  recentChip: {
    fontSize: "0.75rem", fontWeight: 500, fontFamily: "monospace",
    padding: "3px 10px", borderRadius: "999px",
    border: "1px solid #2d3748", background: "transparent",
    color: "#718096", cursor: "pointer",
  },
};

const lightboxStyles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    background: "rgba(0, 0, 0, 0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backdropFilter: "blur(4px)",
    cursor: "zoom-out",
  },
  img: {
    maxWidth: "90vw",
    maxHeight: "90vh",
    objectFit: "contain",
    borderRadius: "8px",
    boxShadow: "0 8px 48px rgba(0, 0, 0, 0.7)",
    cursor: "default",
  },
  close: {
    position: "fixed",
    top: "20px",
    right: "24px",
    background: "rgba(26, 29, 39, 0.9)",
    border: "1px solid #4a5568",
    borderRadius: "50%",
    color: "#a0aec0",
    fontSize: "1.4rem",
    lineHeight: 1,
    width: "36px",
    height: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    zIndex: 1001,
    backdropFilter: "blur(4px)",
  },
};

const imgStyles = {
  wrapper: {
    position: "relative",
    height: "160px",
    background: "#0d1117",
    overflow: "hidden",
    flexShrink: 0,
  },
  placeholder: {
    height: "160px",
    background: "#0d1117",
    border: "1px dashed #2d3748",
    borderRadius: "0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    flexShrink: 0,
  },
  placeholderIcon: {
    width: "32px",
    height: "32px",
    color: "#2d3748",
  },
  placeholderText: {
    fontSize: "0.72rem",
    color: "#4a5568",
    fontWeight: 500,
    letterSpacing: "0.03em",
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
