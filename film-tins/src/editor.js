// The editor: change the letter, the tin labels and captions, and put your own photos in the tins.
// Everything is kept in this browser (IndexedDB). Saving reloads the page so the whole table is rebuilt from it.
import { MAX_FRAMES, MAX_TINS, PAINTS, SAVED_KEY, current, original } from './content.js';
import { keys, load, photoKey, remove, save } from './store.js';
import { zip } from './zip.js';
import { keepTranslated, t } from './i18n.js';
import { standIn } from './textures.js';

const LONG_EDGE = 2000;
const NEWLINE = String.fromCharCode(10);
const THUMB_W = 132;
const THUMB_H = 96;

let draft;
let panel;
let opener;
let status;
// Photos added in this session that haven't been saved yet, by src.
const fresh = new Map();
// Images for the little previews, by src.
const previews = new Map();

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
};

function say(text, bad = false) {
  status.textContent = text;
  status.classList.toggle('bad', bad);
}

/* Photos */

function imageFrom(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable'));
    };
    img.src = url;
  });
}

async function preview(src) {
  if (previews.has(src)) return previews.get(src);
  let image;
  try {
    if (src.startsWith('u-')) {
      const blob = fresh.get(src) || (await load(photoKey(src)));
      image = await imageFrom(blob);
    } else {
      image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = `${import.meta.env.BASE_URL}photos/${src}.jpg`;
      });
    }
  } catch {
    image = standIn(src);
  }
  previews.set(src, image);
  return image;
}

// Big phone photos are scaled down before they are kept: the page never shows them larger than this.
async function shrink(file) {
  const img = await imageFrom(file);
  const scale = Math.min(1, LONG_EDGE / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.9));
  return { blob, image: c };
}

