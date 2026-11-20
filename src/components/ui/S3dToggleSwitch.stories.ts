import { ref } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dToggleSwitch from './S3dToggleSwitch.vue';

const meta = {
  title: 'UI/ToggleSwitch',
  component: S3dToggleSwitch,
  args: { modelValue: true, label: 'Schatten', small: false, readonly: false },
  render: (args) => ({
    components: { S3dToggleSwitch },
    setup: () => ({ args, value: ref(args.modelValue) }),
    template: '<S3dToggleSwitch v-bind="args" v-model="value" />',
  }),
} satisfies Meta<typeof S3dToggleSwitch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const On: Story = {};
export const Off: Story = { args: { modelValue: false } };
export const Small: Story = { args: { small: true } };
export const Readonly: Story = { args: { readonly: true } };
