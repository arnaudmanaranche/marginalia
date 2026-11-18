import { sendJson } from './fetchRetry';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

// One question about a tour stop. Slow (a headless Claude run), so callers show a pending state.
export async function askAboutStop(slug: string, stopId: string, question: string, history: ChatMessage[]): Promise<string> {
  return (await sendJson<{ answer: string }>('POST', '/api/chat', { slug, stopId, question, history })).answer;
}
