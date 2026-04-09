-- Migration: Add has_logged_in flag to delegates
-- Run in Supabase SQL editor

ALTER TABLE public.delegates
  ADD COLUMN IF NOT EXISTS has_logged_in boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_delegates_has_logged_in ON public.delegates(has_logged_in);
