import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dAttributeList from './S3dAttributeList.vue';

const meta = {
  title: 'Panels/Entity info/AttributeList',
  component: S3dAttributeList,
  args: { attributes: { Hersteller: 'Muster AG', Artikel: '4711', Farbe: 'Eiche natur' } },
} satisfies Meta<typeof S3dAttributeList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Empty: Story = { args: { attributes: {} } };
