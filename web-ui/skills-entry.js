// The "Kho skill" tab's entry: its header button and the loading of the screen (skills-view.js). Drawn only when the core says so:
// options().skills === true AND window.dola.skills.list is there. An older core has neither: no button, the web stays as it was.
// Also keeps "is the signed-in person an admin" (options().admin, read again when somebody signs in or out) for the buttons of the screen.
// Returns { onShow, onHide, canPublish(), publish(prefill) } for the app's showView, or has the button hidden (a null view) while the core does not offer the tab.
// publish(prefill) opens the "Đăng skill" window from outside the tab ("Tách skill" posts the skill it made): it loads the screen's module first and does not switch to the tab.
//   opts  the first window.dola.options()   link  the header button   root  #view-skills   prefs  the form's prefs   showView(name)  the app's switch
//   onUse(card)  "Dùng skill"   isOpen()  the tab is on   loadView  () => import of skills-view.js (tests give their own)
export const skillsOffered = (opts, dola) => opts?.skills === true && typeof dola?.skills?.list === 'function';

export function initSkillsEntry({ dola = window.dola, opts, link, root, prefs, showView, onUse, isOpen, loadView = () => import('./skills-view.js') }) {
  const state = { admin: opts?.admin === true };
  let view = null;
  let loading = null; // the import, once started (a failure clears it so the next press tries again)
  let latest = 0;
  const load = () => {
    loading ||= loadView().then((m) => { view = m.mountSkills({ dola, root, opts, prefs, onUse, isAdmin: () => state.admin }); return view; }).catch((err) => { loading = null; throw err; });
    return loading;
  };

  link.hidden = !skillsOffered(opts, dola);
  link.onclick = async () => {
    if (link.hidden) return;
    try {
      await load();
    } catch (err) {
      console.error('Skills: the screen did not load', err); // the app goes on as it was
      return;
    }
    showView('skills');
  };

  // Signing in as somebody else (or out and in): ask the core again who is the admin; an open tab draws itself again with the right buttons.
  async function refresh() {
    const mine = ++latest;
    let admin = false;
    try {
      admin = (await dola.options())?.admin === true;
    } catch { /* refused (locked, signed out) or failing: not an admin */ }
    if (mine !== latest) return;
    state.admin = admin;
    if (isOpen()) view?.reload();
  }
  dola.auth?.onChange?.(() => { refresh(); });

  return {
    onShow: () => view?.onShow(),
    onHide: () => view?.onHide(),
    canPublish: () => skillsOffered(opts, dola) && typeof dola?.skills?.publish === 'function',
    async publish(prefill) {
      const v = await load();
      v.publish(prefill);
    },
  };
}
