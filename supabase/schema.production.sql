-- =============================================================================
-- Porto El Sokhna Smart Chalet Management Platform
-- Production-Hardened PostgreSQL Schema, Atomic Double-Booking Guard,
-- Immutable Financial Ledger Triggers, Row Level Security (RLS), and Grants
-- Target: Supabase Free Plan (PostgreSQL 15+)
--
-- IMPORTANT:
-- - Does NOT insert any demo/seed data.
-- - Does NOT replace supabase/schema.sql or modify supabase/seed.sql.
-- - Safe for fresh provisioning and idempotent policy/trigger updates.
--   (See migration notes for pre-existing tables with legacy data.)
-- =============================================================================

-- Required extensions (available on Supabase Free Plan)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- =============================================================================
-- 1. TABLES (All 19 Application Tables Matching src/types/platform.ts & platformStore.ts)
-- =============================================================================

-- 1.1 OWNERS
CREATE TABLE IF NOT EXISTS public.owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  full_name_ar TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  national_id TEXT,
  bank_account TEXT,
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.2 USERS (Profile & RBAC mapped to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  full_name_ar TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN (
    'super_admin',
    'manager',
    'owner',
    'housekeeping',
    'maintenance',
    'reception',
    'guest'
  )),
  owner_id UUID REFERENCES public.owners(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.3 CHALETS
CREATE TABLE IF NOT EXISTS public.chalets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chalet_number TEXT UNIQUE NOT NULL,
  owner_id UUID NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  bedrooms INTEGER NOT NULL CHECK (bedrooms >= 1),
  bathrooms INTEGER NOT NULL CHECK (bathrooms >= 1),
  max_guests INTEGER NOT NULL CHECK (max_guests >= 1),
  floor TEXT NOT NULL,
  view_type TEXT NOT NULL,
  view_type_ar TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN (
    'available',
    'occupied',
    'maintenance',
    'cleaning',
    'inactive'
  )),
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  description TEXT NOT NULL DEFAULT '',
  description_ar TEXT NOT NULL DEFAULT '',
  amenities JSONB NOT NULL DEFAULT '[]'::jsonb,
  nightly_price NUMERIC(10, 2) NOT NULL CHECK (nightly_price >= 0),
  owner_pct NUMERIC(5, 2) NOT NULL DEFAULT 75.00 CHECK (owner_pct >= 0 AND owner_pct <= 100),
  management_pct NUMERIC(5, 2) NOT NULL DEFAULT 25.00 CHECK (management_pct >= 0 AND management_pct <= 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pct_sum_100 CHECK (owner_pct + management_pct = 100)
);

-- 1.4 GUESTS
CREATE TABLE IF NOT EXISTS public.guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  nationality TEXT NOT NULL DEFAULT 'Egyptian',
  id_passport TEXT,
  email TEXT,
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.5 BOOKINGS
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code TEXT UNIQUE NOT NULL,
  chalet_id UUID NOT NULL REFERENCES public.chalets(id) ON DELETE RESTRICT,
  guest_id UUID REFERENCES public.guests(id) ON DELETE SET NULL,
  guest_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  nationality TEXT NOT NULL DEFAULT 'Egyptian',
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  num_guests INTEGER NOT NULL CHECK (num_guests >= 1),
  nights INTEGER GENERATED ALWAYS AS (check_out - check_in) STORED,
  nightly_price NUMERIC(10, 2) NOT NULL CHECK (nightly_price >= 0),
  total_value NUMERIC(12, 2) GENERATED ALWAYS AS ((check_out - check_in) * nightly_price) STORED,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN (
    'pending',
    'partial',
    'paid',
    'refunded'
  )),
  booking_source TEXT NOT NULL DEFAULT 'direct' CHECK (booking_source IN (
    'direct',
    'facebook',
    'instagram',
    'website',
    'booking_com',
    'airbnb',
    'travel_agency',
    'other'
  )),
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN (
    'upcoming',
    'checked_in',
    'checked_out',
    'cancelled'
  )),
  notes TEXT DEFAULT '',
  id_passport TEXT DEFAULT '',
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  deposit_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),
  inspection_notes TEXT DEFAULT '',
  damage_report TEXT DEFAULT '',
  outstanding_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (outstanding_amount >= 0),
  payment_due_date DATE,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_dates CHECK (check_out > check_in)
);

-- Atomic concurrency-safe exclusion constraint (SQLSTATE 23P01 on race conflict)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_no_overlap'
      AND conrelid = 'public.bookings'::regclass
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_no_overlap
      EXCLUDE USING gist (
        chalet_id WITH =,
        daterange(check_in, check_out, '[)') WITH &&
      )
      WHERE (status <> 'cancelled');
  END IF;
END $$;

-- 1.6 PAYMENTS (Append-Only Financial Ledger)
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE RESTRICT,
  owner_id UUID REFERENCES public.owners(id) ON DELETE RESTRICT,
  payment_type TEXT NOT NULL CHECK (payment_type IN (
    'guest_payment',
    'owner_payout',
    'deposit',
    'refund',
    'correction'
  )),
  entry_direction TEXT NOT NULL DEFAULT 'inflow' CHECK (entry_direction IN (
    'inflow',
    'outflow',
    'adjustment'
  )),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer' CHECK (payment_method IN (
    'cash',
    'bank_transfer',
    'instapay',
    'mobile_wallet',
    'card_manual',
    'other'
  )),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN (
    'confirmed',
    'pending_gateway',
    'refunded',
    'voided'
  )),
  receipt_number TEXT UNIQUE,
  reference_no TEXT,
  idempotency_key TEXT UNIQUE,
  parent_payment_id UUID REFERENCES public.payments(id) ON DELETE RESTRICT,
  correction_reason TEXT DEFAULT '',
  recorded_by_name TEXT DEFAULT '',
  gateway_provider TEXT DEFAULT NULL,
  gateway_status TEXT DEFAULT 'not_activated',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false
);

