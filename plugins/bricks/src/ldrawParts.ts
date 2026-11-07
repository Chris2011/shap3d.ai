import type { FoundPart } from './online';

/**
 * Common parts of the LDraw library, checked to be there at the pinned commit, so that searching works without a key.
 * "number|title" – the titles as the library has them, in English, without brand names. Any other number can be typed.
 */
// i18n-ignore-start – a source's data
const PARTS = `3005|Brick 1 x 1
3004|Brick 1 x 2
3622|Brick 1 x 3
3010|Brick 1 x 4
3009|Brick 1 x 6
3008|Brick 1 x 8
6111|Brick 1 x 10
6112|Brick 1 x 12
3003|Brick 2 x 2
3002|Brick 2 x 3
3001|Brick 2 x 4
2456|Brick 2 x 6
3007|Brick 2 x 8
3006|Brick 2 x 10
2357|Brick 2 x 2 Corner
3062b|Brick 1 x 1 Round with Hollow Stud
3941|Brick 2 x 2 Round
4070|Brick 1 x 1 with Headlight
87087|Brick 1 x 1 with Stud on 1 Side
4733|Brick 1 x 1 with Studs on Four Sides
30136|Brick 1 x 2 Log
2877|Brick 1 x 2 with Grille
3700|Brick 1 x 2 with Hole
3701|Brick 1 x 4 with Holes
3894|Brick 1 x 6 with Holes
3024|Plate 1 x 1
3023|Plate 1 x 2
3623|Plate 1 x 3
3710|Plate 1 x 4
3666|Plate 1 x 6
3460|Plate 1 x 8
4477|Plate 1 x 10
3022|Plate 2 x 2
2420|Plate 2 x 2 Corner
3021|Plate 2 x 3
3020|Plate 2 x 4
3795|Plate 2 x 6
3034|Plate 2 x 8
3832|Plate 2 x 10
2445|Plate 2 x 12
3176|Plate 3 x 2 with Hole
3031|Plate 4 x 4
3035|Plate 4 x 8
3030|Plate 4 x 10
3958|Plate 6 x 6
3036|Plate 6 x 8
3033|Plate 6 x 10
4032a|Plate 2 x 2 Round with Axlehole
3867|Baseplate 16 x 16
3811|Baseplate 32 x 32
3070b|Tile 1 x 1 with Groove
3069b|Tile 1 x 2 with Groove
63864|Tile 1 x 3
2431|Tile 1 x 4 with Groove
6636|Tile 1 x 6
3068b|Tile 2 x 2 with Groove
87079|Tile 2 x 4 with Groove
4150|Tile 2 x 2 Round
3040b|Slope Brick 45 2 x 1
3039|Slope Brick 45 2 x 2
3038|Slope Brick 45 2 x 3
3037|Slope Brick 45 2 x 4
3044b|Slope Brick 45 2 x 1 Double
3048b|Slope Brick 45 1 x 2 Triple
3665a|Slope Brick 45 2 x 1 Inverted
3660a|Slope Brick 45 2 x 2 Inverted
4286|Slope Brick 33 3 x 1
3298|Slope Brick 33 3 x 2
3297|Slope Brick 33 3 x 4
3747a|Slope Brick 33 3 x 2 Inverted
54200|Slope Brick 31 1 x 1 x 0.667
4460a|Slope Brick 75 2 x 1 x 3
3943b|Cone 4 x 4 x 2
4589|Cone 1 x 1
4740|Dish 2 x 2 Inverted
6005|Arch 1 x 3 x 2 with Curved Top
3659|Arch 1 x 4
3455|Arch 1 x 6
3307|Arch 1 x 6 x 2
60592|Window 1 x 2 x 2
60593|Window 1 x 2 x 3
60594|Window 1 x 4 x 3
60596|Door 1 x 4 x 6 Frame
4865a|Panel 1 x 2 x 1
87552|Panel 1 x 2 x 2
60581|Panel 1 x 4 x 3
3633|Fence Lattice 1 x 4 x 1
3185|Fence Lattice 1 x 4 x 2
3937|Hinge 1 x 2 Base
3938|Hinge 1 x 2 Top
43723|Wing 2 x 3 Left
43722|Wing 2 x 3 Right
41770|Wing 2 x 4 Left
41769|Wing 2 x 4 Right
54384|Wing 3 x 6 Left
54383|Wing 3 x 6 Right
32523|Beam 3
4624|Wheel Rim 6.4 x 8`;
// i18n-ignore-end

export const COMMON_PARTS: FoundPart[] = PARTS.split('\n').map((line) => {
  const [number, title] = line.split('|');
  return { number, title };
});

/** all words of the search in a part's number or title */
export const searchCommonParts = (query: string) => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return COMMON_PARTS.filter(({ number, title }) => {
    const text = `${number} ${title}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
};
