import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dIconButton from './S3dIconButton.vue';

const meta = {
  title: 'UI/IconButton',
  component: S3dIconButton,
  args: { icon: 'pushpull', label: 'Drücken/Ziehen', active: false, iconSize: 24 },
} satisfies Meta<typeof S3dIconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Active: Story = { args: { active: true } };
