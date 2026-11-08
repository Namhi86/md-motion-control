import { CONTINUE_WORDS, isPrimaryBlue } from './fb-continue-button.js';

// The buttons of Facebook's login, 2FA code, "save browser" and "not now" screens, found in ANY language: by their words, and when the words fail by
// their look (the one filled blue button). Pure: no Electron, no browser; buttonExpr() is text that a page evaluates (electron/fb-login-press.js).
// Why: Facebook answers in the language of the proxy's country. MEASURED 2026-10-18 (a proxy in Spain): the 2FA screen "Ve a tu app de autenticación"
// had a filled blue "Continuar" and a grey "Usar otro método"; a word list of English and Vietnamese found nothing, and the code was typed again and again.
//
// Every list is a regex SOURCE for `new RegExp(source, 'iu')`: one alternative per way a language writes the label, each anchored with ^ and $ (a longer
// sentence that merely contains the word is no button of ours), spaces written \s+ (no \b: it does not work with these scripts, as in fb-continue-button.js).
const sp = (s) => s.replace(/ /g, '\\s+');
const alt = (...words) => words.map(sp).join('|');
const whole = (words) => `^(?:${words})$`;

export const LOGIN_WORDS = whole(alt(
  'log in', 'login', 'sign in', 'đăng nhập', 'iniciar sesión', 'entrar', 'acceder', 'ingresar', 'iniciar sessão', 'se connecter', 'connexion', 'anmelden', 'einloggen',
  'accedi', 'masuk', 'giriş yap', 'oturum aç', 'войти', 'увійти', 'تسجيل الدخول', 'دخول', 'התחברות', 'התחבר', 'เข้าสู่ระบบ', 'ログイン', '로그인', '登录', '登入', '登錄',
  'zaloguj się', 'zaloguj', 'inloggen', 'aanmelden', 'přihlásit se', 'přihlášení', 'conectare', 'autentificare', 'bejelentkezés', 'σύνδεση', 'logga in', 'log ind',
  'logg inn', 'kirjaudu sisään', 'вход', 'влизане',
));

// Every "Continue" of the account chooser (CONTINUE_WORDS, with its "as <Name>" forms) plus the other words of a code / confirmation screen.
export const SUBMIT_WORDS = `${CONTINUE_WORDS}|${whole(alt(
  'gửi', 'xác nhận', 'xác minh', 'tiếp theo', 'submit', 'confirm', 'verify', 'send', 'check', 'next', 'enviar', 'confirmar', 'verificar', 'siguiente', 'seguinte', 'próximo',
  'envoyer', 'confirmer', 'vérifier', 'suivant', 'senden', 'absenden', 'bestätigen', 'prüfen', 'überprüfen', 'invia', 'conferma', 'verifica', 'avanti', 'kirim', 'konfirmasi',
  'verifikasi', 'berikutnya', 'selanjutnya', 'gönder', 'onayla', 'doğrula', 'sonraki', 'ileri', 'отправить', 'подтвердить', 'проверить', 'далее', 'надіслати', 'підтвердити',
  'перевірити', 'далі', 'إرسال', 'تأكيد', 'تحقق', 'التالي', 'שלח', 'אשר', 'אמת', 'הבא', 'אישור', 'ส่ง', 'ยืนยัน', 'ถัดไป', 'ตรวจสอบ', '送信', '確認', '次へ', '제출', '확인', '다음',
  '提交', '确认', '下一步', '验证', '驗證', 'wyślij', 'potwierdź', 'dalej', 'zweryfikuj', 'verzenden', 'bevestigen', 'volgende', 'verifiëren', 'odeslat', 'potvrdit', 'další',
  'ověřit', 'trimite', 'confirmă', 'următorul', 'verifică', 'küldés', 'megerősítés', 'tovább', 'ellenőrzés', 'υποβολή', 'επιβεβαίωση', 'επόμενο', 'αποστολή', 'skicka',
  'bekräfta', 'nästa', 'send', 'bekræft', 'næste', 'bekreft', 'neste', 'lähetä', 'vahvista', 'seuraava', 'изпрати', 'потвърди', 'напред', 'следваща',
))}`;

