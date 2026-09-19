import type { SubmissionMetadata, SubmissionRequirements } from "hackathon-core";

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
  | "live_url";

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
 */
export function validateSubmission(
  metadata: SubmissionMetadata,
  requirements: SubmissionRequirements,
): SubmissionProblem[] {
  const problems: SubmissionProblem[] = [];

  if (isBlank(metadata.name)) {
    problems.push("name");
  }
  if (requirements.repository_required && isBlank(metadata.repository_url)) {
    problems.push("repository_url");
  }
  if (requirements.demo_video_required && isBlank(metadata.demo_video_url)) {
    problems.push("demo_video_url");
  }
  if (requirements.live_url_required && isBlank(metadata.live_url)) {
    problems.push("live_url");
  }

  return problems;
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}
