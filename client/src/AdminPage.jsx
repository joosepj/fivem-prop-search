import { useState, useEffect, useRef, useCallback } from "react";

const API = import.meta.env.VITE_API_URL ?? "";
const R2  = "https://pub-c1d30e6aba3a4fca841cd417ecbe67e0.r2.dev";
const ADMIN_PASSWORD = "doggystyle2024";

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

// ── Review components ─────────────────────────────────────────────────────────

function ReviewImagePanel({ src, label }) {
  const [status, setStatus] = useState("loading");
  useEffect(() => { setStatus("loading"); }, [src]);
  return (
    <div style={rv.imgPanel}>
      <div style={rv.imgLabel}>{label}</div>
      <div style={rv.imgBox}>
        <img
          key={src}
          src={src}
          alt={label}
          style={{ ...rv.img, opacity: status === "loaded" ? 1 : 0 }}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
        {status === "loading" && <div style={rv.imgSkeleton} />}
        {status === "error" && <div style={rv.imgNoImg}>No image</div>}
      </div>
    </div>
  );
}

function ReviewSection({ isActive }) {
  const [prop, setProp]               = useState(null);
  const [loading, setLoading]         = useState(false);
  const [done, setDone]               = useState(false);
  const [skippedPhase, setSkippedPhase] = useState(false);
  const [total, setTotal]             = useState(null);
  const [reviewed, setReviewed]       = useState(null);
  const [sessionStats, setSessionStats] = useState({ kept: 0, deleted: 0, skipped: 0 });
  const [feedback, setFeedback]       = useState(null);

  const actionLock   = useRef(false);
  const feedbackTimer = useRef(null);

  const fetchNext = useCallback(async (useSkipped = false) => {
    setLoading(true);
    setProp(null);
    try {
      const r1 = await fetch(`${API}/review/next${useSkipped ? "?skipped=1" : ""}`);
      const d1 = await r1.json();
      if (d1.done) {
        if (!useSkipped) {
          const r2 = await fetch(`${API}/review/next?skipped=1`);
          const d2 = await r2.json();
          if (d2.done) { setDone(true); }
          else { setSkippedPhase(true); setProp(d2.prop); setTotal(d2.total); setReviewed(d2.reviewed); }
        } else {
          setDone(true);
        }
      } else {
        setProp(d1.prop); setTotal(d1.total); setReviewed(d1.reviewed);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); actionLock.current = false; }
  }, []);

  const doAction = useCallback(async (action) => {
    if (!prop || actionLock.current || loading) return;
    actionLock.current = true;

    const cfg = {
      keep:   { label: "Kept ✓",    color: "#68d391" },
      delete: { label: "Deleted ✗", color: "#fc8181" },
      skip:   { label: "Skipped →", color: "#f6ad55" },
    };
    clearTimeout(feedbackTimer.current);
    setFeedback(cfg[action]);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 700);

    const key = action === "keep" ? "kept" : action === "delete" ? "deleted" : "skipped";
    setSessionStats(prev => ({ ...prev, [key]: prev[key] + 1 }));

    try {
      await fetch(`${API}/review/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: prop.name, action }),
      });
    } catch (e) { console.error(e); }

    await fetchNext(skippedPhase);
  }, [prop, loading, skippedPhase, fetchNext]);

  // Load first prop on mount
  useEffect(() => { fetchNext(false); }, [fetchNext]);

  // Keyboard shortcuts — only when this tab is active
  useEffect(() => {
    if (!isActive || done) return;
    function onKey(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if      (e.key === "k" || e.key === "K") doAction("keep");
      else if (e.key === "d" || e.key === "D") doAction("delete");
      else if (e.key === "s" || e.key === "S") doAction("skip");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive, done, doAction]);

  if (done) {
    return (
      <div style={rv.doneBox}>
        <div style={rv.doneTitle}>All caught up!</div>
        <div style={rv.doneStats}>
          <span style={{ color: "#68d391" }}>K {sessionStats.kept}</span>
          <span style={{ color: "#fc8181" }}>D {sessionStats.deleted}</span>
          <span style={{ color: "#f6ad55" }}>S {sessionStats.skipped}</span>
        </div>
        <div style={rv.doneActions}>
          {sessionStats.skipped > 0 && (
            <button style={rv.doneBtn} onClick={() => { setDone(false); setSkippedPhase(true); fetchNext(true); }}>
              Review skipped ({sessionStats.skipped})
            </button>
          )}
          <button style={{ ...rv.doneBtn, ...rv.doneBtnSecondary }} onClick={() => {
            setSessionStats({ kept: 0, deleted: 0, skipped: 0 });
            setDone(false); setSkippedPhase(false); fetchNext(false);
          }}>
            Start over
          </button>
        </div>
      </div>
    );
  }

  const pct = total > 0 ? Math.min(100, (reviewed / total) * 100) : 0;

  return (
    <div>
      <style>{`
        @keyframes rv-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes rv-fade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Progress row */}
      <div style={rv.progressRow}>
        <div style={rv.progressTrack}>
          <div style={{ ...rv.progressFill, width: `${pct}%` }} />
        </div>
        {reviewed !== null && (
          <span style={rv.progressText}>
            {reviewed.toLocaleString()} / {total?.toLocaleString()} reviewed
          </span>
        )}
        {skippedPhase && <span style={rv.phaseTag}>Reviewing skipped</span>}
        <div style={rv.badges}>
          <span style={{ ...rv.badge, color: "#68d391", borderColor: "#1c4532" }}>K {sessionStats.kept}</span>
          <span style={{ ...rv.badge, color: "#fc8181", borderColor: "#4a1a1a" }}>D {sessionStats.deleted}</span>
          <span style={{ ...rv.badge, color: "#f6ad55", borderColor: "#4a3000" }}>S {sessionStats.skipped}</span>
        </div>
      </div>

      {/* Prop card */}
      {loading && !prop ? (
        <div style={rv.loadingMsg}>Loading…</div>
      ) : prop ? (
        <div style={rv.card} key={prop.name}>
          <div style={rv.images}>
            <ReviewImagePanel src={`${R2}/${prop.name}_overview.png`} label="Overview" />
            <ReviewImagePanel src={`${R2}/${prop.name}_player.png`}   label="Player view" />
          </div>
          <div style={rv.propInfo}>
            <span style={rv.propName}>{prop.name}</span>
            <span style={rv.propHash}>{joaatHash(prop.name)}</span>
          </div>
          <div style={rv.actions}>
            <button style={{ ...rv.actionBtn, ...rv.keepBtn }}   onClick={() => doAction("keep")}>
              <kbd style={rv.kbd}>K</kbd> Keep
            </button>
            <button style={{ ...rv.actionBtn, ...rv.deleteBtn }} onClick={() => doAction("delete")}>
              <kbd style={rv.kbd}>D</kbd> Delete
            </button>
            <button style={{ ...rv.actionBtn, ...rv.skipBtn }}   onClick={() => doAction("skip")}>
              <kbd style={rv.kbd}>S</kbd> Skip
            </button>
          </div>
          {feedback && (
            <div style={{ ...rv.feedback, background: feedback.color + "18", borderColor: feedback.color + "55", color: feedback.color }}>
              {feedback.label}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Auth gate ─────────────────────────────────────────────────────────────────

function AuthGate({ onAuth }) {
  const [password, setPassword] = useState("");
  const [shake, setShake] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      onAuth();
    } else {
      setShake(true);
      setPassword("");
      setTimeout(() => setShake(false), 500);
    }
  }

  return (
    <div style={s.authPage}>
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-10px); }
          40%, 80% { transform: translateX(10px); }
        }
        .shake { animation: shake 0.5s ease; }
      `}</style>
      <form className={shake ? "shake" : ""} style={s.authForm} onSubmit={handleSubmit}>
        <div style={s.authIcon}>⚙</div>
        <h2 style={s.authTitle}>Admin</h2>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={s.authInput}
          autoFocus
        />
        <button type="submit" style={s.authBtn}>Enter</button>
      </form>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color = "#e2e8f0", sub }) {
  return (
    <div style={s.statCard}>
      <div style={{ ...s.statValue, color }}>
        {value == null ? "—" : typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div style={s.statLabel}>{label}</div>
      {sub != null && <div style={s.statSub}>{sub}</div>}
    </div>
  );
}

// ── Top list ──────────────────────────────────────────────────────────────────

function TopList({ title, data }) {
  return (
    <div style={s.panel}>
      <div style={s.panelTitle}>{title}</div>
      {data.length === 0 ? (
        <p style={s.empty}>No data yet.</p>
      ) : (
        <ol style={s.topList}>
          {data.map(({ query, count }, i) => (
            <li key={query} style={s.topItem}>
              <span style={s.topRank}>#{i + 1}</span>
              <span style={s.topQuery} title={query}>{query}</span>
              <span style={s.topCount}>{Number(count).toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ── Bar chart ─────────────────────────────────────────────────────────────────

function BarChart({ data }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div style={s.panel}>
      <div style={s.panelTitle}>Daily searches — last 7 days</div>
      <div style={s.chart}>
        {data.map(({ day, count, label }) => (
          <div key={day} style={s.barCol}>
            <div style={s.barCount}>{count > 0 ? count : ""}</div>
            <div style={s.barTrack}>
              <div
                style={{
                  ...s.bar,
                  height: `${Math.max(Math.round((count / max) * 100), count > 0 ? 4 : 0)}%`,
                }}
              />
            </div>
            <div style={s.barLabel}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("admin-auth") === "1");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function handleAuth() {
    sessionStorage.setItem("admin-auth", "1");
    setAuthed(true);
  }

  function loadStats() {
    setLoading(true);
    setError(null);
    fetch(`${API}/admin/stats`, {
      headers: { "x-admin-password": ADMIN_PASSWORD },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setStats(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (authed) loadStats();
  }, [authed]);

  if (!authed) return <AuthGate onAuth={handleAuth} />;

  return (
    <div style={s.page}>
      <div style={s.container}>

        {/* Header */}
        <div style={s.header}>
          <div>
            <h1 style={s.title}>Admin Dashboard</h1>
            <p style={s.subtitle}>FiveM Prop Search</p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {activeTab === "dashboard" && (
              <button style={s.refreshBtn} onClick={loadStats} disabled={loading}>
                {loading ? "…" : "↻ Refresh"}
              </button>
            )}
            <button
              style={s.logoutBtn}
              onClick={() => { sessionStorage.removeItem("admin-auth"); setAuthed(false); }}
            >
              Logout
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={s.tabs}>
          <button
            style={{ ...s.tab, ...(activeTab === "dashboard" ? s.tabActive : {}) }}
            onClick={() => setActiveTab("dashboard")}
          >
            Dashboard
          </button>
          <button
            style={{ ...s.tab, ...(activeTab === "review" ? s.tabActive : {}) }}
            onClick={() => setActiveTab("review")}
          >
            Review Props
          </button>
        </div>

        {activeTab === "review" && <ReviewSection isActive={activeTab === "review"} />}

        {activeTab === "dashboard" && error && <p style={s.errorMsg}>{error}</p>}

        {activeTab === "dashboard" && loading && !stats && (
          <p style={s.loadingMsg}>Loading…</p>
        )}

        {activeTab === "dashboard" && stats && (() => {
          const { review, topSearches, topCopies, dailySearches, typeCounts } = stats;

          // Fill last 7 days for chart
          const last7 = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            return d.toISOString().slice(0, 10);
          });
          const dailyMap = {};
          (dailySearches || []).forEach(({ day, count }) => {
            dailyMap[String(day).slice(0, 10)] = Number(count);
          });
          const chartData = last7.map((day) => ({
            day,
            count: dailyMap[day] || 0,
            label: new Date(day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
          }));

          const typeMap = {};
          (typeCounts || []).forEach(({ type, count }) => { typeMap[type] = Number(count); });
          const regularCount = typeMap.search || 0;
          const aiCount = typeMap.ai_best_match || 0;
          const copyCount = typeMap.copy || 0;
          const totalSearchCount = regularCount + aiCount;

          const withImages = review.total - review.deleted - (review.no_image || 0);

          return (
            <>
              {/* Props & review */}
              <div style={s.sectionTitle}>Props &amp; Review</div>
              <div style={s.statRow}>
                <StatCard label="Total Props" value={review.total} color="#e2e8f0" />
                <StatCard
                  label="Est. With Images"
                  value={withImages}
                  color="#68d391"
                  sub={review.total > 0 ? `${Math.round((withImages / review.total) * 100)}%` : null}
                />
                <StatCard label="Kept" value={review.kept} color="#68d391" />
                <StatCard label="Deleted" value={review.deleted} color="#fc8181" />
                <StatCard label="No Image" value={review.no_image || 0} color="#f6ad55" />
                <StatCard label="Unreviewed" value={review.unreviewed} color="#718096" />
              </div>

              {/* Search activity */}
              <div style={s.sectionTitle}>Search Activity (all time)</div>
              <div style={s.statRow}>
                <StatCard label="Regular Searches" value={regularCount} color="#90cdf4" />
                <StatCard label="AI Best Match" value={aiCount} color="#c4b5fd" />
                <StatCard label="Copies" value={copyCount} color="#f6ad55" />
                <StatCard
                  label="AI Usage Rate"
                  value={totalSearchCount > 0
                    ? `${Math.round((aiCount / totalSearchCount) * 100)}%`
                    : "—"}
                  color="#c4b5fd"
                />
              </div>

              {/* Bar chart */}
              <BarChart data={chartData} />

              {/* Top lists */}
              <div style={s.twoCol}>
                <TopList title="Top searches this week" data={topSearches} />
                <TopList title="Top copied props" data={topCopies} />
              </div>
            </>
          );
        })()}

      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  page: {
    minHeight: "100vh",
    background: "#0f1117",
    color: "#e2e8f0",
    padding: "0 16px 64px",
  },
  container: {
    maxWidth: "1000px",
    margin: "0 auto",
    paddingTop: "48px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "40px",
  },
  title: {
    fontSize: "1.8rem",
    fontWeight: 700,
    margin: 0,
    color: "#f7fafc",
  },
  subtitle: {
    fontSize: "0.85rem",
    color: "#4a5568",
    margin: "4px 0 0",
  },
  refreshBtn: {
    fontSize: "0.8rem",
    fontWeight: 600,
    padding: "6px 14px",
    borderRadius: "8px",
    border: "1px solid #2d3748",
    background: "#1a1d27",
    color: "#718096",
    cursor: "pointer",
  },
  logoutBtn: {
    fontSize: "0.8rem",
    fontWeight: 600,
    padding: "6px 14px",
    borderRadius: "8px",
    border: "1px solid #4a5568",
    background: "transparent",
    color: "#718096",
    cursor: "pointer",
  },
  sectionTitle: {
    fontSize: "0.68rem",
    fontWeight: 700,
    color: "#4a5568",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    marginBottom: "12px",
  },
  statRow: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    marginBottom: "32px",
  },
  statCard: {
    flex: "1 1 120px",
    background: "#1a1d27",
    border: "1px solid #2d3748",
    borderRadius: "10px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  statValue: {
    fontSize: "1.6rem",
    fontWeight: 700,
    lineHeight: 1,
  },
  statLabel: {
    fontSize: "0.72rem",
    color: "#718096",
    fontWeight: 600,
  },
  statSub: {
    fontSize: "0.7rem",
    color: "#4a5568",
  },
  panel: {
    background: "#1a1d27",
    border: "1px solid #2d3748",
    borderRadius: "10px",
    padding: "20px",
    marginBottom: "16px",
  },
  panelTitle: {
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "#718096",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: "16px",
  },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
  },
  topList: {
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  topItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "7px 10px",
    background: "#13161f",
    borderRadius: "6px",
    border: "1px solid #2d3748",
  },
  topRank: {
    fontSize: "0.65rem",
    fontWeight: 700,
    color: "#4a5568",
    width: "24px",
    flexShrink: 0,
  },
  topQuery: {
    fontFamily: "monospace",
    fontSize: "0.82rem",
    color: "#90cdf4",
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  topCount: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#718096",
    flexShrink: 0,
  },
  empty: {
    fontSize: "0.8rem",
    color: "#4a5568",
  },
  chart: {
    display: "flex",
    gap: "8px",
    alignItems: "flex-end",
    height: "140px",
  },
  barCol: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
    height: "100%",
  },
  barCount: {
    fontSize: "0.65rem",
    color: "#718096",
    height: "16px",
    display: "flex",
    alignItems: "center",
  },
  barTrack: {
    flex: 1,
    width: "100%",
    background: "#13161f",
    borderRadius: "4px",
    display: "flex",
    alignItems: "flex-end",
    overflow: "hidden",
  },
  bar: {
    width: "100%",
    background: "linear-gradient(to top, #3b1fa8, #7c3aed)",
    borderRadius: "4px 4px 0 0",
    transition: "height 0.3s ease",
    minHeight: 0,
  },
  barLabel: {
    fontSize: "0.62rem",
    color: "#4a5568",
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  errorMsg: {
    color: "#fc8181",
    fontSize: "0.9rem",
    marginBottom: "16px",
  },
  loadingMsg: {
    color: "#718096",
    fontSize: "0.9rem",
    textAlign: "center",
    paddingTop: "60px",
  },

  // Auth gate
  authPage: {
    minHeight: "100vh",
    background: "#0f1117",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  authForm: {
    background: "#1a1d27",
    border: "1px solid #2d3748",
    borderRadius: "14px",
    padding: "40px 32px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    width: "280px",
  },
  authIcon: {
    fontSize: "1.5rem",
    textAlign: "center",
    color: "#4a5568",
  },
  authTitle: {
    fontSize: "1.2rem",
    fontWeight: 700,
    textAlign: "center",
    color: "#e2e8f0",
    margin: 0,
  },
  authInput: {
    width: "100%",
    padding: "12px 14px",
    fontSize: "0.95rem",
    background: "#0f1117",
    border: "1px solid #2d3748",
    borderRadius: "8px",
    color: "#e2e8f0",
    outline: "none",
    boxSizing: "border-box",
  },
  authBtn: {
    padding: "10px",
    fontSize: "0.9rem",
    fontWeight: 700,
    background: "#3b1fa8",
    border: "1px solid #7c3aed",
    borderRadius: "8px",
    color: "#e9d5ff",
    cursor: "pointer",
  },

  // Tabs
  tabs: {
    display: "flex",
    gap: "2px",
    marginBottom: "28px",
    borderBottom: "1px solid #2d3748",
  },
  tab: {
    padding: "8px 18px",
    fontSize: "0.82rem",
    fontWeight: 600,
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "#4a5568",
    cursor: "pointer",
    marginBottom: "-1px",
    transition: "color 0.15s, border-color 0.15s",
  },
  tabActive: {
    color: "#e2e8f0",
    borderBottomColor: "#7c3aed",
  },
};

// ── Review section styles ─────────────────────────────────────────────────────

const rv = {
  progressRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "16px",
    flexWrap: "wrap",
  },
  progressTrack: {
    flex: 1,
    minWidth: "80px",
    height: "4px",
    background: "#2d3748",
    borderRadius: "999px",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, #4a6fa5, #68d391)",
    borderRadius: "999px",
    transition: "width 0.4s ease",
  },
  progressText: {
    fontSize: "0.78rem",
    color: "#718096",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  phaseTag: {
    fontSize: "0.68rem",
    fontWeight: 700,
    color: "#f6ad55",
    background: "#3d2e0a",
    padding: "2px 8px",
    borderRadius: "999px",
    flexShrink: 0,
  },
  badges: { display: "flex", gap: "6px", flexShrink: 0 },
  badge: {
    fontSize: "0.72rem",
    fontWeight: 700,
    padding: "3px 9px",
    borderRadius: "999px",
    border: "1px solid",
    background: "transparent",
    fontFamily: "monospace",
  },
  card: {
    position: "relative",
    background: "#1a1d27",
    border: "1px solid #2d3748",
    borderRadius: "12px",
    overflow: "hidden",
    animation: "rv-fade 0.18s ease",
  },
  images: {
    display: "flex",
    borderBottom: "1px solid #2d3748",
  },
  imgPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid #2d3748",
  },
  imgLabel: {
    fontSize: "0.62rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "#4a5568",
    padding: "6px 14px 5px",
    borderBottom: "1px solid #2d3748",
  },
  imgBox: {
    position: "relative",
    height: "280px",
    background: "#0d1117",
    overflow: "hidden",
  },
  img: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    transition: "opacity 0.15s",
  },
  imgSkeleton: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(90deg, #1a1d27 25%, #22263a 50%, #1a1d27 75%)",
    backgroundSize: "200% 100%",
    animation: "rv-shimmer 1.4s ease-in-out infinite",
  },
  imgNoImg: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#4a5568",
    fontSize: "0.82rem",
  },
  propInfo: {
    display: "flex",
    alignItems: "baseline",
    gap: "12px",
    padding: "12px 18px",
    borderBottom: "1px solid #2d3748",
  },
  propName: {
    fontFamily: "monospace",
    fontSize: "0.95rem",
    color: "#90cdf4",
    wordBreak: "break-all",
  },
  propHash: {
    fontFamily: "monospace",
    fontSize: "0.75rem",
    color: "#4a5568",
    flexShrink: 0,
  },
  actions: {
    display: "flex",
    gap: "10px",
    padding: "14px 18px",
  },
  actionBtn: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "11px 0",
    fontSize: "0.88rem",
    fontWeight: 700,
    border: "1px solid",
    borderRadius: "10px",
    cursor: "pointer",
    letterSpacing: "0.02em",
  },
  keepBtn:   { background: "#0d2b1d", borderColor: "#1c5132", color: "#68d391" },
  deleteBtn: { background: "#2d0f0f", borderColor: "#5c2020", color: "#fc8181" },
  skipBtn:   { background: "#2d2000", borderColor: "#5c4000", color: "#f6ad55" },
  kbd: {
    fontFamily: "monospace",
    fontSize: "0.72rem",
    fontWeight: 800,
    padding: "1px 5px",
    background: "rgba(255,255,255,0.08)",
    borderRadius: "4px",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  feedback: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: "1.3rem",
    fontWeight: 800,
    padding: "14px 32px",
    borderRadius: "12px",
    border: "1px solid",
    backdropFilter: "blur(8px)",
    pointerEvents: "none",
    animation: "rv-fade 0.1s ease",
    letterSpacing: "0.04em",
  },
  loadingMsg: { color: "#4a5568", fontSize: "0.9rem", padding: "40px 0" },
  doneBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "14px",
    padding: "60px 20px",
    background: "#1a1d27",
    border: "1px solid #2d3748",
    borderRadius: "12px",
    textAlign: "center",
  },
  doneTitle: { fontSize: "1.4rem", fontWeight: 800, color: "#e2e8f0" },
  doneStats: { display: "flex", gap: "24px", fontFamily: "monospace", fontWeight: 700, fontSize: "1rem" },
  doneActions: { display: "flex", gap: "10px", marginTop: "8px" },
  doneBtn: {
    padding: "9px 20px",
    fontSize: "0.88rem",
    fontWeight: 700,
    background: "#2d3748",
    border: "1px solid #4a5568",
    borderRadius: "10px",
    color: "#e2e8f0",
    cursor: "pointer",
  },
  doneBtnSecondary: { background: "transparent", borderColor: "#2d3748", color: "#718096" },
};
