// The page is written in Chinese. Anyone whose browser isn't asks for English words instead.
// ?lang=en or ?lang=zh in the address forces one; the 中 / EN switch remembers a choice.

const KEY = 'film-tins-lang';

function pick() {
  const asked = new URLSearchParams(location.search).get('lang');
  if (asked === 'en' || asked === 'zh') return asked;
  try {
    const kept = localStorage.getItem(KEY);
    if (kept === 'en' || kept === 'zh') return kept;
  } catch {
    /* No storage: go by the browser. */
  }
  return (navigator.languages || [navigator.language]).some((l) => /^zh/i.test(l)) ? 'zh' : 'en';
}

export const LANG = pick();
document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en';

export function setLang(lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* Applies to this visit only. */
  }
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  location.replace(url);
}

const WORDS = {
  // The table
  拆开信封: 'Open the envelope',
  放下信: 'Put the letter down',
  '选一个铁盒。': 'Pick a tin.',
  去看晾片绳: 'See the line',
  拿起相机: 'Pick up the camera',
  '正在取照片…': 'Fetching the photos…',
  '正在找铁盒': 'Finding the tins',
  // The camera
  '拖动可以转着看。拨杆、快门和转盘都能用。': 'Drag to turn it. The lever, shutter and dials all work.',
  倒片: 'Rewind',
  过片: 'Wind on',
  按快门: 'Release',
  看取景器: 'Look through it',
  放下相机: 'Put the camera down',
  '拖动取景，点一下拍摄，滑块对焦。': 'Drag to frame, tap to shoot, slide to focus.',
  '移动鼠标取景，滚轮对焦，点击拍摄。': 'Move to frame, scroll to focus, click to shoot.',
  离开取景器: 'Look up',
  '这卷拍完了，倒片吧。': 'The roll is finished. Rewind it.',
  '已经过片了，可以拍。': 'Wound on. Ready.',
  '要先过片才能按快门。': 'Wind on first.',
  '这是这卷的最后一张。': 'That was the last on the roll.',
  '换好新胶卷了，过片吧。': 'New roll in. Wind on.',
  '还没拍，不用倒片。': "Nothing taken yet, nothing to rewind.",
  对焦: 'Focus',
  // Film and light box
  '沿着胶片拖动，点一格拿到灯前看。': 'Drag along the film. Tap a frame to hold it to the light.',
  把这一格拿到灯前: 'Hold this frame to the light',
  回到铁盒: 'Back to the tins',
  放大镜: 'Loupe',
  负片: 'Negative',
  翻面: 'Turn over',
  投影: 'Project it',
  去绳上看: 'See the line',
  冲洗这张: 'Print this one',
  放下胶片: 'Put the film down',
  暖光: 'Warm',
  日光: 'Daylight',
  红光: 'Red',
  蓝光: 'Blue',
  亮度: 'Brightness',
  光的颜色: 'Colour of the light',
  // Projector
  停止放映: 'Stop the show',
  自动放映: 'Slide show',
  上一张: 'Previous',
  下一张: 'Next',
  回到灯箱: 'Back to the light box',
  // Darkroom and line
  '搓一搓水面，影像会慢慢显出来。': 'Rub the water and the picture will come up.',
  帮我冲洗: 'Develop it for me',
  回到桌上: 'Back to the table',
  回到胶片: 'Back to the film',
  '显出来了。': "There it is.",
  '全都冲好了，这些够留着了。': 'All of them printed. Enough to keep.',
  '你自己拍的，挂上去了。': 'Yours, hung up to dry.',
  全部取下: 'Take them all down',
  // Messages
  '这个页面需要 WebGL。请在浏览器里打开硬件加速，然后刷新。': 'This page needs WebGL. Turn on hardware acceleration in your browser and reload.',
  '照片没有加载出来。请检查网络，然后刷新。': "The photos didn't load. Check the connection and reload.",
  '声音：关': 'Sound: off',
  '声音：开': 'Sound: on',
  编辑: 'Edit',
  '灯下的桌子，上面有四个旧胶片铁盒和一封信': 'A table under a lamp, with old film tins and a letter on it',
  // Editor
  换成你自己的: 'Make it yours',
  收起: 'Close',
  保存并重新打开: 'Save and reopen',
  '这里改的字和放进去的照片只存在这台电脑的这个浏览器里，不会上传到任何地方。': 'Everything you change here stays in this browser on this computer. Nothing is uploaded.',
  信: 'The letter',
  信封上的字: 'On the envelope',
  最多三行: 'Up to three lines',
  信里写的: 'The letter itself',
  '空一行就是隔开一段。写得多，字会自动变小。': 'A blank line starts a new paragraph. Long letters get smaller writing.',
  上移: 'Up',
  下移: 'Down',
  拿掉: 'Remove',
  每个铁盒至少留一张: 'Each tin keeps at least one',
  照片下面写的字: 'Written under the photo',
  '背面写的字（可不填）': 'Written on the back (optional)',
  '正在放进去…': 'Putting them in…',
  '放好了。别忘了保存。': "In. Don't forget to save.",
  拿走这个铁盒: 'Remove this tin',
  胶带上的字: 'On the tape',
  盒子颜色: 'Tin colour',
  桌上的相机: 'The camera',
  冲出来的照片上写的字: 'Written on your own prints',
  '一行一句，按拍的顺序轮着用。': 'One per line, used in turn.',
  '新铁盒在最下面，往里放照片吧。': 'The new tin is at the bottom. Put some photos in it.',
  '这里是开发版，不能导出。先 npm run build，再在构建出来的网站里导出。': 'This is the development server. Run npm run build and export from the built site.',
  '正在打包，照片多的话要等一会儿…': 'Packing. With lots of photos this takes a moment…',
  '网站已打包好。解压后把文件夹拖到 app.netlify.com/drop 就能得到网址。': 'Done. Unzip it and drag the folder onto app.netlify.com/drop to get a link.',
  '打包失败了，再试一次。': "Packing failed. Try again.",
  导出成网站: 'Export as a website',
  '把现在的信、铁盒和照片打包成一个完整的网站（压缩包），可以放到网上发给家人朋友。导出前不用先保存。': 'Packs the letter, tins and photos as they are now into a complete website (a zip) you can put online and send to people. No need to save first.',
  '收到的人也能用「编辑」改（只改他自己的那份）': 'Let the people you send it to use Edit too (on their own copy)',
  '拿到网址的人都能看到这些照片。': 'Anyone with the link can see these photos.',
  恢复成原来的样子: 'Put everything back',
  '再点一次，确认恢复': 'Click again to confirm',
  备份: 'Backup',
  '换电脑或换浏览器前，先导出一份。导出的文件里有你放进去的照片。': 'Export one before changing computer or browser. It includes the photos you added.',
  导出备份: 'Export backup',
  导入备份: 'Import backup',
  '正在保存…': 'Saving…',
  '保存好了，正在重新打开…': 'Saved. Reopening…',
  '没存上。这个浏览器可能不允许网页存东西（比如无痕模式）。': "Couldn't save. This browser may not allow it (a private window, for example).",
  '备份已导出。': 'Backup exported.',
  '这个文件读不了，它应该是从这里导出的 .json 备份。': "Can't read that file. It should be a .json backup exported from here.",
};

