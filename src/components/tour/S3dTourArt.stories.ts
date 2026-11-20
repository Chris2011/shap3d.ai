import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTourArt from './S3dTourArt.vue';

const meta = {
  title: 'Welcome tour/TourArt',
  component: S3dTourArt,
  args: { step: 1 },
} satisfies Meta<typeof S3dTourArt>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Welcome: Story = { args: { step: 0 } };
export const Draw: Story = {};
export const Navigate: Story = { args: { step: 2 } };
