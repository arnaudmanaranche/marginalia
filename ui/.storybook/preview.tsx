import type { Preview } from '@storybook/react-vite';
import { LazyMotion, domMax } from 'motion/react';
import '../src/index.css';
import { applyTheme, type ThemeChoice } from '../src/lib/theme';

// The studio reads data-theme (lib/theme.ts): the toolbar sets it, "System" follows the OS.
const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    controls: { matchers: { date: /At$/ } },
    a11y: { test: 'todo' },
  },
  globalTypes: {
    theme: { description: 'Theme', toolbar: { title: 'Theme', icon: 'mirror', items: ['system', 'light', 'dark'], dynamicTitle: true } },
  },
  initialGlobals: { theme: 'system' },
  decorators: [
    (Story, context) => {
      applyTheme(context.globals.theme as ThemeChoice);
      // The app loads the animation features lazily (App.tsx); a story has them from the start.
      return <LazyMotion features={domMax} strict><Story /></LazyMotion>;
    },
  ],
};
export default preview;
