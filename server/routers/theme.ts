import { publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  buildThemeZip,
  buildThemeZipImageOnly,
  convertAudioToOgg,
  convertImageToBackground,
  THEME_FOLDER_NAME,
} from "../themeBuilder";

const MAX_UPLOAD_B64_BYTES = 2 * 1024 * 1024 * 1024;

const fileUploadSchema = z.object({
  data: z.string().min(1).max(MAX_UPLOAD_B64_BYTES),
  fileName: z.string().min(1).max(200),
});

export const themeRouter = router({
  /**
   * يرفع المستخدم صورة وصوت (base64) ويعيد:
   * - معاينة الصورة بعد التحويل (base64 jpg)
   * - رابط تحميل حزمة ZIP الكاملة
   * كما يمكن رفع الصورة فقط (audioData اختياري) ويُبني ZIP كامل بثيم GameStation
   * مع الخلفية الجديدة فقط (يبقى bgm.ogg الأصلي دون مساس)
   */
  build: publicProcedure
    .input(fileUploadSchema.extend({ audioData: z.string().max(MAX_UPLOAD_B64_BYTES).optional() }))
    .mutation(async ({ input }) => {
      try {
        const imageBytes = Buffer.from(input.data, "base64");
        const { jpgBytes } = await convertImageToBackground(imageBytes);

        // إذا لم يرفع المستخدم صوتاً نحتفظ بـ bgm.ogg الأصلي من الثيم دون مساس
        let result;
        if (input.audioData && input.audioData.length > 0) {
          const audioBytes = Buffer.from(input.audioData, "base64");
          const { oggBytes } = await convertAudioToOgg(audioBytes, input.fileName);
          result = await buildThemeZip(jpgBytes, oggBytes);
        } else {
          result = await buildThemeZipImageOnly(jpgBytes);
        }

        // تخزين الملف في ذاكرة الخادم المؤقتة للتحميل المضمون (same-origin)
        // ورفعه إلى التخزين البعيد كسجل — التحميل يُخدم من الذاكرة مباشرة
        const { storagePut } = await import("../storage");
        const { putDownloadCache } = await import("../_core/storageProxy");
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 60) || "theme";
        const fileKey = `themes/${Date.now()}-${safeName}-${THEME_FOLDER_NAME}.zip`;
        await putDownloadCache(fileKey, result.zipBytes, "application/zip");
        storagePut(fileKey, result.zipBytes, "application/zip").catch(err => {
          console.error("[Theme] remote backup failed (download still works):", err?.message);
        });

        return {
          previewImage: result.previewJpgBytes.toString("base64"),
          downloadUrl: `/manus-storage/${fileKey}`,
          fileKey,
          themeFolderName: THEME_FOLDER_NAME,
        };
      } catch (err: any) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err?.message || "فشل بناء حزمة الثيم",
        });
      }
    }),

  /** تحويل الصورة فقط (بدون صوت) والحصول على معاينة + رابط تحميل الخلفية منفصلة */
  downloadBackgroundOnly: publicProcedure
    .input(fileUploadSchema)
    .mutation(async ({ input }) => {
      try {
        const imageBytes = Buffer.from(input.data, "base64");
        const { jpgBytes } = await convertImageToBackground(imageBytes);
        const { storagePut } = await import("../storage");
        const { putDownloadCache } = await import("../_core/storageProxy");
        const fileKey = `backgrounds/${Date.now()}-background.jpg`;
        await putDownloadCache(fileKey, jpgBytes, "image/jpeg");
        storagePut(fileKey, jpgBytes, "image/jpeg").catch(err => {
          console.error("[Theme] remote backup failed (download still works):", err?.message);
        });
        return {
          previewImage: jpgBytes.toString("base64"),
          downloadUrl: `/manus-storage/${fileKey}`,
          fileKey,
          fileName: "background.jpg",
        };
      } catch (err: any) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err?.message || "فشل تحويل الصورة",
        });
      }
    }),

  /** تحويل الصورة فقط (بدون صوت) للحصول على معاينة سريعة */
  previewImage: publicProcedure
    .input(fileUploadSchema)
    .mutation(async ({ input }) => {
      try {
        const imageBytes = Buffer.from(input.data, "base64");
        const { jpgBytes } = await convertImageToBackground(imageBytes);
        return { previewImage: jpgBytes.toString("base64") };
      } catch (err: any) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err?.message || "فشل تحويل الصورة",
        });
      }
    }),
});
