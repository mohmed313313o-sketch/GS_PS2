import type { Express, Response } from "express";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DATA_DIR } from "../storage";

/**
 * مسار التحميل الرئيسي (same-origin): يبعث الملف نفسه من القرص
 * مع Content-Disposition: attachment — بدون أي اعتماد على نطاق خارجي.
 * الاستخدام: GET /api/download?key=<storage-key>&fileName=<name>
 *
 * تنظيف دوري للملفات الأقدم من TTL حتى لا تمتلئ القرص.
 */
const CACHE_TTL_MS = 60 * 60 * 1000; // ساعة واحدة
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

setInterval(async () => {
  try {
    await cleanup(DATA_DIR);
  } catch {
    // تجاهل أخطاء التنظيف
  }
}, CLEANUP_INTERVAL_MS);

async function cleanup(dir: string) {
  const { readdir, stat: st } = await import("node:fs/promises");
  const now = Date.now();
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        await cleanup(full);
        continue;
      }
      const s = await st(full).catch(() => undefined);
      if (s && now - s.mtimeMs > CACHE_TTL_MS) await unlink(full).catch(() => {});
    }
  } catch {
    // مجلد غير موجود بعد
  }
}

async function serveFile(key: string, fileName: string, res: Response) {
  const safe = key.replace(/^\/+/, "").replace(/(\.\.\/)+/g, "");
  const dest = `${DATA_DIR}/${safe}`;
  const s = await stat(dest); // throws إذا لم يوجد
  res.set("Content-Type", "application/octet-stream");
  res.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.set("Content-Length", String(s.size));
  res.set("Cache-Control", "no-store");
  const fs = await import("node:fs");
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(dest)
      .on("error", reject)
      .on("end", () => resolve())
      .pipe(res);
  });
}

export function registerDownloadRoute(app: Express) {
  app.get("/api/download", async (req, res) => {
    const key = typeof req.query.key === "string" ? req.query.key : "";
    const fileName = typeof req.query.fileName === "string" ? req.query.fileName : "file";
    if (!key) {
      res.status(400).send("Missing key");
      return;
    }
    try {
      await serveFile(key, fileName, res);
    } catch {
      res.status(404).send("File not found or expired");
    }
  });
}

/** Legacy: /manus-storage يوجّه إلى /api/download للتوافق مع الكود القديم */
export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    try {
      await serveFile(key, key.split("/").pop() || "file", res);
    } catch {
      res.status(404).send("File not found");
    }
  });
}

export async function putDownloadCache(key: string, data: Buffer, _contentType: string) {
  // التخزين المحلي: كتابة الملف إلى القرص مباشرة ليُخدم عبر /api/download
  const safe = key.replace(/^\/+/, "").replace(/(\.\.\/)+/g, "");
  const dest = `${DATA_DIR}/${safe}`;
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, data);
}

export function getDownloadCache() {
  return new Map();
}
