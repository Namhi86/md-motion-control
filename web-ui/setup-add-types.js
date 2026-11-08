import { t } from './i18n.js';
import { MUSE_TYPES, museNoun } from './setup-muse.js';

// What each way of adding (the "kind") of the Setup screen asks for: the format line under the box and the example in it. The Muse kinds are MUSE_TYPES (setup-muse.js);
// the buttons' words are in setup-platforms.js.
export const TYPES = {
  facebook: {
    hint: t('Mỗi dòng một cookie, có đủ c_user, xs, datr. Dòng thiếu sẽ bị bỏ qua.'),
    holder: 'c_user=…; xs=…; datr=…',
  },
  fbpass: {
    hint: t('Mỗi dòng một acc: id|mật khẩu|khoá 2FA (khoá 2FA có thể bỏ trống nếu acc không bật 2FA). App tự đăng nhập Facebook (qua proxy của acc) để lấy cookie, và lấy lại khi cookie chết. Nên nhập proxy trước; nếu chưa có app tự gán proxy còn trống.'),
    holder: t('61500000000000|matkhau|KHOA2FA'),
  },
  gmail: {
    hint: t('Mỗi dòng một acc: email|mật khẩu|khoá 2FA (khoá 2FA có thể bỏ trống nếu acc không bật 2FA). App tự đăng nhập Google (qua proxy của acc); acc này chỉ làm Seedance, Veo có acc Gmail riêng ở tab Veo. Dán thẳng dòng tab từ bảng tính cũng được (email khôi phục được bỏ qua). Nên nhập proxy trước.'),
    holder: t('ten@gmail.com|matkhau|KHOA2FA'),
  },
  gmail_veo: {
    hint: t('Mỗi dòng một acc: email|mật khẩu|khoá 2FA (khoá 2FA có thể bỏ trống nếu acc không bật 2FA). Đây là acc Gmail RIÊNG của Veo, không dùng chung với acc Gmail của Seedance (cùng email ở hai nơi là hai acc). Mỗi acc tốn credit Flow riêng, khoảng 50 credit mỗi ngày. App tự đăng nhập Google (qua proxy của acc). Nên nhập proxy trước.'),
    holder: t('ten@gmail.com|matkhau|KHOA2FA'),
  },
};

export const formOf = (k) => TYPES[k] || MUSE_TYPES[k];
// What a kind's box asks for, in "Dán …" and "Chưa dán …".
export const what = (k) => museNoun(k) || (k === 'gmail' || k === 'gmail_veo' ? 'email|pass|2fa' : k === 'fbpass' ? 'id|pass|2fa' : 'cookie');