-- 1.7 PAYMENT AUDIT LOGS (Immutable Trail; ON DELETE RESTRICT protects audit integrity)
CREATE TABLE IF NOT EXISTS public.payment_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN (
    'payment_recorded',
    'deposit_recorded',
    'refund_issued',
    'correction_applied',
    'ledger_synced',
    'receipt_generated'
  )),
  previous_amount NUMERIC(12, 2) DEFAULT 0,
  new_amount NUMERIC(12, 2) NOT NULL,
  reason TEXT DEFAULT '',
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.8 EXPENSES
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chalet_id UUID NOT NULL REFERENCES public.chalets(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'electricity',
    'water',
    'housekeeping',
    'maintenance',
    'other'
  )),
  description TEXT NOT NULL,
  description_ar TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.9 UTILITIES
CREATE TABLE IF NOT EXISTS public.utilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chalet_id UUID UNIQUE NOT NULL REFERENCES public.chalets(id) ON DELETE CASCADE,
  electricity_balance NUMERIC(10, 2) NOT NULL DEFAULT 0,
  water_balance NUMERIC(10, 2) NOT NULL DEFAULT 0,
  electricity_threshold NUMERIC(10, 2) NOT NULL DEFAULT 300 CHECK (electricity_threshold >= 0),
  water_threshold NUMERIC(10, 2) NOT NULL DEFAULT 150 CHECK (water_threshold >= 0),
  last_electricity_recharge NUMERIC(10, 2) DEFAULT 0 CHECK (last_electricity_recharge >= 0),
  last_electricity_date TIMESTAMPTZ,
  last_water_recharge NUMERIC(10, 2) DEFAULT 0 CHECK (last_water_recharge >= 0),
  last_water_date TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.10 UTILITY TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.utility_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chalet_id UUID NOT NULL REFERENCES public.chalets(id) ON DELETE CASCADE,
  utility_type TEXT NOT NULL CHECK (utility_type IN ('electricity', 'water')),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('recharge', 'consumption')),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  balance_after NUMERIC(10, 2) NOT NULL,
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false
);

-- 1.11 HOUSEKEEPING
CREATE TABLE IF NOT EXISTS public.housekeeping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chalet_id UUID NOT NULL REFERENCES public.chalets(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK (task_type IN (
    'checkout_cleaning',
    'deep_cleaning',
    'linen_replacement',
    'inspection'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'in_progress',
    'completed',
    'needs_inspection'
  )),
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_name TEXT NOT NULL DEFAULT '',
  notes TEXT DEFAULT '',
  scheduled_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.12 MAINTENANCE
CREATE TABLE IF NOT EXISTS public.maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chalet_id UUID NOT NULL REFERENCES public.chalets(id) ON DELETE CASCADE,
  problem_type TEXT NOT NULL,
  description TEXT NOT NULL,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN (
    'low',
    'medium',
    'high',
    'emergency'
  )),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'assigned',
    'in_progress',
    'completed',
    'closed'
  )),
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  technician_name TEXT DEFAULT '',
  cost NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT false
);

-- 1.13 OFFERS
CREATE TABLE IF NOT EXISTS public.offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN (
    'restaurant',
    'cafe',
    'supermarket',
    'resort_service'
  )),
  business_name TEXT NOT NULL,
  business_name_ar TEXT NOT NULL,
  title TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  discount TEXT NOT NULL,
  description TEXT NOT NULL,
  description_ar TEXT NOT NULL,
  phone TEXT NOT NULL,
  availability TEXT NOT NULL,
  image_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.14 NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  message TEXT NOT NULL,
  message_ar TEXT NOT NULL,
  target_role TEXT,
  target_owner_id UUID REFERENCES public.owners(id) ON DELETE CASCADE,
  chalet_id UUID REFERENCES public.chalets(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.15 NOTIFICATION SETTINGS
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  providers_activated BOOLEAN NOT NULL DEFAULT false,
  simulation_mode BOOLEAN NOT NULL DEFAULT true,
  sms_provider_name TEXT NOT NULL DEFAULT 'Unconfigured (Disabled)',
  email_provider_name TEXT NOT NULL DEFAULT 'Unconfigured (Disabled)',
  sender_name TEXT NOT NULL DEFAULT 'Free Rent Tours — Porto El Sokhna',
  quiet_hours_start TEXT DEFAULT '23:00',
  quiet_hours_end TEXT DEFAULT '08:00',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.16 NOTIFICATION TEMPLATES
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'booking',
    'payment',
    'operations',
    'utility',
    'owner'
  )),
  title_en TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  email_subject_en TEXT NOT NULL,
  email_subject_ar TEXT NOT NULL,
  email_body_en TEXT NOT NULL,
  email_body_ar TEXT NOT NULL,
  sms_body_en TEXT NOT NULL,
  sms_body_ar TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  default_sms BOOLEAN NOT NULL DEFAULT false,
  default_email BOOLEAN NOT NULL DEFAULT true,
  default_in_app BOOLEAN NOT NULL DEFAULT true,
  is_demo BOOLEAN NOT NULL DEFAULT false
);

-- 1.17 NOTIFICATION RECIPIENTS
CREATE TABLE IF NOT EXISTS public.notification_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  full_name_ar TEXT NOT NULL,
  role TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  preferred_lang TEXT NOT NULL DEFAULT 'ar' CHECK (preferred_lang IN ('ar', 'en')),
  sms_opt_in BOOLEAN NOT NULL DEFAULT false,
  email_opt_in BOOLEAN NOT NULL DEFAULT true,
  in_app_opt_in BOOLEAN NOT NULL DEFAULT true,
  owner_id UUID REFERENCES public.owners(id) ON DELETE SET NULL,
  chalet_id UUID REFERENCES public.chalets(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.18 NOTIFICATION DELIVERIES
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'in_app')),
  recipient_id UUID REFERENCES public.notification_recipients(id) ON DELETE SET NULL,
  recipient_name TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'ar' CHECK (lang IN ('ar', 'en')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'queued_disabled',
    'simulated',
    'sent',
    'failed'
  )),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  error_reason TEXT DEFAULT '',
  dedup_key TEXT UNIQUE NOT NULL,
  related_entity_id TEXT,
  owner_id UUID REFERENCES public.owners(id) ON DELETE SET NULL,
  chalet_id UUID REFERENCES public.chalets(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.19 NOTIFICATION PREFERENCES
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  preferred_lang TEXT NOT NULL DEFAULT 'ar' CHECK (preferred_lang IN ('ar', 'en')),
  UNIQUE (user_id, event_key)
);

