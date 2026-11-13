import { describe, expect, it } from 'vitest';
import { isValidElement } from 'react';
import { linkify, type LinkContextValue } from './links';
import { ticketLinks, ticketPage } from './tickets';

const hrefs = (nodes: ReturnType<typeof linkify>) => nodes.filter(isValidElement).map((n) => (n.props as { href: string }).href);
const ctx = (tickets: LinkContextValue['tickets']): LinkContextValue => ({ projectUrl: null, branch: null, mrWebUrl: null, tickets });

describe('ticketLinks', () => {
  it("learns the ticket projects from the MRs' tickets and branch names, not from their titles", () => {
    const t = ticketLinks('https://acme.atlassian.net/', [
      { branch: 'agent/bugfix-fee-194-login-gate', jira: null },
      { branch: 'chore/search-modal', jira: { key: 'COL-1078' } },
      { branch: 'feat/PAM-748', jira: null },
    ]);
    expect(t).toEqual({ base: 'https://acme.atlassian.net', prefixes: ['FEE', 'COL', 'PAM'] });
  });

  it('is null without a Jira address', () => {
    expect(ticketLinks(null, [{ branch: 'feat/FEE-1', jira: null }])).toBeNull();
  });
});

describe('linkify with tickets', () => {
  const tickets = { base: 'https://acme.atlassian.net', prefixes: ['FEE'] };

  it('links a known ticket key to its page', () => {
    expect(hrefs(linkify('Fixes FEE-194 and FEE-203.', ctx(tickets)))).toEqual(['https://acme.atlassian.net/browse/FEE-194', 'https://acme.atlassian.net/browse/FEE-203']);
  });

  it('leaves alone what only looks like a key, and keys inside a branch name', () => {
    expect(hrefs(linkify('UTF-8 and SHA-1, on feat-FEE-194 and FEE-194/fix', ctx(tickets)))).toEqual([]);
  });

  it('links nothing without a Jira address', () => {
    expect(hrefs(linkify('FEE-194', ctx(null)))).toEqual([]);
  });
});

describe('ticketPage', () => {
  it('opens a key given as a ticket, whatever its project, once a tracker is set', () => {
    expect(ticketPage({ base: 'https://acme.atlassian.net', prefixes: [] }, 'ESD-1470')).toBe('https://acme.atlassian.net/browse/ESD-1470');
    expect(ticketPage(null, 'ESD-1470')).toBeNull();
  });
});
