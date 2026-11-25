# 0012. A sidebar, and Home opens on a briefing

Status: accepted, 2026-11-24. Amends 0007.

Home had become a list for its own sake. Under one line that needed a person sat the queue, then every job since the first one, day after day: thousands of pixels of rows that looked alike and asked nothing. The top bar held the other screens as icon buttons (approvals, settings), so the queue and the activity had no place of their own and landed on Home.

1. **A sidebar holds the screens.** Home, Approvals, Activity, Queue, then the projects (each opens its project context), and Settings at the foot. It folds to icons, kept per browser, and opens as a drawer on a narrow screen. The strip of open reviews stays at the top: it holds what is being read, the sidebar holds where things are. DESIGN.md's "There is no sidebar" is replaced.
2. **Activity and Queue are pages.** The job trace by day (0007, section 3) and the queue panel move to their own screens. `#/jobs` leads to Activity.
3. **Home opens on a briefing** (GLOSSARY: Briefing): a greeting, one sentence on what changed since you last looked, and only the notes that stand out. Then what needs you, ranked by what matters (critical findings and high risk before the rest), each row saying why. Beside it, the bot's day in brief: what it spent, ran and failed today, the queue's next steps and the last jobs, each leading to its page.

What stays from 0007: Home is where a person sees what needs them and what runs; nothing that waits on someone else is listed as theirs.
