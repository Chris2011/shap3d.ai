import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dSectionTitle from './S3dSectionTitle.vue';

const meta = {
  title: 'UI/SectionTitle',
  component: S3dSectionTitle,
  args: {},
  render: (args) => ({
    components: { S3dSectionTitle },
    setup: () => ({ args }),
    template: `<S3dSectionTitle v-bind="args">Kanten</S3dSectionTitle>`,
  }),
} satisfies Meta<typeof S3dSectionTitle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
