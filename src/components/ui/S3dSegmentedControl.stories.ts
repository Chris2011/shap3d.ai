import { ref } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dSegmentedControl from './S3dSegmentedControl.vue';

const meta = {
  title: 'UI/SegmentedControl',
  component: S3dSegmentedControl as any, // generic component: Storybook's types can't infer T
  args: {
    modelValue: 'light',
    options: [
      { value: 'light', label: 'Hell', icon: 'sun' },
      { value: 'dark', label: 'Dunkel', icon: 'moon' },
      { value: 'system', label: 'System' },
    ],
  },
  render: (args) => ({
    components: { S3dSegmentedControl },
    setup: () => ({ args, value: ref(args.modelValue) }),
    template: '<S3dSegmentedControl v-bind="args" v-model="value" />',
  }),
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Standard: Story = {};
