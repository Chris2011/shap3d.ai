import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTourArtLook from './S3dTourArtLook.vue';

const meta = {
  title: 'Welcome tour/TourArtLook',
  component: S3dTourArtLook,
} satisfies Meta<typeof S3dTourArtLook>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
