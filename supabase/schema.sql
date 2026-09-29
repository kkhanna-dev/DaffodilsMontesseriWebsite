-- =====================================================================
-- DAFFODILS MONTESSORI - DATABASE SETUP
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- Safe to run on a brand-new project. It creates every table, the
-- security rules (row level security), storage buckets, and starter data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES (one row per login; role = parent or admin)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  email       text not null default '',
  phone       text not null default '' check (char_length(phone) <= 40),
  role        text not null default 'parent' check (role in ('parent', 'admin')),
  created_at  timestamptz not null default now()
);

-- True when the signed-in user is an admin. SECURITY DEFINER lets the
-- check read profiles without tripping over its own RLS policy.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'phone', ''), 40)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile email in sync when a user changes their login email.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- Parents can edit their name/phone, but never their role or email.
create or replace function public.guard_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id <> old.id then
      raise exception 'Profile id cannot change';
    end if;
    if new.email is distinct from old.email then
      new.email := old.email;
    end if;
    if new.role is distinct from old.role and not public.is_admin() then
      raise exception 'Only an admin can change account roles';
    end if;
    if new.id = auth.uid() and new.role <> 'admin' and old.role = 'admin' then
      raise exception 'Admins cannot remove their own admin access';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile();

-- ---------------------------------------------------------------------
-- 2. PROGRAMS AND TUITION RATES
-- ---------------------------------------------------------------------
create table public.programs (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name         text not null check (char_length(name) between 1 and 80),
  ages         text not null default '',
  description  text not null default '',
  icon         text not null default 'fa-star' check (icon ~ '^fa-[a-z0-9-]+$'),
  featured     boolean not null default false,
  active       boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create table public.program_rates (
  id            uuid primary key default gen_random_uuid(),
  program_id    uuid not null references public.programs(id) on delete cascade,
  label         text not null check (char_length(label) between 1 and 60),
  amount_cents  int not null check (amount_cents > 0 and amount_cents <= 10000000),
  sort_order    int not null default 0
);
create index on public.program_rates (program_id);

-- ---------------------------------------------------------------------
-- 3. CHILDREN (added by parents, approved/enrolled by admins)
-- ---------------------------------------------------------------------
create table public.children (
  id                       uuid primary key default gen_random_uuid(),
  parent_id                uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  full_name                text not null check (char_length(full_name) between 1 and 120),
  date_of_birth            date,
  allergies                text not null default '' check (char_length(allergies) <= 2000),
  medical_notes            text not null default '' check (char_length(medical_notes) <= 2000),
  emergency_contact_name   text not null default '' check (char_length(emergency_contact_name) <= 120),
  emergency_contact_phone  text not null default '' check (char_length(emergency_contact_phone) <= 40),
  authorized_pickups       text not null default '' check (char_length(authorized_pickups) <= 1000),
  program_id               uuid references public.programs(id) on delete set null,
  rate_id                  uuid references public.program_rates(id) on delete set null,
  status                   text not null default 'pending'
                             check (status in ('pending', 'enrolled', 'waitlisted', 'withdrawn')),
  start_date               date,
  admin_notes              text not null default '',
  created_at               timestamptz not null default now()
);
create index on public.children (parent_id);
create index on public.children (program_id);

-- Parents cannot enroll themselves or move a child to another family.
create or replace function public.guard_child()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_admin() or current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.parent_id := auth.uid();
    new.status := 'pending';
    new.start_date := null;
    new.admin_notes := '';
  else
    new.parent_id := old.parent_id;
    new.status := old.status;
    new.start_date := old.start_date;
    new.admin_notes := old.admin_notes;
    -- Program choice is locked once a child is enrolled
    if old.status = 'enrolled' then
      new.program_id := old.program_id;
      new.rate_id := old.rate_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger children_guard
  before insert or update on public.children
  for each row execute function public.guard_child();

-- Programs the signed-in parent has an enrolled child in.
create or replace function public.my_enrolled_program_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select distinct program_id from public.children
  where parent_id = auth.uid() and status = 'enrolled' and program_id is not null;
$$;

create or replace function public.has_enrolled_child()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.children
    where parent_id = auth.uid() and status = 'enrolled'
  );
