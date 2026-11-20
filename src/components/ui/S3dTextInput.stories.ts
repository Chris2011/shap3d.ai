import { ref } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTextInput from './S3dTextInput.vue';

const meta = {
  title: 'UI/TextInput',
  component: S3dTextInput,
  args: { modelValue: 'Haus' },
  render: (args) => ({
    components: { S3dTextInput },
    setup: () => ({ args, value: ref(args.modelValue) }),
    template: '<S3dTextInput v-bind="args" v-model="value" />',
  }),
} satisfies Meta<typeof S3dTextInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Number: Story = { args: { modelValue: 2.5 } };
