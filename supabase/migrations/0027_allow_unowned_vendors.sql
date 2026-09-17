-- Phase 4E.2A: NULL owner means CLX-managed, with no vendor login yet.
-- Preserve existing owners, the profiles FK (ON DELETE RESTRICT), and UNIQUE.
-- Ordinary PostgreSQL UNIQUE allows multiple NULLs, but one vendor per real owner.
-- Existing ownership helpers use equality with auth.uid() and exclude NULL owners.
-- Admin access remains separately authorized through public.is_admin().
alter table public.vendors alter column owner_user_id drop not null;
