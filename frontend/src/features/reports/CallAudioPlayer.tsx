import { FileAudio } from 'lucide-react';

/** مشغل تسجيل المكالمة — يعرض أيقونة بديلة عند غياب التسجيل */
export function CallAudioPlayer({ src }: { src?: string }) {
  if (!src) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-slate-400">
        <FileAudio className="h-3.5 w-3.5" />
        لا يوجد تسجيل
      </span>
    );
  }
  return (
    <audio controls preload="none" className="h-8 w-40">
      <source src={src} />
      متصفحك لا يدعم تشغيل الصوت
    </audio>
  );
}
