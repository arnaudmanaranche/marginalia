import { createRoute, type RouteConfig } from '@hono/zod-openapi';
import { ErrorBody } from '@worldia/marginalia-contract';

// Small helpers so a route reads as what it takes and what it gives.
export const jsonOf = (schema, description) => ({ description, content: { 'application/json': { schema } } });
export const jsonBody = (schema) => ({ required: true, content: { 'application/json': { schema } } });

const ERRORS = {
  400: 'Invalid input.',
  403: 'Posting or pushing is disabled, or the `Host`/`Origin` is not the studio\'s own.',
  404: 'Unknown review, no tracked merge request for it, or the draft no longer exists.',
  409: 'The request conflicts with the current state.',
  415: 'The body is not `application/json`.',
  429: 'Another question is being answered.',
  502: 'GitLab (or Claude) refused or failed the call.',
};

/**
 * A route as the OpenAPI document wants it, plus `errors`: the status codes (see ERRORS) that
 * answer `{ error }`, so each route lists what it can refuse without repeating the shape.
 * @param {import('@hono/zod-openapi').RouteConfig & { errors?: (keyof typeof ERRORS)[] }} config
 */
export function route({ errors = [], responses, ...rest }: Omit<RouteConfig, 'path'> & { path: string; errors?: (keyof typeof ERRORS)[] }) {
  const failures = Object.fromEntries(errors.map((code) => [code, jsonOf(ErrorBody, ERRORS[code])]));
  return createRoute({ ...rest, responses: { ...responses, ...failures } });
}
