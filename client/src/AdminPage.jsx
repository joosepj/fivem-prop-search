import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL ?? "";
const ADMIN_PASSWORD = "doggystyle2024";

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
            <button style={s.refreshBtn} onClick={loadStats} disabled={loading}>
              {loading ? "…" : "↻ Refresh"}
            </button>
            <button
              style={s.logoutBtn}
              onClick={() => { sessionStorage.removeItem("admin-auth"); setAuthed(false); }}
            >
              Logout
            </button>
          </div>
        </div>

        {error && <p style={s.errorMsg}>{error}</p>}

        {loading && !stats && (
          <p style={s.loadingMsg}>Loading…</p>
        )}

        {stats && (() => {
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
};
