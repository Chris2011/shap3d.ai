import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dAiAssistantTurn from './S3dAiAssistantTurn.vue';

const meta = {
  title: 'Plugins/AI/Chat/AiAssistantTurn',
  component: S3dAiAssistantTurn,
  args: {
    turn: {
      id: 2,
      role: 'assistant' as const,
      text: 'Ich baue einen Tisch mit vier Beinen aus Holz.',
      createdAt: Date.parse('2026-11-20T10:00:00Z') - 8000,
      endedAt: Date.parse('2026-11-20T10:00:00Z') - 2000,
      model: 'qwen2.5-coder:7b',
      code: "s3d.box([0, 0, 0.7], 1.6, 0.8, 0.05, { name: 'Platte' });",
      lang: 'js' as const,
      status: 'done' as const,
      result: '1 Gruppe gebaut',
    },
    now: Date.parse('2026-11-20T10:00:00Z'),
  },
} satisfies Meta<typeof S3dAiAssistantTurn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Done: Story = {};
export const Streaming: Story = {
  args: {
    turn: {
      ...{
        id: 2,
        role: 'assistant' as const,
        text: 'Ich baue einen Tisch mit vier Beinen aus Holz.',
        createdAt: Date.parse('2026-11-20T10:00:00Z') - 8000,
        endedAt: Date.parse('2026-11-20T10:00:00Z') - 2000,
        model: 'qwen2.5-coder:7b',
        code: "s3d.box([0, 0, 0.7], 1.6, 0.8, 0.05, { name: 'Platte' });",
        lang: 'js' as const,
        status: 'done' as const,
        result: '1 Gruppe gebaut',
      },
      status: 'streaming',
      endedAt: undefined,
    },
  },
};
export const Error: Story = {
  args: {
    turn: {
      ...{
        id: 2,
        role: 'assistant' as const,
        text: 'Ich baue einen Tisch mit vier Beinen aus Holz.',
        createdAt: Date.parse('2026-11-20T10:00:00Z') - 8000,
        endedAt: Date.parse('2026-11-20T10:00:00Z') - 2000,
        model: 'qwen2.5-coder:7b',
        code: "s3d.box([0, 0, 0.7], 1.6, 0.8, 0.05, { name: 'Platte' });",
        lang: 'js' as const,
        status: 'done' as const,
        result: '1 Gruppe gebaut',
      },
      status: 'error',
      error: 's3d.boxx is not a function',
    },
  },
};
