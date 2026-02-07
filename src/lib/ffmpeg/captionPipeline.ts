import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import captionFontUrl from "@/assets/Roboto-Bold.ttf";

export type CaptionPosition = "top" | "center" | "bottom";

export interface CaptionSegment {
  text: string;
  start: number;
  end: number;
}

export interface CaptionRenderInput {
  duration: number;
  position: CaptionPosition;
  primaryColorHex: string;
  highlightColorHex?: string;
  hookText?: string | null;
  segments: CaptionSegment[];
}

export type CaptionStrategy = "A_drawtext" | "B_drawtext_safe" | "C_overlay_images" | "C_overlay_fallback" | "no_captions";

export interface CaptionRenderResult {
  usedStrategy: CaptionStrategy;
  hadAnyCaptions: boolean;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const stripInvalidChars = (s: string) => {
  return s
    .replace(/\uFEFF/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
};

export const normalizeCaptionSegments = (
  segments: CaptionSegment[],
  duration: number,
): CaptionSegment[] => {
  const safe: CaptionSegment[] = [];

  for (const seg of segments) {
    const rawText = stripInvalidChars(seg.text ?? "");
    if (!rawText) continue;

    const start = clamp(Number(seg.start) || 0, 0, duration);
    const end = clamp(Number(seg.end) || 0, 0, duration);

    const minLen = 0.08;
    if (end - start < minLen) continue;

    safe.push({ text: rawText, start, end });
  }

  safe.sort((a, b) => a.start - b.start);
  const fixed: CaptionSegment[] = [];
  for (const seg of safe) {
    const last = fixed[fixed.length - 1];
    if (!last) {
      fixed.push(seg);
      continue;
    }

    if (seg.start < last.end) {
      const start = last.end;
      if (seg.end - start >= 0.08) fixed.push({ ...seg, start });
      continue;
    }

    fixed.push(seg);
  }

  return fixed;
};

export const escapeDrawtextText = (text: string) => {
  return stripInvalidChars(text)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\n/g, "\\n")
    .trim();
};

const pickY = (pos: CaptionPosition) => {
  if (pos === "top") return "h*0.12";
  if (pos === "center") return "h*0.52";
  return "h*0.82";
};

const hexNoHash = (hex: string, fallback: string) => {
  const v = (hex || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.slice(1);
  return fallback;
};

/** Load font into FFmpeg FS. Returns true if successful. */
const ensureFontInFS = async (ffmpeg: FFmpeg): Promise<boolean> => {
  try {
    const data = await fetchFile(captionFontUrl);
    if (!data || data.byteLength === 0) {
      console.warn("[Captions] Font data is empty");
      return false;
    }
    await ffmpeg.writeFile("caption-font.ttf", data);
    // Verify the file was written by reading its size
    try {
      const check = await ffmpeg.readFile("caption-font.ttf");
      if (!check || (check as Uint8Array).byteLength === 0) {
        console.warn("[Captions] Font file verification failed");
        return false;
      }
    } catch {
      console.warn("[Captions] Font file read-back failed");
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[Captions] Failed to load font into FFmpeg FS:", e);
    return false;
  }
};

const buildDrawtextFilters = (input: CaptionRenderInput, mode: "normal" | "safe") => {
  const y = pickY(input.position);
  const fontSize = mode === "safe" ? 44 : 52;
  const borderW = mode === "safe" ? 2 : 3;
  const primary = hexNoHash(input.primaryColorHex, "FFFFFF");
  const hookColor = hexNoHash(input.highlightColorHex || input.primaryColorHex, "FFD700");

  const filters: string[] = [];

  if (input.hookText) {
    const t = escapeDrawtextText(input.hookText.toUpperCase());
    if (t) {
      filters.push(
        `drawtext=fontfile=caption-font.ttf:text='${t}':fontsize=60:fontcolor=0x${hookColor}:borderw=${borderW}:bordercolor=black:x=(w-text_w)/2:y=h*0.15:enable='between(t,0,1.2)'`,
      );
    }
  }

  for (const seg of input.segments) {
    let t = seg.text;
    if (mode === "safe") {
      t = t.replace(/[\[\]"<>]/g, "");
    }

    const escaped = escapeDrawtextText(t);
    if (!escaped) continue;
    filters.push(
      `drawtext=fontfile=caption-font.ttf:text='${escaped}':fontsize=${fontSize}:fontcolor=0x${primary}:borderw=${borderW}:bordercolor=black:x=(w-text_w)/2:y=${y}:enable='between(t,${seg.start.toFixed(
        2,
      )},${seg.end.toFixed(2)})'`,
    );
  }

  return filters.filter(Boolean).join(",");
};

const canvasToPngArrayBuffer = async (canvas: HTMLCanvasElement) => {
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
};

const renderOverlayPng = async (
  text: string,
  position: CaptionPosition,
  primaryColor: string,
  highlightColor?: string,
) => {
  const w = 1080;
  const h = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.clearRect(0, 0, w, h);

  const y = position === "top" ? 260 : position === "center" ? 1040 : 1650;
  const fontSize = 64;
  ctx.font = `900 ${fontSize}px system-ui, -apple-system, Segoe UI, Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.lineWidth = 12;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.fillStyle = primaryColor;
  const clean = stripInvalidChars(text);
  const lines = wrapText(ctx, clean, w - 140);

  let offsetY = y - (lines.length - 1) * (fontSize * 0.6);
  for (const line of lines) {
    ctx.strokeText(line, w / 2, offsetY);
    ctx.fillText(line, w / 2, offsetY);
    offsetY += fontSize * 1.2;
  }

  if (highlightColor) {
    ctx.fillStyle = highlightColor;
    ctx.globalAlpha = 0.22;
    ctx.fillRect(120, y + 90, w - 240, 22);
    ctx.globalAlpha = 1;
  }

  return canvasToPngArrayBuffer(canvas);
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
};

const tryExec = async (ffmpeg: FFmpeg, args: string[]) => {
  console.log("[Captions] FFmpeg args:", args);
  const exitCode = await ffmpeg.exec(args);
  return exitCode;
};

/**
 * Merge/group segments when there are too many for Strategy C (WASM memory limit).
 * Groups adjacent segments to reduce overlay count.
 */
const mergeSegmentsForOverlay = (segments: CaptionSegment[], maxCount: number): CaptionSegment[] => {
  if (segments.length <= maxCount) return segments;

  const merged: CaptionSegment[] = [];
  const groupSize = Math.ceil(segments.length / maxCount);

  for (let i = 0; i < segments.length; i += groupSize) {
    const group = segments.slice(i, i + groupSize);
    const text = group.map(s => s.text).join(" ");
    merged.push({
      text,
      start: group[0].start,
      end: group[group.length - 1].end,
    });
  }

  return merged;
};

export const renderCaptionsWithFallback = async (params: {
  ffmpeg: FFmpeg;
  inputFile: string;
  outputFile: string;
  startTime: number;
  duration: number;
  baseVideoFilter: string;
  audioMapArgs: string[];
  videoEncodeArgs: string[];
  captions: CaptionRenderInput;
  captionsRequired: boolean;
}): Promise<CaptionRenderResult> => {
  const { ffmpeg, inputFile, outputFile, startTime, duration } = params;
  const normalized = normalizeCaptionSegments(params.captions.segments, duration);
  const hadAnyCaptions = Boolean(params.captions.hookText) || normalized.length > 0;

  const hookText = stripInvalidChars(params.captions.hookText || "");
  const segments = normalized;

  if (params.captionsRequired && segments.length === 0 && !hookText) {
    console.warn("[Captions] Captions required but no ASR transcription available - encoding without captions");
  }

  const captionInput: CaptionRenderInput = {
    ...params.captions,
    hookText: hookText || null,
    segments: segments,
  };

  // Check font availability FIRST - determines if drawtext strategies are possible
  const fontLoaded = await ensureFontInFS(ffmpeg);

  const common = [
    "-ss",
    startTime.toFixed(2),
    "-i",
    inputFile,
    "-t",
    duration.toFixed(2),
    "-map_metadata",
    "-1",
  ];

  // Audio-safe args: use explicit mapping with optional audio stream
  // This prevents exitCode=1 when video has no audio track
  const audioSafeArgs = [
    "-map", "0:v",
    "-map", "0:a?",
    ...params.videoEncodeArgs,
    ...params.audioMapArgs,
    "-shortest",
  ];

  // Strategy A: drawtext, standard (only if font loaded)
  if (fontLoaded) {
    try {
      const draw = buildDrawtextFilters(captionInput, "normal");
      if (params.captionsRequired && !draw) throw new Error("No caption filters built");

      const vf = draw ? `${params.baseVideoFilter},${draw}` : params.baseVideoFilter;
      const args = [
        ...common,
        "-vf",
        vf,
        ...audioSafeArgs,
        "-y",
        outputFile,
      ];

      console.log("[Captions] Trying strategy A_drawtext");
      const exitCode = await tryExec(ffmpeg, args);
      if (exitCode === 0) return { usedStrategy: "A_drawtext", hadAnyCaptions };
      throw new Error(`exitCode=${exitCode}`);
    } catch (e) {
      console.warn("[Captions] Strategy A failed:", e);
    }

    // Strategy B: drawtext, extra-safe escaping and reduced charset
    try {
      const draw = buildDrawtextFilters(captionInput, "safe");
      if (params.captionsRequired && !draw) throw new Error("No caption filters built");
      const vf = draw ? `${params.baseVideoFilter},${draw}` : params.baseVideoFilter;

      const args = [
        ...common,
        "-vf",
        vf,
        ...audioSafeArgs,
        "-y",
        outputFile,
      ];

      console.log("[Captions] Trying strategy B_drawtext_safe");
      const exitCode = await tryExec(ffmpeg, args);
      if (exitCode === 0) return { usedStrategy: "B_drawtext_safe", hadAnyCaptions };
      throw new Error(`exitCode=${exitCode}`);
    } catch (e) {
      console.warn("[Captions] Strategy B failed:", e);
    }
  } else {
    console.warn("[Captions] Font not available, skipping drawtext strategies A/B → going directly to C");
  }

  // Strategy C: overlay images (no drawtext). This is the "never fail" path.
  try {
    const overlays: Array<{ file: string; start: number; end: number }> = [];

    const primary = params.captions.primaryColorHex || "#FFFFFF";
    const highlight = params.captions.highlightColorHex;

    // Hook overlay
    if (captionInput.hookText) {
      overlays.push({
        file: "ov_hook.png",
        start: 0,
        end: Math.min(1.2, duration),
      });
      const png = await renderOverlayPng(captionInput.hookText, "top", primary, highlight);
      await ffmpeg.writeFile("ov_hook.png", png);
    }

    // Limit segments to MAX_OVERLAYS to prevent WASM OOM
    const MAX_OVERLAYS = 15;
    const overlaySegments = mergeSegmentsForOverlay(captionInput.segments, MAX_OVERLAYS - (captionInput.hookText ? 1 : 0));

    // Segment overlays
    for (let i = 0; i < overlaySegments.length; i++) {
      const seg = overlaySegments[i];
      overlays.push({ file: `ov_${i}.png`, start: seg.start, end: seg.end });
      const png = await renderOverlayPng(seg.text, captionInput.position, primary, highlight);
      await ffmpeg.writeFile(`ov_${i}.png`, png);
    }

    if (overlays.length === 0) {
      // No overlays to render - encode without captions
      console.log("[Captions] No overlays to render, encoding without captions");
      const args = [
        ...common,
        "-vf",
        params.baseVideoFilter,
        ...audioSafeArgs,
        "-y",
        outputFile,
      ];
      const exitCode = await tryExec(ffmpeg, args);
      if (exitCode === 0) return { usedStrategy: "no_captions", hadAnyCaptions: false };
      throw new Error(`exitCode=${exitCode}`);
    }

    const inputs: string[] = [];
    for (const ov of overlays) {
      inputs.push("-i", ov.file);
    }

    const chains: string[] = [];
    chains.push(`[0:v]${params.baseVideoFilter}[v0]`);
    let last = "v0";
    overlays.forEach((ov, idx) => {
      const inLabel = `${idx + 1}:v`;
      const out = `v${idx + 1}`;
      chains.push(
        `[${last}][${inLabel}]overlay=0:0:format=auto:enable='between(t,${ov.start.toFixed(
          2,
        )},${ov.end.toFixed(2)})'[${out}]`,
      );
      last = out;
    });

    const filterComplex = chains.join(";");
    const args = [
      ...common,
      ...inputs,
      "-filter_complex",
      filterComplex,
      "-map",
      `[${last}]`,
      "-map",
      "0:a?",
      ...params.videoEncodeArgs,
      ...params.audioMapArgs,
      "-shortest",
      "-y",
      outputFile,
    ];

    console.log("[Captions] Trying strategy C_overlay_images", { overlays: overlays.length });
    const exitCode = await tryExec(ffmpeg, args);
    if (exitCode === 0) return { usedStrategy: "C_overlay_images", hadAnyCaptions };
    throw new Error(`exitCode=${exitCode}`);
  } catch (e) {
    console.warn("[Captions] Strategy C failed:", e);
  }

  // Last resort: encode without captions rather than crashing
  if (!params.captionsRequired) {
    try {
      console.warn("[Captions] All strategies failed, encoding without captions");
      const args = [
        ...common,
        "-vf",
        params.baseVideoFilter,
        ...audioSafeArgs,
        "-y",
        outputFile,
      ];
      const exitCode = await tryExec(ffmpeg, args);
      if (exitCode === 0) return { usedStrategy: "no_captions", hadAnyCaptions: false };
    } catch (e2) {
      console.warn("[Captions] Even no-caption encode failed:", e2);
    }
  }

  throw new Error("Caption rendering failed for all strategies");
};
