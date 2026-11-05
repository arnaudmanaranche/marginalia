import { toast as sonner } from 'sonner';
import { play } from './sounds';

// Sonner's toast, with a sound for how an action of mine ended: what went through, what failed.
export const toast = Object.assign((...args: Parameters<typeof sonner>) => sonner(...args), sonner, {
  success: (...args: Parameters<typeof sonner.success>) => {
    play('success');
    return sonner.success(...args);
  },
  // A review or replies gone to GitLab, where others will read them.
  sent: (...args: Parameters<typeof sonner.success>) => {
    play('sent');
    return sonner.success(...args);
  },
  error: (...args: Parameters<typeof sonner.error>) => {
    play('error');
    return sonner.error(...args);
  },
});
