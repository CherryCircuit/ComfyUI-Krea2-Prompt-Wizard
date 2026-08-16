/* Krea2 Prompt Wizard widget
 *
 * The main frontend component. It renders the visual builder inside
 * the wizard node's DOM widget and exposes a controlled-state API.
 *
 * The widget is resilient: if the wizard extension fails to load, the
 * node still works through the wizard_state_json STRING input.
 */
(function () {
  "use strict";

  const K = window.KREA2;
  const {
    el,
    debounce,
    icon,
    emptyState,
    coerceState,
    uniqueRowId,
    compilePreview,
    fetchCompiledPreview,
    fetchLibrary,
    fetchMasterPresets,
    fetchSavedPresets,
    fetchLoras,
    fetchConflicts,
    saveSavedPresets,
    showToast,
    groupForCategory,
    paletteNearestName,
    hexToHsv,
    hsvToHex,
    sortedOptions,
  } = K.helpers;
  const fetchConceptColors = K.helpers.fetchConceptColors || function () { return Promise.resolve({}); };
  const saveConceptColors = K.helpers.saveConceptColors || function () { return Promise.resolve(); };
  const {
    GROUPS,
    GROUP_LABELS,
    GROUP_CATEGORIES,
    RANDOM_GROUP_CATEGORIES,
    CATEGORIES,
    CATEGORY_LABELS,
    PALETTE_COLORS,
    LIGHT_PALETTE,
  } = K.constants;
  const { render: renderRow } = K.presetRow;
  const { show: showSearchableSelector } = K.searchableSelector;
  const { open: openLibraryEditor } = K.libraryEditor;
  const { materialize: materializeToNodes, createSubgraph: createSubgraphFromWizard } = K.materialize;
  const { render: renderShowWork } = K.inspectorView;

  /* Per-character appearance fields, grouped into display columns. Each
   * field is a combobox: preset options plus free typing. */
  const CHARACTER_APPEARANCE = [
    { group: "basics", key: "sex", label: "Sex", options: ["male", "female", "unspecified"] },
    { group: "basics", key: "age", label: "Age", options: ["child", "teenager", "young adult", "adult", "middle aged", "elderly"] },
    { group: "basics", key: "ethnicity", label: "Ethnicity", options: [
      "East Asian", "Chinese", "Japanese", "Korean", "Southeast Asian", "Vietnamese", "Filipino", "Thai",
      "South Asian", "Indian", "Pakistani", "Bangladeshi", "Sri Lankan",
      "Middle Eastern", "Arab", "Persian", "Turkish", "Israeli",
      "Mediterranean", "Greek", "Italian", "Spanish", "Portuguese",
      "Northern European", "Scandinavian", "British", "Irish", "French", "German",
      "Slavic", "Russian", "Polish", "Ukrainian", "Eastern European",
      "Central Asian", "Kazakh", "Mongolian",
      "Black / African", "African American", "Afro-Caribbean", "Afro-Latino",
      "Indigenous American", "Native American", "First Nations", "Inuit",
      "Pacific Islander", "Polynesian", "Hawaiian", "Maori", "Aboriginal Australian",
      "Latin American", "Mexican", "Brazilian", "Colombian", "Puerto Rican", "Cuban",
      "Multiracial", "Ambiguous",
      "Vulcan", "Romulan", "Klingon", "Ferengi", "Bajoran", "Cardassian", "Trill", "Betazoid", "Andorian",
      "Twi'lek", "Togruta", "Zabrak", "Mirialan", "Chiss", "Pantoran", "Miraluka", "Rodian", "Wookiee",
      "Asari", "Turian", "Salarian", "Krogan", "Quarian", "Drell", "Protoss",
      "Na'vi", "Martian", "Xenomorph", "Yautja", "Sontaran", "Ood", "Silurian", "Time Lord",
    ] },
    { group: "hair", key: "hair_style", label: "Hair style", options: [
      "straight", "wavy", "curly", "coily", "kinky", "afro", "braided", "cornrows", "dreadlocks",
      "ponytail", "high ponytail", "low ponytail", "pigtails", "twin tails", "bun", "top knot",
      "man bun", "space buns", "half-up half-down", "bob", "pixie cut", "undercut", "buzz cut",
      "shaved", "mohawk", "faux hawk", "mullet", "side part", "middle part", "slicked back",
      "pompadour", "quiff", "bangs", "curtain bangs", "messy layered", "loose waves",
      "French braid", "Dutch braid", "fishtail braid", "braided crown", "perm",
    ] },
    { group: "hair", key: "hair_length", label: "Hair length", options: [
      "shaved", "buzz cut", "short", "ear-length", "chin-length", "neck-length",
      "shoulder-length", "mid-back length", "waist-length", "hip-length", "floor-length",
    ] },
    { group: "hair", key: "hair_color", label: "Hair colour", options: [
      "black", "jet black", "dark brown", "chestnut brown", "auburn", "copper", "red",
      "ginger", "strawberry blonde", "blonde", "honey blonde", "platinum blonde", "ash blonde",
      "silver", "white", "grey", "blue", "teal", "purple", "pink", "green", "rainbow",
      "ombre", "balayage", "highlights", "lowlights", "two-tone",
    ] },
    { group: "hair", key: "makeup", label: "Makeup", options: [
      "no makeup", "natural makeup", "no-makeup makeup", "subtle makeup", "soft glam makeup",
      "full glam makeup", "dramatic smoky eyes", "smokey eye", "winged eyeliner", "cat eye",
      "bold red lip", "glossy lip", "nude lip", "editorial makeup", "avant-garde makeup",
      "gothic makeup", "vintage pin-up makeup", "bridal makeup", "festival glitter makeup",
      "minimal makeup", "dewy skin makeup",
    ] },
    { group: "face", key: "eyes", label: "Eyes", options: [
      "large round eyes", "almond-shaped eyes", "hooded eyes", "deep-set eyes", "upturned eyes",
      "downturned eyes", "monolid eyes", "close-set eyes", "wide-set eyes", "bright blue eyes",
      "icy blue eyes", "green eyes", "hazel eyes", "brown eyes", "dark brown eyes", "black eyes",
      "grey eyes", "amber eyes", "violet eyes", "heterochromatic eyes",
    ] },
    { group: "face", key: "nose", label: "Nose", options: [
      "straight nose", "button nose", "aquiline nose", "broad nose", "flat nose", "upturned nose",
      "pointed nose", "wide nose", "thin nose", "snub nose", "Roman nose", "hawk-like nose",
      "defined nose", "soft nose",
    ] },
    { group: "face", key: "mouth", label: "Mouth", options: [
      "full lips", "thin lips", "wide mouth", "small mouth", "defined cupid's bow",
      "heart-shaped lips", "pouty lips", "downturned mouth", "upturned mouth", "smile lines",
    ] },
    { group: "face", key: "chin", label: "Chin", options: [
      "rounded chin", "pointed chin", "strong chin", "cleft chin", "soft chin", "square chin",
      "receding chin", "prominent chin", "dimpled chin",
    ] },
    { group: "face", key: "face_shape", label: "Face shape", options: [
      "oval face", "round face", "square face", "heart-shaped face", "diamond-shaped face",
      "long face", "rectangular face", "triangular face", "pear-shaped face", "angular face",
      "soft face",
    ] },
    { group: "body", key: "body_type", label: "Body type", options: [
      "slim build", "average build", "athletic build", "muscular build", "stocky build",
      "curvy build", "plus-size build", "petite build", "tall build", "lithe build",
      "willowy build", "broad build",
    ] },
    { group: "body", key: "fitness", label: "Fitness", options: [
      "soft physique", "lightly toned", "fit", "athletic physique", "highly athletic",
      "powerful physique", "lean physique", "muscular physique", "toned physique",
    ] },
    { group: "body", key: "proportions", label: "Proportions", options: [
      "natural proportions", "tall proportions", "petite proportions", "broad shoulders",
      "long legs", "short legs", "balanced hourglass proportions", "athletic proportions",
      "elongated proportions",
    ] },
    { group: "clothing", key: "ensemble", label: "Ensemble (full costume)", options: [
      "western cowboy outfit", "western cowgirl outfit", "medieval knight plate armour",
      "fantasy leather armour", "fantasy ranger leathers", "medieval bard outfit",
      "royal mage robes", "wizard robes", "sci-fi flight suit", "sci-fi crew uniform",
      "spacesuit", "cyberpunk streetwear", "noir trench coat and fedora", "1940s zoot suit",
      "1920s flapper dress", "Victorian gown", "Edwardian three-piece suit", "Tudor noble attire",
      "samurai armour", "ninja outfit", "Viking warrior garb", "Roman centurion armour",
      "Greek hoplite armour", "Egyptian pharaoh attire", "steampunk aviator outfit",
      "dieselpunk pilot gear", "post-apocalyptic scavenger gear", "superhero costume",
      "royal ballgown", "gothic lolita dress", "business suit", "power suit", "cocktail dress",
      "evening gown", "trench coat and scarf", "bomber jacket and jeans", "leather biker outfit",
      "denim-on-denim look", "hazmat suit", "lab coat and goggles", "chef whites",
      "surgeon scrubs", "firefighter turnout gear", "police uniform", "military fatigues",
      "tuxedo", "wedding dress", "kimono", "hanbok", "cheongsam", "sari", "dashiki",
      "poncho and serape", "fur coat and hat", "parka and snow boots", "preppy cardigan look",
      "gym wear", "swimwear", "traditional kilt", "lederhosen",
    ] },
    { group: "clothing", key: "clothing_top", label: "Top", options: [
      "plain t-shirt", "graphic t-shirt", "tank top", "button-up shirt", "flannel shirt",
      "polo shirt", "knit sweater", "turtleneck sweater", "hoodie", "cardigan", "blouse",
      "crop top", "camisole", "halter top", "off-shoulder top", "corset top", "leather jacket",
      "denim jacket", "bomber jacket", "blazer", "suit jacket", "trench coat", "peacoat",
      "parka", "puffer jacket", "vest", "waistcoat", "chainmail shirt", "chestplate armour",
      "tunic", "robes", "sports jersey", "lab coat", "work shirt", "henley shirt",
    ] },
    { group: "clothing", key: "clothing_bottom", label: "Bottom", options: [
      "skinny jeans", "straight-leg jeans", "wide-leg trousers", "dress trousers",
      "cargo pants", "chinos", "shorts", "cargo shorts", "athletic shorts", "mini skirt",
      "midi skirt", "maxi skirt", "pleated skirt", "A-line skirt", "leather pants",
      "leggings", "joggers", "sweatpants", "overalls", "dungarees", "armoured greaves",
      "chainmail leggings", "puffy harem pants", "palazzo pants", "capri pants", "kilt",
      "military trousers", "cargo leggings", "formal culottes", "biker shorts",
    ] },
  ];

  const CHARACTER_COLUMN_LAYOUT = [
    ["Identity & hair", ["basics", "hair"]],
    ["Face & body", ["face", "body"]],
    ["Clothing", ["clothing"]],
  ];

  /* Per-character direction categories. A cast member owns these so two
   * characters in one scene never share the same emotion or body language. */
  const EMOTION_CATEGORIES = ["emotion", "emotion_trigger"];
  const FACE_CATEGORIES = ["face", "face_trigger", "gaze", "mouth"];
  const BODY_CATEGORIES = ["body"];
  const POSITION_CATEGORIES = ["position"];
  const LORA_CATEGORIES = ["lora_trigger"];
  const DIRECTION_CATEGORIES = EMOTION_CATEGORIES.concat(
    FACE_CATEGORIES, BODY_CATEGORIES, POSITION_CATEGORIES, LORA_CATEGORIES,
  );
  /* Character concept picker excludes LoRA trigger words (handled by the
   * per-character LoRA rows instead). */
  const CHARACTER_PICKER_CATEGORIES = DIRECTION_CATEGORIES.filter(function (category) {
    return category !== "lora_trigger";
  });

  /* The Concepts Applied block splits subject & expression into three
   * side-by-side groups, each with its own dice and each-job shuffle. */
  const CHARACTER_CONCEPT_GROUPS = [
    { id: "emotion", icon: "sparkle", label: "Emotion", categories: ["emotion", "emotion_trigger"], emptyHint: "No emotion set." },
    { id: "expression", icon: "eye", label: "Expression", categories: ["face", "face_trigger", "gaze", "mouth"], emptyHint: "No facial action set." },
    { id: "pose", icon: "users", label: "Pose & Placement", categories: ["body", "position"], emptyHint: "No pose or placement set." },
  ];

  /* TV/movie-style multi-concept direction presets shown as chips on each
   * cast member. Each chip applies several related concepts at once. */
  const QUICK_DIRECTIONS = [
    { label: "Triumphant", presets: [["emotion.elation", 1.5], ["mouth.broad_smile", 1.3], ["body.shoulders_pulled_back", 1.2], ["gaze.looking_upward", 1.1]] },
    { label: "Playful", presets: [["emotion.amusement", 1.4], ["mouth.smirk", 1.2], ["gaze.side_glance", 1.1], ["body.leaning_forward", 1.1]] },
    { label: "Flirtatious", presets: [["emotion.affection", 1.3], ["mouth.smirk", 1.3], ["gaze.looking_toward_another_subject", 1.2], ["body.leaning_forward", 1.2]] },
    { label: "Calm", presets: [["emotion.serenity", 1.4], ["mouth.gentle_smile", 1.2], ["body.relaxed_posture", 1.2], ["gaze.looking_directly_into_the_camera", 1.0]] },
    { label: "Focused", presets: [["emotion.determination", 1.4], ["gaze.fixed_intense_stare", 1.3], ["body.confident_stance", 1.2]] },
  ];

  /* Build indicator shown in the top bar so it is obvious which wizard
   * build is running. Bump when you ship a new build. */
  const WIZARD_VERSION = "v2.2.0";

  const TABS = [
    ["cast", "Cast", "users"],
    ["scene", "Scene", "clapper"],
  ];
  const CONCEPTS_TAB = ["concepts", "Concepts"];

  /* Fresh-node seed: the first character on a brand-new node starts with
   * three visible concept rows so the layout is obvious without clicking.
   * All ids must exist in presets/default_library.json and belong to the
   * three character concept groups (pose / emotion / face). */
  const SEED_ROWS = [
    ["emotion.joy", 1.5],
    ["emotion_trigger.radiant_joy", 1.0],
    ["body.open_posture", 1.5],
  ];

  /* Fallback labels/phrases used before the library fetch resolves (the
   * seed must render on the very first frame, not after a network round
   * trip). Enriched from the library once it loads. */
  const SEED_ROW_FALLBACKS = {
    "emotion.joy": { category: "emotion", label: "Joy", phrase: "joy" },
    "emotion_trigger.radiant_joy": { category: "emotion_trigger", label: "Radiant joy", phrase: "a radiant glow of joy" },
    "body.open_posture": { category: "body", label: "Open posture", phrase: "open posture" },
  };

  /* Conflict-aware cascading (v1 scope: emotion, framing, angle).
   * Curated pairs are merged with pairs derived from presets/conflicts.json
   * id tokens (e.g. "shot_size.extreme_close_up_vs_establishing"). */
  const CONFLICT_CATEGORIES = ["emotion", "framing", "angle"];
  const CURATED_CONFLICTS = [
    ["framing.close_up", "framing.wide_establishing_shot"],
    ["framing.extreme_close_up", "framing.wide_establishing_shot"],
    ["framing.macro_close_up", "framing.wide_establishing_shot"],
    ["framing.medium_close_up", "framing.wide_establishing_shot"],
    ["framing.extreme_wide_shot", "framing.extreme_close_up"],
    ["angle.low_angle", "angle.high_angle"],
    ["angle.extreme_low_angle", "angle.extreme_high_angle"],
    ["angle.top_down", "angle.low_angle"],
    ["emotion.joy", "emotion.grief"],
    ["emotion.happiness", "emotion.sadness"],
    ["emotion.elation", "emotion.despair"],
    ["emotion.anger", "emotion.serenity"],
    ["emotion.rage", "emotion.contentment"],
    ["emotion.terror", "emotion.relief"],
    ["emotion.fear", "emotion.relief"],
  ];

  /* Scene chips: one pill per option, single-select per category row. */
  const SCENE_CHIPS = {
    framing: [
      ["framing.close_up", "Close-up"],
      ["framing.medium_shot", "Medium"],
      ["framing.wide_shot", "Wide"],
      ["framing.wide_establishing_shot", "Establishing"],
    ],
    angle: [
      ["angle.eye_level", "Eye level"],
      ["angle.low_angle", "Low"],
      ["angle.high_angle", "High"],
      ["angle.top_down", "Top-down"],
    ],
    aperture: [
      ["aperture.f14", "f/1.4"],
      ["aperture.f28", "f/2.8"],
      ["aperture.f4", "f/4"],
      ["aperture.f8", "f/8"],
      ["aperture.f16", "f/16"],
    ],
    lighting_setup: [
      ["lighting_setup.soft_diffused_lighting", "Soft"],
      ["lighting_setup.hard_directional_lighting", "Hard"],
      ["lighting_setup.three_point_lighting", "Three-point"],
      ["lighting_setup.rembrandt_lighting", "Rembrandt"],
    ],
    atmosphere: [
      ["atmosphere.clear_air", "Clear air"],
      ["atmosphere.light_haze", "Light haze"],
      ["atmosphere.dense_haze", "Dense haze"],
      ["atmosphere.mist", "Mist"],
      ["atmosphere.fog", "Fog"],
      ["atmosphere.dense_cinematic_fog", "Dense fog"],
      ["atmosphere.ground_fog", "Ground fog"],
      ["atmosphere.smoke", "Smoke"],
      ["atmosphere.dust", "Dust"],
      ["atmosphere.embers", "Embers"],
      ["atmosphere.ash", "Ash"],
      ["atmosphere.light_rain", "Light rain"],
      ["atmosphere.heavy_rain", "Heavy rain"],
      ["atmosphere.storm", "Storm"],
      ["atmosphere.snowfall", "Snowfall"],
      ["atmosphere.heavy_snowfall", "Heavy snowfall"],
      ["atmosphere.wind", "Wind"],
      ["atmosphere.strong_wind", "Strong wind"],
      ["atmosphere.heat_shimmer", "Heat shimmer"],
      ["atmosphere.humid_atmosphere", "Humid atmosphere"],
    ],
    style: [
      ["style.natural_photographic_realism", "Photorealistic"],
      ["style.cinematic_film_still", "Cinematic"],
      ["style.fashion_editorial", "Editorial"],
      ["style.documentary_photography", "Documentary"],
    ],
  };

  /* Lighting setups that drive the multi-light compass layout. */
  const LIGHT_SETUP_LAYOUTS = {
    "lighting_setup.three_point_lighting": [
      { angle: Math.PI / 4, distance: 0.85 },
      { angle: (3 * Math.PI) / 4, distance: 0.85 },
      { angle: -Math.PI / 2, distance: 0.8 },
    ],
    "lighting_setup.rembrandt_lighting": [
      { angle: Math.PI / 4, distance: 0.85 },
    ],
    "lighting_setup.soft_diffused_lighting": [
      { angle: Math.PI / 2, distance: 0.9 },
    ],
    "lighting_setup.hard_directional_lighting": [
      { angle: Math.PI / 2, distance: 0.8 },
    ],
  };

  const SETTING_PRESETS = [
    ["Game show", "a bright television game-show stage with contestant podiums, LED walls, studio cameras, and a cheering audience"],
    ["Urban apartment — living room", "a contemporary urban apartment living room with city-window views and practical interior lighting"],
    ["Urban apartment — bedroom", "a lived-in urban apartment bedroom with layered personal details and window light"],
    ["Suburban house — kitchen", "a warm suburban family kitchen with an island, cupboards, and natural daylight"],
    ["Suburban house — living room", "a comfortable suburban living room with stairs, family furniture, and soft practical lighting"],
    ["Spaceship bridge", "a professional cinematic spaceship bridge with command stations, panoramic windows, and readable control lighting"],
    ["Space shuttle", "a compact working space-shuttle cabin with strapped seats, panels, and weightless equipment"],
    ["Back alley", "a narrow cinematic back alley with service doors, fire escapes, wet pavement, and motivated practical lights"],
    ["Carnival rides", "a lively night carnival with illuminated rides, midway booths, crowds, and colourful reflected light"],
    ["Laser-tag arena", "a multi-level laser-tag arena with cover, ramps, haze, UV markings, and neon team lighting"],
    ["Airplane cabin", "a realistic passenger airplane cabin with overhead bins, aisle lighting, and window views"],
    ["Train carriage", "a detailed passenger train carriage with paired seats, aisle, luggage racks, and moving exterior scenery"],
    ["Car interior", "a cinematic car interior with dashboard detail, believable seating, and exterior road context"],
    ["Van interior", "a practical passenger van interior with sliding door, bench seating, and equipment storage"],
    ["Bus interior", "a realistic city bus interior with handrails, rows of seats, windows, and route lighting"],
    ["Medieval castle", "a lived-in medieval stone castle with a great hall, banners, torches, and period furnishings"],
    ["School classroom", "a contemporary school classroom with desks, whiteboard, learning materials, and daylight"],
    ["Desert", "a vast cinematic desert with layered dunes, heat haze, wind-shaped sand, and distant terrain"],
    ["Concert stage", "a performer on a large stage before a dense crowd with professional concert lighting and atmospheric haze"],
    ["Film studio soundstage", "a professional film soundstage with practical set walls, rigging, flags, cables, and crew-ready space"],
    ["Hospital corridor", "a clean modern hospital corridor with patient rooms, equipment bays, and clinical practical lighting"],
    ["Luxury hotel lobby", "a spacious luxury hotel lobby with concierge desk, lounge seating, architectural lighting, and guests"],
    ["Rooftop at sunset", "a high city rooftop at sunset with safety rails, vents, layered skyline silhouettes, and warm edge light"],
    ["Rainy downtown street", "a rain-soaked downtown street at night with traffic, storefront reflections, umbrellas, and glowing signs"],
    ["Small-town main street", "a welcoming small-town main street with local shops, parked cars, trees, and everyday pedestrian life"],
    ["Busy subway platform", "a crowded underground subway platform with tiled walls, signage, arriving trains, and practical fluorescent light"],
    ["Grand central station", "a monumental railway concourse with a vaulted ceiling, departure boards, streams of travellers, and shafts of daylight"],
    ["Cozy coffee shop", "an intimate independent coffee shop with wood tables, pastry counter, warm lamps, plants, and street-facing windows"],
    ["Fine-dining restaurant", "an elegant fine-dining restaurant with dressed tables, sculptural lighting, attentive service, and refined architectural detail"],
    ["Rundown diner", "a weathered roadside diner with vinyl booths, chrome trim, a glowing jukebox, and late-night fluorescent ambience"],
    ["Grocery store aisle", "a realistic grocery-store aisle with fully stocked shelves, product variety, shopping carts, and even retail lighting"],
    ["Shopping mall atrium", "a large multi-level shopping mall atrium with escalators, storefronts, skylights, plants, and circulating crowds"],
    ["Modern office", "a contemporary open-plan office with desks, meeting rooms, monitors, acoustic panels, and broad window light"],
    ["Corporate boardroom", "a formal corporate boardroom with a long table, presentation wall, city views, and restrained professional lighting"],
    ["Artist studio", "a working artist studio with canvases, paints, tools, drop cloths, reference objects, and directional north light"],
    ["Photography studio", "a professional photography studio with seamless paper, strobes, softboxes, flags, stands, and a tethered workstation"],
    ["Music recording studio", "a professional recording studio with acoustic treatment, mixing console, microphones, instruments, and moody task lighting"],
    ["Backstage dressing room", "a busy backstage dressing room with mirror bulbs, costumes, makeup stations, garment racks, and production clutter"],
    ["Boxing gym", "a gritty working boxing gym with a ring, heavy bags, worn mats, lockers, and high industrial windows"],
    ["Basketball court", "a regulation indoor basketball court with polished wood, bleachers, scoreboards, and bright arena lighting"],
    ["Olympic swimming pool", "a competition swimming venue with marked lanes, starting blocks, spectator seating, and reflective aquatic light"],
    ["Forest clearing", "a secluded forest clearing surrounded by layered trees, moss, ferns, fallen branches, and broken natural light"],
    ["Mountain overlook", "a dramatic mountain overlook with rocky foreground, deep valleys, distant peaks, and changing alpine weather"],
    ["Tropical beach", "a broad tropical beach with pale sand, clear water, palms, scattered rocks, and humid coastal light"],
    ["Rocky coastline", "a rugged ocean coastline with dark rocks, breaking surf, sea spray, cliffs, and windswept vegetation"],
    ["Frozen lake", "a vast frozen lake with textured ice, snow drifts, distant forest, and crisp low winter sunlight"],
    ["Autumn park", "a mature city park in autumn with winding paths, benches, fallen leaves, and warm filtered daylight"],
    ["Wildflower meadow", "an open wildflower meadow with tall grasses, varied blooms, distant hills, and a gentle moving breeze"],
    ["Ancient temple", "a monumental ancient temple with carved stone, weathered columns, ritual objects, and shafts of dusty light"],
    ["Fantasy throne room", "an immense fantasy throne room with a raised dais, banners, ceremonial guards, towering windows, and dramatic torchlight"],
    ["Wizard workshop", "a dense wizard workshop with books, alchemical glassware, maps, strange instruments, and layered magical practical light"],
    ["Medieval village market", "a lively medieval village market with timber stalls, canvas awnings, baskets, animals, townspeople, and muddy lanes"],
    ["Pirate ship deck", "the working deck of a wooden sailing ship with rigging, cannon, weathered planks, ocean horizon, and wind-filled sails"],
    ["Underwater research lab", "a pressurized underwater research station with reinforced windows, instrument panels, divers, and deep-ocean views"],
    ["Mars habitat", "a practical Mars surface habitat with airlocks, equipment racks, pressure suits, red terrain views, and filtered utility light"],
    ["Orbital space station", "a modular orbital station interior with handrails, floating equipment, observation windows, and Earth visible below"],
    ["Cyberpunk night market", "a dense futuristic night market with food stalls, tangled signage, steam, crowds, cables, and wet neon reflections"],
    ["Post-apocalyptic highway", "an abandoned overgrown highway with damaged vehicles, cracked asphalt, improvised shelters, and a vast unsettled sky"],
    ["Secret laboratory", "a high-security research laboratory with glass partitions, experimental machinery, containment equipment, and precise cold lighting"],
    ["Museum gallery", "a quiet contemporary museum gallery with large artworks, polished floors, benches, visitors, and controlled exhibition lighting"],
    ["Public library", "a spacious public library with long shelving, reading tables, study lamps, windows, and a calm lived-in atmosphere"],
    ["University lecture hall", "a tiered university lecture hall with desks, projection screens, teaching podium, students, and practical ceiling light"],
    ["Courtroom", "a formal courtroom with judge's bench, witness stand, counsel tables, gallery seating, and dignified institutional detail"],
    ["Airport terminal", "a busy international airport terminal with gates, flight displays, luggage, travellers, and broad glass curtain walls"],
    ["Greenhouse", "a humid working greenhouse with glass walls, dense plant benches, irrigation lines, condensation, and luminous diffused light"],
    ["Abandoned factory", "a vast abandoned factory with rusted machinery, broken windows, debris, graffiti, and dramatic shafts of daylight"],
    ["Construction site", "an active urban construction site with scaffolding, cranes, materials, safety barriers, workers, and dusty daylight"],
    ["Fire station", "a working fire station apparatus bay with engines, turnout gear, lockers, tools, and open street-facing doors"],
    ["Farmhouse barn", "a weathered working barn with timber beams, hay, tools, animals, open doors, and warm rural daylight"],
    ["Underground bunker", "a reinforced underground bunker with concrete corridors, heavy doors, utility pipes, supplies, and stark emergency lighting"],
  ];

  const CHARACTER_PRESETS = [
    { label: "Cinematic heroine", character: { sex: "female", age: "young adult", identity: "A poised cinematic lead with assured presence", ensemble: "evening gown", hair_style: "wavy", hair_length: "long", hair_color: "dark brown", makeup: "soft glam makeup", eyes: "almond-shaped eyes", face_shape: "oval face", body_type: "athletic build", fitness: "fit", proportions: "natural proportions" } },
    { label: "Action hero", character: { sex: "male", age: "adult", identity: "A battle-tested protector who remains calm under pressure", ensemble: "bomber jacket and jeans", hair_style: "messy layered", hair_length: "short", hair_color: "dark brown", makeup: "no makeup", eyes: "deep-set eyes", face_shape: "square face", body_type: "muscular build", fitness: "powerful physique", proportions: "broad shoulders" } },
    { label: "Sci-fi commander", character: { sex: "female", age: "adult", identity: "A decisive starship commander with a disciplined bearing", ensemble: "sci-fi crew uniform", hair_style: "undercut", hair_length: "short", hair_color: "silver", makeup: "natural makeup", eyes: "grey eyes", face_shape: "diamond-shaped face", body_type: "athletic build", fitness: "highly athletic", proportions: "tall proportions" } },
    { label: "Veteran pilot", character: { sex: "male", age: "middle aged", identity: "A veteran shuttle pilot with a weathered face and quick instincts", ensemble: "sci-fi flight suit", hair_style: "messy layered", hair_length: "short", hair_color: "dark brown", makeup: "no makeup", eyes: "brown eyes", nose: "aquiline nose", chin: "cleft chin", face_shape: "long face", body_type: "average build", fitness: "fit", proportions: "natural proportions" } },
    { label: "Noir detective", character: { sex: "male", age: "middle aged", identity: "A private detective who notices every detail", ensemble: "noir trench coat and fedora", hair_style: "straight", hair_length: "short", hair_color: "black", makeup: "no makeup", eyes: "deep-set eyes", nose: "straight nose", mouth: "thin lips", face_shape: "square face", body_type: "average build", fitness: "lightly toned", proportions: "natural proportions" } },
    { label: "Fantasy ranger", character: { sex: "unspecified", age: "young adult", identity: "A quiet woodland ranger and expert tracker", ensemble: "fantasy ranger leathers", hair_style: "braided", hair_length: "shoulder-length", hair_color: "auburn", makeup: "no makeup", eyes: "green eyes", face_shape: "heart-shaped face", body_type: "slim build", fitness: "highly athletic", proportions: "long legs" } },
    { label: "Royal mage", character: { sex: "unspecified", age: "middle aged", identity: "A learned royal mage with an elegant, otherworldly presence", ensemble: "royal mage robes", hair_style: "wavy", hair_length: "waist-length", hair_color: "platinum blonde", makeup: "editorial makeup", eyes: "bright blue eyes", nose: "straight nose", mouth: "defined cupid's bow", chin: "pointed chin", face_shape: "oval face", body_type: "slim build", fitness: "soft physique", proportions: "tall proportions" } },
    { label: "Cyberpunk hacker", character: { sex: "unspecified", age: "young adult", identity: "A brilliant underground hacker with restless energy", ensemble: "cyberpunk streetwear", hair_style: "undercut", hair_length: "chin-length", hair_color: "blue", makeup: "gothic makeup", eyes: "large round eyes", face_shape: "diamond-shaped face", body_type: "slim build", fitness: "lightly toned", proportions: "petite proportions" } },
    { label: "Cheerful student", character: { sex: "female", age: "young adult", identity: "An outgoing university student with an infectious laugh", clothing_top: "knit sweater", clothing_bottom: "straight-leg jeans", hair_style: "ponytail", hair_length: "shoulder-length", hair_color: "auburn", makeup: "natural makeup", eyes: "large round eyes", nose: "button nose", mouth: "wide mouth", chin: "rounded chin", face_shape: "round face", body_type: "average build", fitness: "lightly toned", proportions: "natural proportions" } },
    { label: "Elegant elder", character: { sex: "female", age: "elderly", identity: "An elegant older mentor with warmth, wisdom, and authority", ensemble: "business suit", hair_style: "wavy", hair_length: "chin-length", hair_color: "silver", makeup: "natural makeup", eyes: "hooded eyes", nose: "aquiline nose", mouth: "thin lips", chin: "strong chin", face_shape: "long face", body_type: "average build", fitness: "soft physique", proportions: "natural proportions" } },
  ];

  function createWizardWidget(node) {
    const valueWidget = (node.widgets || []).find(function (w) { return w.name === "wizard_state_json"; });
    if (!valueWidget) {
      console.warn("[Krea2PromptWizard] No wizard_state_json widget found");
      return null;
    }
    valueWidget.hidden = true;
    valueWidget.type = "hidden";
    valueWidget.computeSize = function () { return [0, -4]; };
    const stateString = valueWidget.value || "";
    const parsedInit = parseState(stateString);
    const freshNode = !parsedInit || Object.keys(parsedInit).length === 0;
    let state = coerceState(parsedInit);
    if (!Array.isArray(state.rows)) state.rows = [];

    const library = [];
    if (freshNode && !state.characters.length) {      // v2: a brand-new node shows one expanded character card with the
      // seeded concept rows so the layout is obvious without clicking.
      // Seeding happens here, after `library` exists (seed rows are looked
      // up from it).
      const starter = newCharacter();
      seedCharacterConcepts(starter);
      state.characters.push(starter);
      state.selected_character_id = starter.id;
    }
    let savedPresets = [];
    let masterPresets = [];
    let loras = [];
    let conflictList = [];
    let conflictPairsCache = null;
    let dirty = false;
    let undoStack = [];
    let redoStack = [];
    let persistedState = JSON.stringify(state);
    let latestPreview = null;
    let previewSequence = 0;
    let previousExpanded = null;
    let contractNextSync = false;

    const root = el("div", { class: "krea2-wizard-root" });
    const executionHistory = [];
    root.krea2ExecutionHistory = executionHistory;
    root.dataset.krea2ExecutionCount = "0";
    root.dataset.krea2ExecutionHistory = "[]";

    function recordExecution(prompt) {
      if (typeof prompt !== "string" || !prompt.trim()) return;
      executionHistory.push(prompt);
      if (executionHistory.length > 100) executionHistory.splice(0, executionHistory.length - 100);
      root.dataset.krea2ExecutionCount = String(executionHistory.length);
      root.dataset.krea2ExecutionHistory = JSON.stringify(executionHistory);
      root.dataset.krea2LastOutput = prompt;
      refreshExecutionHistoryControl();
    }

    function refreshExecutionHistoryControl() {
      if (!livePreview || !livePreview.historySelect) return;
      const select = livePreview.historySelect;
      select.innerHTML = "";
      select.appendChild(el("option", { value: "" }, executionHistory.length
        ? executionHistory.length + " generated prompt" + (executionHistory.length === 1 ? "" : "s")
        : "No generated prompts yet"));
      for (let index = executionHistory.length - 1; index >= 0; index -= 1) {
        const number = index + 1;
        const excerpt = executionHistory[index].slice(0, 72).replace(/\s+/g, " ");
        select.appendChild(el("option", { value: String(index) }, "Job " + number + " · " + excerpt));
      }
      if (executionHistory.length) select.value = String(executionHistory.length - 1);
    }

    /* --- Top section: base prompt, mode, library button --- */
    const basePromptControl = buildBasePrompt();
    const livePreview = buildLivePreview();
    const showWorkToggle = buildShowWorkToggle(state);
    const libraryBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: openLibrary }, "Library");
    const randomAllBtn = diceButton(
      "Randomize all concept groups",
      randomizeAll,
      "krea2-wizard-btn krea2-wizard-random-all krea2-icon-btn",
    );
    const settingsBtn = el("button", {
      type: "button",
      class: "krea2-wizard-btn krea2-icon-btn",
      title: "Node settings",
      "aria-label": "Node settings",
      onClick: function () {
        state.settings_open = !state.settings_open;
        markDirty();
        renderNodeSettings();
      },
    }, icon("sliders", { width: "14", height: "14" }));
    const materializeBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: materialize }, "Materialize");
    const subgraphBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: createSubgraph }, "Create Subgraph");
    const undoBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: undo, title: "Undo the last change" }, "Undo");
    const redoBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: redo, title: "Redo the last undone change" }, "Redo");
    const resetBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: resetAll }, "Reset All");
    const savedPresetControl = buildSavedPresetControl();
    const creativeModeControl = buildCreativeModeControl();
    const masterPresetSelect = buildMasterPresetControl();

    const topBar = el("div", { class: "krea2-wizard-top" }, [
      el("span", {
        class: "krea2-wizard-version",
        title: "Krea2 Prompt Wizard build " + WIZARD_VERSION,
        "aria-label": "Wizard build " + WIZARD_VERSION,
      }, WIZARD_VERSION),
      savedPresetControl.root,
      el("span", { class: "krea2-structured-spacer" }),
      undoBtn,
      redoBtn,
      resetBtn,
      buildOverflowMenu(),
    ]);

    function buildOverflowMenu() {
      const wrap = el("div", { class: "krea2-wizard-overflow" });
      const moreBtn = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn",
        title: "More options",
        "aria-label": "More options",
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          const open = menu.classList.toggle("is-open");
          document.addEventListener("mousedown", closeOnOutside, { once: true });
          function closeOnOutside(event) {
            if (!wrap.contains(event.target)) menu.classList.remove("is-open");
          }
          if (!open) document.removeEventListener("mousedown", closeOnOutside, { once: true });
        },
      }, "···");
      const menu = el("div", { class: "krea2-wizard-overflow-menu" }, [
        el("button", { type: "button", class: "krea2-wizard-btn", onClick: function () {
          menu.classList.remove("is-open"); openLibrary();
        } }, "Library"),
        el("button", { type: "button", class: "krea2-wizard-btn", onClick: function () {
          menu.classList.remove("is-open"); randomizeAll();
        } }, "Randomize all"),
        el("button", { type: "button", class: "krea2-wizard-btn", onClick: function () {
          menu.classList.remove("is-open");
          state.settings_open = !state.settings_open;
          markDirty();
          renderNodeSettings();
        } }, "Node settings"),
        el("button", { type: "button", class: "krea2-wizard-btn", onClick: function () {
          menu.classList.remove("is-open"); materialize();
        } }, "Materialize"),
        el("button", { type: "button", class: "krea2-wizard-btn", onClick: function () {
          menu.classList.remove("is-open"); createSubgraph();
        } }, "Create Subgraph"),
      ]);
      wrap.appendChild(moreBtn);
      wrap.appendChild(menu);
      return wrap;
    }

    function handleColorChange(presetId, newColor) {
      state.concept_colors = state.concept_colors || {};
      if (newColor) state.concept_colors[presetId] = newColor;
      else delete state.concept_colors[presetId];
      markDirty();
      render();
    }

    /* --- Searchable add concept --- */
    const addConcept = el("button", {
      type: "button",
      class: "krea2-wizard-btn krea2-wizard-add",
      onClick: function () {
        showSearchableSelector({
          presets: compatibleLibrary(),
          multiSelect: true,
          selectedIds: state.rows.map(function (row) { return row.preset_id; }),
          onToggle: togglePreset,
          onClose: function () { render(); },
          getConceptColor: function (presetId) { return (state.concept_colors || {})[presetId] || ""; },
          onColorChange: function (presetId, newColor) {
            state.concept_colors = state.concept_colors || {};
            if (newColor) state.concept_colors[presetId] = newColor;
            else delete state.concept_colors[presetId];
            markDirty();
          },
        });
      },
    }, "+ Add Concept");

    /* --- Layout: mode tabs with per-tab hosts --- */
    const tabBar = el("div", { class: "krea2-wizard-tabs", role: "tablist" });
    const castHost = el("div", { class: "krea2-tab-host krea2-cast-tab" });
    const sceneHost = el("div", { class: "krea2-tab-host krea2-scene-tab" });
    const conceptsHost = el("div", { class: "krea2-tab-host krea2-concepts-tab" });
    const promptHost = el("div", { class: "krea2-tab-host krea2-prompt-tab" });
    const settingsHost = el("div", { class: "krea2-settings-host" });
    const structuredHost = el("div", { class: "krea2-structured-host" });
    const categoryBody = el("div", { class: "krea2-wizard-categories" });
    const showWork = el("div", { class: "krea2-wizard-show-work-host" });
    const footerHost = el("div", { class: "krea2-wizard-footer" });

    const editorBody = el("div", { class: "krea2-wizard-editor" }, [
      tabBar,
      settingsHost,
      castHost,
      sceneHost,
      conceptsHost,
      promptHost,
    ]);

    function renderTabBar() {
      tabBar.innerHTML = "";
      const tabs = TABS.slice();
      if (false && state.show_concepts_tab) tabs.push(CONCEPTS_TAB);
      if (!tabs.some(function (tab) { return tab[0] === (state.active_tab || "cast"); })) {
        state.active_tab = tabs[0][0];
      }
      for (const tab of tabs) {
        const active = (state.active_tab || "cast") === tab[0];
        tabBar.appendChild(el("button", {
          type: "button",
          class: "krea2-wizard-tab krea2-v2-tab" + (active ? " is-active" : ""),
          role: "tab",
          "aria-selected": active ? "true" : "false",
          onClick: function () {
            if (state.active_tab === tab[0]) return;
            state.active_tab = tab[0];
            persist();
            render();
          },
        }, [
          icon(tab[2], { width: "13", height: "13" }),
          el("span", null, tab[1]),
        ]));
      }
    }

    root.appendChild(topBar);
    root.appendChild(editorBody);
    root.appendChild(footerHost);

    /* The backend supplies the built-in category presets together with the
     * user's saved presets. Keeping one source prevents stale browser-only
     * IDs from silently loading empty cards. */
    /*
      // ── Subject & Expression ──
      {"id":"fb_sub_1","label":"Cinematic Portrait","scope":"group","group":"subject_expression","base_prompt":"","rows":[{"id":"x1","category":"body","preset_id":"body.shoulders_pulled_back","intensity":60},{"id":"x2","category":"emotion","preset_id":"emotion.confident","intensity":65},{"id":"x3","category":"gaze","preset_id":"gaze.looking_directly_into_the_camera","intensity":70}]},
      {"id":"fb_sub_2","label":"Joyful Laughter","scope":"group","group":"subject_expression","base_prompt":"","rows":[{"id":"x1","category":"emotion","preset_id":"emotion.joy","intensity":80},{"id":"x2","category":"mouth","preset_id":"mouth.laughing","intensity":75},{"id":"x3","category":"face","preset_id":"face.cheek_raiser","intensity":70}]},
      {"id":"fb_sub_3","label":"Anger","scope":"group","group":"subject_expression","base_prompt":"","rows":[{"id":"x1","category":"emotion","preset_id":"emotion.anger","intensity":85},{"id":"x2","category":"face","preset_id":"face.upper_lip_raiser","intensity":75},{"id":"x3","category":"gaze","preset_id":"gaze.staring_intently","intensity":75}]},
      {"id":"fb_sub_4","label":"Sadness","scope":"group","group":"subject_expression","base_prompt":"","rows":[{"id":"x1","category":"emotion","preset_id":"emotion.sadness","intensity":70},{"id":"x2","category":"gaze","preset_id":"gaze.looking_down","intensity":65},{"id":"x3","category":"face","preset_id":"face.eyebrow_raiser_inner","intensity":60}]},
      {"id":"fb_sub_5","label":"Suspenseful Stare","scope":"group","group":"subject_expression","base_prompt":"","rows":[{"id":"x1","category":"gaze","preset_id":"gaze.wide_open_eyes","intensity":75},{"id":"x2","category":"emotion","preset_id":"emotion.surprise","intensity":70},{"id":"x3","category":"body","preset_id":"body.stiff_rigid_stance","intensity":60}]},
      {"id":"fb_sub_6","label":"Contemplative","scope":"group","group":"subject_expression","base_prompt":"","rows":[{"id":"x1","category":"emotion","preset_id":"emotion.contemplative","intensity":65},{"id":"x2","category":"gaze","preset_id":"gaze.looking_away_thoughtful","intensity":60},{"id":"x3","category":"body","preset_id":"body.relaxed_pose","intensity":50}]},
      // ── Camera & Film ──
      {"id":"fb_cam_1","label":"Cinematic Close-up","scope":"group","group":"camera_film","base_prompt":"","rows":[{"id":"x1","category":"framing","preset_id":"framing.close_up","intensity":70},{"id":"x2","category":"lens","preset_id":"lens.85mm_portrait","intensity":60},{"id":"x3","category":"aperture","preset_id":"aperture.shallow_depth_of_field","intensity":75}]},
      {"id":"fb_cam_2","label":"Wide Epic Landscape","scope":"group","group":"camera_film","base_prompt":"","rows":[{"id":"x1","category":"framing","preset_id":"framing.wide_establishing_shot","intensity":80},{"id":"x2","category":"lens","preset_id":"lens.14mm_ultrawide","intensity":65},{"id":"x3","category":"aperture","preset_id":"aperture.deep_focus","intensity":70}]},
      {"id":"fb_cam_3","label":"Dutch Angle Thriller","scope":"group","group":"camera_film","base_prompt":"","rows":[{"id":"x1","category":"angle","preset_id":"angle.dutch_angle","intensity":75},{"id":"x2","category":"framing","preset_id":"framing.extreme_close_up","intensity":70},{"id":"x3","category":"composition","preset_id":"composition.diagonal_composition","intensity":65}]},
      {"id":"fb_cam_4","label":"Handheld Docudrama","scope":"group","group":"camera_film","base_prompt":"","rows":[{"id":"x1","category":"camera_movement","preset_id":"camera_movement.handheld_camera","intensity":75},{"id":"x2","category":"framing","preset_id":"framing.medium_shot","intensity":60},{"id":"x3","category":"perspective","preset_id":"perspective.eye_level","intensity":50}]},
      {"id":"fb_cam_5","label":"Aerial Drone Shot","scope":"group","group":"camera_film","base_prompt":"","rows":[{"id":"x1","category":"perspective","preset_id":"perspective.birds_eye_view","intensity":80},{"id":"x2","category":"camera_movement","preset_id":"camera_movement.crane_shot","intensity":65},{"id":"x3","category":"lens","preset_id":"lens.50mm_standard","intensity":50}]},
      {"id":"fb_cam_6","label":"Golden Hour Cinematic","scope":"group","group":"camera_film","base_prompt":"","rows":[{"id":"x1","category":"framing","preset_id":"framing.medium_shot","intensity":65},{"id":"x2","category":"lens","preset_id":"lens.35mm_wide","intensity":60},{"id":"x3","category":"film_color","preset_id":"film_color.kodak_vision3_250d","intensity":55}]},
      // ── Lighting ──
      {"id":"fb_lit_1","label":"Rembrandt Classic","scope":"group","group":"lighting","base_prompt":"","rows":[{"id":"x1","category":"lighting_setup","preset_id":"lighting_setup.rembrandt_lighting","intensity":70},{"id":"x2","category":"lighting_direction","preset_id":"lighting_direction.rim_lighting","intensity":60}]},
      {"id":"fb_lit_2","label":"Backlit Dramatic","scope":"group","group":"lighting","base_prompt":"","rows":[{"id":"x1","category":"lighting_direction","preset_id":"lighting_direction.backlighting","intensity":80},{"id":"x2","category":"lighting_effect","preset_id":"lighting_effect.lens_flare","intensity":60}]},
      {"id":"fb_lit_3","label":"Noir Chiaroscuro","scope":"group","group":"lighting","base_prompt":"","rows":[{"id":"x1","category":"lighting_setup","preset_id":"lighting_setup.low_key_lighting","intensity":85},{"id":"x2","category":"lighting_direction","preset_id":"lighting_direction.side_lighting","intensity":75}]},
      {"id":"fb_lit_4","label":"Soft Beauty Light","scope":"group","group":"lighting","base_prompt":"","rows":[{"id":"x1","category":"lighting_setup","preset_id":"lighting_setup.soft_diffused_lighting","intensity":80},{"id":"x2","category":"lighting_direction","preset_id":"lighting_direction.front_lighting","intensity":55}]},
      {"id":"fb_lit_5","label":"Neon Cyberpunk","scope":"group","group":"lighting","base_prompt":"","rows":[{"id":"x1","category":"lighting_effect","preset_id":"lighting_effect.neon_glow","intensity":80},{"id":"x2","category":"lighting_direction","preset_id":"lighting_direction.colored_gels","intensity":70}]},
      {"id":"fb_lit_6","label":"Golden Hour Warmth","scope":"group","group":"lighting","base_prompt":"","rows":[{"id":"x1","category":"lighting_setup","preset_id":"lighting_setup.golden_hour_lighting","intensity":80},{"id":"x2","category":"lighting_direction","preset_id":"lighting_direction.backlighting","intensity":60}]},
      // ── Environment ──
      {"id":"fb_env_1","label":"Golden Hour","scope":"group","group":"environment","base_prompt":"","rows":[{"id":"x1","category":"atmosphere","preset_id":"atmosphere.light_haze","intensity":60},{"id":"x2","category":"lighting_setup","preset_id":"lighting_setup.golden_hour_lighting","intensity":75}]},
      {"id":"fb_env_2","label":"Stormy Sky","scope":"group","group":"environment","base_prompt":"","rows":[{"id":"x1","category":"atmosphere","preset_id":"atmosphere.heavy_storm","intensity":80},{"id":"x2","category":"environment_movement","preset_id":"environment_movement.leaves_blowing_in_wind","intensity":65}]},
      {"id":"fb_env_3","label":"Foggy Mysterious","scope":"group","group":"environment","base_prompt":"","rows":[{"id":"x1","category":"atmosphere","preset_id":"atmosphere.dense_fog","intensity":75},{"id":"x2","category":"environment_movement","preset_id":"environment_movement.smoke_drifting","intensity":50}]},
      {"id":"fb_env_4","label":"Rainy Neon Streets","scope":"group","group":"environment","base_prompt":"","rows":[{"id":"x1","category":"atmosphere","preset_id":"atmosphere.heavy_rain","intensity":75},{"id":"x2","category":"environment_movement","preset_id":"environment_movement.rain_sweeping_across","intensity":60}]},
      // ── Style & Finish ──
      {"id":"fb_sty_1","label":"Fashion Editorial","scope":"group","group":"style_finish","base_prompt":"","rows":[{"id":"x1","category":"style","preset_id":"style.fashion_editorial","intensity":70},{"id":"x2","category":"texture","preset_id":"texture.smooth_clean_digital_texture","intensity":55}]},
      {"id":"fb_sty_2","label":"Cinematic Film","scope":"group","group":"style_finish","base_prompt":"","rows":[{"id":"x1","category":"style","preset_id":"style.cinematic","intensity":75},{"id":"x2","category":"texture","preset_id":"texture.heavy_film_grain","intensity":60}]},
      {"id":"fb_sty_3","label":"Oil Painting","scope":"group","group":"style_finish","base_prompt":"","rows":[{"id":"x1","category":"style","preset_id":"style.oil_painting","intensity":75},{"id":"x2","category":"texture","preset_id":"texture.thick_impasto_paint","intensity":70}]},
      {"id":"fb_sty_4","label":"Vintage Analogue","scope":"group","group":"style_finish","base_prompt":"","rows":[{"id":"x1","category":"style","preset_id":"style.vintage_photograph","intensity":70},{"id":"x2","category":"texture","preset_id":"texture.dust_scratches","intensity":45}]},
    ];
    */

    fetchSavedPresets().then(function (presets) {
      savedPresets = Array.isArray(presets) ? presets : [];
      refreshSavedPresetSelect();
      render();
    });

    function setState(newState) {
      state = coerceState(newState);
      if (!Array.isArray(state.rows)) state.rows = [];
      persistedState = JSON.stringify(state);
      persist();
      render();
    }

    function parseState(text) {
      try { return JSON.parse(text); } catch (e) { return null; }
    }

    function persist() {
      try {
        valueWidget.value = JSON.stringify(state);
        if (node.setDirtyCanvas) node.setDirtyCanvas(true);
      } catch (e) {
        console.warn("[Krea2PromptWizard] failed to persist state", e);
      }
    }

    function markDirty() {
      const currentState = JSON.stringify(state);
      if (currentState === persistedState) return;
      undoStack.push(persistedState);
      if (undoStack.length > 50) undoStack.shift();
      redoStack = [];
      dirty = true;
      persistedState = currentState;
      persist();
      updateHistoryControls();
      renderLivePreview(true);
    }

    function cloneJson(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function diceButton(label, onClick, className) {
      return el("button", {
        type: "button",
        class: className || "krea2-wizard-btn krea2-icon-btn",
        title: label,
        "aria-label": label,
        onClick: onClick,
      }, icon("dice", { width: "14", height: "14" }));
    }

    function randomStrengthValue() {
      const minimum = Math.max(-3, Math.min(3, Number(state.random_strength_min) || 0));
      const maximum = Math.max(minimum, Math.min(3, Number(state.random_strength_max) || 0));
      const steps = Math.round((maximum - minimum) * 4);
      return Math.round((minimum + Math.floor(Math.random() * (steps + 1)) / 4) * 4) / 4;
    }

    function renderNodeSettings() {
      settingsHost.innerHTML = "";
      if (!state.settings_open) return;
      const panel = el("section", { class: "krea2-node-settings" });
      const close = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn",
        title: "Close settings",
        "aria-label": "Close settings",
        onClick: function () { state.settings_open = false; markDirty(); renderNodeSettings(); },
      }, icon("close", { width: "12", height: "12" }));
      panel.appendChild(el("div", { class: "krea2-structured-heading" }, [
        el("strong", null, "Randomization & output"),
        el("span", { class: "krea2-structured-spacer" }),
        close,
      ]));

      const profiles = el("div", { class: "krea2-random-profile-row" });
      [
        ["Gentle", 0, 1.5],
        ["Positive", 0, 3],
        ["Wild", -3, 3],
      ].forEach(function (profile) {
        const active = Number(state.random_strength_min) === profile[1]
          && Number(state.random_strength_max) === profile[2];
        profiles.appendChild(el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-random-profile" + (active ? " is-active" : ""),
          onClick: function () {
            state.random_strength_min = profile[1];
            state.random_strength_max = profile[2];
            markDirty();
            renderNodeSettings();
          },
        }, profile[0] + " " + profile[1] + " to +" + profile[2]));
      });

      function strengthSelect(label, key) {
        const select = el("select", {
          class: "krea2-compact-select",
          "aria-label": label,
          onChange: function (event) {
            state[key] = Number(event.target.value);
            if (state.random_strength_min > state.random_strength_max) {
              if (key === "random_strength_min") state.random_strength_max = state.random_strength_min;
              else state.random_strength_min = state.random_strength_max;
            }
            markDirty();
            renderNodeSettings();
          },
        });
        for (let value = -3; value <= 3.001; value += 0.25) {
          const rounded = Math.round(value * 4) / 4;
          select.appendChild(el("option", { value: String(rounded) }, (rounded > 0 ? "+" : "") + rounded));
        }
        select.value = String(state[key]);
        return el("label", { class: "krea2-settings-field" }, [el("span", null, label), select]);
      }

      panel.appendChild(el("div", { class: "krea2-settings-copy" },
        "Strengths for every dice action and every-job concept randomization."));
      panel.appendChild(profiles);
      panel.appendChild(el("div", { class: "krea2-settings-range" }, [
        strengthSelect("Minimum strength", "random_strength_min"),
        strengthSelect("Maximum strength", "random_strength_max"),
      ]));
      panel.appendChild(el("label", { class: "krea2-inline-check krea2-metadata-toggle" }, [
        el("input", {
          type: "checkbox",
          checked: state.embed_prompt_metadata !== false,
          onChange: function (event) { state.embed_prompt_metadata = !!event.target.checked; markDirty(); },
        }),
        el("span", null, "Embed the exact generated prompt in image metadata"),
      ]));
      panel.appendChild(el("div", { class: "krea2-settings-copy" },
        "Connect Prompt Output to the text encoder used by the image. The normal Save Image node will then store the resolved text as krea2_prompt when metadata is enabled in ComfyUI."));
      panel.appendChild(el("label", { class: "krea2-inline-check", title: "Readers such as the Timesaver Artius Browser and A1111-style viewers show a plain-text 'prompt' metadata chunk as the Positive Prompt" }, [
        el("input", {
          type: "checkbox",
          checked: !!state.prompt_metadata_override,
          onChange: function (event) {
            state.prompt_metadata_override = !!event.target.checked;
            markDirty();
            render();
          },
        }),
        el("span", null, "Write the prompt as the standard 'prompt' metadata chunk (Timesaver / A1111 compatible)"),
      ]));
      panel.appendChild(el("label", { class: "krea2-inline-check", title: "Grouped concept cards instead of plain prompt code in the Final Prompt Preview" }, [
        el("input", {
          type: "checkbox",
          checked: !!state.pretty_preview,
          onChange: function (event) {
            state.pretty_preview = !!event.target.checked;
            markDirty();
            render();
          },
        }),
        el("span", null, "Pretty Prompt Preview (grouped concept cards)"),
      ]));
      panel.appendChild(el("div", { class: "krea2-settings-field" }, [
        el("span", null, "Character Creator"),
        (function () {
          const select = el("select", {
            class: "krea2-compact-select",
            "aria-label": "Character Creator mode",
            onChange: function (event) {
              state.character_creator = event.target.value;
              markDirty();
              render();
            },
          });
          select.appendChild(el("option", { value: "legacy" }, "Legacy Character Creator"));
          select.appendChild(el("option", { value: "visual" }, "Visual Character Creator"));
          select.value = state.character_creator || "legacy";
          return select;
        })(),
      ]));
      panel.appendChild(el("label", { class: "krea2-inline-check" }, [
        el("input", {
          type: "checkbox",
          checked: !!state.show_concepts_tab,
          onChange: function (event) {
            state.show_concepts_tab = !!event.target.checked;
            markDirty();
            render();
          },
        }),
        el("span", null, "Show the advanced Concepts tab"),
      ]));
      panel.appendChild(el("label", { class: "krea2-inline-check" }, [
        el("input", {
          type: "checkbox",
          checked: !!state.show_face_guidance,
          onChange: function (event) {
            state.show_face_guidance = !!event.target.checked;
            markDirty();
            render();
          },
        }),
        el("span", null, "Show face guidance trigger fields on cast members"),
      ]));
      panel.appendChild(el("label", { class: "krea2-inline-check" }, [
        el("input", {
          type: "checkbox",
          checked: !!state.show_motion_prompt,
          onChange: function (event) {
            state.show_motion_prompt = !!event.target.checked;
            markDirty();
            render();
          },
        }),
        el("span", null, "Show the video motion prompt section (LTX-2.3)"),
      ]));
      settingsHost.appendChild(panel);
    }

    function newCharacter() {
      const id = "character_" + Date.now().toString(36) + "_" + Math.random().toString(16).slice(2, 7);
      return {
        id: id,
        name: "Character " + ((state.characters || []).length + 1),
        enabled: true,
        // v2 redesign: cast cards start expanded so the four appearance
        // dropdowns, identity chips and concept rows are visible at once.
        expanded: true,
        identity: "",
        sex: "",
        age: "",
        ethnicity: "",
        subject: "",
        expression: "",
        clothing: "",
        ensemble: "",
        clothing_top: "",
        clothing_bottom: "",
        hair_style: "",
        hair_length: "",
        hair_color: "",
        makeup: "",
        eyes: "",
        nose: "",
        mouth: "",
        chin: "",
        face_shape: "",
        body_type: "",
        fitness: "",
        proportions: "",
        adult_description: "",
        character_ref: "",
        position: "",
        face_guidance: "",
        interaction: "",
        lora_triggers: "",
        lora_name: "",
        lora_strength: 0.8,
        loras: [],
        additional_info: "",
        additional_open: false,
        rows: [],
        concepts_open: true,
        quick_open: true,
        loras_open: true,
        randomize_fields: {},
        randomize_direction_groups: {},
      };
    }

    /* Seed a fresh character with the three default concept rows. Rows are
     * built from fallback data when the library has not loaded yet, then
     * enriched once fetchLibrary resolves. */
    function seedCharacterConcepts(character) {
      if (!Array.isArray(character.rows)) character.rows = [];
      for (const entry of SEED_ROWS) {
        const preset = library.find(function (item) { return item.id === entry[0]; });
        let row;
        if (preset) {
          row = presetToRow(preset, state);
          row.id = uniqueCharacterRowId(character);
        } else {
          const fallback = SEED_ROW_FALLBACKS[entry[0]] || {};
          row = {
            id: uniqueCharacterRowId(character),
            category: fallback.category || "custom",
            preset_id: entry[0],
            label: fallback.label || entry[0],
            phrase: fallback.phrase || "",
            control_mode: "scalar",
            intensity: 0,
            strength: entry[1],
            enabled: true,
            aliases: [],
            verification: "general visual vocabulary",
            source: "seed",
          };
        }
        row.strength = entry[1];
        character.rows.push(row);
      }
    }

    function enrichSeedRows() {
      for (const character of (state.characters || [])) {
        for (const row of (character.rows || [])) {
          if (row.source !== "seed") continue;
          const preset = library.find(function (item) { return item.id === row.preset_id; });
          if (!preset) continue;
          row.category = preset.category || row.category;
          row.label = preset.label || row.label;
          row.phrase = preset.phrase || row.phrase;
          row.intensity = parseInt(preset.default_strength, 10) || row.intensity;
          row.source = "library";
        }
      }
    }

    function ensureStructuredState() {
      if (!Array.isArray(state.characters)) state.characters = [];
      if (!Array.isArray(state.character_presets)) state.character_presets = [];
      if (!state.setting || typeof state.setting !== "object") {
        state.setting = { enabled: false, name: "", description: "" };
      }
      if (!Array.isArray(state.setting_presets)) state.setting_presets = [];
      if (state.characters.length && !state.characters.some(function (item) {
        return item.id === state.selected_character_id;
      })) state.selected_character_id = state.characters[0].id;
    }

    function randomChoice(values) {
      return values[Math.floor(Math.random() * values.length)] || "";
    }

    function renderStructuredEditors() {
      render();
    }

    /* --- Per-character direction (emotion, face, body, position) --- */

    function uniqueCharacterRowId(character) {
      let id;
      const taken = new Set(state.rows.map(function (row) { return row.id; }));
      (state.characters || []).forEach(function (item) {
        (item.rows || []).forEach(function (row) { taken.add(row.id); });
      });
      do {
        id = "crow_" + Math.random().toString(16).slice(2, 12);
      } while (taken.has(id));
      return id;
    }

    function addCharacterRow(character, preset) {
      if (!Array.isArray(character.rows)) character.rows = [];
      const row = presetToRow(preset, state);
      row.id = uniqueCharacterRowId(character);
      character.rows.push(row);
      markDirty();
      render();
    }

    function removeCharacterRow(character, rowId) {
      character.rows = (character.rows || []).filter(function (row) { return row.id !== rowId; });
      markDirty();
      render();
    }

    function editCharacterRow(character, row) {
      // Replace picker is scoped to the concept group the row belongs to,
      // so clicking "Arms Crossed" never offers emotion concepts.
      const group = CHARACTER_CONCEPT_GROUPS.find(function (item) {
        return item.categories.includes(row.category);
      }) || null;
      showSearchableSelector({
        presets: characterRowPresets(),
        title: "Replace " + (row.label || "concept"),
        categories: group ? group.categories : CHARACTER_PICKER_CATEGORIES,
        multiSelect: false,
        selectedIds: [row.preset_id],
        initialPresetId: row.preset_id,
        filterPreset: characterConflictFilter(character),
        onClose: function () { render(); },
        getConceptColor: function (presetId) { return (state.concept_colors || {})[presetId] || ""; },
        onColorChange: function (presetId, newColor) {
          state.concept_colors = state.concept_colors || {};
          if (newColor) state.concept_colors[presetId] = newColor;
          else delete state.concept_colors[presetId];
          markDirty();
        },
        onPick: function (preset) {
          const replacement = presetToRow(preset, state);
          replacement.id = row.id;
          replacement.strength = row.strength;
          replacement.enabled = row.enabled;
          const index = (character.rows || []).findIndex(function (item) { return item.id === row.id; });
          if (index >= 0) character.rows[index] = replacement;
          markDirty();
          render();
        },
      });
    }

    function characterRowPresets() {
      return compatibleLibrary().filter(function (preset) {
        return DIRECTION_CATEGORIES.includes(preset.category) && !preset.disabled;
      });
    }

    function characterRowCtx(character, rows) {
      return {
        presets: library,
        conceptColors: state.concept_colors,
        markDirty: markDirty,
        persistConceptColors: function () { saveConceptColors(state.concept_colors || {}).catch(function () {}); },
        refresh: render,
        removeRow: function (id) { removeCharacterRow(character, id); },
        onReorder: function (parent) {
          const ids = Array.prototype.map.call(parent.querySelectorAll(".krea2-row"), function (element) {
            return element.dataset.rowId;
          });
          const reordered = ids.map(function (id) {
            return (character.rows || []).find(function (row) { return row.id === id; });
          }).filter(Boolean);
          const scopedIds = new Set(rows.map(function (row) { return row.id; }));
          character.rows = (character.rows || []).map(function (row) {
            return scopedIds.has(row.id) ? reordered.shift() : row;
          });
          markDirty();
        },
        editRow: function (row) { editCharacterRow(character, row); },
        onHover: setRowHover,
      };
    }

    function characterRowBlock(character, categories, title, emptyHint) {
      const rows = (character.rows || []).filter(function (row) {
        return categories.includes(row.category);
      });
      const block = el("div", { class: "krea2-direction-block" });
      const header = el("div", { class: "krea2-direction-block-head" }, [
        el("strong", null, title),
        el("span", { class: "krea2-structured-spacer" }),
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-quiet-btn",
          onClick: function () {
            showSearchableSelector({
              presets: characterRowPresets(),
              title: "Add " + title + " for " + (character.name || "this character"),
              categories: categories,
              multiSelect: true,
              selectedIds: rows.map(function (row) { return row.preset_id; }),
              onToggle: function (preset, shouldSelect) {
                if (shouldSelect) {
                  addCharacterRow(character, preset);
                } else {
                  const existing = (character.rows || []).find(function (row) {
                    return row.preset_id === preset.id;
                  });
                  if (existing) removeCharacterRow(character, existing.id);
                }
              },
              onClose: function () { render(); },
              getConceptColor: function (presetId) { return (state.concept_colors || {})[presetId] || ""; },
              onColorChange: function (presetId, newColor) {
                state.concept_colors = state.concept_colors || {};
                if (newColor) state.concept_colors[presetId] = newColor;
                else delete state.concept_colors[presetId];
                markDirty();
              },
            });
          },
        }, "+ Add"),
      ]);
      block.appendChild(header);
      if (!rows.length) {
        block.appendChild(el("div", { class: "krea2-wizard-empty" }, emptyHint || "Nothing set yet."));
        return block;
      }
      const content = el("div", { class: "krea2-direction-rows" });
      for (const row of rows) {
        content.appendChild(renderRow(row, characterRowCtx(character, rows)));
      }
      block.appendChild(content);
      return block;
    }

    function toggleQuickDirection(character, quick) {
      const ids = quick.presets.map(function (entry) { return entry[0]; });
      const hasAny = (character.rows || []).some(function (row) {
        return ids.includes(row.preset_id);
      });
      if (hasAny) {
        // Clicking an active quick direction removes its whole set.
        character.rows = (character.rows || []).filter(function (row) {
          return !ids.includes(row.preset_id);
        });
      } else {
        if (!Array.isArray(character.rows)) character.rows = [];
        const existingIds = new Set(character.rows.map(function (row) { return row.preset_id; }));
        for (const entry of quick.presets) {
          const preset = library.find(function (item) { return item.id === entry[0]; });
          if (!preset || existingIds.has(preset.id)) continue;
          const row = presetToRow(preset, state);
          row.id = uniqueCharacterRowId(character);
          row.strength = entry[1];
          character.rows.push(row);
          existingIds.add(preset.id);
        }
      }
      markDirty();
      render();
    }

    function renderQuickDirectionChips(character) {
      const chips = el("div", { class: "krea2-emotion-chips krea2-quick-directions" });
      const ids = new Set((character.rows || []).map(function (row) { return row.preset_id; }));
      for (const quick of QUICK_DIRECTIONS) {
        const active = quick.presets.some(function (entry) { return ids.has(entry[0]); });
        const chip = el("button", {
          type: "button",
          class: "krea2-emotion-chip" + (active ? " is-active" : ""),
          title: active
            ? "Remove the whole \u201c" + quick.label + "\u201d direction"
            : "Add the \u201c" + quick.label + "\u201d direction (emotion, face, and body together)",
          onClick: function () { toggleQuickDirection(character, quick); },
        }, quick.label);
        chips.appendChild(chip);
      }
      return chips;
    }

    /* Direction groups: the same category structure as the Concepts tab,
     * scoped to one cast member. */
    const DIRECTION_GROUPS = [
      { id: "emotion", icon: "sparkle", label: "Emotion", categories: EMOTION_CATEGORIES, emptyHint: "No emotion set." },
      { id: "face", icon: "eye", label: "Face & gaze", categories: FACE_CATEGORIES, emptyHint: "No facial action set." },
      { id: "body", icon: "users", label: "Body & movement", categories: BODY_CATEGORIES, emptyHint: "No body language set." },
      { id: "placement", icon: "compass", label: "Placement", categories: POSITION_CATEGORIES, emptyHint: "No placement set." },
    ];

    function directionGroupPresetId(groupKey) {
      return "direction_" + groupKey;
    }

    function randomizeCharacterDirection(character, group) {
      if (!library.length) {
        showToast("The concept library is still loading.", "warning");
        return;
      }
      const rows = (character.rows || []).filter(function (row) {
        return !group.categories.includes(row.category);
      });
      character.rows = rows;
      const candidates = compatibleLibrary().filter(function (preset) {
        return group.categories.includes(preset.category) && !preset.disabled;
      });
      for (let i = candidates.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const swap = candidates[i];
        candidates[i] = candidates[j];
        candidates[j] = swap;
      }
      const minimum = Math.min(2, candidates.length);
      const maximum = Math.min(6, candidates.length);
      const count = minimum + Math.floor(Math.random() * (maximum - minimum + 1));
      for (const preset of candidates.slice(0, count)) {
        const row = presetToRow(preset, state);
        row.id = uniqueCharacterRowId(character);
        row.strength = randomStrengthValue();
        character.rows.push(row);
      }
      markDirty();
      render();
    }

    function saveCharacterDirectionPreset(character, groupKey, suggestedLabel) {
      const label = String(suggestedLabel || "").trim();
      if (!label) { showToast("Name the preset first", "warning"); return; }
      const group = DIRECTION_GROUPS.find(function (item) { return item.id === groupKey; });
      const rows = (character.rows || []).filter(function (row) {
        return group.categories.includes(row.category);
      });
      if (!rows.length) {
        showToast("Add at least one concept to this direction first.", "warning");
        return;
      }
      const existing = savedPresets.find(function (preset) {
        return preset.scope === "group" && preset.group === directionGroupPresetId(groupKey)
          && String(preset.label || "").trim().toLowerCase() === label.toLowerCase();
      }) || null;
      if (existing && !window.confirm(
        "A " + group.label + " preset named \u201c" + label + "\u201d already exists. Overwrite it?",
      )) return;
      const payload = {
        scope: "group",
        group: directionGroupPresetId(groupKey),
        base_prompt: "",
        rows: JSON.parse(JSON.stringify(rows)),
      };
      if (existing) {
        Object.assign(existing, payload, { label: label });
      } else {
        savedPresets.push(Object.assign({ id: makeSavedPresetId("group", directionGroupPresetId(groupKey)), label: label }, payload));
      }
      persistSavedPresets(existing ? group.label + " preset overwritten" : group.label + " preset saved");
    }

    function loadCharacterDirectionPreset(character, groupKey, presetId) {
      const group = DIRECTION_GROUPS.find(function (item) { return item.id === groupKey; });
      const preset = savedPresets.find(function (item) {
        return item.id === presetId && item.scope === "group" && item.group === directionGroupPresetId(groupKey);
      });
      if (!preset) return;
      if (!library.length) {
        showToast("The concept library is still loading. Please try again in a moment.", "warning");
        return;
      }
      const rows = (character.rows || []).filter(function (row) {
        return !group.categories.includes(row.category);
      });
      for (const stored of (preset.rows || [])) {
        const libPreset = library.find(function (p) { return p.id === stored.preset_id; });
        if (!libPreset) continue;
        const row = presetToRow(libPreset, state);
        row.id = uniqueCharacterRowId(character);
        if (Number.isFinite(Number(stored.strength))) row.strength = Number(stored.strength);
        rows.push(row);
      }
      character.rows = rows;
      if (!character.loaded_direction_presets) character.loaded_direction_presets = {};
      character.loaded_direction_presets[groupKey] = presetId;
      markDirty();
      render();
      showToast(preset.label + " loaded", "info");
    }

    function buildCharacterDirectionPresetPicker(character, groupKey) {
      const select = el("select", {
        class: "krea2-wizard-group-preset",
        "aria-label": groupKey + " direction presets",
        onChange: function (event) {
          const presetId = event.target.value;
          select.value = "";
          if (presetId) loadCharacterDirectionPreset(character, groupKey, presetId);
        },
      });
      select.appendChild(el("option", { value: "" }, "Presets..."));
      const groupPresets = savedPresets.filter(function (item) {
        return item.scope === "group" && item.group === directionGroupPresetId(groupKey)
          && Array.isArray(item.rows);
      });
      for (const preset of groupPresets) {
        select.appendChild(el("option", { value: preset.id }, preset.label));
      }
      const lastLoaded = (character.loaded_direction_presets || {})[groupKey];
      if (lastLoaded && groupPresets.some(function (p) { return p.id === lastLoaded; })) {
        select.value = lastLoaded;
      }
      return select;
    }

    /* Direction sections styled like the Concepts tab: header with the
     * count on the right, and the full action set (Add, presets, save,
     * randomize, shuffle each job). In the three-column layout the group
     * headers are NOT collapsible — only the parent container toggles. */
    function renderCharacterDirectionBlock(character, groupKey, opts) {
      const group = CHARACTER_CONCEPT_GROUPS.find(function (item) { return item.id === groupKey; })
        || DIRECTION_GROUPS.find(function (item) { return item.id === groupKey; });
      const collapsible = !opts || opts.collapsible !== false;
      const rows = (character.rows || []).filter(function (row) {
        return group.categories.includes(row.category);
      });
      const section = el("section", { class: "krea2-wizard-category krea2-character-category" });
      const collapsed = !!(character.collapsed_direction || {})[groupKey];
      section.classList.toggle("is-collapsed", collapsed);
      const header = el("div", { class: "krea2-wizard-category-header" }, [
        el("strong", { class: "krea2-wizard-category-title" }, group.label),
        el("span", { class: "krea2-wizard-category-count" },
          rows.length + (rows.length === 1 ? " concept" : " concepts")),
      ]);
      const addBtn = el("button", {
        type: "button",
        class: "krea2-wizard-category-add",
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          showSearchableSelector({
            presets: characterRowPresets(),
            title: "Add " + group.label + " for " + (character.name || "this character"),
            categories: group.categories,
            multiSelect: true,
            selectedIds: rows.map(function (row) { return row.preset_id; }),
            filterPreset: characterConflictFilter(character),
            onToggle: function (preset, shouldSelect) {
              if (shouldSelect) {
                addCharacterRow(character, preset);
              } else {
                const existing = (character.rows || []).find(function (row) {
                  return row.preset_id === preset.id;
                });
                if (existing) removeCharacterRow(character, existing.id);
              }
            },
            onClose: function () { render(); },
            getConceptColor: function (presetId) { return (state.concept_colors || {})[presetId] || ""; },
            onColorChange: function (presetId, newColor) {
              state.concept_colors = state.concept_colors || {};
              if (newColor) state.concept_colors[presetId] = newColor;
              else delete state.concept_colors[presetId];
              markDirty();
            },
          });
        },
      }, icon("plus", { width: "12", height: "12" }));
      const presetSelect = buildCharacterDirectionPresetPicker(character, groupKey);
      const saveBtn = el("button", {
        type: "button",
        class: "krea2-wizard-category-save krea2-icon-btn",
        title: "Save these direction concepts as a reusable preset",
        "aria-label": "Save " + group.label + " preset",
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          const label = window.prompt("Name this " + group.label + " preset", "");
          if (!label || !label.trim()) return;
          saveCharacterDirectionPreset(character, groupKey, label.trim());
        },
      }, icon("save", { width: "12", height: "12" }));
      const randomBtn = diceButton(
        "Replace this direction with a random combination",
        function (event) {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          randomizeCharacterDirection(character, group);
        },
        "krea2-wizard-category-random krea2-icon-btn",
      );
      const eachJobOn = !!(character.randomize_direction_groups || {})[groupKey];
      const randomEachJob = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-shuffle" + (eachJobOn ? " is-active" : ""),
        title: eachJobOn
          ? "Shuffle on: this direction is randomized for every queued job. Click to stop."
          : "Shuffle off: this direction is randomized once when you press the dice. Click to randomize it every queued job.",
        "aria-label": "Randomize this direction every queued job",
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          if (!character.randomize_direction_groups) character.randomize_direction_groups = {};
          character.randomize_direction_groups[groupKey] = !character.randomize_direction_groups[groupKey];
          markDirty();
          render();
        },
      }, icon("shuffle", { width: "13", height: "13" }));
      const actions = el("div", { class: "krea2-wizard-category-actions" }, [
        addBtn,
        presetSelect,
        saveBtn,
        el("div", { class: "krea2-wizard-random-controls" }, [randomBtn, randomEachJob]),
      ]);
      const content = el("div", { class: "krea2-wizard-category-content" });
      if (!rows.length) {
        content.appendChild(el("div", { class: "krea2-wizard-empty" }, group.emptyHint));
      } else {
        for (const row of rows) {
          content.appendChild(renderRow(row, characterRowCtx(character, rows)));
        }
      }
      if (collapsed) {
        actions.style.display = "none";
        content.style.display = "none";
      }
      if (collapsible) {
        header.addEventListener("click", function (event) {
          const target = event && event.target;
          if (target && typeof target.closest === "function"
              && target.closest("button,select,input,label,.krea2-wizard-category-actions")) return;
          character.collapsed_direction = character.collapsed_direction || {};
          const next = !character.collapsed_direction[groupKey];
          character.collapsed_direction[groupKey] = next;
          actions.style.display = next ? "none" : "";
          content.style.display = next ? "none" : "";
          section.classList.toggle("is-collapsed", next);
          markDirty();
        });
      }
      section.appendChild(header);
      section.appendChild(actions);
      section.appendChild(content);
      return section;
    }

    function renderCharacterDirection(character) {
      const section = el("div", { class: "krea2-character-direction" });
      section.appendChild(el("div", { class: "krea2-direction-heading" },
        "Direction — emotions, face, body and placement for this character only"));

      /* Multi-concept quick directions */
      section.appendChild(el("div", { class: "krea2-direction-label" }, "Quick directions"));
      section.appendChild(renderQuickDirectionChips(character));

      /* Concepts-style sections with the full action set */
      for (const group of DIRECTION_GROUPS) {
        section.appendChild(renderCharacterDirectionBlock(character, group.id));
      }

      /* Position in frame (v1.3.1): preset select + dice, or free text. */
      const positionPresets = library.filter(function (preset) {
        return preset.category === "position" && !preset.disabled;
      });
      const positionSelect = el("select", {
        class: "krea2-compact-select",
        "aria-label": "Position and placement",
        onChange: function (event) {
          const preset = positionPresets.find(function (item) { return item.id === event.target.value; });
          character.position = preset ? preset.phrase : "";
          markDirty();
          render();
        },
      });
      positionSelect.appendChild(el("option", { value: "" }, "Position in frame..."));
      for (const preset of positionPresets) {
        positionSelect.appendChild(el("option", { value: preset.id }, preset.label));
      }
      const currentPosition = positionPresets.find(function (preset) {
        return preset.phrase === character.position;
      });
      positionSelect.value = currentPosition ? currentPosition.id : "";
      const positionRow = el("div", { class: "krea2-direction-position" }, [
        el("span", { class: "krea2-direction-label" }, "Position in frame"),
        positionSelect,
        diceButton("Random placement", function () {
          const preset = randomChoice(positionPresets);
          if (preset) { character.position = preset.phrase; markDirty(); render(); }
        }, "krea2-field-random krea2-icon-btn"),
      ]);
      if (character.position && !currentPosition) {
        positionRow.appendChild(el("span", { class: "krea2-direction-custom" }, character.position));
      }
      section.appendChild(positionRow);

      /* Face guidance free text (advanced, hidden by default) */
      if (state.show_face_guidance) {
        const guidance = el("div", { class: "krea2-direction-guidance" });
        guidance.appendChild(el("div", { class: "krea2-direction-block-head" }, [
          el("strong", null, "Face guidance triggers"),
          el("span", { class: "krea2-direction-hint" }, "one (trigger:weight) per line, emitted verbatim"),
        ]));
        guidance.appendChild(el("textarea", {
          class: "krea2-compact-textarea krea2-face-guidance",
          rows: "3",
          "aria-label": "Face guidance triggers",
          placeholder: "(sparkling bright eyes:1.4)\n(genuine warm smile:1.2)",
          onInput: function (event) { character.face_guidance = event.target.value; markDirty(); },
        }, character.face_guidance || ""));
        section.appendChild(guidance);
      }

      /* Interaction with other cast members */
      const others = (state.characters || []).filter(function (item) {
        return item.id !== character.id && item.enabled !== false;
      }).map(function (item) { return item.name; }).filter(Boolean);
      const interaction = el("div", { class: "krea2-direction-interaction" });
      interaction.appendChild(el("div", { class: "krea2-direction-block-head" }, [
        el("strong", null, "Interaction"),
        el("span", { class: "krea2-direction-hint" }, "e.g. looking at " + (others[0] || "the other character")),
      ]));
      const interactionInput = el("input", {
        type: "text",
        class: "krea2-compact-input",
        value: character.interaction || "",
        placeholder: "looking at Alex",
        list: "krea2-interaction-suggestions-" + character.id,
        "aria-label": "Interaction with other characters",
        onInput: function (event) { character.interaction = event.target.value; markDirty(); },
      });
      const suggestions = el("datalist", { id: "krea2-interaction-suggestions-" + character.id });
      for (const other of others) {
        suggestions.appendChild(el("option", { value: "looking at " + other }));
        suggestions.appendChild(el("option", { value: "smiling at " + other }));
        suggestions.appendChild(el("option", { value: "pointing at " + other }));
        suggestions.appendChild(el("option", { value: "leaning toward " + other }));
        suggestions.appendChild(el("option", { value: "facing away from " + other }));
      }
      interaction.appendChild(interactionInput);
      interaction.appendChild(suggestions);
      section.appendChild(interaction);
      return section;
    }

    function avatarColor(value, fallback) {
      const colors = {
        black: "#24242a", "jet black": "#16161a", "dark brown": "#4b2e24",
        "chestnut brown": "#6b4226", auburn: "#8c3f2b", copper: "#b4531f",
        red: "#c74735", ginger: "#c96a3a", "strawberry blonde": "#d99a6c",
        blonde: "#d9b65e", "honey blonde": "#d4a94f", "platinum blonde": "#eee6c9",
        "ash blonde": "#c9c4b8", silver: "#aeb6c2", white: "#f4f2ee",
        grey: "#8a9098", blue: "#367bd6", teal: "#1f8f8f", purple: "#7a5fb8",
        pink: "#d85b9f", green: "#3e8e54", rainbow: "#c45a8a", ombre: "#8c5a4a",
        balayage: "#a86a4a", highlights: "#c9a25e", lowlights: "#5a4030",
        "two-tone": "#8a4a9a",
        orange: "#d97a3d", amber: "#d9a441", yellow: "#dfc24d",
        cyan: "#37b7cc", navy: "#2b3a66", magenta: "#b84a9e",
      };
      return colors[value] || fallback;
    }

    function skinColorTone(value) {
      const map = {
        white: "#f2dcc8", blonde: "#f0ddc4", silver: "#e6d6c4", grey: "#b8a898",
        black: "#3a2a22", "dark brown": "#5c3b26", brown: "#8a5a3b", auburn: "#a86a4a",
        red: "#c96a5a", orange: "#d99a6c", amber: "#d9a97a", yellow: "#e6c890",
        green: "#7d9e7a", teal: "#6d9e96", cyan: "#a8ccd6", blue: "#7d9ec8",
        navy: "#5a6a8a", purple: "#9a86b8", magenta: "#b88aa8", pink: "#e8a8b8",
      };
      return map[String(value || "").toLowerCase()] || "#d9ad8b";
    }

    function irisColors(eyeColor) {
      const value = String(eyeColor || "").toLowerCase();
      const map = {
        "bright blue eyes": ["#3b78d6", "#3b78d6"], "icy blue eyes": ["#8fc4f0", "#8fc4f0"],
        "green eyes": ["#3e8e54", "#3e8e54"], "hazel eyes": ["#8a6f2a", "#8a6f2a"],
        "brown eyes": ["#5b3a24", "#5b3a24"], "dark brown eyes": ["#43301f", "#43301f"],
        "black eyes": ["#26262c", "#26262c"], "grey eyes": ["#9aa3ab", "#9aa3ab"],
        "amber eyes": ["#c98a2e", "#c98a2e"], "violet eyes": ["#7a5fb8", "#7a5fb8"],
        "heterochromatic eyes": ["#3b78d6", "#3e8e54"],
        black: ["#1f1f24", "#1f1f24"], white: ["#f4f2ee", "#f4f2ee"],
        grey: ["#9aa3ab", "#9aa3ab"], silver: ["#c8ccd2", "#c8ccd2"],
        brown: ["#5b3a24", "#5b3a24"], "dark brown": ["#43301f", "#43301f"],
        blonde: ["#d9b65e", "#d9b65e"], auburn: ["#8c4a2e", "#8c4a2e"],
        red: ["#c74735", "#c74735"], orange: ["#d97a3d", "#d97a3d"],
        amber: ["#c98a2e", "#c98a2e"], yellow: ["#d9c44d", "#d9c44d"],
        green: ["#3e8e54", "#3e8e54"], teal: ["#1f8f8f", "#1f8f8f"],
        cyan: ["#37b7cc", "#37b7cc"], blue: ["#3b78d6", "#3b78d6"],
        navy: ["#2b3a66", "#2b3a66"], purple: ["#7a5fb8", "#7a5fb8"],
        magenta: ["#b84a9e", "#b84a9e"], pink: ["#e07a9e", "#e07a9e"],
      };
      return map[value] || ["#5b3a24", "#5b3a24"];
    }

    function slugify(value) {
      return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    }

    function characterAgeClass(character) {
      const age = String(character.age || "").toLowerCase();
      if (age.includes("child") || age.includes("teen")) return "is-child";
      if (age.includes("middle")) return "is-middle-aged";
      if (age.includes("elder")) return "is-elderly";
      return "";
    }

    function characterSexClass(character) {
      const sex = String(character.sex || "").toLowerCase();
      if (sex === "male") return "is-male";
      if (sex === "female") return "is-female";
      return "is-unspecified";
    }

    function buildCharacterAvatar(character) {
      const hairColor = avatarColor(character.hair_color, "#4b2e24");
      const iris = irisColors(character.eyes);
      const clothing = String(
        character.clothing || character.ensemble || character.clothing_top || "",
      ).toLowerCase();
      const outfitColor = clothing.includes("sci-fi") ? "#405a78"
        : clothing.includes("armour") ? "#6c7582"
        : clothing.includes("fantasy") || clothing.includes("medieval") ? "#72513d"
        : clothing.includes("formal") || clothing.includes("suit") || clothing.includes("tuxedo") ? "#303844"
        : clothing.includes("streetwear") || clothing.includes("biker") ? "#8a4160"
        : clothing.includes("leather") || clothing.includes("noir") ? "#5c4433"
        : clothing.includes("flapper") || clothing.includes("gown") || clothing.includes("ballgown") ? "#8a4a6a"
        : clothing.includes("military") || clothing.includes("fatigues") ? "#4a5c4a"
        : clothing.includes("lab") || clothing.includes("chef") || clothing.includes("scrubs") ? "#cfd6df"
        : clothing.includes("cowboy") || clothing.includes("western") ? "#8a6a4a"
        : clothing.includes("samurai") || clothing.includes("ninja") ? "#3a3f4a"
        : clothing.includes("pirate") ? "#5c4633"
        : clothing.includes("clown") ? "#d85b5b"
        : clothing.includes("hazmat") || clothing.includes("spacesuit") ? "#cfd6df"
        : "#477f72";
      const avatar = el("div", {
        class: "krea2-avatar " + characterSexClass(character) + " " + characterAgeClass(character),
        role: "img",
        "aria-label": "Simple preview of " + (character.name || "this character"),
        style: {
          "--krea2-avatar-hair": hairColor,
          "--krea2-avatar-outfit": outfitColor,
          "--krea2-avatar-iris": iris[0],
          "--krea2-avatar-iris-r": iris[1],
          "--krea2-avatar-skin": skinColorTone(character.skin_color),
        },
      });
      const art = el("div", { class: "krea2-avatar-art" });
      art.append(
        el("div", { class: "krea2-avatar-hair-back " + slugify(character.hair_length || "short") }),
        el("div", { class: "krea2-avatar-ear left" }),
        el("div", { class: "krea2-avatar-ear right" }),
        el("div", { class: "krea2-avatar-body " + slugify(character.body_type || "average") }),
        el("div", { class: "krea2-avatar-neck" }),
      );
      const head = el("div", {
        class: "krea2-avatar-head " + slugify(character.face_shape || "oval") + " chin-" + slugify(character.chin || "rounded"),
      });
      head.append(
        el("div", { class: "krea2-avatar-hair-front " + slugify(character.hair_style || "straight") }),
        el("div", { class: "krea2-avatar-brow left" }),
        el("div", { class: "krea2-avatar-brow right" }),
        el("div", { class: "krea2-avatar-eye-wrap left " + slugify(character.eyes || "almond") }, [
          el("div", { class: "krea2-avatar-eye-white" }),
          el("div", { class: "krea2-avatar-iris" }),
          el("div", { class: "krea2-avatar-pupil" }),
          el("div", { class: "krea2-avatar-lid" }),
        ]),
        el("div", { class: "krea2-avatar-eye-wrap right " + slugify(character.eyes || "almond") }, [
          el("div", { class: "krea2-avatar-eye-white" }),
          el("div", { class: "krea2-avatar-iris" }),
          el("div", { class: "krea2-avatar-pupil" }),
          el("div", { class: "krea2-avatar-lid" }),
        ]),
        el("div", { class: "krea2-avatar-bag left" }),
        el("div", { class: "krea2-avatar-bag right" }),
        el("div", { class: "krea2-avatar-nose " + slugify(character.nose || "straight") }),
        el("div", { class: "krea2-avatar-mouth " + avatarMouthClass(character) }),
      );
      art.appendChild(head);
      avatar.appendChild(art);
      avatar.appendChild(el("div", { class: "krea2-avatar-label" }, character.name || "Character"));
      return avatar;
    }

    function avatarMouthClass(character) {
      const expression = characterEmotionLabel(character);
      const mouth = String(character.mouth || "").toLowerCase();
      if (mouth.includes("smile") || mouth.includes("cupid")) return "happy";
      if (mouth.includes("pout") || mouth.includes("small")) return "pouty";
      if (mouth.includes("thin")) return "neutral";
      if (mouth.includes("wide") || mouth.includes("full")) return "open";
      if (expression.includes("smile") || expression.includes("joy") || expression.includes("laugh") || expression.includes("happy") || expression.includes("amuse") || expression.includes("flirt")) return "happy";
      if (expression.includes("smirk")) return "smirk";
      if (expression.includes("sad") || expression.includes("grief") || expression.includes("cry") || expression.includes("despair") || expression.includes("melanchol")) return "sad";
      if (expression.includes("anger") || expression.includes("rage") || expression.includes("fury")) return "frown";
      if (expression.includes("shock") || expression.includes("surpris") || expression.includes("terror") || expression.includes("panic") || expression.includes("fear") || expression.includes("gasp")) return "open";
      if (expression.includes("bored") || expression.includes("numb") || expression.includes("flat")) return "neutral";
      return "neutral";
    }

    function characterEmotionLabel(character) {
      const rows = (character.rows || []).filter(function (row) {
        return row && row.category === "emotion" && row.enabled !== false;
      });
      if (rows.length) return String(rows[0].label || rows[0].phrase || "").toLowerCase();
      return String(character.expression || "").toLowerCase();
    }

    function availableCharacterPresets() {
      const presets = CHARACTER_PRESETS.map(function (preset) { return { source: "builtin", preset: preset }; });
      savedPresets.filter(function (preset) { return preset.scope === "character"; }).forEach(function (preset) {
        presets.push({ source: "saved", preset: preset });
      });
      (state.character_presets || []).forEach(function (preset) {
        presets.push({ source: "workflow", preset: preset });
      });
      return presets;
    }

    function characterSummary(character) {
      const parts = [];
      if (character.sex) parts.push(String(character.sex));
      if (character.age) parts.push(String(character.age));
      const look = character.ensemble || character.clothing_top || character.clothing || "";
      if (look) parts.push(String(look));
      const hair = character.hair_color || character.hair_style || "";
      if (hair) parts.push(String(hair));
      return parts.join(" · ");
    }

    function comboboxForField(character, field) {
      const listId = "krea2-appearance-" + field.key + "-" + (character.id || "char");
      const input = el("input", {
        type: "text",
        class: "krea2-compact-input krea2-combobox",
        list: listId,
        value: character[field.key] || "",
        "aria-label": field.label,
        placeholder: "Pick or type…",
        onInput: function (event) {
          applyAppearanceValue(character, field, event.target.value);
        },
      });
      // When the field already holds a preset value, opening the dropdown
      // again shows ALL options (not just the currently selected one).
      input.addEventListener("focus", function () {
        if (field.options.includes(input.value)) {
          input.dataset.holdValue = input.value;
          input.value = "";
        }
      });
      input.addEventListener("blur", function () {
        if (input.dataset.holdValue && !input.value.trim()) {
          input.value = input.dataset.holdValue;
        }
        delete input.dataset.holdValue;
      });
      const datalist = el("datalist", { id: listId });
      // Blank first entry: picking it clears the field. Options are sorted
      // alphabetically (Age keeps its youngest-to-oldest order).
      datalist.appendChild(el("option", { value: "" }));
      const ordered = field.natural ? (field.options || []) : sortedOptions(field.options);
      for (const option of ordered) {
        datalist.appendChild(el("option", { value: option }));
      }
      return { input: input, datalist: datalist };
    }

    function applyAppearanceValue(character, field, rawValue) {
      const value = String(rawValue || "").trim();
      character[field.key] = value;
      if (field.key === "ensemble" && value) {
        // Choosing an ensemble disables the separates.
        character.clothing_top = "";
        character.clothing_bottom = "";
      }
      if ((field.key === "clothing_top" || field.key === "clothing_bottom") && value) {
        // Using separates disables the ensemble.
        character.ensemble = "";
      }
      markDirty();
      scheduleAppearanceRender();
    }

    const scheduleAppearanceRender = debounce(function () { render(); }, 350);

    function randomizeAppearanceField(character, field) {
      character[field.key] = randomChoice(field.options);
      if (field.key === "ensemble" && character[field.key]) {
        character.clothing_top = "";
        character.clothing_bottom = "";
      }
      if ((field.key === "clothing_top" || field.key === "clothing_bottom") && character[field.key]) {
        character.ensemble = "";
      }
    }

    function setAppearanceFieldEachJob(character, field, enabled) {
      if (!character.randomize_fields) character.randomize_fields = {};
      if (enabled) {
        character.randomize_fields[field.key] = field.options.slice();
      } else {
        delete character.randomize_fields[field.key];
      }
    }

    function buildAppearanceFieldRow(character, field) {
      const combobox = comboboxForField(character, field);
      const eachRun = !!(character.randomize_fields || {})[field.key];
      const useEnsemble = Boolean(String(character.ensemble || "").trim());
      const isSeparate = field.key === "clothing_top" || field.key === "clothing_bottom";
      const disabledByEnsemble = useEnsemble && isSeparate;
      const hint = disabledByEnsemble ? "disabled — an ensemble is chosen" : "";
      if (disabledByEnsemble) {
        combobox.input.disabled = true;
        combobox.input.title = hint;
      }
      const randomBtn = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-field-random",
        title: disabledByEnsemble
          ? field.label + " is disabled because an ensemble is chosen."
          : "Roll " + field.label + " once now.",
        "aria-label": "Randomize " + field.label + " once",
        disabled: disabledByEnsemble,
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          if (disabledByEnsemble) return;
          randomizeAppearanceField(character, field);
          markDirty();
          render();
        },
      }, "🎲");
      const eachJobBtn = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-field-each-job krea2-shuffle" + (eachRun ? " is-active" : ""),
        title: eachRun
          ? field.label + " randomizes for every queued job. Click to keep it fixed."
          : "Keep " + field.label + " changing for every queued job.",
        "aria-label": eachRun
          ? field.label + " randomizes every queued job"
          : "Randomize " + field.label + " every queued job",
        "aria-pressed": eachRun ? "true" : "false",
        disabled: disabledByEnsemble,
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          if (disabledByEnsemble) return;
          setAppearanceFieldEachJob(character, field, !eachRun);
          markDirty();
          render();
        },
      }, icon("shuffle", { width: "13", height: "13" }));
      const row = el("label", { class: "krea2-character-field" + (disabledByEnsemble ? " is-disabled" : "") }, [
        el("span", null, field.label),
        el("div", { class: "krea2-field-row" }, [
          combobox.input,
          combobox.datalist,
          el("div", { class: "krea2-field-random-controls" }, [randomBtn, eachJobBtn]),
        ]),
      ]);
      return row;
    }

    function appearanceColumns(character) {
      const grid = el("div", { class: "krea2-character-columns" });
      for (const layout of CHARACTER_COLUMN_LAYOUT) {
        const fields = CHARACTER_APPEARANCE.filter(function (field) {
          return layout[1].includes(field.group);
        });
        if (!fields.length) continue;
        const col = el("div", { class: "krea2-character-column" });
        col.appendChild(el("div", { class: "krea2-character-column-title" }, layout[0]));
        for (const field of fields) {
          col.appendChild(buildAppearanceFieldRow(character, field));
        }
        grid.appendChild(col);
      }
      /* Additional characteristics: hidden behind a checkbox, auto-expanding. */
      const additionalOpen = character.additional_open === true;
      const additionalCheck = el("label", { class: "krea2-inline-check krea2-additional-toggle" }, [
        el("input", {
          type: "checkbox",
          checked: additionalOpen,
          onChange: function (event) {
            character.additional_open = !!event.target.checked;
            markDirty();
            render();
          },
        }),
        el("span", null, "Additional info"),
      ]);
      const gridWrap = el("div", { class: "krea2-character-grid-wrap" }, [grid, additionalCheck]);
      if (additionalOpen) {
        const additional = el("textarea", {
          class: "krea2-compact-textarea krea2-additional-info",
          rows: "2",
          "aria-label": "Additional characteristics",
          placeholder: "A mole on her cheek, an eyepatch over one eye, a scar…",
          onInput: function (event) {
            character.additional_info = event.target.value;
            autoExpandTextarea(event);
            markDirty();
          },
        }, character.additional_info || "");
        autoExpandTextarea({ target: additional });
        gridWrap.appendChild(additional);
      }
      return gridWrap;
    }

    function loraFileNameStem(name) {
      return String(name || "")
        .replace(/\.(safetensors|ckpt|pt|bin)$/i, "")
        .replace(/[_-]+/g, " ")
        .trim();
    }

    /* Shared LoRA picker + strength slider, used by the full LoRA section
     * and the compact B2 expanded-state cards. */
    function buildLoraSelect(character) {
      const loraSelect = el("select", {
        class: "krea2-compact-select",
        "aria-label": "LoRA for " + (character.name || "this character"),
        onChange: function (event) {
          const name = event.target.value;
          character.lora_name = name;
          if (name && !String(character.lora_triggers || "").trim()) {
            const stem = loraFileNameStem(name);
            if (stem) character.lora_triggers = stem;
          }
          markDirty();
          render();
        },
      });
      loraSelect.appendChild(el("option", { value: "" }, "No LoRA — " + (loras.length ? loras.length + " available" : "connect to list your loras")));
      for (const name of loras) {
        loraSelect.appendChild(el("option", { value: name }, name));
      }
      if (loras.includes(character.lora_name)) loraSelect.value = character.lora_name;
      return loraSelect;
    }

    function buildLoraStrengthControl(character) {
      const strength = Number(character.lora_strength) || 0.8;
      const strengthInput = el("input", {
        type: "range",
        min: "0",
        max: "2",
        step: "0.05",
        value: String(strength),
        class: "krea2-lora-strength",
        "aria-label": "LoRA strength",
        onInput: function (event) {
          character.lora_strength = Math.round(Number(event.target.value) * 20) / 20;
          markDirty();
          scheduleAppearanceRender();
        },
      });
      const strengthValue = el("span", { class: "krea2-lora-strength-value" }, strength.toFixed(2));
      return { input: strengthInput, value: strengthValue };
    }

    function renderLoraSection(character) {
      const section = el("div", { class: "krea2-lora-section" });
      const picker = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-quiet-btn",
        onClick: function () {
          showSearchableSelector({
            presets: characterRowPresets(),
            title: "Add LoRA trigger words for " + (character.name || "this character"),
            categories: LORA_CATEGORIES,
            multiSelect: true,
            selectedIds: [],
            onToggle: function (preset, shouldSelect) {
              if (!shouldSelect) return;
              const lines = String(character.lora_triggers || "").split(/\r?\n/)
                .map(function (line) { return line.trim(); }).filter(Boolean);
              const phrase = String(preset.phrase || preset.label || "").trim();
              if (phrase && !lines.includes(phrase)) {
                lines.push(phrase);
                character.lora_triggers = lines.join("\n");
              }
              markDirty();
              render();
            },
            onClose: function () { render(); },
            getConceptColor: function (presetId) { return (state.concept_colors || {})[presetId] || ""; },
            onColorChange: function (presetId, newColor) {
              state.concept_colors = state.concept_colors || {};
              if (newColor) state.concept_colors[presetId] = newColor;
              else delete state.concept_colors[presetId];
              markDirty();
            },
          });
        },
      }, "+ Pick trigger words");
      const randomBtn = diceButton("Random trigger word", function () {
        const presets = characterRowPresets().filter(function (preset) { return LORA_CATEGORIES.includes(preset.category); });
        const preset = randomChoice(presets);
        if (!preset) return;
        const lines = String(character.lora_triggers || "").split(/\r?\n/)
          .map(function (line) { return line.trim(); }).filter(Boolean);
        const phrase = String(preset.phrase || preset.label || "").trim();
        if (phrase && !lines.includes(phrase)) {
          lines.push(phrase);
          character.lora_triggers = lines.join("\n");
        }
        markDirty();
        render();
      }, "krea2-field-random krea2-icon-btn");
      const loraEachJobOn = !!(character.randomize_fields || {}).lora_triggers;
      const loraEachJobBtn = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-lora-each-job krea2-shuffle" + (loraEachJobOn ? " is-active" : ""),
        title: loraEachJobOn
          ? "LoRA trigger words change for every queued job. Click to keep them fixed."
          : "Randomize this character's LoRA trigger words for every queued job.",
        "aria-label": "Randomize LoRA trigger words every queued job",
        "aria-pressed": loraEachJobOn ? "true" : "false",
        onClick: function () {
          if (!character.randomize_fields) character.randomize_fields = {};
          if (character.randomize_fields.lora_triggers) {
            delete character.randomize_fields.lora_triggers;
          } else {
            let lines = String(character.lora_triggers || "").split(/\r?\n/)
              .map(function (line) { return line.trim(); }).filter(Boolean);
            if (!lines.length) {
              const presets = characterRowPresets().filter(function (preset) {
                return LORA_CATEGORIES.includes(preset.category) && !preset.disabled;
              });
              for (let i = presets.length - 1; i > 0; i -= 1) {
                const j = Math.floor(Math.random() * (i + 1));
                const swap = presets[i];
                presets[i] = presets[j];
                presets[j] = swap;
              }
              for (const preset of presets.slice(0, 4)) {
                const phrase = String(preset.phrase || preset.label || "").trim();
                if (phrase && !lines.includes(phrase)) lines.push(phrase);
              }
            }
            character.randomize_fields.lora_triggers = lines;
          }
          markDirty();
          render();
        },
      }, icon("shuffle", { width: "13", height: "13" }));
      section.appendChild(el("div", { class: "krea2-direction-block-head" }, [
        el("strong", null, "LoRA"),
        el("span", { class: "krea2-direction-hint" }, "applies to THIS character — connect a model to the node's Model input"),
        el("span", { class: "krea2-structured-spacer" }),
        el("div", { class: "krea2-wizard-random-controls" }, [randomBtn, loraEachJobBtn]),
        picker,
      ]));
      const loraSelect = buildLoraSelect(character);
      const strengthControl = buildLoraStrengthControl(character);
      const strengthInput = strengthControl.input;
      const strengthValue = strengthControl.value;
      const loraRow = el("div", { class: "krea2-lora-controls" }, [
        loraSelect,
        el("span", { class: "krea2-direction-label" }, "strength"),
        strengthInput,
        strengthValue,
      ]);
      section.appendChild(loraRow);
      section.appendChild(el("div", { class: "krea2-settings-copy" },
        "The LoRA is applied to the model with this strength. Its trigger words compile only inside " +
        (character.name || "this character") + "\u2019s block, steering the LoRA's look toward this character. " +
        "LoRAs without trigger words often respond to their file name — picking one fills it in automatically."));
      section.appendChild(el("textarea", {
        class: "krea2-compact-textarea krea2-lora-triggers",
        rows: "2",
        "aria-label": "LoRA trigger words",
        placeholder: "young woman\nsemi-realistic art style",
        onInput: function (event) { character.lora_triggers = event.target.value; markDirty(); },
      }, character.lora_triggers || ""));
      return section;
    }


    /* v1.5.0: compact identity chips shown on collapsed cast members.
     * One pill per populated direction group plus the LoRA, so the card
     * stays scannable at reduced zoom without hovering. */
    function characterChips(character) {
      const chips = el("div", { class: "krea2-character-chips" });
      let hasContent = false;
      for (const group of DIRECTION_GROUPS) {
        const labels = (character.rows || []).filter(function (row) {
          return group.categories.includes(row.category);
        }).map(function (row) { return row.label || row.preset_id; });
        if (!labels.length) continue;
        chips.appendChild(el("span", {
          class: "krea2-chip krea2-character-chip",
          title: group.label + ": " + labels.join(", "),
        }, [
          icon(group.icon, { width: "10", height: "10" }),
          " " + group.label + " \u00b7 " + labels.length,
        ]));
        hasContent = true;
      }
      const loraName = String(character.lora_name || "").trim();
      if (loraName) {
        chips.appendChild(el("span", {
          class: "krea2-chip krea2-character-chip krea2-chip-lora",
          title: "LoRA: " + loraName,
        }, [
          icon("bolt", { width: "10", height: "10" }),
          " LoRA \u00b7 " + loraName,
        ]));
        hasContent = true;
      }
      if (!hasContent) {
        chips.appendChild(el("span", { class: "krea2-character-chips-empty" },
          "No direction or LoRA set yet — expand to craft one"));
      }
      return chips;
    }

    function saveCharacterPreset(character, suggestedLabel) {
      const label = String(suggestedLabel || character.name || "").trim();
      if (!label) { showToast("Give the character a name first", "warning"); return; }
      const stored = cloneJson(character);
      delete stored.id;
      delete stored.expanded;
      const existing = findExistingSavedPreset("character", label);
      if (existing && !window.confirm(
        "A character preset named \u201c" + label + "\u201d already exists. Overwrite it?",
      )) {
        showToast("Character preset not saved", "info");
        return;
      }
      const payload = { scope: "character", character: stored };
      if (existing) {
        Object.assign(existing, payload, { label: label });
      } else {
        savedPresets.push(Object.assign({ id: makeSavedPresetId("character", ""), label: label }, payload));
      }
      persistSavedPresets(existing ? "Character preset overwritten" : "Character preset saved");
    }

    function renderCharacterEditor() {
      const section = el("section", { class: "krea2-structured-section krea2-character-section" });
      const add = el("button", { type: "button", class: "krea2-wizard-btn", onClick: function () {
        const character = newCharacter();
        state.characters.push(character);
        state.selected_character_id = character.id;
        markDirty();
        renderStructuredEditors();
      } }, "+ Character");
      const exportBtn = el("button", { type: "button", class: "krea2-wizard-btn krea2-quiet-btn", onClick: exportStructuredPresets }, "Export");
      const importInput = el("input", { type: "file", accept: "application/json", hidden: true, onChange: importStructuredPresets });
      const importBtn = el("button", { type: "button", class: "krea2-wizard-btn krea2-quiet-btn", onClick: function () { importInput.click(); } }, "Import");
      /* v1.5.0: cast-level randomization stays in the cast header so the
       * whole cast can be re-rolled without opening every member. */
      const castRandomAll = diceButton("Randomize every character's full look once now", function () {
        (state.characters || []).forEach(function (character) {
          CHARACTER_APPEARANCE.forEach(function (field) {
            randomizeAppearanceField(character, field);
          });
        });
        markDirty();
        render();
      }, "krea2-cast-random-all");
      section.appendChild(el("div", { class: "krea2-structured-heading" }, [
        el("strong", null, "People & Characters"),
        el("span", { class: "krea2-structured-spacer" }), castRandomAll, add, exportBtn, importBtn, importInput,
      ]));
      if (!state.characters.length) {
        const starter = el("select", { class: "krea2-compact-select", "aria-label": "Add a preset character" });
        starter.appendChild(el("option", { value: "" }, "Start with a preset character..."));
        CHARACTER_PRESETS.forEach(function (preset, presetIndex) { starter.appendChild(el("option", { value: String(presetIndex) }, preset.label)); });
        starter.addEventListener("change", function () {
          const preset = CHARACTER_PRESETS[Number(starter.value)];
          if (!preset) return;
          const character = Object.assign(newCharacter(), cloneJson(preset.character), { name: preset.label });
          state.characters.push(character); state.selected_character_id = character.id;
          markDirty(); renderStructuredEditors();
        });
        section.appendChild(el("div", { class: "krea2-character-empty-row" }, [starter, el("span", { class: "krea2-structured-empty" }, "or create a blank character") ]));
        return section;
      }
      state.characters.forEach(function (character, index) {
        section.appendChild(renderCharacterCard(character, index));
      });
      return section;
    }

    function autoExpandTextarea(event) {
      const target = event.target;
      target.style.height = "auto";
      target.style.height = Math.max(target.scrollHeight || 0, 28) + "px";
    }

    /* Shared scene controls: dice (roll once) and shuffle (every queued job).
     * Used by both the compact B2 shell and the full scene editor. */
    function randomizeSceneOnce() {
      const preset = randomChoice(SETTING_PRESETS);
      const setting = state.setting && typeof state.setting === "object"
        ? state.setting
        : (state.setting = { enabled: false, name: "", description: "" });
      setting.enabled = true;
      setting.name = preset[0];
      setting.description = preset[1];
      markDirty();
      render();
    }

    function toggleSceneShuffle(eachJobOn) {
      state.randomize_on_job = state.randomize_on_job || {};
      state.randomize_on_job.setting = !eachJobOn;
      state.setting_random_pool = SETTING_PRESETS.map(function (preset) {
        return { name: preset[0], description: preset[1] };
      });
      if (!eachJobOn && state.setting) state.setting.enabled = true;
      markDirty();
      render();
    }

    function renderSettingEditor() {
      const section = el("section", { class: "krea2-structured-section krea2-scene-editor" });
      const setting = state.setting;
      const settingEachJob = !!(state.randomize_on_job || {}).setting;
      const compact = state.scene_collapsed === true;
      section.classList.toggle("is-compact", compact);

      const sceneDice = diceButton("Randomize the scene", randomizeSceneOnce);
      const sceneShuffle = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-shuffle" + (settingEachJob ? " is-active" : ""),
        title: settingEachJob
          ? "Shuffle on: a fresh scene is chosen for every queued job. Click to stop."
          : "Shuffle off: the scene stays fixed. Click to pick a fresh scene every queued job.",
        "aria-label": "Randomize the scene every queued job",
        onClick: function () {
          toggleSceneShuffle(settingEachJob);
        },
      }, "🔀");
      const expandBtn = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-scene-expand",
        title: compact ? "Expand the scene editor" : "Collapse the scene editor to one line",
        "aria-label": compact ? "Expand scene editor" : "Collapse scene editor",
        "aria-expanded": compact ? "false" : "true",
        onClick: function () {
          state.scene_collapsed = !compact;
          markDirty();
          render();
        },
      }, compact ? "Expand" : "Collapse");

      /* v1.5.0: compact state — one-line semantic summary with the dice,
       * shuffle and expand controls. */
      if (compact) {
        const summary = el("div", { class: "krea2-scene-summary" }, [
          el("strong", { class: "krea2-scene-name" },
            setting.enabled && setting.name ? setting.name : "Scene"),
          el("span", {
            class: "krea2-scene-summary-text",
            title: setting.description || "",
          }, setting.enabled
            ? (setting.description || "No description yet — expand to describe the scene.")
            : "Not included yet — expand to describe the scene."),
        ]);
        const actions = el("div", { class: "krea2-scene-compact-actions" }, [
          el("label", { class: "krea2-inline-check", title: "Include this scene in the prompt" }, [
            el("input", { type: "checkbox", checked: !!setting.enabled, onChange: function (event) { setting.enabled = !!event.target.checked; markDirty(); render(); } }),
            el("span", null, "Include"),
          ]),
          sceneDice,
          sceneShuffle,
          expandBtn,
        ]);
        section.appendChild(el("div", { class: "krea2-scene-compact-row" }, [summary, actions]));
        return section;
      }

      const heading = el("div", { class: "krea2-structured-heading" }, [
        el("strong", null, "Scene"),
        el("span", { class: "krea2-structured-spacer" }),
        el("label", { class: "krea2-inline-check" }, [
          el("input", { type: "checkbox", checked: !!setting.enabled, onChange: function (event) { setting.enabled = !!event.target.checked; markDirty(); render(); } }),
          el("span", null, "Include"),
        ]),
        sceneShuffle,
        expandBtn,
      ]);
      section.appendChild(heading);
      const toolbar = el("div", { class: "krea2-structured-toolbar krea2-scene-toolbar" });
      const builtins = el("select", {
        class: "krea2-compact-select krea2-scene-select",
        "aria-label": "Selected scene",
        title: "Pick a scene — it applies immediately",
        onChange: function (event) {
          const preset = SETTING_PRESETS[Number(event.target.value)];
          if (!preset) return;
          setting.enabled = true; setting.name = preset[0]; setting.description = preset[1];
          markDirty(); render();
        },
      });
      builtins.appendChild(el("option", { value: "" }, "Selected scene: " + (setting.enabled && setting.name ? setting.name : "— choose one —")));
      SETTING_PRESETS.forEach(function (preset, index) { builtins.appendChild(el("option", { value: String(index) }, preset[0])); });
      const saved = el("select", {
        class: "krea2-compact-select krea2-scene-select",
        "aria-label": "Saved scene presets",
        onChange: function (event) {
          const preset = savedSettings[Number(event.target.value)];
          if (!preset) return;
          state.setting = cloneJson(preset.setting);
          markDirty(); render();
        },
      });
      saved.appendChild(el("option", { value: "" }, "Saved scenes..."));
      const savedSettings = savedPresets.filter(function (preset) { return preset.scope === "setting"; })
        .concat(state.setting_presets || []);
      savedSettings.forEach(function (preset, index) { saved.appendChild(el("option", { value: String(index) }, preset.label || "Scene")); });
      toolbar.append(
        builtins,
        sceneDice,
        saved,
        el("button", {
          type: "button",
          class: "krea2-wizard-btn",
          title: "Save the current scene as a reusable preset",
          onClick: function () {
            const label = String(setting.name || "Scene").trim();
            if (!label) { showToast("Choose or name the scene first", "warning"); return; }
            const existing = findExistingSavedPreset("setting", label);
            if (existing && !window.confirm(
              "A scene preset named \u201c" + label + "\u201d already exists. Overwrite it?",
            )) return;
            const payload = { scope: "setting", setting: cloneJson(setting) };
            if (existing) {
              Object.assign(existing, payload, { label: label });
            } else {
              savedPresets.push(Object.assign({ id: makeSavedPresetId("setting", ""), label: label }, payload));
            }
            persistSavedPresets(existing ? "Scene preset overwritten" : "Scene preset saved");
          },
        }, "Save scene"),
      );
      section.appendChild(toolbar);
      const description = el("textarea", {
        class: "krea2-compact-textarea krea2-scene-description",
        rows: "2",
        "aria-label": "Scene description",
        placeholder: "Describe the scene's background and atmosphere…",
        onInput: function (event) { setting.description = event.target.value; autoExpandTextarea(event); markDirty(); },
      }, setting.description || "");
      autoExpandTextarea({ target: description });
      section.appendChild(el("div", { class: "krea2-setting-grid" }, [
        el("label", { class: "krea2-field-wide" }, [el("span", null, "Description"), description]),
      ]));
      return section;
    }

    function exportStructuredPresets() {
      const payload = JSON.stringify({ characters: state.characters, character_presets: state.character_presets, setting: state.setting, setting_presets: state.setting_presets }, null, 2);
      const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
      const anchor = el("a", { href: url, download: "krea2-characters-and-settings.json" });
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    }

    function importStructuredPresets(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const payload = JSON.parse(String(reader.result || "{}"));
          if (Array.isArray(payload.characters)) state.characters = payload.characters.filter(function (item) { return item && typeof item === "object"; });
          if (Array.isArray(payload.character_presets)) state.character_presets = payload.character_presets;
          if (payload.setting && typeof payload.setting === "object") state.setting = payload.setting;
          if (Array.isArray(payload.setting_presets)) state.setting_presets = payload.setting_presets;
          state.selected_character_id = state.characters.length ? state.characters[0].id : null;
          markDirty(); renderStructuredEditors(); showToast("Characters and settings imported", "info");
        } catch (error) { showToast("That preset file is not valid JSON", "error"); }
      };
      reader.readAsText(file);
      event.target.value = "";
    }

    function undo() {
      if (undoStack.length === 0) return;
      redoStack.push(JSON.stringify(state));
      state = coerceState(JSON.parse(undoStack.pop()));
      dirty = true;
      persistedState = JSON.stringify(state);
      persist();
      updateHistoryControls();
      render();
    }

    function redo() {
      if (redoStack.length === 0) return;
      undoStack.push(JSON.stringify(state));
      state = coerceState(JSON.parse(redoStack.pop()));
      dirty = true;
      persistedState = JSON.stringify(state);
      persist();
      updateHistoryControls();
      render();
    }

    function updateHistoryControls() {
      undoBtn.disabled = undoStack.length === 0;
      redoBtn.disabled = redoStack.length === 0;
    }

    function presetToRow(preset, state) {
      const initialStrength = Math.round(Math.max(-3, Math.min(3,
        (Number(preset.default_strength) || 0) / 20)) * 4) / 4;
      return {
        id: uniqueRowId(state),
        category: preset.category || "custom",
        preset_id: preset.id || "",
        label: preset.label || "",
        phrase: preset.phrase || "",
        control_mode: preset.control_mode || "scalar",
        intensity: parseInt(preset.default_strength, 10) || 0,
        strength: initialStrength,
        enabled: true,
        aliases: preset.aliases || [],
        verification: preset.verification || "general visual vocabulary",
        source: preset.source || "library",
        positive_phrase: preset.positive_phrase,
        negative_phrase: preset.negative_phrase,
        neutral_phrase: preset.neutral_phrase,
        safe_weight_min: preset.safe_weight_min,
        safe_weight_max: preset.safe_weight_max,
        compatible_profiles: preset.compatible_profiles || [],
      };
    }

    function togglePreset(preset, shouldSelect) {
      if (shouldSelect) {
        if (!state.rows.some(function (row) { return row.preset_id === preset.id; })) {
          state.rows.push(presetToRow(preset, state));
        }
      } else {
        state.rows = state.rows.filter(function (row) {
          return row.preset_id !== preset.id;
        });
      }
      markDirty();
      saveConceptColors(state.concept_colors).catch(function () {});
      render();
    }

    function replaceGroupWithRandom(group) {
      state.rows = state.rows.filter(function (row) {
        return groupForCategory(row.category) !== group;
      });
      const allowed = new Set(RANDOM_GROUP_CATEGORIES[group]);
      const candidates = compatibleLibrary().filter(function (preset) {
        return allowed.has(preset.category) && !preset.disabled;
      });
      for (let i = candidates.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const swap = candidates[i];
        candidates[i] = candidates[j];
        candidates[j] = swap;
      }
      const minimum = Math.min(2, candidates.length);
      const maximum = Math.min(6, candidates.length);
      const count = minimum + Math.floor(Math.random() * (maximum - minimum + 1));
      for (const preset of candidates.slice(0, count)) {
        const row = presetToRow(preset, state);
        row.strength = randomStrengthValue();
        state.rows.push(row);
      }
    }

    function presetMedia(preset) {
      const category = preset.category || "";
      const text = [
        preset.id || "", preset.label || "", preset.phrase || "",
        (preset.tags || []).join(" "),
      ].join(" ").toLowerCase();
      if (category === "camera_body" || category === "lens_family") return "photo";
      if (category !== "style") return "common";
      if (/(photograph|photographic|film still|fashion editorial|direct.flash|cinematic)/.test(text)) {
        return "photo";
      }
      return "art";
    }

    function presetMatchesCreativeMode(preset) {
      const media = presetMedia(preset);
      return media === "common" || media === (state.creative_mode || "photo");
    }

    function compatibleLibrary() {
      return library.filter(presetMatchesCreativeMode);
    }

    function buildCreativeModeControl() {
      const wrap = el("div", {
        class: "krea2-wizard-creative-mode",
        title: "Choose concepts suited to photography or artwork",
      });
      for (const option of [
        { value: "photo", label: "Photography" },
        { value: "art", label: "Artwork" },
      ]) {
        wrap.appendChild(el("button", {
          type: "button",
          class: "krea2-wizard-creative-option"
            + ((state.creative_mode || "photo") === option.value ? " is-active" : ""),
          onClick: function () {
            if (state.creative_mode === option.value) return;
            state.creative_mode = option.value;
            for (const button of wrap.querySelectorAll(".krea2-wizard-creative-option")) {
              button.classList.toggle("is-active", button.textContent === option.label);
            }
            markDirty();
            render();
          },
        }, option.label));
      }
      return wrap;
    }

    function randomizeGroup(group) {
      if (!library.length) {
        showToast("The concept library is still loading.", "warning");
        return;
      }
      replaceGroupWithRandom(group);
      markDirty();
      saveConceptColors(state.concept_colors).catch(function () {});
      render();
      showToast(GROUP_LABELS[group] + " randomized", "info");
    }

    function randomizeAll() {
      if (!library.length) {
        showToast("The concept library is still loading.", "warning");
        return;
      }
      if (!window.confirm("Replace all current concepts with a random combination?")) return;
      for (const group of GROUPS) replaceGroupWithRandom(group);
      markDirty();
      render();
      showToast("All concept groups randomized", "info");
    }

    function buildBasePrompt() {
      const ta = el("textarea", {
        class: "krea2-wizard-base",
        "aria-label": "Additional scene information",
        placeholder: "Describe the scene, subject, mood, lighting, camera, or style.",
        onInput: function (e) {
          state.base_prompt = e.target.value;
          sizeBasePrompt();
          markDirty();
          syncNodeHeight();
        },
      }, state.base_prompt || "");
      return {
        root: el("div", { class: "krea2-wizard-prompt-field" }, [
          el("div", { class: "krea2-wizard-prompt-label-row" }, [
            el("label", { class: "krea2-wizard-prompt-title" }, "Additional info"),
            el("span", { class: "krea2-wizard-prompt-helper" }, "Scene, mood, camera or style notes"),
          ]),
          ta,
        ]),
        input: ta,
      };
    }

    function buildShowWorkToggle(state) {
      const btn = el("button", {
        type: "button",
        class: "krea2-wizard-btn",
        onClick: function () {
          state.show_work = !state.show_work;
          markDirty();
          render();
        },
      }, state.show_work ? "Hide Work" : "Show Work");
      return btn;
    }

    function buildSavedPresetControl() {
      const select = el("select", {
        class: "krea2-wizard-saved-select",
        "aria-label": "Saved prompt and group presets",
      });
      const load = el("button", {
        type: "button",
        class: "krea2-wizard-btn",
        onClick: loadSelectedSavedPreset,
      }, "Load");
      const remove = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-danger",
        onClick: deleteSelectedSavedPreset,
      }, "Delete");
      const save = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-wizard-save",
        title: "Save the entire node setup (prompt, characters, scene, concepts) as a preset",
        onClick: saveFullPreset,
      }, "Save Full Prompt");
      return {
        root: el("div", { class: "krea2-wizard-saved" }, [
          el("span", { class: "krea2-wizard-saved-label" }, "My presets"),
          select,
          load,
          remove,
          save,
        ]),
        select: select,
        load: load,
        remove: remove,
      };
    }

    function refreshSavedPresetSelect() {
      const current = savedPresetControl.select.value;
      savedPresetControl.select.innerHTML = "";
      savedPresetControl.select.appendChild(el("option", { value: "" }, "Choose a saved preset..."));
      const ordered = savedPresets.filter(function (preset) {
        return !preset.builtin && (preset.scope === "full" || preset.scope === "group");
      }).sort(function (a, b) {
        return (a.scope + a.label).localeCompare(b.scope + b.label);
      });
      for (const preset of ordered) {
        const prefix = preset.scope === "full"
          ? "Full"
          : (GROUP_LABELS[preset.group] || "Group");
        savedPresetControl.select.appendChild(
          el("option", { value: preset.id }, prefix + " · " + preset.label));
      }
      savedPresetControl.select.value = ordered.some(function (preset) {
        return preset.id === current;
      }) ? current : "";
      const disabled = ordered.length === 0;
      savedPresetControl.load.disabled = disabled;
      savedPresetControl.remove.disabled = disabled;
    }

    function cloneRowsWithFreshIds(rows) {
      const occupied = state.rows.slice();
      return (rows || []).map(function (row) {
        const copy = JSON.parse(JSON.stringify(row));
        copy.id = uniqueRowId({ rows: occupied });
        occupied.push(copy);
        return copy;
      });
    }

    function makeSavedPresetId(scope, group) {
      return "saved_" + scope + "_" + (group || "all") + "_"
        + Date.now().toString(36) + "_" + Math.random().toString(16).slice(2, 7);
    }

    function askPresetName(message) {
      const name = window.prompt(message, "");
      return name && name.trim() ? name.trim() : "";
    }

    function findExistingSavedPreset(scope, label) {
      const needle = String(label || "").trim().toLowerCase();
      if (!needle) return null;
      return savedPresets.find(function (preset) {
        return preset.scope === scope && String(preset.label || "").trim().toLowerCase() === needle;
      }) || null;
    }

    function persistSavedPresets(successMessage) {
      return saveSavedPresets(savedPresets).then(function (presets) {
        savedPresets = presets;
        refreshSavedPresetSelect();
        render();
        showToast(successMessage, "info");
      }).catch(function (error) {
        showToast(error.message || "Could not save preset.", "error");
      });
    }

    function saveFullPreset() {
      const label = askPresetName("Name this full prompt preset");
      if (!label) return;
      const existing = findExistingSavedPreset("full", label);
      if (existing && !window.confirm(
        "A full prompt preset named \u201c" + label + "\u201d already exists. Overwrite it?",
      )) return;
      const payload = {
        scope: "full",
        group: "",
        base_prompt: state.base_prompt || "",
        randomize_on_job: JSON.parse(JSON.stringify(state.randomize_on_job || {})),
        creative_mode: state.creative_mode || "photo",
        rows: JSON.parse(JSON.stringify(state.rows)),
      };
      if (existing) {
        Object.assign(existing, payload, { label: label });
      } else {
        savedPresets.push(Object.assign({ id: makeSavedPresetId("full", ""), label: label }, payload));
      }
      persistSavedPresets(existing ? "Full prompt preset overwritten" : "Full prompt preset saved");
    }

    function saveGroupPreset(group) {
      const rows = state.rows.filter(function (row) {
        return groupForCategory(row.category) === group;
      });
      if (!rows.length) {
        showToast("Add at least one concept to this group first.", "warning");
        return;
      }
      const label = askPresetName("Name this " + GROUP_LABELS[group] + " preset");
      if (!label) return;
      const existing = savedPresets.find(function (preset) {
        return preset.scope === "group" && preset.group === group
          && String(preset.label || "").trim().toLowerCase() === label.toLowerCase();
      }) || null;
      if (existing && !window.confirm(
        "A " + GROUP_LABELS[group] + " preset named \u201c" + label + "\u201d already exists. Overwrite it?",
      )) return;
      const payload = {
        scope: "group",
        group: group,
        base_prompt: "",
        rows: JSON.parse(JSON.stringify(rows)),
      };
      if (existing) {
        Object.assign(existing, payload, { label: label });
      } else {
        savedPresets.push(Object.assign({ id: makeSavedPresetId("group", group), label: label }, payload));
      }
      persistSavedPresets(existing ? GROUP_LABELS[group] + " preset overwritten" : GROUP_LABELS[group] + " preset saved");
    }

    function loadSelectedSavedPreset() {
      const preset = savedPresets.find(function (item) {
        return item.id === savedPresetControl.select.value;
      });
      if (!preset) return;
      if (preset.scope === "full") {
        state.base_prompt = preset.base_prompt || "";
        state.randomize_on_job = JSON.parse(JSON.stringify(preset.randomize_on_job || {}));
        state.creative_mode = preset.creative_mode || state.creative_mode || "photo";
        state.rows = cloneRowsWithFreshIds(preset.rows);
      } else {
        state.rows = state.rows.filter(function (row) {
          return groupForCategory(row.category) !== preset.group;
        });
        state.rows.push.apply(state.rows, cloneRowsWithFreshIds(preset.rows));
      }
      markDirty();
      render();
      showToast(preset.label + " loaded", "info");
    }

