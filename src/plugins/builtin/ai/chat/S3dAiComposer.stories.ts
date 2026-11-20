import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dAiComposer from './S3dAiComposer.vue';

const meta = {
  title: 'Plugins/AI/Chat/AiComposer',
  component: S3dAiComposer,
} satisfies Meta<typeof S3dAiComposer>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
