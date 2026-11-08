import { KINDS, MAX_PRODUCTS } from './analyze-form.js';
import { t, tx } from './i18n.js';
import { MUSE_NOTE } from './muse-form.js';
import { MAX_PROMPTS } from './shared/prompt-split.js';
import { MAX_SAMPLES, PERIOD_LABEL, STORE_MAX_SECONDS, STORE_TEXT, TOP_TITLE } from './shared/skill-store-form.js';

// The words of the first-time cards of three more tabs (Tạo ảnh, Kho skill, Phân tích video) and the four menu lines that come with them. Re-exported by guide-content.js, which stays
// the one place to import from. Same rules as there: plain words, short sentences, every number from the constant the app itself uses (tests/guide-content-wave2.test.js pins each one),
// a block that talks about something draws only when that thing is on the screen of THIS core. A block has image: null (a text-only card) or a file of site/guide/ with its size and alt.
// Bàn sáng tạo has no card: its empty screen already walks the three steps, so it only gets a menu line (guide-menu.js opens the tab).

export const TAB_CARD_TEXT = {
  image: { title: t('Tạo ảnh: những điều cần biết'), help: t('Hướng dẫn tạo ảnh') },
  skills: { title: t('Kho skill: những điều cần biết'), help: t('Hướng dẫn Kho skill') },
  analyze: { title: t('Phân tích video: những điều cần biết'), help: t('Hướng dẫn phân tích video') },
};

// One line per entry of the "Hướng dẫn" menu that opens one of these tabs (10-119 characters each, guide-content.test.js).
export const TAB_MENU_INTRO = {
  image: t('Chọn Muse hay Nano Banana, khung ảnh, nhiều ảnh một lúc.'),
  analyze: t('Thả video mẫu, AI viết prompt, đưa vào hàng đợi.'),
  studio: t('Nối khối thành dây chuyền rồi bấm Chạy cả bàn.'),
  skills: t('Skill là công thức làm video, Top 3, đăng skill của bạn.'), // "Top 3" = TOP_TITLE (shared/skill-store-form.js); guide-content-wave2.test.js keeps the two in step
};

// What the core does with a command when there is no account for it: electron/queue-ipc.js queue:add refuses it AT ONCE ("Muse cần ít nhất một acc Muse đã đăng nhập xong…", "Veo cần ít nhất
// một acc Gmail của Veo…": bad_task); an account that is only busy or resting still counts as one, so the command waits for it (muse-form.js MUSE_NOTE.noAccount "lệnh sẽ chờ").
export const ACCOUNT_WAIT_LINE = t('Acc đang bận hoặc đang nghỉ thì lệnh xếp hàng chờ; chưa có acc nào thì app không nhận lệnh.');
// [ĐỂ SẾP XEM] kept as separate lines so the owner can read or drop them alone. The cost: the core's .claude/features/nano-banana.md "Đã đo" (0 credit on a PRO Flow account; the Free plan was never measured).
export const NANO_COST_LINE = t('Nano Banana thường không tốn credit khi acc ở gói PRO của Flow; gói khác chưa kiểm tra.');
// [ĐỂ SẾP XEM] The video goes to the Google Drive of the Gmail account (the core's .claude/features/video-analysis.md "Bẫy": the Drive file is never deleted; the chat is only TRIED: electron/ai-studio-flow.js finish() / ai-studio-page.js deleteChat can fail, then only a log line "chat vẫn còn trên acc", and nothing is deleted after a cancel or a timeout: finish() skips deleteChat when out.reason is 'cancelled' or 'timeout', which is the last sentence of the line).
export const ANALYZE_DRIVE_LINE = t('Video bạn thả vào được tải lên Google Drive của acc Gmail dùng để phân tích. App cố xoá cuộc chat sau khi đọc xong, nhưng tệp trong Drive vẫn còn và có thể cả cuộc chat nếu xoá không được. Nếu bạn dừng giữa chừng hoặc quá giờ, app không thử xoá cuộc chat.');

