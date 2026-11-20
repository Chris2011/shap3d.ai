import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dShaderLibrary from './S3dShaderLibrary.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Shader materials/ShaderLibrary',
  component: S3dShaderLibrary,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dShaderLibrary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