-- =============================================================================
-- 2. INDEXES (Foreign Keys, Filtering, & Performance)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_users_owner_id ON public.users(owner_id);
CREATE INDEX IF NOT EXISTS idx_chalets_owner_id ON public.chalets(owner_id);
CREATE INDEX IF NOT EXISTS idx_bookings_chalet_dates ON public.bookings(chalet_id, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_guest_id ON public.bookings(guest_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON public.payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_owner ON public.payments(owner_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON public.payments(paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_audit_payment ON public.payment_audit_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_audit_booking ON public.payment_audit_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_expenses_chalet_date ON public.expenses(chalet_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_utility_tx_chalet_date ON public.utility_transactions(chalet_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_housekeeping_chalet_status ON public.housekeeping(chalet_id, status);
CREATE INDEX IF NOT EXISTS idx_housekeeping_assigned ON public.housekeeping(assigned_to);
CREATE INDEX IF NOT EXISTS idx_maintenance_chalet_status ON public.maintenance(chalet_id, status);
CREATE INDEX IF NOT EXISTS idx_maintenance_assigned ON public.maintenance(assigned_to);
CREATE INDEX IF NOT EXISTS idx_notifications_scope ON public.notifications(target_role, target_owner_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_recipients_owner ON public.notification_recipients(owner_id);
CREATE INDEX IF NOT EXISTS idx_notif_deliveries_owner_created ON public.notification_deliveries(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON public.notification_preferences(user_id);

-- =============================================================================
-- 3. HARDENED SECURITY DEFINER HELPERS & INTEGRITY TRIGGERS
-- =============================================================================

-- Active user role lookup (checks is_active = true + fixed search_path)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role
  FROM public.users
  WHERE id = auth.uid()
    AND is_active = true;
$$;

-- Active user owner_id lookup (checks is_active = true + fixed search_path)
CREATE OR REPLACE FUNCTION public.current_user_owner_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT owner_id
  FROM public.users
  WHERE id = auth.uid()
    AND is_active = true;
$$;

-- Double-booking trigger with advisory transaction lock (works in tandem with EXCLUDE USING gist)
CREATE OR REPLACE FUNCTION public.prevent_double_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status <> 'cancelled' THEN
    PERFORM pg_advisory_xact_lock(hashtext('booking_chalet:' || NEW.chalet_id::text));

    IF EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.chalet_id = NEW.chalet_id
        AND b.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND b.status <> 'cancelled'
        AND b.check_in < NEW.check_out
        AND b.check_out > NEW.check_in
    ) THEN
      RAISE EXCEPTION 'Double booking detected: Chalet already reserved for overlapping dates.'
        USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_double_booking ON public.bookings;
CREATE TRIGGER trg_prevent_double_booking
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.prevent_double_booking();

-- Immutable Ledger Trigger: Block UPDATE and DELETE on payments & payment_audit_logs
CREATE OR REPLACE FUNCTION public.prevent_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Financial ledger records (% table) are immutable and cannot be updated or deleted. Issue a refund or correction entry instead.', TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_immutable ON public.payments;
CREATE TRIGGER trg_payments_immutable
BEFORE UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.prevent_ledger_mutation();

DROP TRIGGER IF EXISTS trg_payment_audit_immutable ON public.payment_audit_logs;
CREATE TRIGGER trg_payment_audit_immutable
BEFORE UPDATE OR DELETE ON public.payment_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_ledger_mutation();

-- Server-side Refund Ceiling Validation on payments INSERT
CREATE OR REPLACE FUNCTION public.validate_payment_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  net_collected NUMERIC(12, 2);
BEGIN
  IF NEW.payment_type = 'refund' AND NEW.booking_id IS NOT NULL THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN p.status = 'voided' THEN 0
        WHEN p.payment_type IN ('guest_payment', 'deposit') THEN p.amount
        WHEN p.payment_type = 'refund' THEN -p.amount
        WHEN p.payment_type = 'correction' AND p.entry_direction = 'inflow' THEN p.amount
        WHEN p.payment_type = 'correction' AND p.entry_direction = 'outflow' THEN -p.amount
        ELSE 0
      END
    ), 0)
    INTO net_collected
    FROM public.payments p
    WHERE p.booking_id = NEW.booking_id;

    IF NEW.amount <= 0 OR NEW.amount > net_collected THEN
      RAISE EXCEPTION 'Refund amount (%) exceeds net collected booking balance (%).', NEW.amount, net_collected
        USING ERRCODE = '22003';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_payment_insert ON public.payments;
CREATE TRIGGER trg_validate_payment_insert
BEFORE INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.validate_payment_insert();

-- Column-level Guard Trigger on public.chalets: reception & housekeeping can ONLY update status
CREATE OR REPLACE FUNCTION public.guard_chalet_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_role := public.current_user_role();
  IF v_role IN ('super_admin', 'manager') THEN
    RETURN NEW;
  END IF;

  -- Block non-managers from altering immutable properties, pricing, ownership, or splits
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.chalet_number IS DISTINCT FROM OLD.chalet_number
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.bedrooms IS DISTINCT FROM OLD.bedrooms
     OR NEW.bathrooms IS DISTINCT FROM OLD.bathrooms
     OR NEW.max_guests IS DISTINCT FROM OLD.max_guests
     OR NEW.floor IS DISTINCT FROM OLD.floor
     OR NEW.view_type IS DISTINCT FROM OLD.view_type
     OR NEW.view_type_ar IS DISTINCT FROM OLD.view_type_ar
     OR NEW.photos IS DISTINCT FROM OLD.photos
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.description_ar IS DISTINCT FROM OLD.description_ar
     OR NEW.amenities IS DISTINCT FROM OLD.amenities
     OR NEW.nightly_price IS DISTINCT FROM OLD.nightly_price
     OR NEW.owner_pct IS DISTINCT FROM OLD.owner_pct
     OR NEW.management_pct IS DISTINCT FROM OLD.management_pct
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
    RAISE EXCEPTION 'Role % is only permitted to update chalet status.', v_role
      USING ERRCODE = '42501';
  END IF;

  IF v_role = 'reception' AND NEW.status NOT IN ('available', 'occupied', 'cleaning') THEN
    RAISE EXCEPTION 'Reception cannot set chalet status to %.', NEW.status
      USING ERRCODE = '42501';
  END IF;

  IF v_role = 'housekeeping' AND NEW.status NOT IN ('available', 'cleaning') THEN
    RAISE EXCEPTION 'Housekeeping can only mark chalets available or cleaning.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_chalet_update ON public.chalets;
CREATE TRIGGER trg_guard_chalet_update
BEFORE UPDATE ON public.chalets
FOR EACH ROW EXECUTE FUNCTION public.guard_chalet_update();

-- Column-level Guard Trigger on public.housekeeping for housekeeping staff
CREATE OR REPLACE FUNCTION public.guard_housekeeping_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_role := public.current_user_role();
  IF v_role = 'housekeeping' THEN
    IF NEW.chalet_id IS DISTINCT FROM OLD.chalet_id
       OR NEW.task_type IS DISTINCT FROM OLD.task_type
       OR NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
       OR NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
      RAISE EXCEPTION 'Housekeeping staff can only update task status, notes, and completion timestamp.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_housekeeping_update ON public.housekeeping;
CREATE TRIGGER trg_guard_housekeeping_update
BEFORE UPDATE ON public.housekeeping
FOR EACH ROW EXECUTE FUNCTION public.guard_housekeeping_update();

-- Column-level Guard Trigger on public.maintenance for maintenance technicians
CREATE OR REPLACE FUNCTION public.guard_maintenance_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_role := public.current_user_role();
  IF v_role = 'maintenance' THEN
    IF NEW.chalet_id IS DISTINCT FROM OLD.chalet_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
      RAISE EXCEPTION 'Maintenance staff cannot alter ticket chalet reference or audit timestamps.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_maintenance_update ON public.maintenance;
CREATE TRIGGER trg_guard_maintenance_update
BEFORE UPDATE ON public.maintenance
FOR EACH ROW EXECUTE FUNCTION public.guard_maintenance_update();

-- Column-level Guard Trigger on public.notifications: non-managers can only mark is_read = true
CREATE OR REPLACE FUNCTION public.guard_notification_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_role := public.current_user_role();
  IF v_role IN ('super_admin', 'manager') THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.title_ar IS DISTINCT FROM OLD.title_ar
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.message_ar IS DISTINCT FROM OLD.message_ar
     OR NEW.target_role IS DISTINCT FROM OLD.target_role
     OR NEW.target_owner_id IS DISTINCT FROM OLD.target_owner_id
     OR NEW.chalet_id IS DISTINCT FROM OLD.chalet_id
     OR NEW.is_demo IS DISTINCT FROM OLD.is_demo
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.is_read IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Only marking a notification as read is permitted for your role.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_notification_update ON public.notifications;
CREATE TRIGGER trg_guard_notification_update
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.guard_notification_update();

-- =============================================================================
-- 4. ENABLE ROW LEVEL SECURITY ON ALL 19 TABLES
-- =============================================================================

ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chalets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utility_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.housekeeping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 5. GRANULAR RLS POLICIES (Per-Command, Zero Over-Permissive Policies)
-- =============================================================================

-- 5.1 USERS
DROP POLICY IF EXISTS "users_self_read" ON public.users;
DROP POLICY IF EXISTS "users_admin_write" ON public.users;
DROP POLICY IF EXISTS "users_admin_insert" ON public.users;
DROP POLICY IF EXISTS "users_admin_update" ON public.users;
DROP POLICY IF EXISTS "users_admin_delete" ON public.users;

CREATE POLICY "users_self_read" ON public.users
  FOR SELECT USING (
    id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'manager')
  );
CREATE POLICY "users_admin_insert" ON public.users
  FOR INSERT WITH CHECK (public.current_user_role() = 'super_admin');
CREATE POLICY "users_admin_update" ON public.users
  FOR UPDATE USING (public.current_user_role() = 'super_admin')
  WITH CHECK (public.current_user_role() = 'super_admin');
CREATE POLICY "users_admin_delete" ON public.users
  FOR DELETE USING (public.current_user_role() = 'super_admin');

-- 5.2 OWNERS
DROP POLICY IF EXISTS "owners_isolated_read" ON public.owners;
DROP POLICY IF EXISTS "owners_admin_write" ON public.owners;
DROP POLICY IF EXISTS "owners_admin_insert" ON public.owners;
DROP POLICY IF EXISTS "owners_admin_update" ON public.owners;
DROP POLICY IF EXISTS "owners_admin_delete" ON public.owners;

CREATE POLICY "owners_isolated_read" ON public.owners
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception')
    OR id = public.current_user_owner_id()
  );
CREATE POLICY "owners_admin_insert" ON public.owners
  FOR INSERT WITH CHECK (public.current_user_role() IN ('super_admin', 'manager'));
CREATE POLICY "owners_admin_update" ON public.owners
  FOR UPDATE USING (public.current_user_role() IN ('super_admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'manager'));
CREATE POLICY "owners_admin_delete" ON public.owners
  FOR DELETE USING (public.current_user_role() IN ('super_admin', 'manager'));

-- 5.3 CHALETS
DROP POLICY IF EXISTS "chalets_isolated_read" ON public.chalets;
DROP POLICY IF EXISTS "chalets_admin_write" ON public.chalets;
DROP POLICY IF EXISTS "chalets_admin_insert" ON public.chalets;
DROP POLICY IF EXISTS "chalets_staff_update" ON public.chalets;
DROP POLICY IF EXISTS "chalets_admin_delete" ON public.chalets;

CREATE POLICY "chalets_isolated_read" ON public.chalets
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception', 'housekeeping', 'maintenance')
    OR owner_id = public.current_user_owner_id()
  );
CREATE POLICY "chalets_admin_insert" ON public.chalets
  FOR INSERT WITH CHECK (public.current_user_role() IN ('super_admin', 'manager'));
CREATE POLICY "chalets_staff_update" ON public.chalets
  FOR UPDATE USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception', 'housekeeping')
  )
  WITH CHECK (
    public.current_user_role() IN ('super_admin', 'manager', 'reception', 'housekeeping')
  );
CREATE POLICY "chalets_admin_delete" ON public.chalets
  FOR DELETE USING (public.current_user_role() IN ('super_admin', 'manager'));

-- 5.4 GUESTS (Staff only; completely isolated from owners, housekeeping, maintenance, guests)
DROP POLICY IF EXISTS "guests_staff_all" ON public.guests;
DROP POLICY IF EXISTS "guests_staff_read" ON public.guests;
DROP POLICY IF EXISTS "guests_staff_insert" ON public.guests;
DROP POLICY IF EXISTS "guests_staff_update" ON public.guests;
DROP POLICY IF EXISTS "guests_staff_delete" ON public.guests;

CREATE POLICY "guests_staff_read" ON public.guests
  FOR SELECT USING (public.current_user_role() IN ('super_admin', 'manager', 'reception'));
CREATE POLICY "guests_staff_insert" ON public.guests
  FOR INSERT WITH CHECK (public.current_user_role() IN ('super_admin', 'manager', 'reception'));
CREATE POLICY "guests_staff_update" ON public.guests
  FOR UPDATE USING (public.current_user_role() IN ('super_admin', 'manager', 'reception'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'manager', 'reception'));
CREATE POLICY "guests_staff_delete" ON public.guests
  FOR DELETE USING (public.current_user_role() IN ('super_admin', 'manager', 'reception'));

-- 5.5 BOOKINGS
DROP POLICY IF EXISTS "bookings_isolated_read" ON public.bookings;
DROP POLICY IF EXISTS "bookings_staff_write" ON public.bookings;
DROP POLICY IF EXISTS "bookings_staff_insert" ON public.bookings;
DROP POLICY IF EXISTS "bookings_staff_update" ON public.bookings;
DROP POLICY IF EXISTS "bookings_admin_delete" ON public.bookings;

CREATE POLICY "bookings_isolated_read" ON public.bookings
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception')
    OR chalet_id IN (SELECT id FROM public.chalets WHERE owner_id = public.current_user_owner_id())
  );
CREATE POLICY "bookings_staff_insert" ON public.bookings
  FOR INSERT WITH CHECK (public.current_user_role() IN ('super_admin', 'manager', 'reception'));
CREATE POLICY "bookings_staff_update" ON public.bookings
  FOR UPDATE USING (public.current_user_role() IN ('super_admin', 'manager', 'reception'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'manager', 'reception'));
CREATE POLICY "bookings_admin_delete" ON public.bookings
  FOR DELETE USING (public.current_user_role() IN ('super_admin', 'manager'));

-- 5.6 PAYMENTS (Append-Only: SELECT + INSERT only; UPDATE/DELETE blocked by RLS + REVOKE + Trigger)
DROP POLICY IF EXISTS "payments_isolated_read" ON public.payments;
DROP POLICY IF EXISTS "payments_staff_write" ON public.payments;
DROP POLICY IF EXISTS "payments_staff_insert" ON public.payments;

CREATE POLICY "payments_isolated_read" ON public.payments
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception')
    OR owner_id = public.current_user_owner_id()
    OR booking_id IN (
      SELECT b.id FROM public.bookings b
      JOIN public.chalets c ON b.chalet_id = c.id
      WHERE c.owner_id = public.current_user_owner_id()
    )
  );
CREATE POLICY "payments_staff_insert" ON public.payments
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('super_admin', 'manager')
    OR (
      public.current_user_role() = 'reception'
      AND payment_type IN ('guest_payment', 'deposit')
    )
  );

