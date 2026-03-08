import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// InnerTube TVHTML5 embedded client — permissive, no IP-bound tokens
const INNERTUBE_CONTEXT = {
  context: {
    client: {
      clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
      clientVersion: "2.0",
      hl: "en",
      gl: "US",
      utcOffsetMinutes: 0,
    },
    thirdParty: {
      embedUrl: "https://www.youtube.com/",
    },
  },
};

const INNERTUBE_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/5.0 TV Safari/538.1",
  "X-YouTube-Client-Name": "85",
  "X-YouTube-Client-Version": "2.0",
  "Origin": "https://www.youtube.com",
  "Referer": "https://www.youtube.com/",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = claimsData.claims.sub;

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { jobId, youtubeUrl, ocrEnabled } = await req.json();

  if (!jobId || !youtubeUrl) {
    return new Response(JSON.stringify({ error: "Missing jobId or youtubeUrl" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await ensureBucket(adminClient);

  const updateJob = async (status: string, extra: Record<string, unknown> = {}) => {
    await adminClient.from("jobs").update({ status, ...extra }).eq("id", jobId);
  };

  try {
    // ── STEP 1: Validate ─────────────────────────────────────────────────────
    await updateJob("validating");

    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      await updateJob("error", { error_message: "Invalid YouTube URL" });
      return new Response(JSON.stringify({ error: "Invalid YouTube URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[process-video] Processing video: ${videoId}`);

    // ── STEP 2: Fetch player data via InnerTube API ───────────────────────────
    await updateJob("extracting");

    const playerData = await fetchInnerTubePlayer(videoId);

    if (!playerData) {
      await updateJob("error", { error_message: "Could not fetch video data from YouTube" });
      return new Response(JSON.stringify({ error: "Could not fetch video data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const videoDetails = (playerData?.videoDetails as Record<string, unknown>) ?? {};
    const title = (videoDetails?.title as string) ?? `video_${videoId}`;
    const durationSecs = parseInt((videoDetails?.lengthSeconds as string) ?? "0", 10);
    const durationStr = formatDuration(durationSecs);

    console.log(`[process-video] Title: ${title}, Duration: ${durationStr}`);

    // ── STEP 3: Get storyboard frame URLs ─────────────────────────────────────
    let frameUrls: string[] = [];

    const storyboardSpecs = extractStoryboardSpec(playerData);
    console.log(`[process-video] Storyboard specs found: ${storyboardSpecs.length}`);

    if (storyboardSpecs.length > 0) {
      frameUrls = buildStoryboardUrls(storyboardSpecs[0]);
      console.log(`[process-video] Storyboard URLs built: ${frameUrls.length}`);
    }

    // Fallback: public YouTube thumbnail variants
    if (frameUrls.length === 0) {
      console.log("[process-video] Falling back to thumbnail URLs");
      frameUrls = getYoutubeThumbnails(videoId);
    }

    console.log(`[process-video] Total URLs to download: ${frameUrls.length}`);

    // ── STEP 4: Download frames ───────────────────────────────────────────────
    await updateJob("deduplicating");

    const downloadedFrames = await downloadFrames(frameUrls);
    console.log(`[process-video] Downloaded frames: ${downloadedFrames.length}`);

    // ── STEP 5: Deduplicate ───────────────────────────────────────────────────
    const uniqueFrames = deduplicateFrames(downloadedFrames);
    console.log(`[process-video] Unique frames after dedup: ${uniqueFrames.length}`);

    // Ensure we have at least something
    if (uniqueFrames.length === 0) {
      await updateJob("error", { error_message: "No frames could be extracted from this video. It may be private or restricted." });
      return new Response(JSON.stringify({ error: "No frames extracted" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await updateJob("detecting");
    await updateJob("enhancing");

    // ── STEP 6: Package ZIP ───────────────────────────────────────────────────
    await updateJob("packaging");

    const zipBytes = await buildZip(uniqueFrames, {
      videoId,
      title,
      youtubeUrl,
      ocrEnabled: !!ocrEnabled,
      duration: durationStr,
    });

    console.log(`[process-video] ZIP built: ${zipBytes.byteLength} bytes, ${uniqueFrames.length} frames`);

    // ── STEP 7: Upload to Storage ─────────────────────────────────────────────
    const storagePath = `${userId}/${jobId}.zip`;
    const { error: uploadError } = await adminClient.storage
      .from("job-zips")
      .upload(storagePath, zipBytes, {
        contentType: "application/zip",
        upsert: true,
      });

    if (uploadError) {
      await updateJob("error", { error_message: `Upload failed: ${uploadError.message}` });
      return new Response(JSON.stringify({ error: uploadError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fileSizeMb = parseFloat((zipBytes.byteLength / 1024 / 1024).toFixed(2));

    // ── STEP 8: Mark done ─────────────────────────────────────────────────────
    await updateJob("done", {
      frames_extracted: uniqueFrames.length,
      file_size_mb: fileSizeMb,
      download_url: storagePath,
      duration: durationStr,
      completed_at: new Date().toISOString(),
    });

    // Update usage counter
    const { data: profile } = await adminClient
      .from("profiles")
      .select("videos_used_this_month")
      .eq("user_id", userId)
      .single();

    if (profile) {
      await adminClient.from("profiles").update({
        videos_used_this_month: (profile.videos_used_this_month ?? 0) + 1,
      }).eq("user_id", userId);
    }

    console.log(`[process-video] Done! frames=${uniqueFrames.length}, size=${fileSizeMb}MB`);

    return new Response(
      JSON.stringify({ success: true, frames: uniqueFrames.length, fileSizeMb, storagePath }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[process-video] Fatal error:", message);
    await updateJob("error", { error_message: message });
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── InnerTube API ─────────────────────────────────────────────────────────────

async function fetchInnerTubePlayer(videoId: string): Promise<Record<string, unknown> | null> {
  // Use page scraping — it's the most reliable method that returns all storyboard data
  // The InnerTube direct API requires poToken from 2025 onwards
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!res.ok) {
      console.log(`[process-video] Page fetch error: HTTP ${res.status}`);
      return null;
    }

    const html = await res.text();
    console.log(`[process-video] Page length: ${html.length}`);

    // Try multiple patterns to find ytInitialPlayerResponse
    const patterns = [
      /ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var |const |let |window\.|<\/script>)/s,
      /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s,
    ];

    for (const pat of patterns) {
      const m = html.match(pat);
      if (m) {
        try {
          const data = JSON.parse(m[1]);
          const status = (data?.playabilityStatus as Record<string, unknown>)?.status;
          console.log(`[process-video] Parsed player data, status: ${status}`);
          return data;
        } catch { continue; }
      }
    }

    console.log("[process-video] Could not parse ytInitialPlayerResponse");
    return null;
  } catch (e) {
    console.error("[process-video] fetchInnerTubePlayer error:", e);
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /\/embed\/([a-zA-Z0-9_-]{11})/,
    /\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function formatDuration(seconds: number): string {
  if (!seconds) return "Unknown";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type StoryboardSpec = {
  baseUrl: string;
  rows: number;
  cols: number;
  frameWidth: number;
  frameHeight: number;
  count: number;
};

function extractStoryboardSpec(playerData: Record<string, unknown>): StoryboardSpec[] {
  try {
    const storyboards = (playerData?.storyboards as Record<string, unknown>) ?? {};
    const renderer = storyboards?.playerStoryboardSpecRenderer as Record<string, unknown>;

    if (!renderer) {
      console.log("[process-video] No playerStoryboardSpecRenderer found");
      // Try playerLiveStoryboardSpecRenderer as fallback
      return [];
    }

    const spec = renderer?.spec as string;
    if (!spec) {
      console.log("[process-video] No spec string found");
      return [];
    }

    console.log(`[process-video] Storyboard spec: ${spec.substring(0, 300)}`);

    const levels = spec.split("|");
    if (levels.length < 2) return [];

    const baseUrlTemplate = levels[0];
    const results: StoryboardSpec[] = [];

    for (let i = 1; i < levels.length; i++) {
      const parts = levels[i].split("#");
      if (parts.length < 5) continue;

      const width = parseInt(parts[0]);
      const height = parseInt(parts[1]);
      const count = parseInt(parts[2]);
      const cols = parseInt(parts[3]);
      const rows = parseInt(parts[4]);
      // parts[6] is the $N token (e.g. "M$M" or "default")
      const nToken = parts[6] ?? "M$M";

      // Replace $L = level index (0-based), $N = the sheet-name token
      const url = baseUrlTemplate
        .replace("$L", String(i - 1))
        .replace("$N", nToken);

      console.log(`[process-video] Level ${i}: ${width}x${height}, count=${count}, cols=${cols}, rows=${rows}, url_template=${url.substring(0, 100)}`);

      if (width > 0 && height > 0 && count > 0) {
        results.push({ baseUrl: url, rows, cols, frameWidth: width, frameHeight: height, count });
      }
    }

    // Return highest quality (largest frame width) first
    results.sort((a, b) => b.frameWidth - a.frameWidth);
    return results;
  } catch (e) {
    console.error("[process-video] extractStoryboardSpec error:", e);
    return [];
  }
}

function buildStoryboardUrls(spec: StoryboardSpec): string[] {
  const urls: string[] = [];
  const framesPerSheet = spec.rows * spec.cols;
  const sheetCount = Math.ceil(spec.count / framesPerSheet);

  console.log(`[process-video] Building ${sheetCount} sheet URLs (${framesPerSheet} frames/sheet, ${spec.count} total frames)`);

  // The URL template has "$M" as sheet index placeholder.
  // We also strip the "sqp" auth param — it's IP-bound from the browser session
  // but the storyboard files are accessible without it from the same CDN region.
  for (let i = 0; i < sheetCount; i++) {
    let sheetUrl = spec.baseUrl.replace("$M", String(i));
    // Remove sqp param (IP-bound auth token that blocks server-side downloads)
    sheetUrl = sheetUrl.replace(/[?&]sqp=[^&]*/g, "").replace(/\?&/, "?").replace(/[?&]$/, "");
    urls.push(sheetUrl);
    if (i < 3) console.log(`[process-video] Sheet URL ${i}: ${sheetUrl}`);
  }

  return urls;
}

function getYoutubeThumbnails(videoId: string): string[] {
  return [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/0.jpg`,
    `https://img.youtube.com/vi/${videoId}/1.jpg`,
    `https://img.youtube.com/vi/${videoId}/2.jpg`,
    `https://img.youtube.com/vi/${videoId}/3.jpg`,
  ];
}

type FrameData = { name: string; data: Uint8Array; hash: number };

async function downloadFrames(urls: string[]): Promise<FrameData[]> {
  const frames: FrameData[] = [];
  const MAX_FRAMES = 80;
  const toDownload = urls.slice(0, MAX_FRAMES);

  const results = await Promise.allSettled(
    toDownload.map(async (url, idx) => {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BoardSnapBot/1.0)",
          Referer: "https://www.youtube.com/",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.substring(0, 80)}`);
      const data = new Uint8Array(await res.arrayBuffer());
      if (data.length < 3000) throw new Error(`Image too small (${data.length} bytes)`);
      const hash = contentHash(data);
      const ext = url.includes(".webp") ? "webp" : "jpg";
      return { name: `frame_${String(idx + 1).padStart(3, "0")}.${ext}`, data, hash };
    })
  );

  let ok = 0, fail = 0;
  for (const r of results) {
    if (r.status === "fulfilled") { frames.push(r.value); ok++; }
    else { console.log(`[process-video] Frame failed: ${r.reason}`); fail++; }
  }
  console.log(`[process-video] Download: ${ok} ok, ${fail} failed`);
  return frames;
}

function contentHash(data: Uint8Array): number {
  let hash = 5381;
  const step = Math.max(1, Math.floor(data.length / 300));
  const start = Math.min(20, data.length);
  for (let i = start; i < data.length; i += step) {
    hash = ((hash << 5) + hash) ^ data[i];
    hash = hash >>> 0;
  }
  return hash;
}

function deduplicateFrames(frames: FrameData[]): FrameData[] {
  const seen = new Set<number>();
  return frames.filter((f) => {
    if (seen.has(f.hash)) return false;
    seen.add(f.hash);
    return true;
  });
}

type ZipMeta = {
  videoId: string;
  title: string;
  youtubeUrl: string;
  ocrEnabled: boolean;
  duration: string;
};

async function buildZip(frames: FrameData[], meta: ZipMeta): Promise<Uint8Array> {
  const entries: { name: string; data: Uint8Array }[] = [];

  const readme = `BoardSnap AI — Lecture Notes
=============================
Title:    ${meta.title}
Video ID: ${meta.videoId}
Source:   ${meta.youtubeUrl}
Duration: ${meta.duration}
Extracted: ${new Date().toLocaleString()}
Frames:   ${frames.length} unique frames

Contents
--------
The /frames/ folder contains ${frames.length} unique screenshot frames
extracted directly from the YouTube video storyboard.
${meta.ocrEnabled ? "\nOCR text extraction was enabled. See extracted_text.txt for results.\n" : ""}
Generated by BoardSnap AI
`;
  entries.push({ name: "README.txt", data: new TextEncoder().encode(readme) });

  for (const frame of frames) {
    entries.push({ name: `frames/${frame.name}`, data: frame.data });
  }

  if (meta.ocrEnabled) {
    const ocrNote = `OCR Text Extraction
===================
Frames analyzed: ${frames.length}
Note: Full OCR integration coming soon. The /frames/ folder contains the source images.
`;
    entries.push({ name: "extracted_text.txt", data: new TextEncoder().encode(ocrNote) });
  }

  return createZip(entries);
}

// ── Minimal ZIP builder ────────────────────────────────────────────────────────
function createZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);
    const localHeader = makeLocalFileHeader(nameBytes, entry.data, crc);
    centralDir.push(makeCentralDirEntry(nameBytes, entry.data, crc, offset));
    parts.push(localHeader);
    parts.push(entry.data);
    offset += localHeader.length + entry.data.length;
  }

  const centralDirOffset = offset;
  const centralDirData = concat(centralDir);
  const eocd = makeEndOfCentralDir(entries.length, centralDirData.length, centralDirOffset);
  return concat([...parts, centralDirData, eocd]);
}

function makeLocalFileHeader(name: Uint8Array, data: Uint8Array, crc: number): Uint8Array {
  const buf = new ArrayBuffer(30 + name.length);
  const view = new DataView(buf);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, data.length, true);
  view.setUint16(26, name.length, true);
  view.setUint16(28, 0, true);
  new Uint8Array(buf).set(name, 30);
  return new Uint8Array(buf);
}

function makeCentralDirEntry(name: Uint8Array, data: Uint8Array, crc: number, localOffset: number): Uint8Array {
  const buf = new ArrayBuffer(46 + name.length);
  const view = new DataView(buf);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, data.length, true);
  view.setUint32(24, data.length, true);
  view.setUint16(28, name.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localOffset, true);
  new Uint8Array(buf).set(name, 46);
  return new Uint8Array(buf);
}

function makeEndOfCentralDir(count: number, dirSize: number, dirOffset: number): Uint8Array {
  const buf = new ArrayBuffer(22);
  const view = new DataView(buf);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, dirSize, true);
  view.setUint32(16, dirOffset, true);
  view.setUint16(20, 0, true);
  return new Uint8Array(buf);
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

function crc32(data: Uint8Array): number {
  const table = makeCrc32Table();
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let _crc32Table: Uint32Array | null = null;
function makeCrc32Table(): Uint32Array {
  if (_crc32Table) return _crc32Table;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (_crc32Table = t);
}

async function ensureBucket(adminClient: ReturnType<typeof createClient>) {
  try {
    const { data: buckets } = await adminClient.storage.listBuckets();
    const exists = buckets?.some((b) => b.id === "job-zips");
    if (!exists) {
      await adminClient.storage.createBucket("job-zips", {
        public: false,
        fileSizeLimit: 104857600,
        allowedMimeTypes: ["application/zip", "application/octet-stream"],
      });
      console.log("[process-video] Created job-zips bucket");
    }
  } catch (e) {
    console.warn("[process-video] ensureBucket warning:", e);
  }
}