export const SKIP_WORDS = whole(alt(
  'skip', 'not now', 'maybe later', 'bỏ qua', 'lúc khác', 'không phải bây giờ', 'để sau', 'omitir', 'ahora no', 'más tarde', 'saltar', 'agora não', 'pular', 'mais tarde',
  'ignorar', 'plus tard', 'pas maintenant', 'passer', 'ignorer', 'jetzt nicht', 'nicht jetzt', 'überspringen', 'später', 'non ora', 'non adesso', 'salta', 'più tardi', 'lewati',
  'nanti saja', 'lain kali', 'bukan sekarang', 'şimdi değil', 'atla', 'daha sonra', 'geç', 'не сейчас', 'пропустить', 'позже', 'не зараз', 'пропустити', 'пізніше',
  'ليس الآن', 'ليس الان', 'تخطي', 'لاحقًا', 'لاحقا', 'לא עכשיו', 'דלג', 'ไม่ใช่ตอนนี้', 'ข้าม', 'ไว้ทีหลัง', '今はしない', 'スキップ', '後で', 'あとで', '나중에', '건너뛰기',
  '以后再说', '跳过', '稍后', '稍後再說', '略過', '稍後', 'nie teraz', 'pomiń', 'później', 'niet nu', 'overslaan', 'later', 'teď ne', 'přeskočit', 'později', 'nu acum', 'omite',
  'mai târziu', 'most nem', 'kihagyás', 'később', 'όχι τώρα', 'παράλειψη', 'αργότερα', 'inte nu', 'hoppa över', 'senare', 'senere', 'ikke nu', 'spring over', 'ikke nå', 'hopp over',
  'ei nyt', 'ohita', 'myöhemmin', 'не сега', 'пропусни', 'по-късно',
));

// The bare "Continue" of the chooser words, without the "as <Name>" forms: the trust screens always took "Continue" and never "Continue as <Name>" (the
// first alternative of CONTINUE_WORDS is the bare one; the second starts at the next `|^(?:`).
const CONTINUE_BARE = CONTINUE_WORDS.slice(0, CONTINUE_WORDS.indexOf('|^(?:'));

export const TRUST_WORDS = `${CONTINUE_BARE}|${whole(alt(
  'trust this device', 'trust this browser', 'always trust', 'save browser', 'save', 'ok', 'done', 'this was me', 'tin cậy', 'luôn tin cậy', 'lưu trình duyệt', 'lưu', 'xong',
  'đây là tôi', 'confiar en este dispositivo', 'confiar en este navegador', 'guardar navegador', 'guardar', 'listo', 'fui yo', 'confiar neste dispositivo',
  'confiar neste navegador', 'confiar', 'salvar navegador', 'salvar', 'concluído', 'fui eu', 'faire confiance à cet appareil', 'faire confiance à ce navigateur',
  'enregistrer le navigateur', 'enregistrer', 'terminé', 'c.était moi', 'diesem gerät vertrauen', 'diesem browser vertrauen', 'vertrauen', 'browser speichern', 'speichern',
  'fertig', 'das war ich', 'salva browser', 'salva', 'fine', 'ero io', 'simpan browser', 'simpan', 'selesai', 'ini saya', 'tarayıcıyı kaydet', 'kaydet', 'tamam', 'bendim',
  'сохранить браузер', 'сохранить', 'готово', 'это был я', 'зберегти браузер', 'зберегти', 'це був я', 'حفظ المتصفح', 'حفظ', 'تم', 'كنت أنا', 'שמור דפדפן', 'שמור', 'סיום',
  'זה הייתי אני', 'บันทึกเบราว์เซอร์', 'บันทึก', 'เสร็จสิ้น', 'ブラウザを保存', '保存', '完了', '自分です', '브라우저 저장', '저장', '완료', '保存浏览器', '完成', '是我本人',
  '儲存瀏覽器', '儲存', 'zapisz przeglądarkę', 'zapisz', 'gotowe', 'to byłem ja', 'browser opslaan', 'opslaan', 'klaar', 'ik was het', 'uložit prohlížeč', 'uložit', 'hotovo',
  'to jsem byl já', 'salvează browserul', 'salvează', 'gata', 'am fost eu', 'böngésző mentése', 'mentés', 'kész', 'én voltam', 'αποθήκευση προγράμματος περιήγησης',
  'αποθήκευση', 'τέλος', 'εγώ ήμουν', 'spara webbläsare', 'spara', 'klar', 'det var jag', 'gem browser', 'gem', 'færdig', 'det var mig', 'lagre nettleser', 'lagre', 'ferdig',
  'det var meg', 'tallenna selain', 'tallenna', 'valmis', 'se olin minä', 'запази браузъра', 'запази', 'аз бях',
))}`;

