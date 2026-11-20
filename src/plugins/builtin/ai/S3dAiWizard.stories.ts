import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dAiWizard from './S3dAiWizard.vue';

const meta = {
  title: 'Plugins/AI/AiWizard',
  component: S3dAiWizard,
} satisfies Meta<typeof S3dAiWizard>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
