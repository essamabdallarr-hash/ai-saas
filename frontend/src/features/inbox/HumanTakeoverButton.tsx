import { Hand, UserRoundCheck } from 'lucide-react';
import { useState } from 'react';
import { Button, Modal } from '@/components/ui';

/**
 * زر التحويل البشري الأحمر البارز (Human Takeover).
 * إيقاف فوري لمحرك الـ AI واستكمال المحادثة يدويًا (صوتيًا أو نصيًا).
 */
export function HumanTakeoverButton({
  active,
  enabled,
  onTakeover,
}: {
  /** هل تم التحويل مسبقًا؟ */
  active: boolean;
  /** هل يسمح تفعيل العميل (Feature Toggle) بهذه الميزة؟ */
  enabled: boolean;
  onTakeover: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [takenOverBy, setTakenOverBy] = useState<string | null>(null);

  if (active || takenOverBy) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-ok-500/40 bg-ok-50 px-3 py-2 text-sm text-ok-600">
        <UserRoundCheck className="h-4 w-4" />
        <span>
          استكمل المحادثة كبشري
          {takenOverBy ? ` — ${takenOverBy}` : ''}
        </span>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400">
        التحويل البشري معطّل في باقتك
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-danger-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-danger-600/30 transition-colors hover:bg-danger-700"
      >
        <Hand className="h-4 w-4" />
        Human Takeover — تحويل فوري
      </button>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="تأكيد التحويل البشري">
        <p className="text-sm text-slate-600">
          سيتم إيقاف محرك الـ AI فورًا لهذه المحادثة، وستتمكن أنت من استكمالها يدويًا (صوتيًا أو
          نصيًا) مع تمرير سياق المحادثة كاملًا.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
            إلغاء
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmOpen(false);
              setTakenOverBy('أنت');
              onTakeover();
            }}
          >
            تحويل الآن
          </Button>
        </div>
      </Modal>
    </>
  );
}
