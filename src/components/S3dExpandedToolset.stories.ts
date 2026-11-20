import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dExpandedToolset from './S3dExpandedToolset.vue';

const meta = {
  title: 'App/ExpandedToolset',
  component: S3dExpandedToolset,
} satisfies Meta<typeof S3dExpandedToolset>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
