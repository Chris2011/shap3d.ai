import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dStatusMessage from './S3dStatusMessage.vue';

const meta = {
  title: 'UI/StatusMessage',
  component: S3dStatusMessage,
  args: { text: 'Gespeichert.', error: false },
} satisfies Meta<typeof S3dStatusMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Error: Story = { args: { text: 'Die Datei konnte nicht gelesen werden.', error: true } };
