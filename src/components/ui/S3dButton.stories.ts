import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dButton from './S3dButton.vue';

const meta = {
  title: 'UI/Button',
  component: S3dButton,
  args: { primary: false, small: false },
  render: (args) => ({
    components: { S3dButton },
    setup: () => ({ args }),
    template: `<S3dButton v-bind="args">Übernehmen</S3dButton>`,
  }),
} satisfies Meta<typeof S3dButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Primary: Story = { args: { primary: true } };
export const Small: Story = { args: { small: true } };