// The Google screens in between ("I agree", "Got it", "Yes, it's me", "Confirm", "Done"…): ways PAST a screen, which the Facebook lists above do not all have.
// GOOGLE_PASS_BY_WORDS leaves out the action words of SUBMIT_WORDS (Send, Verify, Check, Next) and the "Save" of TRUST_WORDS: on a screen nobody here knows,
// those would send a code or save something instead of going past it.
export const AGREE_WORDS = whole(alt(
  'i agree', 'accept all', 'got it', 'no thanks', 'yes, it.s me', 'confirm', 'done', 'tôi đồng ý', 'chấp nhận tất cả', 'đã hiểu', 'không, cảm ơn', 'đúng là tôi', 'xác nhận', 'xong',
  'acepto', 'aceptar todo', 'entendido', 'no, gracias', 'sí, soy yo', 'confirmar', 'listo', 'concordo', 'aceitar tudo', 'entendi', 'não, obrigado', 'sim, sou eu', 'concluído',
  'j.accepte', 'tout accepter', 'compris', 'non merci', 'oui, c.est moi', 'confirmer', 'terminé', 'ich stimme zu', 'alle akzeptieren', 'verstanden', 'nein danke',
  'ja, ich bin es', 'bestätigen', 'fertig', 'accetto', 'accetta tutto', 'ho capito', 'no grazie', 'sì, sono io', 'conferma', 'fine',
));
export const GOOGLE_NEXT_WORDS = `${SUBMIT_WORDS}|${LOGIN_WORDS}`;
export const GOOGLE_PASS_BY_WORDS = `${SKIP_WORDS}|${AGREE_WORDS}|${CONTINUE_BARE}`;
// Google's "add recovery info" offer (gds.google.com/web/recoveryoptions, shown after a good sign-in): its way out is Skip / Not now, or Cancel. "Cancel" is on this list
// ONLY: on an unknown page it could sit next to "Continue" and win by size, so GOOGLE_PASS_BY_WORDS does not take it.
export const CANCEL_WORDS = whole(alt('cancel', 'hủy', 'huỷ', 'cancelar', 'annuler', 'abbrechen', 'annulla', 'batal', 'iptal', 'отмена', 'скасувати', '取消', 'キャンセル', '취소', 'anuluj', 'annuleren'));
export const GOOGLE_RECOVERY_SKIP_WORDS = `${SKIP_WORDS}|${CANCEL_WORDS}`;

// The cookie box Facebook puts over its login page ("Allow the use of Facebook cookies in this browser?"; MEASURED 2026-10-22: 3 of 4 accounts stalled behind it, every
// click meant for the form hit the box). The owner's rule: ALLOW is pressed, DECLINE never. Allow = the WHOLE label (like every list above). Decline = substrings on
// the DANGER list, so "Allow essential cookies only", which carries the word allow, is a refusal too.
// MEASURED (vi): "Cho phép tất cả cookie", "Từ chối cookie không bắt buộc". Given by the owner's brief (en): "Allow all cookies", "Allow essential and optional cookies",
// "Decline optional cookies", "Only allow essential cookies". Guesses from Facebook's wording in other languages, NOT measured: every es / fr / pt / de label here,
// "Chỉ cho phép cookie thiết yếu" (vi) and "Allow essential cookies only" (en); the decline side is kept broad on purpose (a refusal that is too wide only costs a skipped press).
export const COOKIE_ALLOW_WORDS = whole(alt(
  'cho phép tất cả cookie', 'allow all cookies', 'allow essential and optional cookies', 'permitir todas las cookies', 'autoriser tous les cookies',
  'permitir todos os cookies', 'alle cookies zulassen',
));
export const COOKIE_DECLINE_WORDS = alt(
  'từ chối cookie', 'chỉ cho phép cookie', 'decline optional', 'decline all cookies', 'only allow essential', 'allow essential cookies only', 'reject optional',
  'reject all cookies', 'rechazar cookies', 'rechazar las cookies', 'permitir solo las cookies', 'permitir solo cookies', 'refuser les cookies',
  'refuser tous les cookies', 'autoriser uniquement les cookies', 'recusar cookies', 'permitir apenas cookies', 'cookies ablehnen', 'nur erforderliche cookies', 'nur notwendige cookies',
);