-- 5.7 PAYMENT AUDIT LOGS (Append-Only; visible to owner for both booking payments & owner payouts)
DROP POLICY IF EXISTS "payment_audit_isolated_read" ON public.payment_audit_logs;
DROP POLICY IF EXISTS "payment_audit_staff_write" ON public.payment_audit_logs;

CREATE POLICY "payment_audit_isolated_read" ON public.payment_audit_logs
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception')
    OR booking_id IN (
      SELECT b.id FROM public.bookings b
      JOIN public.chalets c ON b.chalet_id = c.id
      WHERE c.owner_id = public.current_user_owner_id()
    )
    OR payment_id IN (
      SELECT p.id FROM public.payments p
      WHERE p.owner_id = public.current_user_owner_id()
    )
  );
CREATE POLICY "payment_audit_staff_write" ON public.payment_audit_logs
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('super_admin', 'manager')
    OR (
      public.current_user_role() = 'reception'
      AND action IN ('payment_recorded', 'deposit_recorded', 'ledger_synced', 'receipt_generated')
    )
  );

-- 5.8 EXPENSES (Managers full CRUD; maintenance can insert electricity/water recharge expenses only)
DROP POLICY IF EXISTS "expenses_isolated_read" ON public.expenses;
DROP POLICY IF EXISTS "expenses_admin_write" ON public.expenses;
DROP POLICY IF EXISTS "expenses_staff_insert" ON public.expenses;
DROP POLICY IF EXISTS "expenses_admin_update" ON public.expenses;
DROP POLICY IF EXISTS "expenses_admin_delete" ON public.expenses;

