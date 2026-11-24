import React from 'react';
import { X, CheckCircle2, Database, Shield, Terminal } from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabase';
import { Language } from '../types/platform';

interface SupabaseSetupModalProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
}

export const SupabaseSetupModal: React.FC<SupabaseSetupModalProps> = ({
  open,
  onClose,
  lang,
}) => {
  if (!open) return null;

  const isAr = lang === 'ar';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-xl border border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-cyan-800" />
            <h3 className="text-base font-bold text-slate-900">
              {isAr
                ? 'دليل ربط قاعدة بيانات Supabase (الخطة المجانية)'
                : 'Connect Supabase Free Plan (PostgreSQL + Auth)'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 text-sm text-slate-700 leading-relaxed">
          <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <span className="font-medium text-slate-800">
              {isAr ? 'حالة الاتصال الحالية:' : 'Current Connection Status:'}
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-xs">
              <CheckCircle2
                className={`w-4 h-4 ${isSupabaseConfigured ? 'text-emerald-600' : 'text-amber-600'}`}
              />
              {isSupabaseConfigured
                ? isAr
                  ? 'متصل بـ Supabase'
                  : 'Connected to Supabase'
                : isAr
                ? 'وضع العرض التجريبي (لم يتم إدخال مفاتيح .env بعد)'
                : 'Demo Mode (Supabase env vars not yet set)'}
            </span>
          </div>

          <ol className="space-y-4 list-decimal list-inside">
            <li>
              <strong className="text-slate-900">
                {isAr ? 'أنشئ مشروعاً مجانياً على Supabase:' : 'Create a Free Supabase Project:'}
              </strong>{' '}
              {isAr
                ? 'سجل الدخول إلى supabase.com وأنشئ مشروعاً جديداً على الخطة المجانية (0 دولار شهرياً، 500MB PostgreSQL + 50,000 مستخدم شهرياً).'
                : 'Sign up at supabase.com and create a new project on the Free Tier ($0/month, 500MB PostgreSQL + 50,000 MAUs).'}
            </li>

            <li>
              <strong className="text-slate-900">
                {isAr ? 'شغّل ملف الجداول وسياسات الحماية:' : 'Run Database Schema & RLS Policies:'}
              </strong>{' '}
              {isAr
                ? 'افتح SQL Editor في لوحة تحكم Supabase وانسخ محتوى ملف supabase/schema.production.sql ثم اضغط Run لإنشاء الـ 19 جدولاً وقيد منع الحجز المزدوج المتزامن وسجل المدفوعات غير القابل للتعديل وعزل بيانات الملاك.'
                : 'Open the SQL Editor in Supabase, paste the contents of supabase/schema.production.sql, and click Run to create all 19 tables, atomic double-booking protection, immutable payment ledger, and owner-isolation RLS policies.'}
            </li>

            <li>
              <strong className="text-slate-900">
                {isAr ? 'إضافة البيانات التجريبية (اختياري):' : 'Load 22-Chalet Demo Seed (Optional):'}
              </strong>{' '}
              {isAr
                ? 'شغّل محتوى ملف supabase/seed.sql لإضافة الـ 22 شاليه والملاك والأرصدة التجريبية (مميزة بعلامة is_demo = true).'
                : 'Run supabase/seed.sql in the SQL Editor to populate the 22 sample chalets, owners, and utilities (clearly flagged is_demo = true).'}
            </li>

            <li>
              <strong className="text-slate-900">
                {isAr ? 'إعداد متغيرات البيئة:' : 'Set Environment Variables:'}
              </strong>{' '}
              {isAr
                ? 'من Project Settings → API في Supabase انسخ Project URL و anon public key وأضفهما إلى إعدادات البيئة (.env أو Secrets):'
                : 'From Project Settings → API in Supabase, copy your Project URL and anon public key into your .env / AI Studio Secrets:'}
              <pre className="mt-2 p-3 rounded-lg bg-slate-900 text-slate-100 text-xs font-mono-num overflow-x-auto dir-ltr text-left">
{`VITE_SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"`}
              </pre>
            </li>

            <li>
              <strong className="text-slate-900">
                {isAr ? 'إضافة حسابات المستخدمين والأدوار:' : 'Create Auth Users & Assign Roles:'}
              </strong>{' '}
              {isAr
                ? 'أنشئ المستخدمين من Authentication → Users ثم أضف صفاً في جدول public.users يربط id المستخدم بدوره (super_admin, manager, owner, housekeeping, maintenance, reception) وبمعرّف المالك owner_id عند الحاجة.'
                : 'Create users in Authentication → Users, then insert a matching row in public.users linking their auth id to their role and optional owner_id.'}
            </li>
          </ol>

          <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-cyan-50 border border-cyan-200 text-xs text-cyan-950">
            <Shield className="w-4 h-4 shrink-0 mt-0.5 text-cyan-800" />
            <span>
              {isAr
                ? 'جميع البيانات التجريبية في هذا النظام تحمل وسم is_demo = true ويمكن حذفها بأمر SQL واحد عند البدء بالتشغيل الفعلي.'
                : 'All sample records carry is_demo = true and can be cleared with a single SQL cleanup before going live.'}
            </span>
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer inline-flex items-center gap-1.5"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>{isAr ? 'فهمت، متابعة' : 'Got it, Continue'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
