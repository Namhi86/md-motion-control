import { t, tn, tx } from './i18n.js';
import { MAX_IMAGES_PER_PROMPT } from './shared/elements.js';
import { MAX_PROMPTS } from './shared/prompt-split.js';
import { PLATFORMS } from './setup-platforms.js';
import { SKILL_TEXT } from './shared/skill-form.js';
import { STORE_MAX_SECONDS, STORE_TEXT } from './shared/skill-store-form.js';
import { TAB_MENU_INTRO } from './guide-content-wave2.js';

export * from './guide-content-wave2.js'; // the cards of Tạo ảnh, Kho skill and Phân tích video live there (this file stays the one place to import from)

// Every sentence a newcomer reads in the guide, in ONE place: the tour that circles the real buttons (TOUR_TEXT), the line under the "Tạo" button, the "Hướng dẫn" menu
// and the first-time card of the "Tạo video" tab. This is the file the owner reads before a text goes live. Plain words for a newcomer, short sentences.
// Each rule was checked against the code named in the comment beside it (plans/261020-1535-md-motion-onboarding-wizard/reports/p4-copy-for-review.md
// lists them with file:line); a rule that could not be confirmed there is not written. Numbers come from the constants the app itself uses, never
// typed again (tests/guide-card.test.js and tests/guide-content.test.js pin every number).
// Two words that sit in index.html, not here: the header button "Hướng dẫn" and the title of the form's "?" (= CARD_TEXT.help; guide-content.test.js pins it).

// The one limit the web holds no copy of: the size of a skill FILE is the core's (dola-seedance-client/src/skill-input.js SKILL_MAX_BYTES = 200 * 1024).
export const SKILL_FILE_KB = 200;

// The tour (guide-tour.js): a dark screen with a bright hole around the REAL button and a popup with an arrow (Sếp 2026-10-21, replaces the old full-page wizard). One entry per step id
// of guide-tour-steps.js ORDER; `body` is the first line of the popup. The popup of the first question (`ask`) is in the middle of the screen, with no hole.
export const TOUR_TEXT = {
  ask: { title: t('Bạn là người mới?'), body: t('Để mình hướng dẫn bạn bắt đầu nhé.'), yes: t('Hướng dẫn tôi'), no: t('Tôi biết rồi') }, // "Tôi biết rồi" = the guide is skipped for this e-mail
  next: t('Tiếp'), // the fallback button of every step: it does what the click on the circled button would do
  skip: t('Bỏ qua hướng dẫn'),
  close: t('Đóng'),
  setup: { body: t('Bước 1: mở Setup tài khoản. Bấm vào đây.') },
  proxyTab: {
    body: t('Bước 2 (không bắt buộc): thêm proxy. Bấm "Kho proxy". Proxy là đường mạng riêng cho mỗi acc, nên có nhưng không có vẫn chạy.'), // proxy-ui.js NOTES[1]; no branch of account-ipc.js refuses a missing proxy (p0-probe.md A); "Kho proxy" = the row of the Setup sidebar (setup-side-model.js SIDE_TEXT.proxyRow, #su-tab-proxy)
    skip: t('Bỏ qua proxy'),
  },
  proxyBox: {
    body: t('Dán proxy vào ô, mỗi dòng một proxy, rồi bấm "Thêm proxy". Xong thì bấm Tiếp.'), // proxy-ui.js: the paste box and its button "Thêm proxy"
    forms: t('Các dạng proxy app nhận được nằm ở mục "Cần biết" của Kho proxy.'), // only when the sentence of proxy-ui.js is not on the page
  },
  add: { body: t('Bước 3: chọn loại acc, dán acc vào ô, bấm Thêm vào danh sách.') }, // setup.js: the kinds row, the box, the button "Thêm vào danh sách"
  wait: {
    body: t('Bước 4: app đang đăng nhập acc, chờ tới khi báo Sẵn sàng.'),
    none: t('Chưa có acc nào đang đăng nhập.'),
    count: (label, n) => t('{label}: {count}', { label, count: tn(n, '{n} acc', '{n} account', '{n} accounts') }),
    counts: [['logging', t('Đang lấy cookie')], ['code', t('Chờ bạn nhập mã Muse')], ['captcha', t('Chờ bạn bấm captcha')], ['failed', t('Đăng nhập lỗi')]], // "Đang lấy cookie" = the label of the table for this state (ui-text.js STATUS_LABEL.login)
    // A Muse account waits for the person to type the code Muse mailed (setup-muse.js EMAIL_OPENED: the app opens a Muse login window; LOGIN_BUTTON "Đăng nhập" only shows
    // once the wait ran out, setup-table.js needsLogin). The tab name is the real one (setup-platforms.js PLATFORMS.muse.label).
    codeHint: t('Mã Muse được gửi về email của acc. Gõ mã đó vào cửa sổ đăng nhập Muse mà app đã mở. Nếu hết giờ chờ, bấm mục {platform} ở khung sáng, rồi bấm "Đăng nhập" ở acc đó (nút ⋯ cuối dòng).', { platform: PLATFORMS.muse.label }), // the row of the sidebar is circled (#su-plats) while this hint is on; "Đăng nhập" is in the ⋯ menu of the row
    // "Kiểm tra" is in the ⋯ menu of the row ("Đăng nhập thử để biết cookie còn dùng được không", setup-row-model.js); the switch is #su-show on the Cài đặt page ("Cửa sổ & trình duyệt"), circled while this hint is on.
    captchaHint: t('Mở "Cửa sổ & trình duyệt" ở khung sáng và bật "Hiện cửa sổ đăng nhập", rồi bấm "Kiểm tra" ở acc đó (nút ⋯ cuối dòng): cửa sổ đăng nhập hiện ra để bạn tự bấm captcha.'),
    captchaHintOn: t('Công tắc đã bật. Giờ bấm "Kiểm tra" ở acc đó trong khung sáng (nút ⋯ cuối dòng): cửa sổ đăng nhập hiện ra để bạn tự bấm captcha.'), // [ĐỔI] the same hint once the switch is on: the light moves from the switch to the table
  },
  done: { body: t('Xong rồi! Bấm Tạo video để bắt đầu.'), next: t('Mở Tạo video') },
  // Under the buttons while "Tiếp" is off: what is missing (guide-tour-steps.js canAdvance).
  why: { add: t('Thêm ít nhất 1 acc để đi tiếp.'), wait: t('Đợi có acc ở trạng thái Sẵn sàng.') },
};

