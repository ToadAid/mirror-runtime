import { fetchPondIssueComments, parsePondResponseFromComment } from "./ingest.js";
import { createTraceId, type PondDispatchRequest, type PondDispatchResponse } from "./messages.js";
import { dispatchViaGitHubIssue } from "./transport.js";

export type PondOrchestrationResult = {
  delivered: boolean;
  issue_number?: number;
  target_repo: string | null;
  request: PondDispatchRequest;
  response: PondDispatchResponse | null;
  status: "target-missing" | "dispatch-failed" | "awaiting-response" | "completed";
};

export async function orchestratePondLoreQuery(params: {
  from: string;
  to: string;
  message: string;
}): Promise<PondOrchestrationResult> {
  const request: PondDispatchRequest = {
    from: params.from,
    to: params.to,
    type: "lore_query",
    message: params.message,
    trace_id: createTraceId(),
  };

  const dispatch = await dispatchViaGitHubIssue(request);

  if (!dispatch.delivered) {
    return {
      delivered: false,
      issue_number: dispatch.issue_number,
      target_repo: dispatch.repo,
      request,
      response: null,
      status: dispatch.repo === null ? "target-missing" : "dispatch-failed",
    };
  }

  if (!dispatch.issue_number || !dispatch.repo) {
    return {
      delivered: true,
      issue_number: dispatch.issue_number,
      target_repo: dispatch.repo,
      request,
      response: null,
      status: "awaiting-response",
    };
  }

  const comments = await fetchPondIssueComments(dispatch.repo, dispatch.issue_number);

  // Read newest-first to prefer the latest Cave Scribe response when multiple comments exist.
  for (let i = comments.length - 1; i >= 0; i -= 1) {
    const parsed = parsePondResponseFromComment(comments[i]?.body ?? "", request);
    if (parsed) {
      return {
        delivered: true,
        issue_number: dispatch.issue_number,
        target_repo: dispatch.repo,
        request,
        response: parsed,
        status: "completed",
      };
    }
  }

  return {
    delivered: true,
    issue_number: dispatch.issue_number,
    target_repo: dispatch.repo,
    request,
    response: null,
    status: "awaiting-response",
  };
}
