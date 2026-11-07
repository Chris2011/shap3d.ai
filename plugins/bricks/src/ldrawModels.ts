/**
 * Finished models with every part in its place, from two copies of LDraw's model collection. Commits are pinned, so
 * nothing can change under this list. Only models whose file names a licence are listed, and none of a licensed
 * film, car or game brand. The piece counts were read from the files.
 */
// i18n-ignore-start – addresses and proper names
const COLLECTION = 'https://raw.githubusercontent.com/gkjohnson/ldraw-parts-library/1f24cac1821b9a86a5a84cd3a40291aad24679b3/models/';
const PACKED =
  'https://raw.githubusercontent.com/mrdoob/three.js/6f4f8a8a3d731c323b9a14b775113e2e886cd4d4/examples/models/ldraw/officialLibrary/models/';

export interface OnlineModel {
  id: string;
  title: string;
  /** "city", "castle" … – a message key of its own */
  theme: 'city' | 'castle' | 'pirates' | 'space' | 'vehicles' | 'landmarks' | 'adventure';
  pieces: number;
  url: string;
}

const entry = (base: string, theme: OnlineModel['theme'], number: string, title: string, pieces: number, file: string): OnlineModel => ({
  id: `model:${number}`,
  title,
  theme,
  pieces,
  url: base + encodeURIComponent(file),
});

export const ONLINE_MODELS: OnlineModel[] = [
  entry(COLLECTION, 'city', '10182', 'Cafe Corner', 2417, '10182-1 - Cafe Corner.mpd'),
  entry(COLLECTION, 'city', '10224', 'Town Hall', 2799, '10224 - Town Hall.mpd'),
  entry(COLLECTION, 'city', '21318', 'Tree House', 3029, '21318 - Tree House.mpd'),
  entry(COLLECTION, 'castle', '6080', 'Kings Castle', 911, '6080 - Kings Castle.mpd'),
  entry(COLLECTION, 'castle', '6066', 'Camouflaged Outpost', 262, '6066 - Camouflaged Outpost.mpd'),
  entry(COLLECTION, 'castle', '6071', 'Forestmens Crossing', 240, '6071 - Forestmens Crossing.mpd'),
  entry(COLLECTION, 'castle', '21325', 'Medieval Blacksmith', 2128, '21325 - Medieval Blacksmith.mpd'),
  entry(COLLECTION, 'castle', '9476', 'The Orc Forge', 589, '9476-1 - The Orc Forge.mpd'),
  entry(COLLECTION, 'pirates', '6285', 'Black Seas Barracuda', 3102, '6285 - Black Seas Barracuda.mpd'),
  entry(COLLECTION, 'pirates', '6286', 'Skulls Eye Schooner', 3010, '6286 - Skulls Eye Schooner.mpd'),
  entry(COLLECTION, 'pirates', '6279', 'Skull Island', 757, '6279-1 - Skull Island.mpd'),
  entry(COLLECTION, 'pirates', '6235', 'Buried Treasure', 31, '6235 - Buried Treasure.mpd'),
  entry(COLLECTION, 'pirates', '6245', 'Harbor Sentry', 31, '6245 - Harbor Sentry.mpd'),
  entry(COLLECTION, 'pirates', '1713', 'Shipwrecked Pirate', 29, '1713-1 - Shipwrecked Pirate.mpd'),
  entry(COLLECTION, 'space', '928', 'Galaxy Explorer', 368, '928-1 - Galaxy Explorer.mpd'),
  entry(COLLECTION, 'space', '1793', 'Space Station Zenon', 372, '1793-1 - Space Station Zenon.mpd'),
  entry(COLLECTION, 'space', '6957', 'Solar Snooper', 271, '6957-1 - Solar Snooper.mpd'),
  entry(COLLECTION, 'space', '6861', 'X1 Patrol Craft', 61, '6861-1 - X1 Patrol Craft.mpd'),
  entry(COLLECTION, 'space', '1180', 'Moon Buggy', 29, '1180-1 - Space Port Moon Buggy.mpd'),
  entry(PACKED, 'space', '1621', 'Lunar MPV Vehicle', 104, '1621-1-LunarMPVVehicle.mpd_Packed.mpd'),
  entry(COLLECTION, 'vehicles', '40448', 'Vintage Car', 200, '40448 - Vintage Car.mpd'),
  entry(COLLECTION, 'vehicles', '5571', 'Giant Truck', 1769, '5571-1 - Giant Truck.mpd'),
  entry(COLLECTION, 'vehicles', '10156', 'Truck', 111, '10156-1 - LEGO Truck.mpd'),
  entry(COLLECTION, 'vehicles', '10213', 'Shuttle Adventure', 1254, '10213-1 - Shuttle Adventure.mpd'),
  entry(PACKED, 'vehicles', '889', 'Radar Truck', 35, '889-1-RadarTruck.mpd_Packed.mpd'),
  entry(PACKED, 'vehicles', '4838', 'Mini Vehicles', 79, '4838-1-MiniVehicles.mpd_Packed.mpd'),
  entry(PACKED, 'vehicles', '4915', 'Mini Excavator', 67, '4915-1-MiniConstruction.mpd_Packed.mpd'),
  entry(PACKED, 'vehicles', '4918', 'Mini Helicopter', 75, '4918-1-MiniFlyers.mpd_Packed.mpd'),
  entry(PACKED, 'vehicles', '5935', 'Island Hopper', 203, '5935-1-IslandHopper.mpd_Packed.mpd'),
  entry(COLLECTION, 'landmarks', '10214', 'Tower Bridge', 4211, '10214-1 - Tower Bridge.mpd'),
  entry(COLLECTION, 'landmarks', '21019', 'Eiffel Tower', 332, '21019-1 - Eiffel Tower.mpd'),
  entry(COLLECTION, 'landmarks', '21041', 'Great Wall of China', 552, '21041-1 - Great Wall of China.mpd'),
  entry(PACKED, 'landmarks', '30023', 'Lighthouse', 25, '30023-1-Lighthouse.ldr_Packed.mpd'),
  entry(COLLECTION, 'adventure', '5934', 'Dino Explorer', 102, '5934 - Dino Explorer.mpd'),
  entry(COLLECTION, 'adventure', '5920', 'Island Racer', 54, '5920-1 - Island Racer.mpd'),
  entry(COLLECTION, 'adventure', '7410', 'Jungle River', 88, '7410-1 - Jungle River.mpd'),
  entry(COLLECTION, 'adventure', '6716', 'Covered Wagon', 70, '6716-1 - Covered Wagon.mpd'),
  entry(COLLECTION, 'adventure', '6755', "Sheriff's Lock-Up", 202, "6755-1 - Sheriff's Lock-Up.mpd"),
];
// i18n-ignore-end

export const MODEL_THEMES = ['city', 'castle', 'pirates', 'space', 'vehicles', 'landmarks', 'adventure'] as const;
