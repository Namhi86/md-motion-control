// English for the guide area: the beginner tour, the "Hướng dẫn" menu, the first-time cards of Tạo video / Tạo ảnh / Kho skill / Phân tích video (site/guide-content.js,
// site/guide-content-wave2.js). Key = the Vietnamese sentence exactly as the code has it. Words follow plans/261029-0812-md-motion-english/glossary.md; a button the guide
// quotes ("Add to list", "Proxy pool"...) must read the same as the real button of the other areas. Keys reached through tx() are listed in `dynamic`.
export const dynamic = [
  'Thêm skill (.md/.txt)',
  'Dùng skill',
  'Kho: ',
  'Tuần',
  'Tháng',
  'Tất cả',
  'Top 3 tuần này',
  'Copy',
  'Chỉ phong cách',
  'Giữ nhịp, góc máy, chuyển cảnh của video mẫu; chỉ đổi sang sản phẩm của bạn.',
  'Chỉ lấy phong cách (màu, nhịp dựng, cách quay); nội dung viết mới quanh sản phẩm.',
];

export default {
  'Tạo ảnh: những điều cần biết': 'Create image: what to know',
  'Hướng dẫn tạo ảnh': 'Create image guide',
  'Kho skill: những điều cần biết': 'Skills: what to know',
  'Hướng dẫn Kho skill': 'Skills guide',
  'Phân tích video: những điều cần biết': 'Analyze video: what to know',
  'Hướng dẫn phân tích video': 'Analyze video guide',
  'Chọn Muse hay Nano Banana, khung ảnh, nhiều ảnh một lúc.': 'Muse or Nano Banana, image frame, many images at once.',
  'Thả video mẫu, AI viết prompt, đưa vào hàng đợi.': 'Drop a sample video, AI writes the prompts, add them to the queue.',
  'Nối khối thành dây chuyền rồi bấm Chạy cả bàn.': 'Connect nodes into a pipeline, then click Run board.',
  'Skill là công thức làm video, Top 3, đăng skill của bạn.': 'Skills are video recipes, the Top 3, and publishing your own.',
  'Acc đang bận hoặc đang nghỉ thì lệnh xếp hàng chờ; chưa có acc nào thì app không nhận lệnh.':
    'If an account is busy or resting, your prompt waits in the queue; with no account at all, the app does not accept the prompt.',
  'Nano Banana thường không tốn credit khi acc ở gói PRO của Flow; gói khác chưa kiểm tra.':
    'Nano Banana usually costs no credits when the account is on the Flow PRO plan; other plans have not been tested.',
  'Video bạn thả vào được tải lên Google Drive của acc Gmail dùng để phân tích. App cố xoá cuộc chat sau khi đọc xong, nhưng tệp trong Drive vẫn còn và có thể cả cuộc chat nếu xoá không được. Nếu bạn dừng giữa chừng hoặc quá giờ, app không thử xoá cuộc chat.':
    'Your video is uploaded to the Google Drive of the Gmail account that does the analysis. The app tries to delete the chat afterwards, but the file stays in Drive, and the chat may stay too if deleting fails. If you stop midway or it times out, the app does not try to delete the chat.',
  'Nhiều ảnh một lúc, ảnh nằm ở đâu': 'Many images at once, and where they go',
  'Viết nhiều mô tả cách nhau bằng một dòng trống, mỗi mô tả ra một ảnh (tối đa {max} mô tả mỗi lần).':
    'Write several descriptions separated by an empty line, and each one makes an image (up to {max} descriptions at a time).',
  'Ảnh xong hiện ở tab Lịch sử. Bấm "Mở thư mục" để tới file.': 'Finished images show up in the History tab. Click "Open folder" to get to the file.',
  'Ô mô tả ảnh có hai mô tả cách nhau một dòng trống, bộ đếm bên phải ghi "2 lệnh".':
    'The image description box holds two descriptions separated by an empty line, and the counter on the right shows 2 prompts.',
  'Tạo ảnh bằng Muse Image': 'Create images with Muse Image',
  'Muse Image dùng acc Muse (thêm ở Setup). {wait}': 'Muse Image uses a Muse account (add it in Accounts). {wait}',
  'Muse Image không chọn tỉ lệ: ảnh ra khung ngang {size}.': 'Muse Image has no aspect ratio setting: images come out landscape at {size}.',
  'Chọn Muse hay Nano Banana': 'Choose Muse or Nano Banana',
  'Bấm nút Model để chọn Muse Image hoặc Nano Banana. Muse Image dùng acc Muse, Nano Banana dùng acc Gmail Veo (thêm ở Setup → Veo).':
    'Click the Model button to choose Muse Image or Nano Banana. Muse Image uses a Muse account; Nano Banana uses a Veo Gmail account (add it in Accounts → Veo).',
  'Hộp chọn Model của Tạo ảnh có hai nhóm: Muse với Muse Image, và Nano Banana với ba model Nano Banana.':
    'The Model list of Create image has two groups: Muse with Muse Image, and Nano Banana with three Nano Banana models.',
  'Khung ảnh và ảnh tham chiếu': 'Image frame and reference images',
  'Nano Banana chọn được tỉ lệ và nhận tối đa {max} ảnh tham chiếu.': 'With Nano Banana you can pick the aspect ratio, and it takes up to {max} reference images.',
  'Khung "Thêm ảnh tham chiếu" ghi tối đa 3 ảnh, ô mô tả ảnh, nút Model là Nano Banana 2.1 và nút tỉ lệ 9:16.':
    'The "Add reference images" box says up to 3 images, followed by the image description box, the Model button set to Nano Banana 2.1 and the 9:16 ratio button.',
  'Skill là công thức làm video có sẵn': 'Skills are ready-made video recipes',
  'Mỗi thẻ là một skill, tức một công thức để AI làm video nhiều cảnh. Bạn xem ngay video mẫu trên thẻ.':
    'Each card is a skill: a recipe the AI follows to make a multi-scene video. You can watch the sample video right on the card.',
  'Cột trái ("Skill hệ thống") là skill do MD Motion Control viết, cột phải ("Cộng đồng") là skill do người dùng đăng và có thể chưa được kiểm duyệt.':
    'The left column ("System skills") holds skills written by MD Motion Control. The right column ("Community") holds skills posted by users, which may not have been reviewed yet.',
  'Rê chuột vào video để nghe tiếng.': 'Hover over a video to hear the sound.',
  'Cột "Skill hệ thống" với ba thẻ skill, mỗi thẻ có video mẫu, tên, chế độ Pro hoặc Muse và nút "Dùng skill".':
    'The "System skills" column with three skill cards, each with a sample video, a name, a Pro or Muse mode and a "Use skill" button.',
  'Chọn skill rồi bấm {use}': 'Pick a skill, then click {use}',
  'Hàng trên cùng là "{top}", các skill được dùng nhiều nhất. Đổi giữa {week}, {month} và {all}.': 'The top row is "{top}": the most used skills. Switch between {week}, {month} and {all}.',
  'Bấm "{use}" để sang tab Tạo video, ô skill hiện chữ "{chip}tên skill".': 'Click "{use}" to go to the Create video tab, where the skill box shows "{chip}name".',
  'Skill chỉ dùng được với Pro và Muse, video tối đa {max} giây.': 'Skills only work with Pro and Muse, and videos are up to {max} seconds.',
  'Hàng "Top 3 tuần này" có nút Tuần, Tháng, Tất cả và thẻ hạng 1 có nút "Dùng skill".':
    'The "Top 3 this week" row with Week, Month and All buttons, and the rank 1 card with a "Use skill" button.',
  'Đăng skill của bạn': 'Publish your own skill',
  'Bấm "Đăng skill", điền tiêu đề, mô tả, chọn Seedance Pro và/hoặc Muse, rồi dán nội dung hoặc chọn tệp .md.':
    'Click "Publish skill", fill in the title and description, choose Seedance Pro and/or Muse, then paste the content or choose an .md file.',
  'Bấm "Đăng skill", điền tiêu đề, mô tả, chọn Seedance Pro và/hoặc Muse, rồi dán nội dung.':
    'Click "Publish skill", fill in the title and description, choose Seedance Pro and/or Muse, then paste the content.',
  'Cần ít nhất một video mẫu, tối đa {max}: chọn từ "Chọn từ Kho video" hoặc "Tải mp4 lên".':
    'You need at least one sample video, up to {max}: pick from "Choose from video library" or "Upload mp4".',
  'Cần ít nhất một video mẫu, tối đa {max}: chọn từ "Chọn từ Kho video".': 'You need at least one sample video, up to {max}: pick from "Choose from video library".',
  'Skill hiện ngay ở cột Cộng đồng và có thể chưa được kiểm duyệt.': 'The skill shows up right away in the Community column and may not have been reviewed yet.',
  'Cần gì để dùng': 'What you need',
  'Cần ít nhất một acc Gmail ở mục Veo (Setup → Veo): app mượn acc đó để mở AI Studio đọc video.':
    'You need at least one Gmail account under Veo (Accounts → Veo): the app borrows it to open AI Studio and read the video.',
  'Máy cần cài Google Chrome.': 'Google Chrome must be installed on your computer.',
  'Dòng "3 acc Gmail của Veo dùng được để phân tích." nằm trên nút "Phân tích".': 'A line saying 3 Veo Gmail accounts can be used for analysis, above the "Analyze" button.',
  'Thả video, chọn cách viết': 'Drop a video, choose how to write',
  'Thả video mẫu (mp4 hoặc mov, tối đa {seconds} giây, {gb} GB) vào khung hoặc bấm khung để chọn.':
    'Drop a sample video (mp4 or mov, up to {seconds} seconds, {gb} GB) into the box, or click the box to choose one.',
  '{copy}: {copyDesc} {style}: {styleDesc}': '{copy}: {copyDesc} {style}: {styleDesc}',
  'Chọn sản phẩm từ thư viện (tối đa {max}): mọi prompt đều phải có đủ các thẻ @ của sản phẩm.':
    'Choose products from your library (up to {max}): every prompt must include all of the product @ tags.',
  'Khung thả video mẫu, rồi các mục Kiểu (Copy, Chỉ phong cách), Lời thoại, Ngôn ngữ thoại và Phong cách.':
    'The sample video drop box, followed by the Type (Copy, Style only), Dialogue, Dialogue language and Style settings.',
  'Kết quả và đưa sang Tạo video': 'Results and sending them to Create video',
  'Mỗi prompt là một thẻ: sửa chữ được, bỏ tick thẻ không ưng. Kết quả chỉ nằm trong trang này, không được lưu.':
    'Each prompt is a card: you can edit the text and untick the cards you do not like. Results only live on this page and are not saved.',
  'Thẻ viền đỏ thiếu thẻ @ sản phẩm: nút đưa vào hàng đợi tắt cho tới khi sửa hoặc bỏ tick.':
    'A card with a red border is missing a product @ tag: the add-to-queue button stays off until you fix it or untick it.',
  'Bấm "Đưa N prompt vào hàng đợi" thì app chuyển sang Tạo video.': 'Click "Add N prompts to the queue" and the app switches to Create video.',
  'Bạn là người mới?': 'New here?',
  'Để mình hướng dẫn bạn bắt đầu nhé.': 'Let me show you how to get started.',
  'Hướng dẫn tôi': 'Show me around',
  'Tôi biết rồi': 'I know the app',
  'Tiếp': 'Next',
  'Bỏ qua hướng dẫn': 'Skip the guide',
  'Đóng': 'Close',
  'Bước 1: mở Setup tài khoản. Bấm vào đây.': 'Step 1: open Accounts. Click here.',
  'Bước 2 (không bắt buộc): thêm proxy. Bấm "Kho proxy". Proxy là đường mạng riêng cho mỗi acc, nên có nhưng không có vẫn chạy.':
    'Step 2 (optional): add proxies. Click "Proxy pool". A proxy gives each account its own network route. It helps, but everything still runs without one.',
  'Bỏ qua proxy': 'Skip proxies',
  'Dán proxy vào ô, mỗi dòng một proxy, rồi bấm "Thêm proxy". Xong thì bấm Tiếp.': 'Paste your proxies into the box, one per line, then click "Add proxy". When you are done, click Next.',
  'Các dạng proxy app nhận được nằm ở mục "Cần biết" của Kho proxy.': 'The proxy formats the app accepts are listed under "Good to know" in Proxy pool.',
  'Bước 3: chọn loại acc, dán acc vào ô, bấm Thêm vào danh sách.': 'Step 3: pick the account type, paste your accounts into the box, then click Add to list.',
  'Bước 4: app đang đăng nhập acc, chờ tới khi báo Sẵn sàng.': 'Step 4: the app is signing in your accounts. Wait until one shows Ready.',
  'Chưa có acc nào đang đăng nhập.': 'No account is signing in right now.',
  '{label}: {count}': '{label}: {count}',
  'Đang lấy cookie': 'Getting cookie',
  'Chờ bạn nhập mã Muse': 'Waiting for you to enter the Muse code',
  'Chờ bạn bấm captcha': 'Waiting for you to solve the captcha',
  'Đăng nhập lỗi': 'Sign-in failed',
  'Mã Muse được gửi về email của acc. Gõ mã đó vào cửa sổ đăng nhập Muse mà app đã mở. Nếu hết giờ chờ, bấm mục {platform} ở khung sáng, rồi bấm "Đăng nhập" ở acc đó (nút ⋯ cuối dòng).':
    'Muse emails a code to the account email address. Type it into the Muse sign-in window the app opened. If the wait timed out, click {platform} in the highlighted area, then click "Sign in" on that account (the ⋯ button at the end of the row).',
  'Mở "Cửa sổ & trình duyệt" ở khung sáng và bật "Hiện cửa sổ đăng nhập", rồi bấm "Kiểm tra" ở acc đó (nút ⋯ cuối dòng): cửa sổ đăng nhập hiện ra để bạn tự bấm captcha.':
    'Open "Windows & browser" in the highlighted area and turn on "Show sign-in window", then click "Check" on that account (the ⋯ button at the end of the row). The sign-in window appears so you can solve the captcha yourself.',
  'Công tắc đã bật. Giờ bấm "Kiểm tra" ở acc đó trong khung sáng (nút ⋯ cuối dòng): cửa sổ đăng nhập hiện ra để bạn tự bấm captcha.':
    'The switch is on. Now click "Check" on that account in the highlighted area (the ⋯ button at the end of the row). The sign-in window appears so you can solve the captcha yourself.',
  'Xong rồi! Bấm Tạo video để bắt đầu.': 'All set! Click Create video to get started.',
  'Mở Tạo video': 'Open Create video',
  'Thêm ít nhất 1 acc để đi tiếp.': 'Add at least 1 account to continue.',
  'Đợi có acc ở trạng thái Sẵn sàng.': 'Wait until an account is Ready.',
  'Chưa có acc sẵn sàng. Mở Hướng dẫn (nút "?" tròn ở đầu trang, hoặc nút "Hướng dẫn") để thêm acc.':
    'No account is ready. Open Guide (the round "?" at the top, or the "Guide" button) to add one.',
  'Chưa có acc sẵn sàng: các acc đang nghỉ, đang đăng nhập hoặc cần kiểm tra. Lệnh bạn tạo sẽ chờ.':
    'No account is ready: your accounts are resting, signing in or need a check. The prompts you create will wait.',
  'Bắt đầu': 'Get started',
  'Tạo video': 'Create video',
  'Tạo ảnh': 'Create image',
  'Phân tích video': 'Analyze video',
  'Bàn sáng tạo': 'Studio',
  'Kho skill': 'Skills',
  'Mình chỉ từng nút: mở Setup, thêm proxy (không bắt buộc), thêm tài khoản, đợi đăng nhập.':
    'I\'ll point to each button: open Accounts, add proxies (optional), add accounts, wait for sign-in.',
  'Ảnh tham chiếu, nhiều prompt một lúc, skill.': 'Reference images, many prompts at once, skills.',
  'Chọn mục cần xem': 'Choose a topic',
  'Mới dùng? Xem vài điều cần biết.': 'New here? See a few things to know.',
  'Xem hướng dẫn': 'View guide',
  'Tạo video: những điều cần biết': 'Create video: what to know',
  'Đã hiểu': 'Got it',
  'Hướng dẫn tạo video': 'Create video guide',
  'Ảnh tham chiếu: Phần tử và @tên': 'Reference images: elements and @name',
  'Phần tử là một cái tên kèm một tấm ảnh (nhân vật, bối cảnh, đạo cụ...). Bấm "Thêm phần tử", rồi "Phần tử mới" để tạo.':
    'An element is a name with a picture (a character, a setting, a prop...). Click "Add element", then "New element" to create one.',
  'Trong ô mô tả, gõ @ rồi chọn phần tử, ví dụ @linh. App gửi kèm ảnh của phần tử bạn nhắc.':
    'In the description box, type @ and pick an element, for example @linh. The app sends the picture of every element you mention.',
  'Mỗi prompt chỉ gửi ảnh của phần tử nó nhắc (tối đa {max} ảnh; Veo có giới hạn riêng). Prompt không có @ thì không gửi ảnh. Chế độ Muse không đọc @tên.':
    'Each prompt only sends the pictures of the elements it mentions (up to {max} images; Veo has its own limit). A prompt without @ sends no images. Muse mode does not read @name.',
  'Khung "Thêm phần tử" đã có hai phần tử, Linh và Căn hộ, và ô mô tả có hai chip @Linh và @Căn hộ nằm trong câu.':
    'The "Add element" box already holds two elements, Linh and Apartment, and the description box shows two chips, @Linh and @Apartment, inside the sentence.',
  'Nhiều prompt một lúc': 'Many prompts at once',
  'Prompt là đoạn chữ mô tả một video, mỗi prompt tạo một video riêng. Muốn tạo nhiều video, cách các prompt bằng một dòng trống (bấm Enter hai lần).':
    'A prompt is the text that describes one video, and each prompt makes its own video. To make several videos, separate the prompts with an empty line (press Enter twice).',
  'Xuống dòng một lần thì vẫn là cùng một prompt. Nút "Nhập tệp .txt / .csv" nạp từ tệp: .txt không có dòng trống thì mỗi dòng là một prompt, có dòng trống thì cách nhau bằng dòng trống; .csv mỗi dòng là một prompt.':
    'A single line break still belongs to the same prompt. The "Import .txt / .csv file" button loads prompts from a file: in a .txt without empty lines each line is a prompt, otherwise prompts are separated by empty lines; in a .csv each row is a prompt.',
  'Tối đa {max} prompt mỗi lần, phần thừa bị bỏ.': 'Up to {max} prompts at a time; any extra ones are dropped.',
  'Ô mô tả có hai prompt, cách nhau một dòng trống, và bộ đếm bên dưới ghi "2 lệnh".':
    'The description box holds two prompts separated by an empty line, and the counter below it shows 2 prompts.',
  'Chọn skill ở tab "Kho skill" rồi bấm "{use}" (video tối đa {max} giây).': 'Pick a skill in the "Skills" tab, then click "{use}" (videos up to {max} seconds).',
  'Hoặc bấm "{button}" để nạp tệp của bạn, tối đa {kb} KB.': 'Or click "{button}" to load your own file, up to {kb} KB.',
  'Bấm "{button}" để nạp tệp của bạn, tối đa {kb} KB.': 'Click "{button}" to load your own file, up to {kb} KB.',
  'Skill: video nhiều cảnh theo công thức': 'Skills: multi-scene videos from a recipe',
  'Skill là ghi chú hướng dẫn cho AI đi kèm prompt. Dùng khi muốn một video nhiều cảnh theo công thức cố định, như clip bán hàng.':
    'A skill is a set of instructions for the AI that goes with your prompt. Use one when you want a multi-scene video that follows a fixed recipe, like a sales clip.',
  'Chỉ chế độ Pro và Muse dùng được skill (Nhanh + tiếng và Veo thì không).': 'Only Pro and Muse modes can use skills (Fast + sound and Veo cannot).',
  'Hàng "{button}" nằm ngay dưới khung phần tử, phía trên ô mô tả.': 'The "{button}" row sits right below the elements box, above the description box.',
  // values the guide shows through tx() (shared/ constants and the labels of other screens): see `dynamic`
  'Thêm skill (.md/.txt)': 'Add skill (.md/.txt)',
  'Dùng skill': 'Use skill',
  'Kho: ': 'Skills: ',
  'Tuần': 'Week',
  'Tháng': 'Month',
  'Tất cả': 'All',
  'Top 3 tuần này': 'Top 3 this week',
  'Copy': 'Copy',
  'Chỉ phong cách': 'Style only',
  'Giữ nhịp, góc máy, chuyển cảnh của video mẫu; chỉ đổi sang sản phẩm của bạn.': 'Keeps the pacing, camera angles and transitions of the sample video; only swaps in your product.',
  'Chỉ lấy phong cách (màu, nhịp dựng, cách quay); nội dung viết mới quanh sản phẩm.':
    'Takes only the style (colors, editing rhythm, camera work); the content is written fresh around the product.',
};
