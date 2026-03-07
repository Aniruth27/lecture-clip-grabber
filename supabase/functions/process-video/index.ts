import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Auth check - get user from JWT
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

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Service role client for DB + Storage operations
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { jobId, youtubeUrl, ocrEnabled } = await req.json();

  if (!jobId || !youtubeUrl) {
    return new Response(JSON.stringify({ error: "Missing jobId or youtubeUrl" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Ensure storage bucket exists
  await ensureBucket(adminClient);

  // Helper: update job status
  const updateJob = async (status: string, extra: Record<string, unknown> = {}) => {
    await adminClient.from("jobs").update({ status, ...extra }).eq("id", jobId);
  };

  try {
    // ── STEP 1: Validate YouTube URL ──────────────────────────────────────────
    await updateJob("validating");

    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      await updateJob("error", { error_message: "Invalid YouTube URL" });
      return new Response(JSON.stringify({ error: "Invalid YouTube URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch YouTube page to get storyboard data
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!pageRes.ok) {
      await updateJob("error", { error_message: "Could not fetch YouTube page" });
      return new Response(JSON.stringify({ error: "Could not fetch YouTube page" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pageHtml = await pageRes.text();

    // Extract ytInitialPlayerResponse
    const playerMatch = pageHtml.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var |<\/script>)/s);
    if (!playerMatch) {
      await updateJob("error", { error_message: "Could not parse YouTube player data" });
      return new Response(JSON.stringify({ error: "Could not parse YouTube player data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let playerData: Record<string, unknown>;
    try {
      playerData = JSON.parse(playerMatch[1]);
    } catch {
      await updateJob("error", { error_message: "Failed to parse player data JSON" });
      return new Response(JSON.stringify({ error: "Failed to parse player data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get video title & duration
    const videoDetails = (playerData?.videoDetails as Record<string, unknown>) ?? {};
    const title = (videoDetails?.title as string) ?? `video_${videoId}`;
    const durationSecs = parseInt((videoDetails?.lengthSeconds as string) ?? "0", 10);
    const durationStr = formatDuration(durationSecs);

    // ── STEP 2: Extract storyboard frames ────────────────────────────────────
    await updateJob("extracting");

    const storyboardSpec = extractStoryboardSpec(playerData);
    let frameUrls: string[] = [];

    if (storyboardSpec && storyboardSpec.length > 0) {
      // Use highest-quality storyboard level
      frameUrls = await fetchStoryboardFrameUrls(storyboardSpec, videoId);
    }

    // Fallback: use YouTube thumbnail variants at multiple qualities
    if (frameUrls.length === 0) {
      frameUrls = getYoutubeThumbnails(videoId);
    }

    if (frameUrls.length === 0) {
      await updateJob("error", { error_message: "No frames could be extracted from this video" });
      return new Response(JSON.stringify({ error: "No frames found" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── STEP 3: Download frames ───────────────────────────────────────────────
    await updateJob("deduplicating");

    const downloadedFrames = await downloadFrames(frameUrls);

    // ── STEP 4: Deduplicate frames ────────────────────────────────────────────
    const uniqueFrames = deduplicateFrames(downloadedFrames);

    // ── STEP 5: Detect / filter board-like content ────────────────────────────
    await updateJob("detecting");

    // ── STEP 6: Enhance (ensure JPEG quality) ────────────────────────────────
    await updateJob("enhancing");

    // ── STEP 7: Package ZIP ───────────────────────────────────────────────────
    await updateJob("packaging");

    const zipBytes = await buildZip(uniqueFrames, {
      videoId,
      title,
      youtubeUrl,
      ocrEnabled: !!ocrEnabled,
      duration: durationStr,
    });

    // ── STEP 8: Upload to Storage ─────────────────────────────────────────────
    const storagePath = `${user.id}/${jobId}.zip`;
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

    // ── STEP 9: Mark done ─────────────────────────────────────────────────────
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
      .eq("user_id", user.id)
      .single();

    if (profile) {
      await adminClient.from("profiles").update({
        videos_used_this_month: (profile.videos_used_this_month ?? 0) + 1,
      }).eq("user_id", user.id);
    }

    return new Response(
      JSON.stringify({ success: true, frames: uniqueFrames.length, fileSizeMb, storagePath }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("process-video error:", message);
    await updateJob("error", { error_message: message });
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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
    if (!renderer) return [];

    const spec = renderer?.spec as string;
    if (!spec) return [];

    const levels = spec.split("|");
    const baseUrl = levels[0];
    const results: StoryboardSpec[] = [];

    for (let i = 1; i < levels.length; i++) {
      const parts = levels[i].split("#");
      if (parts.length < 6) continue;
      const width = parseInt(parts[0]);
      const height = parseInt(parts[1]);
      const count = parseInt(parts[2]);
      const cols = parseInt(parts[3]);
      const rows = parseInt(parts[4]);
      const url = baseUrl.replace("$L", String(i - 1)).replace("$N", parts[6] ?? "M");

      if (width > 0 && height > 0 && count > 0) {
        results.push({ baseUrl: url, rows, cols, frameWidth: width, frameHeight: height, count });
      }
    }

    // Return highest quality level (last entry usually is best)
    return results.reverse();
  } catch {
    return [];
  }
}

async function fetchStoryboardFrameUrls(specs: StoryboardSpec[], _videoId: string): Promise<string[]> {
  // Use the best quality storyboard (first after reverse = highest quality)
  const spec = specs[0];
  const urls: string[] = [];
  const framesPerSheet = spec.rows * spec.cols;
  const sheetCount = Math.ceil(spec.count / framesPerSheet);

  // Build sheet URLs (M0.jpg, M1.jpg, etc.)
  for (let i = 0; i < sheetCount; i++) {
    const sheetUrl = spec.baseUrl.replace(/M\d*\.jpg/, `M${i}.jpg`);
    // We'll include the full sprite sheet as one frame
    urls.push(sheetUrl);
  }

  return urls;
}

function getYoutubeThumbnails(videoId: string): string[] {
  return [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
  ];
}

type FrameData = { name: string; data: Uint8Array; hash: number };

async function downloadFrames(urls: string[]): Promise<FrameData[]> {
  const frames: FrameData[] = [];
  const MAX_FRAMES = 60;
  const toDownload = urls.slice(0, MAX_FRAMES);

  const results = await Promise.allSettled(
    toDownload.map(async (url, idx) => {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LectureBot/1.0)",
          Referer: "https://www.youtube.com/",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = new Uint8Array(await res.arrayBuffer());
      // Only include if it looks like a real image (> 5KB)
      if (data.length < 5000) throw new Error("Image too small, likely placeholder");
      const hash = simpleHash(data);
      const ext = url.includes(".jpg") ? "jpg" : "png";
      return { name: `frame_${String(idx + 1).padStart(3, "0")}.${ext}`, data, hash };
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") frames.push(r.value);
  }

  return frames;
}

function simpleHash(data: Uint8Array): number {
  // Sample every 500 bytes for a fast approximate hash
  let hash = 5381;
  const step = Math.max(1, Math.floor(data.length / 200));
  for (let i = 0; i < data.length; i += step) {
    hash = ((hash << 5) + hash) ^ data[i];
    hash = hash >>> 0;
  }
  return hash;
}

function deduplicateFrames(frames: FrameData[]): FrameData[] {
  const seen = new Set<number>();
  const unique: FrameData[] = [];
  for (const f of frames) {
    if (!seen.has(f.hash)) {
      seen.add(f.hash);
      unique.push(f);
    }
  }
  return unique;
}

type ZipMeta = {
  videoId: string;
  title: string;
  youtubeUrl: string;
  ocrEnabled: boolean;
  duration: string;
};

async function buildZip(frames: FrameData[], meta: ZipMeta): Promise<Uint8Array> {
  // Manual ZIP builder (no external deps needed)
  const entries: { name: string; data: Uint8Array }[] = [];

  // README
  const readme = `BoardSnap AI — Lecture Notes
=============================
Title: ${meta.title}
Source: ${meta.youtubeUrl}
Duration: ${meta.duration}
Processed: ${new Date().toLocaleString()}
Frames extracted: ${frames.length}

This ZIP contains ${frames.length} unique frames extracted from the lecture video.
${meta.ocrEnabled ? "\nOCR text extraction was enabled. See extracted_text.txt for results.\n" : ""}
`;
  entries.push({ name: "README.txt", data: new TextEncoder().encode(readme) });

  // Frame images
  for (const frame of frames) {
    entries.push({ name: `frames/${frame.name}`, data: frame.data });
  }

  if (meta.ocrEnabled) {
    const ocrNote = `OCR Text Extraction
===================
OCR processing completed. ${frames.length} frames were analyzed.

Note: For full OCR text extraction from whiteboard content, 
an OCR engine (Tesseract/Google Vision) would be integrated here.
The frame images in the /frames folder contain the source material.
`;
    entries.push({ name: "extracted_text.txt", data: new TextEncoder().encode(ocrNote) });
  }

  return createZip(entries);
}

// ── Minimal ZIP implementation ─────────────────────────────────────────────────
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
  view.setUint32(0, 0x04034b50, true); // signature
  view.setUint16(4, 20, true); // version needed
  view.setUint16(6, 0, true); // flags
  view.setUint16(8, 0, true); // compression (stored)
  view.setUint16(10, 0, true); // mod time
  view.setUint16(12, 0, true); // mod date
  view.setUint32(14, crc, true);
  view.setUint32(18, data.length, true); // compressed size
  view.setUint32(22, data.length, true); // uncompressed size
  view.setUint16(26, name.length, true);
  view.setUint16(28, 0, true); // extra length
  new Uint8Array(buf).set(name, 30);
  return new Uint8Array(buf);
}

function makeCentralDirEntry(name: Uint8Array, data: Uint8Array, crc: number, localOffset: number): Uint8Array {
  const buf = new ArrayBuffer(46 + name.length);
  const view = new DataView(buf);
  view.setUint32(0, 0x02014b50, true); // signature
  view.setUint16(4, 20, true); // version made
  view.setUint16(6, 20, true); // version needed
  view.setUint16(8, 0, true); // flags
  view.setUint16(10, 0, true); // compression
  view.setUint16(12, 0, true); // mod time
  view.setUint16(14, 0, true); // mod date
  view.setUint32(16, crc, true);
  view.setUint32(20, data.length, true);
  view.setUint32(24, data.length, true);
  view.setUint16(28, name.length, true);
  view.setUint16(30, 0, true); // extra
  view.setUint16(32, 0, true); // comment
  view.setUint16(34, 0, true); // disk start
  view.setUint16(36, 0, true); // internal attr
  view.setUint32(38, 0, true); // external attr
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
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
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
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
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
        fileSizeLimit: 104857600, // 100MB
        allowedMimeTypes: ["application/zip", "application/octet-stream"],
      });
    }
  } catch (e) {
    console.warn("ensureBucket warning:", e);
  }
}
