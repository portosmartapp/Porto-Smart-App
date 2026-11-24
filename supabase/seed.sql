-- =============================================================================
-- Porto El Sokhna Smart Chalet Management Platform
-- Demo Seed Data (Clearly marked is_demo = true)
-- Run AFTER supabase/schema.sql in Supabase SQL Editor.
-- To remove demo records before production launch:
--   DELETE FROM public.notification_deliveries WHERE is_demo = true;
--   DELETE FROM public.notification_recipients WHERE is_demo = true;
--   DELETE FROM public.notifications WHERE is_demo = true;
--   DELETE FROM public.offers WHERE is_demo = true;
--   DELETE FROM public.maintenance WHERE is_demo = true;
--   DELETE FROM public.housekeeping WHERE is_demo = true;
--   DELETE FROM public.utility_transactions WHERE is_demo = true;
--   DELETE FROM public.utilities WHERE is_demo = true;
--   DELETE FROM public.expenses WHERE is_demo = true;
--   DELETE FROM public.payment_audit_logs WHERE is_demo = true;
--   DELETE FROM public.payments WHERE is_demo = true;
--   DELETE FROM public.bookings WHERE is_demo = true;
--   DELETE FROM public.chalets WHERE is_demo = true;
--   DELETE FROM public.owners WHERE is_demo = true;
-- =============================================================================

INSERT INTO public.owners (id, full_name, full_name_ar, phone, email, national_id, bank_account, notes, is_demo)
VALUES
  ('11111111-1111-1111-1111-111111111101', 'Eng. Tarek El-Masry', 'م. طارق المصري', '+20 100 555 0101', 'tarek.owner@porto-sokhna.demo', '28405120102391', 'CIB EG420010002100000010045678901', 'Owns 6 prime Marina & Sea View units', true),
  ('11111111-1111-1111-1111-111111111102', 'Dr. Nadia Hassan', 'د. نادية حسن', '+20 100 555 0202', 'nadia.owner@porto-sokhna.demo', '27911030104512', 'QNB EG880020004400000020099112233', 'Prefers monthly settlement on the 5th', true),
  ('11111111-1111-1111-1111-111111111103', 'Hossam El-Din Fouad', 'حسام الدين فؤاد', '+20 122 404 0303', 'hossam.fouad@porto-sokhna.demo', '27508210109988', 'HSBC EG190030001100000030088776655', 'Lagoon & Poolside chalets portfolio', true),
  ('11111111-1111-1111-1111-111111111104', 'Rania El-Kholy', 'رانيا الخولي', '+20 106 888 0404', 'rania.elkholy@porto-sokhna.demo', '28803190106677', 'NBE EG770040005500000040011223344', 'Panorama terrace chalets', true),
  ('11111111-1111-1111-1111-111111111105', 'Sherif Zaki', 'شريف زكي', '+20 111 777 0505', 'sherif.zaki@porto-sokhna.demo', '28107250103344', 'AAIB EG550050006600000050066554433', 'Mountain & Garden view units', true)
ON CONFLICT (id) DO NOTHING;

