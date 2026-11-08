// English for the shell: the header, the "open with the app" page, the login screen and the "Mở khoá" (unlock) screen.
// Key = the Vietnamese sentence exactly as the code or the markup has it. Words follow plans/261029-0812-md-motion-english/glossary.md.
// tests/i18n-keys.test.js: every key is used in site/, every value has no Vietnamese letter and the same {placeholders} as its key.
export default {
  // index.html: <title>, header
  'MD Motion Control · Tạo video AI': 'MD Motion Control · Create AI videos',
  'Tạo video': 'Create video',
  'Tạo ảnh': 'Create image',
  'Phân tích video': 'Analyze video',
  'Bàn sáng tạo': 'Studio',
  'Giọng nói': 'Voice',
  'Kho skill': 'Skills',
  'Setup tài khoản': 'Accounts',
  'Thư viện': 'Library',
  'Thư viện ảnh và video': 'Image and video library',
  'Hướng dẫn': 'Guide',
  'Đăng xuất': 'Sign out',
  'Tải lại': 'Reload',
  'Không mở được giao diện của app. Bấm "Tải lại" để thử lại.': 'Could not open the app screen. Click "Reload" to try again.',
  // lang-switch.js: the label names the language the button switches TO (the Vietnamese one is only ever shown in Vietnamese)
  'Chuyển sang tiếng Anh': 'Switch to English',
  'Chuyển sang tiếng Việt': 'Switch to Vietnamese',

  // app.js: a plain browser
  'Hãy mở bằng app MD Motion Control': 'Open this with the MD Motion Control app',
  'Trang này là giao diện của app MD Motion Control trên máy tính và chỉ chạy bên trong app. Mở app MD Motion Control để tạo video.':
    'This page is the screen of the MD Motion Control desktop app and only works inside the app. Open the MD Motion Control app to create videos.',

  // login screen (index.html #login, auth.js)
  'Tạo video AI Seedance miễn phí, chạy nhiều luồng cùng lúc': 'Create AI Seedance videos for free, with many threads running at once',
  'Nhiều luồng': 'Many threads',
  'Tự lưu video': 'Videos saved for you',
  'Proxy riêng từng acc': 'Proxy per account',
  'Đăng nhập bằng Google': 'Sign in with Google',
  'Dùng tài khoản Google (tài khoản MD Motion Control) để bắt đầu.': 'Use your Google account (your MD Motion Control account) to get started.',
  'Đang chờ bạn đăng nhập trong trình duyệt…': 'Waiting for you to sign in in the browser…',
  'Trình duyệt đã mở trang đăng nhập Google. Đăng nhập xong thì quay lại đây.': 'The browser has opened the Google sign-in page. When you are done, come back here.',
  'Nếu trình duyệt báo lỗi hoặc chưa được mở quyền, bấm Huỷ rồi thử lại sau.': 'If the browser shows an error or has not been given permission, click Cancel and try again later.',
  'Huỷ': 'Cancel',
  'Một sản phẩm của': 'A product of',
  'Bộ công cụ AI cho người làm nội dung — tạo ảnh & video AI, giọng đọc, phụ đề tự động, cắt ghép thông minh.':
    'AI tools for content creators: AI image & video creation, voiceovers, automatic subtitles, smart editing.',
  'Thử lại': 'Try again',
  'Bấm "Thử lại" để đăng nhập lần nữa.': 'Click "Try again" to sign in once more.',
  'Hết 5 phút mà chưa đăng nhập xong trong trình duyệt.': 'Five minutes passed and the sign-in in the browser was not finished.',
  'Google chưa cho đăng nhập (bạn đã huỷ hoặc tài khoản bị từ chối).': 'Google did not allow the sign-in (you cancelled, or the account was refused).',
  'Trang đăng nhập trả về địa chỉ không hợp lệ.': 'The sign-in page returned an invalid address.',
  'Máy chủ MD Motion Control không xác nhận được lần đăng nhập này.': 'The MD Motion Control server could not confirm this sign-in.',
  'Không kết nối được máy chủ MD Motion Control.': 'Could not connect to the MD Motion Control server.',
  'Kiểm tra mạng rồi bấm "Thử lại".': 'Check your network, then click "Try again".',
  'Đăng nhập không thành công.': 'Sign-in failed.',
  'Tài khoản này chưa được mở cho MD Motion Control.': 'This account has not been enabled for MD Motion Control yet.',
  'Máy chủ MD Motion Control đang bận, thử lại sau ít phút.': 'The MD Motion Control server is busy. Try again in a few minutes.',
  'Máy chủ không trả lời kịp (quá 15 giây). Mạng đang chậm hoặc bị chặn giữa đường.': 'The server did not answer in time (over 15 seconds). The network is slow or blocked on the way.',
  'Máy này không tìm được địa chỉ máy chủ (lỗi DNS). Thử đổi DNS sang 1.1.1.1 hoặc 8.8.8.8, hoặc tắt VPN.':
    'This computer cannot find the server address (DNS error). Try switching your DNS to 1.1.1.1 or 8.8.8.8, or turn off your VPN.',
  'Kết nối tới máy chủ bị từ chối hoặc bị ngắt giữa chừng. Thường do VPN, tường lửa hoặc phần mềm diệt virus.':
    'The connection to the server was refused or dropped midway. This is usually caused by a VPN, a firewall or antivirus software.',
  'Không có đường mạng tới máy chủ. Kiểm tra mạng, tắt VPN hoặc proxy rồi thử lại.': 'There is no network route to the server. Check your network, turn off your VPN or proxy, then try again.',
  'Chứng chỉ bảo mật bị chặn giữa đường (thường do phần mềm diệt virus hoặc proxy quét HTTPS). Tắt tính năng quét HTTPS rồi thử lại.':
    'The security certificate was blocked on the way (usually by antivirus software or a proxy that scans HTTPS). Turn off HTTPS scanning, then try again.',
  'Không mở được màn mở khoá. Đăng xuất rồi đăng nhập lại.': 'Could not open the unlock screen. Sign out and sign in again.',
};
