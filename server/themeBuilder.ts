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
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", tmpIn,
      "-vf", `scale=${THEME_BG_WIDTH}:${THEME_BG_HEIGHT}:force_original_aspect_ratio=increase,crop=${THEME_BG_WIDTH}:${THEME_BG_HEIGHT}`,
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