CREATE POLICY "expenses_isolated_read" ON public.expenses
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager')
    OR chalet_id IN (SELECT id FROM public.chalets WHERE owner_id = public.current_user_owner_id())
  );
CREATE POLICY "expenses_staff_insert" ON public.expenses
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('super_admin', 'manager')
    OR (
      public.current_user_role() = 'maintenance'
      AND category IN ('electricity', 'water')
      AND (recorded_by IS NULL OR recorded_by = auth.uid())
    )
  );
CREATE POLICY "expenses_admin_update" ON public.expenses
  FOR UPDATE USING (public.current_user_role() IN ('super_admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'manager'));
CREATE POLICY "expenses_admin_delete" ON public.expenses
  FOR DELETE USING (public.current_user_role() IN ('super_admin', 'manager'));

-- 5.9 UTILITIES (Managers & maintenance can read & recharge; reception & owner read-only)
DROP POLICY IF EXISTS "utilities_isolated_read" ON public.utilities;
DROP POLICY IF EXISTS "utilities_staff_write" ON public.utilities;
DROP POLICY IF EXISTS "utilities_staff_insert" ON public.utilities;
DROP POLICY IF EXISTS "utilities_staff_update" ON public.utilities;
DROP POLICY IF EXISTS "utilities_admin_delete" ON public.utilities;

CREATE POLICY "utilities_isolated_read" ON public.utilities
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception', 'maintenance')
    OR chalet_id IN (SELECT id FROM public.chalets WHERE owner_id = public.current_user_owner_id())
  );
CREATE POLICY "utilities_staff_insert" ON public.utilities
  FOR INSERT WITH CHECK (public.current_user_role() IN ('super_admin', 'manager', 'maintenance'));
CREATE POLICY "utilities_staff_update" ON public.utilities
  FOR UPDATE USING (public.current_user_role() IN ('super_admin', 'manager', 'maintenance'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'manager', 'maintenance'));
CREATE POLICY "utilities_admin_delete" ON public.utilities
  FOR DELETE USING (public.current_user_role() IN ('super_admin', 'manager'));

-- 5.10 UTILITY TRANSACTIONS (Managers & maintenance can read & log recharges; owners read own chalets)
DROP POLICY IF EXISTS "utility_tx_isolated_read" ON public.utility_transactions;
DROP POLICY IF EXISTS "utility_tx_staff_write" ON public.utility_transactions;
DROP POLICY IF EXISTS "utility_tx_staff_insert" ON public.utility_transactions;
DROP POLICY IF EXISTS "utility_tx_admin_update" ON public.utility_transactions;
DROP POLICY IF EXISTS "utility_tx_admin_delete" ON public.utility_transactions;

CREATE POLICY "utility_tx_isolated_read" ON public.utility_transactions
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'maintenance')
    OR chalet_id IN (SELECT id FROM public.chalets WHERE owner_id = public.current_user_owner_id())
  );
