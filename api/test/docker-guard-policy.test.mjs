// The docker guard's rule, on the very body the docker CLI sends for the runner's own `docker run`
// (captured from the CLI against a fake daemon), then on each way a compromised bot could ask for more.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, empty } from '../dist/src/docker-guard-policy.js';
import { runArgs } from '../dist/src/verify-runner-args.js';

const cfg = { image: 'marginalia-runner', volume: 'marginalia-verify-work', networks: ['marginalia-verify-egress'] };
const known = { container: (r) => r === 'marginalia-verify-ab12' || r === 'abc123', exec: (id) => id === 'ex1' };
// What `docker run` sends for runArgs (docker 29, API 1.56).
const create = () => JSON.parse('{"Hostname":"","Domainname":"","User":"1000:1000","AttachStdin":false,"AttachStdout":false,"AttachStderr":false,"Tty":false,"OpenStdin":false,"StdinOnce":false,"Env":["HOME=/home/runner","CI=true"],"Cmd":["sleep","infinity"],"Image":"marginalia-runner","Volumes":{},"WorkingDir":"/work","Entrypoint":null,"Labels":{},"HostConfig":{"Binds":null,"ContainerIDFile":"","LogConfig":{"Type":"","Config":{}},"NetworkMode":"none","PortBindings":{},"RestartPolicy":{"Name":"no","MaximumRetryCount":0},"AutoRemove":true,"VolumeDriver":"","VolumesFrom":null,"ConsoleSize":[0,0],"CapAdd":null,"CapDrop":["ALL"],"CgroupnsMode":"","Dns":null,"DnsOptions":[],"DnsSearch":[],"ExtraHosts":null,"GroupAdd":null,"IpcMode":"","Cgroup":"","Links":null,"OomScoreAdj":0,"PidMode":"","Privileged":false,"PublishAllPorts":false,"ReadonlyRootfs":true,"SecurityOpt":["no-new-privileges:true"],"Tmpfs":{"/home/runner":"rw,size=512m","/tmp":"rw,size=1g"},"UTSMode":"","UsernsMode":"","ShmSize":0,"Isolation":"","CpuShares":0,"Memory":4294967296,"NanoCpus":2000000000,"CgroupParent":"","BlkioWeight":0,"BlkioWeightDevice":[],"BlkioDeviceReadBps":[],"BlkioDeviceWriteBps":[],"BlkioDeviceReadIOps":[],"BlkioDeviceWriteIOps":[],"CpuPeriod":0,"CpuQuota":0,"CpuRealtimePeriod":0,"CpuRealtimeRuntime":0,"CpusetCpus":"","CpusetMems":"","Devices":[],"DeviceCgroupRules":null,"DeviceRequests":null,"MemoryReservation":0,"MemorySwap":4294967296,"MemorySwappiness":-1,"OomKillDisable":false,"PidsLimit":256,"Ulimits":null,"CpuCount":0,"CpuPercent":0,"IOMaximumIOps":0,"IOMaximumBandwidth":0,"Mounts":[{"Type":"volume","Source":"marginalia-verify-work","Target":"/work","VolumeOptions":{"Subpath":"marginalia-verify-x/project"}}],"MaskedPaths":null,"ReadonlyPaths":null},"NetworkingConfig":{"EndpointsConfig":{}}}');
const go = (body, name = 'marginalia-verify-ab12') => decide('POST', `/v1.56/containers/create?name=${name}`, body, cfg, known);
const mut = (fn) => { const b = create(); fn(b); return b; };

test('the body the CLI sends for the runner is accepted, and so is the runner on the egress network', () => {
  assert.deepEqual(go(create()), { ok: true, track: 'container' });
  assert.equal(go(mut((b) => { b.HostConfig.NetworkMode = 'marginalia-verify-egress'; })).ok, true);
  assert.ok(runArgs.length >= 0);
});

