import { fullName } from './names.mjs';

export const badge = (person) => `${fullName(person)} (${person.team})`;
