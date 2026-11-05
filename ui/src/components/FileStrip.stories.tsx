import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileStrip } from './FileStrip';
import type { DiffFile, Finding } from '../lib/api';

const file = (path: string, additions: number, deletions: number): DiffFile => ({ path, oldPath: null, status: 'modified', additions, deletions, omitted: false, lines: [] });
const files = [file('packages/gitstart/src/components/Map/index.tsx', 40, 5), file('packages/gitstart/src/components/Map/map-layers/index.tsx', 212, 0), file('src/app/lib/country-shapes-url.ts', 5, 0)];
const findings = [{ id: 'f', severity: 'important', path: files[0].path } as Finding, { id: 'g', severity: 'suggestion', path: files[2].path } as Finding];

const meta = { title: 'Scholia/Data display/FileStrip', component: FileStrip, args: { files, findings, onJump: () => {} }, decorators: [(S) => <div className="max-w-xl"><S /></div>] } satisfies Meta<typeof FileStrip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Chapter: Story = {};
export const SingleFile: Story = { args: { files: files.slice(0, 1) } };
