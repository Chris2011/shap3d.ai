import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dViewport from './S3dViewport.vue';

const meta = {
  title: 'App/Viewport',
  component: S3dViewport,
} satisfies Meta<typeof S3dViewport>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
