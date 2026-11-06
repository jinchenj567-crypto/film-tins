// Everything a person reads lives here. focus = which part of the photo survives a crop (0-1).
// One to six tins, up to six photos each. back = what's pencilled on the back of the print.
// src is a photo in public/photos/<src>.jpg. One that isn't there is drawn as a faded stand-in,
// so the page still works before anyone has added their own.
//
// To make it yours: copy this file to content.local.js (it overrides this one and stays out of git),
// or open the page and use 编辑 in the top corner, which keeps everything in your own browser.
import { load } from './store.js';

const SAMPLE = {
  LETTER: {
    address: 'for someone\nwho keeps things',
    lines: [
      'Dear you,',
      '',
      'These tins are waiting',
      'for your own photos.',
      '',
      'Use the editor in the top corner',
      'to put them in, and write',
      'a letter of your own.',
      '',
      'Open one.',
    ],
  },
  TINS: [
    {
      label: 'by the sea',
      paint: '#10233c',
      frames: [
        { src: 'sample-sea', cap: 'a photo of yours goes here.', focus: [0.5, 0.5], back: 'turn me over:\nwhere, when, who.' },
        { src: 'sample-dusk', cap: 'write what you remember.', focus: [0.5, 0.5], back: 'august, the year\nit didn\'t rain' },
        { src: 'sample-noon', cap: 'or what you were told.', focus: [0.5, 0.5] },
      ],
    },
    {
      label: 'small things',
      paint: '#5f4410',
      frames: [
        { src: 'sample-window', cap: 'the light came in sideways.', focus: [0.5, 0.5] },
        { src: 'sample-field', cap: 'nobody remembers who took it.', focus: [0.5, 0.5] },
        { src: 'sample-snow', cap: 'one word is enough.', focus: [0.5, 0.5] },
      ],
    },
    {
      label: 'summers',
      paint: '#4a1a10',
      frames: [
        { src: 'sample-hill', cap: 'up to six photos in a tin.', focus: [0.5, 0.5], back: 'up to six tins\non the table, too.' },
        { src: 'sample-road', cap: 'the long way home.', focus: [0.5, 0.5] },
        { src: 'sample-lake', cap: 'some are blurry. that is fine.', focus: [0.5, 0.5] },
      ],
    },
    {
      label: 'side by side',
      paint: '#5c584c',
      frames: [
        { src: 'sample-evening', cap: 'the last one of the roll.', focus: [0.5, 0.5] },
        { src: 'sample-morning', cap: 'add yours from the editor.', focus: [0.5, 0.5] },
      ],
    },
  ],
  SHOT_CAPTIONS: [
    'you took this one.',
    'the table, while nobody was looking.',
    'possibly in focus.',
    'this is what the room looked like.',
    'some are blurry. this one might be.',
    'nothing happened, and you kept it.',
    'one more, just in case.',
    'proof that you were here.',
  ],
};

const local = Object.values(import.meta.glob('./content.local.js', { eager: true }))[0];
const BASE = local || SAMPLE;

export const MAX_FRAMES = 6;
export const SAVED_KEY = 'content';

export const MAX_TINS = 6;
// What a new tin is painted, in order. Where a tin sits belongs to the table (see tinHomes in main.js).
export const PAINTS = ['#10233c', '#5f4410', '#4a1a10', '#5c584c', '#1f3a2c', '#3b2a4a'];
const TURNS = [0.5, -0.35, 0.22, -0.62, 0.38, -0.18];

const copy = (value) => JSON.parse(JSON.stringify(value));

// The words and photos, in the shape the editor works with.
export function defaults() {
  return {
    letter: copy(BASE.LETTER),
    tins: BASE.TINS.map(({ label, paint, frames }) => ({ label, paint, frames: copy(frames) })),
    shotCaptions: copy(BASE.SHOT_CAPTIONS),
  };
}

export const LETTER = { address: '', lines: [] };
export const TINS = [];
export const SHOT_CAPTIONS = [];
export const ALL_FRAMES = [];

function use(content) {
  LETTER.address = content.letter.address;
  LETTER.lines = content.letter.lines;
  TINS.splice(
    0,
    TINS.length,
    ...content.tins.slice(0, MAX_TINS).map((spec, i) => ({
      id: 'abcdef'[i],
      turn: TURNS[i],
      label: spec.label,
      paint: spec.paint || PAINTS[i],
      frames: spec.frames.slice(0, MAX_FRAMES),
    }))
  );
  SHOT_CAPTIONS.splice(0, SHOT_CAPTIONS.length, ...(content.shotCaptions.length ? content.shotCaptions : BASE.SHOT_CAPTIONS));
  ALL_FRAMES.splice(0, ALL_FRAMES.length, ...TINS.flatMap((tin) => tin.frames.map((frame) => ({ ...frame, tinId: tin.id }))));
}

export function current() {
  return {
    letter: copy(LETTER),
    tins: TINS.map(({ label, paint, frames }) => ({ label, paint, frames: copy(frames) })),
    shotCaptions: copy(SHOT_CAPTIONS),
  };
}

// A saved edit wins over the files. Anything missing or broken in it falls back to the files.
function valid(saved) {
  return (
    saved &&
    typeof saved.letter?.address === 'string' &&
    Array.isArray(saved.letter.lines) &&
    Array.isArray(saved.tins) &&
    saved.tins.length >= 1 &&
    saved.tins.length <= MAX_TINS &&
    saved.tins.every((tin) => typeof tin.label === 'string' && Array.isArray(tin.frames) && tin.frames.length > 0)
  );
}

// A site made with 「导出成网站」 carries its words and photos in content.json next to the page.
export const SITE = { exported: false, editable: true };

async function fromSite() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}content.json`, { cache: 'no-cache' });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.app !== 'film-tins' || !valid(data.content)) return null;
    SITE.exported = true;
    SITE.editable = data.editable !== false;
    return data.content;
  } catch {
    return null;
  }
}

let base;

// What 恢复成原来的样子 goes back to: the exported site's own content, or the files.
export const original = () => (base ? JSON.parse(JSON.stringify(base)) : defaults());

export async function loadContent() {
  const [saved, site] = await Promise.all([load(SAVED_KEY), fromSite()]);
  base = site;
  const content = valid(saved) ? saved : site || defaults();
  content.shotCaptions = Array.isArray(content.shotCaptions) ? content.shotCaptions : [];
  use(content);
  return content;
}

use(defaults());
