import { ref } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dSelect from './S3dSelect.vue';

const meta = {
  title: 'UI/Select',
  component: S3dSelect,
  args: { modelValue: 'm' },
  render: (args) => ({
    components: { S3dSelect },
    setup: () => ({ args, value: ref(args.modelValue) }),
    template:
      '<S3dSelect v-model="value"><option value="mm">Millimeter</option><option value="cm">Zentimeter</option><option value="m">Meter</option></S3dSelect>',
  }),
} satisfies Meta<typeof S3dSelect>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
