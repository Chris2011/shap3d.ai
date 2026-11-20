import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dApiReference from './S3dApiReference.vue';

const meta = {
  title: 'Panels/ApiReference',
  component: S3dApiReference,
} satisfies Meta<typeof S3dApiReference>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
