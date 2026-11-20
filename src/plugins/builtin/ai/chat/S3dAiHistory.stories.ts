import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dAiHistory from './S3dAiHistory.vue';

const meta = {
  title: 'Plugins/AI/Chat/AiHistory',
  component: S3dAiHistory,
  args: { search: '' },
} satisfies Meta<typeof S3dAiHistory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
