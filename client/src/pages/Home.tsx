import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import ParticleField from "@/components/ParticleField";
import { useReveal } from "@/hooks/useReveal";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Image as ImageIcon,
  Music,
  Download,
  Eye,
  Upload,
  X,
  Gamepad2,
  Zap,
  Package,
  ExternalLink,
  Loader2,
  FileImage,
} from "lucide-react";

const GS_LOGO = "/logos/gs-logo.jpg";
const GSTATION_LOGO = "/logos/gstation-logo.jpg";
const GS_TELEGRAM_URL = "https://t.me/GS_PS";
/** رابط قناة GSTATION — يُحدَّث لاحقاً */
const GSTATION_URL = "https://t.me/GameStation97";

/** لا حد أقصى لحجم الملفات — أي حجم مسموح */
const MAX_FILE_SIZE = Infinity;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Home() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [downloadUrl, setDownloadUrl] = useState<string>("");
  const [downloadKey, setDownloadKey] = useState<string>("");
  const [building, setBuilding] = useState(false);
  const [bgOnlyUrl, setBgOnlyUrl] = useState<string>("");
  const [bgOnlyKey, setBgOnlyKey] = useState<string>("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const buildMutation = trpc.theme.build.useMutation();
  const bgOnlyMutation = trpc.theme.downloadBackgroundOnly.useMutation();

  const resetResult = () => {
    setDownloadUrl("");
    setDownloadKey("");
    setPreviewUrl("");
  };

  const handleImagePick = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      // لا حد للحجم

    }
    setImageFile(file);
    resetResult();
    toast.success(`تم اختيار الصورة: ${file.name}`);
  }, []);

  const handleAudioPick = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      // لا حد للحجم

    }
    setAudioFile(file);
    resetResult();
    toast.success(`تم اختيار ملف الصوت: ${file.name}`);
  }, []);

  const buildTheme = async () => {
    if (!imageFile) {
      toast.error("يرجى رفع الصورة أولاً");
      return;
    }
    setBuilding(true);
    try {
      const imageData = await readFileAsBase64(imageFile);
      let result;
      if (audioFile) {
        const audioData = await readFileAsBase64(audioFile);
        result = await buildMutation.mutateAsync({
          data: imageData,
          fileName: imageFile.name,
          audioData,
        });
        setDownloadUrl(result.downloadUrl);
        setDownloadKey(result.fileKey);
        toast.success("تم بناء حزمة الثيم بنجاح! جاهزة للتحميل");
      } else {
        // صورة فقط: ZIP كامل بالخلفية الجديدة (بدون صوت، يبقى bgm.ogg الأصلي)
        result = await buildMutation.mutateAsync({
          data: imageData,
          fileName: imageFile.name,
          audioData: "",
        });
        setDownloadUrl(result.downloadUrl);
        setDownloadKey(result.fileKey);
        toast.success("تم بناء حزمة الثيم بالخلفية الجديدة (بدون تغيير الصوت)");
      }
      setPreviewUrl(`data:image/jpeg;base64,${result.previewImage}`);
    } catch (err: any) {
      toast.error(err?.message || "حدث خطأ أثناء بناء الحزمة");
    } finally {
      setBuilding(false);
    }
  };

  /** تحميل ملف background.jpg فقط دون أي ملف آخر (لا يُستخدم كثيم كامل) */
  const downloadBackgroundOnly = async () => {
    if (!imageFile) {
      toast.error("يرجى رفع الصورة أولاً");
      return;
    }
    setBuilding(true);
    try {
      const imageData = await readFileAsBase64(imageFile);
      const result = await bgOnlyMutation.mutateAsync({ data: imageData, fileName: imageFile.name });
      setBgOnlyUrl(result.downloadUrl);
      setBgOnlyKey(result.fileKey);
      setPreviewUrl(`data:image/jpeg;base64,${result.previewImage}`);
      toast.success("تم تجهيز background.jpg جاهز للتحميل!");
    } catch (err: any) {
      toast.error(err?.message || "حدث خطأ أثناء تحويل الصورة");
    } finally {
      setBuilding(false);
    }
  };

  const progress = building ? 60 : downloadUrl || bgOnlyUrl ? 100 : imageFile ? 50 : 0;

  // تحميل مضمون: نقطتا تحميل موثوقتان —
  // 1) مسار الخادم /api/download يبعث الملف مباشرة من نفس النطاق مع Content-Disposition
  //    (لا يعتمد على redirect خارجي ولا على CORS ولا على popup)
  // 2) احتياط: جلب الملف عبر Blob + createObjectURL عبر الرابط المباشر
  const downloadViaServer = async (fileKey: string, fileName: string) => {
    const dlUrl = `/api/download?key=${encodeURIComponent(fileKey)}&fileName=${encodeURIComponent(fileName)}`;
    // نستخدم fetch لنحصل على Blob بنفس اسم الملف — المسار same-origin فلا يوجد CORS
    const resp = await fetch(dlUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  };

  const triggerDownload = async (url: string, fileName: string, fileKey?: string) => {
    try {
      if (fileKey) {
        await downloadViaServer(fileKey, fileName);
        toast.success(`جارٍ تحميل ${fileName}...`);
        return;
      }
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
      toast.success(`جارٍ تحميل ${fileName}...`);
    } catch {
      window.open(url, "_blank");
      toast.info("إذا لم يبدأ التحميل تلقائياً، افتح الملف من النافذة الجديدة واحفظه.");
    }
  };

  const heroRef = useReveal();
  const imgCardRef = useReveal();
  const audioCardRef = useReveal();
  const buildRef = useReveal();
  const buildSectionRef = useReveal();
  const footerRef = useReveal();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* خلفية الجزيئات المتحركة */}
      <ParticleField />
      {/* ===== Header ===== */}
      <header className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-gradient-to-l from-[#0d1220] via-[#101526] to-[#15090e]" />
        <div className="absolute inset-y-0 start-0 w-1/3 bg-[radial-gradient(ellipse_at_center,rgba(225,29,44,0.12),transparent_70%)] animate-aurora" />
        <div className="absolute inset-y-0 end-0 w-1/3 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.1),transparent_70%)] animate-aurora" />

        <div className="container relative py-6 md:py-8">
          {/* الصف العلوي: الشعاران الدائريان المتحركان */}
          <div className="flex items-center justify-center gap-8 md:gap-16 animate-fade-up">
            <a
              href={GSTATION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-center gap-3"
            >
              <div className="relative h-24 w-24 md:h-28 md:w-28 flex items-center justify-center">
                {/* حلقة متوهجة دوارة */}
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-red-500 border-r-red-500/40 animate-spin-slow" />
                <div className="absolute inset-1 rounded-full border border-red-500/25 animate-spin-reverse" />
                {/* الشعار الدائري */}
                <div className="relative h-20 w-20 md:h-24 md:w-24 rounded-full overflow-hidden ring-2 ring-white/20 ring-offset-2 ring-offset-[#0d1220] shadow-xl shadow-red-900/40 transition-all duration-300 group-hover:ring-red-500/70 group-hover:shadow-red-500/40 group-hover:scale-110">
                  <img
                    src={GS_LOGO}
                    alt="شعار GameStation"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
              <span className="text-sm md:text-base font-bold tracking-wide text-white/90">
                GameStation
              </span>
            </a>

            <div className="flex flex-col items-center gap-2">
              <span className="text-xs md:text-sm font-medium text-muted-foreground">
                بمشاركة قناة GameStation و GSTATION
              </span>
              <div className="h-px w-24 bg-gradient-to-l from-red-500/60 to-blue-500/60" />
            </div>

            <a
              href={GS_TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-center gap-3"
            >
              <div className="relative h-24 w-24 md:h-28 md:w-28 flex items-center justify-center">
                {/* حلقة متوهجة دوارة */}
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 border-r-blue-500/40 animate-spin-slow" />
                <div className="absolute inset-1 rounded-full border border-blue-500/25 animate-spin-reverse" />
                {/* الشعار الدائري */}
                <div className="relative h-20 w-20 md:h-24 md:w-24 rounded-full overflow-hidden ring-2 ring-white/20 ring-offset-2 ring-offset-[#0d1220] shadow-xl shadow-blue-900/40 transition-all duration-300 group-hover:ring-blue-500/70 group-hover:shadow-blue-500/40 group-hover:scale-110">
                  <img
                    src={GSTATION_LOGO}
                    alt="شعار GSTATION"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
              <span className="text-sm md:text-base font-bold tracking-wide text-white/90">
                GSTATION
              </span>
            </a>
          </div>

          <div className="mt-6 flex items-center justify-center">
            <div className="inline-flex items-center gap-1 rounded-[22px] bg-white/5 border border-white/10 backdrop-blur px-2 py-1.5 shadow-inner">
              <a
                href={GSTATION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-[18px] bg-red-600/15 px-4 py-2 text-xs md:text-sm font-bold text-red-400 border border-red-500/30 transition-all duration-300 hover:bg-red-600/30 hover:text-red-300 hover:scale-110 hover:shadow-[0_0_20px_rgba(239,68,68,0.6)] animate-link-shimmer"
              >
                <ExternalLink className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                <span className="channel-name-flow">قناة GameStation</span>
              </a>
              <a
                href={GS_TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-[18px] bg-blue-600/15 px-4 py-2 text-xs md:text-sm font-bold text-blue-400 border border-blue-500/30 transition-all duration-300 hover:bg-blue-600/30 hover:text-blue-300 hover:scale-110 hover:shadow-[0_0_20px_rgba(59,130,246,0.6)] animate-link-shimmer-blue"
              >
                  <ExternalLink className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                  <span className="channel-name-flow-blue">GSTATION</span>
                </a>
            </div>
          </div>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section className="container relative py-8 md:py-10">
        <div ref={heroRef} className="mx-auto max-w-3xl text-center reveal">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 border border-primary/30 px-4 py-1.5 text-sm font-bold text-primary mb-4 animate-float">
            <Gamepad2 className="h-4 w-4" />
            أداة صانع ثيمات OPL
          </div>
          <h1 className="text-3xl md:text-5xl font-black leading-tight">
            أنشئ ثيم <span className="text-primary">GameStation</span> بخلفيتك وصوتك
          </h1>
          <p className="mt-4 text-base md:text-lg text-muted-foreground leading-relaxed">
            ارفع أي صورة وأي ملف صوت، وسنحوّلهما تلقائياً إلى مواصفات ثيم GameStation الأصلي
            (خلفية 640×336 بصيغة JPEG وصوت Vorbis ستيريو)، ونسلّمك حزمة ZIP كاملة جاهزة للتركيب على جهازك.
          </p>
        </div>
      </section>

      {/* ===== Builder ===== */}
      <section className="container pb-10 flex-1" ref={buildSectionRef}>
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
          {/* رفع الصورة */}
          <Card className={`border-white/10 bg-card/60 backdrop-blur transition-all duration-300 hover:shadow-lg hover:shadow-primary/15 hover:-translate-y-1`}>
          <div ref={imgCardRef} className="reveal">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-lg bg-primary/15 p-2">
                  <ImageIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">خلفية الثيم</h3>
                  <p className="text-xs text-muted-foreground">أي صيغة صورة • ستحوَّل إلى background.jpg (640×336)</p>
                </div>
              </div>

              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleImagePick(e.target.files[0])}
              />
              {!imageFile ? (
                <button
                  onClick={() => imageInputRef.current?.click()}
                  className="group relative flex h-44 w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border-2 border-dashed border-white/15 bg-white/5 transition-all hover:border-primary/50 hover:bg-primary/5"
                >
                  {/* شبكة خطوط متحركة إبداعية */}
                  <div className="scan-grid pointer-events-none absolute inset-0" aria-hidden>
                    <span className="scan-line scan-line-v" style={{ left: "12%", animationDelay: "0s" }} />
                    <span className="scan-line scan-line-v" style={{ left: "37%", animationDelay: "0.6s" }} />
                    <span className="scan-line scan-line-v" style={{ left: "62%", animationDelay: "1.2s" }} />
                    <span className="scan-line scan-line-v" style={{ left: "87%", animationDelay: "1.8s" }} />
                    <span className="scan-line-h" style={{ top: "25%", animationDelay: "0.3s" }} />
                    <span className="scan-line-h" style={{ top: "70%", animationDelay: "1.5s" }} />
                  </div>
                  <div className="rounded-full bg-primary/10 p-3 transition-transform group-hover:scale-110 z-10">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>
                  <div className="text-sm font-semibold z-10">اضغط لاختيار الصورة</div>
                  <div className="text-xs text-muted-foreground z-10">PNG, JPG, WEBP, BMP... بدون حد أقصى</div>
                </button>
              ) : (
                <div className="relative">
                  <button
                    onClick={() => {
                      setImageFile(null);
                      resetResult();
                    }}
                    className="absolute -top-2 -end-2 z-10 rounded-full bg-destructive p-1 text-destructive-foreground shadow-md hover:opacity-90"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="overflow-hidden rounded-xl border border-white/10">
                    <FileImage className="h-10 w-10 mx-auto mt-6 text-muted-foreground/50" />
                    <div className="py-3 text-center">
                      <div className="text-sm font-bold truncate px-2">{imageFile.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">{formatSize(imageFile.size)}</div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </div>
          </Card>

          {/* رفع الصوت */}
          <Card className={`border-white/10 bg-card/60 backdrop-blur transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/15 hover:-translate-y-1`}>
          <div ref={audioCardRef} className="reveal">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-lg bg-blue-500/15 p-2">
                  <Music className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">الموسيقى (اختياري)</h3>
                  <p className="text-xs text-muted-foreground">أي صيغة صوت • ستحوَّل إلى sound/bgm.ogg (Vorbis)</p>
                </div>
              </div>

              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleAudioPick(e.target.files[0])}
              />
              {!audioFile ? (
                <button
                  onClick={() => audioInputRef.current?.click()}
                  className="group relative flex h-44 w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border-2 border-dashed border-white/15 bg-white/5 transition-all hover:border-blue-500/50 hover:bg-blue-500/5"
                >
                  {/* موجات موسيقى متحركة */}
                  <div className="absolute inset-x-0 bottom-0 flex h-16 items-end justify-center gap-1.5 opacity-30 group-hover:opacity-60 transition-opacity">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                      <span
                        key={i}
                        className="eq-bar w-1.5 rounded-t-full bg-blue-400"
                        style={{ animationDelay: `${i * 0.12}s` }}
                      />
                    ))}
                  </div>
                  <div className="rounded-full bg-blue-500/10 p-3 transition-transform group-hover:scale-110">
                    <Upload className="h-6 w-6 text-blue-400" />
                  </div>
                  <div className="text-sm font-semibold">اضغط لاختيار ملف الصوت</div>
                  <div className="text-xs text-muted-foreground">MP3, OGG, WAV, FLAC... بدون حد أقصى</div>
                </button>
              ) : (
                <div className="relative">
                  <button
                    onClick={() => {
                      setAudioFile(null);
                      resetResult();
                    }}
                    className="absolute -top-2 -end-2 z-10 rounded-full bg-destructive p-1 text-destructive-foreground shadow-md hover:opacity-90"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5 py-8 text-center">
                    <Music className="h-10 w-10 mx-auto text-blue-400/50" />
                    <div className="py-3 text-center">
                      <div className="text-sm font-bold truncate px-2">{audioFile.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">{formatSize(audioFile.size)}</div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </div>
          </Card>
        </div>

        {/* زر البناء */}
        <div className="mx-auto mt-6 max-w-5xl reveal" ref={buildRef}>
          <div className="flex flex-col items-center gap-4">
            <Progress value={progress} className={`w-full max-w-md [&>div]:bg-primary transition-all duration-700 ${progress === 0 ? "opacity-0 h-0" : ""}`} />
            <Button
              size="lg"
              onClick={buildTheme}
              disabled={building || !imageFile}
              className={`w-full max-w-md h-14 text-lg font-black transition-all active:scale-[0.97] ${
                imageFile && !building ? "animate-pulse-glow" : "shadow-xl shadow-primary/25"
              }`}
            >
              {building ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  جاري بناء حزمة الثيم...
                </>
              ) : (
                <>
                  <Zap className="h-5 w-5" />
                  بناء حزمة الثيم
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={downloadBackgroundOnly}
              disabled={building || !imageFile}
              className="w-full max-w-md h-11 font-bold border-primary/40 text-primary hover:bg-primary/10 transition-all active:scale-[0.97]"
            >
              <Download className="h-4 w-4" />
              تحميل background.jpg فقط (بدون صوت)
            </Button>
            {!imageFile && !audioFile && (
              <p className="text-xs text-muted-foreground">ارفع الصورة (والصوت اختياري) لتفعيل الأزرار</p>
            )}
          </div>

          {/* المعاينة والتحميل */}
          {(previewUrl || downloadUrl || bgOnlyUrl) && (
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              {previewUrl && (
                <Card className="border-primary/30 bg-card/60 backdrop-blur">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Eye className="h-4 w-4 text-primary" />
                      <h4 className="font-bold">معاينة الخلفية بعد التحويل (640×336)</h4>
                    </div>
                    <div className="overflow-hidden rounded-lg border border-white/10">
                      <img
                        src={previewUrl}
                        alt="معاينة خلفية الثيم"
                        className="w-full aspect-[640/336] object-cover"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
              {downloadUrl && (
                <Card className="border-green-500/30 bg-card/60 backdrop-blur">
                  <CardContent className="p-5 flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-3">
                      <Package className="h-4 w-4 text-green-400" />
                      <h4 className="font-bold">الحزمة جاهزة!</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      حزمة ZIP بكامل ملفات ثيم GameStation الأصلي (98 ملف) — {audioFile ? "استُبدلت الخلفية والصوت فقط." : "استُبدلت الخلفية فقط (بقيت الموسيقى الأصلية)."}
                      فكّ الضغط وضع المجلد <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">GameStation_thm_ps2</code> في
                      <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">mc/THEMES</code> على جهازك.
                    </p>
                    <Button
                      size="lg"
                      onClick={() => triggerDownload(downloadUrl, "GameStation_thm_ps2.zip", downloadKey)}
                      className="w-full h-13 text-base font-bold bg-green-600 hover:bg-green-500 text-white animate-pulse-glow-blue transition-all active:scale-[0.97]"
                    >
                      <Download className="h-5 w-5" />
                      تحميل الحزمة ZIP
                    </Button>
                  </CardContent>
                </Card>
              )}
              {bgOnlyUrl && (
                <Card className="border-amber-500/30 bg-card/60 backdrop-blur">
                  <CardContent className="p-5 flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-3">
                      <ImageIcon className="h-4 w-4 text-amber-400" />
                      <h4 className="font-bold">الخلفية جاهزة!</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      ملف <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">background.jpg</code> بمقاس 640×336 بصيغة JPEG — جاهز للاستخدام كخلفية ثيم OPL مباشرة دون الحزمة الكاملة.
                    </p>
                    <Button
                      size="lg"
                      onClick={() => triggerDownload(bgOnlyUrl, "background.jpg", bgOnlyKey)}
                      className="w-full h-13 text-base font-bold bg-amber-600 hover:bg-amber-500 text-white transition-all active:scale-[0.97]"
                    >
                      <Download className="h-5 w-5" />
                      تحميل background.jpg
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="border-t border-white/10 bg-[#0b0f1c]">
        <div className="container py-6 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Gamepad2 className="h-4 w-4 text-primary" />
            صانع ثيمات GameStation
          </div>
          <p className="text-sm text-muted-foreground">
            بمشاركة قناة{" "}
            <a href={GSTATION_URL} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:underline">
              GameStation
            </a>
            {" و "}
            <a href={GS_TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="text-blue-400 font-semibold hover:underline">
              GSTATION
            </a>
          </p>
          <div className="mt-1 inline-block rounded-xl border-2 border-red-500/70 px-8 py-3 bg-black/40 backdrop-blur animate-laser-border">
            <p className="text-center text-base md:text-lg font-bold text-white tracking-wide">
              تم إنشاء هذا الموقع بواسطة{" "}
              <span className="text-red-400 animate-neon-pulse">محمد رضا</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
