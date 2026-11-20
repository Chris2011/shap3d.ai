import type { StorybookConfig } from '@storybook/vue3-vite';

/** Storybook for the Vue components of the app, the built-in plugins and the plugin packages (`npm run storybook`). */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.ts', '../plugins/*/src/**/*.stories.ts'],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/vue3-vite',
    // own Vite config: the app's one adds dev-server middlewares and a Content Security Policy that Storybook doesn't want
    // prop tables from the TypeScript types (vue-docgen-api, the old default, goes away with Storybook 11)
    options: { docgen: 'vue-component-meta', builder: { viteConfigPath: '.storybook/vite.config.ts' } },
  },
  core: { disableTelemetry: true },
};

export default config;
