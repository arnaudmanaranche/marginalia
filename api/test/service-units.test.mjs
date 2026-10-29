import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plistXml, botPlistKeys, swiftbarPlistKeys, systemdUnit, manualInstructions, servicePlatform } from '../src/service-units.mjs';

const bot = { nodePath: '/usr/bin/node', script: '/opt/m/poll.mjs', workingDir: '/opt/m', path: '/usr/bin:/bin', logFile: '/h/marginalia.log' };

test('the launchd plist wraps the label and keys, and closes every element', () => {
  const xml = plistXml('com.marginalia.bot', botPlistKeys(bot));
  assert.match(xml, /<key>Label<\/key><string>com\.marginalia\.bot<\/string>/);
  assert.match(xml, /<string>\/usr\/bin\/node<\/string>\s*<string>\/opt\/m\/poll\.mjs<\/string>/);
  assert.match(xml, /<key>PATH<\/key><string>\/usr\/bin:\/bin<\/string>/);
  assert.match(xml, /<key>KeepAlive<\/key><dict><key>SuccessfulExit<\/key><false\/><\/dict>/);
  assert.equal((xml.match(/<string>/g) ?? []).length, (xml.match(/<\/string>/g) ?? []).length);
});

test('plist values are XML-escaped', () => {
  const xml = plistXml('x', botPlistKeys({ ...bot, path: '/a&b:/c<d' }));
  assert.match(xml, /\/a&amp;b:\/c&lt;d/);
});

test('the SwiftBar agent opens the app once at login', () => {
  const keys = swiftbarPlistKeys('/Applications/SwiftBar.app');
  assert.match(keys, /\/usr\/bin\/open<\/string>\s*<string>-g<\/string>\s*<string>\/Applications\/SwiftBar\.app/);
  assert.match(keys, /RunAtLoad/);
});

test('the systemd unit starts the script with the pinned node, restarts on failure and enables at login', () => {
  const unit = systemdUnit(bot);
  assert.match(unit, /^\[Unit\]/);
  assert.match(unit, /^ExecStart="\/usr\/bin\/node" "\/opt\/m\/poll\.mjs"$/m);
  assert.match(unit, /^WorkingDirectory=\/opt\/m$/m);
  assert.match(unit, /^Environment="PATH=\/usr\/bin:\/bin"$/m);
  assert.match(unit, /^Restart=on-failure$/m);
  assert.match(unit, /^WantedBy=default\.target$/m);
});

test('systemd specifiers and quotes in paths are escaped', () => {
  const unit = systemdUnit({ ...bot, script: '/opt/my "app"/100%/$x.mjs', path: '/bin' });
  assert.match(unit, /"\/opt\/my \\"app\\"\/100%%\/\$\$x\.mjs"/);
});

test('extra environment goes into the unit, empty values are dropped', () => {
  const unit = systemdUnit({ ...bot, env: { MARGINALIA_HOME: '/data/m', EMPTY: '' } });
  assert.match(unit, /^Environment="MARGINALIA_HOME=\/data\/m"$/m);
  assert.doesNotMatch(unit, /EMPTY/);
});

test('the service flavour follows the platform, and other platforms get pm2 instructions', () => {
  assert.equal(servicePlatform('darwin'), 'launchd');
  assert.equal(servicePlatform('linux'), 'systemd');
  assert.equal(servicePlatform('win32'), 'manual');
  const text = manualInstructions({ nodePath: '/n/node', script: '/m/poll.mjs' });
  assert.match(text, /pm2 start \/m\/poll\.mjs --name marginalia --interpreter \/n\/node/);
});

test('launchd gets MARGINALIA_HOME too, escaped, next to PATH', () => {
  const keys = botPlistKeys({ ...bot, env: { MARGINALIA_HOME: '/data & co' } });
  assert.match(keys, /<key>MARGINALIA_HOME<\/key><string>\/data &amp; co<\/string>/);
  assert.match(keys, /<key>PATH<\/key>/);
});
