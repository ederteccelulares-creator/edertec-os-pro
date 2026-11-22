-- End-to-end RLS smoke test for two company-scoped tenants.
-- Run only in the disposable PostgreSQL CI database after all migrations.
-- The test harness simulates auth.uid(); it is not a substitute for Supabase Auth.

\set ON_ERROR_STOP on

INSERT INTO auth.users (id,email) VALUES
  ('10000000-0000-4000-8000-000000000001','tenant-a@example.invalid'),
  ('20000000-0000-4000-8000-000000000002','tenant-b@example.invalid');

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.companies, public.company_members, public.branches TO authenticated;
GRANT SELECT, INSERT ON public.customers TO authenticated;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
SELECT public.register_company('Tenant A',NULL,NULL) AS company_a \gset
SELECT set_config('test.company_a', :'company_a', false);
INSERT INTO public.customers(company_id,name,phone)
VALUES (:'company_a'::uuid,'Cliente A','111');

SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',false);
SELECT public.register_company('Tenant B',NULL,NULL) AS company_b \gset
SELECT set_config('test.company_b', :'company_b', false);
INSERT INTO public.customers(company_id,name,phone)
VALUES (:'company_b'::uuid,'Cliente B','222');

-- Tenant B must see only its own customer and branch.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.customers) <> 1
     OR EXISTS (SELECT 1 FROM public.customers WHERE name='Cliente A')
     OR (SELECT count(*) FROM public.branches) <> 1 THEN
    RAISE EXCEPTION 'Tenant B can see data belonging to Tenant A';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.customers) <> 1
     OR EXISTS (SELECT 1 FROM public.customers WHERE name='Cliente B')
     OR (SELECT count(*) FROM public.branches) <> 1 THEN
    RAISE EXCEPTION 'Tenant A can see data belonging to Tenant B';
  END IF;
END;
$$;

-- RLS must reject a write that claims another company's tenant key.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.customers(company_id,name,phone)
    VALUES (current_setting('test.company_b')::uuid,'Tentativa entre empresas','999');
    RAISE EXCEPTION 'Cross-tenant customer insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

RESET ROLE;
\echo 'Company tenant isolation RLS smoke tests passed for two synthetic companies.'
