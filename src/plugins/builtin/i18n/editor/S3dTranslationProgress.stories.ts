import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTranslationProgress from './S3dTranslationProgress.vue';

const meta = {
  title: 'Plugins/Languages/Translation editor/TranslationProgress',
  component: S3dTranslationProgress,
} satisfies Meta<typeof S3dTranslationProgress>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
