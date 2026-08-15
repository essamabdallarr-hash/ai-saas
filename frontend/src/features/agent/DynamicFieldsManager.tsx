import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import type { DynamicField, DynamicFieldType } from '@/lib/types';

const FIELD_TYPES: Array<{ value: DynamicFieldType; label: string }> = [
  { value: 'TEXT', label: 'نص' },
  { value: 'NUMBER', label: 'رقم' },
  { value: 'DATE', label: 'تاريخ' },
  { value: 'BOOLEAN', label: 'نعم/لا' },
  { value: 'SELECT', label: 'اختيار' },
  { value: 'CURRENCY', label: 'عملة' },
];

function toKey(label: string): string {
  const latin = label
    .replace(/[^\w\s\u0600-\u06FF]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase();
  // لأسماء عربية نولّد مفتاحًا مقروءًا بالحروف اللاتينية عند الإمكان، وإلا نستخدم الإنجليزية
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
  const [label, setLabel] = useState('');
  const [type, setType] = useState<DynamicFieldType>('TEXT');
  const [required, setRequired] = useState(false);
  const [description, setDescription] = useState('');

  function addField() {
    if (!label.trim()) return;
    const key = toKey(label);
    if (fields.some((f) => f.key === key)) {
      window.alert(`المفتاح "${key}" موجود مسبقًا — عدّل التسمية أو غيّرها.`);
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
      title="الحقول الديناميكية (Data Extraction)"
      hint="البيانات التي يستخرجها البوت في نهاية كل مكالمة"
      actions={
        <span className="text-xs text-slate-400">
          {fields.filter((f) => f.enabled).length} حقل نشط
        </span>
      }
    >
      <div className="space-y-3">
        {fields.length === 0 && (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            لا توجد حقول بعد. أضف ما تريد أن يستخرجه البوت، مثال: الميزانية، موعد الحجز، نتيجة التفاوض.
          </p>
        )}

        {fields.map((field) => (
          <div
            key={field.id}
            className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
              field.enabled ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-60'
            }`}
          >
            <div>
              <p className="text-sm font-medium text-slate-800">
                {field.label}
                {field.required && <span className="mr-1 text-danger-600">*</span>}
              </p>
              <p className="text-xs text-slate-500" dir="ltr">
                [{field.key}] · {FIELD_TYPES.find((t) => t.value === field.type)?.label}
              </p>
              {field.description && (
                <p className="mt-0.5 text-xs text-slate-400">{field.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => move(field.id, -1)}>
                <ArrowUp className="h-4 w-4" />
              </button>
              <button className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => move(field.id, 1)}>
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

        {/* نموذج إضافة حقل */}
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-dashed border-brand-300 bg-brand-50/40 p-3 sm:grid-cols-4">
          <Field label="التسمية">
            <Input
              value={label}
              placeholder="مثال: الميزانية"
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <Field label="النوع">
            <Select value={type} onChange={(e) => setType(e.target.value as DynamicFieldType)}>
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="وصف للبوت">
            <Input
              value={description}
              placeholder="الحد الأقصى الذي يقبله العميل"
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <div className="flex items-end justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="h-4 w-4 accent-brand-600"
              />
              إجباري
            </label>
            <Button size="sm" onClick={addField}>
              <Plus className="h-4 w-4" />
              إضافة
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
