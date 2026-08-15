import { Volume2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Field } from '@/components/ui';

export interface VoiceOption {
  voiceId: string;
  name: string;
  gender: 'female' | 'male';
  language: string;
}

// أصوات Azure TTS العربية المدعومة (Arabic Neural Voices)
export const AZURE_ARABIC_VOICES: VoiceOption[] = [
  { voiceId: 'ar-EG-SalmaNeural', name: 'سلمى (مصر)', gender: 'female', language: 'ar-EG' },
  { voiceId: 'ar-EG-ShakirNeural', name: 'شاكر (مصر)', gender: 'male', language: 'ar-EG' },
  { voiceId: 'ar-SA-ZariyahNeural', name: 'زارية (السعودية)', gender: 'female', language: 'ar-SA' },
  { voiceId: 'ar-SA-HamedNeural', name: 'حامد (السعودية)', gender: 'male', language: 'ar-SA' },
  { voiceId: 'ar-AE-FatimaNeural', name: 'فاطمة (الإمارات)', gender: 'female', language: 'ar-AE' },
  { voiceId: 'ar-AE-HamdanNeural', name: 'حمدان (الإمارات)', gender: 'male', language: 'ar-AE' },
  { voiceId: 'ar-SY-AmanyNeural', name: 'أماني (سوريا)', gender: 'female', language: 'ar-SY' },
  { voiceId: 'ar-SY-LaithNeural', name: 'ليث (سوريا)', gender: 'male', language: 'ar-SY' },
  { voiceId: 'ar-YE-MaryamNeural', name: 'مريم (اليمن)', gender: 'female', language: 'ar-YE' },
];

export function VoicePicker({
  voiceId,
  onChange,
}: {
  voiceId: string;
  onChange: (voiceId: string) => void;
}) {
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  async function playPreview(id: string, name: string) {
    setPreviewing(id);
    setPreviewError(null);
    try {
      // Step 3: POST /tts/preview → يعيد رابط صوت تجريبي عبر Azure TTS
      const { audioUrl } = await api<{ audioUrl: string }>('/tts/preview', {
        method: 'POST',
        json: { text: `مرحبًا، أنا ${name}، جاهزة للتحدث معك.`, voiceId: id },
      });
      const audio = new Audio(audioUrl);
      await audio.play();
    } catch {
      setPreviewError('معاينة الصوت غير متاحة الآن (ستُفعّل في Step 3).');
    } finally {
      setPreviewing(null);
    }
  }

  return (
    <div>
      <Field label="صوت البوت" hint="يتم التوليد عبر Azure TTS مع Smart Caching للجمل المتكررة">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {AZURE_ARABIC_VOICES.map((voice) => {
            const active = voice.voiceId === voiceId;
            return (
              <button
                key={voice.voiceId}
                type="button"
                onClick={() => onChange(voice.voiceId)}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 text-slate-700 hover:border-brand-300'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  <span>{voice.name}</span>
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    playPreview(voice.voiceId, voice.name);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      playPreview(voice.voiceId, voice.name);
                    }
                  }}
                  className="rounded bg-white px-2 py-0.5 text-[10px] text-brand-600 ring-1 ring-brand-200 hover:bg-brand-50"
                >
                  {previewing === voice.voiceId ? '...' : 'استمع'}
                </span>
              </button>
            );
          })}
        </div>
      </Field>
      {previewError && <p className="mt-2 text-xs text-danger-600">{previewError}</p>}
    </div>
  );
}
