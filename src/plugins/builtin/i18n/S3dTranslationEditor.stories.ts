import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTranslationEditor from './S3dTranslationEditor.vue';

const meta = {
  title: 'Plugins/Languages/TranslationEditor',
  component: S3dTranslationEditor,
} satisfies Meta<typeof S3dTranslationEditor>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
