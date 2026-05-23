import { useState, useEffect, useRef, useCallback } from "react";

const API = import.meta.env.VITE_API_URL ?? "";
const R2  = "https://pub-c1d30e6aba3a4fca841cd417ecbe67e0.r2.dev";

// Change this to whatever password you want
const REVIEW_PASSWORD = "props2024";
const STATS_KEY       = "review-session-stats";

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

function loadStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY)) || { kept: 0, deleted: 0, skipped: 0 }; }
  catch { return { kept: 0, deleted: 0, skipped: 0 }; }
}

function saveStats(s) {
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton() {
  return <div style={rs.skeleton} />;
}

// ── Image panel ───────────────────────────────────────────────────────────────
function PropImagePanel({ src, label }) {
  const [status, setStatus] = useState("loading");
  useEffect(() => { setStatus("loading"); }, [src]);

  return (
    <div style={rs.imgPanel}>
      <div style={rs.imgLabel}>{label}</div>
      <div style={rs.imgBox}>
        <img
          key={src}
          src={src}
          alt={label}
          style={{ ...rs.img, opacity: status === "loaded" ? 1 : 0 }}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
        {status === "loading" && <Skeleton />}
        {status === "error" && <div style={rs.noImg}>No image</div>}
      </div>
    </div>
  );
}

// ── Password gate ─────────────────────────────────────────────────────────────
function AuthGate({ onAuth }) {
  const [pw, setPw]       = useState("");
  const [shake, setShake] = useState(false);

  function submit(e) {
    e.preventDefault();
    if (pw === REVIEW_PASSWORD) {
      sessionStorage.setItem("review-auth", "1");
      onAuth();
    } else {
      setShake(true);
      setPw("");
      setTimeout(() => setShake(false), 500);
    }
  }

  return (
    <div style={rs.page}>
      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%,60%{transform:translateX(-8px)}
          40%,80%{transform:translateX(8px)}
        }
        .shake { animation: shake 0.4s ease; }
      `}</style>
      <div style={rs.authBox}>
        <div style={rs.authTitle}>Prop Review</div>
        <form onSubmit={submit} style={rs.authForm}>
          <input
            className={shake ? "shake" : ""}
            style={{ ...rs.authInput, ...(shake ? { borderColor: "#fc8181" } : {}) }}
            type="password"
            placeholder="Password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
          />
          <button style={rs.authBtn} type="submit">Enter</button>
        </form>
      </div>
    </div>
  );
}

// ── Summary screen ────────────────────────────────────────────────────────────
function SummaryScreen({ stats, onReviewSkipped, onReset }) {
  const total = stats.kept + stats.deleted + stats.skipped;
  return (
    <div style={rs.page}>
      <div style={rs.summaryBox}>
        <div style={rs.summaryTitle}>All caught up!</div>
        <div style={rs.summarySubtitle}>Session summary</div>
        <div style={rs.summaryStats}>
          <div style={rs.summaryStat}>
            <span style={{ ...rs.summaryNum, color: "#68d391" }}>{stats.kept.toLocaleString()}</span>
            <span style={rs.summaryLabel}>Kept</span>
          </div>
          <div style={rs.summaryStat}>
            <span style={{ ...rs.summaryNum, color: "#fc8181" }}>{stats.deleted.toLocaleString()}</span>
            <span style={rs.summaryLabel}>Deleted</span>
          </div>
          <div style={rs.summaryStat}>
            <span style={{ ...rs.summaryNum, color: "#f6ad55" }}>{stats.skipped.toLocaleString()}</span>
            <span style={rs.summaryLabel}>Skipped</span>
          </div>
        </div>
        {total > 0 && <p style={rs.summaryTotal}>{total.toLocaleString()} reviewed this session</p>}
        <div style={rs.summaryActions}>
          {stats.skipped > 0 && (
            <button style={rs.summaryBtn} onClick={onReviewSkipped}>
              Review skipped ({stats.skipped})
            </button>
          )}
          <button style={{ ...rs.summaryBtn, ...rs.summaryBtnSecondary }} onClick={onReset}>
            Start over
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ReviewPage() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("review-auth") === "1");

  const [prop, setProp]               = useState(null);
  const [loading, setLoading]         = useState(false);
  const [done, setDone]               = useState(false);
  const [skippedPhase, setSkippedPhase] = useState(false);

  const [total, setTotal]             = useState(null);
  const [reviewed, setReviewed]       = useState(null);

  const [stats, setStats]             = useState(loadStats);
  const [feedback, setFeedback]       = useState(null); // { label, color }

  const actionLock = useRef(false);
  const feedbackTimer = useRef(null);
  const overviewRef = useRef(null);

  // ── Fetch next prop ──────────────────────────────────────────────────────────
  const fetchNext = useCallback(async (useSkippedPhase = false) => {
    setLoading(true);
    setProp(null);
    try {
      const url = `${API}/review/next${useSkippedPhase ? "?skipped=1" : ""}`;
      const res  = await fetch(url);
      const data = await res.json();

      if (data.done) {
        if (!useSkippedPhase) {
          // Phase 1 done — try skipped phase
          const res2  = await fetch(`${API}/review/next?skipped=1`);
          const data2 = await res2.json();
          if (data2.done) {
            setDone(true);
          } else {
            setSkippedPhase(true);
            setProp(data2.prop);
            setTotal(data2.total);
            setReviewed(data2.reviewed);
          }
        } else {
          setDone(true);
        }
      } else {
        setProp(data.prop);
        setTotal(data.total);
        setReviewed(data.reviewed);
      }
    } catch (e) {
      console.error("fetchNext error", e);
    } finally {
      setLoading(false);
      actionLock.current = false;
    }
  }, []);

  // ── Action handler ───────────────────────────────────────────────────────────
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

    const statKey = action === "keep" ? "kept" : action === "delete" ? "deleted" : "skipped";
    setStats((prev) => {
      const next = { ...prev, [statKey]: prev[statKey] + 1 };
      saveStats(next);
      return next;
    });

    // Must await before fetchNext so the DB is updated before we query for the next prop.
    // If we fire-and-forget, fetchNext returns the same prop (still null in DB) and the
    // reviewed count from the server is stale, overwriting the optimistic increment.
    try {
      await fetch(`${API}/review/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: prop.name, action }),
      });
    } catch (e) {
      console.error(e);
    }

    await fetchNext(skippedPhase);
  }, [prop, loading, skippedPhase, fetchNext]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!authed || done) return;
    function onKey(e) {
      if (e.target.tagName === "INPUT") return;
      if      (e.key === "k" || e.key === "K") doAction("keep");
      else if (e.key === "d" || e.key === "D") doAction("delete");
      else if (e.key === "s" || e.key === "S") doAction("skip");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authed, done, doAction]);

  // ── Auto-advance if overview image errors (no screenshot) ───────────────────
  // Handled inline in the image panel — we watch for both images failing below.
  // Instead, we let the user see "No image" and press any key; no silent auto-skip.

  // ── Init ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authed) fetchNext(false);
  }, [authed, fetchNext]);

  // ── Render guards ─────────────────────────────────────────────────────────────
  if (!authed) {
    return <AuthGate onAuth={() => setAuthed(true)} />;
  }

  if (done) {
    return (
      <SummaryScreen
        stats={stats}
        onReviewSkipped={() => {
          setDone(false);
          setSkippedPhase(true);
          fetchNext(true);
        }}
        onReset={() => {
          const fresh = { kept: 0, deleted: 0, skipped: 0 };
          setStats(fresh);
          saveStats(fresh);
          setDone(false);
          setSkippedPhase(false);
          fetchNext(false);
        }}
      />
    );
  }

  const overviewSrc = prop ? `${R2}/${prop.name}_overview.png` : null;
  const playerSrc   = prop ? `${R2}/${prop.name}_player.png`   : null;

  return (
    <div style={rs.page}>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Top bar ── */}
      <div style={rs.topBar}>
        <a href="/" style={rs.backLink}>← Search</a>

        <div style={rs.progressWrap}>
          {reviewed !== null && total !== null ? (
            <>
              <div style={rs.progressBar}>
                <div style={{ ...rs.progressFill, width: `${Math.min(100, (reviewed / total) * 100)}%` }} />
              </div>
              <span style={rs.progressText}>
                {reviewed.toLocaleString()} / {total.toLocaleString()} reviewed
              </span>
            </>
          ) : null}
          {skippedPhase && <span style={rs.phaseTag}>Reviewing skipped</span>}
        </div>

        <div style={rs.sessionBadges}>
          <span style={{ ...rs.badge, color: "#68d391", borderColor: "#1c4532" }}>K {stats.kept}</span>
          <span style={{ ...rs.badge, color: "#fc8181", borderColor: "#4a1a1a" }}>D {stats.deleted}</span>
          <span style={{ ...rs.badge, color: "#f6ad55", borderColor: "#4a3000" }}>S {stats.skipped}</span>
        </div>
      </div>

      {/* ── Card ── */}
      <div style={rs.cardWrap}>
        {loading && !prop ? (
          <div style={rs.loadingState}>Loading…</div>
        ) : prop ? (
          <div style={rs.card} key={prop.name}>
            {/* Images */}
            <div style={rs.images}>
              <PropImagePanel src={overviewSrc} label="Overview" />
              <PropImagePanel src={playerSrc}   label="Player view" />
            </div>

            {/* Prop info */}
            <div style={rs.propInfo}>
              <span style={rs.propName}>{prop.name}</span>
              <span style={rs.propHash}>{joaatHash(prop.name)}</span>
            </div>

            {/* Action buttons */}
            <div style={rs.actions}>
              <button style={{ ...rs.actionBtn, ...rs.keepBtn }}   onClick={() => doAction("keep")}>
                <kbd style={rs.kbd}>K</kbd> Keep
              </button>
              <button style={{ ...rs.actionBtn, ...rs.deleteBtn }} onClick={() => doAction("delete")}>
                <kbd style={rs.kbd}>D</kbd> Delete
              </button>
              <button style={{ ...rs.actionBtn, ...rs.skipBtn }}   onClick={() => doAction("skip")}>
                <kbd style={rs.kbd}>S</kbd> Skip
              </button>
            </div>

            {/* Action feedback flash */}
            {feedback && (
              <div style={{ ...rs.feedback, background: feedback.color + "18", borderColor: feedback.color + "55", color: feedback.color }}>
                {feedback.label}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rs = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    background: "#0f1117",
    color: "#e2e8f0",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  },

  // Auth
  authBox: {
    marginTop: "30vh",
    background: "#1a1d27",
    border: "1px solid #2d3748",
    borderRadius: "14px",
    padding: "36px 40px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "20px",
    minWidth: "300px",
  },
  authTitle: { fontSize: "1.2rem", fontWeight: 700, color: "#e2e8f0" },
  authForm:  { display: "flex", gap: "8px", width: "100%" },
  authInput: {
    flex: 1,
    padding: "10px 14px",
    background: "#0f1117",
    border: "1px solid #2d3748",
    borderRadius: "8px",
    color: "#e2e8f0",
    fontSize: "0.95rem",
    outline: "none",
    transition: "border-color 0.15s",
  },
  authBtn: {
    padding: "10px 20px",
    background: "#2d3748",
    border: "1px solid #4a5568",
    borderRadius: "8px",
    color: "#e2e8f0",
    fontSize: "0.9rem",
    fontWeight: 600,
    cursor: "pointer",
  },

  // Top bar
  topBar: {
    width: "100%",
    maxWidth: "900px",
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "16px 20px",
    borderBottom: "1px solid #1a1d27",
  },
  backLink: {
    color: "#4a5568",
    fontSize: "0.85rem",
    textDecoration: "none",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  progressWrap: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: 0,
  },
  progressBar: {
    flex: 1,
    height: "4px",
    background: "#2d3748",
    borderRadius: "999px",
    overflow: "hidden",
    minWidth: "60px",
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
  sessionBadges: {
    display: "flex",
    gap: "6px",
    flexShrink: 0,
  },
  badge: {
    fontSize: "0.72rem",
    fontWeight: 700,
    padding: "3px 9px",
    borderRadius: "999px",
    border: "1px solid",
    background: "transparent",
    fontFamily: "monospace",
  },

  // Card
  cardWrap: {
    flex: 1,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "32px 20px",
    width: "100%",
  },
  card: {
    position: "relative",
    background: "#1a1d27",
    border: "1px solid #2d3748",
    borderRadius: "14px",
    overflow: "hidden",
    width: "100%",
    maxWidth: "860px",
    animation: "fadeIn 0.18s ease",
  },
  loadingState: {
    color: "#4a5568",
    fontSize: "0.9rem",
    marginTop: "60px",
  },

  // Images
  images: {
    display: "flex",
    gap: "0",
    borderBottom: "1px solid #2d3748",
  },
  imgPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid #2d3748",
  },
  imgLabel: {
    fontSize: "0.65rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "#4a5568",
    padding: "8px 14px 6px",
    borderBottom: "1px solid #2d3748",
  },
  imgBox: {
    position: "relative",
    height: "320px",
    background: "#0d1117",
    overflow: "hidden",
  },
  img: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    transition: "opacity 0.15s",
  },
  skeleton: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(90deg, #1a1d27 25%, #22263a 50%, #1a1d27 75%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.4s ease-in-out infinite",
  },
  noImg: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#4a5568",
    fontSize: "0.82rem",
  },

  // Prop info
  propInfo: {
    display: "flex",
    alignItems: "baseline",
    gap: "12px",
    padding: "14px 20px",
    borderBottom: "1px solid #2d3748",
  },
  propName: {
    fontFamily: "monospace",
    fontSize: "1rem",
    color: "#90cdf4",
    wordBreak: "break-all",
  },
  propHash: {
    fontFamily: "monospace",
    fontSize: "0.78rem",
    color: "#4a5568",
    flexShrink: 0,
  },

  // Actions
  actions: {
    display: "flex",
    gap: "10px",
    padding: "16px 20px",
  },
  actionBtn: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "12px 0",
    fontSize: "0.9rem",
    fontWeight: 700,
    border: "1px solid",
    borderRadius: "10px",
    cursor: "pointer",
    transition: "all 0.12s",
    letterSpacing: "0.02em",
  },
  keepBtn: {
    background: "#0d2b1d",
    borderColor: "#1c5132",
    color: "#68d391",
  },
  deleteBtn: {
    background: "#2d0f0f",
    borderColor: "#5c2020",
    color: "#fc8181",
  },
  skipBtn: {
    background: "#2d2000",
    borderColor: "#5c4000",
    color: "#f6ad55",
  },
  kbd: {
    fontFamily: "monospace",
    fontSize: "0.75rem",
    fontWeight: 800,
    padding: "1px 5px",
    background: "rgba(255,255,255,0.08)",
    borderRadius: "4px",
    border: "1px solid rgba(255,255,255,0.1)",
  },

  // Feedback flash
  feedback: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: "1.4rem",
    fontWeight: 800,
    padding: "16px 36px",
    borderRadius: "12px",
    border: "1px solid",
    backdropFilter: "blur(8px)",
    pointerEvents: "none",
    animation: "fadeIn 0.1s ease",
    letterSpacing: "0.04em",
  },

  // Summary
  summaryBox: {
    marginTop: "20vh",
    background: "#1a1d27",
    border: "1px solid #2d3748",
    borderRadius: "16px",
    padding: "44px 52px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    minWidth: "380px",
  },
  summaryTitle:    { fontSize: "1.6rem", fontWeight: 800, color: "#e2e8f0" },
  summarySubtitle: { fontSize: "0.8rem", color: "#718096", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" },
  summaryStats:    { display: "flex", gap: "40px", margin: "8px 0" },
  summaryStat:     { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" },
  summaryNum:      { fontSize: "2rem", fontWeight: 800, fontFamily: "monospace" },
  summaryLabel:    { fontSize: "0.75rem", color: "#718096", textTransform: "uppercase", letterSpacing: "0.08em" },
  summaryTotal:    { fontSize: "0.85rem", color: "#4a5568", marginTop: "4px" },
  summaryActions:  { display: "flex", gap: "10px", marginTop: "16px" },
  summaryBtn: {
    padding: "10px 22px",
    fontSize: "0.9rem",
    fontWeight: 700,
    background: "#2d3748",
    border: "1px solid #4a5568",
    borderRadius: "10px",
    color: "#e2e8f0",
    cursor: "pointer",
  },
  summaryBtnSecondary: {
    background: "transparent",
    borderColor: "#2d3748",
    color: "#718096",
  },
};
