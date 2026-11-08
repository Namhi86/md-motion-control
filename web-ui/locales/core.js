// The English table of the sentences the core writes (site/core-text.js). One file per area under core/, merged here so parallel work never collides.
import { registerCore } from '../core-text.js';
import accounts from './core/en-accounts.js';
import analyze from './core/en-analyze.js';
import login from './core/en-login.js';
import misc from './core/en-misc.js';
import muse from './core/en-muse.js';
import queue from './core/en-queue.js';
import queue2 from './core/en-queue2.js';
import studio from './core/en-studio.js';
import veo from './core/en-veo.js';

registerCore({ ...queue, ...queue2, ...accounts, ...login, ...veo, ...muse, ...analyze, ...studio, ...misc });
