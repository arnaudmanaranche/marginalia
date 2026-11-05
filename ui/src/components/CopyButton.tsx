import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from '../lib/toast';
import { Button } from './ui/Button';

// Copies a comment to the clipboard and says so, on the button and in a toast.
export function CopyButton({ getText, label, disabled }: { getText: () => string; label: string; disabled?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      disabled={disabled}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(getText());
          setDone(true);
          setTimeout(() => setDone(false), 1500);
          toast.success('Comment copied to clipboard');
        } catch {
          toast.error('Could not copy: clipboard access was denied');
        }
      }}
    >
      {done ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
      {done ? 'Copied' : label}
    </Button>
  );
}
