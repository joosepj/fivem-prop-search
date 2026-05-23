import "dotenv/config";
import crypto from "crypto";
import https from "https";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-memory rate limit store: ip -> array of request timestamps
const rateLimitStore = new Map();
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HOUR_LIMIT = 10;
const DAY_LIMIT = 50;

function getIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return (forwarded ? forwarded.split(",")[0] : req.socket.remoteAddress).trim();
}

function checkRateLimit(ip) {
  const now = Date.now();
  const timestamps = (rateLimitStore.get(ip) || []).filter((t) => t > now - DAY_MS);
  const hourCount = timestamps.filter((t) => t > now - HOUR_MS).length;
  const dayCount = timestamps.length;

  if (hourCount >= HOUR_LIMIT) return { allowed: false, window: "hour" };
  if (dayCount >= DAY_LIMIT) return { allowed: false, window: "day" };

  timestamps.push(now);
  rateLimitStore.set(ip, timestamps);
  return { allowed: true };
}

async function getEmbeddingAndCandidates(query, limit = 20) {
  const embeddingRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  const embedding = embeddingRes.data[0].embedding;

  const { data, error } = await supabase.rpc("match_props", {
    query_embedding: embedding,
    match_count: limit,
  });
  if (error) throw new Error(error.message);
  return data;
}

app.get("/search", async (req, res) => {
  const query = req.query.q?.trim();
  if (!query) return res.status(400).json({ error: "q is required" });

  const limit = Math.min(parseInt(req.query.limit) || 20, 100);

  try {
    const results = await getEmbeddingAndCandidates(query, limit);
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/best-match", async (req, res) => {
  const query = req.query.q?.trim();
  if (!query) return res.status(400).json({ error: "q is required" });

  const limit = checkRateLimit(getIp(req));
  if (!limit.allowed) {
    const msg = limit.window === "hour"
      ? "You've used your AI searches for this hour — try again soon or use the regular search above."
      : "You've used your AI searches for today — try again tomorrow or use the regular search above.";
    return res.status(429).json({ error: msg });
  }

  try {
    const candidates = await getEmbeddingAndCandidates(query, 20);

    const propList = candidates.map((c) => c.name).join("\n");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      tools: [
        {
          name: "pick_top_props",
          description: "Pick the top 3 best matching GTA V props from the candidate list, ranked best to worst",
          input_schema: {
            type: "object",
            properties: {
              picks: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                      description: "The exact prop name from the candidate list",
                    },
                    reason: {
                      type: "string",
                      description: "One sentence explaining why this prop matches the user's description",
                    },
                  },
                  required: ["name", "reason"],
                },
              },
            },
            required: ["picks"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "pick_top_props" },
      messages: [
        {
          role: "user",
          content: `A FiveM/GTA V developer is looking for a prop. Their description: "${query}"\n\nVector search returned these candidates:\n${propList}\n\nPick the top 3 best props from this list, ranked from best to worst match.`,
        },
      ],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    const top = toolUse.input.picks.map((pick) => {
      const match = candidates.find((c) => c.name === pick.name) ?? candidates[0];
      return { name: match.name, reason: pick.reason, similarity: match.similarity };
    });

    res.json({ top, results: candidates });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── R2 helpers ────────────────────────────────────────────────────────────────

const R2_HOST   = `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const R2_BUCKET = process.env.R2_BUCKET || "gta-prop-images";
const R2_KEY    = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET = process.env.R2_SECRET_ACCESS_KEY;

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}
function hmacSha256(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function deleteFromR2(objectKey) {
  return new Promise((resolve, reject) => {
    const now       = new Date();
    const amzDate   = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const dateStamp = amzDate.slice(0, 8);
    const emptyHash = sha256Hex("");
    const uri       = `/${R2_BUCKET}/${objectKey}`;

    const canonHeaders = `host:${R2_HOST}\nx-amz-content-sha256:${emptyHash}\nx-amz-date:${amzDate}\n`;
    const signedHdrs   = "host;x-amz-content-sha256;x-amz-date";
    const canonReq     = `DELETE\n${uri}\n\n${canonHeaders}\n${signedHdrs}\n${emptyHash}`;
    const scope        = `${dateStamp}/auto/s3/aws4_request`;
    const sts          = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(canonReq)}`;

    const kDate    = hmacSha256(`AWS4${R2_SECRET}`, dateStamp);
    const kRegion  = hmacSha256(kDate,    "auto");
    const kService = hmacSha256(kRegion,  "s3");
    const kSign    = hmacSha256(kService, "aws4_request");
    const sig      = hmacSha256(kSign, sts).toString("hex");
    const auth     = `AWS4-HMAC-SHA256 Credential=${R2_KEY}/${scope}, SignedHeaders=${signedHdrs}, Signature=${sig}`;

    const req = https.request({
      hostname: R2_HOST,
      path    : uri,
      method  : "DELETE",
      headers : { "x-amz-content-sha256": emptyHash, "x-amz-date": amzDate, Authorization: auth, Host: R2_HOST },
    }, (res) => {
      res.resume();
      res.on("end", () => {
        // 204 = deleted, 404 = already gone — both are fine
        if (res.statusCode < 300 || res.statusCode === 404) resolve();
        else reject(new Error(`R2 DELETE ${objectKey}: HTTP ${res.statusCode}`));
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// ── Review endpoints ──────────────────────────────────────────────────────────

app.get("/review/next", async (req, res) => {
  const includeSkipped = req.query.skipped === "1";
  try {
    let query = supabase.from("props").select("id, name").order("id").limit(1);
    if (includeSkipped) {
      query = query.eq("review_status", "skipped");
    } else {
      query = query.is("review_status", null);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);

    if (!data) return res.json({ done: true });

    // Progress counts
    const [{ count: total }, { count: reviewed }] = await Promise.all([
      supabase.from("props").select("*", { count: "exact", head: true }),
      supabase.from("props").select("*", { count: "exact", head: true })
        .in("review_status", ["kept", "deleted"]),
    ]);

    res.json({ prop: data, total, reviewed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/review/action", async (req, res) => {
  const { name, action } = req.body;
  if (!name || !action) return res.status(400).json({ error: "name and action required" });

  // Map action to DB status
  const statusMap = { keep: "kept", delete: "deleted", skip: "skipped", no_image: "no_image" };
  const status = statusMap[action];
  if (!status) return res.status(400).json({ error: "invalid action" });

  try {
    // Update DB first so the next /review/next query never returns this prop again.
    // For delete, R2 removal runs in the background after we respond so the client
    // isn't blocked waiting for two Cloudflare round-trips.
    const { error } = await supabase
      .from("props")
      .update({ review_status: status })
      .eq("name", name);
    if (error) throw new Error(error.message);

    if (action === "delete") {
      Promise.allSettled([
        deleteFromR2(`${name}_overview.png`),
        deleteFromR2(`${name}_player.png`),
      ]).catch(console.error);
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/review/stats", async (req, res) => {
  try {
    const [{ count: total }, { count: kept }, { count: deleted }, { count: skipped }] = await Promise.all([
      supabase.from("props").select("*", { count: "exact", head: true }),
      supabase.from("props").select("*", { count: "exact", head: true }).eq("review_status", "kept"),
      supabase.from("props").select("*", { count: "exact", head: true }).eq("review_status", "deleted"),
      supabase.from("props").select("*", { count: "exact", head: true }).eq("review_status", "skipped"),
    ]);
    res.json({ total, kept, deleted, skipped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
