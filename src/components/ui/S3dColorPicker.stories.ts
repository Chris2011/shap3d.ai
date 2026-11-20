import { ref } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dColorPicker from './S3dColorPicker.vue';

const meta = {
  title: 'UI/ColorPicker',
  component: S3dColorPicker,
  args: { modelValue: '#3d7bd9', wide: false },
  render: (args) => ({
    components: { S3dColorPicker },
    setup: () => ({ args, value: ref(args.modelValue) }),
    template: '<S3dColorPicker v-bind="args" v-model="value" />',
  }),
} satisfies Meta<typeof S3dColorPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Wide: Story = { args: { wide: true } };
