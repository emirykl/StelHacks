-- A ballot stopped being a mark and became an amount to place.
--
-- One wallet now holds the points the constitution hands it and spreads them
-- across up to three projects, so a ballot is a list rather than a team. The
-- column goes with it: `team_id` could hold exactly one choice, and there is no
-- widening of it that would not be a second table.
--
-- Stored as written. The leaf the voter signed was hashed over this exact
-- sequence — ascending by team, each weight beside it — so anything that
-- reordered or renormalised it on the way back out would produce a digest no
-- inclusion proof matches, and the vote would be lost at the reveal with
-- nothing to say why.
--
-- Nothing is migrated across. Every row here is sealed for an event still in
-- its judging window, and there is no reading of a one project ballot that
-- turns it into a ten point one: the total it was meant to place is not
-- recorded anywhere. A testnet event mid vote when this lands has to collect
-- its ballots again, which is the honest outcome rather than a guess written
-- into somebody's vote.

alter table public.ballots
  drop constraint ballots_team_id_positive;

alter table public.ballots
  drop column team_id;

alter table public.ballots
  add column choices jsonb not null;

-- The shape, as far as the database can see it. Whether the ballot spends
-- exactly the power the rules hand out is a question about the constitution,
-- which lives on chain; the contract refuses a ballot that fails it at the
-- reveal, and the collection service refuses it on intake. What is checked here
-- is what no other reader should ever have to assume: a non empty array of
-- objects, each naming a positive team and a positive weight.
alter table public.ballots
  add constraint ballots_choices_shaped check (
    jsonb_typeof(choices) = 'array'
    and jsonb_array_length(choices) > 0
    and not exists (
      select 1
      from jsonb_array_elements(choices) as choice
      where jsonb_typeof(choice) <> 'object'
        or jsonb_typeof(choice -> 'team') <> 'number'
        or jsonb_typeof(choice -> 'weight') <> 'number'
        or (choice ->> 'team')::numeric <= 0
        or (choice ->> 'weight')::numeric <= 0
    )
  );

comment on column public.ballots.choices is
  'The whole ballot, ascending by team, exactly as it was hashed into the sealed leaf.';
