// The language of the page (plans/261029-0812-md-motion-english): the core (i18n-core.js: t(), tn(), tx(), the language choice, applyStatic) plus
// the page's English table (locales/en.js). The Bàn sáng tạo bundle imports the CORE only and registers its own table (studio/src/i18n.js), so the
// page's table (hundreds of KB of other tabs' sentences) never lands in the studio bundle.
import { registerStrings } from './i18n-core.js';
import en from './locales/en.js';

registerStrings(en);

export * from './i18n-core.js';
