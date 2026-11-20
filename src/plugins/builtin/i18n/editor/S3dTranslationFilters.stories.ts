import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTranslationFilters from './S3dTranslationFilters.vue';

const meta = {
  title: 'Plugins/Languages/Translation editor/TranslationFilters',
  component: S3dTranslationFilters,
} satisfies Meta<typeof S3dTranslationFilters>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
