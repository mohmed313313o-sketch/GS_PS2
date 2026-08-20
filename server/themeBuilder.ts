/**
 * منطق بناء حزمة ثيم GameStation المخصصة:
 * 1. تحويل صورة المستخدم إلى background.jpg بمقاس 640x336 (JPEG)
 * 2. تحويل الصوت (أي صيغة) إلى bgm.ogg (Vorbis، ستيريو، 48kHz) عبر ffmpeg ووضعه داخل sound/
 * 3. توليد ZIP بكامل ملفات الثيم الأصلي مع استبدال background.jpg و sound/bgm.ogg فقط
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import JSZip from "jszip";

const execFileAsync = promisify(execFile);

/** عرض وطول الخلفية المطلوبة بالثيم الأصلي */
export const THEME_BG_WIDTH = 640;
export const THEME_BG_HEIGHT = 336;
export const THEME_FOLDER_NAME = "GameStation_thm_ps2";

/** مسارات أصول الثيم المرجعية */
const BASE_THEME_ZIP_PATH = "/home/ubuntu/webdev-static-assets/GameStation_thm_ps2_base.zip";

/** شعار GameStation للعلامة المائية: يسار الأسفل (GS أبيض) ويمين الأسفل (شعار GameStation الأصلي) */
const GS_WATERMARK_LOGO_PATH = "/home/ubuntu/webdev-static-assets/gs-watermark-white.png";
const GSTATION_WATERMARK_LOGO_PATH = "/home/ubuntu/webdev-static-assets/gs-logo.png";

/** نسبة عرض العلامة المائية من عرض الخلفية النهائية (صغيرة كما طلب المستخدم ~10%) */
const WATERMARK_WIDTH_RATIO = 0.10;

/** حد أقصى لارتفاع الخلفية ليُستخدم للشعار الأصلي عالي الدقة قبل التصغير */
const LOGO_SCALE_UP_LIMIT = 1600;

/** قصّ منطقة اللوجو غير الشفافة من PNG الأصلي (يمتد 1920x1920 بكامل مساحة PNG) */
function trimLogoBoundingBox(alpha: Buffer, w: number, h: number): { x: number; y: number; bw: number; bh: number } {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[(y * w + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return { x: 0, y: 0, bw: w, bh: h };
  return { x: minX, y: minY, bw: maxX - minX + 1, bh: maxY - minY + 1 };
}

const watermarkReady = new Set<string>();

/** جهّز نسخة PNG عالية الدقة من الشعار للاستخدام كعلامة مائية (تدعم عدة شعارات) */
async function prepareWatermarkLogo(logoPath: string = GS_WATERMARK_LOGO_PATH, outName: string = "gs-watermark-hd"): Promise<string> {
  if (watermarkReady.has(logoPath)) return `/tmp/${outName}.png`;
  const fs = await import("node:fs/promises");
  const sharp = await import("sharp");
  const src = await sharp.default(logoPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // قصّ المنطقة غير الشفافة ثم رفع الدقة للحفظ عند التصغير
  const box = trimLogoBoundingBox(src.data as unknown as Buffer, src.info.width, src.info.height);
  const scale = LOGO_SCALE_UP_LIMIT / Math.max(box.bw, box.bh);
  const out = await sharp.default(src.data as unknown as Buffer, {
    raw: { width: src.info.width, height: src.info.height, channels: 4 },
  })
    .extract({ left: box.x, top: box.y, width: box.bw, height: box.bh })
    .resize({ width: Math.round(box.bw * scale), height: Math.round(box.bh * scale), fit: "inside" })
    .png()
    .toBuffer();
  const tmp = `/tmp/${outName}.png`;
  await fs.writeFile(tmp, out);
  watermarkReady.add(logoPath);
  return tmp;
}

/** لا يوجد حد أقصى لحجم الملفات المرفوعة */
export const MAX_FILE_SIZE = Infinity;

export interface BuildResult {
  zipBytes: Buffer;
  previewJpgBytes: Buffer;
}

/** تحويل صورة المستخدم إلى background.jpg بمقاس 640x336 تغطي كامل المساحة */
export async function convertImageToBackground(imageBytes: Buffer): Promise<{ jpgBytes: Buffer; width: number; height: number }> {
  // لا حد لحجم الصورة — أي حجم مسموح
  // نكتب الصورة مؤقتاً ونستدعي ffmpeg لتوحيد السلوك مع سيرفر الإنتاج
  const tmpIn = `/tmp/theme-img-${Date.now()}-${createHash("md5").update(imageBytes).digest("hex").slice(0, 8)}`;
  const tmpOut = `${tmpIn}.jpg`;
  await import("node:fs").then(fs => fs.writeFileSync(tmpIn, imageBytes));
  try {
    const logoLeft = await prepareWatermarkLogo(GS_WATERMARK_LOGO_PATH, "wm-gs-left");
    const logoRight = await prepareWatermarkLogo(GSTATION_WATERMARK_LOGO_PATH, "wm-gstation-right");
    // علامتان مائيتان صغيرتان (~10% من عرض الخلفية): GS يسار الأسفل وGameStation يمين الأسفل
    const wmW = Math.round(THEME_BG_WIDTH * WATERMARK_WIDTH_RATIO);
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", tmpIn,
      "-i", logoLeft,
      "-i", logoRight,
      "-filter_complex",
      `[0:v]scale=${THEME_BG_WIDTH}:${THEME_BG_HEIGHT}:force_original_aspect_ratio=increase,crop=${THEME_BG_WIDTH}:${THEME_BG_HEIGHT}[bg];[1:v]scale=${wmW}:-1[wm1];[2:v]scale=${wmW}:-1[wm2];[bg][wm1]overlay=14:${THEME_BG_HEIGHT}-14-h[v1];[v1][wm2]overlay=${THEME_BG_WIDTH}-14-w:${THEME_BG_HEIGHT}-14-h[out]`,
      "-map", "[out]",
      "-q:v", "2",
      "-pix_fmt", "yuvj420p",
      tmpOut,
    ]);
    const jpgBytes = await import("node:fs").then(fs => fs.readFileSync(tmpOut));
    return { jpgBytes, width: THEME_BG_WIDTH, height: THEME_BG_HEIGHT };
  } finally {
    await import("node:fs/promises")
      .then(fs => Promise.allSettled([fs.unlink(tmpIn), fs.unlink(tmpOut)]));
  }
}

/** تحويل الصوت (أي صيغة مدعومة) إلى Vorbis ستيريو 48kHz */
export async function convertAudioToOgg(audioBytes: Buffer, sourceName: string): Promise<{ oggBytes: Buffer }> {
  // لا حد لحجم الصوت — أي حجم مسموح
  const safeName = sourceName.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80);
  const tmpIn = `/tmp/theme-audio-${Date.now()}-${createHash("md5").update(audioBytes).digest("hex").slice(0, 8)}-${safeName || "in"}`;
  const tmpOut = `${tmpIn}.ogg`;
  await import("node:fs").then(fs => fs.writeFileSync(tmpIn, audioBytes));
  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", tmpIn,
      "-ac", "2",
      "-ar", "48000",
      "-c:a", "libvorbis",
      "-b:a", "160k",
      tmpOut,
    ]);
    const oggBytes = await import("node:fs").then(fs => fs.readFileSync(tmpOut));
    return { oggBytes };
  } finally {
    await import("node:fs/promises")
      .then(fs => Promise.allSettled([fs.unlink(tmpIn), fs.unlink(tmpOut)]));
  }
}

