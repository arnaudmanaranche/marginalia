// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmSubmit } from './ConfirmSubmit';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const mount = (onConfirm: (summary: string, action: string) => void, onCancel = vi.fn()) => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ drafts: [] }), text: async () => '{"drafts":[]}' })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ConfirmSubmit slug="back/feat-x" iid={7} count={2} canVerdict reload={() => {}} onCancel={onCancel} onConfirm={onConfirm} /></QueryClientProvider>);
};

describe('the submit dialog', () => {
  it('hands the summary and the default verdict over on confirm', async () => {
    const onConfirm = vi.fn();
    mount(onConfirm);
    fireEvent.change(screen.getByLabelText(/Summary/), { target: { value: 'Looks good' } });
    fireEvent.click(await waitFor(() => {
      const b = screen.getByRole('button', { name: /Submit comments/ }) as HTMLButtonElement;
      if (b.disabled) throw new Error('still loading the drafts');
      return b;
    }));
    expect(onConfirm).toHaveBeenCalledWith('Looks good', 'comment');
  });

  it('sends the verdict the user picked', async () => {
    const onConfirm = vi.fn();
    mount(onConfirm);
    fireEvent.click(screen.getByLabelText(/Approve/));
    const button = await screen.findByRole('button', { name: 'Approve', hidden: false });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledWith('', 'approve');
  });
});
