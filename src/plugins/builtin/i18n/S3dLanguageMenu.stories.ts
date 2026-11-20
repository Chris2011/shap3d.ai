import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dLanguageMenu from './S3dLanguageMenu.vue';

const meta = {
  title: 'Plugins/Languages/LanguageMenu',
  component: S3dLanguageMenu,
} satisfies Meta<typeof S3dLanguageMenu>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