CREATE POLICY "utility_tx_staff_insert" ON public.utility_transactions
  FOR INSERT WITH CHECK (public.current_user_role() IN ('super_admin', 'manager', 'maintenance'));
CREATE POLICY "utility_tx_admin_update" ON public.utility_transactions
  FOR UPDATE USING (public.current_user_role() IN ('super_admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'manager'));
CREATE POLICY "utility_tx_admin_delete" ON public.utility_transactions
  FOR DELETE USING (public.current_user_role() IN ('super_admin', 'manager'));

-- 5.11 HOUSEKEEPING (Staff create/update; housekeeping updates assigned/unassigned; admins delete)
DROP POLICY IF EXISTS "housekeeping_isolated_read" ON public.housekeeping;
DROP POLICY IF EXISTS "housekeeping_staff_write" ON public.housekeeping;
DROP POLICY IF EXISTS "housekeeping_staff_insert" ON public.housekeeping;
DROP POLICY IF EXISTS "housekeeping_staff_update" ON public.housekeeping;
DROP POLICY IF EXISTS "housekeeping_admin_delete" ON public.housekeeping;

CREATE POLICY "housekeeping_isolated_read" ON public.housekeeping
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception')
    OR (public.current_user_role() = 'housekeeping' AND (assigned_to = auth.uid() OR assigned_to IS NULL))
    OR chalet_id IN (SELECT id FROM public.chalets WHERE owner_id = public.current_user_owner_id())
  );
CREATE POLICY "housekeeping_staff_insert" ON public.housekeeping
  FOR INSERT WITH CHECK (public.current_user_role() IN ('super_admin', 'manager', 'reception'));
CREATE POLICY "housekeeping_staff_update" ON public.housekeeping
  FOR UPDATE USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception')
    OR (public.current_user_role() = 'housekeeping' AND (assigned_to = auth.uid() OR assigned_to IS NULL))
  )
  WITH CHECK (
    public.current_user_role() IN ('super_admin', 'manager', 'reception')
    OR (public.current_user_role() = 'housekeeping' AND (assigned_to = auth.uid() OR assigned_to IS NULL))
  );
CREATE POLICY "housekeeping_admin_delete" ON public.housekeeping
  FOR DELETE USING (public.current_user_role() IN ('super_admin', 'manager'));

-- 5.12 MAINTENANCE (Reception can create tickets; maintenance manages assigned/unassigned; admins full)
DROP POLICY IF EXISTS "maintenance_isolated_read" ON public.maintenance;
DROP POLICY IF EXISTS "maintenance_staff_write" ON public.maintenance;
DROP POLICY IF EXISTS "maintenance_staff_insert" ON public.maintenance;
DROP POLICY IF EXISTS "maintenance_staff_update" ON public.maintenance;
DROP POLICY IF EXISTS "maintenance_admin_delete" ON public.maintenance;

