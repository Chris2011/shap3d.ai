import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dAiUserTurn from './S3dAiUserTurn.vue';

const meta = {
  title: 'Plugins/AI/Chat/AiUserTurn',
  component: S3dAiUserTurn,
  args: {
    turn: { id: 1, role: 'user', text: 'Ein Tisch mit vier Beinen, 1,60 m lang', createdAt: Date.parse('2026-11-20T10:00:00Z') - 10000 },
  },
} satisfies Meta<typeof S3dAiUserTurn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