function loadGroupPreset(group, presetId) {
      const preset = savedPresets.find(function (item) {
        return item.id === presetId && item.scope === "group" && item.group === group;
      });
      if (!preset) return;
      state.rows = state.rows.filter(function (row) {
        return groupForCategory(row.category) !== group;
      });
      if (!library.length) {
        showToast("The concept library is still loading. Please try again in a moment.", "warning");
        return;
      }
      var newRows = cloneRowsWithFreshIds(preset.rows).filter(function (row) {
        return groupForCategory(row.category) === group;
      });
      for (var i = 0; i < newRows.length; i++) {
        var libPreset = library.find(function (p) { return p.id === newRows[i].preset_id; });
        if (!libPreset) continue;
        newRows[i].label = libPreset.label || "";
        newRows[i].phrase = libPreset.phrase || "";
      }
      newRows = newRows.filter(function (row) { return row.label && row.phrase; });
      if (!newRows.length) {
        showToast("This preset has no usable concepts for this section.", "warning");
        return;
      }
      state.rows.push.apply(state.rows, newRows);
      state.loaded_group_presets = state.loaded_group_presets || {};
      state.loaded_group_presets[group] = presetId;
      markDirty();
      var raf = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 0); };
      raf(function () {
        render();
        showToast(preset.label + " loaded", "info");
      });
    }

