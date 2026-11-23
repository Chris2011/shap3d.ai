import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dProjectCard from './S3dProjectCard.vue';

const meta = {
  title: 'App/ProjectCard',
  component: S3dProjectCard,
  args: { entry: { id: '1', name: 'Gartenhaus', updated: Date.parse('2026-11-23T09:30:00Z') } },
  decorators: [() => ({ template: '<div style="width: 180px"><story /></div>' })],
} satisfies Meta<typeof S3dProjectCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithoutPreview: Story = {};
export const LongName: Story = {
  args: { entry: { id: '2', name: 'Einfamilienhaus mit Garage und Wintergarten', updated: Date.parse('2026-11-01T18:00:00Z') } },
};
