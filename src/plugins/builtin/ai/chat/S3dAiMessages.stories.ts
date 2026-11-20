import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dAiMessages from './S3dAiMessages.vue';

const meta = {
  title: 'Plugins/AI/Chat/AiMessages',
  component: S3dAiMessages,
  args: { now: Date.parse('2026-11-20T10:00:00Z') },
} satisfies Meta<typeof S3dAiMessages>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
