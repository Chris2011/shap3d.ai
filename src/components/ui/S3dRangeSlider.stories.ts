import { ref } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dRangeSlider from './S3dRangeSlider.vue';

const meta = {
  title: 'UI/RangeSlider',
  component: S3dRangeSlider,
  args: { modelValue: 40, min: 0, max: 100, step: 1 },
  render: (args) => ({
    components: { S3dRangeSlider },
    setup: () => ({ args, value: ref(args.modelValue) }),
    template: '<S3dRangeSlider v-bind="args" v-model="value" />',
  }),
} satisfies Meta<typeof S3dRangeSlider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Fine: Story = { args: { modelValue: 0.5, min: 0, max: 1, step: 0.01 } };