// Buttons that must NEVER be pressed, in any list: another way to verify, a new account, a lost password, a resend, a log out, "not you", and the decline buttons of
// the cookie box. Substrings (not anchored): the label may say more. A short word that would hit others is anchored. No optional spaces (sp() would turn them into \s+?): two spellings instead.
const DANGER_OTHER = alt(
  'another way', 'another method', 'another profile', 'another account', 'new account', 'create an account', 'create account', 'forgot', 'resend', 'logout', 'log out', 'signout', 'sign out', 'not you',
  'otro método', 'otro metodo', 'otro perfil', 'otra forma', 'otra manera', 'cuenta nueva', 'nueva cuenta', 'crear cuenta', 'crear una cuenta', 'olvidaste', 'reenviar', 'cerrar sesión',
  'no es tu cuenta', 'no eres tú', 'outra maneira', 'outra forma', 'outro método', 'outro perfil', 'criar conta', 'criar nova conta', 'criar uma conta', 'nova conta', 'esqueceu', '^sair$', 'não é você',
  'cách khác', 'hồ sơ khác', 'tạo tài khoản', 'quên mật khẩu', 'đăng xuất', 'gửi lại', 'không phải bạn',
  'autre méthode', 'autre façon', 'autre manière', 'autre profil', 'créer un compte', 'créer un nouveau compte', 'mot de passe oublié', 'se déconnecter', 'renvoyer', 'ce n.est pas vous',
  'andere methode', 'anderen weg', 'neues konto', 'konto erstellen', 'passwort vergessen', 'abmelden', 'erneut senden',
  'altro metodo', 'altro modo', 'crea account', 'crea nuovo account', 'nuovo account', 'password dimenticata', '^esci$', 'invia di nuovo', 'reinvia', 'non sei tu',
  'cara lain', 'buat akun', 'akun baru', 'lupa kata sandi', 'keluar', 'kirim ulang', 'bukan kamu',
  'başka bir yol', 'başka bir yöntem', 'yeni hesap', 'şifremi unuttum', 'çıkış yap', 'yeniden gönder', 'sen değil',
  'другой способ', 'другой профиль', 'создать аккаунт', 'создать новый аккаунт', 'забыли пароль', '^выйти$', 'отправить повторно', 'отправить снова', 'не вы$',
  'інший спосіб', 'створити обліковий запис', 'створити новий обліковий запис', 'забули пароль', '^вийти$',
  'طريقة أخرى', 'إنشاء حساب', 'نسيت', 'تسجيل الخروج', 'إعادة إرسال', 'لست أنت', 'דרך אחרת', 'יצירת חשבון', 'שכחת', 'התנתק', 'שלח שוב',
  'วิธีอื่น', 'สร้างบัญชี', 'ลืมรหัสผ่าน', 'ออกจากระบบ', 'ส่งอีกครั้ง', '別の方法', '新しいアカウント', 'ログアウト', 'パスワードを忘れ', '再送信',
  '다른 방법', '새 계정', '로그아웃', '비밀번호를 잊', '다시 보내', '其他方式', '其他方法', '创建新账', '建立新帳', '建立新账', '忘记密码', '忘記密碼', '退出登录', '登出', '重新发送', '重新傳送', '重新發送',
  'spróbuj inaczej', 'inny sposób', 'nowe konto', 'zapomniałeś', 'wyślij ponownie', 'andere manier', 'nieuw account', 'wachtwoord vergeten', 'uitloggen', 'opnieuw verzenden',
  'jiný způsob', 'nový účet', 'zapomněli', 'odhlásit se', 'altă metodă', 'creează cont', 'ai uitat', 'deconectare', 'retrimite', 'másik módszer', 'új fiók', 'elfelejtetted',
  'kijelentkezés', 'újraküldés', 'άλλο τρόπο', 'δημιουργία νέου λογαριασμού', 'ξεχάσατε', 'αποσύνδεση', 'annat sätt', 'skapa nytt konto', 'glömt lösenord', 'logga ut',
  'skicka igen', 'anden måde', 'opret ny konto', 'glemt adgangskode', 'log ud', 'send igen', 'annen måte', 'opprett ny konto', 'glemt passord', 'logg ut', 'send på nytt',
  'toinen tapa', 'luo uusi tili', 'unohditko', 'kirjaudu ulos', 'lähetä uudelleen', 'друг начин', 'създаване на нов профил', 'забравена парола', '^изход$', 'изпрати отново',
);
export const DANGER_WORDS = `${DANGER_OTHER}|${COOKIE_DECLINE_WORDS}`;

// The keys of "Enter" as a keyboard sends it. MEASURED 2026-10-18 on Electron 44, hidden window: keyDown + keyUp alone never submitted a form (the page saw the
// key, no `char`); keyDown + char + keyUp did. A real Chrome has no `char` event: src/chrome-keys.js puts the text on keyDown.
export function enterEvents(realChrome) {
  const down = { type: 'keyDown', keyCode: 'Enter' };
  const up = { type: 'keyUp', keyCode: 'Enter' };
  return realChrome ? [down, up] : [down, { type: 'char', keyCode: '\r' }, up];
}

