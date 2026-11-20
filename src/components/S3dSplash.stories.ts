import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dSplash from './S3dSplash.vue';

const meta = {
  title: 'App/Splash',
  component: S3dSplash,
} satisfies Meta<typeof S3dSplash>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