// The size of a Muse Image picture is read from the sentence the Model box already shows (muse-form.js MUSE_NOTE.ratioImage), so it is typed once. The limits of the sample video are
// the core's (video-meta.js MAX_VIDEO_SECONDS, MAX_VIDEO_BYTES / 1 MiB), which the web holds only inside the hint of analyze-video-box.js: guide-content-wave2.test.js compares them with that hint.
export const IMAGE_SIZE = /\d+x\d+/.exec(MUSE_NOTE.ratioImage)?.[0] ?? '';
export const ANALYZE_LIMITS = { seconds: 60, gb: 2 }; // the core's MAX_VIDEO_SECONDS / MAX_VIDEO_BYTES (a video over 100 MB is made light by the app before AI Studio)

// The size of every picture of these cards (site/guide/, shot from the real app): the card reserves the room before the picture arrives (guide-content.test.js reads each PNG header and compares).
export const PICTURE_SIZE_WAVE2 = {
  'image-models.png': { width: 430, height: 362 },
  'image-nano.png': { width: 430, height: 388 },
  'image-many.png': { width: 430, height: 224 },
  'skills-card.png': { width: 430, height: 384 },
  'skills-top.png': { width: 429, height: 436 },
  'analyze-need.png': { width: 430, height: 90 },
  'analyze-drop.png': { width: 430, height: 472 },
};
const pic = (file, alt) => ({ image: file, ...PICTURE_SIZE_WAVE2[file], alt });
const textOnly = { image: null };
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// nanoMax = how many pictures a Nano Banana picture takes (image-models.js nanoRefMax) when the core offers Nano Banana, else 0.
export function imageBlocks({ nanoMax = 0 } = {}) {
  const nano = nanoMax > 0;
  const many = {
    id: 'many',
    title: t('Nhiều ảnh một lúc, ảnh nằm ở đâu'),
    lines: [
      t('Viết nhiều mô tả cách nhau bằng một dòng trống, mỗi mô tả ra một ảnh (tối đa {max} mô tả mỗi lần).', { max: MAX_PROMPTS }), // model-groups.js PROMPT_HINT_IMAGE, shared/prompt-split.js
      t('Ảnh xong hiện ở tab Lịch sử. Bấm "Mở thư mục" để tới file.'), // index.html #tab-hist, library-ui.js rowButtons
    ],
    ...pic('image-many.png', t('Ô mô tả ảnh có hai mô tả cách nhau một dòng trống, bộ đếm bên phải ghi "2 lệnh".')),
  };
  if (!nano) { // an older core: Muse Image alone, no Model groups, no ratio, no pictures
    return [{
      id: 'models',
      title: t('Tạo ảnh bằng Muse Image'),
      lines: [
        t('Muse Image dùng acc Muse (thêm ở Setup). {wait}', { wait: ACCOUNT_WAIT_LINE }), // muse-form.js MUSE_NOTE.image; the wait line: queue-ipc.js queue:add
        t('Muse Image không chọn tỉ lệ: ảnh ra khung ngang {size}.', { size: IMAGE_SIZE }), // MUSE_NOTE.ratioImage
      ],
      ...textOnly,
    }, many];
  }
  return [{
    id: 'models',
    title: t('Chọn Muse hay Nano Banana'),
    lines: [
      t('Bấm nút Model để chọn Muse Image hoặc Nano Banana. Muse Image dùng acc Muse, Nano Banana dùng acc Gmail Veo (thêm ở Setup → Veo).'), // image-models.js imageGroups, muse-form.js MUSE_NOTE
      ACCOUNT_WAIT_LINE,
      NANO_COST_LINE,
    ],
    ...pic('image-models.png', t('Hộp chọn Model của Tạo ảnh có hai nhóm: Muse với Muse Image, và Nano Banana với ba model Nano Banana.')),
  }, {
    id: 'frame',
    title: t('Khung ảnh và ảnh tham chiếu'),
    lines: [
      t('Muse Image không chọn tỉ lệ: ảnh ra khung ngang {size}.', { size: IMAGE_SIZE }), // MUSE_NOTE.ratioImage
      t('Nano Banana chọn được tỉ lệ và nhận tối đa {max} ảnh tham chiếu.', { max: nanoMax }), // image-models.js nanoRatios, nanoRefMax
    ],
    ...pic('image-nano.png', t('Khung "Thêm ảnh tham chiếu" ghi tối đa 3 ảnh, ô mô tả ảnh, nút Model là Nano Banana 2.1 và nút tỉ lệ 9:16.')),
  }, many];
}