// The line under the "Tạo" button while no account is ready (guide-state.js canCreate, guide-lock.js). Two cases, so a returning person is not told to add accounts:
//   NO_READY_WHY   the list is EMPTY: it points at the guide, it does not explain it
//   NO_READY_WAIT  accounts exist but none is ready now (resting, logging in, off, dead): a queued command waits for one (app.js "lệnh sẽ chờ", core queue 'no_account')
export const NO_READY_WHY = t('Chưa có acc sẵn sàng. Mở Hướng dẫn (nút "?" tròn ở đầu trang, hoặc nút "Hướng dẫn") để thêm acc.'); // index.html #nav-guide: the word from 1200 px up, a round "?" below
export const NO_READY_WAIT = t('Chưa có acc sẵn sàng: các acc đang nghỉ, đang đăng nhập hoặc cần kiểm tra. Lệnh bạn tạo sẽ chờ.');

// The names of the "Hướng dẫn" menu, one per entry of the header (guide-state.js menuItems).
export const MENU_LABEL = {
  start: t('Bắt đầu'),
  create: t('Tạo video'),
  image: t('Tạo ảnh'),
  analyze: t('Phân tích video'),
  studio: t('Bàn sáng tạo'),
  skills: t('Kho skill'),
};

// The line under each name of the "Hướng dẫn" menu. An id with NO line here is not listed (guide-menu.js menuEntries). The lines of Tạo ảnh, Phân tích video, Bàn sáng tạo and
// Kho skill are in guide-content-wave2.js.
export const MENU_INTRO = {
  start: t('Mình chỉ từng nút: mở Setup, thêm proxy (không bắt buộc), thêm tài khoản, đợi đăng nhập.'),
  create: t('Ảnh tham chiếu, nhiều prompt một lúc, skill.'),
  ...TAB_MENU_INTRO,
};
export const MENU_TITLE = t('Chọn mục cần xem');

export const CARD_TEXT = {
  strip: t('Mới dùng? Xem vài điều cần biết.'), // one line in the strip (the strip is 460 px wide at the narrowest window)
  open: t('Xem hướng dẫn'),
  title: t('Tạo video: những điều cần biết'),
  understood: t('Đã hiểu'),
  close: t('Đóng'),
  help: t('Hướng dẫn tạo video'), // the "?" button next to "Mô tả video"
};

// The pictures of the card (site/guide/, shot from the real app by scripts/shoot-guide.mjs, see site/guide/README.txt): the size of each file in pixels, so the
// card reserves the room before the picture arrives and nothing jumps (tests/guide-content.test.js reads the PNG header of every file and compares).
const PICTURE_SIZE = {
  'create-refs.png': { width: 430, height: 240 },
  'create-many.png': { width: 430, height: 200 },
  'create-skill.png': { width: 430, height: 129 },
};

