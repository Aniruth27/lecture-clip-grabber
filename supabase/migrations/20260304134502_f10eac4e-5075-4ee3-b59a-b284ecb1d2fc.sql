
CREATE TYPE public.plan_type AS ENUM ('free', 'pro');
CREATE TYPE public.job_status AS ENUM ('pending', 'validating', 'extracting', 'deduplicating', 'detecting', 'enhancing', 'packaging', 'done', 'error');