CREATE POLICY "maintenance_isolated_read" ON public.maintenance
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception')
    OR (public.current_user_role() = 'maintenance' AND (assigned_to = auth.uid() OR assigned_to IS NULL))
    OR chalet_id IN (SELECT id FROM public.chalets WHERE owner_id = public.current_user_owner_id())
  );
CREATE POLICY "maintenance_staff_insert" ON public.maintenance
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('super_admin', 'manager', 'reception', 'maintenance')
  );
CREATE POLICY "maintenance_staff_update" ON public.maintenance
  FOR UPDATE USING (
    public.current_user_role() IN ('super_admin', 'manager')
    OR (public.current_user_role() = 'maintenance' AND (assigned_to = auth.uid() OR assigned_to IS NULL))
  )
  WITH CHECK (
    public.current_user_role() IN ('super_admin', 'manager')
    OR (public.current_user_role() = 'maintenance' AND (assigned_to = auth.uid() OR assigned_to IS NULL))
  );
CREATE POLICY "maintenance_admin_delete" ON public.maintenance
  FOR DELETE USING (public.current_user_role() IN ('super_admin', 'manager'));

-- 5.13 OFFERS (Authenticated active users read only — no anon leak; admins write)
DROP POLICY IF EXISTS "offers_public_read" ON public.offers;
DROP POLICY IF EXISTS "offers_authenticated_read" ON public.offers;
DROP POLICY IF EXISTS "offers_admin_write" ON public.offers;
DROP POLICY IF EXISTS "offers_admin_insert" ON public.offers;
DROP POLICY IF EXISTS "offers_admin_update" ON public.offers;
DROP POLICY IF EXISTS "offers_admin_delete" ON public.offers;

CREATE POLICY "offers_authenticated_read" ON public.offers
  FOR SELECT USING (auth.uid() IS NOT NULL AND public.current_user_role() IS NOT NULL);
CREATE POLICY "offers_admin_insert" ON public.offers
  FOR INSERT WITH CHECK (public.current_user_role() IN ('super_admin', 'manager'));
CREATE POLICY "offers_admin_update" ON public.offers
  FOR UPDATE USING (public.current_user_role() IN ('super_admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'manager'));
CREATE POLICY "offers_admin_delete" ON public.offers
  FOR DELETE USING (public.current_user_role() IN ('super_admin', 'manager'));

-- 5.14 NOTIFICATIONS (Fixed critical vulnerability: strictly role/owner scoped)
DROP POLICY IF EXISTS "notifications_scoped_read" ON public.notifications;
DROP POLICY IF EXISTS "notifications_staff_write" ON public.notifications;
DROP POLICY IF EXISTS "notifications_staff_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_scoped_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_admin_delete" ON public.notifications;

CREATE POLICY "notifications_scoped_read" ON public.notifications
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager')
    OR target_role = public.current_user_role()
    OR target_owner_id = public.current_user_owner_id()
  );
CREATE POLICY "notifications_staff_insert" ON public.notifications
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('super_admin', 'manager', 'reception', 'maintenance', 'housekeeping')
    AND is_read = false
  );
CREATE POLICY "notifications_scoped_update" ON public.notifications
  FOR UPDATE USING (
    public.current_user_role() IN ('super_admin', 'manager')
    OR target_role = public.current_user_role()
    OR target_owner_id = public.current_user_owner_id()
  )
  WITH CHECK (
    public.current_user_role() IN ('super_admin', 'manager')
    OR is_read = true
  );
CREATE POLICY "notifications_admin_delete" ON public.notifications
  FOR DELETE USING (public.current_user_role() IN ('super_admin', 'manager'));

-- 5.15 NOTIFICATION SETTINGS
DROP POLICY IF EXISTS "notif_settings_read" ON public.notification_settings;
DROP POLICY IF EXISTS "notif_settings_admin_write" ON public.notification_settings;
DROP POLICY IF EXISTS "notif_settings_admin_insert" ON public.notification_settings;
DROP POLICY IF EXISTS "notif_settings_admin_update" ON public.notification_settings;
DROP POLICY IF EXISTS "notif_settings_admin_delete" ON public.notification_settings;

CREATE POLICY "notif_settings_read" ON public.notification_settings
  FOR SELECT USING (auth.uid() IS NOT NULL AND public.current_user_role() IS NOT NULL);
CREATE POLICY "notif_settings_admin_insert" ON public.notification_settings
  FOR INSERT WITH CHECK (public.current_user_role() IN ('super_admin', 'manager'));
