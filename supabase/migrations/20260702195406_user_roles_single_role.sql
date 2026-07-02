-- =============================================================================
-- Enforce exactly one role per user. D-058.
--
-- The original user_roles table (20260518175820) had a (user_id, role_id)
-- composite primary key, which permits a user to hold many roles. D-058
-- supersedes that: a staff account has exactly one active role at a time.
--
-- Step 1 (backfill-collapse, D-058 point 5): if any user holds multiple roles,
-- keep the highest-precedence assignment (admin > operator > viewer > oldest
-- custom) and delete the rest, so the unique constraint below can be added.
--
-- Step 2 (D-058 point 4): add a unique constraint on user_id so a second role
-- assignment is rejected at the source of truth. The table keeps its name and
-- composite primary key for compatibility.
-- =============================================================================

-- Step 1: collapse multi-role users to their single highest-precedence role.
with ranked as (
  select
    ur.user_id,
    ur.role_id,
    row_number() over (
      partition by ur.user_id
      order by
        case r.name
          when 'admin'    then 0
          when 'operator' then 1
          when 'viewer'   then 2
          else 3                       -- custom roles: lowest precedence
        end,
        ur.assigned_at asc,            -- among customs, keep the oldest
        ur.role_id asc                 -- deterministic final tiebreak
    ) as rn
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
)
delete from public.user_roles ur
using ranked
where ur.user_id = ranked.user_id
  and ur.role_id = ranked.role_id
  and ranked.rn > 1;

-- Step 2: one role per user, enforced by the database.
alter table public.user_roles
  add constraint user_roles_one_per_user unique (user_id);

comment on constraint user_roles_one_per_user on public.user_roles is
  'D-058: exactly one role per user. A second role assignment is rejected here.';
