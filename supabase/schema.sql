-- =============================================================================
-- Porto El Sokhna Smart Chalet Management Platform
-- Complete PostgreSQL Schema + Double-Booking Trigger + Row Level Security
-- Compatible with Supabase Free Plan (PostgreSQL 15+)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. OWNERS
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 2. USERS (Profile & RBAC mapped to Supabase auth.users)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 3. CHALETS (Supports unlimited chalets; starts with 22 demo chalets)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 4. GUESTS
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 5. BOOKINGS
-- -----------------------------------------------------------------------------
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
  deposit_amount NUMERIC(10, 2) DEFAULT 0,
  inspection_notes TEXT DEFAULT '',
  damage_report TEXT DEFAULT '',
  outstanding_amount NUMERIC(10, 2) DEFAULT 0,
  payment_due_date DATE,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_dates CHECK (check_out > check_in)
);

CREATE INDEX IF NOT EXISTS idx_bookings_chalet_dates ON public.bookings(chalet_id, check_in, check_out);

-- Trigger to enforce zero double-booking across non-cancelled bookings
CREATE OR REPLACE FUNCTION public.prevent_double_booking()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status <> 'cancelled' THEN
    IF EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.chalet_id = NEW.chalet_id
        AND b.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND b.status <> 'cancelled'
        AND b.check_in < NEW.check_out
        AND b.check_out > NEW.check_in
    ) THEN
      RAISE EXCEPTION 'Double booking detected: Chalet already reserved for overlapping dates.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_double_booking ON public.bookings;
CREATE TRIGGER trg_prevent_double_booking
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.prevent_double_booking();

-- -----------------------------------------------------------------------------
-- 6. PAYMENTS & PAYMENT AUDIT LOGS (Reused & Extended; No Duplicate Tables)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES public.owners(id) ON DELETE SET NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN (
    'guest_payment',
    'owner_payout',
    'deposit',
    'refund',
    'correction'
  )),
  entry_direction TEXT NOT NULL DEFAULT 'inflow' CHECK (entry_direction IN ('inflow', 'outflow', 'adjustment')),
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
  parent_payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  correction_reason TEXT DEFAULT '',
  recorded_by_name TEXT DEFAULT '',
  gateway_provider TEXT DEFAULT NULL,
  gateway_status TEXT DEFAULT 'not_activated',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_payments_booking ON public.payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_owner ON public.payments(owner_id);

CREATE TABLE IF NOT EXISTS public.payment_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
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

-- -----------------------------------------------------------------------------
-- 7. EXPENSES
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 8. UTILITIES & UTILITY TRANSACTIONS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.utilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chalet_id UUID UNIQUE NOT NULL REFERENCES public.chalets(id) ON DELETE CASCADE,
  electricity_balance NUMERIC(10, 2) NOT NULL DEFAULT 0,
  water_balance NUMERIC(10, 2) NOT NULL DEFAULT 0,
  electricity_threshold NUMERIC(10, 2) NOT NULL DEFAULT 300,
  water_threshold NUMERIC(10, 2) NOT NULL DEFAULT 150,
  last_electricity_recharge NUMERIC(10, 2) DEFAULT 0,
  last_electricity_date TIMESTAMPTZ,
  last_water_recharge NUMERIC(10, 2) DEFAULT 0,
  last_water_date TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- -----------------------------------------------------------------------------
-- 9. HOUSEKEEPING
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 10. MAINTENANCE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chalet_id UUID NOT NULL REFERENCES public.chalets(id) ON DELETE CASCADE,
  problem_type TEXT NOT NULL,
  description TEXT NOT NULL,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'emergency')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_progress', 'completed', 'closed')),
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  technician_name TEXT DEFAULT '',
  cost NUMERIC(10, 2) NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT false
);

-- -----------------------------------------------------------------------------
-- 11. RESTAURANT & SUPERMARKET OFFERS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('restaurant', 'cafe', 'supermarket', 'resort_service')),
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

-- -----------------------------------------------------------------------------
-- 12. NOTIFICATIONS
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 13. NOTIFICATION MANAGEMENT ARCHITECTURE (SMS & EMAIL DISABLED UNTIL CONFIGURED)
-- -----------------------------------------------------------------------------
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

CREATE TABLE IF NOT EXISTS public.notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('booking', 'payment', 'operations', 'utility', 'owner')),
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
  status TEXT NOT NULL CHECK (status IN ('queued_disabled', 'simulated', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  error_reason TEXT DEFAULT '',
  dedup_key TEXT UNIQUE NOT NULL,
  related_entity_id TEXT,
  owner_id UUID REFERENCES public.owners(id) ON DELETE SET NULL,
  chalet_id UUID REFERENCES public.chalets(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
-- ROW LEVEL SECURITY (RLS) & OWNER ISOLATION
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.current_user_owner_id()
RETURNS UUID AS $$
  SELECT owner_id FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chalets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utility_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.housekeeping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users policy: view own profile; admins manage all
CREATE POLICY "users_self_read" ON public.users
  FOR SELECT USING (id = auth.uid() OR public.current_user_role() IN ('super_admin', 'manager'));
CREATE POLICY "users_admin_write" ON public.users
  FOR ALL USING (public.current_user_role() = 'super_admin');

-- Owners policy: admins/managers see all; owner sees ONLY their own record
CREATE POLICY "owners_isolated_read" ON public.owners
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception')
    OR id = public.current_user_owner_id()
  );
CREATE POLICY "owners_admin_write" ON public.owners
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'manager'));

