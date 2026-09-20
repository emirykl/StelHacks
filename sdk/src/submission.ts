import { FieldRule, type SubmissionMetadata, type SubmissionRequirements } from "hackathon-core";

/**
 * A field the organizer asked for and the submission does not carry.
 *
 * Named rather than numbered, because the whole reason this check lives here
 * and not in the contract is that here it can say which field.
 */
export type SubmissionProblem =
  | "name"
  | "repository_url"
  | "demo_video_url"
  | "live_url"
  | "pitch_deck_url"
  | "deployed_contract";

/**
 * Everything the submission is missing, in the order a form would show it.
 *
 * This deliberately does not live in the contract. The metadata never reaches
 * the chain, only its digest does, so a contract side check would be validating
 * something it cannot see: a team could pass an empty write up and a digest of
 * a full one, and the contract would have no way to tell. The check belongs
 * wherever the metadata actually is, which is here, immediately before the
 * digest is computed.
 *
 * Presence is all that is checked. Whether a repository link resolves, or
 * points at an empty repository, is a judgement the screening round makes with
 * a reason attached, and no amount of client side validation can stand in for
 * it.
 *
 * Only `Required` produces a problem. A field the organizer left `Unasked` is
 * not reported even when the metadata carries one, because a team filling in
 * something nobody asked for has not broken a rule; the form simply never
 * offered them the box.
 */
export function validateSubmission(
  metadata: SubmissionMetadata,
  requirements: SubmissionRequirements,
): SubmissionProblem[] {
  const problems: SubmissionProblem[] = [];

  if (isBlank(metadata.name)) {
    problems.push("name");
  }

  /* Listed as pairs so the rule and the field it governs are written together.
     Split across four `if` blocks, adding a field meant remembering to add its
     rule, and the two drifting is a form that demands nothing. */
  const demanded: [FieldRule, SubmissionProblem, string][] = [
    [requirements.repository, "repository_url", metadata.repository_url],
    [requirements.demo_video, "demo_video_url", metadata.demo_video_url],
    [requirements.live_url, "live_url", metadata.live_url],
    [requirements.pitch_deck, "pitch_deck_url", metadata.pitch_deck_url],
    [requirements.deployed_contract, "deployed_contract", metadata.deployed_contract],
  ];

  for (const [rule, problem, value] of demanded) {
    if (rule === FieldRule.Required && isBlank(value)) {
      problems.push(problem);
    }
  }

  return problems;
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}
