// The English table: key = the Vietnamese sentence, value = its English. One file per area (en-<area>.js), merged here, so the agents that
// translate different areas never edit the same file. tests/i18n-keys.test.js fails when two files give the same key different English.
import analyze from './en-analyze.js';
import admin from './en-admin.js';
import create from './en-create.js';
import gate from './en-gate.js';
import guide from './en-guide.js';
import library from './en-library.js';
import motion from './en-motion.js';
import setup from './en-setup.js';
import shell from './en-shell.js';
import skills from './en-skills.js';

export default { ...shell, ...gate, ...create, ...setup, ...analyze, ...skills, ...admin, ...library, ...guide, ...motion };
