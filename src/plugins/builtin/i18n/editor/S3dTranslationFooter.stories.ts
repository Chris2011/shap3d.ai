import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTranslationFooter from './S3dTranslationFooter.vue';

const meta = {
  title: 'Plugins/Languages/Translation editor/TranslationFooter',
  component: S3dTranslationFooter,
} satisfies Meta<typeof S3dTranslationFooter>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
