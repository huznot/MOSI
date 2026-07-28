import { MANITOBA_REGIONS } from '../constants/config';
import { clipPolygonToBounds, getPolygonBounds, getPolygonCentroid, PolygonBounds } from './manitobaGeometry';
import { RegionId } from '../types/alerts';

export type SubRegion = {
  id: string;
  name: string;
  shortName: string;
  parentRegionId: RegionId;
  center: { latitude: number; longitude: number };
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  polygon: Array<{ latitude: number; longitude: number }>;
  populationNote: string;
};

type ZoneMeta = {
  id: string;
  name: string;
  shortName: string;
  populationNote: string;
  forceBoundsFallback?: boolean;
  customBounds?: PolygonBounds;
};

type ZoneSeed = ZoneMeta & {
  parentRegionId: RegionId;
  bounds: PolygonBounds;
  forceBoundsFallback?: boolean;
};

function gridBounds(latBands: readonly number[], lonBands: readonly number[], row: number, column: number): PolygonBounds {
  return {
    minLat: latBands[row],
    maxLat: latBands[row + 1],
    minLon: lonBands[column],
    maxLon: lonBands[column + 1],
  };
}

function buildGrid(
  parentRegionId: RegionId,
  latBands: readonly number[],
  lonBands: readonly number[],
  grid: readonly (readonly (ZoneMeta | null)[])[],
) {
  return grid.flatMap((row, rowIndex) =>
    row.flatMap<ZoneSeed>((zone, columnIndex) =>
      zone
        ? [{
            ...zone,
            parentRegionId,
            bounds: zone.customBounds ?? gridBounds(latBands, lonBands, rowIndex, columnIndex),
          }]
        : [],
    ),
  );
}

const parentPolygonByRegion = Object.fromEntries(MANITOBA_REGIONS.map((region) => [region.id, region.polygon])) as Record<
  RegionId,
  readonly { latitude: number; longitude: number }[]
>;

function boundsToPolygon(bounds: PolygonBounds) {
  return [
    { latitude: bounds.minLat, longitude: bounds.minLon },
    { latitude: bounds.minLat, longitude: bounds.maxLon },
    { latitude: bounds.maxLat, longitude: bounds.maxLon },
    { latitude: bounds.maxLat, longitude: bounds.minLon },
  ];
}

function materializeZone(zone: ZoneSeed): SubRegion | null {
  const clippedPolygon = clipPolygonToBounds(parentPolygonByRegion[zone.parentRegionId] ?? [], zone.bounds);
  const polygon = clippedPolygon.length >= 3 ? clippedPolygon : zone.forceBoundsFallback ? boundsToPolygon(zone.bounds) : [];
  if (polygon.length < 3) {
    return null;
  }

  return {
    id: zone.id,
    name: zone.name,
    shortName: zone.shortName.slice(0, 12),
    parentRegionId: zone.parentRegionId,
    center: getPolygonCentroid(polygon),
    bounds: getPolygonBounds(polygon),
    polygon,
    populationNote: zone.populationNote,
  };
}

const WINNIPEG_LAT_BANDS = [49.7136, 49.79, 49.85, 49.93, 50.0637] as const;
const WINNIPEG_LON_BANDS = [-97.3492, -97.22, -97.08, -96.9565] as const;

const SOUTHERN_LAT_BANDS = [48.9999, 49.45, 50.05, 50.7716] as const;
const SOUTHERN_LON_BANDS = [-99.1236, -98.35, -97.45, -96.45, -95.1532] as const;

const EASTERN_LAT_BANDS = [49.4137, 50.15, 50.9, 51.8, 53.8798] as const;
const EASTERN_LON_BANDS = [-100.0142, -97.6, -96.2, -94.9016] as const;

const WESTERN_LAT_BANDS = [48.9995, 49.65, 50.35, 51.15, 53.0] as const;
const WESTERN_LON_BANDS = [-101.6713, -100.75, -99.75, -98.3358] as const;

const NORTHERN_LAT_BANDS = [52.9964, 54.25, 55.7, 57.7, 59.9994] as const;
const NORTHERN_LON_BANDS = [-102.0069, -99.3, -95.4, -88.9919] as const;

