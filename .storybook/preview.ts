import '../src/migrate'; // must run before anything reads localStorage
import '../src/theme'; // sets data-theme before the first render
import '../src/styles.css';
import { provide } from 'vue';
import type { Decorator, Preview } from '@storybook/vue3-vite';
import { EDITOR } from '../src/components/keys';
import { setTheme } from '../src/theme';
import { setLanguage } from '../src/i18n';
import { editor, editorReady } from './editor';

const withEditor: Decorator = (story) => ({
  components: { story },
  setup: () => provide(EDITOR, editor),
  template: '<story />',
});

const preview: Preview = {
  decorators: [withEditor],
  loaders: [
    async ({ globals }) => {
      await editorReady;
      setLanguage(globals.locale ?? 'de');
      setTheme(globals.theme ?? 'light');
      return {};
    },
  ],
  globalTypes: {
    theme: {
      description: 'Hell oder dunkel',
      toolbar: {
        icon: 'mirror',
        dynamicTitle: true,
        items: [
          { value: 'light', title: 'Hell' },
          { value: 'dark', title: 'Dunkel' },
        ],
      },
    },
    locale: {
      description: 'Sprache',
      toolbar: {
        icon: 'globe',
        dynamicTitle: true,
        items: [
          { value: 'de', title: 'Deutsch' },
          { value: 'en', title: 'English' },
        ],
      },
    },
  },
  initialGlobals: { theme: 'light', locale: 'de' },
  parameters: {
    layout: 'padded',
    controls: { matchers: { color: /(color|Color)$/ } },
  },
  tags: ['autodocs'],
};

export default preview;
