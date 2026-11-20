import { ref } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dCheckbox from './S3dCheckbox.vue';

const meta = {
  title: 'UI/Checkbox',
  component: S3dCheckbox,
  args: { modelValue: true, disabled: false },
  render: (args) => ({
    components: { S3dCheckbox },
    setup: () => ({ args, value: ref(args.modelValue) }),
    template: '<S3dCheckbox v-bind="args" v-model="value" />',
  }),
} satisfies Meta<typeof S3dCheckbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Checked: Story = {};
export const Unchecked: Story = { args: { modelValue: false } };
export const Disabled: Story = { args: { disabled: true } };
