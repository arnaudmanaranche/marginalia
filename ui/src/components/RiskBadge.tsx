import type { RiskLevel } from '../lib/api';
import { Badge } from './ui/Badge';

const STYLES = {
  low: { label: 'Low risk', tone: 'success' },
  medium: { label: 'Medium risk', tone: 'warning' },
  high: { label: 'High risk', tone: 'danger' },
} as const;

// How much attention the MR deserves, double-coded (colour and word).
export function RiskBadge({ level, why }: { level: RiskLevel | null; why?: string | null }) {
  if (!level) return null;
  const { label, tone } = STYLES[level];
  return <Badge tone={tone} title={why ? `${label}: ${why}` : label}>{label}</Badge>;
}
