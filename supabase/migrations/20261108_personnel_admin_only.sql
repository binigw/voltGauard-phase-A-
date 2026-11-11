-- SIGMO P0-A: enforce Personnel mutations at the database boundary.
--
-- The UI already hides create/update/delete controls from technicians, but UI
-- visibility is not authorization. Authenticated technicians retain SELECT
-- access to the contact directory; only a caller whose own public.user_roles
-- row is `admin` may INSERT, UPDATE, or DELETE personnel records.

begin;

alter table public.personnel enable row level security;

-- Replace the former authenticated-user-wide mutation policies.
drop policy if exists personnel_insert on public.personnel;
drop policy if exists personnel_update on public.personnel;
drop policy if exists personnel_delete on public.personnel;
drop policy if exists personnel_insert_admin on public.personnel;
drop policy if exists personnel_update_admin on public.personnel;
drop policy if exists personnel_delete_admin on public.personnel;

create policy personnel_insert_admin
on public.personnel
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_roles as ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
  )
);

create policy personnel_update_admin
on public.personnel
for update
to authenticated
using (
  exists (
    select 1
    from public.user_roles as ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.user_roles as ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
  )
);

create policy personnel_delete_admin
on public.personnel
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_roles as ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
  )
);

commit;