$$;

create or replace function public.has_any_child()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.children
    where parent_id = auth.uid() and status in ('pending', 'enrolled', 'waitlisted')
  );
$$;

create or replace function public.is_my_child(child uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.children where id = child and parent_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- 4. PUBLIC FORMS: enrollment applications, tour requests, messages
-- ---------------------------------------------------------------------
create table public.enrollment_applications (
  id            uuid primary key default gen_random_uuid(),
  child_name    text not null check (char_length(child_name) between 1 and 120),
  child_dob     date,
  child_age     text not null default '' check (char_length(child_age) <= 60),
  program       text not null default '' check (char_length(program) <= 200),
  parent_name   text not null check (char_length(parent_name) between 1 and 120),
  email         text not null check (char_length(email) between 3 and 200),
  phone         text not null default '' check (char_length(phone) <= 40),
  start_date    date,
  notes         text not null default '' check (char_length(notes) <= 5000),
  status        text not null default 'new'
                  check (status in ('new', 'reviewing', 'accepted', 'waitlisted', 'declined')),
  submitted_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table public.tour_requests (
  id            uuid primary key default gen_random_uuid(),
  parent_name   text not null check (char_length(parent_name) between 1 and 120),
  email         text not null check (char_length(email) between 3 and 200),
  phone         text not null default '' check (char_length(phone) <= 40),
  tour_date     date,
  tour_time     text not null default '' check (char_length(tour_time) <= 20),
  child_age     text not null default '' check (char_length(child_age) <= 60),
  notes         text not null default '' check (char_length(notes) <= 3000),
  status        text not null default 'new'
                  check (status in ('new', 'confirmed', 'completed', 'cancelled')),
  submitted_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table public.contact_messages (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 120),
  email         text not null check (char_length(email) between 3 and 200),
  phone         text not null default '' check (char_length(phone) <= 40),
  subject       text not null default '' check (char_length(subject) <= 120),
  message       text not null check (char_length(message) between 1 and 5000),
  status        text not null default 'new' check (status in ('new', 'replied', 'closed')),
  submitted_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- Visitors can only submit with status 'new' and as themselves.
create or replace function public.guard_submission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.status := 'new';
    new.submitted_by := auth.uid();
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger applications_guard before insert on public.enrollment_applications
  for each row execute function public.guard_submission();
create trigger tours_guard before insert on public.tour_requests
  for each row execute function public.guard_submission();
create trigger messages_guard before insert on public.contact_messages
  for each row execute function public.guard_submission();

-- ---------------------------------------------------------------------
-- 5. SCHOOL CONTENT: announcements, events, staff, editable site text
-- ---------------------------------------------------------------------
create table public.announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 1 and 160),
  body          text not null default '' check (char_length(body) <= 5000),
  audience      text not null default 'everyone' check (audience in ('everyone', 'families')),
  pinned        boolean not null default false,
  published_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 160),
  event_date   date not null,
  end_date     date,
  time_label   text not null default '' check (char_length(time_label) <= 60),
  location     text not null default '' check (char_length(location) <= 160),
  type         text not null default 'general'
                 check (type in ('general', 'holiday', 'conference', 'field-trip', 'closure')),
  description  text not null default '' check (char_length(description) <= 3000),
  created_at   timestamptz not null default now()
);
create index on public.events (event_date);

create table public.staff (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 120),
  title        text not null default '',
  bio          text not null default '' check (char_length(bio) <= 3000),
  credentials  text not null default '',
  photo_url    text not null default '',
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

-- Any text or photo on the public pages that an admin edits in place.
create table public.site_content (
  key         text primary key check (key ~ '^[A-Za-z0-9_-]{1,80}$'),
  value       text not null check (char_length(value) <= 10000),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. FAMILY-ONLY: resources, daily reports, absences, payments
-- ---------------------------------------------------------------------
-- Curriculum PDFs, handbooks, forms. program_id null = every family.
create table public.resources (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 160),
  description  text not null default '',
  program_id   uuid references public.programs(id) on delete cascade,
  file_path    text not null unique,
  file_name    text not null default '',
  created_at   timestamptz not null default now()
);

