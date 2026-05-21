import "dotenv/config";
import https from "https";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const OBJECT_LIST_URL =
  "https://raw.githubusercontent.com/DurtyFree/gta-v-data-dumps/master/ObjectList.ini";

const BATCH_SIZE = 100; // OpenAI embeddings per request (max 2048 inputs)
const UPSERT_BATCH_SIZE = 500; // Supabase rows per upsert

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function fetchObjectList() {
  return new Promise((resolve, reject) => {
    https.get(OBJECT_LIST_URL, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
      res.on("error", reject);
    });
  });
}

function parseProps(ini) {
  const props = [];
  for (const line of ini.split(/\r?\n/)) {
    const trimmed = line.trim();
    // ObjectList.ini lines are bare prop names (no = or [section] header)
    if (trimmed && !trimmed.startsWith("[") && !trimmed.startsWith(";")) {
      props.push(trimmed.toLowerCase());
    }
  }
  return [...new Set(props)]; // deduplicate
}

async function embedBatch(names) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: names,
  });
  return response.data.map((d) => d.embedding);
}

async function upsertBatch(rows) {
  const { error } = await supabase
    .from("props")
    .upsert(rows, { onConflict: "name" });
  if (error) throw error;
}

async function main() {
  console.log("Downloading ObjectList.ini…");
  const ini = await fetchObjectList();

const props = parseProps(ini);
  console.log(`Parsed ${props.length} unique prop names.`);

  let inserted = 0;
  let upsertBuffer = [];

  for (let i = 0; i < props.length; i += BATCH_SIZE) {
    const nameBatch = props.slice(i, i + BATCH_SIZE);
    process.stdout.write(
      `Embedding ${i + 1}–${Math.min(i + BATCH_SIZE, props.length)} / ${props.length}…\r`
    );

    const embeddings = await embedBatch(nameBatch);

    for (let j = 0; j < nameBatch.length; j++) {
      upsertBuffer.push({ name: nameBatch[j], embedding: embeddings[j] });
    }

    if (upsertBuffer.length >= UPSERT_BATCH_SIZE) {
      await upsertBatch(upsertBuffer);
      inserted += upsertBuffer.length;
      upsertBuffer = [];
    }
  }

  if (upsertBuffer.length > 0) {
    await upsertBatch(upsertBuffer);
    inserted += upsertBuffer.length;
  }

  console.log(`\nDone. ${inserted} props upserted into Supabase.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
