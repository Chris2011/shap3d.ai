import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { useTourSteps } from '../../composables/useTourSteps';
import S3dTourStepText from './S3dTourStepText.vue';

const meta = {
  title: 'Welcome tour/TourStepText',
  component: S3dTourStepText,
  args: { index: 1 } as any,
  render: (args) => ({
    components: { S3dTourStepText },
    setup: () => ({ args, steps: useTourSteps().steps }),
    template: '<S3dTourStepText :step="steps[args.index]" :index="args.index" :count="steps.length" />',
  }),
} satisfies Meta<typeof S3dTourStepText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Welcome: Story = { args: { index: 0 } };
export const Draw: Story = {};
