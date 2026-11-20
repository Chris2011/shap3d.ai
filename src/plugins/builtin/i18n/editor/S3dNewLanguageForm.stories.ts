import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dNewLanguageForm from './S3dNewLanguageForm.vue';

const meta = {
  title: 'Plugins/Languages/Translation editor/NewLanguageForm',
  component: S3dNewLanguageForm,
} satisfies Meta<typeof S3dNewLanguageForm>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
