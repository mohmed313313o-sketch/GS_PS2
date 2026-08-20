// تخزين محلي على القرص (نسخة مستقلة بلا اعتماد على S3/Manus)
// الملفات تُحفظ في DATA_DIR وتُخدم عبر /api/download

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const DATA_DIR = process.env.OPL_DATA_DIR || "/app/data";

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = relKey.replace(/^\/+/, "");
  const dest = `${DATA_DIR}/${key}`;
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, data);
  return { key, url: `/api/download?key=${encodeURIComponent(key)}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = relKey.replace(/^\/+/, "");
  return { key, url: `/api/download?key=${encodeURIComponent(key)}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = relKey.replace(/^\/+/, "");
  return `/api/download?key=${encodeURIComponent(key)}`;
}
