import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dFieldRow from './S3dFieldRow.vue';

const meta = {
  title: 'UI/FieldRow',
  component: S3dFieldRow,
  args: { label: 'Breite' },
  render: (args) => ({
    components: { S3dFieldRow },
    setup: () => ({ args }),
    template: `<S3dFieldRow v-bind="args"><input class="s3d-input" value="2,40 m" /></S3dFieldRow>`,
  }),
} satisfies Meta<typeof S3dFieldRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const WithoutLabel: Story = { args: { label: undefined } };
