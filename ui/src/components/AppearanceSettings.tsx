import { useState } from 'react';
import { Volume2 } from 'lucide-react';
import { notificationsOn, notificationsSupported, setNotificationsOn } from '../lib/notify';
import { play, setSoundsOn, soundsOn } from '../lib/sounds';
import { CHOICES, useTheme } from '../lib/theme';
import { Segmented } from './ds/Segmented';
import { Switch } from './ds/Switch';
import { SettingGroup, SettingRow } from './SettingRow';
import { Button } from './ui/Button';

// The settings of this browser only: nothing to save, each applies at once and is kept here.
export function AppearanceSettings() {
  const [theme, setTheme] = useTheme();
  const [sounds, setSounds] = useState(soundsOn);
  const [notifs, setNotifs] = useState(notificationsOn);
  return (
    <SettingGroup title="This browser" description="Applied at once and kept in this browser only.">
      <SettingRow label="Theme" hint="Follow the system, or always light or dark." hintId="setting-theme-hint">
        <Segmented label="Theme" options={CHOICES} value={theme} onChange={setTheme} />
      </SettingRow>
      <SettingRow label="Sounds" htmlFor="setting-sounds" hintId="setting-sounds-hint" hint="A short sound when an MR arrives, a review or a triage is ready, a run fails, a reviewer writes on your MR, and when an action of yours goes through or fails.">
        <Button variant="ghost" size="sm" disabled={!sounds} onClick={() => play('arrive')}><Volume2 className="size-3.5" />Try one</Button>
        <Switch
          id="setting-sounds" label="Play sounds" describedBy="setting-sounds-hint" checked={sounds}
          onChange={(on) => {
            setSoundsOn(on);
            setSounds(on);
            if (on) play('done');
          }}
        />
      </SettingRow>
      {notificationsSupported() && (
        <SettingRow label="Notifications" htmlFor="setting-notifs" hintId="setting-notifs-hint" hint="A system notification for the same moments when this tab is not in front. The browser asks once; it may be blocked in its site settings.">
          <Switch id="setting-notifs" label="Show notifications" describedBy="setting-notifs-hint" checked={notifs} onChange={(on) => void setNotificationsOn(on).then(setNotifs)} />
        </SettingRow>
      )}
    </SettingGroup>
  );
}
