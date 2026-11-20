import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dOutliner from './S3dOutliner.vue';

const meta = {
  title: 'Panels/Outliner',
  component: S3dOutliner,
} satisfies Meta<typeof S3dOutliner>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
