<template>
  <div class="mt-1.5 mb-2.5 flex items-center gap-3"><S3dIcon :name="info.icon" :size="28" /><div><div class="text-[0.9375rem] font-bold">{{ info.name }}</div><div v-if="info.key" class="text-xs text-ink-2">Tastenkürzel: {{ info.key }}</div></div></div>
  <p class="mb-1.5">{{ text.desc }}</p>
  <div class="s3d-section-title">Bedienung</div>
  <ol class="list-decimal pl-4.5"><li v-for="(step, i) in text.steps" :key="i" class="my-1">{{ step }}</li></ol>
  <template v-if="text.mods?.length">
    <div class="s3d-section-title">Zusatztasten</div>
    <ul class="list-disc pl-4.5"><li v-for="(modifier, i) in text.mods" :key="i" class="my-1">{{ modifier }}</li></ul>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dIcon from '../S3dIcon.vue';
import { useEditor } from '../keys';
import { TOOL_INFO } from '../../engine/setup';

const editor = useEditor();
const info = computed(() => TOOL_INFO[editor.ui.tool] ?? TOOL_INFO.select);
const TEXTS: Record<string, { desc: string; steps: string[]; mods?: string[] }> = {
  select: { desc: 'Wählt Elemente für andere Werkzeuge und Befehle aus.', steps: ['Klicken Sie auf ein Element.', 'Ziehen Sie von links nach rechts (Fenster) oder rechts nach links (Kreuzen).', 'Doppelklick: Fläche mit Kanten bzw. Gruppe öffnen. Dreifachklick: alles Verbundene.'], mods: ['Strg: hinzufügen', 'Umschalt: hinzufügen/entfernen', 'Strg+Umschalt: entfernen'] },
  line: { desc: 'Zeichnet Kanten. Geschlossene Kanten in einer Ebene bilden automatisch eine Fläche.', steps: ['Klicken Sie auf den Startpunkt.', 'Klicken Sie auf den Endpunkt oder geben Sie eine Länge ein.', 'Weiterzeichnen oder Esc zum Beenden.'], mods: ['Pfeiltasten: Achse sperren', 'Umschalt: Inferenz sperren', 'Eingabe [x;y;z] absolut oder <x;y;z> relativ'] },
  rectangle: { desc: 'Zeichnet rechteckige Flächen auf dem Boden oder auf vorhandenen Flächen.', steps: ['Klicken Sie auf die erste Ecke.', 'Klicken Sie auf die gegenüberliegende Ecke.', 'Geben Sie z. B. „3m;4m“ ein, um die Maße festzulegen (auch nachträglich).'] },
  circle: { desc: 'Zeichnet einen Kreis (Polygon mit vielen Segmenten).', steps: ['Optional: Segmentanzahl eingeben (z. B. „48“).', 'Klicken Sie auf den Mittelpunkt.', 'Klicken Sie für den Radius oder geben Sie ihn ein.'] },
  polygon: { desc: 'Zeichnet ein regelmäßiges Polygon.', steps: ['Seitenanzahl eingeben (z. B. „8s“).', 'Mittelpunkt klicken.', 'Radius klicken oder eingeben.'] },
  arc2: { desc: 'Zeichnet einen Bogen über zwei Endpunkte und eine Wölbung.', steps: ['Startpunkt klicken.', 'Endpunkt klicken.', 'Wölbung ziehen und klicken (Halbkreis rastet ein).'] },
  arc: { desc: 'Zeichnet einen Bogen über Mittelpunkt, Startpunkt und Winkel.', steps: ['Mittelpunkt klicken.', 'Startpunkt (Radius) klicken.', 'Endwinkel klicken oder eingeben.'] },
  arc3: { desc: 'Zeichnet einen Bogen durch drei Punkte.', steps: ['Startpunkt klicken.', 'Punkt auf dem Bogen klicken.', 'Endpunkt klicken.'] },
  pie: { desc: 'Zeichnet einen Kreisausschnitt als Fläche.', steps: ['Mittelpunkt klicken.', 'Startpunkt klicken.', 'Winkel klicken.'] },
  freehand: { desc: 'Zeichnet unregelmäßige Kurven.', steps: ['Maustaste drücken und ziehen.', 'Loslassen beendet die Kurve; nahe am Start schließt sie.'] },
  rotrect: { desc: 'Rechteck mit beliebiger Ausrichtung.', steps: ['Erste Ecke klicken.', 'Zweite Ecke (Länge/Richtung) klicken.', 'Breite/Winkel klicken.'] },
  pushpull: { desc: 'Extrudiert Flächen zu 3D-Körpern oder verschiebt sie.', steps: ['Klicken Sie auf eine Fläche.', 'Bewegen Sie die Maus und klicken Sie erneut oder geben Sie eine Distanz ein.', 'Doppelklick auf eine andere Fläche wiederholt die letzte Distanz.'] },
  offset: { desc: 'Erzeugt eine parallele Kopie der Flächenkante nach innen oder außen.', steps: ['Klicken Sie auf eine Fläche.', 'Bewegen Sie den Cursor und klicken Sie oder geben Sie den Abstand ein.'] },
  move: { desc: 'Verschiebt, streckt oder kopiert Elemente.', steps: ['Elemente auswählen (oder direkt darauf zeigen).', 'Startpunkt klicken.', 'Zielpunkt klicken oder Distanz eingeben.'], mods: ['Strg: Kopie erstellen', 'Nach dem Kopieren „5x“ (Reihe) oder „/5“ (Teilen) eingeben', 'Pfeiltasten: Achse sperren'] },
  rotate: { desc: 'Dreht Elemente um einen Punkt.', steps: ['Elemente auswählen.', 'Drehpunkt klicken (Winkelmesser richtet sich an Flächen aus).', 'Startwinkel klicken, dann Drehwinkel klicken oder eingeben.'], mods: ['Strg: Kopie (danach „6x“ für Reihe)', 'Pfeiltasten: Winkelmesser an Achse ausrichten'] },
  scale: { desc: 'Skaliert die Auswahl über Ziehpunkte.', steps: ['Auswahl treffen.', 'Ziehpunkt (grün) anklicken.', 'Ziehen oder Faktor eingeben (z. B. „2“ oder „1;2;1“, auch Länge „3m“).'], mods: ['Strg: um die Mitte skalieren', 'Umschalt: gleichmäßig/ungleichmäßig umschalten'] },
  tape: { desc: 'Misst Abstände und erzeugt Hilfslinien.', steps: ['Startpunkt (oder Kante für parallele Hilfslinie) klicken.', 'Endpunkt klicken – die Länge steht im Feld „Maße“.', 'Neue Länge eingeben, um das Modell zu skalieren.'], mods: ['Strg: Hilfslinien an/aus'] },
  protractor: { desc: 'Misst Winkel und erzeugt geneigte Hilfslinien.', steps: ['Scheitelpunkt klicken.', 'Ersten Schenkel klicken.', 'Winkel klicken oder eingeben.'] },
  dimension: { desc: 'Erzeugt lineare Bemaßungen.', steps: ['Start- und Endpunkt klicken (oder eine Kante).', 'Bemaßung an ihre Position ziehen und klicken.'] },
  text: { desc: 'Erzeugt Beschriftungen mit Führungslinie.', steps: ['Klicken Sie auf ein Element (Fläche zeigt die Fläche, Kante die Länge).', 'Klicken Sie die Textposition.', 'Text eingeben.'] },
  section: { desc: 'Schneidet das Modell, um das Innere zu zeigen.', steps: ['Auf eine Fläche zeigen (die Ebene richtet sich aus).', 'Klicken zum Platzieren.', 'Ein-/Ausschalten im Panel „Anzeige“.'] },
  eraser: { desc: 'Löscht Kanten (und die angrenzenden Flächen).', steps: ['Auf Kanten klicken oder darüber ziehen.', 'Koplanare Flächen werden dabei verschmolzen.'], mods: ['Umschalt: ausblenden', 'Strg: abmildern', 'Strg+Umschalt: Abmilderung aufheben'] },
  paint: { desc: 'Weist Flächen, Gruppen und Komponenten Materialien zu.', steps: ['Material im Panel „Materialien“ wählen.', 'Auf Flächen oder Gruppen klicken.'], mods: ['Alt: Material aufnehmen', 'Strg: alle verbundenen gleichen Flächen', 'Umschalt: alle gleichen Flächen im Modell'] },
  orbit: { desc: 'Dreht die Kamera um das Modell.', steps: ['Ziehen zum Drehen.', 'Mittlere Maustaste funktioniert in jedem Werkzeug.'], mods: ['Umschalt: Schwenken'] },
  pan: { desc: 'Verschiebt die Ansicht.', steps: ['Ziehen zum Schwenken.', 'Umschalt + mittlere Maustaste in jedem Werkzeug.'] },
  zoom: { desc: 'Zoomt hinein und heraus.', steps: ['Nach oben/unten ziehen.', 'Mausrad zoomt zum Cursor.', 'Sichtfeld eingeben (z. B. 35).'] },
  followme: { desc: 'Extrudiert ein Profil entlang eines Pfades (z. B. Rohr, Gesims, Drehkörper).', steps: ['Pfad-Kanten auswählen (Doppelklick auf eine Fläche wählt deren Kanten).', 'Werkzeug wählen.', 'Auf die Profilfläche klicken.'] },
};
const text = computed(() => TEXTS[editor.ui.tool] ?? { desc: editor.ui.status, steps: [editor.ui.status] });
</script>
