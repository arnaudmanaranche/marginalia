# Rules

- Settings come from `src/config.mjs` only: it reads `process.env` once and exports each value. No other
  module reads `process.env`, so every setting is listed in one place and has its default there.
