-- Scorecards and community ballots used to be hidden from client roles while
-- remaining plaintext to the collection service. Keep the existing Merkle
-- receipt/reveal protocol, but store Sub Rosa tlock ciphertext instead. The
-- service can open it only after the Drand round derived from the judging
-- deadline frozen in the constitution.

alter table public.scorecards
  alter column scores drop not null,
  add column tlock_round bigint,
  add column tlock_commitment bytea,
  add column ciphertext bytea;

alter table public.scorecards
  add constraint scorecards_plain_or_tlocked check (
    (scores is not null and tlock_round is null and tlock_commitment is null and ciphertext is null)
    or
    (scores is null and tlock_round is not null and tlock_commitment is not null and ciphertext is not null)
  );

comment on column public.scorecards.ciphertext is
  'Sub Rosa AGE/tlock envelope. Opens at the constitution judging deadline.';

comment on table public.scorecards is
  'Signed judge leaves. New payloads are Sub Rosa tlock ciphertext and cannot be opened before the constitution judging deadline.';

alter table public.ballots
  drop constraint ballots_choices_shaped,
  alter column choices drop not null,
  add column tlock_round bigint,
  add column tlock_commitment bytea,
  add column ciphertext bytea;

alter table public.ballots
  add constraint ballots_choices_shaped check (
    choices is null
    or (
      jsonb_typeof(choices) = 'array'
      and jsonb_array_length(choices) > 0
      and jsonb_array_length(
        jsonb_path_query_array(
          choices,
          '$[*] ? (@.team.type() == "number" && @.weight.type() == "number" && @.team > 0 && @.weight > 0)'
        )
      ) = jsonb_array_length(choices)
    )
  );

alter table public.ballots
  add constraint ballots_plain_or_tlocked check (
    (choices is not null and tlock_round is null and tlock_commitment is null and ciphertext is null)
    or
    (choices is null and tlock_round is not null and tlock_commitment is not null and ciphertext is not null)
  );

comment on column public.ballots.ciphertext is
  'Sub Rosa AGE/tlock envelope. Opens at the constitution judging deadline.';

comment on table public.ballots is
  'Signed community-vote leaves. New choices are Sub Rosa tlock ciphertext and cannot be opened before the constitution judging deadline.';
