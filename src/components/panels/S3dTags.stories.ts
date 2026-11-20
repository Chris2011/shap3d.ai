import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTags from './S3dTags.vue';

const meta = {
  title: 'Panels/Tags',
  component: S3dTags,
} satisfies Meta<typeof S3dTags>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
