// English for the Admin screen (admin-text.js, admin-view.js): the Facebook post of the unlock gate, the e-mails that may watch the windows, and the error log of a user.
// Key = the Vietnamese sentence exactly as the code has it. admin-text.js says every line is plain words, so the English stays plain too.
// Words follow plans/261029-0812-md-motion-english/glossary.md ("Setup" in a sentence = "Accounts").
export const dynamic = [];

export default {
  // admin-view.js: the frame
  'Chỉ tài khoản admin thấy màn này. Máy chủ kiểm quyền cho từng thao tác.': 'Only admin accounts can see this screen. The server checks the permission for every action.',
  'Lưu': 'Save',
  'Đang lưu…': 'Saving…',
  'Đang tải…': 'Loading…',
  'Xem': 'View',

  // 1. the post
  'Bài viết mở khoá app': 'App unlock post',
  'Bài viết mở khoá Giọng nói': 'Voice unlock post',
  'Bài Facebook mà mọi người phải comment mã MDMC_voice_… và share để dùng Giọng nói không giới hạn ký tự.': 'The Facebook post that everybody must comment the code MDMC_voice_… on and share to use Voice with no character limit.',
  'Dán link lần đầu sẽ tự tạo chiến dịch': 'Pasting a link for the first time creates the campaign',
  'Bài Facebook mà mọi người phải like, comment mã và share để mở khoá app.': 'The Facebook post that everybody must like, comment the code on and share to unlock the app.',
  'Đổi bài viết: người đã comment/share ở bài cũ mà chưa được mở khoá sẽ phải làm lại ở bài mới.': 'Changing the post: anyone who commented or shared on the old post and has not been unlocked yet will have to do it again on the new one.',
  'Đây là bài đang dùng, không cần lưu lại.': 'This is the post in use already; there is no need to save it again.',
  'Bấm lần nữa để xác nhận': 'Click again to confirm',
  'Đã lưu bài viết mới. Mọi người thấy bài này ngay.': 'The new post is saved. Everybody sees it right away.',
  'Hãy dán địa chỉ bài viết Facebook vào ô.': 'Paste the address of the Facebook post into the box.',
  'Địa chỉ quá dài (tối đa {max} ký tự).': 'The address is too long (up to {max} characters).',
  'Địa chỉ không được có khoảng trắng ở giữa.': 'The address cannot have spaces in the middle.',
  'Địa chỉ phải bắt đầu bằng https://': 'The address must start with https://',
  'URL không hợp lệ: đây không phải dạng bài viết mà hệ thống theo dõi được (cần dạng /posts/<số>, story_fbid hoặc link pfbid).':
    'Invalid URL: this is not a kind of post the system can follow (it needs the form /posts/<number>, story_fbid, or a pfbid link).',
  'URL không hợp lệ: chỉ nhận link facebook.com.': 'Invalid URL: only facebook.com links are accepted.',

  // 2. the e-mails
  'Email được xem cửa sổ': 'Emails that can watch the windows',
  'Mỗi dòng một email. Người trong danh sách (và admin) xem được cửa sổ khi app tạo video, ảnh hoặc phân tích.': 'One email per line. People on the list (and admins) can watch the window while the app creates videos or images, or analyzes.',
  'nguoi-dung@gmail.com': 'user@gmail.com',
  'Có dòng không phải email: {list}': 'These lines are not emails: {list}',
  'Tối đa {max} email (đang có {n}).': 'Up to {max} emails (you have {n}).',
  'Chưa có email nào.': 'No emails yet.',
  'Đã lưu: danh sách trống, chỉ admin xem được cửa sổ.': 'Saved: the list is empty, so only admins can watch the window.',
  'Tối đa {max} email.': 'Up to {max} emails.',
  'Danh sách không đúng dạng. Mỗi dòng một email.': 'The list is not in the right form. Put one email per line.',
  'Email thứ {n} không hợp lệ.': 'Email number {n} is not valid.',
  'Có email không hợp lệ.': 'Some email is not valid.',

  // 3. the log
  'Nhật ký lỗi của người dùng': 'User error log',
  'Xem các sự kiện và mã lỗi mà app của một người đã báo lên (giữ 30 ngày). Chỉ gồm mã, không có nội dung lệnh hay tài khoản.':
    'See the events and error codes that one person\'s app reported (kept for 30 days). Only codes are included, with no prompt text or accounts.',
  'email của người dùng': 'user\'s email',
  'Từ ngày': 'From',
  'Đến ngày': 'To',
  'Không có dòng nhật ký nào trong khoảng này.': 'There are no log lines in this period.',
  'Có {n} dòng mới nhất (có thể còn dòng cũ hơn).': 'The latest {n} lines (there may be older ones).',
  'Thời gian': 'Time',
  'Phiên bản': 'Version',
  'Hệ điều hành': 'System',
  'Loại': 'Type',
  'Mã': 'Code',
  'Bước': 'Step',
  'Mức': 'Level',

  // the sentence of each short code of window.dola.admin
  'URL không hợp lệ. Dán link bài viết Facebook (https://www.facebook.com/…).': 'Invalid URL. Paste the link of a Facebook post (https://www.facebook.com/…).',
  'Chưa có chiến dịch mở khoá đang chạy, nên chưa đổi được bài.': 'No unlock campaign is running yet, so the post cannot be changed.',
  'Bản app này chưa có bài viết riêng cho tính năng này. Hãy cập nhật app lên bản mới.': 'This version of the app has no post of its own for this feature yet. Please update the app.',
  'Máy chủ chưa hỗ trợ bài viết riêng cho tính năng này.': 'The server does not support a post of its own for this feature yet.',
  'Bản app này không nhận ra tính năng này. Hãy cập nhật app lên bản mới.': 'This version of the app does not know this feature. Please update the app.',
  'Không nhận ra bài viết này (link pfbid). Thử link khác.': 'This post was not recognized (pfbid link). Try another link.',
  'Không có quyền. Chỉ tài khoản admin dùng được màn này.': 'No permission. Only admin accounts can use this screen.',
  'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.': 'Could not connect to the server. Check your network, then try again.',
  'Bạn bấm quá nhanh. Đợi một chút rồi thử lại.': 'You clicked too fast. Wait a moment, then try again.',
  'Máy chủ đang bận. Thử lại sau ít phút.': 'The server is busy. Try again in a few minutes.',
  'Phiên đăng nhập đã hết. Hãy đăng nhập lại.': 'Your session has expired. Please sign in again.',
  'App đang bị khoá, chưa dùng được màn này.': 'The app is locked, so this screen cannot be used yet.',
  'Không có người dùng nào dùng email này.': 'No user has this email.',
  'Email không hợp lệ.': 'The email is not valid.',
  'Ngày bắt đầu không hợp lệ.': 'The start date is not valid.',
  'Ngày kết thúc không hợp lệ.': 'The end date is not valid.',
  'Ngày bắt đầu không được sau ngày kết thúc.': 'The start date cannot be after the end date.',
  'Chưa làm được. Thử lại sau.': 'Could not do that. Try again later.',
};
