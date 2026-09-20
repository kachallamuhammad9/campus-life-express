-- Keep the internal vendor application sequence table protected from clients.
alter table public.vendor_application_counters enable row level security;