const NUMERALS = '一二三四五六';

// Sentences with numbers or names in them.
const PATTERNS = [
  [/^打开 (.+)$/, (m) => `Open ${m[1]}`],
  [/^已拍 (\d+) \/ (\d+) 张。$/, (m) => `${m[1]} of ${m[2]} taken.`],
  [/^已拍 (\d+) \/ (\d+) 张，过片拍下一张。$/, (m) => `${m[1]} of ${m[2]} taken. Wind on for the next.`],
  [/^冲洗照片（(\d+)）$/, (m) => `Develop photos (${m[1]})`],
  [/^快门速度 (\S+)，点击更改$/, (m) => `Shutter speed ${m[1]}, click to change`],
  [/^光圈 (\S+)，点击更改$/, (m) => `Aperture ${m[1]}, click to change`],
  [/^好了，第 (\d+) 张。$/, (m) => `Ready for frame ${m[1]}.`],
  [/^放大镜 (\d+) 倍$/, (m) => `Loupe ×${m[1]}`],
  [/^绳上已有 (\d+) \/ (\d+) 张。$/, (m) => `${m[1]} of ${m[2]} on the line.`],
  [/^(.*)点照片可以翻到背面。$/, (m) => `${t(m[1])} Tap a print to turn it over.`],
  [/^冲洗下一张（(\d+)）$/, (m) => `Develop the next (${m[1]})`],
  [/^第 (\d+) 张照片$/, (m) => `Photo ${m[1]}`],
  [/^第 (\d+) 张照片下面写的字$/, (m) => `Caption for photo ${m[1]}`],
  [/^第 (\d+) 张照片背面写的字，用 \/ 换行$/, (m) => `Back of photo ${m[1]}; use / for a new line`],
  [/^有 (\d+) 张打不开。.*$/, (m) => `${m[1]} couldn't be opened. Convert iPhone HEIC photos to JPG first.`],
  [/^一个铁盒最多 (\d+) 张，多出来的 (\d+) 张没放进去。$/, (m) => `A tin holds ${m[1]}; ${m[2]} were left out.`],
  [/^第([一二三四五六])个铁盒$/, (m) => `Tin ${NUMERALS.indexOf(m[1]) + 1}`],
  [/^添加照片（还能放 (\d+) 张）$/, (m) => `Add photos (room for ${m[1]} more)`],
  [/^已经放满 (\d+) 张$/, (m) => `Full: ${m[1]} photos`],
  [/^再放一个铁盒（最多 (\d+) 个）$/, (m) => `Add another tin (up to ${m[1]})`],
  [/^桌上最多放 (\d+) 个铁盒$/, (m) => `The table holds ${m[1]} tins at most`],
  [/^第 (\d+) 个铁盒里至少要有一张照片。$/, (m) => `Tin ${m[1]} needs at least one photo.`],
];

export function t(text) {
  if (LANG === 'zh' || !text) return text;
  if (WORDS[text]) return WORDS[text];
  for (const [pattern, make] of PATTERNS) {
    const m = text.match(pattern);
    if (m) return make(m);
  }
  return text;
}

const HAS_CHINESE = /[一-鿿]/;

// Translates the words already in a piece of page: text, placeholders, labels for screen readers.
export function translate(root) {
  if (LANG === 'zh' || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const raw = node.nodeValue;
    const trimmed = raw.trim();
    if (trimmed && HAS_CHINESE.test(trimmed)) node.nodeValue = raw.replace(trimmed, t(trimmed));
  });
  const elements = root.querySelectorAll ? [root, ...root.querySelectorAll('*')] : [];
  elements.forEach((element) => {
    ['placeholder', 'aria-label', 'title'].forEach((name) => {
      const value = element.getAttribute?.(name);
      if (value && HAS_CHINESE.test(value)) element.setAttribute(name, t(value));
    });
  });
}

// Keeps a piece of page translated as it changes.
export function keepTranslated(root) {
  if (LANG === 'zh') return;
  translate(root);
  new MutationObserver((changes) => {
    changes.forEach((change) => change.addedNodes.forEach((node) => (node.nodeType === 1 ? translate(node) : node.nodeType === 3 && translate(node.parentNode))));
  }).observe(root, { childList: true, subtree: true, characterData: false });
}
