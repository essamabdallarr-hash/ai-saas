import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { DynamicField, DynamicFieldType } from '@/lib/types';

const FIELD_TYPES: Array<{ value: DynamicFieldType; labelKey: string }> = [
  { value: 'TEXT', labelKey: 'dynamicFields.fieldTypes.text' },
  { value: 'NUMBER', labelKey: 'dynamicFields.fieldTypes.number' },
  { value: 'DATE', labelKey: 'dynamicFields.fieldTypes.date' },
  { value: 'BOOLEAN', labelKey: 'dynamicFields.fieldTypes.boolean' },
  { value: 'SELECT', labelKey: 'dynamicFields.fieldTypes.select' },
  { value: 'CURRENCY', labelKey: 'dynamicFields.fieldTypes.currency' },
];

function toKey(label: string): string {
  const latin = label
    .replace(/[^\w\s\u0600-\u06FF]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase();
  const map: Record<string, string> = {
    الميزانية: 'budget',
    'موعد الحجز': 'appointment_date',
    'نتيجة التفاوض': 'negotiation_result',
    'اسم العميل': 'customer_name',
    'رقم الهاتف': 'phone',
    المدينة: 'city',
    المنتج: 'product',
    الكمية: 'quantity',
    'حالة المتابعة': 'followup_status',
  };
  return map[latin] ?? (latin.replace(/[\u0600-\u06FF]/g, '').replace(/^_+|_+$/g, '') || `field_${Date.now()}`);
}

export function DynamicFieldsManager({
  fields,
  onChange,
}: {
  fields: DynamicField[];
  onChange: (fields: DynamicField[]) => void;
}) {
  const { t } = useI18n();
  const [label, setLabel] = useState('');
  const [type, setType] = useState<DynamicFieldType>('TEXT');
  const [required, setRequired] = useState(false);
  const [description, setDescription] = useState('');

  function addField() {
    if (!label.trim()) return;
    const key = toKey(label);
    if (fields.some((f) => f.key === key)) {
      window.alert(t.dynamicFields.duplicateAlert(key));
      return;
    }
    const next: DynamicField[] = [
      ...fields,
      {
        id: `local-${Date.now()}`,
        label: label.trim(),
        key,
        type,
        description: description.trim() || undefined,
        required,
        position: fields.length,
        enabled: true,
      },
    ];
    onChange(next);
    setLabel('');
    setType('TEXT');
    setRequired(false);
    setDescription('');
  }

  function remove(id: string) {
    onChange(
      fields
        .filter((f) => f.id !== id)
        .map((f, i) => ({ ...f, position: i })),
    );
  }

  function move(id: string, dir: -1 | 1) {
    const idx = fields.findIndex((f) => f.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next.map((f, i) => ({ ...f, position: i })));
  }

  return (
    <Card
      title={t.dynamicFields.title}
      hint={t.dynamicFields.hint}
      actions={
        <span className="text-xs text-[#98A2B3]">
          {t.dynamicFields.activeCount(fields.filter((f) => f.enabled).length)}
        </span>
      }
    >
      <div className="space-y-3">
        {fields.length === 0 && (
          <p className="rounded-lg bg-[#FAFAFA] p-3 text-xs text-[#667085]">
            {t.dynamicFields.empty}
          </p>
        )}

        {fields.map((field) => (
          <div
            key={field.id}
            className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
              field.enabled ? 'border-[#E5E7EB]' : 'border-dashed border-[#98A2B3] opacity-60'
            }`}
          >
            <div>
              <p className="text-sm font-medium text-[#111111]">
                {field.label}
                {field.required && <span className="mr-1 text-danger-600">*</span>}
              </p>
              <p className="text-xs text-[#667085]" dir="ltr">
                [{field.key}] · {t.dynamicFields.fieldTypes[field.type.toLowerCase() as keyof typeof t.dynamicFields.fieldTypes]}
              </p>
              {field.description && (
                <p className="mt-0.5 text-xs text-[#98A2B3]">{field.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button className="rounded p-1 text-[#98A2B3] hover:bg-[#FAFAFA]" onClick={() => move(field.id, -1)}>
                <ArrowUp className="h-4 w-4" />
              </button>
              <button className="rounded p-1 text-[#98A2B3] hover:bg-[#FAFAFA]" onClick={() => move(field.id, 1)}>
                <ArrowDown className="h-4 w-4" />
              </button>
              <button
                className="rounded p-1 text-danger-600 hover:bg-danger-50"
                onClick={() => remove(field.id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        <div className="grid grid-cols-1 gap-3 rounded-lg border border-dashed border-brand-300 bg-brand-50/40 p-3 sm:grid-cols-4">
          <Field label={t.dynamicFields.labelField}>
            <Input
              value={label}
              placeholder={t.dynamicFields.labelPlaceholder}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <Field label={t.dynamicFields.typeField}>
            <Select value={type} onChange={(e) => setType(e.target.value as DynamicFieldType)}>
              {FIELD_TYPES.map((ft) => (
                <option key={ft.value} value={ft.value}>
                  {t.dynamicFields.fieldTypes[ft.value.toLowerCase() as keyof typeof t.dynamicFields.fieldTypes]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.dynamicFields.descriptionField}>
            <Input
              value={description}
              placeholder={t.dynamicFields.descriptionPlaceholder}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <div className="flex items-end justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-[#667085]">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="h-4 w-4 accent-brand-500"
              />
              {t.dynamicFields.required}
            </label>
            <Button size="sm" onClick={addField}>
              <Plus className="h-4 w-4" />
              {t.dynamicFields.add}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
