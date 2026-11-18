// An id that sorts by time and reads as one: the ISO time with its `:` and `.` turned into `-`.
export const timeId = (iso: string) => iso.replace(/[:.]/g, '-');

// Whether `id` is safe to use in a file name.
export const isSafeId = (id: string) => /^[\w-]+$/.test(id);
