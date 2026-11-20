import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTourArtAi from './S3dTourArtAi.vue';

const meta = {
  title: 'Welcome tour/TourArtAi',
  component: S3dTourArtAi,
} satisfies Meta<typeof S3dTourArtAi>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