CREATE POLICY "notif_settings_admin_update" ON public.notification_settings
  FOR UPDATE USING (public.current_user_role() IN ('super_admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'manager'));
CREATE POLICY "notif_settings_admin_delete" ON public.notification_settings
  FOR DELETE USING (public.current_user_role() IN ('super_admin', 'manager'));

-- 5.16 NOTIFICATION TEMPLATES
DROP POLICY IF EXISTS "notif_templates_read" ON public.notification_templates;
DROP POLICY IF EXISTS "notif_templates_admin_write" ON public.notification_templates;
DROP POLICY IF EXISTS "notif_templates_admin_insert" ON public.notification_templates;
DROP POLICY IF EXISTS "notif_templates_admin_update" ON public.notification_templates;
DROP POLICY IF EXISTS "notif_templates_admin_delete" ON public.notification_templates;

CREATE POLICY "notif_templates_read" ON public.notification_templates
  FOR SELECT USING (auth.uid() IS NOT NULL AND public.current_user_role() IS NOT NULL);
CREATE POLICY "notif_templates_admin_insert" ON public.notification_templates
  FOR INSERT WITH CHECK (public.current_user_role() IN ('super_admin', 'manager'));
CREATE POLICY "notif_templates_admin_update" ON public.notification_templates
  FOR UPDATE USING (public.current_user_role() IN ('super_admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'manager'));
CREATE POLICY "notif_templates_admin_delete" ON public.notification_templates
  FOR DELETE USING (public.current_user_role() IN ('super_admin', 'manager'));

-- 5.17 NOTIFICATION RECIPIENTS
DROP POLICY IF EXISTS "notif_recipients_scoped_read" ON public.notification_recipients;
DROP POLICY IF EXISTS "notif_recipients_admin_write" ON public.notification_recipients;
DROP POLICY IF EXISTS "notif_recipients_staff_insert" ON public.notification_recipients;
DROP POLICY IF EXISTS "notif_recipients_staff_update" ON public.notification_recipients;
DROP POLICY IF EXISTS "notif_recipients_admin_delete" ON public.notification_recipients;

CREATE POLICY "notif_recipients_scoped_read" ON public.notification_recipients
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception')
    OR owner_id = public.current_user_owner_id()
  );
CREATE POLICY "notif_recipients_staff_insert" ON public.notification_recipients
  FOR INSERT WITH CHECK (public.current_user_role() IN ('super_admin', 'manager', 'reception'));
CREATE POLICY "notif_recipients_staff_update" ON public.notification_recipients
  FOR UPDATE USING (public.current_user_role() IN ('super_admin', 'manager', 'reception'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'manager', 'reception'));
CREATE POLICY "notif_recipients_admin_delete" ON public.notification_recipients
  FOR DELETE USING (public.current_user_role() IN ('super_admin', 'manager'));

-- 5.18 NOTIFICATION DELIVERIES
DROP POLICY IF EXISTS "notif_deliveries_scoped_read" ON public.notification_deliveries;
DROP POLICY IF EXISTS "notif_deliveries_staff_write" ON public.notification_deliveries;
DROP POLICY IF EXISTS "notif_deliveries_staff_insert" ON public.notification_deliveries;
DROP POLICY IF EXISTS "notif_deliveries_staff_update" ON public.notification_deliveries;
DROP POLICY IF EXISTS "notif_deliveries_admin_delete" ON public.notification_deliveries;

CREATE POLICY "notif_deliveries_scoped_read" ON public.notification_deliveries
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception')
    OR owner_id = public.current_user_owner_id()
  );
CREATE POLICY "notif_deliveries_staff_insert" ON public.notification_deliveries
  FOR INSERT WITH CHECK (public.current_user_role() IN ('super_admin', 'manager', 'reception'));
CREATE POLICY "notif_deliveries_staff_update" ON public.notification_deliveries
  FOR UPDATE USING (public.current_user_role() IN ('super_admin', 'manager', 'reception'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'manager', 'reception'));
CREATE POLICY "notif_deliveries_admin_delete" ON public.notification_deliveries
  FOR DELETE USING (public.current_user_role() IN ('super_admin', 'manager'));

-- 5.19 NOTIFICATION PREFERENCES (Fixed critical privacy bug: strictly scoped to auth.uid()::text)
DROP POLICY IF EXISTS "notif_prefs_user_rw" ON public.notification_preferences;
DROP POLICY IF EXISTS "notif_prefs_owner_read" ON public.notification_preferences;
DROP POLICY IF EXISTS "notif_prefs_owner_insert" ON public.notification_preferences;
DROP POLICY IF EXISTS "notif_prefs_owner_update" ON public.notification_preferences;
DROP POLICY IF EXISTS "notif_prefs_owner_delete" ON public.notification_preferences;

CREATE POLICY "notif_prefs_owner_read" ON public.notification_preferences
  FOR SELECT USING (
    user_id = auth.uid()::text
    OR public.current_user_role() IN ('super_admin', 'manager')
  );
CREATE POLICY "notif_prefs_owner_insert" ON public.notification_preferences
  FOR INSERT WITH CHECK (
    (auth.uid() IS NOT NULL AND user_id = auth.uid()::text)
    OR public.current_user_role() IN ('super_admin', 'manager')
  );
CREATE POLICY "notif_prefs_owner_update" ON public.notification_preferences
  FOR UPDATE USING (
    user_id = auth.uid()::text
    OR public.current_user_role() IN ('super_admin', 'manager')
  )
  WITH CHECK (
    user_id = auth.uid()::text
    OR public.current_user_role() IN ('super_admin', 'manager')
  );
CREATE POLICY "notif_prefs_owner_delete" ON public.notification_preferences
  FOR DELETE USING (
    user_id = auth.uid()::text
    OR public.current_user_role() IN ('super_admin', 'manager')
  );

-- =============================================================================
-- 6. LEAST-PRIVILEGE GRANTS & REVOKES
-- =============================================================================

-- Prevent arbitrary object creation in public schema while preserving schema resolution
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO authenticated, service_role;

-- Revoke all table & sequence privileges from PUBLIC and anon
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Revoke direct execution of custom schema functions & triggers from PUBLIC and anon
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_owner_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.prevent_double_booking() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.prevent_ledger_mutation() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_payment_insert() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guard_chalet_update() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guard_housekeeping_update() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guard_maintenance_update() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guard_notification_update() FROM PUBLIC, anon;

-- Grant RLS helper execution strictly to authenticated sessions (trigger functions run under DML context)
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_owner_id() TO authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Immutable financial tables for authenticated sessions: SELECT and INSERT ONLY (NO UPDATE, DELETE, or TRUNCATE)
GRANT SELECT, INSERT ON public.payments TO authenticated;
GRANT SELECT, INSERT ON public.payment_audit_logs TO authenticated;

-- Standard operational & configuration tables (enforced row-by-row by RLS + triggers)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.owners,
  public.users,
  public.chalets,
  public.guests,
  public.bookings,
  public.expenses,
  public.utilities,
  public.utility_transactions,
  public.housekeeping,
  public.maintenance,
  public.offers,
  public.notifications,
  public.notification_settings,
  public.notification_templates,
  public.notification_recipients,
  public.notification_deliveries,
  public.notification_preferences
TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- =============================================================================
-- END OF PRODUCTION SCHEMA
-- =============================================================================