const ZONE_SEEDS: ZoneSeed[] = [
  ...buildGrid('winnipeg', WINNIPEG_LAT_BANDS, WINNIPEG_LON_BANDS, [
    [
      {
        id: 'wpg-southwest',
        name: 'Winnipeg Southwest',
        shortName: 'SW WPG',
        populationNote: 'Charleswood, Fort Whyte, Bridgwater, and the southwest edge.',
      },
      {
        id: 'wpg-south-central',
        name: 'Winnipeg South-Central',
        shortName: 'S Central',
        populationNote: 'Fort Garry, St. Norbert, and the Pembina corridor.',
      },
      {
        id: 'wpg-southeast',
        name: 'Winnipeg Southeast',
        shortName: 'SE WPG',
        populationNote: 'St. Vital, Southdale, Sage Creek, and the southeast perimeter.',
      },
    ],
    [
      {
        id: 'wpg-west',
        name: 'Winnipeg West',
        shortName: 'West WPG',
        populationNote: 'St. James, Assiniboia, and west-central neighbourhoods.',
      },
      {
        id: 'wpg-central',
        name: 'Winnipeg Central',
        shortName: 'Central',
        populationNote: 'River Heights, Osborne, Corydon, and the inner core.',
      },
      {
        id: 'wpg-east',
        name: 'Winnipeg East',
        shortName: 'East WPG',
        populationNote: 'St. Boniface, Windsor Park, and the east-central belt.',
      },
    ],
    [
      {
        id: 'wpg-northwest',
        name: 'Winnipeg Northwest',
        shortName: 'NW WPG',
        populationNote: 'Airport, Inkster west, and the northwest urban edge.',
      },
      {
        id: 'wpg-inner-north',
        name: 'Winnipeg Inner North',
        shortName: 'Inner N',
        populationNote: 'North End, downtown north, Garden City south, and Seven Oaks south.',
      },
      {
        id: 'wpg-northeast',
        name: 'Winnipeg Northeast',
        shortName: 'NE WPG',
        populationNote: 'East and North Kildonan, Transcona, and the northeast metro.',
      },
    ],
    [
      {
        id: 'wpg-perimeter-west',
        name: 'Winnipeg Perimeter West',
        shortName: 'Perim W',
        populationNote: 'West perimeter fringe and the outer northwest edge.',
      },
      {
        id: 'wpg-north',
        name: 'Winnipeg North',
        shortName: 'North WPG',
        populationNote: 'Seven Oaks north, Riverbend, Maples north, and north perimeter.',
      },
      {
        id: 'wpg-perimeter-east',
        name: 'Winnipeg Perimeter East',
        shortName: 'Perim E',
        populationNote: 'East St. Paul, Birds Hill fringe, and the outer northeast edge.',
      },
    ],
  ]),
  ...buildGrid('southern', SOUTHERN_LAT_BANDS, SOUTHERN_LON_BANDS, [
    [
      {
        id: 'south-pembina-west',
        name: 'Pembina Valley West',
        shortName: 'Pembina W',
        populationNote: 'Pilot Mound, Manitou, Crystal City, and the far southwest corner.',
      },
      {
        id: 'south-winkler-morden',
        name: 'Winkler / Morden',
        shortName: 'Winkler',
        populationNote: 'Winkler, Morden, Plum Coulee, and the core Pembina Valley.',
      },
      {
        id: 'south-red-river',
        name: 'Red River South',
        shortName: 'RR South',
        populationNote: 'Morris, Emerson, St. Jean Baptiste, and the Red River border strip.',
      },
      {
        id: 'south-southeast',
        name: 'Southeast South',
        shortName: 'SE South',
        populationNote: 'Steinbach south, La Broquerie, and the southeast border communities.',
      },
    ],
    [
      {
        id: 'south-central-plains',
        name: 'Central Plains South',
        shortName: 'Plains S',
        populationNote: 'Treherne, Carman, Elm Creek, and south-central prairie towns.',
      },
      {
        id: 'south-portage',
        name: 'Portage Plains',
        shortName: 'Portage',
        populationNote: 'Portage la Prairie, High Bluff, and the Trans-Canada corridor.',
      },
      {
        id: 'south-morris-niverville',
        name: 'Morris / Niverville',
        shortName: 'Morris',
        populationNote: 'Niverville, Morris north, St. Adolphe, and the south metro fringe.',
      },
      {
        id: 'south-steinbach',
        name: 'Steinbach / Ste. Anne',
        shortName: 'Steinbach',
        populationNote: 'Steinbach, Ste. Anne, Marchand, and the Eastman-south connector.',
      },
    ],
    [
      {
        id: 'south-tiger-hills',
        name: 'Tiger Hills',
        shortName: 'Tiger Hls',
        populationNote: 'Treherne north, Holland, and the Tiger Hills uplands.',
      },
      {
        id: 'south-central-north',
        name: 'Central Plains North',
        shortName: 'Plains N',
        populationNote: 'Austin, Gladstone, and the northern Central Plains corridor.',
      },
      {
        id: 'south-niverville-corridor',
        name: 'Niverville Corridor',
        shortName: 'Niverville',
        populationNote: 'Niverville north, Ile des Chenes, and the Red River metro approach.',
      },
      {
        id: 'south-southeast-north',
        name: 'Southeast North',
        shortName: 'SE North',
        populationNote: 'Ste. Anne north, Richer, and the upper southeast prairie belt.',
      },
    ],
  ]),
  ...buildGrid('eastern', EASTERN_LAT_BANDS, EASTERN_LON_BANDS, [
    [
      {
        id: 'east-interlake-southwest',
        name: 'Interlake Southwest',
        shortName: 'Int SW',
        populationNote: 'Stonewall, Teulon, Warren, and the lower west Interlake.',
      },
      {
        id: 'east-selkirk-red',
        name: 'Selkirk / Lower Red',
        shortName: 'Selkirk',
        populationNote: 'Selkirk, Lockport, East Selkirk, and the lower Red River.',
      },
      {
        id: 'east-eastman-south',
        name: 'Eastman South',
        shortName: 'Eastman S',
        populationNote: 'Beausejour, Lac du Bonnet south, and the southern Eastman side.',
      },
    ],
    [
      {
        id: 'east-gimli-arborg',
        name: 'Gimli / Arborg',
        shortName: 'Gimli',
        populationNote: 'Gimli, Arborg, Riverton, and the central west Interlake shore.',
      },
      {
        id: 'east-lake-south',
        name: 'Lake Winnipeg East South',
        shortName: 'LWE South',
        populationNote: 'Traverse Bay, Victoria Beach, and the lower east shore.',
        customBounds: {
          minLat: EASTERN_LAT_BANDS[1],
          maxLat: EASTERN_LAT_BANDS[3],
          minLon: EASTERN_LON_BANDS[1],
          maxLon: EASTERN_LON_BANDS[2],
        },
      },
      {
        id: 'east-whiteshell',
        name: 'Whiteshell South',
        shortName: 'Whiteshell',
        populationNote: 'Falcon Lake, West Hawk Lake, and southern Whiteshell recreation areas.',
        customBounds: {
          minLat: EASTERN_LAT_BANDS[1],
          maxLat: EASTERN_LAT_BANDS[3],
          minLon: EASTERN_LON_BANDS[2],
          maxLon: EASTERN_LON_BANDS[3],
        },
      },
    ],
    [
      {
        id: 'east-interlake-central',
        name: 'Interlake Central',
        shortName: 'Int Ctr',
        populationNote: 'Arborg north, St. Martin south, and the mid-Interlake communities.',
      },
      null,
      null,
    ],
    [
      {
        id: 'east-interlake-north',
        name: 'Interlake North',
        shortName: 'Int North',
        populationNote: 'Matheson Island, St. Martin, and the upper Interlake corridor.',
      },
      {
        id: 'east-lake-northeast',
        name: 'Lake Winnipeg Northeast',
        shortName: 'LWE North',
        populationNote: 'Berens River south, north east shore, and remote lake communities.',
      },
      {
        id: 'east-far-east',
        name: 'Far East Boreal',
        shortName: 'Far East',
        populationNote: 'Ontario border lakes, remote boreal east, and the far northeast shield.',
      },
    ],
  ]),
  ...buildGrid('western', WESTERN_LAT_BANDS, WESTERN_LON_BANDS, [
    [
      {
        id: 'west-border-south',
        name: 'Southwest Border',
        shortName: 'SW Border',
        populationNote: 'Melita, Pierson, Reston, and the extreme southwest border belt.',
      },
      {
        id: 'west-virden-souris',
        name: 'Virden / Souris',
        shortName: 'Virden',
        populationNote: 'Virden, Souris, Hartney, Oak Lake, and west-central border towns.',
      },
      {
        id: 'west-killarney',
        name: 'Boissevain / Killarney',
        shortName: 'Killarney',
        populationNote: 'Boissevain, Killarney, Deloraine, and Turtle Mountain communities.',
      },
    ],
    [
      {
        id: 'westman-west',
        name: 'Westman West',
        shortName: 'Westman W',
        populationNote: 'Elkhorn, Hamiota, and the west-central prairie corridor.',
      },
      {
        id: 'west-brandon-west',
        name: 'Brandon West',
        shortName: 'Brandon W',
        populationNote: 'West Brandon, Shilo, Carberry, and southwest urban fringe.',
      },
      {
        id: 'west-brandon-east',
        name: 'Brandon East',
        shortName: 'Brandon E',
        populationNote: 'East Brandon, Glenboro side, and the eastern Westman approach.',
      },
    ],
    [
      {
        id: 'west-parkland-sw',
        name: 'Parkland Southwest',
        shortName: 'Park SW',
        populationNote: 'Russell, Rossburn, Birtle, and the southwest Parkland edge.',
      },
      {
        id: 'west-dauphin-riding',
        name: 'Dauphin / Riding',
        shortName: 'Dauphin',
        populationNote: 'Dauphin, Gilbert Plains, and Riding Mountain south-side communities.',
      },
      {
        id: 'west-parkland-se',
        name: 'Parkland Southeast',
        shortName: 'Park SE',
        populationNote: 'Ste. Rose south, Minnedosa north, and the southeast Parkland side.',
      },
    ],
    [
      {
        id: 'west-swan-west',
        name: 'Swan Valley West',
        shortName: 'Swan W',
        populationNote: 'Swan River west, Benito, and the northwest valley edge.',
      },
      {
        id: 'west-swan-east',
        name: 'Swan Valley East',
        shortName: 'Swan E',
        populationNote: 'Swan River east, Minitonas, and the eastern Swan Valley.',
      },
      {
        id: 'west-duck-north',
        name: 'Duck Mountain North',
        shortName: 'Duck Mtn',
        populationNote: 'Northern Duck Mountain and the upper Parkland forest fringe.',
      },
    ],
  ]),
  ...buildGrid('northern', NORTHERN_LAT_BANDS, NORTHERN_LON_BANDS, [
    [
      {
        id: 'north-pas-flinflon',
        name: 'The Pas / Flin Flon',
        shortName: 'Pas / FF',
        populationNote: 'The Pas, Flin Flon, Cranberry Portage, and the southern northwest north.',
      },
      {
        id: 'north-thompson-south',
        name: 'Wabowden / Snow Lake',
        shortName: 'Wabowden',
        populationNote: 'Wabowden, Snow Lake, and the corridor south of Thompson.',
      },
      {
        id: 'north-island-south',
        name: 'Island Lake South',
        shortName: 'Island S',
        populationNote: 'Gods Lake and the southern edge of the Island Lake area.',
      },
    ],
    [
      {
        id: 'north-nw-central',
        name: 'Northwest Central',
        shortName: 'NW Central',
        populationNote: 'Sherridon, Lynn Lake south, and the inland northwest corridor.',
      },
      {
        id: 'north-thompson',
        name: 'Thompson / Norway House',
        shortName: 'Thompson',
        populationNote: 'Thompson, Norway House, Cross Lake, and Split Lake.',
      },
      {
        id: 'north-island-lake',
        name: 'Island Lake',
        shortName: 'Island Lk',
        populationNote: 'Garden Hill, Wasagamack, St. Theresa Point, and Red Sucker Lake.',
      },
    ],
    [
      {
        id: 'north-lynn-lake',
        name: 'Lynn Lake / Far Northwest',
        shortName: 'Lynn Lake',
        populationNote: 'Lynn Lake, Leaf Rapids, and the upper northwest interior.',
      },
      {
        id: 'north-gillam',
        name: 'Gillam / Fox Lake',
        shortName: 'Gillam',
        populationNote: 'Gillam, Fox Lake, and the Nelson River hydro corridor.',
      },
      {
        id: 'north-ne-inland',
        name: 'Northeast Inland',
        shortName: 'NE Inland',
        populationNote: 'Shamattawa and the inland northeast boreal zone.',
      },
    ],
    [
      {
        id: 'north-far-nw',
        name: 'Far Northwest',
        shortName: 'Far NW',
        populationNote: 'Remote tundra and boreal northwest approaching Nunavut.',
      },
      {
        id: 'north-hudson-west',
        name: 'Hudson Bay West',
        shortName: 'HB West',
        populationNote: 'York Factory coast and the western Hudson Bay lowlands.',
      },
      {
        id: 'north-churchill',
        name: 'Churchill / Hudson Bay Coast',
        shortName: 'Churchill',
        populationNote: 'Churchill, Cape Tatnam, and the Hudson Bay coast.',
      },
    ],
  ]),
];

export const MANITOBA_SUB_REGIONS: SubRegion[] = ZONE_SEEDS.map(materializeZone).filter(Boolean) as SubRegion[];
