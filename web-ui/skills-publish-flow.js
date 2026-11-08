import { publishErrorText, publishProblemText } from './skills-text.js';
import { isSkillId, publishPayload, publishProblems } from './shared/skill-store-form.js';
import { errText } from './ui-text.js';
import { t, tn } from './i18n.js';

// The steps of "Đăng skill" without any drawing (skills-publish.js draws what this returns): one call to the core, and what to say after it.
// A skill is made by the first call; if some samples fail the skill STAYS (it counts against the 10 a day), and a retry sends only the failed samples to
// that skill with dola.skills.addSamples(skillId, samples): never publish() again, which would make a second skill. The answer { ok: false, made: true }
// of the core (the real one is { ok: false, error: 'bad_answer', reason: 'bad_answer', made: true }, with NO id) means "the skill was made but its answer could
// not be used": nothing was uploaded and the id is unknown, so the window says the skill exists and offers no way to add samples or to publish again.
// Only when the core also gave a good id (never a made-up one) can the samples be sent again.
// run(input, now) -> { kind, progress, error, retry }
//   kind 'invalid'   the form is wrong: nothing was sent       'refused'  the core / server said no: nothing was made (or, on a retry, nothing was added)
//        'partial'   the skill exists, some samples failed     'done'     all samples are up
export function createPublishFlow({ api }) {
  const canAdd = typeof api?.addSamples === 'function';
  let made = false; // a skill exists (its id may be unknown)
  let skillId = null; // its id when the core gave a good one
  let waiting = []; // the samples that still have to be sent
  let sentTotal = 0;
  const retryable = () => made && skillId !== null && canAdd && waiting.length > 0;

  function afterMade(sentList, failedIdx, sent, why) {
    waiting = failedIdx === null ? sentList : failedIdx.map((i) => sentList[i]).filter(Boolean);
    sentTotal += sent;
    const retry = retryable();
    return {
      kind: 'partial',
      retry,
      progress: sentTotal ? tn(sentTotal, 'Skill đã được tạo, {n} video mẫu đã tải xong.', 'The skill was created and {n} sample video has been uploaded.', 'The skill was created and {n} sample videos have been uploaded.') : t('Skill đã được tạo nhưng chưa có video mẫu nào, nên chưa hiện cho ai (nháp).'),
      error: t('{why} {next}', { why, next: retry ? t('Bấm "Thử lại video lỗi" hoặc đóng cửa sổ.') : t('Đóng cửa sổ rồi mở lại Kho skill; đừng bấm Đăng lần nữa vì sẽ tạo thêm một skill.') }),
    };
  }

  return {
    get made() { return made; },
    async run(input, now = Date.now()) {
      if (!made) {
        const problems = publishProblems(input);
        if (problems.length) return { kind: 'invalid', retry: false, error: publishProblemText(problems[0]) };
      } else if (!retryable()) {
        return { kind: 'refused', retry: false, error: t('Skill đã được tạo; không gửi lại video mẫu được từ cửa sổ này. Đóng cửa sổ và mở lại Kho skill.') };
      }
      const sentList = made ? waiting : input.samples; // the failed indexes of the answer point into this list
      let r;
      try {
        r = made ? await api.addSamples(skillId, sentList) : await api.publish(publishPayload(input));
      } catch (e) {
        r = { ok: false, error: 'server', message: errText(e) };
      }
      if (!r?.ok && r?.made === true && !made) { // the skill is there, the answer was not usable
        made = true;
        skillId = isSkillId(r.id) ? r.id : null;
        return afterMade(sentList, null, 0, skillId
          ? t('Skill đã được tạo, chỉ còn video mẫu cần gửi lại.')
          : t('Skill đã được tạo nhưng máy chủ không trả mã skill nên chưa gửi được video mẫu nào.'));
      }
      if (!r?.ok) return { kind: 'refused', retry: retryable(), error: publishErrorText(r, now) };
      if (!made) {
        made = true;
        skillId = isSkillId(r.id) ? r.id : null; // no good id: the failed samples cannot be sent again from here, and 'made' is never used as one
      }
      const failed = Array.isArray(r.samples?.failed) ? r.samples.failed : [];
      if (failed.length) {
        const why = [...new Set(failed.map((f) => publishErrorText(f, now)))].join(' ');
        return afterMade(sentList, failed.map((f) => f.index), Number(r.samples?.sent) || 0, t('{head}: {why}', { head: tn(failed.length, '{n} video mẫu lỗi', '{n} sample video failed', '{n} sample videos failed'), why }));
      }
      waiting = [];
      return { kind: 'done', retry: false, progress: t('Xong. Skill của bạn đã hiện ở cột Cộng đồng.') };
    },
  };
}
