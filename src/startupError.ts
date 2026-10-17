/** Start-up checks: tell the user why the app can't start instead of leaving them on the splash screen. */

export function webglAvailable(): boolean {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('nowebgl')) return false; // test the error screen
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext(); // free the probe context right away
    return true;
  } catch { return false; }
}

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

export function showStartupError(kind: 'webgl' | 'other', detail = '') {
  const splash = document.getElementById('splash');
  if (!splash) { alert(detail || 'WebGL ist nicht verfügbar.'); return; }
  splash.classList.add('failed');
  splash.setAttribute('role', 'alert');
  splash.querySelector('.bar')?.remove();
  const box = document.createElement('div');
  box.className = 'err';
  box.innerHTML = kind === 'webgl'
    ? `<h2>3D-Grafik (WebGL) ist im Browser gerade deaktiviert</h2>
       <p>Shap3D.ai braucht WebGL, um die 3D-Ansicht zu zeichnen. Der Browser meldet, dass er keinen WebGL-Kontext anlegen kann –
       meist, weil die Grafikkarte nach einem Treiber-Absturz für diese Sitzung gesperrt wurde.</p>
       <ol>
         <li><b>Browser komplett schließen und neu starten</b> (alle Fenster) – das löst es fast immer.</li>
         <li>Hardwarebeschleunigung einschalten: <code>Einstellungen › System › Grafikbeschleunigung verwenden</code>.</li>
         <li>Status prüfen unter <code>chrome://gpu</code> bzw. <code>edge://gpu</code> – „WebGL: Hardware accelerated“ sollte dort stehen.</li>
         <li>Grafiktreiber aktualisieren; bei vielen offenen 3D-Tabs einige schließen.</li>
       </ol>
       <button type="button" onclick="location.reload()">Neu laden</button>`
    : `<h2>Shap3D.ai konnte nicht starten</h2>
       <p>Beim Start ist ein Fehler aufgetreten. Details stehen in der Browser-Konsole (F12).</p>
       ${detail ? `<pre>${esc(detail)}</pre>` : ''}
       <button type="button" onclick="location.reload()">Neu laden</button>`;
  splash.appendChild(box);
}
