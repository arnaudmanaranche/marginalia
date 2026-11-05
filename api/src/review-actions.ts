// What "Submit review" can do once the pending comments are published (comment, approve,
// request_changes; the contract validates which). Pure, so it is unit-tested without GitLab.

// The `reviewer_state` of draft_notes/bulk_publish, if the action sets one.
export function reviewerStateFor(action: any) {
  return action === 'request_changes' ? 'requested_changes' : undefined;
}
