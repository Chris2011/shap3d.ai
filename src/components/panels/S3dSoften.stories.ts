import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dSoften from './S3dSoften.vue';

const meta = {
  title: 'Panels/Soften',
  component: S3dSoften,
} satisfies Meta<typeof S3dSoften>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