/** توليد حزمة ZIP بكامل ملفات الثيم الأصلي مع استبدال الخلفية فقط (يبقى bgm.ogg الأصلي) */
export async function buildThemeZipImageOnly(jpgBytes: Buffer): Promise<BuildResult> {
  const baseZip = await import("node:fs").then(fs => fs.readFileSync(BASE_THEME_ZIP_PATH));
  const baseZipObj = new JSZip();
  await baseZipObj.loadAsync(baseZip);

  const zip = new JSZip();

  for (const [relPath, file] of Object.entries(baseZipObj.files) as [string, JSZip.JSZipObject][]) {
    if (file.dir) {
      zip.folder(relPath);
      continue;
    }
    if (relPath === "background.jpg") {
      zip.file(relPath, jpgBytes);
    } else if (relPath === "sound/bgm.ogg") {
      // المستخدم لم يرفع صوتاً: نحذف ملف الصوت الأصلي من الحزمة
      continue;
    } else {
      const content = await file.async("nodebuffer");
      zip.file(relPath, content);
    }
  }

  const zipBytes = await zip.generateAsync({
    type: "nodebuffer",
    compression: "STORE",
  });

  return { zipBytes, previewJpgBytes: jpgBytes };
}

/** توليد حزمة ZIP بكامل ملفات الثيم الأصلي مع استبدال الخلفية والصوت فقط */
export async function buildThemeZip(jpgBytes: Buffer, oggBytes: Buffer): Promise<BuildResult> {
  const baseZip = await import("node:fs").then(fs => fs.readFileSync(BASE_THEME_ZIP_PATH));
  const baseZipObj = new JSZip();
  await baseZipObj.loadAsync(baseZip);

  const zip = new JSZip();

  for (const [relPath, file] of Object.entries(baseZipObj.files) as [string, JSZip.JSZipObject][]) {
    if (file.dir) {
      zip.folder(relPath);
      continue;
    }
    // استبدال الخلفية والصوت فقط — كل الملفات الأخرى تبقى كما هي من الثيم الأصلي
    if (relPath === "background.jpg") {
      zip.file(relPath, jpgBytes);
    } else if (relPath === "sound/bgm.ogg") {
      zip.file(relPath, oggBytes);
    } else {
      const content = await file.async("nodebuffer");
      zip.file(relPath, content);
    }
  }

  const zipBytes = await zip.generateAsync({
    type: "nodebuffer",
    compression: "STORE", // ضغط صفر كما في الثيم الأصلي لسرعة النقل والقراءة
  });

  return { zipBytes, previewJpgBytes: jpgBytes };
}
