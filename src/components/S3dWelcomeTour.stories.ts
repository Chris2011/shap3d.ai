import { onUnmounted } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dWelcomeTour from './S3dWelcomeTour.vue';
import { openTour, closeTour } from './tour';

const meta = {
  title: 'App/WelcomeTour',
  component: S3dWelcomeTour,
  args: { step: 0 } as any,
  parameters: { layout: 'fullscreen' },
  render: (args: any) => ({
    components: { S3dWelcomeTour },
    setup: () => {
      openTour(args.step);
      onUnmounted(closeTour);
    },
    template: '<S3dWelcomeTour />',
  }),
} satisfies Meta<typeof S3dWelcomeTour>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Welcome: Story = {};
export const Draw: Story = { args: { step: 1 } as any };