-- 22 Porto El Sokhna Demo Chalets
INSERT INTO public.chalets (
  chalet_number, owner_id, bedrooms, bathrooms, max_guests, floor, view_type, view_type_ar,
  status, photos, description, description_ar, amenities, nightly_price, owner_pct, management_pct, is_active, is_demo
)
VALUES
  ('PS-101', '11111111-1111-1111-1111-111111111101', 2, 2, 5, '1', 'Full Sea & Marina View', 'إطلالة كاملة على البحر والمارينا', 'occupied', '[]'::jsonb, 'Luxury resort chalet overlooking the Marina.', 'شاليه فاخر مطل على المارينا.', '["Wi-Fi","Smart TV","Central A/C","Pool Access"]'::jsonb, 3800, 75, 25, true, true),
  ('PS-102', '11111111-1111-1111-1111-111111111101', 3, 2, 6, '1', 'Marina Promenade View', 'إطلالة على ممشى المارينا', 'occupied', '[]'::jsonb, 'Spacious 3BR promenade chalet.', 'شاليه واسع 3 غرف على الممشى.', '["Wi-Fi","Smart TV","Central A/C"]'::jsonb, 4500, 75, 25, true, true),
  ('PS-103', '11111111-1111-1111-1111-111111111102', 2, 1, 4, '1', 'Lagoon & Pool View', 'إطلالة على اللاجون وحمام السباحة', 'available', '[]'::jsonb, 'Bright poolside chalet.', 'شاليه مشرق مطل على اللاجون.', '["Wi-Fi","Pool Access"]'::jsonb, 3200, 75, 25, true, true),
  ('PS-104', '11111111-1111-1111-1111-111111111102', 1, 1, 3, 'Ground', 'Private Garden & Pool', 'حديقة خاصة وحمام سباحة', 'cleaning', '[]'::jsonb, 'Ground garden suite.', 'جناح أرضي بحديقة خاصة.', '["Wi-Fi","Garden"]'::jsonb, 2700, 70, 30, true, true),
  ('PS-105', '11111111-1111-1111-1111-111111111103', 2, 2, 5, 'Ground', 'Poolside Terrace', 'تراس مباشر على حمام السباحة', 'available', '[]'::jsonb, 'Direct pool access.', 'وصول مباشر للمسبح.', '["Wi-Fi","Pool Access"]'::jsonb, 3400, 75, 25, true, true),
  ('PS-106', '11111111-1111-1111-1111-111111111103', 2, 2, 4, '1', 'Lagoon View', 'إطلالة على اللاجون', 'occupied', '[]'::jsonb, 'Lagoon front family chalet.', 'شاليه عائلي على اللاجون.', '["Wi-Fi","Smart TV"]'::jsonb, 3300, 75, 25, true, true),
  ('PS-107', '11111111-1111-1111-1111-111111111104', 3, 3, 7, '2', 'Panoramic Red Sea', 'بانوراما البحر الأحمر', 'occupied', '[]'::jsonb, 'Panoramic sea view.', 'إطلالة بانورامية على البحر.', '["Wi-Fi","Smart TV","Balcony"]'::jsonb, 5200, 80, 20, true, true),
  ('PS-108', '11111111-1111-1111-1111-111111111105', 2, 1, 4, '2', 'Mountain & Golf View', 'إطلالة الجبل والجولف', 'available', '[]'::jsonb, 'Serene mountain views.', 'إطلالة هادئة على الجبل.', '["Wi-Fi","Parking"]'::jsonb, 2600, 70, 30, true, true),
  ('PS-201', '11111111-1111-1111-1111-111111111101', 2, 2, 5, '2', 'Sea & Yacht Marina', 'إطلالة البحر ومرسى اليخوت', 'occupied', '[]'::jsonb, 'Marina view residence.', 'وحدة بإطلالة مرسى اليخوت.', '["Wi-Fi","Smart TV"]'::jsonb, 4100, 75, 25, true, true),
  ('PS-202', '11111111-1111-1111-1111-111111111101', 3, 2, 6, '2', 'Corner Sea View', 'زاوية بحرية مفتوحة', 'available', '[]'::jsonb, 'Corner sea-facing terrace.', 'تراس زاوية مفتوح على البحر.', '["Wi-Fi","Sea Balcony"]'::jsonb, 4700, 75, 25, true, true),
  ('PS-203', '11111111-1111-1111-1111-111111111102', 2, 2, 4, '2', 'Aqua Park & Pool View', 'إطلالة الأكوا بارك والمسبح', 'maintenance', '[]'::jsonb, 'Near aqua park.', 'قريب من الأكوا بارك.', '["Wi-Fi","Pool Access"]'::jsonb, 3100, 75, 25, true, true),
  ('PS-204', '11111111-1111-1111-1111-111111111103', 2, 2, 5, '3', 'Partial Sea & Lagoon', 'إطلالة جزئية للبحر واللاجون', 'available', '[]'::jsonb, 'Elevated balcony.', 'بلكونة مرتفعة.', '["Wi-Fi","Central A/C"]'::jsonb, 3500, 75, 25, true, true),
  ('PS-205', '11111111-1111-1111-1111-111111111104', 3, 2, 6, '3', 'Full Sea Front', 'صف أول على البحر مباشرة', 'occupied', '[]'::jsonb, 'First row beachfront.', 'صف أول على الشاطئ.', '["Wi-Fi","Sea Balcony"]'::jsonb, 5400, 80, 20, true, true),
  ('PS-206', '11111111-1111-1111-1111-111111111105', 1, 1, 3, '3', 'Red Sea Mountain Ridge', 'إطلالة جبال السخنة', 'available', '[]'::jsonb, 'Cozy studio suite.', 'جناح هادئ.', '["Wi-Fi"]'::jsonb, 2400, 70, 30, true, true),
  ('PS-207', '11111111-1111-1111-1111-111111111102', 2, 2, 5, '3', 'Marina & Fountain View', 'إطلالة المارينا والنافورة', 'cleaning', '[]'::jsonb, 'Overlooking promenade fountain.', 'مطل على النافورة الراقصة.', '["Wi-Fi","Smart TV"]'::jsonb, 3600, 75, 25, true, true),
  ('PS-208', '11111111-1111-1111-1111-111111111103', 2, 1, 4, '3', 'Pool & Garden View', 'إطلالة المسبح والحديقة', 'available', '[]'::jsonb, 'Quiet family wing.', 'جناح عائلي هادئ.', '["Wi-Fi"]'::jsonb, 2950, 75, 25, true, true),
  ('PS-301', '11111111-1111-1111-1111-111111111101', 3, 3, 7, 'Penthouse', 'Rooftop Sea & Marina', 'روف بانورامي على البحر والمارينا', 'occupied', '[]'::jsonb, 'Signature rooftop penthouse.', 'بنتهاوس بروف بانورامي.', '["Wi-Fi","Private Roof"]'::jsonb, 6200, 80, 20, true, true),
  ('PS-302', '11111111-1111-1111-1111-111111111104', 3, 3, 7, 'Penthouse', 'Sunset Cliff & Red Sea', 'روف غروب الشمس والبحر الأحمر', 'available', '[]'::jsonb, 'Sunset terrace penthouse.', 'تراس غروب الشمس.', '["Wi-Fi","Private Roof"]'::jsonb, 5900, 80, 20, true, true),
  ('PS-303', '11111111-1111-1111-1111-111111111105', 2, 2, 5, '4', 'High Sea View', 'إطلالة بحرية مرتفعة', 'available', '[]'::jsonb, 'High floor breeze.', 'طابق مرتفع وهواء نقي.', '["Wi-Fi","Central A/C"]'::jsonb, 3900, 75, 25, true, true),
  ('PS-304', '11111111-1111-1111-1111-111111111102', 2, 2, 5, '4', 'Marina & Promenade', 'المارينا والممشى السياحي', 'occupied', '[]'::jsonb, 'Central marina location.', 'موقع مركزي بالمارينا.', '["Wi-Fi","Smart TV"]'::jsonb, 4000, 75, 25, true, true),
  ('PS-305', '11111111-1111-1111-1111-111111111101', 2, 2, 4, '4', 'Lagoon Panorama', 'بانوراما اللاجون', 'available', '[]'::jsonb, 'Wide lagoon view.', 'بانوراما اللاجون.', '["Wi-Fi","Pool Access"]'::jsonb, 3750, 75, 25, true, true),
  ('PS-306', '11111111-1111-1111-1111-111111111104', 4, 3, 8, 'Penthouse', 'Royal Marina Suite', 'جناح المارينا الملكي', 'available', '[]'::jsonb, '4BR royal suite.', 'جناح ملكي 4 غرف.', '["Wi-Fi","Private Roof","Jacuzzi"]'::jsonb, 7500, 80, 20, true, true)
ON CONFLICT (chalet_number) DO NOTHING;

-- Initialize utility meters for every seeded chalet
INSERT INTO public.utilities (chalet_id, electricity_balance, water_balance, last_electricity_recharge, last_electricity_date, last_water_recharge, last_water_date, is_demo)
SELECT
  id,
  CASE WHEN chalet_number IN ('PS-104','PS-203','PS-208') THEN 210 ELSE 850 END,
  CASE WHEN chalet_number IN ('PS-107','PS-203') THEN 115 ELSE 420 END,
  1000,
  now() - interval '4 days',
  500,
  now() - interval '6 days',
  true
FROM public.chalets
ON CONFLICT (chalet_id) DO NOTHING;

-- Default Notification Settings (External SMS & Email disabled until configured)
INSERT INTO public.notification_settings (
  id, sms_enabled, email_enabled, in_app_enabled, providers_activated, simulation_mode,
  sms_provider_name, email_provider_name, sender_name
)
VALUES (
  'default', false, false, true, false, true,
  'Unconfigured (Disabled)', 'Unconfigured (Disabled)', 'Free Rent Tours — Porto El Sokhna'
)
ON CONFLICT (id) DO NOTHING;
