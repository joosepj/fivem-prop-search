const crypto = require('crypto');
const https  = require('https');

// ── R2 config ──────────────────────────────────────────────────────────────────
const R2_HOST    = '42b973c5c3a7e6cfb7030591ed45a6ff.r2.cloudflarestorage.com';
const BUCKET     = 'gta-prop-images';
const ACCESS_KEY = 'ea5b8543f2b91f1cf5b1a4375e81fab5';
const SECRET_KEY = 'b1a9904e10c333fedcfb02290b1b82bd9cfdcddd528b1b3bda71c5e0740640e7';
const REGION     = 'auto';
const RESOURCE   = GetCurrentResourceName();

// ── Load props ─────────────────────────────────────────────────────────────────
const propsRaw = LoadResourceFile(RESOURCE, 'props.txt') || '';
const allProps = propsRaw.split('\n').map(s => s.trim()).filter(Boolean);
console.log(`[Screenshotter] ${allProps.length} props loaded.`);

// ── Progress ───────────────────────────────────────────────────────────────────
let completed    = new Set();
let currentIndex = 0;

(function loadProgress() {
    const raw = LoadResourceFile(RESOURCE, 'progress.json');
    if (!raw) return;
    try {
        const p      = JSON.parse(raw);
        completed    = new Set(p.completed || []);
        currentIndex = p.currentIndex || 0;
        console.log(`[Screenshotter] Resume: ${completed.size} done, index ${currentIndex}.`);
    } catch {
        console.error('[Screenshotter] Corrupt progress.json, starting fresh.');
    }
})();

function saveProgress() {
    SaveResourceFile(RESOURCE, 'progress.json',
        JSON.stringify({ completed: [...completed], currentIndex }), -1);
}

// ── AWS4 signing ───────────────────────────────────────────────────────────────
function sha256Hex(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
    return crypto.createHmac('sha256', key).update(data).digest();
}

async function uploadToR2(objectKey, buf) {
    const now       = new Date();
    // Format: 20240101T120000Z
    const amzDate   = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const dateStamp = amzDate.slice(0, 8);
    const hash      = sha256Hex(buf);
    const ct        = 'image/png';
    const uri       = `/${BUCKET}/${objectKey}`;

    const canonHeaders =
        `content-type:${ct}\n` +
        `host:${R2_HOST}\n` +
        `x-amz-content-sha256:${hash}\n` +
        `x-amz-date:${amzDate}\n`;
    const signedHdrs = 'content-type;host;x-amz-content-sha256;x-amz-date';

    const canonReq = `PUT\n${uri}\n\n${canonHeaders}\n${signedHdrs}\n${hash}`;
    const scope    = `${dateStamp}/${REGION}/s3/aws4_request`;
    const sts      = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(canonReq)}`;

    const kDate    = hmac(`AWS4${SECRET_KEY}`, dateStamp);
    const kRegion  = hmac(kDate,    REGION);
    const kService = hmac(kRegion,  's3');
    const kSign    = hmac(kService, 'aws4_request');
    const sig      = hmac(kSign, sts).toString('hex');

    const auth = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${scope}, SignedHeaders=${signedHdrs}, Signature=${sig}`;

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: R2_HOST,
            path    : uri,
            method  : 'PUT',
            headers : {
                'Content-Type'         : ct,
                'Content-Length'       : buf.length,
                'x-amz-content-sha256' : hash,
                'x-amz-date'           : amzDate,
                'Authorization'        : auth,
                'Host'                 : R2_HOST,
            },
        }, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve();
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
                }
            });
        });

        req.on('error', reject);
        req.write(buf);
        req.end();
    });
}

// ── Image upload via latent event ──────────────────────────────────────────────
// TriggerLatentServerEvent on the client streams the full base64 payload;
// FiveM reassembles it and fires this handler once with the complete string.
RegisterNetEvent('prop-screenshotter:img');
AddEventHandler('prop-screenshotter:img', function(propName, shotType, b64) {
    if (source !== activePlayer) return;

    const imageData = Buffer.from(b64, 'base64');
    const fileName  = `${propName}_${shotType}.png`;

    uploadToR2(fileName, imageData)
        .then(() => {
            console.log(`[Screenshotter] Uploaded ${fileName} (${imageData.length}b)`);
            TriggerClientEvent('prop-screenshotter:imgDone', activePlayer, propName, shotType);
        })
        .catch(err => {
            console.error(`[Screenshotter] R2 error ${fileName}: ${err.message}`);
            TriggerClientEvent('prop-screenshotter:imgDone', activePlayer, propName, shotType);
        });
});

// ── Process control ────────────────────────────────────────────────────────────
let activePlayer = -1;
let processing   = false;

function nextProp() {
    // Advance past already-completed props
    while (currentIndex < allProps.length && completed.has(allProps[currentIndex])) {
        currentIndex++;
    }
    return currentIndex < allProps.length
        ? { name: allProps[currentIndex], idx: currentIndex }
        : null;
}

function advance() {
    processing = false;
    const next = nextProp();

    if (!next) {
        console.log(`[Screenshotter] All done! ${completed.size}/${allProps.length} props uploaded.`);
        return;
    }

    processing = true;

    console.log(`[Screenshotter] [${next.idx + 1}/${allProps.length}] ${next.name}`);
    TriggerClientEvent('prop-screenshotter:start', activePlayer, next.name);
}

// /startscreens — run in-game to begin
RegisterCommand('startscreens', (src) => {
    if (src === 0) { console.log('[Screenshotter] Run this command in-game.'); return; }
    activePlayer = src;
    console.log(`[Screenshotter] Started by player ${src}. ${allProps.length} total props.`);
    advance();
}, false);

// /stopscreens — pause the run
RegisterCommand('stopscreens', (src) => {
    if (src !== 0 && src !== activePlayer) return;
    activePlayer = -1;
    processing   = false;
    saveProgress();
    console.log('[Screenshotter] Stopped. Progress saved.');
}, false);

RegisterNetEvent('prop-screenshotter:done');
AddEventHandler('prop-screenshotter:done', function(propName, ok, reason) {
    // source is the FiveM global set to the triggering player ID
    if (source !== activePlayer) return;

    if (ok) {
        completed.add(propName);
    } else {
        console.warn(`[Screenshotter] Skipped "${propName}": ${reason}`);
    }

    currentIndex++;

    if (completed.size > 0 && completed.size % 100 === 0) {
        console.log(`[Screenshotter] ── Progress: ${completed.size}/${allProps.length} completed ──`);
    }

    saveProgress();
    setTimeout(advance, 600);
});
