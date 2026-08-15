# استخدام بيئة Node.js خفيفة
FROM node:18-alpine

# تحديد مجلد العمل
WORKDIR /app

# نسخ مجلد الباك إند فقط إلى الحاوية
COPY backend/ ./backend/

# الدخول إلى مجلد الباك إند
WORKDIR /app/backend

# تثبيت الحزم
RUN npm install

# تهيئة قاعدة البيانات (Prisma)
RUN npx prisma generate

# بناء المشروع
RUN npm run build

# تشغيل السيرفر
CMD ["npm", "start"]
