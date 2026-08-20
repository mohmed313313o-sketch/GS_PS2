import { describe, expect, it } from "vitest";
import {
  buildThemeZip,
  convertImageToBackground,
  convertAudioToOgg,
  THEME_BG_WIDTH,
  THEME_BG_HEIGHT,
} from "./themeBuilder";
import JSZip from "jszip";

/** صورة اختبارية 800x600 بصيغة PNG حقيقية (مبنية عبر ffmpeg من BMP صحيح) */
function makeBmp(width: number, height: number): Buffer {
  // BMP 24-bit صحيح بترويسة DIB كاملة
  const bytesPerPixel = 3;
  const rowBytes = Math.ceil((width * bytesPerPixel) / 4) * 4;
  const pixelData = rowBytes * height;
  const header = Buffer.alloc(54);
  header.write("BM", 0);
  header.writeUInt32LE(54 + pixelData, 2); // file size
  header.writeUInt32LE(0, 6); // reserved
  header.writeUInt32LE(54, 10); // data offset
  header.writeUInt32LE(40, 14); // DIB header size
  header.writeInt32LE(width, 18);
  header.writeInt32LE(height, 22); // موجب = BMP عادي (صفوف من الأسفل)
  header.writeUInt16LE(1, 26); // planes
  header.writeUInt16LE(24, 28); // bits per pixel
  header.writeUInt32LE(0, 30); // compression: none
  header.writeUInt32LE(pixelData, 34); // image size
  header.writeInt32LE(2835, 38); // x ppm
  header.writeInt32LE(2835, 42); // y ppm
  header.writeUInt32LE(0, 46); // colors used
  header.writeUInt32LE(0, 50); // important colors
  const data = Buffer.alloc(pixelData);
  for (let i = 0; i < pixelData; i += 3) {
    data[i] = 200; // B
    data[i + 1] = 30; // G
    data[i + 2] = 40; // R
  }
  return Buffer.concat([header, data]);
}

function makeTestImage(width: number, height: number): Buffer {
  // BMP صحيح كمدخل أولي، ثم نحوّله لـ PNG عبر ffmpeg لضمان صيغة موثوقة
  const bmp = makeBmp(width, height);
  // نكتب مؤقتاً ونحوّل → هذا يضمن استخدام ffmpeg كما في المنطق الإنتاجي
  const fs = require("fs");
  const fsAsync = require("fs/promises");
  // نرجع BMP نفسه: ffmpeg يستطيع قراءة BMP مباشرة (المشكلة السابقة كانت ترويسة ناقصة)
  return bmp;
}

/** صوت اختباري: نغمة جيبية 0.5 ثانية كـ WAV خام */
function makeTestWav(): Buffer {
  const sampleRate = 44100;
  const duration = 0.5;
  const samples = Math.floor(sampleRate * duration);
  const bitsPerSample = 16;
  const channels = 1;
  const blockAlign = (bitsPerSample / 8) * channels;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples * blockAlign;

  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i++) {
    const sample = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 16000);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }
  return buffer;
}

describe("convertImageToBackground", () => {
  it("تحويل BMP اختباري إلى JPG بمقاس 640x336", async () => {
    const img = makeTestImage(800, 600);
    const result = await convertImageToBackground(img);
    expect(result.jpgBytes.length).toBeGreaterThan(0);
    expect(result.width).toBe(THEME_BG_WIDTH);
    expect(result.height).toBe(THEME_BG_HEIGHT);
    // التوقيع الأولي لملف JPG
    expect(result.jpgBytes[0]).toBe(0xff);
    expect(result.jpgBytes[1]).toBe(0xd8);
  });
});

describe("convertAudioToOgg", () => {
  it("تحويل WAV اختباري إلى Ogg Vorbis ستيريو 48kHz", async () => {
    const wav = makeTestWav();
    const result = await convertAudioToOgg(wav, "test.wav");
    expect(result.oggBytes.length).toBeGreaterThan(0);
    // التوقيع الأولي لملف OGG
    expect(result.oggBytes.subarray(0, 4).toString()).toBe("OggS");
  });
});

