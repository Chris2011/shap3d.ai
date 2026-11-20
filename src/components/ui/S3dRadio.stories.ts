import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dRadio from './S3dRadio.vue';

const meta = {
  title: 'UI/Radio',
  component: S3dRadio,
  args: { name: 'unit', checked: true },
  render: (args) => ({
    components: { S3dRadio },
    setup: () => ({ args }),
    template: `<S3dRadio v-bind="args">Meter</S3dRadio>`,
  }),
} satisfies Meta<typeof S3dRadio>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Checked: Story = {};
export const Unchecked: Story = { args: { checked: false } };
