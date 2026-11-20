import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { useTourSteps } from '../../composables/useTourSteps';
import S3dTourDots from './S3dTourDots.vue';

const meta = {
  title: 'Welcome tour/TourDots',
  component: S3dTourDots,
  args: { modelValue: 1 } as any,
  render: (args) => ({
    components: { S3dTourDots },
    setup: () => ({ steps: useTourSteps().steps, value: ref(args.modelValue) }),
    template: '<S3dTourDots :steps="steps" v-model="value" />',
  }),
} satisfies Meta<typeof S3dTourDots>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
