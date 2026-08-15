/**
 * منطق مكافحة الحظر (Anti-Ban Logic) — إلزامي للمحرك الحر (whatsapp-web.js).
 * - تأخير عشوائي 3-5 ثوانٍ قبل كل رد (يحاكي سرعة إنسان)
 * - تفعيل حالة "يكتب الآن" قبل الإرسال
 * - Spintax لتغيير صياغة الرسائل المتكررة
 */
export class AntiBanLogic {
  constructor(
    private opts: {
      typingDelayMs: number; // 4000 افتراضيًا
      spintaxEnabled: boolean;
      outboundBlocked: boolean;
    },
  ) {}

  /** أقصى/أدنى نافذة تأخير محاكية للإنسان (3-5 ثوانٍ) */
  humanDelayMs(): number {
    const base = Math.min(5000, Math.max(3000, this.opts.typingDelayMs));
    const jitter = base * 0.2 * (Math.random() * 2 - 1); // ±20%
    return Math.round(base + jitter);
  }

  async waitHuman(): Promise<void> {
    const ms = this.humanDelayMs();
    await new Promise((r) => setTimeout(r, ms));
  }

  /** يوسّع قوالب Spintax: "مرحباً {أ|يا} {كيف حالك|كيفك}" → اختيار عشوائي واحد */
  expandSpintax(text: string): string {
    if (!this.opts.spintaxEnabled || !text.includes('{')) return text;
    const pattern = /\{([^{}]+)\}/g;
    return text.replace(pattern, (_m, inner: string) => {
      const parts = inner.split('|').map((p) => p.trim()).filter(Boolean);
      if (parts.length === 0) return '';
      return parts[Math.floor(Math.random() * parts.length)];
    });
  }
}
