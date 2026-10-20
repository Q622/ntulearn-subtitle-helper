/* Run with: node tests/run.cjs. No dependencies required. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const base = path.join(__dirname, '..');
for (const file of ['srt.js', 'content.js', 'popup.js']) new vm.Script(fs.readFileSync(path.join(base, file), 'utf8'), {filename: file});
const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
for (const script of manifest.content_scripts[0].js) assert.ok(fs.existsSync(path.join(base, script)));
const c = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(base, 'srt.js'), 'utf8'), c);
const api = c.NTUSrt;
const sample = '\uFEFF2\r\n00:00:03,500 --> 00:00:05,000\r\n<b>第二条</b>\r\n\r\n1\r\n00:00:01,000 --> 00:00:04,000\r\nHello\r\n你好\r\n\r\n3\r\n00:00:06,000 --> 00:00:05,000\r\nbad';
const parsed = api.parse(sample);
assert.equal(parsed.cues.length, 2);
assert.equal(parsed.skipped, 1);
assert.equal(parsed.cues[0].text, 'Hello\n你好');
assert.equal(parsed.cues[1].text, '第二条');
assert.equal(api.parse('1\n00:00:01.5 --> 00:00:02.05\nX').cues[0].start, 1.5);
assert.equal(api.parse('1\n00:61:00,000 --> 00:62:00,000\nX').cues.length, 0);
assert.equal(api.parse('').cues.length, 0);
assert.equal(api.shifted(parsed.cues, -4).length, 1);
assert.equal(api.shifted(parsed.cues, -4)[0].start, 0);
assert.equal(api.shifted(parsed.cues, 2)[0].start, 3);
assert.equal(api.parse('1\n00:00:01,000 --> 00:00:02,000\n<img src=x onerror=alert(1)>safe').cues[0].text, 'safe');
let timer;
const document = {
  querySelectorAll: selector => selector === 'video' ? media : selector === 'audio' ? [audio] : [],
  createElement: () => ({textContent: '', remove() {}, getRootNode: () => document}),
  documentElement: {append() {}}
};
function mockVideo() {
  const tracks = [{mode: 'showing'}];
  return {
    textTracks: tracks, playbackRate: 1, currentTime: 0, paused: true, listeners: {},
    getBoundingClientRect: () => ({width: 1280, height: 720}),
    getRootNode: () => document, setAttribute() {}, removeAttribute() {},
    addEventListener(name, fn) { this.listeners[name] = fn; },
    addTextTrack() {
      const t = {mode: 'disabled', cues: [], addCue(cue) { this.cues.push(cue); }, removeCue(cue) { this.cues.splice(this.cues.indexOf(cue), 1); }};
      tracks.push(t); return t;
    }
  };
}
const media = [mockVideo(), mockVideo()], audio = mockVideo();
Object.assign(c, {document, setInterval: fn => { timer = fn; }, VTTCue: class { constructor(start, end, text) { this.startTime = start; this.endTime = end; this.text = text; } }});
const content = fs.readFileSync(path.join(base, 'content.js'), 'utf8');
vm.runInContext(content, c);
const ctl = c.NTUCaptionController, id = ctl.list()[0].id;
const loaded = ctl.command(id, 'load', {text: sample, name: 'lesson.srt', size: 32, offset: 0});
assert.equal(loaded.count, 2);
assert.equal(media[0].textTracks[0].mode, 'disabled');
assert.equal(media[0].textTracks[1].mode, 'showing');
assert.equal(media[0].textTracks[1].cues.length, 2);
ctl.command(id, 'rate', 2);
assert.ok([...media, audio].every(v => v.playbackRate === 2));
assert.equal(media[0].textTracks[1].cues[0].startTime, 1, 'speed must not scale subtitle timestamps');
ctl.command(id, 'offset', 1.5);
assert.equal(media[0].textTracks[1].cues[0].startTime, 2.5);
ctl.command(id, 'enabled', false);
assert.equal(media[0].textTracks[1].mode, 'disabled');
ctl.command(id, 'enabled', true);
assert.equal(media[0].textTracks[1].mode, 'showing');
ctl.command(id, 'size', 40);
assert.equal(ctl.list()[0].size, 40);
const replacement = mockVideo(); media.push(replacement); timer();
assert.equal(replacement.playbackRate, 2);
assert.throws(() => ctl.command(id, 'load', {text: 'broken'}), /SRT/);
assert.equal(media[0].textTracks[1].cues.length, 2, 'invalid upload preserves loaded subtitles');
vm.runInContext(content, c);
assert.equal(c.NTUCaptionController, ctl, 'injection must be idempotent');
ctl.command(id, 'clear');
assert.equal(media[0].textTracks[0].mode, 'showing');
assert.equal(media[0].textTracks[1].cues.length, 0);
assert.equal(ctl.list()[0].name, '');
assert.throws(() => ctl.command('missing', 'size', 20), /视频已更换/);
console.log('PASS: manifest, JS syntax, SRT parsing, encoding-normalized input, malformed cues, overlap, offset, native track lifecycle, size, speed, replacement media, reinjection, restore.');