// publish = this core can post a skill (dola.skills.publish): the "Đăng skill" block draws only then. pickFile = it also has the ".md" picker (dola.pickSkill) and uploadSample = the "Tải mp4 lên" picker
// (dola.skills.pickSample): an older core hides those two buttons (skills-publish.js fileBtn.hidden, skills-sample-picker.js upload.hidden), so the sentences name them only when they are there.
export function skillsBlocks({ publish = false, pickFile = false, uploadSample = false } = {}) {
  const blocks = [{
    id: 'what',
    title: t('Skill là công thức làm video có sẵn'),
    lines: [
      t('Mỗi thẻ là một skill, tức một công thức để AI làm video nhiều cảnh. Bạn xem ngay video mẫu trên thẻ.'), // skills-cards.js header comment
      t('Cột trái ("Skill hệ thống") là skill do MD Motion Control viết, cột phải ("Cộng đồng") là skill do người dùng đăng và có thể chưa được kiểm duyệt.'), // skills-view.js draw(): the two column titles
      t('Rê chuột vào video để nghe tiếng.'), // skills-cards.js mountMedia: media.title
    ],
    ...pic('skills-card.png', t('Cột "Skill hệ thống" với ba thẻ skill, mỗi thẻ có video mẫu, tên, chế độ Pro hoặc Muse và nút "Dùng skill".')),
  }, {
    id: 'use',
    title: t('Chọn skill rồi bấm {use}', { use: tx(STORE_TEXT.use) }),
    lines: [
      t('Hàng trên cùng là "{top}", các skill được dùng nhiều nhất. Đổi giữa {week}, {month} và {all}.', { top: tx(TOP_TITLE.week), week: tx(PERIOD_LABEL.week), month: tx(PERIOD_LABEL.month), all: tx(PERIOD_LABEL.all) }), // shared/skill-store-form.js TOP_TITLE, PERIOD_LABEL
      t('Bấm "{use}" để sang tab Tạo video, ô skill hiện chữ "{chip}tên skill".', { use: tx(STORE_TEXT.use), chip: tx(STORE_TEXT.chipPrefix) }), // app.js useStoreSkill, skill-ui.js
      t('Skill chỉ dùng được với Pro và Muse, video tối đa {max} giây.', { max: STORE_MAX_SECONDS }), // shared/skill-store-form.js modeForUse, STORE_MAX_SECONDS
    ],
    ...pic('skills-top.png', t('Hàng "Top 3 tuần này" có nút Tuần, Tháng, Tất cả và thẻ hạng 1 có nút "Dùng skill".')),
  }];
  if (publish) {
    blocks.push({
      id: 'post',
      title: t('Đăng skill của bạn'),
      lines: [
        pickFile
          ? t('Bấm "Đăng skill", điền tiêu đề, mô tả, chọn Seedance Pro và/hoặc Muse, rồi dán nội dung hoặc chọn tệp .md.')
          : t('Bấm "Đăng skill", điền tiêu đề, mô tả, chọn Seedance Pro và/hoặc Muse, rồi dán nội dung.'), // skills-publish.js: the button, the fields, MODES, "Chọn tệp .md" (only with dola.pickSkill)
        uploadSample
          ? t('Cần ít nhất một video mẫu, tối đa {max}: chọn từ "Chọn từ Kho video" hoặc "Tải mp4 lên".', { max: MAX_SAMPLES })
          : t('Cần ít nhất một video mẫu, tối đa {max}: chọn từ "Chọn từ Kho video".', { max: MAX_SAMPLES }), // shared/skill-store-form.js MAX_SAMPLES, skills-sample-picker.js ("Tải mp4 lên" only with dola.skills.pickSample)
        t('Skill hiện ngay ở cột Cộng đồng và có thể chưa được kiểm duyệt.'), // skills-publish-flow.js, STORE_TEXT.unreviewed
      ],
      ...textOnly,
    });
  }
  return blocks;
}

