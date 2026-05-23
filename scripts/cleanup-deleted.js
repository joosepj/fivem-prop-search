import "dotenv/config";
import crypto from "crypto";
import https from "https";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

// Resolves "deleted" on 2xx, "skipped" on 404, rejects on other errors.
function deleteFromR2(objectKey) {
  return new Promise((resolve, reject) => {
    const now        = new Date();
    const amzDate    = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const dateStamp  = amzDate.slice(0, 8);
    const emptyHash  = sha256Hex("");
    const uri        = `/${R2_BUCKET}/${objectKey}`;

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
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode === 404)  resolve("skipped");
        else if (res.statusCode < 300) resolve("deleted");
        else reject(new Error(`HTTP ${res.statusCode} — ${body.slice(0, 400)}`));
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  const { data: props, error } = await supabase
    .from("props")
    .select("name")
    .eq("review_status", "deleted");

  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  console.log(`Found ${props.length} props marked deleted.\n`);

  let deleted = 0;
  let alreadyMissing = 0;
  let errors = 0;

  for (const { name } of props) {
    for (const suffix of ["_overview.png", "_player.png"]) {
      const key = `${name}${suffix}`;
      try {
        const result = await deleteFromR2(key);
        if (result === "skipped") {
          console.log(`[skip]    ${key} - already gone (404)`);
          alreadyMissing++;
        } else {
          console.log(`[deleted] ${key}`);
          deleted++;
        }
      } catch (err) {
        console.error(`[error]   ${key}: ${err.message}`);
        errors++;
      }
    }
  }

  console.log(`\nSummary`);
  console.log(`  Deleted:         ${deleted}`);
  console.log(`  Already missing: ${alreadyMissing}`);
  if (errors > 0) console.log(`  Errors:          ${errors}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
