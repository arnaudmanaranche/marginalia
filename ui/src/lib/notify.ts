import type { Cue } from './sounds';

// A system notification for what the studio would sound, when the page is not the one in front: a
// sound nobody hears and a tab nobody sees say nothing. Off until the person turns it on in
// Settings (the browser asks then), for this browser only.
const KEY = 'marginalia.notifications';

const TEXT: Partial<Record<Cue, { title: string; body: string }>> = {
  arrive: { title: 'New MR to review', body: 'A merge request came into the queue.' },
  done: { title: 'A report is ready', body: 'A review or a comment triage has finished.' },
  comment: { title: 'A reviewer wrote on your MR', body: 'Open the studio to read it.' },
  failed: { title: 'A run failed', body: 'It needs a person to look at it.' },
};

export const notificationsSupported = () => typeof Notification !== 'undefined';

export function notificationsOn(): boolean {
  try {
    return notificationsSupported() && Notification.permission === 'granted' && localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

// Turning on asks the browser; resolves to whether it ended up on.
export async function setNotificationsOn(on: boolean): Promise<boolean> {
  try {
    if (on && notificationsSupported() && Notification.permission !== 'granted') await Notification.requestPermission();
    const granted = on && notificationsSupported() && Notification.permission === 'granted';
    localStorage.setItem(KEY, granted ? 'on' : 'off');
    return granted;
  } catch {
    return false;
  }
}

// One notification per cue (a tag replaces the previous of its kind), only while the page is hidden.
export function notify(cue: Cue) {
  const text = TEXT[cue];
  if (!text || !document.hidden || !notificationsOn()) return;
  try {
    const n = new Notification(text.title, { body: text.body, tag: `marginalia-${cue}` });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch { /* blocked or unsupported: stay silent */ }
}