create table public.daily_reports (
  id           uuid primary key default gen_random_uuid(),
  child_id     uuid not null references public.children(id) on delete cascade,
  report_date  date not null default current_date,
  mood         text not null default '' check (char_length(mood) <= 60),
  meals        text not null default '' check (char_length(meals) <= 1000),
  nap          text not null default '' check (char_length(nap) <= 200),
  activities   text not null default '' check (char_length(activities) <= 3000),
  notes        text not null default '' check (char_length(notes) <= 3000),
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index on public.daily_reports (child_id, report_date desc);

create table public.absences (
  id            uuid primary key default gen_random_uuid(),
  child_id      uuid not null references public.children(id) on delete cascade,
  absence_date  date not null,
  reason        text not null default '' check (char_length(reason) <= 1000),
  acknowledged  boolean not null default false,
  reported_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index on public.absences (absence_date);

create or replace function public.guard_absence()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.reported_by := auth.uid();
      new.acknowledged := false;
      if new.absence_date < current_date - 1 then
        raise exception 'Absences can only be reported for today or later';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger absences_guard before insert on public.absences
  for each row execute function public.guard_absence();

-- Payments are written by the Stripe webhook (service role) or by an
-- admin recording a check/cash payment. Parents can only read theirs.
create table public.payments (
  id                     uuid primary key default gen_random_uuid(),
  parent_id              uuid references public.profiles(id) on delete set null, -- kept if a login is deleted
  child_id               uuid references public.children(id) on delete set null,
  amount_cents           int not null check (amount_cents > 0),
  currency               text not null default 'usd',
  description            text not null default '',
  status                 text not null default 'pending'
                           check (status in ('pending', 'paid', 'failed', 'canceled', 'refunded')),
  method                 text not null default 'stripe'
                           check (method in ('stripe', 'check', 'cash', 'zelle', 'other')),
  stripe_session_id      text unique,
  stripe_payment_intent  text,
  paid_at                timestamptz,
  created_at             timestamptz not null default now()
);
create index on public.payments (parent_id, created_at desc);

-- ---------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.profiles                enable row level security;
alter table public.programs                enable row level security;
alter table public.program_rates           enable row level security;
alter table public.children                enable row level security;
alter table public.enrollment_applications enable row level security;
alter table public.tour_requests           enable row level security;
alter table public.contact_messages        enable row level security;
alter table public.announcements           enable row level security;
alter table public.events                  enable row level security;
alter table public.staff                   enable row level security;
alter table public.site_content            enable row level security;
alter table public.resources               enable row level security;
alter table public.daily_reports           enable row level security;
alter table public.absences                enable row level security;
alter table public.payments                enable row level security;

-- profiles
create policy "read own profile or admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "update own profile or admin" on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy "admin deletes profiles" on public.profiles
  for delete to authenticated using (public.is_admin() and id <> auth.uid());

-- programs + rates: public can see active programs, admins manage
create policy "anyone reads active programs" on public.programs
  for select to anon, authenticated using (active or public.is_admin());
create policy "admin manages programs" on public.programs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "anyone reads rates" on public.program_rates
  for select to anon, authenticated using (true);
create policy "admin manages rates" on public.program_rates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- children
create policy "parents read own children" on public.children
  for select to authenticated using (parent_id = auth.uid() or public.is_admin());
create policy "parents add children" on public.children
  for insert to authenticated with check (parent_id = auth.uid() or public.is_admin());
create policy "parents update own children" on public.children
  for update to authenticated using (parent_id = auth.uid() or public.is_admin())
  with check (parent_id = auth.uid() or public.is_admin());
create policy "parents remove pending children" on public.children
  for delete to authenticated
  using (public.is_admin() or (parent_id = auth.uid() and status in ('pending', 'withdrawn')));

-- public forms: anyone can submit, admins (and the submitter) can read
create policy "anyone submits applications" on public.enrollment_applications
  for insert to anon, authenticated with check (true);
create policy "submitter or admin reads applications" on public.enrollment_applications
  for select to authenticated using (public.is_admin() or submitted_by = auth.uid());
create policy "admin updates applications" on public.enrollment_applications
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes applications" on public.enrollment_applications
  for delete to authenticated using (public.is_admin());

create policy "anyone requests tours" on public.tour_requests
  for insert to anon, authenticated with check (true);
create policy "submitter or admin reads tours" on public.tour_requests
  for select to authenticated using (public.is_admin() or submitted_by = auth.uid());
create policy "admin updates tours" on public.tour_requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes tours" on public.tour_requests
  for delete to authenticated using (public.is_admin());

create policy "anyone sends messages" on public.contact_messages
  for insert to anon, authenticated with check (true);
create policy "sender or admin reads messages" on public.contact_messages
  for select to authenticated using (public.is_admin() or submitted_by = auth.uid());
create policy "admin updates messages" on public.contact_messages
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes messages" on public.contact_messages
  for delete to authenticated using (public.is_admin());

-- announcements: "everyone" is public, "families" needs a login
create policy "read announcements" on public.announcements
  for select to anon, authenticated
  using (
    public.is_admin()
    or (published_at <= now() and (audience = 'everyone' or auth.uid() is not null))
  );
create policy "admin manages announcements" on public.announcements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- events, staff, site content: public read, admin write
create policy "anyone reads events" on public.events
  for select to anon, authenticated using (true);
create policy "admin manages events" on public.events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "anyone reads staff" on public.staff
  for select to anon, authenticated using (true);
create policy "admin manages staff" on public.staff
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "anyone reads site content" on public.site_content
  for select to anon, authenticated using (true);
create policy "admin manages site content" on public.site_content
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- resources: all-school files (handbook, blank forms) for any family with a child on file;
-- program files only for families with a child enrolled in that program
create policy "families read resources" on public.resources
  for select to authenticated
  using (
    public.is_admin()
    or (program_id is null and public.has_any_child())
    or program_id in (select public.my_enrolled_program_ids())
  );
create policy "admin manages resources" on public.resources
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- daily reports: parents read their child's, admins write
create policy "parents read own reports" on public.daily_reports
  for select to authenticated using (public.is_admin() or public.is_my_child(child_id));
create policy "admin manages reports" on public.daily_reports
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- absences: parents report for their own children
create policy "parents read own absences" on public.absences
  for select to authenticated using (public.is_admin() or public.is_my_child(child_id));
create policy "parents report absences" on public.absences
  for insert to authenticated with check (public.is_admin() or public.is_my_child(child_id));
create policy "parents cancel upcoming absences" on public.absences
  for delete to authenticated
  using (public.is_admin() or (public.is_my_child(child_id) and absence_date >= current_date));
create policy "admin updates absences" on public.absences
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- payments: read own; admins record/adjust; Stripe webhook uses service role
create policy "parents read own payments" on public.payments
  for select to authenticated using (parent_id = auth.uid() or public.is_admin());
create policy "admin manages payments" on public.payments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- API access (row level security above still decides which rows)
grant usage on schema public to anon, authenticated, service_role;
grant select on public.programs, public.program_rates, public.announcements, public.events,
  public.staff, public.site_content to anon;
grant insert on public.enrollment_applications, public.tour_requests, public.contact_messages to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

-- Visitors never need these through the API
revoke all on public.payments, public.daily_reports, public.absences, public.children,
  public.profiles, public.resources from anon;

-- ---------------------------------------------------------------------
-- 8. STORAGE BUCKETS
--   media      public photos (site images, staff photos)
--   resources  private files (curriculum PDFs, handbooks)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('media', 'media', true, 5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('resources', 'resources', false, 26214400,
    array['application/pdf', 'image/jpeg', 'image/png',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create policy "admin uploads media" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and public.is_admin());
create policy "admin updates media" on storage.objects
  for update to authenticated using (bucket_id = 'media' and public.is_admin());
create policy "admin deletes media" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and public.is_admin());

create policy "families download resources" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resources'
    and (
      public.is_admin()
      or exists (
        select 1 from public.resources r
        where r.file_path = storage.objects.name
          and ((r.program_id is null and public.has_any_child())
               or r.program_id in (select public.my_enrolled_program_ids()))
      )
    )
  );
create policy "admin uploads resources" on storage.objects
  for insert to authenticated with check (bucket_id = 'resources' and public.is_admin());
create policy "admin updates resources" on storage.objects
  for update to authenticated using (bucket_id = 'resources' and public.is_admin());
create policy "admin deletes resources" on storage.objects
  for delete to authenticated using (bucket_id = 'resources' and public.is_admin());

-- ---------------------------------------------------------------------
-- 9. STARTER DATA (edit any of it later from the admin dashboard)
-- ---------------------------------------------------------------------
with p as (
  insert into public.programs (slug, name, ages, description, icon, featured, sort_order) values
    ('toddler', 'Toddler Program', 'Ages 2-3',
     'A gentle introduction to the Montessori environment focused on sensory exploration, motor skills, and building confidence.',
     'fa-baby', false, 1),
    ('primary', 'Primary Program', 'Ages 3-5',
     'Our core Montessori program where children develop independence, academic foundations, and social skills in a prepared environment.',
     'fa-star', true, 2),
    ('kindergarten', 'Kindergarten', 'Ages 5-6',
     'Advanced preparation for elementary school with emphasis on reading, writing, mathematics, and collaborative learning.',
     'fa-graduation-cap', false, 3)
  returning id, slug
)
insert into public.program_rates (program_id, label, amount_cents, sort_order)
select p.id, r.label, r.amount_cents, r.sort_order
from p
join (values
  ('toddler', 'Half-day', 85000, 1),
  ('toddler', 'Full-day', 120000, 2),
  ('primary', 'Half-day', 95000, 1),
  ('primary', 'Full-day', 140000, 2),
  ('primary', 'Extended', 165000, 3),
  ('kindergarten', 'Full-day', 140000, 1),
  ('kindergarten', 'Extended', 165000, 2)
) as r(slug, label, amount_cents, sort_order) on r.slug = p.slug;

insert into public.staff (name, sort_order) values
  ('Kartik Khanna', 1),
  ('Shruti Khanna', 2),
  ('Rishi Khanna', 3);

-- =====================================================================
-- PART 2: SCHOOL OPERATIONS
-- Documents, attendance, lesson progress, conferences, lunch menu,
-- photos, testimonials, careers.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 10. FAMILY DOCUMENTS (immunization records, signed forms)
--     Files live in the private "documents" bucket under <parent id>/...
-- ---------------------------------------------------------------------
create table public.family_documents (
  id           uuid primary key default gen_random_uuid(),
  child_id     uuid not null references public.children(id) on delete cascade,
  doc_type     text not null check (doc_type in ('immunization', 'enrollment_agreement', 'emergency_medical',
                 'allergy_plan', 'photo_release', 'other')),
  title        text not null default '' check (char_length(title) <= 160),
  file_path    text not null unique,
  file_name    text not null default '',
  status       text not null default 'submitted' check (status in ('submitted', 'approved', 'needs_update')),
  admin_note   text not null default '' check (char_length(admin_note) <= 1000),
  expires_on   date,
  uploaded_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index on public.family_documents (child_id);

create or replace function public.guard_document()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.status := 'submitted';
      new.admin_note := '';
      new.uploaded_by := auth.uid();
      if split_part(new.file_path, '/', 1) <> auth.uid()::text then
        raise exception 'Upload path must be in your own folder';
      end if;
    else
      raise exception 'Only the office can change a submitted document';
    end if;
  end if;
  return new;
end;
$$;

create trigger documents_guard before insert or update on public.family_documents
  for each row execute function public.guard_document();

-- ---------------------------------------------------------------------
-- 11. ATTENDANCE (daily check-in / check-out)
-- ---------------------------------------------------------------------
create table public.attendance (
  id              uuid primary key default gen_random_uuid(),
  child_id        uuid not null references public.children(id) on delete cascade,
  att_date        date not null,
  check_in_at     timestamptz,
  check_out_at    timestamptz,
  dropped_off_by  text not null default '' check (char_length(dropped_off_by) <= 120),
  picked_up_by    text not null default '' check (char_length(picked_up_by) <= 120),
  note            text not null default '' check (char_length(note) <= 500),
  recorded_by     uuid default auth.uid() references public.profiles(id) on delete set null,
  unique (child_id, att_date)
);
create index on public.attendance (att_date);

-- ---------------------------------------------------------------------
-- 12. LESSON PROGRESS (Montessori areas and lessons)
-- ---------------------------------------------------------------------
create table public.lessons (
  id          uuid primary key default gen_random_uuid(),
  area        text not null check (area in ('Practical Life', 'Sensorial', 'Language', 'Mathematics', 'Culture', 'Art & Music')),
  name        text not null check (char_length(name) between 1 and 120),
  sort_order  int not null default 0,
  active      boolean not null default true,
  unique (area, name)
);

create table public.child_lessons (
  child_id    uuid not null references public.children(id) on delete cascade,
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  stage       text not null check (stage in ('introduced', 'practicing', 'mastered')),
  note        text not null default '' check (char_length(note) <= 500),
  updated_at  timestamptz not null default now(),
  primary key (child_id, lesson_id)
);

-- ---------------------------------------------------------------------
-- 13. PARENT-TEACHER CONFERENCES
-- ---------------------------------------------------------------------
create table public.conference_slots (
  id          uuid primary key default gen_random_uuid(),
  starts_at   timestamptz not null,
  minutes     int not null default 20 check (minutes between 5 and 120),
  location    text not null default 'In person' check (char_length(location) <= 160),
  child_id    uuid references public.children(id) on delete set null,
  booked_by   uuid references public.profiles(id) on delete set null,
  booked_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.conference_slots (starts_at);

-- Parents book through these functions so two families can never grab the same slot.
create or replace function public.book_conference_slot(slot uuid, child uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.children where id = child and parent_id = auth.uid() and status = 'enrolled') then
    raise exception 'Only enrolled children can book a conference';
  end if;
  if exists (select 1 from public.conference_slots where child_id = child and starts_at > now()) then
    raise exception 'This child already has an upcoming conference. Cancel it first to pick a new time.';
  end if;
  update public.conference_slots
     set child_id = child, booked_by = auth.uid(), booked_at = now()
   where id = slot and child_id is null and starts_at > now();
  if not found then
    raise exception 'Sorry, that time was just taken. Please pick another.';
  end if;
end;
$$;

create or replace function public.cancel_conference_booking(slot uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update public.conference_slots
     set child_id = null, booked_by = null, booked_at = null
   where id = slot and starts_at > now()
     and (public.is_admin() or child_id in (select id from public.children where parent_id = auth.uid()));
  if not found then
    raise exception 'That booking could not be canceled';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 14. LUNCH MENU
-- ---------------------------------------------------------------------
create table public.menu_days (
  menu_date        date primary key,
  morning_snack    text not null default '' check (char_length(morning_snack) <= 300),
  lunch            text not null default '' check (char_length(lunch) <= 500),
  afternoon_snack  text not null default '' check (char_length(afternoon_snack) <= 300),
  notes            text not null default '' check (char_length(notes) <= 300),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 15. PHOTOS
--   public photos -> "media" bucket (anyone can view)
--   families-only -> "family-photos" bucket (enrolled families only)
-- ---------------------------------------------------------------------
create table public.gallery_photos (
  id          uuid primary key default gen_random_uuid(),
  bucket      text not null check (bucket in ('media', 'family-photos')),
  file_path   text not null unique,
  caption     text not null default '' check (char_length(caption) <= 200),
  category    text not null default 'activities' check (category in ('classrooms', 'outdoor', 'activities', 'events', 'campus')),
  visibility  text not null default 'public' check (visibility in ('public', 'families')),
  taken_on    date,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  check ((visibility = 'public' and bucket = 'media') or (visibility = 'families' and bucket = 'family-photos'))
);

-- ---------------------------------------------------------------------
-- 16. TESTIMONIALS (real quotes from families, entered by an admin)
-- ---------------------------------------------------------------------
create table public.testimonials (
  id          uuid primary key default gen_random_uuid(),
  quote       text not null check (char_length(quote) between 1 and 1000),
  author      text not null check (char_length(author) between 1 and 120),
  published   boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 17. CAREERS
-- ---------------------------------------------------------------------
create table public.job_postings (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(title) between 1 and 120),
  employment_type  text not null default 'Full-time' check (char_length(employment_type) <= 60),
  description      text not null default '' check (char_length(description) <= 5000),
  active           boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);

create table public.job_applications (
  id           uuid primary key default gen_random_uuid(),
  posting_id   uuid references public.job_postings(id) on delete set null,
  position     text not null default '' check (char_length(position) <= 160),
  name         text not null check (char_length(name) between 1 and 120),
  email        text not null check (char_length(email) between 3 and 200),
  phone        text not null default '' check (char_length(phone) <= 40),
  credentials  text not null default '' check (char_length(credentials) <= 1000),
  experience   text not null default '' check (char_length(experience) <= 5000),
  message      text not null default '' check (char_length(message) <= 5000),
  resume_path  text check (resume_path is null or resume_path like 'resumes/%'),
  status       text not null default 'new' check (status in ('new', 'reviewing', 'interview', 'hired', 'declined')),
  created_at   timestamptz not null default now()
);

create or replace function public.guard_job_application()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.status := 'new';
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger job_applications_guard before insert on public.job_applications
  for each row execute function public.guard_job_application();

-- ---------------------------------------------------------------------
-- 18. SECURITY RULES FOR PART 2
-- ---------------------------------------------------------------------
alter table public.family_documents  enable row level security;
alter table public.attendance        enable row level security;
alter table public.lessons           enable row level security;
alter table public.child_lessons     enable row level security;
alter table public.conference_slots  enable row level security;
alter table public.menu_days         enable row level security;
alter table public.gallery_photos    enable row level security;
alter table public.testimonials      enable row level security;
alter table public.job_postings      enable row level security;
alter table public.job_applications  enable row level security;

-- documents
create policy "parents read own documents" on public.family_documents
  for select to authenticated using (public.is_admin() or public.is_my_child(child_id));
create policy "parents upload documents" on public.family_documents
  for insert to authenticated with check (public.is_admin() or public.is_my_child(child_id));
create policy "admin reviews documents" on public.family_documents
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "parents remove unapproved documents" on public.family_documents
  for delete to authenticated
  using (public.is_admin() or (public.is_my_child(child_id) and status <> 'approved'));

-- attendance
create policy "parents read own attendance" on public.attendance
  for select to authenticated using (public.is_admin() or public.is_my_child(child_id));
create policy "admin records attendance" on public.attendance
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- lessons + progress
create policy "families read lessons" on public.lessons
  for select to authenticated using (true);
create policy "admin manages lessons" on public.lessons
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "parents read own progress" on public.child_lessons
  for select to authenticated using (public.is_admin() or public.is_my_child(child_id));
create policy "admin records progress" on public.child_lessons
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- conferences: parents see open times and their own bookings only
create policy "families see open and own slots" on public.conference_slots
  for select to authenticated
  using (
    public.is_admin()
    or (public.has_enrolled_child() and (child_id is null or public.is_my_child(child_id)))
  );
create policy "admin manages slots" on public.conference_slots
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- menu, testimonials, job postings: public read, admin write
create policy "anyone reads menu" on public.menu_days
  for select to anon, authenticated using (true);
create policy "admin manages menu" on public.menu_days
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "anyone reads published testimonials" on public.testimonials
  for select to anon, authenticated using (published or public.is_admin());
create policy "admin manages testimonials" on public.testimonials
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "anyone reads open jobs" on public.job_postings
  for select to anon, authenticated using (active or public.is_admin());
create policy "admin manages jobs" on public.job_postings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "anyone applies for jobs" on public.job_applications
  for insert to anon, authenticated with check (true);
create policy "admin reads job applications" on public.job_applications
  for select to authenticated using (public.is_admin());
create policy "admin updates job applications" on public.job_applications
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes job applications" on public.job_applications
  for delete to authenticated using (public.is_admin());

-- photos
create policy "read photos" on public.gallery_photos
  for select to anon, authenticated
  using (visibility = 'public' or public.is_admin() or public.has_enrolled_child());
create policy "admin manages photos" on public.gallery_photos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- API access for part 2
grant select on public.menu_days, public.testimonials, public.job_postings, public.gallery_photos to anon;
grant insert on public.job_applications to anon;
grant select, insert, update, delete on public.family_documents, public.attendance, public.lessons,
  public.child_lessons, public.conference_slots, public.menu_days, public.gallery_photos,
  public.testimonials, public.job_postings, public.job_applications to authenticated;
grant all on public.family_documents, public.attendance, public.lessons, public.child_lessons,
  public.conference_slots, public.menu_days, public.gallery_photos, public.testimonials,
  public.job_postings, public.job_applications to service_role;
revoke all on public.family_documents, public.attendance, public.child_lessons, public.conference_slots from anon;
revoke execute on function public.book_conference_slot(uuid, uuid), public.cancel_conference_booking(uuid) from anon, public;
grant execute on function public.book_conference_slot(uuid, uuid), public.cancel_conference_booking(uuid) to authenticated;
grant execute on function public.guard_document(), public.guard_job_application() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 19. STORAGE FOR PART 2
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp']),
  ('family-photos', 'family-photos', false, 8388608,
    array['image/jpeg', 'image/png', 'image/webp']),
  ('applications', 'applications', false, 5242880,
    array['application/pdf', 'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

-- documents: each parent uploads into and reads from their own folder
create policy "parents upload own documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
create policy "parents read own documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
create policy "parents delete own documents" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));

-- families-only photos
create policy "families view family photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'family-photos' and (public.is_admin() or public.has_enrolled_child()));
create policy "admin uploads family photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'family-photos' and public.is_admin());
create policy "admin deletes family photos" on storage.objects
  for delete to authenticated using (bucket_id = 'family-photos' and public.is_admin());

-- job applicants can upload a resume but never read the bucket
create policy "applicants upload resumes" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'applications' and (storage.foldername(name))[1] = 'resumes');
create policy "admin reads resumes" on storage.objects
  for select to authenticated using (bucket_id = 'applications' and public.is_admin());
create policy "admin deletes resumes" on storage.objects
  for delete to authenticated using (bucket_id = 'applications' and public.is_admin());

-- ---------------------------------------------------------------------
-- 20. STARTER LESSON LIST (edit from Admin > Progress)
-- ---------------------------------------------------------------------
insert into public.lessons (area, name, sort_order) values
  ('Practical Life', 'Pouring (dry and wet)', 1),
  ('Practical Life', 'Spooning and transferring', 2),
  ('Practical Life', 'Dressing frames', 3),
  ('Practical Life', 'Table washing', 4),
  ('Practical Life', 'Food preparation', 5),
  ('Practical Life', 'Grace and courtesy', 6),
  ('Practical Life', 'Care of plants', 7),
  ('Sensorial', 'Knobbed cylinders', 1),
  ('Sensorial', 'Pink tower', 2),
  ('Sensorial', 'Brown stair', 3),
  ('Sensorial', 'Red rods', 4),
  ('Sensorial', 'Color tablets', 5),
  ('Sensorial', 'Geometric cabinet', 6),
  ('Sensorial', 'Sound cylinders', 7),
  ('Language', 'Sound games (I spy)', 1),
  ('Language', 'Sandpaper letters', 2),
  ('Language', 'Moveable alphabet', 3),
  ('Language', 'Metal insets', 4),
  ('Language', 'Phonetic reading', 5),
  ('Language', 'Puzzle words (sight words)', 6),
  ('Language', 'Writing sentences', 7),
  ('Mathematics', 'Number rods', 1),
  ('Mathematics', 'Sandpaper numerals', 2),
  ('Mathematics', 'Spindle boxes', 3),
  ('Mathematics', 'Cards and counters', 4),
  ('Mathematics', 'Golden beads (decimal system)', 5),
  ('Mathematics', 'Teen and ten boards', 6),
  ('Mathematics', 'Addition and subtraction strip boards', 7),
  ('Culture', 'Land, air, and water', 1),
  ('Culture', 'Puzzle maps', 2),
  ('Culture', 'Parts of a plant', 3),
  ('Culture', 'Living and non-living', 4),
  ('Culture', 'Calendar and seasons', 5),
  ('Art & Music', 'Color mixing', 1),
  ('Art & Music', 'Rhythm and movement', 2),
  ('Art & Music', 'Bells', 3);
