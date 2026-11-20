import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTourArtWelcome from './S3dTourArtWelcome.vue';

const meta = {
  title: 'Welcome tour/TourArtWelcome',
  component: S3dTourArtWelcome,
} satisfies Meta<typeof S3dTourArtWelcome>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