// The blocks of the card: [{ id, title, lines: [1-3 short lines], image, width, height, alt }]. image = a file name under site/guide/ (null = none; the card draws
// an <img> only when it is set, with width x height reserved, and then alt says what the picture shows).
// A block exists only when what it talks about is on the screen of THIS core (guide-card.js cardBlocks works the three flags out):
//   elements   the "Thêm phần tử" box (window.dola.elements; an older core has the plain "Thêm ảnh tham chiếu" box instead)
//   skillFile  the "Thêm skill (.md/.txt)" button (opts.skill and window.dola.pickSkill)     skillStore  the "Kho skill" tab (opts.skills and dola.skills.list)
export function createBlocks({ elements = false, skillFile = false, skillStore = false } = {}) {
  const blocks = [];
  if (elements) {
    blocks.push({
      id: 'refs',
      title: t('Ảnh tham chiếu: Phần tử và @tên'),
      lines: [
        t('Phần tử là một cái tên kèm một tấm ảnh (nhân vật, bối cảnh, đạo cụ...). Bấm "Thêm phần tử", rồi "Phần tử mới" để tạo.'), // elements-tray.js, elements-popup.js
        t('Trong ô mô tả, gõ @ rồi chọn phần tử, ví dụ @linh. App gửi kèm ảnh của phần tử bạn nhắc.'), // prompt-editor.js; the core adds the image (queue-input.js)
        t('Mỗi prompt chỉ gửi ảnh của phần tử nó nhắc (tối đa {max} ảnh; Veo có giới hạn riêng). Prompt không có @ thì không gửi ảnh. Chế độ Muse không đọc @tên.', { max: MAX_IMAGES_PER_PROMPT }), // veo-images.js; app.js viaMuse
      ],
      image: 'create-refs.png',
      ...PICTURE_SIZE['create-refs.png'],
      alt: t('Khung "Thêm phần tử" đã có hai phần tử, Linh và Căn hộ, và ô mô tả có hai chip @Linh và @Căn hộ nằm trong câu.'),
    });
  }
  blocks.push({
    id: 'many',
    title: t('Nhiều prompt một lúc'),
    lines: [
      t('Prompt là đoạn chữ mô tả một video, mỗi prompt tạo một video riêng. Muốn tạo nhiều video, cách các prompt bằng một dòng trống (bấm Enter hai lần).'), // shared/prompt-split.js, queue-ui.js
      t('Xuống dòng một lần thì vẫn là cùng một prompt. Nút "Nhập tệp .txt / .csv" nạp từ tệp: .txt không có dòng trống thì mỗi dòng là một prompt, có dòng trống thì cách nhau bằng dòng trống; .csv mỗi dòng là một prompt.'), // queue-prompt-box.js
      t('Tối đa {max} prompt mỗi lần, phần thừa bị bỏ.', { max: MAX_PROMPTS }),
    ],
    image: 'create-many.png',
    ...PICTURE_SIZE['create-many.png'],
    alt: t('Ô mô tả có hai prompt, cách nhau một dòng trống, và bộ đếm bên dưới ghi "2 lệnh".'),
  });
  if (skillFile || skillStore) {
    const how = [];
    if (skillStore) how.push(t('Chọn skill ở tab "Kho skill" rồi bấm "{use}" (video tối đa {max} giây).', { use: tx(STORE_TEXT.use), max: STORE_MAX_SECONDS })); // skills-cards.js, skill-store-form.js
    if (skillFile) how.push(skillStore // skill-ui.js, skill-input.js (core)
      ? t('Hoặc bấm "{button}" để nạp tệp của bạn, tối đa {kb} KB.', { button: tx(SKILL_TEXT.button), kb: SKILL_FILE_KB })
      : t('Bấm "{button}" để nạp tệp của bạn, tối đa {kb} KB.', { button: tx(SKILL_TEXT.button), kb: SKILL_FILE_KB }));
    blocks.push({
      id: 'skill',
      title: t('Skill: video nhiều cảnh theo công thức'),
      lines: [
        t('Skill là ghi chú hướng dẫn cho AI đi kèm prompt. Dùng khi muốn một video nhiều cảnh theo công thức cố định, như clip bán hàng.'),
        t('Chỉ chế độ Pro và Muse dùng được skill (Nhanh + tiếng và Veo thì không).'), // shared/skill-form.js SKILL_MODES
        how.join(' '),
      ],
      image: 'create-skill.png',
      ...PICTURE_SIZE['create-skill.png'],
      alt: t('Hàng "{button}" nằm ngay dưới khung phần tử, phía trên ô mô tả.', { button: tx(SKILL_TEXT.button) }),
    });
  }
  return blocks;
}
