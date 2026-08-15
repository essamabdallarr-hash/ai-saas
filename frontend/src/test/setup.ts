import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// تنظيف DOM بين الاختبارات (لا نستخدم globals في إعداد vitest)
afterEach(() => cleanup());

// jsdom لا ينفّذ scrollIntoView — نمنعه من إحداث ضوضاء/أخطاء في الاختبارات
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
