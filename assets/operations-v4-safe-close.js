(() => {
  function init() {
    if (!window.DB || !DB.__hardeningLoaded || typeof DB.closeProject !== 'function') { setTimeout(init, 90); return; }
    if (DB.__v4SafeCloseLoaded) return;
    DB.__v4SafeCloseLoaded = true;

    const fallbackClose = DB.closeProject;
    DB.closeProject = async id => {
      if (!DB.LIVE) return fallbackClose(id);

      const { data, error } = await DB.client.rpc('close_project_safe', { p_project_id: id });
      if (!error) {
        window.dispatchEvent(new CustomEvent('settlement-data-changed'));
        return data;
      }

      const message = String(error.message || '');
      const missingFunction = error.code === 'PGRST202' || error.code === '42883' || /close_project_safe/i.test(message) && /not find|does not exist|schema cache/i.test(message);
      if (missingFunction) return fallbackClose(id);
      throw error;
    };
  }
  init();
})();
