import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dMainToolbar from './S3dMainToolbar.vue';

const meta = {
  title: 'App/MainToolbar',
  component: S3dMainToolbar,
} satisfies Meta<typeof S3dMainToolbar>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
