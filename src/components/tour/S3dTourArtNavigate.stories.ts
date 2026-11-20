import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTourArtNavigate from './S3dTourArtNavigate.vue';

const meta = {
  title: 'Welcome tour/TourArtNavigate',
  component: S3dTourArtNavigate,
} satisfies Meta<typeof S3dTourArtNavigate>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
