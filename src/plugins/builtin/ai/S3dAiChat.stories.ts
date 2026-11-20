import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dAiChat from './S3dAiChat.vue';

const meta = {
  title: 'Plugins/AI/AiChat',
  component: S3dAiChat,
} satisfies Meta<typeof S3dAiChat>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
