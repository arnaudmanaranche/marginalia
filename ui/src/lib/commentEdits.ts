import { KEY_PREFIX, readStored, writeStored } from './storage';

// Edits survive collapsing a section or reloading; keyed by the original text.
export const editKey = (original: string) => {
  let h = 0;
  for (let i = 0; i < original.length; i += 1) h = (h * 31 + original.charCodeAt(i)) | 0;
  return `${KEY_PREFIX}edit:${h}`;
};
export const readEdit = readStored;
export const writeEdit = writeStored;
