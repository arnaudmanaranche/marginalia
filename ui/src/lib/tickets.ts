// Ticket keys (`FEE-194`) link to their page on the tracker. Only keys of a project the studio has
// seen on an MR count: a bare `[A-Z]+-\d+` also matches `UTF-8` or `SHA-1`.
export interface TicketLinks {
  base: string;
  prefixes: string[];
}

const KEY = /\b([A-Z][A-Z0-9]+)-\d+\b/g;

// The tracker address and the ticket projects named by the MRs' titles and tickets; null without an address.
export function ticketLinks(baseUrl: string | null, items: { title: string; jira: { key: string } | null }[]): TicketLinks | null {
  if (!baseUrl) return null;
  const prefixes = new Set<string>();
  for (const item of items) for (const text of [item.title, item.jira?.key ?? '']) for (const m of text.matchAll(KEY)) prefixes.add(m[1]);
  return { base: baseUrl.replace(/\/+$/, ''), prefixes: [...prefixes] };
}

// The page of a key found in text: only of a known project.
export function ticketUrl(tickets: TicketLinks | null, key: string): string | null {
  return tickets?.prefixes.includes(key.split('-')[0]) ? ticketPage(tickets, key) : null;
}

// The page of a key given as a ticket (a context source of kind `ticket`), whatever its project.
export function ticketPage(tickets: TicketLinks | null, key: string): string | null {
  return tickets ? `${tickets.base}/browse/${encodeURIComponent(key)}` : null;
}
