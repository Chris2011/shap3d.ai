import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dShaderParams from './S3dShaderParams.vue';

const meta = {
  title: 'Panels/Materials/ShaderParams',
  component: S3dShaderParams,
  args: {
    material: {
      ...{ name: 'Holz', color: '#8a5a33', opacity: 1, roughness: 0.6, metalness: 0 },
      shader: 'demo.stripes',
      shaderParams: { width: 0.3 },
    },
    shader: {
      id: 'demo.stripes',
      label: 'Streifen',
      glsl: '',
      params: [
        { name: 'width', label: 'Breite', type: 'number', default: 0.2, min: 0.01, max: 1, step: 0.01 },
        { name: 'tint', label: 'Farbe', type: 'color', default: '#3d7bd9' },
      ],
    } as any,
  },
} satisfies Meta<typeof S3dShaderParams>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