const newId = () => `u-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// The page keeps a photo's own shape unless it's very wide or very tall; then focus picks which part stays.
const keptAspect = (w, h) => Math.min(Math.max(w / h, 0.7), 1.4);

function drawThumb(c, image, focus) {
  const ctx = c.getContext('2d');
  const w = image.width;
  const h = image.height;
  const scale = Math.min(THUMB_W / w, THUMB_H / h);
  const dw = w * scale;
  const dh = h * scale;
  const dx = (THUMB_W - dw) / 2;
  const dy = (THUMB_H - dh) / 2;
  ctx.clearRect(0, 0, THUMB_W, THUMB_H);
  ctx.drawImage(image, dx, dy, dw, dh);
  const aspect = keptAspect(w, h);
  const cropped = Math.abs(aspect - w / h) > 0.01;
  c.classList.toggle('crops', cropped);
  if (!cropped) return;
  // Shade what the crop leaves out.
  const cw = aspect < w / h ? dh * aspect : dw;
  const ch = aspect < w / h ? dh : dw / aspect;
  c.crop = { dx, dy, dw, dh, cw, ch };
  const cx = dx + (dw - cw) * focus[0];
  const cy = dy + (dh - ch) * focus[1];
  ctx.fillStyle = 'rgba(16,20,30,0.62)';
  ctx.fillRect(dx, dy, dw, cy - dy);
  ctx.fillRect(dx, cy + ch, dw, dy + dh - cy - ch);
  ctx.fillRect(dx, cy, cx - dx, ch);
  ctx.fillRect(cx + cw, cy, dx + dw - cx - cw, ch);
  ctx.strokeStyle = '#f4c430';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx + 0.75, cy + 0.75, cw - 1.5, ch - 1.5);
}

/* Building the panel */

function field(label, input, note) {
  return el('label', { className: 'field' }, el('span', { className: 'label', textContent: label }), input, note ? el('span', { className: 'note', textContent: note }) : null);
}

function textArea(value, rows, onInput, extra = {}) {
  const area = el('textarea', { value, rows, spellcheck: false, ...extra });
  area.addEventListener('input', () => onInput(area.value));
  return area;
}

function frameRow(tin, frame, index, rerender) {
  const thumb = el('canvas', { width: THUMB_W, height: THUMB_H, className: 'thumb' });
  thumb.setAttribute('role', 'img');
  thumb.setAttribute('aria-label', `第 ${index + 1} 张照片`);
  preview(frame.src).then((image) => drawThumb(thumb, image, frame.focus));
  // Clicking a photo that gets cropped moves the crop there.
  thumb.addEventListener('click', async (event) => {
    if (!thumb.classList.contains('crops')) return;
    const rect = thumb.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * THUMB_W;
    const y = ((event.clientY - rect.top) / rect.height) * THUMB_H;
    const { dx, dy, dw, dh, cw, ch } = thumb.crop;
    const along = (p, start, full, part) => (full - part < 1 ? 0.5 : Math.min(Math.max((p - start - part / 2) / (full - part), 0), 1));
    frame.focus = [along(x, dx, dw, cw), along(y, dy, dh, ch)];
    drawThumb(thumb, await preview(frame.src), frame.focus);
  });

  const move = (step) => {
    const to = index + step;
    if (to < 0 || to >= tin.frames.length) return;
    tin.frames.splice(to, 0, tin.frames.splice(index, 1)[0]);
    rerender();
  };
  const tools = el(
    'div',
    { className: 'tools' },
    el('button', { type: 'button', textContent: '上移', disabled: index === 0, onclick: () => move(-1) }),
    el('button', { type: 'button', textContent: '下移', disabled: index === tin.frames.length - 1, onclick: () => move(1) }),
    el('button', {
      type: 'button',
      textContent: '拿掉',
      disabled: tin.frames.length === 1,
      title: tin.frames.length === 1 ? '每个铁盒至少留一张' : '',
      onclick: () => {
        tin.frames.splice(index, 1);
        rerender();
      },
    })
  );
  const caption = textArea(frame.cap, 2, (value) => (frame.cap = value.replace(/\n/g, ' ')), { 'aria-label': `第 ${index + 1} 张照片下面写的字`, placeholder: '照片下面写的字' });
  const back = el('input', {
    type: 'text',
    value: (frame.back || '').split(NEWLINE).join(' / '),
    placeholder: '背面写的字（可不填）',
    oninput: (e) => (frame.back = e.target.value.split(' / ').join(NEWLINE)),
  });
  back.setAttribute('aria-label', `第 ${index + 1} 张照片背面写的字，用 / 换行`);
  return el('li', { className: 'frame' }, el('div', { className: 'print' }, thumb), el('div', { className: 'words' }, caption, back, tools));
}

function tinSection(tin, i, redraw) {
  const section = el('section', { className: 'tin' });
  const render = () => {
    const list = el('ol', { className: 'frames' }, ...tin.frames.map((frame, k) => frameRow(tin, frame, k, render)));
    const room = MAX_FRAMES - tin.frames.length;
    const input = el('input', { type: 'file', accept: 'image/*', multiple: true, disabled: room <= 0 });
    input.addEventListener('change', async () => {
      const files = [...input.files].slice(0, MAX_FRAMES - tin.frames.length);
      const skipped = input.files.length - files.length;
      let failed = 0;
      say('正在放进去…');
      for (const file of files) {
        try {
          const { blob, image } = await shrink(file);
          const src = newId();
          fresh.set(src, blob);
          previews.set(src, image);
          tin.frames.push({ src, cap: '', focus: [0.5, 0.5] });
        } catch {
          failed += 1;
        }
      }
      render();
      if (failed) say(`有 ${failed} 张打不开。iPhone 的 HEIC 照片请先转成 JPG 再放。`, true);
      else if (skipped > 0) say(`一个铁盒最多 ${MAX_FRAMES} 张，多出来的 ${skipped} 张没放进去。`, true);
      else say('放好了。别忘了保存。');
    });
    const colour = el('input', { type: 'color', value: tin.paint });
    colour.addEventListener('input', () => (tin.paint = colour.value));
    section.replaceChildren(
      el(
        'div',
        { className: 'tinhead' },
        el('h3', { textContent: `第${'一二三四五六'[i]}个铁盒` }),
        el('button', {
          type: 'button',
          className: 'link',
          textContent: '拿走这个铁盒',
          disabled: draft.tins.length === 1,
          onclick: () => {
            draft.tins.splice(i, 1);
            redraw();
          },
        })
      ),
      el(
        'div',
        { className: 'row' },
        field('胶带上的字', el('input', { type: 'text', value: tin.label, maxLength: 40, oninput: (e) => (tin.label = e.target.value) })),
        field('盒子颜色', colour)
      ),
      list,
      el(
        'label',
        { className: `add${room <= 0 ? ' full' : ''}` },
        el('span', { textContent: room > 0 ? `添加照片（还能放 ${room} 张）` : `已经放满 ${MAX_FRAMES} 张` }),
        input
      )
    );
  };
  render();
  return section;
}

function build() {
  const body = el('div', { className: 'scroll' });
  const letter = draft.letter;
  body.append(
    el('p', { className: 'intro', textContent: '这里改的字和放进去的照片只存在这台电脑的这个浏览器里，不会上传到任何地方。' }),
    el(
      'section',
      {},
      el('h3', { textContent: '信' }),
      field('信封上的字', textArea(letter.address, 2, (v) => (letter.address = v)), '最多三行'),
      field('信里写的', textArea(letter.lines.join('\n'), 12, (v) => (letter.lines = v.split('\n'))), '空一行就是隔开一段。写得多，字会自动变小。')
    ),
    tinList(),
    el(
      'section',
      {},
      el('h3', { textContent: '桌上的相机' }),
      field(
        '冲出来的照片上写的字',
        textArea(draft.shotCaptions.join('\n'), 5, (v) => (draft.shotCaptions = v.split('\n').map((s) => s.trim()).filter(Boolean))),
        '一行一句，按拍的顺序轮着用。'
      )
    ),
    publishSection(),
    backupSection()
  );
  return body;
}

// All the tins, and a way to add one, redrawn whenever one comes or goes.
function tinList() {
  const box = el('div');
  const redraw = () => {
    const room = draft.tins.length < MAX_TINS;
    box.replaceChildren(
      ...draft.tins.map((tin, i) => tinSection(tin, i, redraw)),
      el(
        'section',
        {},
        el('button', {
          type: 'button',
          className: 'more',
          textContent: room ? `再放一个铁盒（最多 ${MAX_TINS} 个）` : `桌上最多放 ${MAX_TINS} 个铁盒`,
          disabled: !room,
          onclick: () => {
            draft.tins.push({ label: 'new tin', paint: PAINTS[draft.tins.length % PAINTS.length], frames: [] });
            redraw();
            say('新铁盒在最下面，往里放照片吧。');
          },
        })
      )
    );
  };
  redraw();
  return box;
}

/* Exporting a whole website */

const README = `This website was made with Film Tins.
Put this whole folder on any static web host to get a link (the quickest: drag it onto https://app.netlify.com/drop).
Opening index.html straight from the disk won't work. Anyone with the link can see the photos.

----

这是一个用「胶片铁盒」做的网站。

怎么让别人打开：
把这个文件夹整个放到任意一个静态网站托管上，就会得到一个网址。
最省事的：打开 https://app.netlify.com/drop ，把解压后的整个文件夹拖进去。
也可以用 GitHub Pages、Vercel、Cloudflare Pages，或者自己的服务器。

注意：
- 直接双击 index.html 是打不开的，必须放在网站上（或者本地用 http 服务器）打开。
- 拿到网址的人都能看到里面的照片，只发给你想给的人。
- 想改内容，就在原来那个页面里改好，再导出一次。
`;

async function exportSite(editable) {
  // Only a built site has the list. The development server answers with its page instead.
  const listing = await fetch('./site-files.json', { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  if (!Array.isArray(listing)) {
    say('这里是开发版，不能导出。先 npm run build，再在构建出来的网站里导出。', true);
    return;
  }
  const problem = check();
  if (problem) {
    say(problem, true);
    return;
  }
  say('正在打包，照片多的话要等一会儿…');
  try {
    const files = [];
    const add = (name, data) => files.push({ name: `film-tins-site/${name}`, data });
    for (const name of listing) {
      const response = await fetch(`./${name}`);
      if (response.ok) add(name, new Uint8Array(await response.arrayBuffer()));
    }
    // Uploaded photos become plain files; built-in ones are copied if they exist.
    const content = tidy(draft);
    for (const tin of content.tins) {
      for (const frame of tin.frames) {
        if (frame.src.startsWith('u-')) {
          const blob = fresh.get(frame.src) || (await load(photoKey(frame.src)));
          if (!blob) continue;
          frame.src = `p-${frame.src.slice(2)}`;
          add(`photos/${frame.src}.jpg`, new Uint8Array(await blob.arrayBuffer()));
        } else if (!files.some((f) => f.name.endsWith(`photos/${frame.src}.jpg`))) {
          const response = await fetch(`./photos/${frame.src}.jpg`).catch(() => null);
          if (response?.ok) add(`photos/${frame.src}.jpg`, new Uint8Array(await response.arrayBuffer()));
        }
      }
    }
    const encoder = new TextEncoder();
    add('content.json', encoder.encode(JSON.stringify({ app: 'film-tins', version: 1, editable, content })));
    add('使用说明.txt', encoder.encode(README));
    const link = el('a', { href: URL.createObjectURL(zip(files)), download: 'film-tins-site.zip' });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    say('网站已打包好。解压后把文件夹拖到 app.netlify.com/drop 就能得到网址。');
  } catch {
    say('打包失败了，再试一次。', true);
  }
}

function publishSection() {
  const keep = el('input', { type: 'checkbox' });
  return el(
    'section',
    { className: 'publish' },
    el('h3', { textContent: '导出成网站' }),
    el('p', { className: 'note', textContent: '把现在的信、铁盒和照片打包成一个完整的网站（压缩包），可以放到网上发给家人朋友。导出前不用先保存。' }),
    el('label', { className: 'check' }, keep, el('span', { textContent: '收到的人也能用「编辑」改（只改他自己的那份）' })),
    el('button', { type: 'button', className: 'save export', textContent: '导出成网站', onclick: () => exportSite(keep.checked) }),
    el('p', { className: 'note', textContent: '拿到网址的人都能看到这些照片。' })
  );
}

function backupSection() {
  const importInput = el('input', { type: 'file', accept: 'application/json,.json' });
  importInput.addEventListener('change', () => importBackup(importInput.files[0]));
  let resetArmed = false;
  const reset = el('button', {
    type: 'button',
    className: 'link',
    textContent: '恢复成原来的样子',
    onclick: async () => {
      if (!resetArmed) {
        resetArmed = true;
        reset.textContent = '再点一次，确认恢复';
        return;
      }
      await remove(SAVED_KEY).catch(() => {});
      await sweepPhotos(new Set(original().tins.flatMap((tin) => tin.frames.map((f) => f.src))));
      location.reload();
    },
  });
  return el(
    'section',
    { className: 'backup' },
    el('h3', { textContent: '备份' }),
    el('p', { className: 'note', textContent: '换电脑或换浏览器前，先导出一份。导出的文件里有你放进去的照片。' }),
    el(
      'div',
      { className: 'row' },
      el('button', { type: 'button', className: 'link', textContent: '导出备份', onclick: exportBackup }),
      el('label', { className: 'link' }, el('span', { textContent: '导入备份' }), importInput),
      reset
    )
  );
}

/* Saving */

function check() {
  const empty = draft.tins.findIndex((tin) => !tin.frames.length);
  if (empty >= 0) return `第 ${empty + 1} 个铁盒里至少要有一张照片。`;
  return '';
}

function tidy(content) {
  return {
    letter: { address: content.letter.address, lines: content.letter.lines.map((l) => l.replace(/\s+$/, '')) },
    tins: content.tins.map(({ label, paint, frames }) => ({
      label: label.trim(),
      paint,
      frames: frames.map(({ src, cap, focus, back }) => ({ src, cap: cap.trim(), focus, back: (back || '').trim() })),
    })),
    shotCaptions: content.shotCaptions,
  };
}

// Uploaded photos that no tin uses any more are deleted, so the browser doesn't fill up.
async function sweepPhotos(used) {
  const all = await keys();
  await Promise.all(
    all
      .filter((key) => typeof key === 'string' && key.startsWith('photo:u-') && !used.has(key.slice(6)))
      .map((key) => remove(key).catch(() => {}))
  );
}

async function commit() {
  const problem = check();
  if (problem) {
    say(problem, true);
    return;
  }
  say('正在保存…');
  try {
    const content = tidy(draft);
    const used = new Set(content.tins.flatMap((tin) => tin.frames.map((f) => f.src)));
    for (const [src, blob] of fresh) if (used.has(src)) await save(photoKey(src), blob);
    await save(SAVED_KEY, content);
    await sweepPhotos(used);
    say('保存好了，正在重新打开…');
    location.reload();
  } catch {
    say('没存上。这个浏览器可能不允许网页存东西（比如无痕模式）。', true);
  }
}

const toDataUrl = (blob) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

async function exportBackup() {
  const content = tidy(draft);
  const photos = {};
  for (const tin of content.tins) {
    for (const { src } of tin.frames) {
      if (!src.startsWith('u-')) continue;
      const blob = fresh.get(src) || (await load(photoKey(src)));
      if (blob) photos[src] = await toDataUrl(blob);
    }
  }
  const file = new Blob([JSON.stringify({ app: 'film-tins', version: 1, content, photos })], { type: 'application/json' });
  const link = el('a', { href: URL.createObjectURL(file), download: 'film-tins-backup.json' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  say('备份已导出。');
}

async function importBackup(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'film-tins' || !data.content?.tins) throw new Error('not ours');
    for (const [src, url] of Object.entries(data.photos || {})) {
      if (!/^u-[a-z0-9]+$/.test(src)) continue;
      fresh.set(src, await (await fetch(url)).blob());
    }
    draft = data.content;
    draft.shotCaptions = Array.isArray(draft.shotCaptions) ? draft.shotCaptions : [];
    await commit();
  } catch {
    say('这个文件读不了，它应该是从这里导出的 .json 备份。', true);
  }
}

/* Opening and closing */

function open() {
  if (!panel) {
    draft = current();
    status = el('p', { className: 'status', role: 'status' });
    const close = el('button', { type: 'button', className: 'link', textContent: '收起', onclick: shut });
    panel = el(
      'aside',
      { id: 'editor' },
      el('header', {}, el('h2', { id: 'editor-title', textContent: '换成你自己的' }), close),
      build(),
      el('footer', {}, status, el('button', { type: 'button', className: 'save commit', textContent: '保存并重新打开', onclick: commit }))
    );
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'editor-title');
    // Typing here mustn't drive the camera or the projector.
    ['keydown', 'keyup', 'wheel', 'pointerdown', 'pointermove', 'pointerup'].forEach((type) =>
      panel.addEventListener(type, (event) => {
        if (type === 'keydown' && event.key === 'Escape') shut();
        event.stopPropagation();
      })
    );
    const shade = el('div', { id: 'editor-shade', onclick: shut });
    document.body.append(shade, panel);
    keepTranslated(panel);
  }
  document.body.classList.add('editing');
  panel.hidden = false;
  opener.setAttribute('aria-expanded', 'true');
  panel.querySelector('textarea').focus({ preventScroll: true });
}

function shut() {
  document.body.classList.remove('editing');
  panel.hidden = true;
  opener.setAttribute('aria-expanded', 'false');
  opener.focus();
}

export function setupEditor() {
  opener = el('button', { type: 'button', id: 'edit-open', textContent: t('编辑') });
  opener.setAttribute('aria-expanded', 'false');
  opener.addEventListener('click', () => (panel && !panel.hidden ? shut() : open()));
  document.body.append(opener);
}