export function analyzeBlocks() {
  const [copy, style] = KINDS;
  return [{
    id: 'need',
    title: t('Cần gì để dùng'),
    lines: [
      t('Cần ít nhất một acc Gmail ở mục Veo (Setup → Veo): app mượn acc đó để mở AI Studio đọc video.'), // analyze-form.js accountsLine / FAIL_TEXT.no_account
      t('Máy cần cài Google Chrome.'), // the core's electron/analyze-chrome.js: no real Chrome -> needs_real_chrome
      ANALYZE_DRIVE_LINE,
    ],
    ...pic('analyze-need.png', t('Dòng "3 acc Gmail của Veo dùng được để phân tích." nằm trên nút "Phân tích".')),
  }, {
    id: 'drop',
    title: t('Thả video, chọn cách viết'),
    lines: [
      t('Thả video mẫu (mp4 hoặc mov, tối đa {seconds} giây, {gb} GB) vào khung hoặc bấm khung để chọn.', { seconds: ANALYZE_LIMITS.seconds, gb: ANALYZE_LIMITS.gb }), // analyze-video-box.js hint
      t('{copy}: {copyDesc} {style}: {styleDesc}', { copy: tx(copy.label), copyDesc: lowerFirst(tx(copy.desc)), style: tx(style.label), styleDesc: lowerFirst(tx(style.desc)) }), // analyze-form.js KINDS
      t('Chọn sản phẩm từ thư viện (tối đa {max}): mọi prompt đều phải có đủ các thẻ @ của sản phẩm.', { max: MAX_PRODUCTS }), // analyze-form.js MAX_PRODUCTS; analyze-settings.js productNote: 'Mọi prompt đều phải có đủ các thẻ @ này.'
    ],
    ...pic('analyze-drop.png', t('Khung thả video mẫu, rồi các mục Kiểu (Copy, Chỉ phong cách), Lời thoại, Ngôn ngữ thoại và Phong cách.')),
  }, {
    id: 'result',
    title: t('Kết quả và đưa sang Tạo video'),
    lines: [
      t('Mỗi prompt là một thẻ: sửa chữ được, bỏ tick thẻ không ưng. Kết quả chỉ nằm trong trang này, không được lưu.'), // analyze-view.js empty state + header comment
      t('Thẻ viền đỏ thiếu thẻ @ sản phẩm: nút đưa vào hàng đợi tắt cho tới khi sửa hoặc bỏ tick.'), // analyze-results.js, analyze-cards.js blockers
      t('Bấm "Đưa N prompt vào hàng đợi" thì app chuyển sang Tạo video.'), // analyze-results.js paintBar, analyze-view.js queueNow
    ],
    ...textOnly,
  }];
}

// The blocks of the card of a tab: id = 'image' | 'skills' | 'analyze'; flags are the ones named above. An id with no card gives [].
export function tabBlocks(id, flags = {}) {
  if (id === 'image') return imageBlocks(flags);
  if (id === 'skills') return skillsBlocks(flags);
  return id === 'analyze' ? analyzeBlocks() : [];
}
