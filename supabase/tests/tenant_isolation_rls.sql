-- End-to-end RLS smoke test using two synthetic users and two isolated tenants.
-- Run only in the disposable PostgreSQL CI database after migrations 0001-0016.
-- The test harness simulates auth.uid(); it is not a substitute for Supabase Auth.

\set ON_ERROR_STOP on

INSERT INTO auth.users (id,email) VALUES
  ('10000000-0000-4000-8000-000000000001','tenant-a@example.invalid'),
  ('20000000-0000-4000-8000-000000000002','tenant-b@example.invalid');

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
SELECT public.create_organization('Tenant A','tenant-a') AS org_a \gset
SELECT set_config('test.org_a', :'org_a', false);
INSERT INTO public.customers(id,organization_id,name,phone)
VALUES ('a0000000-0000-4000-8000-000000000001', :'org_a'::uuid, 'Cliente A', '111');

SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',false);
SELECT public.create_organization('Tenant B','tenant-b') AS org_b \gset
SELECT set_config('test.org_b', :'org_b', false);
INSERT INTO public.customers(id,organization_id,name,phone)
VALUES ('b0000000-0000-4000-8000-000000000002', :'org_b'::uuid, 'Cliente B', '222');

-- A tenant B user must not see tenant A rows, and vice versa.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.customers) <> 1
     OR EXISTS (SELECT 1 FROM public.customers WHERE id='a0000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'Tenant B can see data belonging to Tenant A';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.customers) <> 1
     OR EXISTS (SELECT 1 FROM public.customers WHERE id='b0000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'Tenant A can see data belonging to Tenant B';
  END IF;
END;
$$;

-- RLS must reject writes that claim another organization's tenant key.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.customers(organization_id,name,phone)
    VALUES (current_setting('test.org_b')::uuid, 'Cross-tenant attempt', '999');
    RAISE EXCEPTION 'Cross-tenant customer insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

-- Composite tenant foreign keys must reject linking a Tenant B device to
-- a Tenant A customer, even when the request is authenticated as Tenant B.
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',false);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.devices(organization_id,customer_id,brand,model)
    VALUES (current_setting('test.org_b')::uuid, 'a0000000-0000-4000-8000-000000000001', 'Teste', 'Cross Tenant');
    RAISE EXCEPTION 'Cross-tenant device/customer relationship unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END;
$$;

-- Membership privilege changes are RPC-only; authenticated clients cannot
-- update organization_members directly.
DO $$
BEGIN
  BEGIN
    UPDATE public.organization_members SET role='owner'
    WHERE organization_id=current_setting('test.org_b')::uuid
      AND user_id='10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Direct membership role update unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

-- Service orders must be created through the audited SECURITY DEFINER RPC.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.service_orders(organization_id,branch_id,customer_id,reported_issue)
    SELECT current_setting('test.org_b')::uuid, b.id, 'b0000000-0000-4000-8000-000000000002', 'Direct insert attempt'
    FROM public.branches b
    WHERE b.organization_id=current_setting('test.org_b')::uuid
    LIMIT 1;
    RAISE EXCEPTION 'Direct service order insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

RESET ROLE;
\echo 'Tenant isolation RLS smoke tests passed for two synthetic tenants.'