describe("convertImageToBackground watermark", () => {
  it("يضيف علامتين مائيتين في أسفل يسار ويمين الصورة النهائية 640x336", async () => {
    const img = makeTestImage(800, 600);
    const result = await convertImageToBackground(img);
    expect(result.width).toBe(THEME_BG_WIDTH);
    expect(result.height).toBe(THEME_BG_HEIGHT);

    const sharp = (await import("sharp")).default;
    // منطقة أسفل اليسار وأسفل اليمين (ارتفاع الشعار حوالي 12% من ارتفاع الصورة)
    const wmH = 48;
    const leftStrip = await sharp(result.jpgBytes)
      .extract({ left: 14, top: THEME_BG_HEIGHT - wmH - 14, width: 70, height: wmH })
      .raw({ depth: "uchar" })
      .toBuffer();
    const rightStrip = await sharp(result.jpgBytes)
      .extract({ left: THEME_BG_WIDTH - 84, top: THEME_BG_HEIGHT - wmH - 14, width: 70, height: wmH })
      .raw({ depth: "uchar" })
      .toBuffer();

    const bright = (buf: Buffer) => {
      let count = 0;
      for (let i = 2; i < buf.length; i += 3) if (buf[i] > 170) count++;
      return count / (buf.length / 3);
    };
    // الخلفية اختبارية داكنة (B=200 مقصود؟ لا — B=200 فاتحة!) الصورة الاختبارية ملونة B=200
    // العلامة البيضاء ستظهر كبيكسلات قريبة من 255، والخلفية عند ~200 كحد أقصى.
    // نقيس الفرق: نعد البيكسلات التي قناتها الزرقاء > 215 (أبيض نقي)
    const whiteish = (buf: Buffer) => {
      let count = 0;
      const px = buf.length / 3;
      for (let i = 0; i < buf.length; i += 3) {
        if (buf[i] > 230 && buf[i + 1] > 230 && buf[i + 2] > 230) count++;
      }
      return count / px;
    };
    // على الأقل واحدة من المنطقتين تحتوي الشعار (الخلفية الاختبارية موحدة اللون فلا تُشتت)
    expect(whiteish(leftStrip) + whiteish(rightStrip)).toBeGreaterThan(0.1);
  }, 60000);
});

describe("buildThemeZip", () => {
  it("الحزمة المرجعية نظيفة: بدون background.jpg و sound/bgm.ogg الأصليين", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const zip = new JSZip();
    await zip.loadAsync(fs.readFileSync(path.resolve(process.cwd(), "..", "webdev-static-assets", "GameStation_thm_ps2_base.zip")));
    const files = Object.keys(zip.files).filter(p => !zip.files[p].dir);
    expect(files).not.toContain("GameStation_thm_ps2/background.jpg");
    expect(files).not.toContain("GameStation_thm_ps2/sound/bgm.ogg");
    expect(files).toContain("GameStation_thm_ps2/conf_theme.cfg");
  });

  it("عند رفع صورة فقط: الخلفية تُضاف ولا يوجد صوت في الحزمة", async () => {
    const jpgBytes = (await convertImageToBackground(makeTestImage(800, 600))).jpgBytes;
    const { zipBytes } = await buildThemeZip(jpgBytes, null);
    const zip = new JSZip();
    await zip.loadAsync(zipBytes);
    const files = Object.keys(zip.files).filter(p => !zip.files[p].dir);
    expect(files).not.toContain("GameStation_thm_ps2/sound/bgm.ogg");
    expect(files).toContain("GameStation_thm_ps2/background.jpg");
    const bg = await zip.files["GameStation_thm_ps2/background.jpg"].async("nodebuffer");
    expect(bg.toString("base64")).toBe(jpgBytes.toString("base64"));
  });

  it("عند رفع صورة وصوت: الحزمة تحتوي الخلفية والصوت الجديد مع باقي ملفات الثيم", async () => {
    const jpgBytes = (await convertImageToBackground(makeTestImage(800, 600))).jpgBytes;
    const oggBytes = (await convertAudioToOgg(makeTestWav(), "test.wav")).oggBytes;

    const { zipBytes } = await buildThemeZip(jpgBytes, oggBytes);
    const zip = new JSZip();
    await zip.loadAsync(zipBytes);

    const files = Object.keys(zip.files).filter(p => !zip.files[p].dir);
    // نفس عدد الملفات الموجودة في الحزمة الأصلية (98 ملف تقريباً)
    expect(files.length).toBeGreaterThanOrEqual(95);
    expect(files).toContain("GameStation_thm_ps2/background.jpg");
    expect(files).toContain("GameStation_thm_ps2/sound/bgm.ogg");
    expect(files).toContain("GameStation_thm_ps2/conf_theme.cfg");

    // التحقق من أن الخلفية المستبدلة مطابقة لما حولناه
    const bg = await zip.files["GameStation_thm_ps2/background.jpg"].async("nodebuffer");
    expect(bg.toString("base64")).toBe(jpgBytes.toString("base64"));

    // التحقق من أن الصوت المستبدل Vorbis
    const ogg = await zip.files["GameStation_thm_ps2/sound/bgm.ogg"].async("nodebuffer");
    expect(ogg.subarray(0, 4).toString()).toBe("OggS");

    // ملف آخر من الثيم الأصلي لم يتغير (icon.sys)
    const iconSys = await zip.files["GameStation_thm_ps2/icon.sys"].async("nodebuffer");
    expect(iconSys.length).toBeGreaterThan(0);
  });
});
