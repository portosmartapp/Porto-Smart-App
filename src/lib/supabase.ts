import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Language } from '../types/platform';

export function normalizeSupabaseUrl(rawUrl: string | undefined): string {
  const trimmed = rawUrl?.trim() || '';
  if (!trimmed) return '';
  return trimmed.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
}

const env = (import.meta as { env?: Record<string, string | undefined> }).env;
const supabaseUrl = normalizeSupabaseUrl(env?.VITE_SUPABASE_URL);
const supabaseAnonKey = env?.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('YOUR_PROJECT_ID') &&
    !supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY')
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export type SupabaseErrorKind =
  | 'missing_tables'
  | 'conflict'
  | 'permission'
  | 'auth'
  | 'network'
  | 'unknown';

export interface ClassifiedSupabaseError {
  kind: SupabaseErrorKind;
  message: string;
  rawCode?: string;
}

export function classifySupabaseError(
  err: unknown,
  lang: Language = 'ar'
): ClassifiedSupabaseError {
  const isAr = lang === 'ar';
  const e = (err && typeof err === 'object' ? err : {}) as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
  const code = String(e.code || '').toUpperCase();
  const rawMessage = String(e.message || err || '');
  const lower = `${rawMessage} ${e.details || ''} ${e.hint || ''}`.toLowerCase();

  // Missing relation / PostgREST schema cache miss (project currently has No tables)
  if (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST204' ||
    lower.includes('could not find the table') ||
    (lower.includes('relation') && lower.includes('does not exist'))
  ) {
    return {
      kind: 'missing_tables',
      rawCode: code || '42P01',
      message: isAr
        ? 'جداول قاعدة البيانات غير منشأة بعد في مشروع Supabase الحالي (No tables). يرجى تهيئة الجداول في Supabase أو استخدام النسخة التجريبية المعزولة.'
        : 'Database tables have not been created yet in your Supabase project (No tables). Provision the schema in Supabase or open the isolated Demo Mode.',
    };
  }

  // Concurrent / trigger double-booking conflict
  if (
    code === '23P01' ||
    code === 'P0001' ||
    lower.includes('double booking') ||
    lower.includes('overlapping') ||
    lower.includes('bookings_no_overlap')
  ) {
    return {
      kind: 'conflict',
      rawCode: code || '23P01',
      message: isAr
        ? 'عذراً، هذا الشاليه محجوز بالفعل في نفس التواريخ (تم المنع ذرياً من قاعدة البيانات لمنع الحجز المزدوج).'
        : 'Double booking rejected: This chalet is already reserved for overlapping dates.',
    };
  }

  // RLS / Permission error
  if (
    code === '42501' ||
    code === 'PGRST301' ||
    lower.includes('row-level security') ||
    lower.includes('permission denied') ||
    lower.includes('not allowed')
  ) {
    return {
      kind: 'permission',
      rawCode: code || '42501',
      message: isAr
        ? 'ليس لديك صلاحية تنفيذ هذه العملية وفق سياسات الحماية (RLS).'
        : 'Permission denied by database Row Level Security (RLS) policy.',
    };
  }

  // Auth / session errors
  if (
    lower.includes('jwt') ||
    lower.includes('invalid login credentials') ||
    lower.includes('not authenticated') ||
    lower.includes('session')
  ) {
    return {
      kind: 'auth',
      rawCode: code,
      message: isAr
        ? 'انتهت الجلسة أو بيانات الدخول غير صحيحة. يرجى تسجيل الدخول مجدداً.'
        : rawMessage || 'Authentication required or invalid credentials.',
    };
  }

  // Network / fetch errors
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed')
  ) {
    return {
      kind: 'network',
      rawCode: code,
      message: isAr
        ? 'تعذر الاتصال بخادم Supabase. تحقق من الاتصال بالإنترنت وإعدادات VITE_SUPABASE_URL.'
        : 'Unable to reach Supabase server. Verify network connectivity and VITE_SUPABASE_URL.',
    };
  }

  return {
    kind: 'unknown',
    rawCode: code || undefined,
    message:
      rawMessage ||
      (isAr ? 'حدث خطأ غير متوقع أثناء الاتصال بقاعدة البيانات.' : 'Unexpected database error.'),
  };
}
