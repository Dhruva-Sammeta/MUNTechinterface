-- Make committee_id nullable in delegates table to allow global admins
-- that are not assigned to a specific committee.

ALTER TABLE public.delegates ALTER COLUMN committee_id DROP NOT NULL;

-- Note: The foreign key and CASCADE still exist, but will only trigger 
-- if the committee_id IS set and that committee is deleted.
