// The "Admin" link of the header (next to the e-mail) and the loading of the admin screen (admin-view.js). Drawn only when the core says so:
// options().admin === true (the signed-in e-mail is the admin's, read live) AND the core has window.dola.admin. An older core has neither: no link.
// It is a courtesy only; every admin call is refused by the core for anybody else and, in the end, by the server (403).
// Returns { onShow } (the app's showView calls it when the screen opens).
//   opts  the first window.dola.options()   link  the header button   root  #view-admin   showView(name)  the app's switch   isOpen()  the admin screen is on
//   loadView  () => import of admin-view.js (tests give their own)
export const adminOffered = (opts, dola) => opts?.admin === true && typeof dola?.admin?.gatePost?.get === 'function';

export function initAdminEntry({ dola = window.dola, opts, link, root, showView, isOpen, loadView = () => import('./admin-view.js') }) {
  let view = null; // the mounted screen
  let loading = null; // its import, once started (a failure clears it so the next press tries again)
  let latest = 0;
  const load = () => {
    loading ||= loadView().then((m) => { view = m.mountAdmin({ dola, root }); return view; }).catch((err) => { loading = null; throw err; });
    return loading;
  };

  link.hidden = !adminOffered(opts, dola);
  link.onclick = async () => {
    if (link.hidden) return;
    try {
      await load();
    } catch (err) {
      console.error('Admin: the screen did not load', err); // the app goes on as it was
      return;
    }
    showView('admin');
  };

  // Signing in as somebody else (or out and in) changes who the admin is: ask the core again; the link goes, and an open admin screen closes.
  async function refresh() {
    const mine = ++latest;
    let offered = false;
    try {
      offered = adminOffered(await dola.options(), dola);
    } catch { /* refused (locked, signed out) or failing: not an admin */ }
    if (mine !== latest) return;
    link.hidden = !offered;
    if (!offered && isOpen()) showView('create');
  }
  dola.auth?.onChange?.(() => { refresh(); });

  return { onShow: () => view?.onShow() };
}