test('a create is refused when it asks for anything beyond a runner', () => {
  const bad = {
    'another image': (b) => { b.Image = 'alpine'; },
    'root': (b) => { b.User = '0:0'; },
    'no user': (b) => { b.User = ''; },
    'privileged': (b) => { b.HostConfig.Privileged = true; },
    'a capability added': (b) => { b.HostConfig.CapAdd = ['SYS_ADMIN']; },
    'capabilities kept': (b) => { b.HostConfig.CapDrop = []; },
    'a bind of the host': (b) => { b.HostConfig.Binds = ['/:/host']; },
    'the docker socket': (b) => { b.HostConfig.Mounts.push({ Type: 'bind', Source: '/var/run/docker.sock', Target: '/s' }); },
    'a bind as the mount': (b) => { b.HostConfig.Mounts = [{ Type: 'bind', Source: '/etc', Target: '/work' }]; },
    'another volume': (b) => { b.HostConfig.Mounts[0].Source = 'marginalia-data'; },
    'the whole volume': (b) => { delete b.HostConfig.Mounts[0].VolumeOptions; },
    'a subpath out of the volume': (b) => { b.HostConfig.Mounts[0].VolumeOptions.Subpath = '../data'; },
    'an absolute subpath': (b) => { b.HostConfig.Mounts[0].VolumeOptions.Subpath = '/data'; },
    'a mount elsewhere': (b) => { b.HostConfig.Mounts[0].Target = '/'; },
    'the host network': (b) => { b.HostConfig.NetworkMode = 'host'; },
    'another network': (b) => { b.HostConfig.NetworkMode = 'marginalia_default'; },
    'the host pid space': (b) => { b.HostConfig.PidMode = 'host'; },
    'the host ipc': (b) => { b.HostConfig.IpcMode = 'host'; },
    'a device': (b) => { b.HostConfig.Devices = [{ PathOnHost: '/dev/sda', PathInContainer: '/dev/sda', CgroupPermissions: 'rwm' }]; },
    'seccomp off': (b) => { b.HostConfig.SecurityOpt = ['seccomp=unconfined']; },
    'no security option': (b) => { b.HostConfig.SecurityOpt = null; },
    'a writable root': (b) => { b.HostConfig.ReadonlyRootfs = false; },
    'no memory limit': (b) => { b.HostConfig.Memory = 0; },
    'a huge memory limit': (b) => { b.HostConfig.Memory = b.HostConfig.MemorySwap = 1024 ** 4; },
    'swap': (b) => { b.HostConfig.MemorySwap = -1; },
    'no cpu limit': (b) => { b.HostConfig.NanoCpus = 0; },
    'no pids limit': (b) => { b.HostConfig.PidsLimit = 0; },
    'a published port': (b) => { b.HostConfig.PortBindings = { '80/tcp': [{ HostPort: '80' }] }; },
    'userns host': (b) => { b.HostConfig.UsernsMode = 'host'; },
    'a sysctl': (b) => { b.HostConfig.Sysctls = { 'net.ipv4.ip_forward': '1' }; },
    'volumes from': (b) => { b.HostConfig.VolumesFrom = ['other']; },
    'a restart policy': (b) => { b.HostConfig.RestartPolicy = { Name: 'always' }; },
    'a tmpfs elsewhere': (b) => { b.HostConfig.Tmpfs['/etc'] = 'rw'; },
    'an entrypoint': (b) => { b.Entrypoint = ['sh']; },
    'a logging driver': (b) => { b.HostConfig.LogConfig = { Type: 'syslog', Config: { 'syslog-address': 'tcp://x:1' } }; },
    'an unknown key': (b) => { b.HostConfig.ShinyNewEscape = 'yes'; },
    'a network endpoint': (b) => { b.NetworkingConfig.EndpointsConfig = { x: {} }; },
  };
  for (const [what, change] of Object.entries(bad)) assert.equal(go(mut(change)).ok, false, what);
  assert.equal(go(create(), 'evil').ok, false, 'a name outside the runners');
  assert.equal(go(create(), 'marginalia-verify-../x').ok, false);
  assert.equal(go(null).ok, false);
});

test('only the runners the guard made can be started, waited on, inspected, exec\'d in or removed', () => {
  const d = (m, u, b = null) => decide(m, u, b, cfg, known).ok;
  assert.equal(d('POST', '/v1.56/containers/abc123/start'), true);
  assert.equal(d('POST', '/v1.56/containers/abc123/wait?condition=removed'), true);
  assert.equal(d('GET', '/v1.56/containers/marginalia-verify-ab12/json'), true);
  assert.equal(d('DELETE', '/v1.56/containers/marginalia-verify-ab12?force=1'), true);
  assert.equal(d('DELETE', '/v1.56/containers/the-database?force=1'), false);
  assert.equal(d('POST', '/v1.56/containers/the-database/start'), false);
  assert.equal(d('POST', '/containers/abc123/kill'), false);
  assert.equal(d('POST', '/containers/abc123/attach'), false);
  assert.equal(d('GET', '/containers/json'), false, 'no listing');
  assert.equal(d('POST', '/containers/abc123/exec', { Cmd: ['sh', '-c', 'node --test'], AttachStdout: true }), true);
  assert.equal(d('POST', '/containers/abc123/exec', { Cmd: ['sh', '-c', 'id'], Privileged: true }), false);
  assert.equal(d('POST', '/containers/abc123/exec', { Cmd: ['sh', '-c', 'id'], User: 'root' }), false);
  assert.equal(d('POST', '/containers/abc123/exec', { Cmd: ['bash'] }), false);
  assert.equal(d('POST', '/containers/the-database/exec', { Cmd: ['sh', '-c', 'id'] }), false);
  assert.equal(d('POST', '/v1.56/exec/ex1/start', {}), true);
  assert.equal(d('POST', '/exec/other/start', {}), false);
});

test('the daemon\'s other doors stay shut, and the probes the doctor needs stay open', () => {
  const d = (m, u) => decide(m, u, {}, cfg, known).ok;
  assert.equal(d('HEAD', '/_ping'), true);
  assert.equal(d('GET', '/v1.56/info'), true);
  assert.equal(d('GET', '/v1.56/images/marginalia-runner/json'), true);
  assert.equal(d('GET', '/images/alpine/json'), false);
  for (const u of ['/images/create?fromImage=evil', '/build', '/volumes/create', '/networks/create', '/swarm/init', '/plugins/pull', '/commit', '/auth', '/events', '/system/df']) assert.equal(d('POST', u), false, u);
});

test('empty() is what the CLI sends for an option that was not given', () => {
  for (const v of [null, undefined, '', false, 0, -1, [], {}, [0, 0], { Type: '', Config: {} }]) assert.equal(empty(v), true);
  for (const v of ['host', true, 1, ['x'], { a: 'b' }]) assert.equal(empty(v), false);
});