-- Chalets policy: staff see all; owner sees ONLY their chalets
CREATE POLICY "chalets_isolated_read" ON public.chalets
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception', 'housekeeping', 'maintenance')
    OR owner_id = public.current_user_owner_id()
  );
CREATE POLICY "chalets_admin_write" ON public.chalets
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'manager'));

-- Bookings policy: staff see all; owner sees ONLY bookings for their chalets
CREATE POLICY "bookings_isolated_read" ON public.bookings
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception')
    OR chalet_id IN (SELECT id FROM public.chalets WHERE owner_id = public.current_user_owner_id())
  );
CREATE POLICY "bookings_staff_write" ON public.bookings
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'manager', 'reception'));

-- Payments policy: admins/managers/reception see all; owner sees ONLY their payouts/bookings
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
CREATE POLICY "payments_staff_write" ON public.payments
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'manager', 'reception'));

CREATE POLICY "payment_audit_isolated_read" ON public.payment_audit_logs
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception')
    OR booking_id IN (
      SELECT b.id FROM public.bookings b
      JOIN public.chalets c ON b.chalet_id = c.id
      WHERE c.owner_id = public.current_user_owner_id()
    )
  );
CREATE POLICY "payment_audit_staff_write" ON public.payment_audit_logs
  FOR INSERT WITH CHECK (public.current_user_role() IN ('super_admin', 'manager', 'reception'));

-- Expenses policy: admins/managers see all; owner sees ONLY expenses for their chalets
CREATE POLICY "expenses_isolated_read" ON public.expenses
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager')
    OR chalet_id IN (SELECT id FROM public.chalets WHERE owner_id = public.current_user_owner_id())
  );
CREATE POLICY "expenses_admin_write" ON public.expenses
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'manager'));

-- Utilities & Transactions: staff see all; owner sees ONLY their chalets
CREATE POLICY "utilities_isolated_read" ON public.utilities
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception', 'maintenance')
    OR chalet_id IN (SELECT id FROM public.chalets WHERE owner_id = public.current_user_owner_id())
  );
CREATE POLICY "utilities_staff_write" ON public.utilities
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'manager'));

CREATE POLICY "utility_tx_isolated_read" ON public.utility_transactions
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager')
    OR chalet_id IN (SELECT id FROM public.chalets WHERE owner_id = public.current_user_owner_id())
  );
CREATE POLICY "utility_tx_staff_write" ON public.utility_transactions
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'manager'));

-- Housekeeping: staff/admin see all; housekeeping sees assigned; owner sees their chalets
CREATE POLICY "housekeeping_isolated_read" ON public.housekeeping
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception')
    OR (public.current_user_role() = 'housekeeping' AND (assigned_to = auth.uid() OR assigned_to IS NULL))
    OR chalet_id IN (SELECT id FROM public.chalets WHERE owner_id = public.current_user_owner_id())
  );
CREATE POLICY "housekeeping_staff_write" ON public.housekeeping
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'manager', 'reception', 'housekeeping'));

-- Maintenance: staff/admin see all; technician sees assigned; owner sees their chalets
CREATE POLICY "maintenance_isolated_read" ON public.maintenance
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception')
    OR (public.current_user_role() = 'maintenance' AND (assigned_to = auth.uid() OR assigned_to IS NULL))
    OR chalet_id IN (SELECT id FROM public.chalets WHERE owner_id = public.current_user_owner_id())
  );
CREATE POLICY "maintenance_staff_write" ON public.maintenance
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'manager', 'reception', 'maintenance'));

-- Offers: readable by all authenticated users, writable by admins/managers
CREATE POLICY "offers_public_read" ON public.offers FOR SELECT USING (true);
CREATE POLICY "offers_admin_write" ON public.offers
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'manager'));

-- Guests: staff only
CREATE POLICY "guests_staff_all" ON public.guests
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'manager', 'reception'));

-- Notifications: role/owner scoped
CREATE POLICY "notifications_scoped_read" ON public.notifications
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager')
    OR target_role = public.current_user_role()
    OR target_owner_id = public.current_user_owner_id()
  );
CREATE POLICY "notifications_staff_write" ON public.notifications
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "notif_settings_read" ON public.notification_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "notif_settings_admin_write" ON public.notification_settings
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'manager'));

CREATE POLICY "notif_templates_read" ON public.notification_templates
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "notif_templates_admin_write" ON public.notification_templates
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'manager'));

CREATE POLICY "notif_recipients_scoped_read" ON public.notification_recipients
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception')
    OR owner_id = public.current_user_owner_id()
  );
CREATE POLICY "notif_recipients_admin_write" ON public.notification_recipients
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'manager'));

CREATE POLICY "notif_deliveries_scoped_read" ON public.notification_deliveries
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'manager', 'reception')
    OR owner_id = public.current_user_owner_id()
  );
CREATE POLICY "notif_deliveries_staff_write" ON public.notification_deliveries
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'manager', 'reception'));

CREATE POLICY "notif_prefs_user_rw" ON public.notification_preferences
  FOR ALL USING (auth.uid() IS NOT NULL);
