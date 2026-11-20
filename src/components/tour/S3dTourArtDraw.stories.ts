import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTourArtDraw from './S3dTourArtDraw.vue';

const meta = {
  title: 'Welcome tour/TourArtDraw',
  component: S3dTourArtDraw,
} satisfies Meta<typeof S3dTourArtDraw>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