// What press() answers when only the Enter key could be sent (a caller that wants to know whether a BUTTON was found compares with this).
export const ENTER_LABEL = 'Enter';
export const NO_BUTTON_LINE = 'màn mã 2FA: không tìm thấy nút để bấm';
// The code screen is polled again and again while the same code goes in: "no button" is said ONCE per login, not at every poll, so the log says why
// the code is typed again without drowning in it. report(pressed) with what press() answered ('' = nothing, ENTER_LABEL = only the key).
export function noButtonReporter(log) {
  let said = false;
  return (pressed) => {
    if (said || (pressed && pressed !== ENTER_LABEL)) return;
    said = true;
    log(NO_BUTTON_LINE);
  };
}

// The label of an element as the page shows it (the same text the rules above are written for): zero-width and direction marks out, spaces collapsed, NFC.
const LABEL_SRC = `(e) => (e.innerText || e.value || e.getAttribute('aria-label') || '').replace(/[\\u200b-\\u200f\\u202a-\\u202e\\u2060\\ufeff]/g, '').replace(/\\s+/g, ' ').trim().normalize('NFC')`;

// An expression that says whether pressing Enter in the focused input is safe: an input has the focus, and the button Enter would press (the first enabled
// submit button of its form, in tree order) is not on the DANGER list ("Reenviar código" as the only submit button would be pressed by Enter).
export const ENTER_SAFE_EXPR = `(() => {
  const danger = new RegExp(${JSON.stringify(DANGER_WORDS)}, 'iu');
  const label = ${LABEL_SRC};
  let a = document.activeElement;
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement; // the field may sit inside a shadow root
  if (!a || !/^(INPUT|TEXTAREA)$/.test(a.tagName)) return false;
  const d = a.form && [...a.form.elements].find((e) => !e.disabled && ((e.tagName === 'BUTTON' && e.type === 'submit') || (e.tagName === 'INPUT' && (e.type === 'submit' || e.type === 'image'))));
  return !d || !danger.test(label(d));
})()`;

// An expression for Runtime.evaluate / executeJavaScript: where to click, in CSS pixels of the page, after scrolling the button to the middle, or null.
//   word   (rule 1) the smallest button-like element whose own label matches `words`
//   shape  (rule 2, only when allowShape and rule 1 found nothing) the ONE filled blue button; two or more = ambiguous = null. Unlike CONTINUE_EXPR the
//          page MAY have a text input: a code screen has one.
// Candidates are visible, enabled, a BUTTON / A / submit input / role=button or a pointer cursor, in shadow roots too (the shape rule also wants 60+ px wide,
// 28 to 100 px high). An element whose label is on the DANGER list is never a candidate.
export function buttonExpr({ words, allowShape = false } = {}) {
  if (typeof words !== 'string' || !words) throw new TypeError('buttonExpr needs the words (a regex source)');
  new RegExp(words, 'iu'); // a source that is no regex fails here, not in the page
  return `(() => {
  const isPrimaryBlue = ${isPrimaryBlue.toString()};
  const words = new RegExp(${JSON.stringify(words)}, 'iu');
  const danger = new RegExp(${JSON.stringify(DANGER_WORDS)}, 'iu');
  const shape = ${allowShape === true};
  const walk = (root, acc = []) => { for (const el of root.querySelectorAll('*')) { acc.push(el); if (el.shadowRoot) walk(el.shadowRoot, acc); } return acc; };
  const shown = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const label = ${LABEL_SRC};
  const area = (e) => { const r = e.getBoundingClientRect(); return r.width * r.height; };
  const buttonLike = (e) => e.tagName === 'BUTTON' || e.tagName === 'A' || (e.tagName === 'INPUT' && ['submit', 'button'].includes(e.type)) || e.getAttribute('role') === 'button' || getComputedStyle(e).cursor === 'pointer';
  const cands = walk(document).filter((e) => shown(e) && buttonLike(e) && !e.disabled && e.getAttribute('aria-disabled') !== 'true' && !danger.test(label(e)));
  let el = cands.filter((e) => { const t = label(e); return t && t.length < 64 && words.test(t); }).sort((a, b) => area(a) - area(b))[0];
  let how = 'word';
  if (!el && shape) {
    const blue = cands.filter((e) => { const r = e.getBoundingClientRect(); return r.width >= 60 && r.height >= 28 && r.height <= 100 && isPrimaryBlue(getComputedStyle(e).backgroundColor); });
    const outer = blue.filter((e) => !blue.some((o) => o !== e && o.contains(e))); // a blue button and its blue inner box are one button
    if (outer.length === 1) { el = outer[0]; how = 'shape'; }
  }
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), text: label(el).slice(0, 40), how };
})()`;
}
