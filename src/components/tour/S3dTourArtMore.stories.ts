import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTourArtMore from './S3dTourArtMore.vue';

const meta = {
  title: 'Welcome tour/TourArtMore',
  component: S3dTourArtMore,
} satisfies Meta<typeof S3dTourArtMore>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
