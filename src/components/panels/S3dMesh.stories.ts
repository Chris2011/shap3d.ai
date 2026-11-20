import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dMesh from './S3dMesh.vue';

const meta = {
  title: 'Panels/Mesh',
  component: S3dMesh,
} satisfies Meta<typeof S3dMesh>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
