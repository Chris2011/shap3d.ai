import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dMenuItem from './S3dMenuItem.vue';

const meta = {
  title: 'UI/MenuItem',
  component: S3dMenuItem,
  args: { icon: 'move', shortcut: 'M', disabled: false, submenu: false },
  render: (args) => ({
    components: { S3dMenuItem },
    setup: () => ({ args }),
    template: `<S3dMenuItem v-bind="args">Verschieben</S3dMenuItem>`,
  }),
} satisfies Meta<typeof S3dMenuItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Checked: Story = { args: { icon: undefined, iconSpace: false, checked: true, shortcut: undefined } };
export const Disabled: Story = { args: { disabled: true } };
export const Submenu: Story = { args: { submenu: true, shortcut: undefined } };
