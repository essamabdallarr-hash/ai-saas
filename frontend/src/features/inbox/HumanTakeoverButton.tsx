import { Hand, UserRoundCheck } from 'lucide-react';
import { useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { useI18n } from '@/i18n';

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
  const { t } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [takenOverBy, setTakenOverBy] = useState<string | null>(null);

  if (active || takenOverBy) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-ok-500/40 bg-ok-50 px-3 py-2 text-sm text-ok-600">
        <UserRoundCheck className="h-4 w-4" />
        <span>
          {t.inbox.continueAsHuman}
          {takenOverBy ? ` — ${takenOverBy}` : ''}
        </span>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] px-3 py-2 text-xs text-[#98A2B3]">
        {t.inbox.takeoverDisabled}
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
        {t.inbox.takeoverButton}
      </button>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t.inbox.confirmTakeover}>
        <p className="text-sm text-[#667085]">
          {t.inbox.takeoverDescription}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
            {t.inbox.cancel}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmOpen(false);
              setTakenOverBy('أنت');
              onTakeover();
            }}
          >
            {t.inbox.takeoverNow}
          </Button>
        </div>
      </Modal>
    </>
  );
}
