import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTextureLayout from './S3dTextureLayout.vue';

const meta = {
  title: 'Panels/Materials/TextureLayout',
  component: S3dTextureLayout,
  args: {
    material: {
      ...{ name: 'Holz', color: '#8a5a33', opacity: 1, roughness: 0.6, metalness: 0 },
      texture: 'holz',
      textureSize: 1,
      textureOffset: [0, 0],
      textureRotation: 0,
    } as any,
    shader: undefined,
  },
} satisfies Meta<typeof S3dTextureLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
