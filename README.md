# OPL Theme Maker — GameStation / GSTATION

صانع ثيمات OPL (Open PS2 Loader) لأجهزة PS2. يرفع المستخدم صورة وصوت بأي صيغة، فيحوّلهما إلى `background.jpg` (640x336) و`bgm.ogg` (Vorbis) بنفس مواصفات ثيم GameStation الأصلي، ويولّد ملف ZIP جاهز للتحميل.

**تطوير: محمد رضا**

## الميزات

- رفع صورة بأي صيغة وحجم → تحويل إلى `background.jpg` بالمواصفات القياسية
- رفع صوت بأي صيغة → تحويل إلى Vorbis OGG باسم `bgm.ogg`
- خيار رفع الصورة فقط (بدون صوت) مع إمكانية تحميل `background.jpg` منفرداً
- توليد ثيم ZIP كامل بالمجلدات الصحيحة
- بدون حدود قصوى للرفع
- واجهة عربية متحركة بشعارات قناة GameStation و GSTATION

## التشغيل المحلي

```bash
pnpm install
pnpm run build
JWT_SECRET=any-random-secret pnpm run start
```

للتطوير:

```bash
pnpm install
pnpm run dev
```

## النشر على Railway

1. اربط هذا المستودع بحسابك على [Railway](https://railway.app)
2. سيتم البناء تلقائياً عبر Nixpacks (انظر `railway.toml`)
3. أضف متغير البيئة التالي من إعدادات المشروع:
   - `JWT_SECRET` — أي سلسلة عشوائية طويلة (مثلاً: `openssl rand -hex 32`)
4. متغيرات اختيارية:
   - `OPL_DATA_DIR` — مجلد تخزين الملفات المؤقتة (الافتراضي `/app/data`)
   - `PORT` — لا تضبطه عادةً؛ Railway يوفره تلقائياً

لا يحتاج التطبيق إلى قاعدة بيانات أو أي خدمة خارجية — يعمل بشكل مستقل تماماً.

## البنية

- `client/` — واجهة React 19 + Tailwind 4
- `server/` — خادم Express + tRPC (تحويل الصور بـ ffmpeg والصوت بـ ffmpeg/JSZip وتوليد ZIP)
- `dist/` — ناتج البناء (لا يُعدَّل يدوياً)