function buildGroupPresetPicker(group) {
      const select = el("select", {
        class: "krea2-wizard-group-preset",
        "aria-label": GROUP_LABELS[group] + " saved presets",
        onChange: function (event) {
          const presetId = event.target.value;
          select.value = "";
          if (presetId) loadGroupPreset(group, presetId);
        },
      });
      select.appendChild(el("option", { value: "" }, "Load preset..."));
      var groupPresets = savedPresets.filter(function (item) {
        return item.scope === "group" && item.group === group
          && Array.isArray(item.rows)
          && item.rows.some(function (row) { return groupForCategory(row.category) === group; });
      });
      for (const preset of groupPresets) {
        select.appendChild(el("option", { value: preset.id }, preset.label));
      }
      var lastLoaded = (state.loaded_group_presets || {})[group];
      if (lastLoaded && groupPresets.some(function (p) { return p.id === lastLoaded; })) {
        select.value = lastLoaded;
      }
      return { select: select };
    }

    function deleteSelectedSavedPreset() {
      const id = savedPresetControl.select.value;
      const preset = savedPresets.find(function (item) { return item.id === id; });
      if (!preset || !window.confirm("Delete saved preset “" + preset.label + "”?")) return;
      savedPresets = savedPresets.filter(function (item) { return item.id !== id; });
      persistSavedPresets("Saved preset deleted");
    }

    function buildMasterPresetControl() {
      const select = el("select", {
        class: "krea2-wizard-master-select",
        "aria-label": "Style presets",
      });
      select.appendChild(el("option", { value: "" }, "Style presets..."));
      return select;
    }

    function refreshMasterPresetSelect() {
      const current = masterPresetSelect.value;
      masterPresetSelect.innerHTML = "";
      masterPresetSelect.appendChild(el("option", { value: "" }, "Style presets..."));
      masterPresets.slice().sort(function (a, b) {
        return String(a.label || "").toLowerCase().localeCompare(String(b.label || "").toLowerCase());
      }).forEach(function (preset) {
        masterPresetSelect.appendChild(el("option", { value: preset.id }, preset.label));
      });
      masterPresetSelect.value = masterPresets.some(function (p) {
        return p.id === current;
      }) ? current : "";
      masterPresetSelect.onchange = function () {
        loadMasterPreset(masterPresetSelect.value);
      };
    }

    function loadMasterPreset(presetId) {
      if (!presetId) return;
      const preset = masterPresets.find(function (p) { return p.id === presetId; });
      if (!preset) return;
      // A style/shot preset replaces the camera, lighting and environment
      // sections; warn first when those sections already have content.
      const replaced = state.rows.some(function (row) {
        return ["framing", "angle", "lens", "aperture", "lighting_setup", "lighting_direction",
          "lighting_effect", "atmosphere", "environment_movement"].includes(row.category);
      });
      if (replaced && typeof window.confirm === "function"
          && !window.confirm("This style replaces your camera, lighting and environment setups. Continue?")) {
        return;
      }
      const newRows = [];
      for (const mpRow of (preset.rows || [])) {
        const libPreset = library.find(function (p) { return p.id === mpRow.preset_id; });
        if (!libPreset) continue;
        const row = presetToRow(libPreset, state);
        row.intensity = mpRow.intensity || 0;
        row.strength = Math.round(Math.max(-3, Math.min(3,
          (Number(mpRow.intensity) || 0) / 20)) * 4) / 4;
        newRows.push(row);
      }
      if (!newRows.length) {
        showToast("No matching presets found for " + preset.label, "warning");
        return;
      }
      state.rows = newRows;
      // A shot preset is a full preset: it also names and describes the scene.
      if (preset.setting && typeof preset.setting === "object") {
        state.setting = {
          enabled: true,
          name: String(preset.setting.name || "Scene"),
          description: String(preset.setting.description || ""),
        };
      }
      state.master_preset_id = presetId;
      state.master_preset_label = preset.label;
      markDirty();
      render();
      showToast("Shot preset \u201c" + preset.label + "\u201d loaded", "info");
    }

    function buildLivePreview() {
      var codeText = el("div", { class: "krea2-wizard-preview" }, "");
      var prettyBody = el("div", { class: "krea2-preview-pretty" });
      var codeLabel = el("div", { class: "krea2-preview-cat-label" }, "Prompt code");
      var copyBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: function () {
        copy(codeText.textContent);
      } }, "Copy shown prompt");
      var historySelect = el("select", {
        class: "krea2-compact-select krea2-prompt-history",
        "aria-label": "Generated prompt history",
        onChange: function () {
          const prompt = executionHistory[Number(historySelect.value)];
          if (!prompt) return;
          codeText.textContent = prompt;
        },
      });
      historySelect.appendChild(el("option", { value: "" }, "No generated prompts yet"));
      var copyGenerated = el("button", { type: "button", class: "krea2-wizard-btn", onClick: function () {
        const prompt = executionHistory[Number(historySelect.value)] || executionHistory[executionHistory.length - 1];
        if (!prompt) { showToast("Run the workflow first", "warning"); return; }
        copy(prompt);
      } }, "Copy generated prompt");
      var root = el("div", { class: "krea2-wizard-preview-host" }, [
        prettyBody,
        codeLabel,
        codeText,
        el("div", { class: "krea2-wizard-preview-buttons" }, [historySelect, copyGenerated, copyBtn]),
      ]);
      return { root: root, previewBody: prettyBody, prettyBody: prettyBody, codeText: codeText, codeLabel: codeLabel, historySelect: historySelect };
    }

    function renderLivePreview(requestAuthoritativePreview) {
      try {
        var signature = JSON.stringify(state);
        var compiled = latestPreview && latestPreview.signature === signature
          ? latestPreview.result
          : compilePreview(state);
        renderPrettyPreview(compiled);
        renderCodePreview(compiled);
        showWork.innerHTML = "";
        if (state.show_work) {
          showWork.appendChild(renderShowWork(state, compiled));
        }
        if (requestAuthoritativePreview !== false) {
          schedulePreview(signature);
        }
      } catch (e) {
        console.warn("[Krea2PromptWizard] renderLivePreview error", e);
      }
    }

    function renderPrettyPreview(compiled) {
      var host = livePreview.prettyBody;
      host.innerHTML = "";
      if (!compiled || !compiled.category_prompts) return;
      var structuredLabels = (state.characters || []).filter(function (character) {
        return character && character.enabled !== false;
      }).map(function (character) { return character.name || "Character"; });
      if (state.setting && state.setting.enabled) structuredLabels.push(state.setting.name || "Setting");
      if (structuredLabels.length) {
        host.appendChild(el("div", { class: "krea2-preview-block" }, [
          el("div", { class: "krea2-preview-group-title" }, "People & Setting"),
          el("div", { class: "krea2-preview-cat-item" }, structuredLabels.join(" · ")),
        ]));
      }
      var catRaw = compiled.category_prompts;
      var fragmentByRow = new Map((compiled.fragments || []).map(function (f) { return [f.row_id, f]; }));
      var anyContent = false;
      for (var gi = 0; gi < GROUPS.length; gi++) {
        var group = GROUPS[gi];
        var categories = GROUP_CATEGORIES[group];
        var groupParts = [];
        for (var ci = 0; ci < categories.length; ci++) {
          var cat = categories[ci];
          var raw = catRaw[cat];
          var items = [];
          if (Array.isArray(raw)) {
            items = raw.filter(Boolean);
          } else if (typeof raw === "string" && raw.trim()) {
            items = [raw.trim()];
          }
          if (!items.length) continue;
          var catItems = [];
          for (var ri = 0; ri < state.rows.length; ri++) {
            var row = state.rows[ri];
            if (row.category !== cat || row.enabled === false) continue;
            var fragment = fragmentByRow.get(row.id);
            if (fragment && fragment.fragment) {
              var text = fragment.fragment;
              var btn = el("button", {
                type: "button",
                class: "krea2-preview-concept",
                dataset: { rowId: row.id },
                onMouseEnter: function (id) { return function () { setRowHover(id, true); }; }(row.id),
                onMouseLeave: function (id) { return function () { setRowHover(id, false); }; }(row.id),
                onClick: function (id) { return function () { focusRow(id); }; }(row.id),
              }, text);
              catItems.push(el("div", { class: "krea2-preview-cat-item" }, [btn]));
            }
          }
          groupParts.push({ label: CATEGORY_LABELS[cat] || cat, items: catItems });
        }
        if (!groupParts.length) continue;
        anyContent = true;
        var block = el("div", { class: "krea2-preview-block" });
        block.appendChild(el("div", { class: "krea2-preview-group-title" }, GROUP_LABELS[group]));
        for (var pi = 0; pi < groupParts.length; pi++) {
          var part = groupParts[pi];
          block.appendChild(el("div", { class: "krea2-preview-cat-label" }, part.label));
          for (var ii = 0; ii < part.items.length; ii++) {
            block.appendChild(part.items[ii]);
          }
        }
        host.appendChild(block);
      }
    }

    function renderCodePreview(compiled) {
      var host = livePreview.codeText;
      host.innerHTML = "";
      if ((state.characters || []).some(function (character) { return character && character.enabled !== false; })
          || (state.setting && state.setting.enabled)) {
        host.textContent = compiled.final_prompt || "";
        return;
      }
      var parts = [];
      if ((state.base_prompt || "").trim()) {
        parts.push({ text: state.base_prompt.trim(), rowId: "" });
      }
      var fragmentByRow = new Map((compiled.fragments || []).map(function (fragment) {
        return [fragment.row_id, fragment];
      }));
      for (var ci = 0; ci < CATEGORIES.length; ci++) {
        var cat = CATEGORIES[ci];
        for (var ri = 0; ri < state.rows.length; ri++) {
          var row = state.rows[ri];
          if (row.category !== cat || row.enabled === false) continue;
          var fragment = fragmentByRow.get(row.id);
          if (fragment && fragment.fragment) {
            parts.push({ text: fragment.fragment, rowId: row.id });
          }
        }
      }
      parts.forEach(function (part, index) {
        if (index) host.appendChild(document.createTextNode(", "));
        if (!part.rowId) {
          host.appendChild(document.createTextNode(part.text));
          return;
        }
        host.appendChild(el("button", {
          type: "button",
          class: "krea2-preview-concept",
          dataset: { rowId: part.rowId },
          onMouseEnter: function () { setRowHover(part.rowId, true); },
          onMouseLeave: function () { setRowHover(part.rowId, false); },
          onClick: function () { focusRow(part.rowId); },
        }, part.text));
      });
    }

    function setRowHover(rowId, active) {
      for (const element of root.querySelectorAll('[data-row-id="' + rowId + '"]')) {
        element.classList.toggle("is-linked-hover", active);
      }
    }

    function focusRow(rowId) {
      const row = state.rows.find(function (item) { return item.id === rowId; });
      if (!row) return;
      const group = groupForCategory(row.category);
      state.active_tab = "concepts";
      state.collapsed = state.collapsed || {};
      state.collapsed[group] = false;
      render();
      const schedule = window.requestAnimationFrame || window.setTimeout;
      schedule(function () {
        const card = root.querySelector('.krea2-row[data-row-id="' + rowId + '"]');
        if (!card) return;
        if (card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("is-focus-flash");
        window.setTimeout(function () { card.classList.remove("is-focus-flash"); }, 1200);
      }, 0);
    }

    function editRow(row) {
      const group = groupForCategory(row.category);
      showSearchableSelector({
        presets: compatibleLibrary(),
        title: "Replace " + (row.label || "concept"),
        categories: GROUP_CATEGORIES[group],
        multiSelect: false,
        selectedIds: [row.preset_id],
        initialPresetId: row.preset_id,
        onClose: function () { render(); },
        getConceptColor: function (presetId) { return (state.concept_colors || {})[presetId] || ""; },
        onColorChange: function (presetId, newColor) {
          state.concept_colors = state.concept_colors || {};
          if (newColor) state.concept_colors[presetId] = newColor;
          else delete state.concept_colors[presetId];
          markDirty();
        },
        onPick: function (preset) {
          const replacement = presetToRow(preset, state);
          replacement.id = row.id;
          replacement.strength = row.strength;
          replacement.enabled = row.enabled;
          const index = state.rows.findIndex(function (item) { return item.id === row.id; });
          if (index >= 0) state.rows[index] = replacement;
          markDirty();
          render();
          focusRow(replacement.id);
        },
      });
    }

    const schedulePreview = debounce(requestPreview, 140);

    function requestPreview(signature) {
      if (latestPreview && latestPreview.signature === signature) return;
      const requestId = ++previewSequence;
      const previewState = JSON.parse(signature);
      fetchCompiledPreview(previewState).then(function (compiled) {
        if (requestId !== previewSequence) return;
        latestPreview = { signature: signature, result: compiled };
        if (signature === JSON.stringify(state)) renderLivePreview(false);
      }).catch(function () {
        // Keep the instant local preview available if the optional API route is unavailable.
      });
    }

    function renderGroupSections(host, groups) {
      for (const group of groups) {
        const rows = state.rows.filter(function (row) {
          return groupForCategory(row.category) === group;
        });
        const collapsed = !!(state.collapsed || {})[group];
        const section = el("section", {
          class: "krea2-wizard-category" + (collapsed ? " is-collapsed" : ""),
        });
        const header = el("div", { class: "krea2-wizard-category-header" }, [
          el("strong", { class: "krea2-wizard-category-title" }, GROUP_LABELS[group]),
          el("span", { class: "krea2-wizard-category-summary", title: rows.map(function (row) {
            return row.label || row.preset_id;
          }).join(", ") }, rows.map(function (row) {
            return row.label || row.preset_id;
          }).join(" · ")),
          el("span", { class: "krea2-wizard-category-count" },
            rows.length + (rows.length === 1 ? " concept" : " concepts")),
        ]);
        const addBtn = el("button", {
          type: "button",
          class: "krea2-wizard-category-add",
          onClick: function (event) {
            if (event && typeof event.stopPropagation === "function") event.stopPropagation();
            showSearchableSelector({
              presets: compatibleLibrary(),
              title: "Add " + GROUP_LABELS[group] + " concepts",
              categories: GROUP_CATEGORIES[group],
              multiSelect: true,
              selectedIds: rows.map(function (row) { return row.preset_id; }),
              onToggle: togglePreset,
              onClose: function () { render(); },
              getConceptColor: function (presetId) { return (state.concept_colors || {})[presetId] || ""; },
              onColorChange: function (presetId, newColor) {
                state.concept_colors = state.concept_colors || {};
                if (newColor) state.concept_colors[presetId] = newColor;
                else delete state.concept_colors[presetId];
                markDirty();
              },
            });
          },
        }, "+ Add");
        const randomBtn = diceButton(
          "Replace this group with a random combination",
          function (event) {
            if (event && typeof event.stopPropagation === "function") event.stopPropagation();
            randomizeGroup(group);
          },
          "krea2-wizard-category-random krea2-icon-btn",
        );
        const saveBtn = el("button", {
          type: "button",
          class: "krea2-wizard-category-save",
          title: "Save these concepts and their values as a reusable group preset",
          onClick: function (event) {
            if (event && typeof event.stopPropagation === "function") event.stopPropagation();
            saveGroupPreset(group);
          },
        }, "Save preset");
        const groupPreset = buildGroupPresetPicker(group);
        const eachJobOn = !!(state.randomize_on_job || {})[group];
        const randomEachJob = el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-icon-btn krea2-shuffle" + (eachJobOn ? " is-active" : ""),
          title: eachJobOn
            ? "Shuffle on: this group is randomized for every queued job. Click to stop."
            : "Shuffle off: this group is randomized once when you press the dice. Click to randomize it every queued job.",
          "aria-label": "Randomize this group every queued job",
          onClick: function (event) {
            if (event && typeof event.stopPropagation === "function") event.stopPropagation();
            state.randomize_on_job = state.randomize_on_job || {};
            state.randomize_on_job[group] = !state.randomize_on_job[group];
            markDirty();
            render();
          },
        }, icon("shuffle", { width: "13", height: "13" }));
        const randomControls = el("div", { class: "krea2-wizard-random-controls" }, [
          randomBtn,
          randomEachJob,
        ]);
        const actions = el("div", { class: "krea2-wizard-category-actions" }, [
          addBtn,
          groupPreset.select,
          saveBtn,
          randomControls,
        ]);
        const content = el("div", { class: "krea2-wizard-category-content" });
        if (rows.length === 0) {
          content.appendChild(el("div", { class: "krea2-wizard-empty" },
            "No concepts yet. Add your own or use the dice."));
        } else {
          for (const row of rows) {
            content.appendChild(renderRow(row, {
              presets: library,
              conceptColors: state.concept_colors,
              markDirty: markDirty,
              persistConceptColors: function () { saveConceptColors(state.concept_colors || {}).catch(function () {}); },
              refresh: render,
              removeRow: function (id) {
                state.rows = state.rows.filter(function (r) { return r.id !== id; });
                markDirty();
                render();
              },
              onReorder: function (parent) {
                const ids = Array.prototype.map.call(parent.querySelectorAll(".krea2-row"), function (el) { return el.dataset.rowId; });
                const reordered = ids.map(function (id) {
                  return state.rows.find(function (row) { return row.id === id; });
                }).filter(Boolean);
                const groupIds = new Set(rows.map(function (row) { return row.id; }));
                state.rows = state.rows.map(function (row) {
                  return groupIds.has(row.id) ? reordered.shift() : row;
                });
                markDirty();
              },
              editRow: editRow,
              onHover: setRowHover,
            }));
          }
        }
        header.addEventListener("click", function () {
          state.collapsed = state.collapsed || {};
          state.collapsed[group] = !state.collapsed[group];
          content.style.display = state.collapsed[group] ? "none" : "";
          actions.style.display = state.collapsed[group] ? "none" : "";
          section.classList.toggle("is-collapsed", state.collapsed[group]);
          markDirty();
        });
        if (collapsed) {
          content.style.display = "none";
          actions.style.display = "none";
        }
        section.appendChild(header);
        section.appendChild(actions);
        section.appendChild(content);
        host.appendChild(section);
      }
    }

    /* Groups owned by the Scene tab: subject/expression, camera, lighting,
     * environment, style. The global Subject & Expression pool covers the
     * subject's body language and expression concepts that are not owned by
     * a specific cast member (per-character direction stays in the Cast tab). */
    const SCENE_GROUPS = ["subject_expression", "camera_film", "lighting", "environment", "style_finish"];

    /* ------------------------------------------------------------------
     * v2 redesigned tabbed editor (CAST / SCENE).
     * ------------------------------------------------------------------ */

    /* The appearance controls on a cast card. Every field keeps its own
     * dice (randomize once) and shuffle (every job). Fields with a colour
     * (hair / eyes / skin) carry a colour pop-up button on the same row.
     * Dropdown options are alphabetical, except Age which runs youngest to
     * oldest. */
    function formatLoraValue(value) {
      const number = Math.round(Number(value) * 100) / 100;
      if (number === 0) return "0";
      return (number > 0 ? "+" : "") + String(number);
    }

    /* ------------------------------------------------------------------
     * v1.3.1-style appearance wall: every field on its own row with its
     * own dice (randomize once) and shuffle (every queued job).
     * ------------------------------------------------------------------ */
    const V2_APPEARANCE_FIELDS = (function () {
      const byKey = {};
      CHARACTER_APPEARANCE.forEach(function (field) { byKey[field.key] = field; });
      const eyesShapes = byKey.eyes.options.filter(function (option) {
        return !/(blue|green|hazel|brown|black|grey|amber|violet|heterochromatic)/.test(option);
      });
      const paletteNames = PALETTE_COLORS.map(function (entry) { return entry[0]; });
      return [
        { key: "sex", label: "Sex", options: byKey.sex.options },
        { key: "age", label: "Age", options: byKey.age.options, natural: true },
        { key: "ethnicity", label: "Ethnicity", options: byKey.ethnicity.options, colorKey: "skin_color", colorPalette: "character" },
        { key: "hair_style", label: "Hair", options: byKey.hair_style.options, colorKey: "hair_color", colorPalette: "character" },
        { key: "hair_length", label: "Hair length", options: byKey.hair_length.options },
        { key: "makeup", label: "Makeup", options: byKey.makeup.options },
        { key: "eyes", label: "Eye Shape", options: eyesShapes, colorKey: "eye_color", colorPalette: "character" },
        { key: "nose", label: "Nose", options: byKey.nose.options },
        { key: "mouth", label: "Mouth", options: byKey.mouth.options },
        { key: "chin", label: "Chin", options: byKey.chin.options },
        { key: "face_shape", label: "Face shape", options: byKey.face_shape.options },
        { key: "body_type", label: "Build", options: byKey.body_type.options },
        { key: "fitness", label: "Physique", options: byKey.fitness.options },
        { key: "proportions", label: "Height & Frame", options: byKey.proportions.options },
        { key: "clothing_top", label: "Top", options: byKey.clothing_top.options },
        { key: "clothing_bottom", label: "Bottom", options: byKey.clothing_bottom.options },
        { key: "ensemble", label: "Ensemble (full costume)", options: byKey.ensemble.options, wide: true },
      ];
    })();

    const IDENTITY_GENDER_CYCLE = ["", "female", "male", "unspecified"];
    const IDENTITY_AGE_CYCLE = ["", "child", "teenager", "young adult", "adult", "middle aged", "elderly"];
    const IDENTITY_ETHNICITY_CYCLE = (function () {
      const field = CHARACTER_APPEARANCE.find(function (f) { return f.key === "ethnicity"; });
      return field ? field.options.slice() : [];
    })();

    function capitalizeFirst(value) {
      const text = String(value || "");
      return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
    }

    /* Gender pills: three small buttons directly under the character name.
     * Single-select; only one choice at a time. */
    function renderGenderPills(character) {
      const row = el("div", { class: "krea2-v2-gender-pills", role: "radiogroup", "aria-label": "Gender" });
      for (const option of ["female", "male", "unspecified"]) {
        const active = String(character.sex || "") === option;
        row.appendChild(el("button", {
          type: "button",
          role: "radio",
          "aria-checked": active ? "true" : "false",
          class: "krea2-v2-gender-pill" + (active ? " is-active" : ""),
          title: "Set gender to " + option,
          onClick: function (event) {
            if (event && typeof event.stopPropagation === "function") if (event && typeof event.stopPropagation === "function") event.stopPropagation();
            character.sex = character.sex === option ? "" : option;
            markDirty();
            render();
          },
        }, capitalizeFirst(option)));
      }
      return row;
    }

    /* Per-field dice (randomize once) + shuffle (randomize every job). */
    function fieldRandomControls(character, field) {
      const randomBtn = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-field-random",
        title: "Roll " + field.label + " once now",
        "aria-label": "Randomize " + field.label + " once",
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          randomizeAppearanceField(character, field);
          markDirty();
          render();
        },
      }, icon("dice", { width: "12", height: "12" }));
      const eachJobOn = !!(character.randomize_fields || {})[field.key];
      const eachJobBtn = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-field-each-job krea2-shuffle" + (eachJobOn ? " is-active" : ""),
        title: eachJobOn
          ? field.label + " randomizes for every queued job. Click to keep it fixed."
          : "Randomize " + field.label + " for every queued job.",
        "aria-label": "Randomize " + field.label + " every queued job",
        "aria-pressed": eachJobOn ? "true" : "false",
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          setAppearanceFieldEachJob(character, field, !eachJobOn);
          markDirty();
          render();
        },
      }, icon("shuffle", { width: "12", height: "12" }));
      return el("div", { class: "krea2-v2-field-random-controls" }, [randomBtn, eachJobBtn]);
    }

    /* Colour pop-up button: shows the chosen colour, click to open a small
     * palette pop-up with a hex input inside. Used for hair / eye / skin
     * colour and for light colour. */
    function colourHexFor(name, palette) {
      const entry = palette.find(function (item) { return item[0] === name; });
      return entry ? entry[1] : "";
    }

    /* Photoshop / Adobe Express style colour picker pop-up: a hue bar on
     * top, a saturation/value square below it, and a Hex field with a copy
     * button at the bottom. The stored value stays a model-friendly colour
     * word (nearest palette entry); the Hex field always shows the hex. */
    function openColorPopup(anchor, palette, current, label, onPick) {
      const existing = document.querySelector(".krea2-color-popup");
      if (existing) existing.remove();
      const popup = el("div", { class: "krea2-color-popup krea2-color-popup-full" });
      popup.appendChild(el("div", { class: "krea2-color-popup-label" }, label));

      const HUE_W = 216;
      const HUE_H = 14;
      const SV_W = 216;
      const SV_H = 128;
      const svgNs = "http://www.w3.org/2000/svg";
      const mk = typeof document.createElementNS === "function"
        ? function (tag) { return document.createElementNS(svgNs, tag); }
        : function (tag) { return document.createElement(tag); };

      let hsv = hexToHsv(colourHexFor(String(current || ""), palette) || "#ffffff");
      const hexInput = el("input", {
        type: "text",
        class: "krea2-compact-input krea2-v2-palette-hex",
        value: hsvToHex(hsv),
        placeholder: "#rrggbb",
        "aria-label": label + " (hex code)",
        onKeyDown: function (event) {
          if (event.key === "Enter") {
            const name = paletteNearestName(hexInput.value, palette);
            if (name) { onPick(name); popup.remove(); }
          }
          if (typeof event.stopPropagation === "function") if (event && typeof event.stopPropagation === "function") event.stopPropagation();
        },
      });

      const commit = function () {
        const name = paletteNearestName(hsvToHex(hsv), palette);
        if (name) onPick(name);
      };

      /* Hue bar */
      const hueSvg = mk("svg");
      hueSvg.setAttribute("viewBox", "0 0 " + HUE_W + " " + HUE_H);
      hueSvg.setAttribute("width", String(HUE_W));
      hueSvg.setAttribute("height", String(HUE_H));
      hueSvg.setAttribute("class", "krea2-color-hue");
      const defs = mk("defs");
      const gradient = mk("linearGradient");
      gradient.setAttribute("id", "krea2-hue-grad");
      gradient.setAttribute("x1", "0");
      gradient.setAttribute("y1", "0");
      gradient.setAttribute("x2", "1");
      gradient.setAttribute("y2", "0");
      const hueStops = [
        ["0%", "#ff0000"], ["17%", "#ffff00"], ["33%", "#00ff00"], ["50%", "#00ffff"],
        ["67%", "#0000ff"], ["83%", "#ff00ff"], ["100%", "#ff0000"],
      ];
      for (const stop of hueStops) {
        const node = mk("stop");
        node.setAttribute("offset", stop[0]);
        node.setAttribute("stop-color", stop[1]);
        gradient.appendChild(node);
      }
      defs.appendChild(gradient);
      hueSvg.appendChild(defs);
      const hueRect = mk("rect");
      hueRect.setAttribute("x", "0"); hueRect.setAttribute("y", "0");
      hueRect.setAttribute("width", String(HUE_W)); hueRect.setAttribute("height", String(HUE_H));
      hueRect.setAttribute("rx", "7");
      hueRect.setAttribute("fill", "url(#krea2-hue-grad)");
      hueSvg.appendChild(hueRect);
      const hueHandle = mk("circle");
      hueHandle.setAttribute("r", "7");
      hueHandle.setAttribute("class", "krea2-color-handle");
      const positionHueHandle = function () {
        hueHandle.setAttribute("cx", String((hsv.h / 360) * HUE_W));
        hueHandle.setAttribute("cy", String(HUE_H / 2));
      };
      hueSvg.appendChild(hueHandle);
      positionHueHandle();

      /* Saturation / value square */
      const svSvg = mk("svg");
      svSvg.setAttribute("viewBox", "0 0 " + SV_W + " " + SV_H);
      svSvg.setAttribute("width", String(SV_W));
      svSvg.setAttribute("height", String(SV_H));
      svSvg.setAttribute("class", "krea2-color-sv");
      const svBase = mk("rect");
      svBase.setAttribute("width", String(SV_W)); svBase.setAttribute("height", String(SV_H));
      svBase.setAttribute("rx", "8");
      const svOverlayWhite = mk("rect");
      svOverlayWhite.setAttribute("width", String(SV_W)); svOverlayWhite.setAttribute("height", String(SV_H));
      svOverlayWhite.setAttribute("rx", "8");
      const svOverlayBlack = mk("rect");
      svOverlayBlack.setAttribute("width", String(SV_W)); svOverlayBlack.setAttribute("height", String(SV_H));
      svOverlayBlack.setAttribute("rx", "8");
      const updateSv = function () {
        const base = hsvToHex({ h: hsv.h, s: 1, v: 1 });
        svBase.setAttribute("fill", base);
        svOverlayWhite.setAttribute("fill", "url(#krea2-sv-white)");
        svOverlayBlack.setAttribute("fill", "url(#krea2-sv-black)");
      };
      const svDefs = mk("defs");
      const whiteGrad = mk("linearGradient");
      whiteGrad.setAttribute("id", "krea2-sv-white");
      whiteGrad.setAttribute("x1", "0"); whiteGrad.setAttribute("y1", "0");
      whiteGrad.setAttribute("x2", "1"); whiteGrad.setAttribute("y2", "0");
      whiteGrad.appendChild(whiteStop("#ffffff", "1"));
      whiteGrad.appendChild(whiteStop("#ffffff", "0"));
      function whiteStop(color, opacity) {
        const node = mk("stop");
        node.setAttribute("offset", opacity === "1" ? "0%" : "100%");
        node.setAttribute("stop-color", color);
        node.setAttribute("stop-opacity", opacity);
        return node;
      }
      const blackGrad = mk("linearGradient");
      blackGrad.setAttribute("id", "krea2-sv-black");
      blackGrad.setAttribute("x1", "0"); blackGrad.setAttribute("y1", "0");
      blackGrad.setAttribute("x2", "0"); blackGrad.setAttribute("y2", "1");
      const blackTop = mk("stop");
      blackTop.setAttribute("offset", "0%");
      blackTop.setAttribute("stop-color", "#000000");
      blackTop.setAttribute("stop-opacity", "0");
      const blackBottom = mk("stop");
      blackBottom.setAttribute("offset", "100%");
      blackBottom.setAttribute("stop-color", "#000000");
      blackBottom.setAttribute("stop-opacity", "1");
      blackGrad.appendChild(blackTop);
      blackGrad.appendChild(blackBottom);
      svDefs.appendChild(whiteGrad);
      svDefs.appendChild(blackGrad);
      svSvg.appendChild(svDefs);
      svSvg.appendChild(svBase);
      svSvg.appendChild(svOverlayWhite);
      svSvg.appendChild(svOverlayBlack);
      const svHandle = mk("circle");
      svHandle.setAttribute("r", "8");
      svHandle.setAttribute("class", "krea2-color-handle");
      svSvg.appendChild(svHandle);
      const positionSvHandle = function () {
        svHandle.setAttribute("cx", String(hsv.s * SV_W));
        svHandle.setAttribute("cy", String((1 - hsv.v) * SV_H));
      };
      updateSv();
      positionSvHandle();

      const redraw = function () {
        positionHueHandle();
        positionSvHandle();
        updateSv();
        hexInput.value = hsvToHex(hsv);
      };

      const dragHue = function (event) {
        const bounds = hueSvg.getBoundingClientRect();
        if (!bounds || !bounds.width) return;
        const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
        hsv.h = x * 360;
        hsv.s = Math.max(0, Math.min(1, hsv.s));
        redraw();
      };
      const dragSv = function (event) {
        const bounds = svSvg.getBoundingClientRect();
        if (!bounds || !bounds.width) return;
        hsv.s = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
        hsv.v = Math.max(0, Math.min(1, 1 - (event.clientY - bounds.top) / bounds.height));
        redraw();
      };

      function attachDrag(surface, onDrag, onUp) {
        surface.addEventListener("mousedown", function (event) {
          if (event.button !== 0) return;
          event.preventDefault();
          onDrag(event);
          const move = function (e) { onDrag(e); };
          const up = function () {
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", up);
            commit();
          };
          document.addEventListener("mousemove", move);
          document.addEventListener("mouseup", up);
        });
      }
      attachDrag(hueSvg, dragHue);
      attachDrag(svSvg, dragSv);

      /* Hex row: format label + divider + value + copy button */
      const hexRow = el("div", { class: "krea2-color-hexrow" }, [
        el("span", { class: "krea2-color-hexlabel" }, "Hex"),
        el("span", { class: "krea2-color-hexdivider" }),
        hexInput,
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-icon-btn",
          title: "Copy hex code",
          "aria-label": "Copy hex code",
          onClick: function (event) {
            if (event && typeof event.stopPropagation === "function") event.stopPropagation();
            if (typeof navigator !== "undefined" && navigator.clipboard) {
              navigator.clipboard.writeText(hexInput.value).then(function () {}, function () {});
            }
          },
        }, icon("copy", { width: "12", height: "12" })),
      ]);
      popup.appendChild(hueSvg);
      popup.appendChild(svSvg);
      popup.appendChild(hexRow);

      const rect = anchor.getBoundingClientRect();
      Object.assign(popup.style, {
        position: "fixed",
        left: rect.left + "px",
        top: (rect.bottom + 4) + "px",
        zIndex: "2147483500",
      });
      document.body.appendChild(popup);
      function onDocClick(e) {
        if (!popup.contains(e.target)) {
          popup.remove();
          document.removeEventListener("click", onDocClick, true);
        }
      }
      setTimeout(() => document.addEventListener("click", onDocClick, true), 0);
      return popup;
    }

    function renderColorPopupButton(character, key, palette, label) {
      const current = String(character[key] || "");
      const btn = el("button", {
        type: "button",
        class: "krea2-v2-color-btn" + (current ? " has-color" : ""),
        style: current ? { background: colourHexFor(current, palette) } : {},
        title: (current || "no colour") + " — click to pick " + label,
        "aria-label": label + ": " + (current || "none"),
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          openColorPopup(btn, palette, current, label, function (name) {
            character[key] = name;
            markDirty();
            scheduleAppearanceRender();
          });
        },
      }, current ? "" : icon("dot", { width: "11", height: "11", color: "#8a8f98" }));
      return btn;
    }

    /* Concepts Applied to <character>: header-click toggle, then three
     * side-by-side groups (Pose / Emotion / Face) each with its own dice
     * and each-job shuffle, plus the full picker for more. */
    function renderCharacterConceptsBlock(character) {
      const open = character.concepts_open !== false;
      const rows = Array.isArray(character.rows) ? character.rows : [];
      const block = el("section", {
        class: "krea2-v2-concepts-block" + (open ? " is-open" : ""),
      });
      const header = el("div", { class: "krea2-v2-block-head krea2-clickable-head" }, [
        el("strong", null, "Concepts Applied to " + (character.name || "this character")),
        el("span", { class: "krea2-v2-block-count" },
          rows.length + (rows.length === 1 ? " concept" : " concepts")),
        el("span", { class: "krea2-structured-spacer" }),
        el("span", { class: "krea2-v2-chevron", "aria-hidden": "true" },
          icon(open ? "chevron_down" : "chevron_right", { width: "12", height: "12" })),
      ]);
      header.addEventListener("click", function () {
        character.concepts_open = character.concepts_open === false;
        markDirty();
        render();
      });
      const body = el("div", { class: "krea2-v2-block-body" });
      if (open) {
        const grid = el("div", { class: "krea2-v2-concept-columns" });
        for (const group of CHARACTER_CONCEPT_GROUPS) {
          grid.appendChild(renderCharacterDirectionBlock(character, group.id, { collapsible: false }));
        }
        body.appendChild(grid);
        body.appendChild(el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-v2-add-concept",
          onClick: function () {
            showSearchableSelector({
              presets: compatibleLibrary(),
              title: "Add concepts for " + (character.name || "this character"),
              // Character concepts are subject & expression only: emotion,
              // face, body, placement. Camera / lighting / environment /
              // style live on the SCENE tab.
              categories: CHARACTER_PICKER_CATEGORIES,
              multiSelect: true,
              selectedIds: rows.map(function (row) { return row.preset_id; }),
              filterPreset: characterConflictFilter(character),
              onToggle: function (preset, shouldSelect) {
                if (shouldSelect) {
                  addCharacterRow(character, preset);
                } else {
                  const existing = (character.rows || []).find(function (row) {
                    return row.preset_id === preset.id;
                  });
                  if (existing) removeCharacterRow(character, existing.id);
                }
              },
              onClose: function () { render(); },
              getConceptColor: function (presetId) { return (state.concept_colors || {})[presetId] || ""; },
              onColorChange: function (presetId, newColor) {
                state.concept_colors = state.concept_colors || {};
                if (newColor) state.concept_colors[presetId] = newColor;
                else delete state.concept_colors[presetId];
                markDirty();
              },
            });
          },
        }, "+ Add Concept"));
      }
      block.appendChild(header);
      block.appendChild(body);
      return block;
    }

    function renderQuickDirectionsBlock(character) {
      const open = character.quick_open !== false;
      const block = el("section", {
        class: "krea2-v2-quick-block" + (open ? " is-open" : ""),
      });
      const header = el("div", { class: "krea2-v2-block-head krea2-clickable-head" }, [
        el("strong", null, "Quick Directions"),
        el("span", { class: "krea2-v2-block-hint" }, "one tap applies emotion, face and body together"),
        el("span", { class: "krea2-structured-spacer" }),
        el("span", { class: "krea2-v2-chevron", "aria-hidden": "true" },
          icon(open ? "chevron_down" : "chevron_right", { width: "12", height: "12" })),
      ]);
      header.addEventListener("click", function () {
        character.quick_open = character.quick_open === false;
        markDirty();
        render();
      });
      const body = el("div", { class: "krea2-v2-block-body" });
      if (open) {
        body.appendChild(renderQuickDirectionChips(character));
      }
      block.appendChild(header);
      block.appendChild(body);
      return block;
    }

    /* Per-character LoRA list. Every LoRA emits a <lora:name:strength>
     * token inside this character's prompt block; the first also drives the
     * model-side application (Model input -> Model output). */

    const VISUAL_CATEGORIES = [
      { id: "hair_style", label: "Hair style", icon: "palette" },
      { id: "hair_color", label: "Hair color", icon: "dot" },
      { id: "hair_length", label: "Hair length", icon: "sliders" },
      { id: "eyes", label: "Eyes", icon: "eye" },
      { id: "body_type", label: "Build", icon: "users" },
      { id: "fitness", label: "Fitness", icon: "sparkle" },
      { id: "proportions", label: "Height", icon: "compass" },
      { id: "age", label: "Age", icon: "sliders" },
      { id: "ethnicity", label: "Heritage", icon: "globe" },
      { id: "skin_color", label: "Skin tone", icon: "dot" },
      { id: "makeup", label: "Makeup", icon: "star" },
      { id: "nose", label: "Nose", icon: "eye" },
      { id: "mouth", label: "Mouth", icon: "star" },
      { id: "chin", label: "Chin", icon: "users" },
      { id: "face_shape", label: "Face shape", icon: "compass" },
    ];

    const VISUAL_OPTION_FIELDS = (function () {
      const byKey = {};
      CHARACTER_APPEARANCE.forEach(function (field) { byKey[field.key] = field; });
      return byKey;
    })();

    const HAIR_LENGTH_ORDER = ["shaved", "buzz cut", "short", "ear-length", "chin-length", "neck-length",
      "shoulder-length", "mid-back length", "waist-length", "hip-length", "floor-length"];

    function visualFieldOptions(key) {
      const field = VISUAL_OPTION_FIELDS[key];
      return field ? field.options : [];
    }

    function visualTile(label, active, onPick, opts) {
      const tile = el("button", {
        type: "button",
        class: "krea2-visual-tile" + (active ? " is-active" : ""),
        "aria-pressed": active ? "true" : "false",
        title: label,
        onClick: onPick,
      }, [el("span", { class: "krea2-visual-tile-label" }, label)]);
      if (active) tile.appendChild(el("span", { class: "krea2-visual-check" }, icon("check", { width: "10", height: "10" })));
      return tile;
    }

    function visualSwatch(name, hex, active, onPick) {
      return el("button", {
        type: "button",
        class: "krea2-visual-swatch" + (active ? " is-active" : ""),
        style: { background: hex },
        title: name,
        "aria-label": name,
        "aria-pressed": active ? "true" : "false",
        onClick: onPick,
      });
    }

    function visualSlider(character, key, options, label, onChange) {
      const current = String(character[key] || "");
      const index = Math.max(0, options.indexOf(current));
      const slider = el("input", {
        type: "range",
        class: "krea2-visual-slider",
        min: "0",
        max: String(options.length - 1),
        step: "1",
        value: String(index >= 0 ? index : 0),
        "aria-label": label,
        onChange: function (event) {
          const option = options[Number(event.target.value)];
          if (option) onChange(option);
        },
      });
      return el("div", { class: "krea2-visual-slider-row" }, [
        el("span", { class: "krea2-visual-slider-value" }, current || "—"),
        slider,
      ]);
    }

    function visualCategoryControls(character, categoryId) {
      const wrap = el("div", { class: "krea2-visual-controls" });
      const commit = function (key, value) {
        character[key] = value;
        markDirty();
        render();
      };
      switch (categoryId) {
        case "hair_style":
        case "nose":
        case "mouth":
        case "chin":
        case "face_shape":
        case "ethnicity":
        case "body_type":
        case "makeup": {
          const options = visualFieldOptions(categoryId);
          const grid = el("div", { class: "krea2-visual-tile-grid" });
          for (const option of options) {
            grid.appendChild(visualTile(option, String(character[categoryId] || "") === option,
              function () { commit(categoryId, option); }));
          }
          wrap.appendChild(grid);
          break;
        }
        case "hair_color":
        case "skin_color": {
          const palette = categoryId === "skin_color" ? PALETTE_COLORS : PALETTE_COLORS;
          const swatches = el("div", { class: "krea2-visual-swatch-row" });
          for (const entry of palette) {
            swatches.appendChild(visualSwatch(entry[0], entry[1],
              String(character[categoryId] || "") === entry[0],
              function () { commit(categoryId, entry[0]); }));
          }
          swatches.appendChild(el("button", {
            type: "button",
            class: "krea2-visual-custom-color",
            title: "Custom colour...",
            "aria-label": "Custom colour",
            onClick: function (event) {
              if (event && typeof event.stopPropagation === "function") event.stopPropagation();
              const anchor = event.currentTarget;
              openColorPopup(anchor, PALETTE_COLORS, String(character[categoryId] || ""),
                categoryId === "skin_color" ? "Skin tone" : "Hair colour",
                function (name) { commit(categoryId, name); });
            },
          }, icon("sparkle", { width: "12", height: "12" })));
          wrap.appendChild(swatches);
          break;
        }
        case "eyes": {
          const shapes = visualFieldOptions("eyes").filter(function (option) {
            return !/(blue|green|hazel|brown|black|grey|amber|violet|heterochromatic)/.test(option);
          });
          const grid = el("div", { class: "krea2-visual-tile-grid" });
          for (const option of shapes) {
            grid.appendChild(visualTile(option, String(character.eyes || "") === option,
              function () { commit("eyes", option); }));
          }
          wrap.appendChild(grid);
          const iris = el("div", { class: "krea2-visual-swatch-row" });
          iris.appendChild(el("span", { class: "krea2-visual-group-label" }, "Iris colour"));
          for (const entry of PALETTE_COLORS) {
            iris.appendChild(visualSwatch(entry[0], entry[1],
              String(character.eye_color || "") === entry[0],
              function () { commit("eye_color", entry[0]); }));
          }
          wrap.appendChild(iris);
          break;
        }
        case "hair_length": {
          const presets = [
            ["Short", "short"], ["Medium", "shoulder-length"],
            ["Long", "waist-length"], ["Extra Long", "floor-length"],
          ];
          const presetsRow = el("div", { class: "krea2-visual-preset-row" });
          for (const entry of presets) {
            presetsRow.appendChild(visualTile(entry[0], String(character.hair_length || "") === entry[1],
              function () { commit("hair_length", entry[1]); }));
          }
          wrap.appendChild(presetsRow);
          wrap.appendChild(visualSlider(character, "hair_length", HAIR_LENGTH_ORDER, "Hair length refinement",
            function (option) { commit("hair_length", option); }));
          break;
        }
        case "fitness": {
          wrap.appendChild(visualSlider(character, "fitness", visualFieldOptions("fitness"), "Fitness",
            function (option) { commit("fitness", option); }));
          break;
        }
        case "proportions": {
          wrap.appendChild(visualSlider(character, "proportions", visualFieldOptions("proportions"), "Height",
            function (option) { commit("proportions", option); }));
          break;
        }
        case "age": {
          wrap.appendChild(visualSlider(character, "age", visualFieldOptions("age"), "Age",
            function (option) { commit("age", option); }));
          break;
        }
        default:
          break;
      }
      return wrap;
    }

    function renderVisualCreator(character) {
      const panel = el("div", { class: "krea2-visual-creator" });
      const top = el("div", { class: "krea2-visual-top" }, [
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-icon-btn",
          title: "Close the visual creator",
          "aria-label": "Close the visual creator",
          onClick: function () {
            character.expanded = false;
            markDirty();
            render();
          },
        }, icon("close", { width: "12", height: "12" })),
        el("span", { class: "krea2-visual-title" }, (character.name || "Character") + " — Visual Creator"),
        el("span", { class: "krea2-structured-spacer" }),
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-visual-save",
          onClick: function () { saveCharacterPreset(character, character.name || ""); },
        }, "Save"),
      ]);
      const actions = el("div", { class: "krea2-visual-actions" }, [
        el("button", { type: "button", class: "krea2-wizard-btn", title: "Undo", onClick: undo }, "Undo"),
        el("button", { type: "button", class: "krea2-wizard-btn", title: "Redo", onClick: redo }, "Redo"),
        el("button", {
          type: "button", class: "krea2-wizard-btn", title: "Reset this character's look",
          onClick: function () {
            if (!window.confirm("Reset " + (character.name || "this character") + "'s appearance?")) return;
            for (const field of CHARACTER_APPEARANCE) {
              character[field.key] = "";
            }
            markDirty();
            render();
          },
        }, "Reset"),
        el("button", {
          type: "button", class: "krea2-wizard-btn krea2-visual-randomize", title: "Randomize unlocked categories",
          onClick: function () {
            const locked = character.visual_locked || {};
            for (const field of CHARACTER_APPEARANCE) {
              if (locked[field.key]) continue;
              randomizeAppearanceField(character, field);
            }
            markDirty();
            render();
          },
        }, "Randomize"),
      ]);
      const activeCategory = character.visual_category || "hair_style";
      const previewWrap = el("div", { class: "krea2-visual-preview" }, [
        buildCharacterAvatar(character),
      ]);
      const controlsArea = el("div", { class: "krea2-visual-controls-area" }, [
        visualCategoryControls(character, activeCategory),
      ]);
      const bar = el("div", { class: "krea2-visual-category-bar", role: "tablist" });
      for (const category of VISUAL_CATEGORIES) {
        const active = category.id === activeCategory;
        const locked = !!(character.visual_locked || {})[category.id];
        const btn = el("button", {
          type: "button",
          role: "tab",
          "aria-selected": active ? "true" : "false",
          class: "krea2-visual-category" + (active ? " is-active" : ""),
          title: category.label + (locked ? " (locked)" : ""),
          onClick: function () {
            character.visual_category = category.id;
            markDirty();
            render();
          },
        }, [
          icon(category.icon, { width: "13", height: "13" }),
          el("span", { class: "krea2-visual-category-label" }, category.label),
        ]);
        if (locked) btn.classList.add("is-locked");
        bar.appendChild(btn);
      }
      const lockRow = el("div", { class: "krea2-visual-lock-row" }, [
        el("label", { class: "krea2-inline-check", title: "Lock the active category so Randomize keeps it" }, [
          el("input", {
            type: "checkbox",
            checked: !!(character.visual_locked || {})[activeCategory],
            onChange: function (event) {
              if (!character.visual_locked) character.visual_locked = {};
              character.visual_locked[activeCategory] = !!event.target.checked;
              markDirty();
              render();
            },
          }),
          el("span", null, "Lock " + ((VISUAL_CATEGORIES.find(function (c) { return c.id === activeCategory; }) || {}).label || activeCategory) + " for Randomize"),
        ]),
      ]);
      panel.append(top, actions, previewWrap, controlsArea, lockRow, bar);
      return panel;
    }

    /* v2 cast card: header (click = toggle) + four appearance dropdowns on
     * one row, identity chips, concepts block, quick directions, LoRA. */
    function renderCharacterCard(character, index) {
      const expanded = character.expanded !== false;
      const card = el("section", {
        class: "krea2-character-card krea2-v2-character-card" + (expanded ? " is-expanded" : ""),
        dataset: { characterId: character.id },
      });
      const header = el("div", { class: "krea2-character-card-header krea2-clickable-head" });
      const visualCreatorOn = state.character_creator === "visual";
      const avatar = visualCreatorOn ? null : buildCharacterAvatar(character);
      const name = el("input", {
        type: "text",
        class: "krea2-compact-input krea2-character-name",
        value: character.name || "",
        "aria-label": "Character name",
        onInput: function (event) { character.name = event.target.value; markDirty(); },
      });
      const summary = el("span", { class: "krea2-character-summary" },
        characterSummary(character) || "No appearance set yet");
      const enabled = el("label", { class: "krea2-inline-check", title: "Include this character in the prompt" }, [
        el("input", {
          type: "checkbox",
          checked: character.enabled !== false,
          onChange: function (event) { character.enabled = !!event.target.checked; markDirty(); render(); },
        }),
        el("span", null, "Include"),
      ]);
      const randomAll = diceButton("Randomize this entire character's look once now", function () {
        CHARACTER_APPEARANCE.forEach(function (field) {
          randomizeAppearanceField(character, field);
        });
        markDirty(); render();
      }, "krea2-character-random-look krea2-icon-btn");
      const allFieldsEachJob = V2_APPEARANCE_FIELDS.every(function (field) {
        return !!(character.randomize_fields || {})[field.key];
      });
      const randomAllEachJob = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-shuffle krea2-character-random-each-job" + (allFieldsEachJob ? " is-active" : ""),
        title: allFieldsEachJob
          ? "This character's appearance changes for every queued job. Click to keep it fixed."
          : "Randomize this character's appearance for every queued job.",
        "aria-label": "Randomize this character's appearance every queued job",
        "aria-pressed": allFieldsEachJob ? "true" : "false",
        onClick: function () {
          V2_APPEARANCE_FIELDS.forEach(function (field) {
            setAppearanceFieldEachJob(character, field, !allFieldsEachJob);
          });
          markDirty(); render();
        },
      }, icon("shuffle", { width: "13", height: "13" }));
      const save = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-save-character",
        title: "Save this character's look as a reusable preset",
        onClick: function () { saveCharacterPreset(character, name.value || character.name); },
      }, "Save");
      const remove = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-danger",
        title: "Delete character",
        "aria-label": "Delete character",
        onClick: function () {
          if (!window.confirm("Delete \u201c" + (character.name || "this character") + "\u201d from the cast?")) return;
          state.characters = state.characters.filter(function (item) { return item.id !== character.id; });
          if (state.selected_character_id === character.id) {
            state.selected_character_id = state.characters.length ? state.characters[0].id : null;
          }
          markDirty(); render();
        },
      }, icon("trash", { width: "12", height: "12" }));
      const chevron = el("span", { class: "krea2-v2-chevron krea2-character-chevron", "aria-hidden": "true" },
        icon(expanded ? "chevron_down" : "chevron_right", { width: "13", height: "13" }));
      const identity = el("div", { class: "krea2-character-card-identity" }, [
        name,
        summary,
        renderGenderPills(character),
      ]);
      const actions = el("div", { class: "krea2-character-card-actions" }, [
        enabled,
        el("div", { class: "krea2-wizard-random-controls" }, [randomAll, randomAllEachJob]),
        save,
        remove,
      ]);
      if (avatar) header.append(avatar, identity, actions, chevron);
      else header.append(identity, actions, chevron);
      header.addEventListener("click", function (event) {
        const target = event && event.target;
        if (target && typeof target.closest === "function"
            && target.closest("input,button,select,textarea,label")) return;
        character.expanded = character.expanded === false;
        markDirty();
        render();
      });

      const body = el("div", { class: "krea2-character-card-body" });
      if (expanded) {
        if (visualCreatorOn) {
          body.appendChild(renderVisualCreator(character));
        } else {
          /* v1.3.1 structure: preset row, identity, full appearance wall
           * (every field with its own dice + each-job shuffle), additional
           * characteristics, then the Direction block. */
          body.appendChild(renderCharacterPresetRow(character));
          body.appendChild(el("textarea", {
            class: "krea2-compact-textarea krea2-character-identity",
            rows: "1",
            "aria-label": "Character identity",
            placeholder: "Role, background, distinctive features...",
            onInput: function (event) { character.identity = event.target.value; markDirty(); },
          }, character.identity || ""));
          body.appendChild(renderAppearanceColumns(character));
          body.appendChild(renderAdditionalInfo(character));
          body.appendChild(renderCharacterDirection(character));
        }
      }
      card.appendChild(header);
      card.appendChild(body);
      return card;
    }

    /* v1.3.1-style appearance wall: three labelled columns, every field as
     * its own label-above row with a dice (randomize once) and a shuffle
     * (every queued job) beside the combobox. Colour fields keep their
     * pop-up pickers on the same row. */
    function renderAppearanceColumns(character) {
      const grid = el("div", { class: "krea2-character-columns" });
      const columns = [
        ["Identity & hair", ["sex", "age", "ethnicity", "hair_style", "hair_length", "makeup"]],
        ["Face & body", ["eyes", "nose", "mouth", "chin", "face_shape", "body_type", "fitness", "proportions"]],
        ["Clothing", ["clothing_top", "clothing_bottom", "ensemble"]],
      ];
      for (const layout of columns) {
        const fields = V2_APPEARANCE_FIELDS.filter(function (field) {
          return layout[1].includes(field.key);
        });
        if (!fields.length) continue;
        const col = el("div", { class: "krea2-character-column" });
        col.appendChild(el("div", { class: "krea2-character-column-title" }, layout[0]));
        for (const field of fields) {
          const fieldEl = el("label", {
            class: "krea2-character-field" + (field.wide ? " krea2-field-wide" : ""),
          }, [
            el("span", null, field.label),
          ]);
          const combobox = comboboxForField(character, field);
          const fieldRow = el("div", { class: "krea2-field-row" }, [
            combobox.input,
            combobox.datalist,
          ]);
          const dice = el("button", {
            type: "button",
            class: "krea2-wizard-btn krea2-icon-btn krea2-field-random",
            title: "Roll " + field.label + " once now",
            "aria-label": "Randomize " + field.label + " once",
            onClick: function (event) {
              if (event && typeof event.stopPropagation === "function") event.stopPropagation();
              randomizeAppearanceField(character, field);
              markDirty();
              render();
            },
          }, icon("dice", { width: "12", height: "12" }));
          const eachJobOn = !!(character.randomize_fields || {})[field.key];
          const shuffle = el("button", {
            type: "button",
            class: "krea2-wizard-btn krea2-icon-btn krea2-field-each-job krea2-shuffle" + (eachJobOn ? " is-active" : ""),
            title: eachJobOn
              ? field.label + " randomizes for every queued job. Click to keep it fixed."
              : "Randomize " + field.label + " for every queued job.",
            "aria-label": "Randomize " + field.label + " every queued job",
            "aria-pressed": eachJobOn ? "true" : "false",
            onClick: function (event) {
              if (event && typeof event.stopPropagation === "function") event.stopPropagation();
              setAppearanceFieldEachJob(character, field, !eachJobOn);
              markDirty();
              render();
            },
          }, icon("shuffle", { width: "12", height: "12" }));
          fieldRow.append(dice, shuffle);
          if (field.colorKey) {
            const palette = field.colorPalette === "light" ? LIGHT_PALETTE : PALETTE_COLORS;
            fieldRow.appendChild(renderColorPopupButton(character, field.colorKey, palette, field.label + " colour"));
            const colorField = { key: field.colorKey, options: palette.map(function (entry) { return entry[0]; }) };
            fieldRow.appendChild(fieldRandomControls(character, colorField));
          }
          fieldEl.appendChild(fieldRow);
          col.appendChild(fieldEl);
        }
        grid.appendChild(col);
      }
      return grid;
    }

    /* v1.3.1 character preset row: built-in / saved / workflow looks. */
    function renderCharacterPresetRow(character) {
      const allPresets = availableCharacterPresets();
      const presetSelect = el("select", { class: "krea2-compact-select", "aria-label": "Character presets" });
      presetSelect.appendChild(el("option", { value: "" }, "Character presets..."));
      allPresets.forEach(function (entry, presetIndex) {
        const prefix = entry.source === "builtin" ? "Built in \u00b7 " : entry.source === "saved" ? "My preset \u00b7 " : "Workflow \u00b7 ";
        presetSelect.appendChild(el("option", { value: String(presetIndex) }, prefix + (entry.preset.label || "Character")));
      });
      const applyPreset = el("button", { type: "button", class: "krea2-wizard-btn", onClick: function () {
        const entry = allPresets[Number(presetSelect.value)];
        if (!entry || !entry.preset.character) return;
        const stored = cloneJson(entry.preset.character);
        const replacement = Object.assign(newCharacter(), stored, { id: character.id, expanded: character.expanded !== false });
        if (!stored.name) replacement.name = character.name || entry.preset.label;
        replacement.position = character.position || "";
        replacement.face_guidance = character.face_guidance || "";
        replacement.interaction = character.interaction || "";
        replacement.rows = Array.isArray(character.rows) ? cloneJson(character.rows) : [];
        const index = state.characters.indexOf(character);
        state.characters[index] = replacement;
        markDirty(); render();
      } }, "Apply");
      return el("div", { class: "krea2-character-preset-row" }, [presetSelect, applyPreset]);
    }

    /* v1.3.1 "Additional info" behind a checkbox, auto-expanding. */
    function renderAdditionalInfo(character) {
      const additionalOpen = character.additional_open === true;
      const check = el("label", { class: "krea2-inline-check krea2-additional-toggle" }, [
        el("input", {
          type: "checkbox",
          checked: additionalOpen,
          onChange: function (event) {
            character.additional_open = !!event.target.checked;
            markDirty();
            render();
          },
        }),
        el("span", null, "Additional info"),
      ]);
      if (!additionalOpen) return check;
      const ta = el("textarea", {
        class: "krea2-compact-textarea krea2-additional-info",
        rows: "2",
        "aria-label": "Additional characteristics",
        placeholder: "A mole on her cheek, an eyepatch over one eye, a scar\u2026",
        onInput: function (event) {
          character.additional_info = event.target.value;
          autoExpandTextarea(event);
          markDirty();
        },
      }, character.additional_info || "");
      autoExpandTextarea({ target: ta });
      return el("div", { class: "krea2-character-grid-wrap" }, [check, ta]);
    }

    /* Conflict-aware cascading (v1 scope: emotion, framing, angle). */
    function getConflictPairs() {
      if (conflictPairsCache) return conflictPairsCache;
      const pairs = [];
      const add = function (a, b) { if (a !== b) pairs.push([a, b]); };
      for (const pair of CURATED_CONFLICTS) add(pair[0], pair[1]);
      const tokens = new Map();
      for (const preset of library) {
        const slug = String(preset.id || "").split(".").pop();
        if (!slug) continue;
        if (!tokens.has(slug)) tokens.set(slug, []);
        tokens.get(slug).push(preset.id);
      }
      for (const conflict of conflictList) {
        const id = String(conflict && conflict.id || "");
        const m = id.match(/([a-z0-9_]+)_vs_([a-z0-9_]+)$/);
        if (!m) continue;
        for (const x of tokens.get(m[1]) || []) {
          for (const y of tokens.get(m[2]) || []) {
            const cx = String(x).split(".")[0];
            if (cx === String(y).split(".")[0] && CONFLICT_CATEGORIES.includes(cx)) add(x, y);
          }
        }
      }
      conflictPairsCache = pairs;
      return pairs;
    }

    function conflictsWithAny(presetId, ids) {
      const pairs = getConflictPairs();
      const category = String(presetId).split(".")[0];
      for (const id of ids) {
        if (id === presetId) continue;
        if (String(id).split(".")[0] !== category) continue;
        for (const pair of pairs) {
          if ((pair[0] === id && pair[1] === presetId) || (pair[0] === presetId && pair[1] === id)) {
            return true;
          }
        }
      }
      return false;
    }

    function characterConflictFilter(character) {
      const applied = (character.rows || []).map(function (row) {
        return row.preset_id;
      }).filter(Boolean);
      return function (preset, selectedIds) {
        if (!CONFLICT_CATEGORIES.includes(preset.category)) return true;
        return !conflictsWithAny(preset.id, applied.concat(selectedIds || []));
      };
    }

    /* Scene chip rows: single-select per category, conflict-aware. */
    function chipActive(presetId) {
      return state.rows.some(function (row) { return row.preset_id === presetId; });
    }

    function toggleSceneChip(presetId) {
      const preset = library.find(function (item) { return item.id === presetId; });
      if (!preset) return;
      if (chipActive(presetId)) {
        state.rows = state.rows.filter(function (row) { return row.preset_id !== presetId; });
      } else {
        state.rows = state.rows.filter(function (row) { return row.category !== preset.category; });
        const row = presetToRow(preset, state);
        row.strength = 1.2;
        state.rows.push(row);
        if (preset.category === "lighting_setup") {
          applyLightingSetupLayout(presetId);
        }
      }
      markDirty();
      render();
    }

    /* Multi-select variant (atmosphere): several can be active at once —
     * foggy AND smokey. */
    function toggleSceneChipMulti(presetId) {
      const preset = library.find(function (item) { return item.id === presetId; });
      if (!preset) return;
      if (chipActive(presetId)) {
        state.rows = state.rows.filter(function (row) { return row.preset_id !== presetId; });
      } else {
        const row = presetToRow(preset, state);
        row.strength = 1.2;
        state.rows.push(row);
      }
      markDirty();
      render();
    }

    /* Map a scene chip category to the backend group its each-job shuffle
     * flag lives on. */
    function groupForChipCategory(category) {
      if (category === "framing" || category === "angle" || category === "aperture" || category === "lens") {
        return "camera_film";
      }
      if (category === "lighting_setup" || category === "lighting_direction") {
        return "lighting";
      }
      if (category === "atmosphere" || category === "environment_movement") {
        return "environment";
      }
      return "style_finish";
    }

    /* Randomize one scene chip category once: replace its rows with a
     * random preset from the chip rail. */
    function randomizeSceneChips(category, chips) {
      const options = chips.filter(function (entry) {
        return library.some(function (preset) { return preset.id === entry[0]; });
      });
      if (!options.length) return;
      const entry = options[Math.floor(Math.random() * options.length)];
      const preset = library.find(function (item) { return item.id === entry[0]; });
      if (!preset) return;
      state.rows = state.rows.filter(function (row) { return row.category !== category; });
      const row = presetToRow(preset, state);
      row.strength = 1.2;
      state.rows.push(row);
      if (category === "lighting_setup") applyLightingSetupLayout(preset.id);
      markDirty();
      render();
    }

    function toggleChipShuffle(category) {
      const group = groupForChipCategory(category);
      state.randomize_on_job = state.randomize_on_job || {};
      state.randomize_on_job[group] = !state.randomize_on_job[group];
      markDirty();
      render();
    }

    function renderChipRow(label, category, chips, multi) {
      const row = el("div", { class: "krea2-v2-chip-row" });
      row.appendChild(el("span", { class: "krea2-v2-field-label" }, label));
      const wrap = el("div", { class: "krea2-v2-chips" });
      const activeIds = state.rows.filter(function (row) {
        return row.category === category;
      }).map(function (row) { return row.preset_id; });
      for (const entry of chips) {
        const active = chipActive(entry[0]);
        const conflicted = !multi && conflictsWithAny(entry[0], activeIds);
        wrap.appendChild(el("button", {
          type: "button",
          class: "krea2-v2-chip" + (active ? " is-active" : "") + (conflicted ? " is-conflicted" : ""),
          title: conflicted
            ? "Conflicts with an active concept in this row"
            : (active ? "Click to remove" : "Click to apply"),
          disabled: conflicted,
          onClick: function () {
            if (multi) toggleSceneChipMulti(entry[0]);
            else toggleSceneChip(entry[0]);
          },
        }, entry[1]));
      }
      row.appendChild(wrap);
      const group = groupForChipCategory(category);
      const shuffleOn = !!(state.randomize_on_job || {})[group];
      const dice = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-chip-dice",
        title: "Randomize " + label + " once now",
        "aria-label": "Randomize " + label + " once",
        onClick: function () { randomizeSceneChips(category, chips); },
      }, icon("dice", { width: "12", height: "12" }));
      const shuffle = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-shuffle" + (shuffleOn ? " is-active" : ""),
        title: shuffleOn
          ? "Shuffle on: this section randomizes every queued job. Click to stop."
          : "Shuffle off: randomize this section every queued job.",
        "aria-label": "Randomize " + label + " every queued job",
        "aria-pressed": shuffleOn ? "true" : "false",
        onClick: function () { toggleChipShuffle(category); },
      }, icon("shuffle", { width: "12", height: "12" }));
      row.appendChild(el("div", { class: "krea2-v2-field-random-controls" }, [dice, shuffle]));
      return row;
    }

    /* Lens slider: snaps to a real library lens preset when close, else
     * emits a custom "Nmm lens" phrase. */
    function currentLensMm() {
      const row = state.rows.find(function (r) { return r.category === "lens"; });
      if (!row) return null;
      const match = String(row.phrase || "").match(/(\d{2,3})\s*mm/);
      return match ? Number(match[1]) : null;
    }

    function nearestLensPreset(mm) {
      let best = null;
      let bestDiff = Infinity;
      for (const preset of library) {
        if (preset.category !== "lens") continue;
        const match = String(preset.id).match(/(\d{2,3})mm/);
        if (!match) continue;
        const diff = Math.abs(Number(match[1]) - mm);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = preset;
        }
      }
      return bestDiff <= 1 ? best : null;
    }

    function setLensMm(mm) {
      const clamped = Math.max(14, Math.min(200, Math.round(mm)));
      const preset = nearestLensPreset(clamped);
      state.rows = state.rows.filter(function (row) { return row.category !== "lens"; });
      const row = preset
        ? presetToRow(preset, state)
        : {
            id: uniqueRowId(state),
            category: "lens",
            preset_id: "custom.lens_" + clamped,
            label: clamped + "mm lens",
            phrase: clamped + "mm lens",
            control_mode: "scalar",
            intensity: 60,
            strength: 1.2,
            enabled: true,
            aliases: [],
            verification: "general visual vocabulary",
            source: "custom",
          };
      state.rows.push(row);
      markDirty();
      render();
    }

    function renderLensRow() {
      const mm = currentLensMm() || 85;
      const slider = el("input", {
        type: "range",
        class: "krea2-v2-lens-slider",
        min: "14",
        max: "200",
        step: "1",
        value: String(mm),
        "aria-label": "Focal length in millimetres",
        // Dragging only updates the visible label; the prompt row is
        // committed on release so the slider never loses focus mid-drag.
        onInput: function (event) {
          value.textContent = Number(event.target.value) + "mm";
        },
        onChange: function (event) {
          setLensMm(Number(event.target.value));
        },
      });
      const value = el("span", { class: "krea2-v2-lens-value" }, mm + "mm");
      const row = el("div", { class: "krea2-v2-chip-row krea2-v2-lens-row" });
      row.append(
        el("span", { class: "krea2-v2-field-label" }, "Lens"),
        slider,
        value,
      );
      return row;
    }

    /* Multi-light direction plane: every light is a draggable dot whose
     * angle (0° = front, 90° = the subject's right, 180° = back, 270° =
     * left) and distance from the subject are set by dragging. Each light
     * becomes a lighting_direction concept row with its own intensity and
     * colour. */
    const LIGHT_DIRECTION_LABELS = {
      front_lighting: "front lighting",
      three_quarter_front_lighting: "three-quarter front lighting",
      side_lighting: "side lighting",
      rim_lighting: "rim lighting",
      backlighting: "backlighting",
    };

    function normalizeAngle(rad) {
      let a = rad % (2 * Math.PI);
      if (a > Math.PI) a -= 2 * Math.PI;
      if (a < -Math.PI) a += 2 * Math.PI;
      return a;
    }

    /* User-facing degrees: 0 = front, 90 = right, 180 = back, 270 = left. */
    function degreesToRad(degrees) {
      return ((90 - degrees) * Math.PI) / 180;
    }

    function radToDegrees(rad) {
      const degrees = 90 - (normalizeAngle(rad) * 180) / Math.PI;
      return ((degrees % 360) + 360) % 360;
    }

    function lightingDirectionForAngle(rad) {
      const a = normalizeAngle(rad);
      const span = Math.PI / 8;
      if (Math.abs(a - Math.PI / 2) <= span) return "front_lighting";
      if (Math.abs(a - Math.PI / 4) <= span || Math.abs(a - 3 * Math.PI / 4) <= span) {
        return "three_quarter_front_lighting";
      }
      if (Math.abs(a) <= span || Math.abs(Math.abs(a) - Math.PI) <= span) return "side_lighting";
      if (Math.abs(a + Math.PI / 4) <= span || Math.abs(a + 3 * Math.PI / 4) <= span) {
        return "rim_lighting";
      }
      return "backlighting";
    }

    function lightDistanceMetres(distance) {
      const d = Math.max(0.25, Math.min(1, Number(distance) || 0.85));
      return Math.round((0.5 + ((d - 0.25) / 0.75) * 1.5) * 2) / 2;
    }

    function lightSideLabel(deg) {
      const a = ((Math.round(Number(deg) || 0) % 360) + 360) % 360;
      const sides = ["front", "front right", "right", "back right", "back", "back left", "left", "front left"];
      return sides[Math.round(a / 45) % 8];
    }

    function lightPhrase(light) {
      const side = lightSideLabel(light.angleDeg);
      const metres = lightDistanceMetres(light.distance);
      const colour = String(light.color || "").trim();
      return "light from the " + side + " at " + metres + "m" + (colour ? " in " + colour : "");
    }

    function sceneLights() {
      state.scene_sections = state.scene_sections || {};
      if (!Array.isArray(state.scene_sections.lights)) state.scene_sections.lights = [];
      if (!state.scene_sections.lights.length) {
        const stored = state.scene_sections.light_angle;
        state.scene_sections.lights.push({
          id: "light_1",
          angleDeg: Number.isFinite(stored) ? Math.round(radToDegrees(stored)) : 0,
          distance: 0.85,
          strength: 1.5,
          color: "",
        });
      }
      // Migrate legacy radian-angle lights to degrees.
      for (const light of state.scene_sections.lights) {
        if (!Number.isFinite(Number(light.angleDeg)) && Number.isFinite(Number(light.angle))) {
          light.angleDeg = Math.round(radToDegrees(Number(light.angle)));
        }
        if (!Number.isFinite(Number(light.angleDeg))) light.angleDeg = 0;
        if (!Number.isFinite(Number(light.strength))) light.strength = 1.5;
        if (!light.color) light.color = "";
      }
      return state.scene_sections.lights;
    }

    function syncLightRows() {
      const lights = sceneLights();
      state.rows = state.rows.filter(function (row) {
        return !(row.category === "lighting_direction" && String(row.preset_id || "").indexOf("custom.light_") === 0);
      });
      lights.forEach(function (light, index) {
        state.rows.push({
          id: uniqueRowId(state),
          category: "lighting_direction",
          preset_id: "custom.light_" + (light.id || index),
          label: "Light " + (index + 1) + " \u2014 " + lightPhrase(light),
          phrase: lightPhrase(light),
          control_mode: "scalar",
          intensity: 0,
          strength: Number(light.strength) || 1.5,
          enabled: true,
          aliases: [],
          verification: "general visual vocabulary",
          source: "custom",
        });
      });
    }

    function setLightState(light, changes) {
      if (Number.isFinite(Number(changes.angleDeg))) light.angleDeg = ((Math.round(Number(changes.angleDeg)) % 360) + 360) % 360;
      if (Number.isFinite(Number(changes.distance))) light.distance = Math.max(0.25, Math.min(1, Number(changes.distance)));
      if (Number.isFinite(Number(changes.strength))) light.strength = Number(changes.strength);
      if (changes.color !== undefined) light.color = String(changes.color || "");
      syncLightRows();
      markDirty();
      render();
    }

    function addLight() {
      const lights = sceneLights();
      lights.push({
        id: "light_" + Date.now().toString(36),
        angleDeg: 0,
        distance: 0.85,
        strength: 1.5,
        color: "",
      });
      syncLightRows();
      markDirty();
      render();
    }

    function removeLight(light) {
      const lights = sceneLights();
      state.scene_sections.lights = lights.filter(function (item) { return item !== light; });
      syncLightRows();
      markDirty();
      render();
    }

    function applyLightingSetupLayout(presetId) {
      const layout = LIGHT_SETUP_LAYOUTS[presetId];
      if (!layout) return;
      state.scene_sections = state.scene_sections || {};
      state.scene_sections.lights = layout.map(function (entry, index) {
        return {
          id: "light_" + (index + 1) + "_" + Date.now().toString(36),
          angleDeg: Math.round(radToDegrees(entry.angle)),
          distance: entry.distance,
          strength: 1.5,
          color: "",
        };
      });
      syncLightRows();
    }

    function svgEl(tag, attrs) {
      const doc = typeof document !== "undefined" ? document : null;
      const mk = doc && typeof doc.createElementNS === "function"
        ? function (t) { return doc.createElementNS("http://www.w3.org/2000/svg", t); }
        : function (t) { return doc.createElement(t); };
      const node = mk(tag);
      for (const key of Object.keys(attrs || {})) {
        node.setAttribute(key, attrs[key]);
      }
      return node;
    }

    function renderCompassRose() {
      const SIZE = 132;
      const C = SIZE / 2;
      const R = 50;
      const lights = sceneLights();
      const svg = svgEl("svg", {
        viewBox: "0 0 " + SIZE + " " + SIZE,
        width: String(SIZE),
        height: String(SIZE),
        class: "krea2-v2-compass",
        "aria-label": "Lighting plane: drag each light around the subject; drag toward or away from the centre to change distance",
      });
      svg.appendChild(svgEl("circle", { cx: C, cy: C, r: R, class: "krea2-v2-compass-ring" }));
      for (let i = 0; i < 8; i += 1) {
        const a = (i * Math.PI) / 4;
        const x1 = C + Math.cos(a) * (R - 10);
        const y1 = C + Math.sin(a) * (R - 10);
        const x2 = C + Math.cos(a) * R;
        const y2 = C + Math.sin(a) * R;
        svg.appendChild(svgEl("line", {
          x1: x1, y1: y1, x2: x2, y2: y2,
          class: "krea2-v2-compass-tick",
        }));
      }
      svg.appendChild(svgEl("circle", { cx: C, cy: C, r: 9, class: "krea2-v2-compass-subject" }));

      const lightDots = [];
      lights.forEach(function (light, index) {
        const rad = degreesToRad(Number(light.angleDeg) || 0);
        const radius = (R - 8) * (Number(light.distance) || 0.85);
        const dx = Math.cos(rad) * radius;
        const dy = Math.sin(rad) * radius;
        const group = svgEl("g", { class: "krea2-v2-compass-light" });
        const colourHex = colourHexFor(String(light.color || ""), LIGHT_PALETTE);
        group.appendChild(svgEl("line", {
          x1: C, y1: C, x2: C + dx, y2: C + dy,
          class: "krea2-v2-compass-ray",
          style: colourHex ? "stroke: " + colourHex + ";" : "",
        }));
        const dot = svgEl("circle", {
          cx: C + dx,
          cy: C + dy,
          r: 7,
          class: "krea2-v2-compass-handle",
          "data-light-index": String(index),
          style: colourHex ? "fill: " + colourHex + ";" : "",
        });
        group.appendChild(dot);
        dot.addEventListener("mouseenter", function () {
          highlightLightRow(index, true);
        });
        dot.addEventListener("mouseleave", function () {
          highlightLightRow(index, false);
        });
        const num = svgEl("text", {
          x: C + dx + 9,
          y: C + dy + 3,
          class: "krea2-v2-compass-num",
        });
        num.textContent = String(index + 1);
        group.appendChild(num);
        svg.appendChild(group);
        lightDots.push({ light: light, dot: dot });
      });

      const drag = function (light, event) {
        // The SVG rect is resolved on demand: it is only valid once the
        // element is laid out in the document.
        const bounds = svg.getBoundingClientRect ? svg.getBoundingClientRect() : null;
        const cx = bounds ? bounds.left + bounds.width / 2 : C;
        const cy = bounds ? bounds.top + bounds.height / 2 : C;
        const dx = event.clientX - cx;
        const dy = event.clientY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 6) return;
        const rad = normalizeAngle(Math.atan2(dy, dx));
        const radius = R - 8;
        light.angleDeg = Math.round(radToDegrees(rad));
        light.distance = Math.max(0.25, Math.min(1, dist / radius));
        const group = event.target && event.target.parentNode;
        const line = group && group.children && group.children[0];
        const label = group && group.children && group.children[2];
        const moveX = C + Math.cos(rad) * radius * light.distance;
        const moveY = C + Math.sin(rad) * radius * light.distance;
        if (line) {
          line.setAttribute("x2", String(moveX));
          line.setAttribute("y2", String(moveY));
        }
        if (label) {
          label.setAttribute("x", String(moveX + 9));
          label.setAttribute("y", String(moveY + 3));
        }
        if (event.target) {
          event.target.setAttribute("cx", String(moveX));
          event.target.setAttribute("cy", String(moveY));
        }
      };

      for (const entry of lightDots) {
        const start = function (event) {
          if (event.button !== 0) return;
          event.preventDefault();
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          highlightLightRow(lightDots.indexOf(entry), true);
          drag(entry.light, event);
          const onMove = function (moveEvent) { drag(entry.light, moveEvent); };
          const onUp = function () {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            highlightLightRow(lightDots.indexOf(entry), false);
            syncLightRows();
            markDirty();
            render();
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        };
        entry.dot.addEventListener("mousedown", start);
      }
      return svg;
    }

    /* Cross-highlight: hovering/dragging a light in one spot highlights it
     * in the other (diagram dot <-> list row). */
    function highlightLightRow(index, on) {
      const wrap = document.querySelector(".krea2-v2-compass-wrap");
      if (!wrap) return;
      const rows = wrap.querySelectorAll('.krea2-v2-light-row[data-light-index="' + index + '"]');
      for (const row of rows) row.classList.toggle("is-highlighted", on);
    }

    function highlightLightDot(index, on) {
      const wrap = document.querySelector(".krea2-v2-compass-wrap");
      if (!wrap) return;
      const dots = wrap.querySelectorAll('.krea2-v2-compass-handle[data-light-index="' + index + '"]');
      for (const dot of dots) dot.classList.toggle("is-highlighted", on);
    }

    function renderLightRows() {
      const rows = el("div", { class: "krea2-v2-light-rows" });
      sceneLights().forEach(function (light, index) {
        const row = el("div", {
          class: "krea2-v2-light-row",
          dataset: { lightIndex: String(index) },
        });
        row.addEventListener("mouseenter", function () { highlightLightDot(index, true); });
        row.addEventListener("mouseleave", function () { highlightLightDot(index, false); });
        const label = el("span", {
          class: "krea2-v2-light-label",
          title: lightPhrase(light),
        }, "Light " + (index + 1) + " \u00b7 " + lightPhrase(light));
        const angleStepper = K.presetRow.makeStepper({
          value: Number(light.angleDeg) || 0,
          step: 5,
          min: 0,
          max: 360,
          format: function (v) { return Math.round(v) % 360 + "\u00b0"; },
          label: "Light " + (index + 1) + " angle",
          onCommit: function (value) {
            setLightState(light, { angleDeg: value });
          },
        });
        const intensityStepper = K.presetRow.makeStepper({
          value: Number(light.strength) || 1.5,
          step: 0.25,
          min: -3,
          max: 3,
          format: formatLoraValue,
          label: "Light " + (index + 1) + " intensity",
          onCommit: function (value) {
            setLightState(light, { strength: Math.round(value * 100) / 100 });
          },
        });
        const colour = renderLightColorButton(light, index);
        const colourDice = el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-icon-btn krea2-light-colour-dice",
          title: "Randomize this light's colour once now",
          "aria-label": "Randomize light " + (index + 1) + " colour",
          onClick: function () {
            const entry = LIGHT_PALETTE[Math.floor(Math.random() * LIGHT_PALETTE.length)];
            setLightState(light, { color: entry[0] });
          },
        }, icon("dice", { width: "11", height: "11" }));
        const colourShuffleOn = !!(state.randomize_on_job || {}).lighting;
        const colourShuffle = el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-icon-btn krea2-shuffle" + (colourShuffleOn ? " is-active" : ""),
          title: colourShuffleOn
            ? "Shuffle on: light colours randomize every queued job. Click to stop."
            : "Randomize light colours every queued job.",
          "aria-label": "Randomize light colours every queued job",
          "aria-pressed": colourShuffleOn ? "true" : "false",
          onClick: function () { toggleChipShuffle("lighting_direction"); },
        }, icon("shuffle", { width: "11", height: "11" }));
        const remove = el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-icon-btn krea2-danger",
          title: "Remove this light",
          "aria-label": "Remove light " + (index + 1),
          onClick: function () { removeLight(light); },
        }, icon("trash", { width: "11", height: "11" }));
        const controls = el("div", { class: "krea2-v2-light-controls" }, [
          el("span", { class: "krea2-v2-light-tag" }, "angle"),
          angleStepper.minus, angleStepper.valueEl, angleStepper.plus,
          el("span", { class: "krea2-v2-light-tag" }, "intensity"),
          intensityStepper.minus, intensityStepper.valueEl, intensityStepper.plus,
          colour,
          colourDice,
          colourShuffle,
          remove,
        ]);
        row.append(label, controls);
        rows.appendChild(row);
      });
      rows.appendChild(el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-v2-add-light",
        onClick: addLight,
      }, "+ Add Light"));
      return rows;
    }

    /* Light colour: a pop-up palette button (shows the current colour).
     * The palette is light tints only — no hair words like blonde. */
    function renderLightColorButton(light, index) {
      const current = String(light.color || "");
      const btn = el("button", {
        type: "button",
        class: "krea2-v2-color-btn" + (current ? " has-color" : ""),
        style: current ? { background: colourHexFor(current, LIGHT_PALETTE) } : {},
        title: (current || "white") + " light — click to pick a colour",
        "aria-label": "Light " + (index + 1) + " colour: " + (current || "white"),
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          openColorPopup(btn, LIGHT_PALETTE, current, "Light " + (index + 1) + " colour", function (name) {
            setLightState(light, { color: name });
          });
        },
      }, current ? "" : icon("dot", { width: "11", height: "11", color: "#8a8f98" }));
      return btn;
    }

    function renderCameraContent() {
      const wrap = el("div", { class: "krea2-v2-subsection-content" });
      wrap.appendChild(renderChipRow("Framing", "framing", SCENE_CHIPS.framing));
      wrap.appendChild(renderChipRow("Angle", "angle", SCENE_CHIPS.angle));
      wrap.appendChild(renderLensRow());
      wrap.appendChild(renderChipRow("Aperture", "aperture", SCENE_CHIPS.aperture));
      return wrap;
    }

    function renderLightingContent() {
      const wrap = el("div", { class: "krea2-v2-subsection-content" });
      wrap.appendChild(renderChipRow("PRESETS", "lighting_setup", SCENE_CHIPS.lighting_setup));
      const dirRow = el("div", { class: "krea2-v2-chip-row krea2-v2-dir-row" });
      dirRow.append(
        el("div", { class: "krea2-v2-compass-wrap" }, [
          renderCompassRose(),
          renderLightRows(),
        ]),
      );
      wrap.appendChild(dirRow);
      return wrap;
    }

    /* Environment behaves exactly like the CAST concept groups: adding via
     * the picker, presets, save, dice, each-job shuffle and drag-reorder —
     * with atmosphere and environmental movement as the pool. */
    function renderEnvironmentContent() {
      const wrap = el("div", { class: "krea2-v2-subsection-content krea2-v2-env-group" });
      renderGroupSections(wrap, ["environment"]);
      return wrap;
    }

    /* Scene subsections: header IS the toggle, each with its own tint. */
    function renderSceneSubsection(id, title, iconName, contentFn) {
      const open = (state.scene_sections || {})[id] !== false;
      const section = el("section", {
        class: "krea2-v2-subsection krea2-v2-subsection-" + id + (open ? " is-open" : ""),
      });
      const header = el("div", { class: "krea2-v2-block-head krea2-clickable-head" }, [
        icon(iconName, { width: "13", height: "13" }),
        el("strong", null, title),
        el("span", { class: "krea2-structured-spacer" }),
        el("span", { class: "krea2-v2-chevron", "aria-hidden": "true" },
          icon(open ? "chevron_down" : "chevron_right", { width: "12", height: "12" })),
      ]);
      header.addEventListener("click", function () {
        state.scene_sections = state.scene_sections || {};
        state.scene_sections[id] = state.scene_sections[id] === false ? true : false;
        markDirty();
        render();
      });
      const body = el("div", { class: "krea2-v2-block-body" });
      if (open) {
        const content = contentFn();
        if (content) body.appendChild(content);
      }
      section.appendChild(header);
      section.appendChild(body);
      return section;
    }

    /* Type / Setting / Style on ONE horizontal row. "Style" is the shot
     * preset: it replaces camera, lighting and environment together, so
     * picking one warns first when those sections have content. */
    function renderSceneTypeRow() {
      const row = el("div", { class: "krea2-v2-scene-top-row" });
      row.append(
        el("span", { class: "krea2-v2-field-label" }, "Type"),
        creativeModeControl,
        el("span", { class: "krea2-v2-field-label" }, "Setting"),
        b2BuiltinSceneSelect(),
        el("span", { class: "krea2-v2-field-label" }, "Style"),
        masterPresetSelect,
      );
      return row;
    }

    /* Description merges the old "Additional info" field into one editor. */
    function renderSceneDescriptionBlock() {
      const open = (state.scene_sections || {}).description !== false;
      const block = el("section", {
        class: "krea2-v2-description-block" + (open ? " is-open" : ""),
      });
      const header = el("div", { class: "krea2-v2-block-head krea2-clickable-head" }, [
        el("strong", null, "Description"),
        el("span", { class: "krea2-v2-block-hint" }, "scene, mood, camera or style notes"),
        el("span", { class: "krea2-structured-spacer" }),
        el("span", { class: "krea2-v2-chevron", "aria-hidden": "true" },
          icon(open ? "chevron_down" : "chevron_right", { width: "12", height: "12" })),
      ]);
      header.addEventListener("click", function () {
        state.scene_sections = state.scene_sections || {};
        state.scene_sections.description = state.scene_sections.description === false ? true : false;
        markDirty();
        render();
      });
      const body = el("div", { class: "krea2-v2-block-body" });
      if (open) {
        const ta = el("textarea", {
          class: "krea2-compact-textarea krea2-wizard-base",
          rows: "2",
          "aria-label": "Scene description",
          placeholder: "Describe the scene, mood, lighting, camera, or style.",
          onInput: function (event) {
            state.base_prompt = event.target.value;
            autoExpandTextarea(event);
            markDirty();
            syncNodeHeight();
          },
        }, state.base_prompt || "");
        autoExpandTextarea({ target: ta });
        body.appendChild(ta);
      }
      block.appendChild(header);
      block.appendChild(body);
      return block;
    }

    /* Final Prompt Preview: header bar (click = collapse) above a fully
     * desaturated gray monospace code area. Shared by both tabs. */
    function renderFinalPreview() {
      const open = state.final_preview_open !== false;
      const section = el("section", {
        class: "krea2-v2-final-preview" + (open ? " is-open" : ""),
      });
      const header = el("div", { class: "krea2-v2-block-head krea2-clickable-head" }, [
        el("strong", null, "Final Prompt Preview"),
        el("span", { class: "krea2-v2-block-hint" },
          state.pretty_preview ? "grouped concept cards (Pretty mode)" : "plain weighted prompt code"),
        el("span", { class: "krea2-structured-spacer" }),
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-icon-btn krea2-v2-preview-copy",
          title: "Copy compiled prompt",
          "aria-label": "Copy compiled prompt",
          onClick: function (event) {
            if (event && typeof event.stopPropagation === "function") event.stopPropagation();
            copy(livePreview.codeText.textContent);
          },
        }, icon("copy", { width: "12", height: "12" })),
        el("span", { class: "krea2-v2-chevron", "aria-hidden": "true" },
          icon(open ? "chevron_down" : "chevron_right", { width: "12", height: "12" })),
      ]);
      header.addEventListener("click", function (event) {
        const target = event && event.target;
        if (target && typeof target.closest === "function" && target.closest("button")) return;
        state.final_preview_open = state.final_preview_open === false;
        markDirty();
        render();
      });
      const body = el("div", { class: "krea2-v2-final-preview-body" });
      if (open) {
        body.appendChild(livePreview.root);
      }
      section.appendChild(header);
      section.appendChild(body);
      return section;
    }

    function renderCastTab() {
      structuredHost.innerHTML = "";
      const section = el("section", { class: "krea2-structured-section krea2-character-section krea2-v2-cast" });
      const add = el("button", { type: "button", class: "krea2-wizard-btn", onClick: function () {
        const character = newCharacter();
        state.characters.push(character);
        state.selected_character_id = character.id;
        markDirty();
        renderStructuredEditors();
      } }, "+ Character");
      const exportBtn = el("button", { type: "button", class: "krea2-wizard-btn krea2-quiet-btn", onClick: exportStructuredPresets }, "Export");
      const importInput = el("input", { type: "file", accept: "application/json", hidden: true, onChange: importStructuredPresets });
      const importBtn = el("button", { type: "button", class: "krea2-wizard-btn krea2-quiet-btn", onClick: function () { importInput.click(); } }, "Import");
      const castRandomAll = diceButton("Randomize every character's full look once now", function () {
        (state.characters || []).forEach(function (character) {
          CHARACTER_APPEARANCE.forEach(function (field) {
            randomizeAppearanceField(character, field);
          });
        });
        markDirty();
        render();
      }, "krea2-cast-random-all");
      section.appendChild(el("div", { class: "krea2-structured-heading" }, [
        el("strong", null, "Cast"),
        el("span", { class: "krea2-v2-cast-count" },
          (state.characters || []).length + ((state.characters || []).length === 1 ? " character" : " characters")),
        el("span", { class: "krea2-structured-spacer" }),
        castRandomAll, add, exportBtn, importBtn, importInput,
      ]));
      if (!state.characters.length) {
        const starter = el("select", { class: "krea2-compact-select", "aria-label": "Add a preset character" });
        starter.appendChild(el("option", { value: "" }, "Start with a preset character..."));
        CHARACTER_PRESETS.forEach(function (preset, presetIndex) { starter.appendChild(el("option", { value: String(presetIndex) }, preset.label)); });
        starter.addEventListener("change", function () {
          const preset = CHARACTER_PRESETS[Number(starter.value)];
          if (!preset) return;
          const character = Object.assign(newCharacter(), cloneJson(preset.character), { name: preset.label });
          state.characters.push(character); state.selected_character_id = character.id;
          markDirty(); renderStructuredEditors();
        });
        section.appendChild(el("div", { class: "krea2-character-empty-row" }, [starter, el("span", { class: "krea2-structured-empty" }, "or create a blank character") ]));
      } else {
        state.characters.forEach(function (character, index) {
          section.appendChild(renderCharacterCard(character, index));
        });
      }
      castHost.appendChild(section);
      castHost.appendChild(renderFinalPreview());
    }

    function renderSceneTab() {
      sceneHost.appendChild(renderSceneTypeRow());
      sceneHost.appendChild(renderSceneDescriptionBlock());
      const grid = el("div", { class: "krea2-v2-scene-grid" });
      grid.appendChild(renderSceneSubsection("camera", "Camera", "camera",
        renderCameraContent));
      grid.appendChild(renderSceneSubsection("lighting", "Lighting", "bulb",
        renderLightingContent));
      sceneHost.appendChild(grid);
      sceneHost.appendChild(renderSceneSubsection("environment", "Environment", "globe",
        renderEnvironmentContent));
      sceneHost.appendChild(renderFinalPreview());
    }

    function renderConceptsTab() {
      conceptsHost.appendChild(el("div", { class: "krea2-wizard-add-row" }, [addConcept, masterPresetSelect]));
      categoryBody.innerHTML = "";
      renderGroupSections(categoryBody, GROUPS);
      conceptsHost.appendChild(categoryBody);
    }

    function renderMotionSection() {
      const section = el("section", { class: "krea2-motion-section" });
      const enabled = !!state.motion_prompt_enabled;
      const draft = compilePreview(state).motion_prompt_draft || "";
      const draftButton = el("button", {
        type: "button",
        class: "krea2-wizard-btn",
        title: "Replace the override below with the current cast draft",
        onClick: function () {
          state.motion_prompt = draft;
          state.motion_prompt_enabled = true;
          markDirty();
          render();
        },
      }, "Draft from cast");
      const clearButton = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-quiet-btn",
        title: "Clear the motion prompt override",
        onClick: function () {
          state.motion_prompt = "";
          state.motion_prompt_enabled = false;
          markDirty();
          render();
        },
      }, "Clear");
      section.appendChild(el("div", { class: "krea2-structured-heading" }, [
        el("strong", null, "Video Motion Prompt (LTX-2.3)"),
        el("span", { class: "krea2-structured-spacer" }),
        draftButton,
        clearButton,
        el("label", { class: "krea2-inline-check", title: "Emit this prompt from the Video Motion Prompt output" }, [
          el("input", {
            type: "checkbox",
            checked: enabled,
            onChange: function (event) {
              state.motion_prompt_enabled = !!event.target.checked;
              markDirty();
              render();
            },
          }),
          el("span", null, "Enable output"),
        ]),
      ]));
      section.appendChild(el("div", { class: "krea2-settings-copy" },
        "One line per character. Feed this to your video model (e.g. LTX-2.3) alongside the generated still."));
      section.appendChild(el("textarea", {
        class: "krea2-compact-textarea krea2-motion-prompt",
        rows: Math.max(2, (state.motion_prompt || draft).split(/\r?\n/).length + 1),
        "aria-label": "Video motion prompt",
        placeholder: draft || "Draft from cast…",
        onInput: function (event) {
          state.motion_prompt = event.target.value;
          markDirty();
        },
      }, state.motion_prompt || ""));
      if (draft) {
        section.appendChild(el("div", { class: "krea2-motion-draft" }, [
          el("span", { class: "krea2-direction-label" }, "Current draft"),
          el("code", null, draft),
        ]));
      }
      return section;
    }

    /* ------------------------------------------------------------------
     * v2.0 B2 compact shell: the primary surface of the wizard.
     * One rounded overview card with title, prompt preview + copy, a
     * one-line Scene · Shot summary, collapsed cast rows with chips, and
     * a LoRA summary. Every advanced control stays reachable through the
     * expanded editor.
     * ------------------------------------------------------------------ */
    function characterHasChips(character) {
      if (String(character.lora_name || "").trim()) return true;
      return Array.isArray(character.rows) && character.rows.some(function (row) {
        return row && row.enabled !== false;
      });
    }

    function b2CastRow(character) {
      const row = el("div", {
        class: "krea2-b2-cast-row" + (character.enabled === false ? " is-disabled" : ""),
        role: "button",
        tabindex: "0",
        title: "Open the full editor at " + (character.name || "this character"),
        onClick: function () {
          state.wizard_expanded = true;
          if (character.expanded === false) character.expanded = true;
          markDirty();
          render();
        },
      });
      row.append(
        buildCharacterAvatar(character),
        el("span", { class: "krea2-b2-cast-row-name" }, character.name || "Character"),
      );
      if (characterHasChips(character)) row.appendChild(characterChips(character));
      row.appendChild(el("span", { class: "krea2-b2-cast-row-chevron" }, "›"));
      return row;
    }

    /* Shared B2 building blocks used by both the compact shell and the
     * expanded editor so the two surfaces stay visually identical. */
    function b2MetaCounts(compiled) {
      const enabledCharacters = (state.characters || []).filter(function (character) {
        return character && character.enabled !== false;
      });
      const activeConcepts = (state.rows || []).filter(function (row) {
        return row && row.enabled !== false;
      }).length;
      const activeLoras = enabledCharacters.filter(function (character) {
        return String(character.lora_name || "").trim();
      }).length;
      const promptText = (compiled && compiled.final_prompt) || "";
      const tokens = promptText.trim() ? promptText.trim().split(/\s+/).length : 0;
      return {
        tokens: tokens,
        cast: enabledCharacters.length,
        concepts: activeConcepts,
        loras: activeLoras,
      };
    }

    function b2TitleHeader(meta) {
      return el("div", { class: "krea2-b2-title" }, [
        el("span", { class: "krea2-b2-title-name" }, "Krea2 Prompt Wizard"),
        el("span", { class: "krea2-b2-title-meta" },
          meta.tokens + " words · " + meta.cast + " cast · "
          + meta.concepts + " concepts · " + meta.loras + " LoRA"),
      ]);
    }

    function b2PromptRow(promptText) {
      return el("div", { class: "krea2-b2-prompt" }, [
        el("span", { class: "krea2-b2-label" }, "Prompt"),
        el("div", { class: "krea2-b2-prompt-text", title: promptText || "" },
          promptText || "No generation prompt yet"),
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-b2-prompt-copy",
          title: "Copy compiled prompt",
          "aria-label": "Copy compiled prompt",
          onClick: function () { copy(promptText); },
        }, "📋 Copy"),
      ]);
    }

    function b2LoraRow() {
      const enabledCharacters = (state.characters || []).filter(function (character) {
        return character && character.enabled !== false;
      });
      const loraNames = enabledCharacters.map(function (character) {
        return String(character.lora_name || "").trim();
      }).filter(Boolean);
      return el("div", { class: "krea2-b2-lora-row" }, [
        el("span", { class: "krea2-b2-label" }, "LoRA"),
        el("div", { class: "krea2-b2-lora-summary" },
          loraNames.length ? loraNames.join(" · ") : "— none —"),
      ]);
    }

    /* The compact expanded-state card. It shows only the four appearance
     * fields in a 2-column grid, quick directions, the LoRA select and
     * strength slider, and the concept chips — never the full appearance
     * wall or the direction sections of the legacy renderer. */
    const B2_APPEARANCE_FIELDS = (function () {
      const byKey = {};
      CHARACTER_APPEARANCE.forEach(function (field) { byKey[field.key] = field; });
      return [
        { key: "hair_style", label: "Hair", options: byKey.hair_style.options },
        { key: "eyes", label: "Eyes", options: byKey.eyes.options },
        { key: "body_type", label: "Build", options: byKey.body_type.options },
        { key: "fitness", label: "Fit", options: byKey.fitness.options },
      ];
    })();

    function b2LoraControls(character) {
      const strength = buildLoraStrengthControl(character);
      return el("div", { class: "krea2-b2-lora-controls" }, [
        el("span", { class: "krea2-b2-field-label" }, "LoRA"),
        buildLoraSelect(character),
        el("span", { class: "krea2-b2-lora-strength-label" }, "strength"),
        strength.input,
        strength.value,
      ]);
    }

    function renderB2CompactCharacterCard(character, index) {
      const expanded = character.expanded !== false;
      const card = el("section", {
        class: "krea2-character-card krea2-b2-character-card" + (expanded ? " is-expanded" : ""),
        dataset: { characterId: character.id },
      });
      const header = el("div", { class: "krea2-character-card-header" });
      const avatar = buildCharacterAvatar(character);
      const name = el("input", {
        type: "text",
        class: "krea2-compact-input krea2-character-name",
        value: character.name || "",
        "aria-label": "Character name",
        onInput: function (event) { character.name = event.target.value; markDirty(); },
      });
      const summary = el("span", { class: "krea2-character-summary" }, characterSummary(character) || "No appearance set yet");
      const enabled = el("label", { class: "krea2-inline-check", title: "Include this character in the prompt" }, [
        el("input", { type: "checkbox", checked: character.enabled !== false, onChange: function (event) { character.enabled = !!event.target.checked; markDirty(); render(); } }),
        el("span", null, "Include"),
      ]);
      const randomAll = diceButton("Randomize this entire character's look once now", function () {
        CHARACTER_APPEARANCE.forEach(function (field) {
          randomizeAppearanceField(character, field);
        });
        markDirty(); render();
      }, "krea2-character-random-look krea2-icon-btn");
      const allFieldsEachJob = B2_APPEARANCE_FIELDS.every(function (field) {
        return !!(character.randomize_fields || {})[field.key];
      });
      const randomAllEachJob = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-shuffle krea2-character-random-each-job" + (allFieldsEachJob ? " is-active" : ""),
        title: allFieldsEachJob
          ? "This character's appearance changes for every queued job. Click to keep it fixed."
          : "Randomize this character's appearance for every queued job.",
        "aria-label": "Randomize this character's appearance every queued job",
        "aria-pressed": allFieldsEachJob ? "true" : "false",
        onClick: function () {
          B2_APPEARANCE_FIELDS.forEach(function (field) {
            setAppearanceFieldEachJob(character, field, !allFieldsEachJob);
          });
          markDirty(); render();
        },
      }, icon("shuffle", { width: "13", height: "13" }));
      const save = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-save-character",
        title: "Save this character's look as a reusable preset",
        onClick: function () { saveCharacterPreset(character, name.value || character.name); },
      }, "Save");
      const remove = el("button", { type: "button", class: "krea2-wizard-btn krea2-icon-btn krea2-danger", title: "Delete character", "aria-label": "Delete character", onClick: function () {
        if (!window.confirm("Delete \u201c" + (character.name || "this character") + "\u201d from the cast?")) return;
        state.characters = state.characters.filter(function (item) { return item.id !== character.id; });
        if (state.selected_character_id === character.id) {
          state.selected_character_id = state.characters.length ? state.characters[0].id : null;
        }
        markDirty(); render();
      } }, "×");
      const expandBtn = el("button", {
        type: "button",
        class: "krea2-character-expand krea2-icon-btn",
        title: expanded ? "Collapse this character" : "Expand this character",
        "aria-label": expanded ? "Collapse" : "Expand",
        onClick: function () {
          character.expanded = character.expanded === false;
          persist(); render();
        },
      }, expanded ? "Collapse" : "Expand");
      const identity = el("div", { class: "krea2-character-card-identity" }, [name, summary]);
      if (!expanded) {
        identity.appendChild(characterChips(character));
      }
      const actions = el("div", { class: "krea2-character-card-actions" }, [
        enabled,
        el("div", { class: "krea2-wizard-random-controls" }, [randomAll, randomAllEachJob]),
        save,
        remove,
        expandBtn,
      ]);
      header.append(avatar, identity, actions);

      const body = el("div", { class: "krea2-b2-character-body" });
      if (expanded) {
        const grid = el("div", { class: "krea2-b2-appearance-grid" });
        for (const field of B2_APPEARANCE_FIELDS) {
          const combobox = comboboxForField(character, field);
          grid.appendChild(el("label", { class: "krea2-b2-appearance-field" }, [
            el("span", { class: "krea2-b2-field-label" }, field.label),
            combobox.input,
            combobox.datalist,
          ]));
        }
        body.appendChild(grid);

        const quick = el("div", { class: "krea2-b2-quick-directions" }, [
          el("div", { class: "krea2-direction-label" }, "Quick directions"),
          renderQuickDirectionChips(character),
        ]);
        body.appendChild(quick);

        body.appendChild(b2LoraControls(character));

        body.appendChild(el("div", { class: "krea2-b2-concept-chips" }, [
          el("div", { class: "krea2-direction-label" }, "Direction & LoRA"),
          characterChips(character),
        ]));
      }
      card.appendChild(header);
      card.appendChild(body);
      return card;
    }

    function renderB2Shell() {
      b2Shell.innerHTML = "";
      const compiled = compilePreview(state);
      const promptText = (compiled && compiled.final_prompt) || "";
      const meta = b2MetaCounts(compiled);
      const header = b2TitleHeader(meta);
      const promptRow = b2PromptRow(promptText);

      const sceneName = state.setting && state.setting.enabled
        ? (state.setting.name || "Scene")
        : "No scene";
      const shotLabel = state.master_preset_label || "No shot preset";
      const sceneDescription = (state.setting && state.setting.description) || "";
      const sceneShuffleOn = !!(state.randomize_on_job || {}).setting;
      const sceneRow = el("div", { class: "krea2-b2-scene-row" }, [
        el("span", { class: "krea2-b2-label" }, "Scene · Shot"),
        el("div", {
          class: "krea2-b2-scene-summary",
          title: sceneDescription || "",
        }, sceneName + " · " + shotLabel),
        el("label", { class: "krea2-inline-check", title: "Include this scene in the prompt" }, [
          el("input", {
            type: "checkbox",
            checked: !!(state.setting && state.setting.enabled),
            onChange: function (event) {
              if (!state.setting || typeof state.setting !== "object") {
                state.setting = { enabled: false, name: "", description: "" };
              }
              state.setting.enabled = !!event.target.checked;
              markDirty();
              render();
            },
          }),
          el("span", null, "Include"),
        ]),
        diceButton("Randomize the scene", randomizeSceneOnce),
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-icon-btn krea2-shuffle" + (sceneShuffleOn ? " is-active" : ""),
          title: sceneShuffleOn
            ? "Shuffle on: a fresh scene is chosen for every queued job. Click to stop."
            : "Shuffle off: the scene stays fixed. Click to pick a fresh scene every queued job.",
          "aria-label": "Randomize the scene every queued job",
          onClick: function () { toggleSceneShuffle(sceneShuffleOn); },
        }, icon("shuffle", { width: "13", height: "13" })),
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-b2-scene-expand",
          title: "Open the full scene and shot editors",
          "aria-label": "Expand scene editor",
          onClick: function () {
            state.wizard_expanded = true;
            state.scene_collapsed = false;
            state.active_tab = "scene";
            markDirty();
            render();
          },
        }, "Expand"),
      ]);

      const castCount = (state.characters || []).length;
      const castHeading = el("div", { class: "krea2-b2-cast-heading" }, [
        el("span", { class: "krea2-b2-label krea2-b2-cast-label" }, "Cast"),
        el("span", { class: "krea2-b2-cast-count" },
          castCount + (castCount === 1 ? " character" : " characters")),
        el("span", { class: "krea2-structured-spacer" }),
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-b2-add-character",
          onClick: function () {
            const character = newCharacter();
            state.characters.push(character);
            state.selected_character_id = character.id;
            markDirty();
            render();
          },
        }, "+ Character"),
      ]);

      const castList = el("div", { class: "krea2-b2-cast-list" });
      if (!castCount) {
        castList.appendChild(el("div", { class: "krea2-b2-empty-cast" },
          "No cast yet — add a character or open the full editor."));
      } else {
        for (const character of state.characters) {
          castList.appendChild(b2CastRow(character));
        }
      }

      const loraRow = b2LoraRow();

      const bottom = el("div", { class: "krea2-b2-bottom" }, [
        el("span", { class: "krea2-b2-helper" },
          "Character looks, direction, scene and shot controls live in the full editor."),
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-b2-expand-wizard",
          onClick: function () {
            state.wizard_expanded = true;
            markDirty();
            render();
          },
        }, "Expand editor ···"),
      ]);

      b2Shell.append(header, promptRow, sceneRow, castHeading, castList, loraRow, bottom);
    }

    /* ------------------------------------------------------------------
     * v2.0 B2 expanded shell: the same glass-card shell grows into the
     * full stacked editor. The legacy tab bar, tab hosts and footer stay
     * out of the way; every editor is re-rendered inside B2 cards so the
     * expanded node keeps the B2 styling.
     * ------------------------------------------------------------------ */
    function b2BuiltinSceneSelect() {
      const select = el("select", {
        class: "krea2-compact-select krea2-b2-scene-select",
        "aria-label": "Scene setting",
        title: "Pick a scene — it applies immediately",
        onChange: function (event) {
          const preset = SETTING_PRESETS[Number(event.target.value)];
          if (!preset) return;
          if (!state.setting || typeof state.setting !== "object") {
            state.setting = { enabled: false, name: "", description: "" };
          }
          state.setting.enabled = true;
          state.setting.name = preset[0];
          state.setting.description = preset[1];
          markDirty();
          render();
        },
      });
      const setting = state.setting || {};
      select.appendChild(el("option", { value: "" },
        "Selected scene: " + (setting.enabled && setting.name ? setting.name : "— choose one —")));
      SETTING_PRESETS.slice().sort(function (a, b) {
        return String(a[0]).toLowerCase().localeCompare(String(b[0]).toLowerCase());
      }).forEach(function (preset, index) {
        select.appendChild(el("option", { value: String(SETTING_PRESETS.indexOf(preset)) }, preset[0]));
      });
      return select;
    }

    function renderB2ExpandedShell() {
      b2Shell.innerHTML = "";
      const compiled = compilePreview(state);
      const promptText = (compiled && compiled.final_prompt) || "";
      const meta = b2MetaCounts(compiled);

      /* 1. B2 title header with compact actions and a Collapse control. */
      const title = b2TitleHeader(meta);
      title.appendChild(el("span", { class: "krea2-structured-spacer" }));
      title.appendChild(el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn",
        title: "Copy compiled prompt",
        "aria-label": "Copy compiled prompt",
        onClick: function () { copy(promptText); },
      }, "📋"));
      title.appendChild(el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-b2-collapse",
        title: "Collapse the editor back to the compact overview",
        "aria-label": "Collapse the editor",
        onClick: function () {
          state.wizard_expanded = false;
          markDirty();
          render();
        },
      }, "Collapse editor"));

      /* 2. Compact prompt card at the top with copy. */
      const promptRow = b2PromptRow(promptText);

      /* 3. Scene + Shot card: editable Type / Setting / Shot rows plus the
       * Include, dice and shuffle controls and the global concept groups. */
      const setting = state.setting && typeof state.setting === "object"
        ? state.setting
        : { enabled: false, name: "", description: "" };
      const sceneShuffleOn = !!(state.randomize_on_job || {}).setting;
      const sceneDetailOn = state.scene_collapsed !== true;
      const sceneHead = el("div", { class: "krea2-b2-card-head" }, [
        el("span", { class: "krea2-b2-label" }, "Scene · Shot"),
        el("label", { class: "krea2-inline-check", title: "Include this scene in the prompt" }, [
          el("input", {
            type: "checkbox",
            checked: !!setting.enabled,
            onChange: function (event) {
              if (!state.setting || typeof state.setting !== "object") {
                state.setting = { enabled: false, name: "", description: "" };
              }
              state.setting.enabled = !!event.target.checked;
              markDirty();
              render();
            },
          }),
          el("span", null, "Include"),
        ]),
        diceButton("Randomize the scene", randomizeSceneOnce),
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-icon-btn krea2-shuffle" + (sceneShuffleOn ? " is-active" : ""),
          title: sceneShuffleOn
            ? "Shuffle on: a fresh scene is chosen for every queued job. Click to stop."
            : "Shuffle off: the scene stays fixed. Click to pick a fresh scene every queued job.",
          "aria-label": "Randomize the scene every queued job",
          onClick: function () { toggleSceneShuffle(sceneShuffleOn); },
        }, icon("shuffle", { width: "13", height: "13" })),
        el("span", { class: "krea2-structured-spacer" }),
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-b2-scene-expand",
          title: sceneDetailOn ? "Collapse the scene description" : "Expand the scene description",
          "aria-label": sceneDetailOn ? "Collapse scene description" : "Expand scene description",
          "aria-expanded": sceneDetailOn ? "true" : "false",
          onClick: function () {
            state.scene_collapsed = sceneDetailOn;
            markDirty();
            render();
          },
        }, sceneDetailOn ? "Collapse detail" : "Expand detail"),
      ]);
      const sceneRows = el("div", { class: "krea2-b2-scene-rows" }, [
        el("div", { class: "krea2-b2-field-row krea2-b2-field-type" }, [
          el("span", { class: "krea2-b2-field-label" }, "Type"),
          creativeModeControl,
        ]),
        el("div", { class: "krea2-b2-field-row krea2-b2-field-setting" }, [
          el("span", { class: "krea2-b2-field-label" }, "Setting"),
          b2BuiltinSceneSelect(),
        ]),
        el("div", { class: "krea2-b2-field-row krea2-b2-field-shot" }, [
          el("span", { class: "krea2-b2-field-label" }, "Shot"),
          masterPresetSelect,
        ]),
      ]);
      const scenePrompt = el("div", { class: "krea2-b2-scene-prompt" });
      scenePrompt.appendChild(basePromptControl.root);
      const sceneDetail = el("div", {
        class: "krea2-b2-scene-detail" + (sceneDetailOn ? "" : " is-hidden"),
      });
      const description = el("textarea", {
        class: "krea2-compact-textarea krea2-scene-description",
        rows: "2",
        "aria-label": "Scene description",
        placeholder: "Describe the scene's background and atmosphere…",
        onInput: function (event) {
          if (!state.setting || typeof state.setting !== "object") {
            state.setting = { enabled: false, name: "", description: "" };
          }
          state.setting.description = event.target.value;
          autoExpandTextarea(event);
          markDirty();
        },
      }, setting.description || "");
      autoExpandTextarea({ target: description });
      sceneDetail.appendChild(el("div", { class: "krea2-scene-detail-row" }, [
        el("span", { class: "krea2-b2-field-label" }, "Description"),
        description,
      ]));

      categoryBody.innerHTML = "";
      renderGroupSections(categoryBody, SCENE_GROUPS);
      const sceneConcepts = el("div", { class: "krea2-b2-scene-concepts" }, [
        el("div", { class: "krea2-b2-card-head" }, [
          el("span", { class: "krea2-b2-label" }, "Concepts"),
          el("span", { class: "krea2-b2-scene-concepts-hint" },
            "subject · camera · lighting · environment · style"),
        ]),
        categoryBody,
      ]);
      const sceneCard = el("div", { class: "krea2-b2-card krea2-b2-scene-card" }, [
        sceneHead,
        sceneRows,
        scenePrompt,
        sceneDetail,
        sceneConcepts,
      ]);

      /* 4. Cast section: compact expanded-state cards with the four-field
       * appearance grid, quick directions, LoRA select and concept chips,
       * wrapped in the B2 card, plus a global LoRA summary row. */
      const castCount = (state.characters || []).length;
      const castHead = el("div", { class: "krea2-b2-card-head" }, [
        el("span", { class: "krea2-b2-label krea2-b2-cast-label" }, "Cast"),
        el("span", { class: "krea2-b2-cast-count" },
          castCount + (castCount === 1 ? " character" : " characters")),
        el("span", { class: "krea2-structured-spacer" }),
        diceButton("Randomize every character's full look once now", function () {
          (state.characters || []).forEach(function (character) {
            CHARACTER_APPEARANCE.forEach(function (field) {
              randomizeAppearanceField(character, field);
            });
          });
          markDirty();
          render();
        }, "krea2-cast-random-all"),
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-b2-add-character",
          onClick: function () {
            const character = newCharacter();
            character.expanded = true;
            state.characters.push(character);
            state.selected_character_id = character.id;
            markDirty();
            render();
          },
        }, "+ Character"),
      ]);
      const castList = el("div", { class: "krea2-b2-cast-list" });
      if (!castCount) {
        castList.appendChild(el("div", { class: "krea2-b2-empty-cast" },
          "No cast yet — add a character to start."));
      } else {
        state.characters.forEach(function (character, index) {
          castList.appendChild(renderB2CompactCharacterCard(character, index));
        });
      }
      const castCard = el("div", { class: "krea2-b2-card krea2-b2-cast-card" }, [
        castHead,
        castList,
        b2LoraRow(),
      ]);

      /* 6. Final Prompt Preview card at the bottom: the single prompt
       * preview surface of the expanded shell. */
      const finalHead = el("div", { class: "krea2-b2-card-head" }, [
        el("span", { class: "krea2-b2-label" }, "Final Prompt Preview"),
        el("span", { class: "krea2-structured-spacer" }),
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-b2-prompt-copy",
          title: "Copy compiled prompt",
          "aria-label": "Copy compiled prompt",
          onClick: function () { copy(promptText); },
        }, "📋 Copy"),
      ]);
      const finalBody = el("div", { class: "krea2-b2-final-body" });
      if (state.show_motion_prompt) {
        finalBody.appendChild(renderMotionSection());
      }
      finalBody.appendChild(livePreview.root);
      const finalPreview = el("div", {
        class: "krea2-b2-card krea2-b2-final-preview",
      }, [finalHead, finalBody]);

      b2Shell.append(title, promptRow, sceneCard, castCard, finalPreview);
    }

    /* Footer: collapsible prompt section shown on every tab. */
    function renderFooter() {
      footerHost.innerHTML = "";
      const open = state.footer_open === true;
      const header = el("div", { class: "krea2-footer-header" }, [
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-footer-toggle",
          onClick: function () {
            state.footer_open = !open;
            persist();
            render();
          },
        }, (open ? "Collapse" : "Expand") + " Prompt"),
        el("span", { class: "krea2-structured-spacer" }),
      ]);
      footerHost.appendChild(header);
      if (!open) return;
      const body = el("div", { class: "krea2-footer-body" });
      if (state.show_motion_prompt) {
        body.appendChild(renderMotionSection());
      }
      showWorkToggle.textContent = state.show_work ? "Hide Work" : "Show Work";
      const promptHeader = el("div", { class: "krea2-prompt-header" }, [
        el("strong", null, "Preview"),
        el("span", { class: "krea2-structured-spacer" }),
        showWorkToggle,
      ]);
      body.appendChild(promptHeader);
      body.appendChild(livePreview.root);
      body.appendChild(showWork);
      footerHost.appendChild(body);
    }

    function render() {
      try {
        renderUnsafe();
      } catch (error) {
        console.error("[Krea2PromptWizard] render failed", error);
        castHost.innerHTML = "";
        sceneHost.innerHTML = "";
        conceptsHost.innerHTML = "";
        const fatal = el("div", { class: "krea2-wizard-fatal" }, [
          el("strong", null, "The wizard hit an error while rendering."),
          el("code", null, String(error && error.message ? error.message : error)),
        ]);
        castHost.appendChild(fatal);
        renderFooter();
      }
    }

    function renderUnsafe() {
      basePromptControl.input.value = state.base_prompt || "";
      sizeBasePrompt();
      root.classList.remove("krea2-wizard-compact", "krea2-wizard-expanded");
      root.classList.add("krea2-wizard-expanded");
      renderNodeSettings();
      castHost.innerHTML = "";
      sceneHost.innerHTML = "";
      conceptsHost.innerHTML = "";
      structuredHost.innerHTML = "";
      categoryBody.innerHTML = "";
      footerHost.innerHTML = "";
      tabBar.innerHTML = "";
      renderTabBar();
      if ((state.active_tab || "cast") === "scene") {
        renderSceneTab();
      } else {
        renderCastTab();
      }
      updateHistoryControls();
      renderLivePreview(true);
      applyPreviewMode();
      syncNodeHeight(false);
    }

    /* Pretty Prompt Preview is default OFF: the Final Prompt Preview shows
     * plain monospace code unless the settings toggle turns the grouped
     * concept-card view back on. */
    function applyPreviewMode() {
      const pretty = !!state.pretty_preview;
      if (livePreview.prettyBody) livePreview.prettyBody.style.display = pretty ? "" : "none";
      if (livePreview.codeText) livePreview.codeText.style.display = pretty ? "none" : "";
      if (livePreview.codeLabel) livePreview.codeLabel.style.display = pretty ? "none" : "";
    }

    function sizeBasePrompt() {
      const input = basePromptControl && basePromptControl.input;
      if (!input) return;
      input.style.height = "auto";
      input.style.height = Math.max(52, input.scrollHeight || 0) + "px";
    }

    /* Node sizing: grow to fit content. The v2 tabbed editor is always the
     * full surface, so the node height simply tracks root content. */
    const MIN_NODE_HEIGHT = 96;
    function syncNodeHeight() {
      const schedule = window.requestAnimationFrame || function (callback) {
        return window.setTimeout(callback, 0);
      };
      const measure = function () {
        if (!root.isConnected || !node.setSize) return;
        const current = node.size || [root.offsetWidth || 520, root.offsetHeight || 1];
        const desiredHeight = Math.max(MIN_NODE_HEIGHT, Math.ceil(root.scrollHeight || 1) + 24);
        const desiredWidth = Math.ceil(root.scrollWidth || current[0] || 520);
        if (current[1] < desiredHeight || current[0] < desiredWidth) {
          node.setSize([Math.max(current[0] || 0, desiredWidth), Math.max(current[1] || 0, desiredHeight)]);
        }
        if (node.setDirtyCanvas) node.setDirtyCanvas(true);
      };
      schedule(measure);
    }

    function copy(text) {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text || "").then(function () { showToast("Copied", "info"); }, function () {});
      }
    }

    function openLibrary() {
      openLibraryEditor({
        library: library,
        markDirty: function () { markDirty(); render(); },
        close: function () { render(); },
        saveUser: saveUserLibrary,
      });
    }

    function saveUserLibrary() {
      const userOnly = library.filter(function (p) { return p.origin === "user"; });
      const api = window.app && window.app.api;
      const url = (api && api.apiURL && api.apiURL("/krea2_prompt_wizard/library"))
        || "/krea2_prompt_wizard/library";
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presets: userOnly }),
      }).then(function (response) {
        return response.json().then(function (payload) {
          if (!response.ok) {
            const issue = payload.issues && payload.issues[0];
            throw new Error(issue ? issue.message : "Could not save the library.");
          }
          showToast("Library saved", "info");
          return payload;
        });
      });
    }

    function materialize() {
      const result = materializeToNodes(state, {});
      if (result) showToast("Materialized " + (result.nodes ? result.nodes.length : 0) + " nodes.", "info");
    }

    function createSubgraph() {
      const result = createSubgraphFromWizard(state, {});
      if (result) showToast("Subgraph created.", "info");
    }

    function resetAll() {
      if (!window.confirm("Reset all wizard state?")) return;
      state = emptyState();
      state.collapsed = {};
      markDirty();
      render();
    }

    render();
    fetchLibrary().then(function (presets) {
      library.splice(0, library.length, ...presets);
      enrichSeedRows();
      conflictPairsCache = null;
      render();
    }).catch(function () {});
    fetchConflicts().then(function (list) {
      conflictList = Array.isArray(list) ? list : [];
      conflictPairsCache = null;
    });
    fetchConceptColors().then(function (colors) {
      state.concept_colors = Object.assign({}, colors, state.concept_colors || {});
      markDirty();
      render();
    }).catch(function () {});
    fetchMasterPresets().then(function (presets) {
      masterPresets = presets;
      refreshMasterPresetSelect();
    });
    fetchLoras().then(function (names) {
      loras = names;
      render();
    });
    return {
      root: root,
      state: state,
      markDirty: markDirty,
      render: render,
      setState: setState,
      setTab: function (tabId) {
        state.active_tab = tabId;
        persist();
        render();
      },
      /* Merge a backend-resolved state (post-randomization) into the editor
       * WITHOUT disturbing what the user is looking at: the active tab, the
       * prompt footer, collapse flags, and per-character expand states are
       * UI state that must survive job executions. */
      applyResolvedState: function (resolved) {
        const previous = JSON.stringify(state);
        const merged = coerceState(resolved || {});
        const uiKeys = [
          "active_tab", "footer_open", "settings_open", "collapsed",
          "selected_character_id", "show_work",
          "show_motion_prompt", "show_face_guidance", "show_concepts_tab",
          "scene_collapsed", "wizard_expanded",
          "scene_sections", "final_preview_open", "pretty_preview",
          "character_creator",
        ];
        for (const key of uiKeys) {
          if (key in state) merged[key] = state[key];
        }
        if (Array.isArray(state.characters) && Array.isArray(merged.characters)) {
          for (let index = 0; index < merged.characters.length; index += 1) {
            const oldChar = state.characters[index];
            const newChar = merged.characters[index];
            if (oldChar && newChar) {
              newChar.expanded = oldChar.expanded !== false;
              newChar.additional_open = oldChar.additional_open === true;
              newChar.concepts_open = oldChar.concepts_open !== false;
              newChar.quick_open = oldChar.quick_open !== false;
              newChar.loras_open = oldChar.loras_open !== false;
              if (Array.isArray(oldChar.loras)) newChar.loras = oldChar.loras;
            }
          }
        }
        state = merged;
        persistedState = JSON.stringify(state);
        persist();
        render();
      },
      recordExecution: recordExecution,
      getExecutionHistory: function () { return executionHistory.slice(); },
    };
  }

  K.createWizardWidget = createWizardWidget;
})();
