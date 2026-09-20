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

-- Emptied rather than converted, and said in SQL rather than left to whoever
-- runs this. A sealed ballot is a digest over a voter and one team, and the new
-- column has no honest value to give it: the ten points it would have to spend
-- were never part of what that voter signed. Adding a non null column over rows
-- that cannot have one would fail here anyway, so the choice is made in the
-- open.
delete from public.ballots;

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
--
-- Written as a JSON path rather than as a walk over `jsonb_array_elements`,
-- because a check constraint may not contain a subquery. The path counts the
-- entries that are well formed and the constraint insists that is all of them,
-- which is the one phrasing that also catches an entry missing a field
-- altogether: a missing key drops out of the filter rather than failing it.
alter table public.ballots
  add constraint ballots_choices_shaped check (
    jsonb_typeof(choices) = 'array'
    and jsonb_array_length(choices) > 0
    and jsonb_array_length(
      jsonb_path_query_array(
        choices,
        '$[*] ? (@.team.type() == "number" && @.weight.type() == "number" && @.team > 0 && @.weight > 0)'
      )
    ) = jsonb_array_length(choices)
  );

comment on column public.ballots.choices is
  'The whole ballot, ascending by team, exactly as it was hashed into the sealed leaf.';
