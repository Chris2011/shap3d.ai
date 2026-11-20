import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dAiChatHeader from './S3dAiChatHeader.vue';

const meta = {
  title: 'Plugins/AI/Chat/AiChatHeader',
  component: S3dAiChatHeader,
  args: { view: 'chat' },
} satisfies Meta<typeof S3dAiChatHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Chat: Story = {};
export const History: Story = { args: { view: 'history' } };
