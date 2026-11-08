// Copied from dola-seedance-client/src/elements.js (smit-corp). Keep the two in step: change both, run both tests.
// The element library, pure (no Electron, no DOM: the window uses a copy, site/shared/elements.js of free-seedance-web).
// An element is one image with a name the person can mention in a prompt as @handle (the way MD Motion Control's Elements work). Only the
// path of the image is kept (the image stays where the person keeps it); the window never sees a path (RT-10).
export const CATEGORIES = ['auto', 'character', 'location', 'prop', 'style'];
export const CATEGORY_LABEL = { auto: 'Tự động', character: 'Nhân vật', location: 'Bối cảnh', prop: 'Đạo cụ', style: 'Phong cách' };
export const MAX_NAME = 80;
export const MAX_DESC = 300;
export const MAX_ELEMENTS = 2000;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 64_000_000; // 8000 x 8000: a bigger picture needs gigabytes to decode, whatever it weighs on disk
export const MAX_IMAGES_PER_PROMPT = 10; // Dola takes at most 10 reference images in one request
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const HANDLE_RE = /^[a-z0-9_]{1,80}$/;
const ABSOLUTE_RE = /^(?:\/|[A-Za-z]:[\\/])/;
const extOf = (file) => (/\.[A-Za-z0-9]+$/.exec(String(file)) || [''])[0].toLowerCase();
export const isImageFile = (file) => IMAGE_EXTENSIONS.includes(extOf(file));

// "Áo dài đỏ" -> "ao_dai_do". Same rule as MD Motion Control's slugifyTag: đ/Đ first (they have no decomposition), accents off, lower case,
// every run of other characters becomes "_", at most 80 characters, empty -> "element". A name that looks like an image reference
// (image, image_2, image3) gets "_el", so it can never be taken for "@Image N".
export function slugifyTag(name) {
  let s = String(name ?? '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, MAX_NAME).replace(/_+$/g, '');
  if (!s) return 'element';
  return /^image_?\d*$/.test(s) ? `${s.slice(0, MAX_NAME - 3)}_el` : s;
}

// The handle for a new element: the slug, or slug_2, slug_3 … when a handle is already taken (taken: Set of lower-case handles).
export function uniqueHandle(name, taken) {
  const base = slugifyTag(name);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `_${n}`;
    const h = `${base.slice(0, MAX_NAME - suffix.length).replace(/_+$/g, '')}${suffix}`;
    if (!taken.has(h)) return h;
  }
}

// A name / description / category from the window, checked. fields: the ones that must be there (add) or may be there (update).
// -> { ok: true, value: { name?, description?, category? } } | { ok: false, reason, note }
export function cleanElementInput(input, { requireName = true } = {}) {
  const bad = (reason, note) => ({ ok: false, reason, note });
  if (!input || typeof input !== 'object') return bad('bad_input', 'Thiếu thông tin phần tử.');
  const value = {};
  if (input.name !== undefined || requireName) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) return bad('bad_name', 'Phần tử cần có tên.');
    if (name.length > MAX_NAME) return bad('bad_name', `Tên tối đa ${MAX_NAME} ký tự.`);
    value.name = name;
  }
  if (input.description !== undefined) {
    if (typeof input.description !== 'string' || input.description.length > MAX_DESC) return bad('bad_description', `Mô tả tối đa ${MAX_DESC} ký tự.`);
    value.description = input.description.trim();
  }
  if (input.category !== undefined) {
    if (!CATEGORIES.includes(input.category)) return bad('bad_category', 'Phân loại không hợp lệ.');
    value.category = input.category;
  }
  return { ok: true, value };
}

// The file read back from disk, never trusted: bad rows are dropped, handles are made valid and unique, fields are cut to size.
export function sanitizeLibrary(raw) {
  if (!Array.isArray(raw)) return [];
  const ids = new Set();
  const handles = new Set();
  const out = [];
  for (const e of raw) {
    if (out.length >= MAX_ELEMENTS) break;
    if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !ID_RE.test(e.id) || ids.has(e.id)) continue;
    const name = typeof e.name === 'string' ? e.name.trim().slice(0, MAX_NAME) : '';
    const image = typeof e.image === 'string' && ABSOLUTE_RE.test(e.image) && !e.image.includes('\0') && isImageFile(e.image) ? e.image : '';
    if (!name || !image) continue;
    const handle = uniqueHandle(typeof e.handle === 'string' && HANDLE_RE.test(e.handle) ? e.handle : name, handles);
    ids.add(e.id);
    handles.add(handle);
    out.push({
      id: e.id,
      name,
      handle,
      category: CATEGORIES.includes(e.category) ? e.category : 'auto',
      description: typeof e.description === 'string' ? e.description.slice(0, MAX_DESC) : '',
      image,
      addedAt: Number.isFinite(e.addedAt) ? e.addedAt : 0,
    });
  }
  return out;
}

// What the window may see of an element: everything but the path of the image.
export function publicView(e) {
  return {
    id: e.id,
    name: e.name,
    handle: e.handle,
    category: e.category,
    description: e.description,
    addedAt: e.addedAt,
    imageName: String(e.image).split(/[\\/]/).pop(),
  };
}

// @handle in a prompt. MD Motion Control's rule: not glued to a letter, digit, "_", "@" or "/" before it (so e-mails, "@@x" and URLs are not
// mentions), the handle is 1-80 letters, digits or "_", and "@Image 2" is a reference to an attached image, not an element.
// -> [{ handle (lower case), start, end }] in the order they appear.
export function parseMentions(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/(?<![A-Za-z0-9_@/])@(?:[Ii]mage (\d+)\b|([A-Za-z0-9_]{1,80}))/g)) {
    if (m[2]) out.push({ handle: m[2].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

// The elements of `library` a prompt mentions, in the order of their first mention (a repeat counts once).
// -> { elements: [element], unknown: [handle] } (unknown: mentioned handles that no element has)
export function resolveMentions(text, library) {
  const by = new Map((library || []).map((e) => [e.handle, e]));
  const elements = [];
  const unknown = [];
  for (const { handle } of parseMentions(text)) {
    const e = by.get(handle);
    if (e) {
      if (!elements.includes(e)) elements.push(e);
    } else if (!unknown.includes(handle)) unknown.push(handle);
  }
  return { elements, unknown };
}
