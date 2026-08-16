import { FileAudio } from 'lucide-react';
import { useI18n } from '@/i18n';

export function CallAudioPlayer({ src }: { src?: string }) {
  const { t } = useI18n();
  if (!src) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[#98A2B3]">
        <FileAudio className="h-3.5 w-3.5" />
        {t.reports.noRecording ?? 'لا يوجد تسجيل'}
      </span>
    );
  }
  return (
    <audio controls preload="none" className="h-8 w-40">
      <source src={src} />
    </audio>
  );
}
