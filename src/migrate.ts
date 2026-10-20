/**
 * The project was called "SketchUp Vue" ("suv:" keys) and "Formwerk" ("fw:" keys) before Shap3D.ai.
 * Copy their stored data to the new "s3d:" keys once, so autosave, chats, scripts and settings survive.
 * Imported first in main.ts – other modules read their settings while being imported.
 */
try {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    keys.push(localStorage.key(i)!);
  }
  // newer data wins: "fw:" is copied before the older "suv:"
  for (const prefix of ['fw:', 'suv:']) {
    for (const old of keys) {
      if (!old.startsWith(prefix)) {
        continue;
      }
      const key = 's3d:' + old.slice(prefix.length);
      if (localStorage.getItem(key) == null) {
        localStorage.setItem(key, localStorage.getItem(old)!);
      }
    }
  }
} catch {
  /* storage unavailable */
}
