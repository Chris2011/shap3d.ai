import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dScriptRunButton from './S3dScriptRunButton.vue';

const meta = {
  title: 'Panels/Script editor/ScriptRunButton',
  component: S3dScriptRunButton,
  args: { running: false },
} satisfies Meta<typeof S3dScriptRunButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};
export const Running: Story = { args: { running: true } };
