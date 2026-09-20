-- Where somebody is.
--
-- Two columns rather than one line of free text, because the country is worth
-- being able to group by later and "Istanbul, Turkey", "istanbul/TR" and
-- "İstanbul" are three spellings of one answer. The city stays free text: there
-- is no list of them worth shipping, and nobody is going to filter on it.

alter table public.profiles
  add column if not exists country text,
  add column if not exists city text;

comment on column public.profiles.country is
  'ISO 3166-1 alpha-2. Stored as the code so the name can be rendered in whatever language the reader is served.';

-- The code, not the name. A name is a display decision and this is data.
alter table public.profiles
  add constraint profiles_country_shape check (
    country is null or country ~ '^[A-Z]{2}$'
  );

alter table public.profiles
  add constraint profiles_city_length check (char_length(city) <= 60);

-- Grants are per column, so a new column is unreachable until it is named.
-- The policy already decides whose row it is.
grant update (country, city) on public.profiles to authenticated;
