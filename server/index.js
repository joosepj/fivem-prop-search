import "dotenv/config";
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
      max_tokens: 256,
      tools: [
        {
          name: "pick_best_prop",
          description: "Pick the single best matching GTA V prop from the candidate list",
          input_schema: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "The exact prop name from the candidate list",
              },
              reason: {
                type: "string",
                description:
                  "One sentence explaining why this prop best matches the user's description",
              },
            },
            required: ["name", "reason"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "pick_best_prop" },
      messages: [
        {
          role: "user",
          content: `A FiveM/GTA V developer is looking for a prop. Their description: "${query}"\n\nVector search returned these candidates:\n${propList}\n\nPick the single best prop from this list.`,
        },
      ],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    const { name, reason } = toolUse.input;
    const match = candidates.find((c) => c.name === name) ?? candidates[0];

    res.json({
      best: { name: match.name, reason, similarity: match.similarity },
      results: candidates,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
