/* OMEGA UI v2 Industry screen.
 * Read-only view over existing production assets, cycles, inventory and projects.
 * Does not execute factory construction, procurement, input transfer or production.
 */
(function (g) {
  'use strict';

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]; }); }
  function num(value) { if (value === null || value === undefined || value === '') return null; var n = Number(value); return Number.isFinite(n) ? n : null; }
  function fmt(value, unit) { var n = num(value); return n === null ? 'Not recorded' : n.toLocaleString('en-US', { maximumFractionDigits: 2 }) + (unit ? ' ' + esc(unit) : ''); }
  function stateRoot() { return g.Game && g.Game.state || g.gameState || null; }
  function countryProfile(value) {
    var runtime = g.OmegaCountryRuntimeData || (g.Omega && g.Omega.CountryRuntimeData);
    if (runtime && typeof runtime.resolveCountry === 'function') {
      try { var profile = runtime.resolveCountry(value); if (profile) return profile; } catch (_) {}
    }
    return null;
  }
  function countryAliases(value) {
    var aliases = [], seen = Object.create(null);
    function add(item) { var key = String(item == null ? '' : item).trim().toUpperCase(); if (key && !seen[key]) { seen[key] = true; aliases.push(key); } }
    add(value);
    var profile = countryProfile(value), identity = profile && (profile.identity || profile.country || profile);
    [profile && profile.iso3, profile && profile.alpha3, profile && profile.cca3, profile && profile.countryCode,
      profile && profile.numericCode, profile && profile.name, profile && profile.officialName, profile && profile.shortName,
      profile && profile.economyKey, profile && profile.populationKey,
      identity && identity.iso3, identity && identity.countryIso3, identity && identity.countryCode,
      identity && identity.name, identity && identity.officialName].forEach(add);
    return aliases;
  }
  function canonicalCountry(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    var profile = countryProfile(raw), identity = profile && (profile.identity || profile.country || profile);
    var code = String(profile && (profile.iso3 || profile.alpha3 || profile.cca3 || profile.countryIso3) ||
      identity && (identity.iso3 || identity.alpha3 || identity.cca3 || identity.countryIso3) || '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : raw.toUpperCase();
  }
  function pickCountryBucket(root, country) {
    if (!root || typeof root !== 'object') return null;
    var aliases = countryAliases(country);
    for (var a = 0; a < aliases.length; a += 1) {
      var direct = root[aliases[a]];
      if (direct && typeof direct === 'object') return direct;
    }
    var keys = Object.keys(root);
    for (var i = 0; i < keys.length; i += 1) {
      if (aliases.indexOf(keys[i].trim().toUpperCase()) >= 0 && root[keys[i]] && typeof root[keys[i]] === 'object') return root[keys[i]];
    }
    return null;
  }
  function countryContext(country) {
    var code = canonicalCountry(country || g.OmegaMinistryViewCountry || (g.OmegaCabinetUI && g.OmegaCabinetUI.activeCountry) || g.currentActiveCountry || '');
    var root = stateRoot() || {};
    return {
      countryId: code || null,
      resource: pickCountryBucket(root.resource, code) || pickCountryBucket(root.resources, code) || null,
      economy: pickCountryBucket(root.economy, code) || null,
      trade: pickCountryBucket(root.trade, code) || null
    };
  }
  function safeNetwork() { return g.OmegaResourceIndustrialNetwork || (g.Omega && g.Omega.ResourceIndustrialNetwork) || null; }
  function safeCatalog() { return g.OmegaResourceIndustrialCatalogData || (g.Omega && g.Omega.ResourceIndustrialCatalogData) || null; }
  function normalizeFactoryType(value, catalog) {
    var aliases = (catalog || safeCatalog() || {}).factoryTypeAliases || {};
    var key = String(value == null ? '' : value).trim().toUpperCase(), seen = Object.create(null);
    while (aliases[key] && !seen[key]) { seen[key] = true; key = String(aliases[key]).trim().toUpperCase(); }
    return key;
  }

  // Resource identities use their canonical dimensional SVGs. Factory-only
  // intermediates and finished goods receive an inline, product-labelled 3D SVG.
  var FACTORY_RAW_RESOURCE_ICON_IDS = [
    'aragonite','basalt','bauxite','boron','chromite','coal','cobalt','construction_aggregate',
    'copper','coral_aggregate','crude_oil','diamond','diatomite','dolomite','gold','granite',
    'graphite','gypsum','ilmenite','iron_ore','limestone','lithium','magnesite','manganese',
    'marble','natural_gas','nickel','niobium','oil_shale','phosphate','platinum','potash',
    'rare_earth','ruby','rutile','salt','silica_sand','silver','tin','tungsten','uranium','zinc'
  ];
  var factoryProductIconInstance = 0;

  function factoryProductKey(value) {
    return String(value == null ? '' : value).trim().toLowerCase()
      .replace(/^res[_-]?type[:_\/-]?/, '')
      .replace(/[\s-]+/g, '_');
  }

  function factoryResourceIconPath(value) {
    var id = factoryProductKey(value);
    if (FACTORY_RAW_RESOURCE_ICON_IDS.indexOf(id) < 0) return '';
    return 'assets/omega-industrial-icons-v1/resources/' + id.replace(/_/g, '-') + '.svg';
  }

  function factoryProductIconCategory(id) {
    if (/(scrap|waste|residue|slag|dross|dust|cullet|disposal|loss|recovered|recycled)/.test(id)) return 'scrap';
    if (/(battery|cell|pack|lithium_carbonate_or_hydroxide)/.test(id)) return 'battery';
    if (/(semiconductor|silicon|chip|electronic|control_module|switchgear|transformer|power_cable|grid_equipment)/.test(id)) return 'electronics';
    if (/(chemical|ammonia|caustic|solvent|gas|naphtha|propylene|polymer|resin|refinery|petroleum|pipeline)/.test(id)) return 'chemical';
    if (/(textile|fabric|garment|cotton|wool|fibre|fiber)/.test(id)) return 'textile';
    if (/(paper|packaging|board|glass|ceramic|container)/.test(id)) return 'packaging';
    if (/(food|grain|sugar|vegetable_oil|feed_byproduct)/.test(id)) return 'food';
    if (/(aircraft|aerospace|vehicle|ship|rail|transport|spare_parts)/.test(id)) return 'transport';
    if (/(concentrate|aggregate|feed|ore|phosphate|potash|gypsum|magnesia|silica|limestone|salt|bauxite|alumina)/.test(id)) return 'ore';
    if (/(steel|iron|copper|aluminum|alloy|metal|titanium|ingot|dor[eé])/.test(id)) return 'metal';
    return 'equipment';
  }

  function factoryProductPalette(category, id) {
    var palettes = {
      metal: [
        ['#f0f5f8','#b7c7d3','#526474'],['#ffd7a4','#c77a46','#63351f'],['#dce7ef','#8498aa','#3f5061']
      ],
      ore: [
        ['#f0d7b0','#be8854','#70472c'],['#e0c6a0','#a77b4b','#58422e'],['#e8c6b5','#b36b55','#65392c']
      ],
      chemical: [
        ['#b9e9f6','#4d9fbe','#17485e'],['#c5e6e1','#4c9e90','#1e514d'],['#d5d0f5','#8276bd','#40365f']
      ],
      electronics: [
        ['#b8dcff','#528dc9','#183d67'],['#c4e7ef','#4b9da9','#1c5360'],['#d5cdf7','#8273bf','#443a72']
      ],
      battery: [
        ['#b9eed8','#4aab86','#1c5b45'],['#d5edb1','#85ad4e','#425b2b'],['#c5e9eb','#4c9da3','#1c5358']
      ],
      textile: [
        ['#ead0f0','#a47ab9','#5a426d'],['#d7d0f3','#8078bf','#46416e'],['#f1cbd9','#bf718c','#6b3e50']
      ],
      packaging: [
        ['#f0dfbb','#b9955e','#67502e'],['#e0e9f1','#879cad','#465767'],['#f3d7c9','#bd8b70','#684636']
      ],
      food: [
        ['#e2edbc','#8daa5a','#4c6333'],['#f4dfaa','#c49b50','#74552b'],['#d8e7c9','#8cae80','#49664a']
      ],
      scrap: [
        ['#d3dce3','#8997a4','#46515c'],['#d8c9bd','#9a7964','#554236'],['#c9d8d2','#718f85','#3d574f']
      ],
      transport: [
        ['#ffe0b3','#c17b43','#663b1d'],['#d8e7f2','#718ea8','#344a5f'],['#f0d0c5','#b8755e','#674237']
      ],
      equipment: [
        ['#d8e8f2','#7d9eb6','#3c5366'],['#e4dfc9','#9c9470','#5b543d'],['#e5d7ed','#9b7caf','#584267']
      ]
    };
    if (category === 'metal') {
      if (/(dor[eé]|gold)/.test(id)) return ['#fff0a8','#d3a12f','#785317'];
      if (/(silver|platinum)/.test(id)) return ['#f5f8fb','#b9c4cc','#687986'];
      if (/(copper|cu)/.test(id)) return ['#ffd1a4','#c66d3e','#673a23'];
      if (/(alumin|alumina)/.test(id)) return ['#f7fbff','#b7c4ce','#667582'];
      if (/(steel|iron|alloy|titanium|nickel|chromium)/.test(id)) return ['#edf4f8','#8f9eaa','#3f4d5a'];
    }
    var rows = palettes[category] || palettes.equipment;
    var hash = 0;
    for (var i = 0; i < id.length; i += 1) hash = ((hash * 31) + id.charCodeAt(i)) >>> 0;
    return rows[hash % rows.length];
  }

  function factoryProductStamp(id) {
    var special = {
      steel:'STL', alloy_steel:'ALLOY', aluminum_ingot:'Al', alumina:'Al₂O₃',
      refined_copper:'Cu', copper_concentrate:'Cu', copper_matte:'Cu MATTE',
      iron_concentrate:'Fe', coal_concentrate:'COAL', semiconductor_chips:'Si',
      silicon_wafers:'Si', battery_cells:'CELL', battery_packs:'PACK',
      npk_fertilizer:'NPK', pharmaceutical_goods:'PHARMA', doré:'DORÉ',
      pipeline_gas:'GAS', polymer_resin:'POLY', industrial_gases:'GAS',
      industrial_chemicals:'CHEM', industrial_machinery:'MACH', vehicles:'VEH',
      aircraft:'AIR', defense_equipment:'DEF', grid_equipment:'GRID',
      power_cables:'CABLE', textile_fabric:'FABRIC', readymade_garments:'RMG',
      processed_food:'FOOD', ready_mix_concrete:'RMC', flat_glass:'GLASS',
      container_glass:'GLASS', packaging_board:'BOARD', paper:'PAPER',
      metal_scrap:'SCRAP', processing_loss:'LOSS'
    };
    if (special[id]) return special[id];
    var words = id.replace(/[^a-z0-9]+/gi, ' ').trim().split(/\s+/).filter(Boolean);
    var stamp = words.map(function (word) { return word.charAt(0); }).join('').toUpperCase();
    if (stamp.length < 2 && words.length) stamp = words[0].slice(0, 3).toUpperCase();
    return stamp.slice(0, 6) || 'ITEM';
  }

  function factoryProductIconMotif(id) {
    // Finished goods receive a physical object silhouette, not a category-wide
    // placeholder. Raw resources continue to resolve to their canonical assets.
    if (/^(steel|alloy_steel|recovered_steel)$/.test(id)) return 'steel-beam';
    if (/^doré$/.test(id)) return 'precious-metal-ingot';
    if (/^(aluminum_ingot|refined_copper|copper_matte|recovered_copper)$/.test(id)) return 'metal-ingot';
    if (/^(sorted_diamonds|sorted_ruby_rough)$/.test(id)) return 'gemstone';
    if (/^silicon_wafers$/.test(id)) return 'silicon-wafer';
    if (/^(semiconductor_chips|electronic_components|control_modules)$/.test(id)) return 'microchip';
    if (/^battery_cells$/.test(id)) return 'battery-cell';
    if (/^battery_packs$/.test(id)) return 'battery-pack';
    if (/^lithium_carbonate_or_hydroxide$/.test(id)) return 'battery-salt';
    if (/^grid_transformers$/.test(id)) return 'transformer';
    if (/^(switchgear|grid_equipment)$/.test(id)) return 'switchgear-cabinet';
    if (/^power_cables$/.test(id)) return 'cable-coil';
    if (/^(aircraft|aerospace_components)$/.test(id)) return 'aircraft';
    if (/^(ship_rail_equipment|heavy_transport_spares)$/.test(id)) return 'ship-rail';
    if (/^(vehicles|vehicle_spare_parts)$/.test(id)) return 'vehicle';
    if (/^defense_equipment$/.test(id)) return 'armored-vehicle';
    if (/^defense_spare_parts$/.test(id)) return 'defense-parts';
    if (/^(pharmaceutical_goods|medical_supplies)$/.test(id)) return 'medical-kit';
    if (/^pharma_process_waste$/.test(id)) return 'pharma-waste';
    if (/^readymade_garments$/.test(id)) return 'garment';
    if (/^(textile_fabric|secondary_textile_fibre|cotton_fibre|wool_fibre)$/.test(id)) return 'textile-roll';
    if (/^paper$/.test(id)) return 'paper-roll';
    if (/^packaging_board$/.test(id)) return 'packaging-carton';
    if (/^(flat_glass|container_glass)$/.test(id)) return 'glass-pane';
    if (/^(glass_cullet|recovered_glass)$/.test(id)) return 'glass-cullet';
    if (/^(processed_food|feed_byproduct|grain|sugar|vegetable_oil)$/.test(id)) return 'food-crate';
    if (/^(npk_fertilizer|mop_potash)$/.test(id)) return 'fertilizer-sack';
    if (/^ready_mix_concrete$/.test(id)) return 'concrete-mixer';
    if (/^cement$/.test(id)) return 'cement-bag';
    if (/^(cement_feed|calcined_gypsum)$/.test(id)) return 'mineral-sack';
    if (/^(graded_aggregate|granite_block|marble_block|limestone|aragonite_sand|basalt_aggregate|dolomite_product)$/.test(id)) return 'stone-block';
    if (/^ceramic_components$/.test(id)) return 'ceramic-tile';
    if (/^(industrial_machinery|machine_tool_parts|composite_materials)$/.test(id)) return 'machine-tool';
    if (/^(diesel|gasoline|jet_fuel|heavy_fuel_oil|naphtha|ngl|shale_oil|other_refinery_products)$/.test(id)) return 'fuel-drum';
    if (/^(industrial_gases|pipeline_gas|shale_gas|ammonia)$/.test(id)) return 'gas-cylinder';
    if (/^(industrial_chemicals|industrial_solvents|caustic_soda|propylene_feedstock|polymer_resin|boric_acid_or_borax)$/.test(id)) return 'chemical-vessel';
    if (/^recycled_(polymer|feedstock)$/.test(id)) return 'recycled-feedstock';
    if (/^(assembly_loss|alumina_residue|battery_scrap|blast_furnace_slag|chemical_process_residue|disposal_residue|e_waste|electrical_scrap|kiln_dust|manufacturing_scrap|metal_scrap|organic_processing_waste|packaging_waste|plastic_waste|precision_scrap|processing_dust|processing_loss|smelter_dross|smelter_slag|textile_waste)$/.test(id)) return 'industrial-waste';
    if (/^(glass_silica_feed|iron_concentrate|coal_concentrate|copper_concentrate|graphite_concentrate|phosphate_concentrate|titanium_feed|yellowcake|magnesia|alumina|refined_salt)$/.test(id)) return 'ore-sack';
    if (/(concentrate|yellowcake|_feed|tailings|salt|ore)$/.test(id)) {
      if (/(tailings)$/.test(id)) return 'industrial-waste';
      return 'ore-sack';
    }
    if (/^(limestone|granite|marble|aggregate)$/.test(id)) return 'stone-block';
    return 'industrial-crate';
  }

  function factoryProductShape(motif, mainGradient, topGradient, sideGradient) {
    var outline = '#263b4d';
    var highlight = '#f7fbff';
    if (motif === 'steel-beam') {
      return '<g stroke-linejoin="round"><path d="M27 29h74v15H72v40h29v15H27V84h29V44H27Z" fill="' + mainGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M27 29h74l-9 7H36Z" fill="' + topGradient + '"/><path d="M72 44v40l-9 7V51Z" fill="' + sideGradient + '"/>' +
        '<path d="M39 36h49M39 91h49" stroke="' + highlight + '" stroke-opacity=".65" stroke-width="2"/></g>';
    }
    if (motif === 'metal-ingot' || motif === 'precious-metal-ingot') {
      return '<g stroke-linejoin="round"><path d="m28 73 13-25h49l13 25-13 12H41Z" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="m28 73 13-25h49l13 25-38 15Z" fill="' + mainGradient + '" stroke="' + highlight + '" stroke-opacity=".65" stroke-width="1.4"/>' +
        '<path d="m41 48 11-9h49l-11 9Z" fill="' + topGradient + '" stroke="' + outline + '" stroke-width="1.5"/>' +
        '<path d="m51 62 13-7 13 7-13 7Z" fill="' + topGradient + '" fill-opacity=".8"/></g>';
    }
    if (motif === 'gemstone') {
      return '<g stroke-linejoin="round"><path d="m30 46 16-18h36l16 18-34 53Z" fill="' + mainGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="m30 46 24 2 10 51-34-53Zm68 0-24 2-10 51 34-53Z" fill="' + sideGradient + '" stroke="' + highlight + '" stroke-opacity=".7" stroke-width="1.2"/>' +
        '<path d="m46 28 8 20h20l8-20m-28 20 10 51 10-51" fill="' + topGradient + '" fill-opacity=".72" stroke="' + highlight + '" stroke-width="1.2"/></g>';
    }
    if (motif === 'ore-sack' || motif === 'mineral-sack' || motif === 'fertilizer-sack' || motif === 'cement-bag') {
      var sackMark = motif === 'fertilizer-sack'
        ? '<path d="M64 51c-16-17-26 3-8 11 5-6 8-11 8-11Zm0 0c16-17 26 3 8 11-5-6-8-11-8-11Zm0 7v17" fill="none" stroke="' + sideGradient + '" stroke-width="3"/>'
        : motif === 'cement-bag' ? '<path d="M46 59h36m-32 8h28" stroke="' + sideGradient + '" stroke-width="3"/><path d="M53 50h22v28H53z" fill="none" stroke="' + highlight + '" stroke-opacity=".75"/>' :
          '<path d="m44 61 10-13 10 10 8-9 13 13-13 10H54Z" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="1"/>';
      return '<g stroke-linejoin="round"><path d="M42 35h44l-5 11 10 39q-27 18-54 0l10-39Z" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M47 46h34l8 37q-25 14-50 0Z" fill="' + mainGradient + '" stroke="' + highlight + '" stroke-opacity=".72" stroke-width="1.4"/>' +
        '<path d="M42 35h44l-8 10H50Z" fill="' + topGradient + '" stroke="' + outline + '" stroke-width="1.2"/>' +
        sackMark + '<path d="M52 88h24" stroke="' + highlight + '" stroke-opacity=".55" stroke-width="2"/></g>';
    }
    if (motif === 'battery-salt') {
      return '<g stroke-linejoin="round"><path d="M32 76 43 45h42l11 31-32 17Z" fill="' + mainGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M43 45 54 34h31L85 45Z" fill="' + topGradient + '" stroke="' + outline + '" stroke-width="1.5"/>' +
        '<path d="M54 59h21m-10-10v21" stroke="' + highlight + '" stroke-width="3" stroke-linecap="round"/><path d="M32 76 64 93l32-17" fill="none" stroke="' + sideGradient + '" stroke-width="2"/></g>';
    }
    if (motif === 'stone-block' || motif === 'ceramic-tile') {
      return '<g stroke-linejoin="round"><path d="m28 51 35-20 37 19v34L64 103 28 84Z" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="m28 51 36 20 36-21-37-19Z" fill="' + topGradient + '" stroke="' + highlight + '" stroke-opacity=".72" stroke-width="1.4"/>' +
        '<path d="M64 71v32M28 51l36 20 36-22" fill="none" stroke="' + highlight + '" stroke-opacity=".54" stroke-width="1.5"/>' +
        (motif === 'ceramic-tile' ? '<path d="m42 48 22 12 23-12M42 56l22 12 23-12" fill="none" stroke="' + mainGradient + '" stroke-width="2"/>' : '') + '</g>';
    }
    if (motif === 'battery-cell' || motif === 'battery-pack') {
      if (motif === 'battery-cell') return '<g stroke-linejoin="round"><rect x="36" y="39" width="23" height="54" rx="7" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<rect x="69" y="39" width="23" height="54" rx="7" fill="' + mainGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<rect x="43" y="32" width="9" height="8" rx="2" fill="' + topGradient + '"/><rect x="76" y="32" width="9" height="8" rx="2" fill="' + topGradient + '"/>' +
        '<path d="M42 53h11m-5-5v10m28-5h11" stroke="' + highlight + '" stroke-width="2.5" stroke-linecap="round"/></g>';
      return '<g stroke-linejoin="round"><path d="M32 48h64v43H32z" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M39 39h49v44H39z" fill="' + mainGradient + '" stroke="' + highlight + '" stroke-opacity=".7" stroke-width="1.5"/>' +
        '<path d="M49 31h10v9H49zm20 0h10v9H69z" fill="' + topGradient + '" stroke="' + outline + '"/>' +
        '<path d="M64 49v25m-12-12h24" stroke="' + highlight + '" stroke-width="5" stroke-linecap="round"/></g>';
    }
    if (motif === 'microchip') {
      return '<g stroke-linejoin="round"><rect x="35" y="34" width="58" height="58" rx="8" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="3"/>' +
        '<rect x="44" y="43" width="40" height="40" rx="4" fill="' + mainGradient + '" stroke="' + highlight + '" stroke-width="1.5"/>' +
        '<rect x="53" y="52" width="22" height="22" rx="2" fill="' + topGradient + '" stroke="' + outline + '" stroke-width="1.5"/>' +
        '<path d="M43 23v11m14-11v11m14-11v11m14-11v11M43 92v12m14-12v12m14-12v12m14-12v12M24 43h11m-11 14h11m-11 14h11m58-28h12m-12 14h12m-12 14h12" stroke="' + highlight + '" stroke-width="4" stroke-linecap="round"/></g>';
    }
    if (motif === 'silicon-wafer') {
      return '<g stroke-linejoin="round"><ellipse cx="64" cy="65" rx="39" ry="31" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<ellipse cx="64" cy="56" rx="39" ry="31" fill="' + mainGradient + '" stroke="' + highlight + '" stroke-width="1.5"/>' +
        '<ellipse cx="64" cy="56" rx="29" ry="22" fill="none" stroke="' + topGradient + '" stroke-width="2"/>' +
        '<path d="M43 42h42M38 53h52M41 65h46M53 29v53m12-55v57m12-53v48" stroke="' + highlight + '" stroke-opacity=".55" stroke-width="1.3"/></g>';
    }
    if (motif === 'transformer' || motif === 'switchgear-cabinet') {
      if (motif === 'transformer') return '<g stroke-linejoin="round"><path d="M31 47h66v42H31z" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M39 38h50v43H39z" fill="' + mainGradient + '" stroke="' + highlight + '" stroke-width="1.5"/>' +
        '<path d="M48 29v11m12-11v11m12-11v11m12-11v11" stroke="' + topGradient + '" stroke-width="7"/>' +
        '<path d="M49 50q-8 9 0 18t0 10m14-28q-8 9 0 18t0 10m14-28q-8 9 0 18t0 10" fill="none" stroke="' + topGradient + '" stroke-width="3"/></g>';
      return '<g stroke-linejoin="round"><path d="M35 27h58v74H35z" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M42 34h44v60H42z" fill="' + mainGradient + '" stroke="' + highlight + '" stroke-width="1.3"/>' +
        '<rect x="50" y="43" width="28" height="15" rx="2" fill="' + topGradient + '" stroke="' + outline + '"/>' +
        '<circle cx="55" cy="70" r="4" fill="' + highlight + '"/><circle cx="70" cy="70" r="4" fill="' + topGradient + '"/>' +
        '<path d="M50 83h28M64 34v60" stroke="' + highlight + '" stroke-opacity=".7" stroke-width="1.5"/></g>';
    }
    if (motif === 'cable-coil') {
      return '<g stroke-linejoin="round"><ellipse cx="64" cy="72" rx="35" ry="20" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<ellipse cx="64" cy="59" rx="35" ry="20" fill="none" stroke="' + mainGradient + '" stroke-width="9"/>' +
        '<ellipse cx="64" cy="59" rx="22" ry="12" fill="none" stroke="' + topGradient + '" stroke-width="7"/>' +
        '<path d="M96 59c13 9 8 22-4 27" fill="none" stroke="' + highlight + '" stroke-width="3" stroke-linecap="round"/></g>';
    }
    if (motif === 'aircraft') {
      return '<g stroke-linejoin="round"><path d="M62 22 72 55 103 75 99 84 70 73 69 94 81 104 80 109 64 101 48 109 47 104 59 94 58 73 29 84 25 75 56 55Z" fill="' + mainGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="m62 22 10 33-8 7-7-7Z" fill="' + topGradient + '" stroke="' + highlight + '" stroke-opacity=".7"/>' +
        '<path d="m58 73 6-5 6 5-1 21-5 5-5-5Z" fill="' + sideGradient + '"/></g>';
    }
    if (motif === 'ship-rail') {
      return '<g stroke-linejoin="round"><path d="M23 70h82l-13 24H42Z" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M36 69V47h42v23M49 47V35h18v12" fill="' + mainGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M40 52h33v8H40Z" fill="' + topGradient + '"/><circle cx="43" cy="100" r="7" fill="' + sideGradient + '" stroke="' + highlight + '" stroke-width="2"/>' +
        '<circle cx="64" cy="100" r="7" fill="' + sideGradient + '" stroke="' + highlight + '" stroke-width="2"/><circle cx="85" cy="100" r="7" fill="' + sideGradient + '" stroke="' + highlight + '" stroke-width="2"/></g>';
    }
    if (motif === 'vehicle' || motif === 'armored-vehicle') {
      if (motif === 'armored-vehicle') return '<g stroke-linejoin="round"><path d="M25 68h78l-8 22H34Z" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M38 48h50l13 20H27Z" fill="' + mainGradient + '" stroke="' + highlight + '" stroke-width="1.4"/>' +
        '<path d="M56 48V36h25v12m-13-12h38" stroke="' + topGradient + '" stroke-width="7" stroke-linecap="round"/>' +
        '<circle cx="42" cy="88" r="8" fill="#172736" stroke="' + topGradient + '" stroke-width="3"/><circle cx="64" cy="88" r="8" fill="#172736" stroke="' + topGradient + '" stroke-width="3"/><circle cx="86" cy="88" r="8" fill="#172736" stroke="' + topGradient + '" stroke-width="3"/></g>';
      return '<g stroke-linejoin="round"><path d="M24 69 33 48h50l19 20v23H24Z" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M38 48 46 36h27l12 12Z" fill="' + topGradient + '" stroke="' + outline + '" stroke-width="1.5"/>' +
        '<path d="M29 68h69v17H29Z" fill="' + mainGradient + '"/><circle cx="43" cy="88" r="9" fill="#172736" stroke="' + topGradient + '" stroke-width="3"/>' +
        '<circle cx="85" cy="88" r="9" fill="#172736" stroke="' + topGradient + '" stroke-width="3"/></g>';
    }
    if (motif === 'defense-parts') {
      return '<g stroke-linejoin="round"><path d="M64 23 99 36v25q0 29-35 45Q29 90 29 61V36Z" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M64 32 90 42v19q0 20-26 35Q38 81 38 61V42Z" fill="' + mainGradient + '" stroke="' + highlight + '" stroke-width="1.5"/>' +
        '<path d="m52 56 12-9 12 9-4 17H56Z" fill="' + topGradient + '" stroke="' + outline + '" stroke-width="1.5"/></g>';
    }
    if (motif === 'medical-kit' || motif === 'pharma-waste') {
      return '<g stroke-linejoin="round"><rect x="30" y="43" width="68" height="49" rx="8" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M48 43v-9a7 7 0 0 1 7-7h18a7 7 0 0 1 7 7v9" fill="none" stroke="' + topGradient + '" stroke-width="7"/>' +
        '<rect x="40" y="52" width="48" height="31" rx="4" fill="' + mainGradient + '" stroke="' + highlight + '" stroke-width="1.3"/>' +
        '<path d="M64 57v21m-10-10h20" stroke="' + highlight + '" stroke-width="5" stroke-linecap="round"/>' +
        (motif === 'pharma-waste' ? '<path d="M37 98h54m-46 5h38" stroke="' + topGradient + '" stroke-width="3"/>' : '') + '</g>';
    }
    if (motif === 'garment') {
      return '<g stroke-linejoin="round"><path d="m45 35 19-8 19 8 20 17-13 15-10-8v34H48V59l-10 8-13-15Z" fill="' + mainGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="m45 35 19-8 19 8-10 15H55Z" fill="' + topGradient + '" stroke="' + highlight + '" stroke-width="1.3"/>' +
        '<path d="M64 49v39M51 64h8m18 0h-8" stroke="' + highlight + '" stroke-opacity=".7" stroke-width="1.7"/></g>';
    }
    if (motif === 'textile-roll' || motif === 'paper-roll') {
      var rollWidth = motif === 'paper-roll' ? 48 : 64;
      return '<g stroke-linejoin="round"><path d="M28 39h64v48H28Z" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M36 32h' + rollWidth + 'v55H36Z" fill="' + mainGradient + '" stroke="' + highlight + '" stroke-width="1.4"/>' +
        '<ellipse cx="36" cy="59" rx="10" ry="27" fill="' + topGradient + '" stroke="' + highlight + '" stroke-width="1.2"/>' +
        '<ellipse cx="36" cy="59" rx="4" ry="10" fill="' + sideGradient + '"/>' +
        '<path d="M49 45h27m-27 10h27m-27 10h27m-27 10h27" stroke="' + highlight + '" stroke-opacity=".6" stroke-width="2"/></g>';
    }
    if (motif === 'packaging-carton') {
      return '<g stroke-linejoin="round"><path d="m28 50 36-20 36 20-36 21Z" fill="' + topGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="m28 50 36 21v35L28 85Z" fill="' + mainGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="m64 71 36-21v35l-36 21Z" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M52 37 64 53l12-16m-12 18v17" fill="none" stroke="' + highlight + '" stroke-width="2"/></g>';
    }
    if (motif === 'glass-pane' || motif === 'glass-cullet') {
      if (motif === 'glass-cullet') return '<g stroke-linejoin="round"><path d="m28 83 13-35 16 12 10-30 13 31 19-10 8 36-32 8Z" fill="' + mainGradient + '" fill-opacity=".78" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="m41 48 12 12-8 20m22-50 9 31-15 19m38-29-18 29" fill="none" stroke="' + highlight + '" stroke-width="2"/></g>';
      return '<g stroke-linejoin="round"><path d="m30 40 49-13 16 7-49 14Z" fill="' + topGradient + '" stroke="' + outline + '" stroke-width="1.5"/>' +
        '<path d="M46 48v49l49-13V35Z" fill="' + mainGradient + '" fill-opacity=".45" stroke="' + highlight + '" stroke-width="2"/>' +
        '<path d="M30 40v49l16 8V48Z" fill="' + sideGradient + '" fill-opacity=".62" stroke="' + outline + '" stroke-width="1.5"/>' +
        '<path d="m54 45 31-8m-31 20 31-8m-31 20 31-8" stroke="' + highlight + '" stroke-opacity=".75" stroke-width="1.5"/></g>';
    }
    if (motif === 'food-crate') {
      return '<g stroke-linejoin="round"><path d="M29 49h70v41H29Z" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M36 55h56v27H36Z" fill="' + mainGradient + '" stroke="' + highlight + '" stroke-width="1.3"/>' +
        '<path d="M36 64h56M36 73h56M43 55v27m42-27v27" stroke="' + topGradient + '" stroke-width="3"/>' +
        '<path d="M49 48q-5-18 9-21 3 13-9 21Zm12 0q0-18 16-21 1 14-16 21Z" fill="' + topGradient + '" stroke="' + outline + '"/></g>';
    }
    if (motif === 'concrete-mixer') {
      return '<g stroke-linejoin="round"><path d="M33 39h61l-10 47H43Z" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M42 43h45l-8 35H49Z" fill="' + mainGradient + '" stroke="' + highlight + '" stroke-width="1.3"/>' +
        '<path d="m49 43 8-11h26l-8 11Z" fill="' + topGradient + '" stroke="' + outline + '"/>' +
        '<path d="M41 87h48m-39 0-7 10m39-10 7 10" stroke="' + topGradient + '" stroke-width="4" stroke-linecap="round"/></g>';
    }
    if (motif === 'machine-tool') {
      return '<g stroke-linejoin="round"><circle cx="64" cy="63" r="30" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<circle cx="64" cy="63" r="20" fill="' + mainGradient + '" stroke="' + highlight + '" stroke-width="1.4"/>' +
        '<circle cx="64" cy="63" r="8" fill="' + topGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M64 22v11m0 60v11M23 63h11m60 0h11M35 34l8 8m42 42 8 8M93 34l-8 8M43 84l-8 8" stroke="' + topGradient + '" stroke-width="7" stroke-linecap="round"/>' +
        '<path d="M86 31 99 19m-9 0h9v9" fill="none" stroke="' + highlight + '" stroke-width="4" stroke-linecap="round"/></g>';
    }
    if (motif === 'fuel-drum' || motif === 'gas-cylinder') {
      if (motif === 'gas-cylinder') return '<g stroke-linejoin="round"><rect x="31" y="36" width="28" height="57" rx="10" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<rect x="69" y="36" width="28" height="57" rx="10" fill="' + mainGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M39 36v-8h12v8m26 0v-8h12v8" stroke="' + topGradient + '" stroke-width="5"/>' +
        '<path d="M40 54h10m27 0h10M45 28v-5m38 5v-5" stroke="' + highlight + '" stroke-width="2"/></g>';
      return '<g stroke-linejoin="round"><rect x="33" y="33" width="28" height="61" rx="4" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<rect x="67" y="33" width="28" height="61" rx="4" fill="' + mainGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M33 47h28m-28 36h28M67 47h28m-28 36h28" stroke="' + topGradient + '" stroke-width="4"/>' +
        '<path d="M43 57c-8 10-7 17 4 19 11-2 12-9 4-19l-4-7Z" fill="' + highlight + '" fill-opacity=".85"/></g>';
    }
    if (motif === 'chemical-vessel') {
      return '<g stroke-linejoin="round"><path d="M53 25h22v17l22 39a8 8 0 0 1-7 12H38a8 8 0 0 1-7-12l22-39Z" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M44 69h40l9 14a5 5 0 0 1-5 7H40a5 5 0 0 1-5-7Z" fill="' + mainGradient + '" stroke="' + highlight + '" stroke-width="1.3"/>' +
        '<path d="M53 25h22v8H53zM57 18h14v8H57z" fill="' + topGradient + '" stroke="' + outline + '"/>' +
        '<path d="M48 57q16-8 32 0" fill="none" stroke="' + highlight + '" stroke-width="2"/></g>';
    }
    if (motif === 'industrial-waste' || motif === 'recycled-feedstock' || motif === 'pharma-waste') {
      if (motif === 'recycled-feedstock') return '<g stroke-linejoin="round"><path d="m30 61 14-24h40l14 24-14 28H44Z" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M43 55h42v25H43Z" fill="' + mainGradient + '" stroke="' + highlight + '" stroke-width="1.3"/>' +
        '<circle cx="53" cy="65" r="5" fill="' + topGradient + '"/><circle cx="68" cy="61" r="5" fill="' + topGradient + '"/><circle cx="76" cy="73" r="5" fill="' + topGradient + '"/>' +
        '<path d="M42 44h44" stroke="' + highlight + '" stroke-width="2"/></g>';
      if (motif === 'pharma-waste') return '<g stroke-linejoin="round"><rect x="34" y="37" width="60" height="56" rx="6" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M44 48h40v34H44Z" fill="' + mainGradient + '" stroke="' + highlight + '" stroke-width="1.2"/>' +
        '<path d="m64 53 13 24H51Z" fill="' + topGradient + '" stroke="' + outline + '"/><path d="M64 61v8m0 4h.01" stroke="' + outline + '" stroke-width="3"/></g>';
      return '<g stroke-linejoin="round"><path d="M39 36h50l-4 58H43Z" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="M34 33h60v8H34Z" fill="' + topGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
        '<path d="m50 58 8-11 8 11m-8-11v25m0 0-8-8m8 8 8-8" fill="none" stroke="' + highlight + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M50 78h28" stroke="' + highlight + '" stroke-opacity=".65" stroke-width="2"/></g>';
    }
    // A labelled industrial crate is reserved for future products not yet
    // assigned a dedicated canonical motif mapping.
    return '<g stroke-linejoin="round"><path d="m27 48 37-21 37 21-37 22Z" fill="' + topGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
      '<path d="m27 48 37 22v34L27 82Z" fill="' + mainGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
      '<path d="m64 70 37-22v34l-37 22Z" fill="' + sideGradient + '" stroke="' + outline + '" stroke-width="2"/>' +
      '<path d="M45 52v42m38-42v42M27 65l37 22 37-22" fill="none" stroke="' + highlight + '" stroke-opacity=".65" stroke-width="2"/></g>';
  }

  function factoryProductIconVisualMarkup(productId, label) {
    var id = factoryProductKey(productId);
    var safeLabel = String(label || productId || 'Industrial product');
    var resourcePath = factoryResourceIconPath(id);
    if (resourcePath) {
      return '<img class="fp-product-icon-visual fp-product-icon-visual--resource" src="' + esc(resourcePath) +
        '" alt="' + esc(safeLabel + ' icon') + '" width="128" height="128" loading="eager" decoding="async" ' +
        'data-factory-product-icon="' + esc(id) + '" data-icon-source="canonical-resource">';
    }
    var category = factoryProductIconCategory(id);
    var colors = factoryProductPalette(category, id);
    var token = 'fp-product-' + (++factoryProductIconInstance);
    var stamp = factoryProductStamp(id);
    var motif = factoryProductIconMotif(id);
    var shape = factoryProductShape(motif, 'url(#' + token + '-main)', 'url(#' + token + '-top)', 'url(#' + token + '-side)');
    return '<svg class="fp-product-icon-visual fp-product-icon-visual--finished" viewBox="0 0 128 128" width="128" height="128" role="img" ' +
      'aria-label="' + esc(safeLabel + ' icon') + '" data-factory-product-icon="' + esc(id) + '" data-icon-source="generated-product" data-icon-motif="' + esc(motif) + '">' +
      '<title>' + esc(safeLabel) + '</title><defs>' +
      '<linearGradient id="' + token + '-main" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + colors[0] + '"/><stop offset=".55" stop-color="' + colors[1] + '"/><stop offset="1" stop-color="' + colors[2] + '"/></linearGradient>' +
      '<linearGradient id="' + token + '-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".4" stop-color="' + colors[0] + '"/><stop offset="1" stop-color="' + colors[1] + '"/></linearGradient>' +
      '<linearGradient id="' + token + '-side" x1="0" y1="0" x2="1" y2=".8"><stop offset="0" stop-color="' + colors[1] + '"/><stop offset="1" stop-color="' + colors[2] + '"/></linearGradient>' +
      '<linearGradient id="' + token + '-plate" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5f8fb"/><stop offset=".55" stop-color="#d7e2e9"/><stop offset="1" stop-color="#a9bbc7"/></linearGradient>' +
      '<filter id="' + token + '-shadow" x="-40%" y="-40%" width="180%" height="190%"><feGaussianBlur stdDeviation="3"/></filter></defs>' +
      '<rect x="4.5" y="4.5" width="119" height="119" rx="21" fill="url(#' + token + '-plate)" stroke="#708697" stroke-opacity=".62"/>' +
      '<path d="M15 29V19a4 4 0 0 1 4-4h13m66 0h10a5 5 0 0 1 5 5v10M15 94v11a6 6 0 0 0 6 6h11m65 0h10a6 6 0 0 0 6-6V94" fill="none" stroke="' + colors[1] + '" stroke-opacity=".7" stroke-width="1.5"/>' +
      '<ellipse cx="64" cy="96" rx="43" ry="8" fill="#07111a" opacity=".58" filter="url(#' + token + '-shadow)"/>' +
      '<ellipse cx="64" cy="95" rx="42" ry="7" fill="#243849" fill-opacity=".28" stroke="#657b8b" stroke-opacity=".55"/>' +
      shape +
      '<path d="M27 99h74" stroke="' + colors[2] + '" stroke-opacity=".42" stroke-width="1.2"/>' +
      '<rect x="37" y="100" width="54" height="15" rx="4" fill="#183044" stroke="#f6fbff" stroke-opacity=".76" stroke-width="1"/>' +
      '<text x="64" y="110.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="' + (stamp.length > 5 ? '7' : stamp.length > 3 ? '8' : '10') + '" font-weight="900" letter-spacing=".3" fill="#f5fbff">' + esc(stamp) + '</text>' +
      '<path d="M25 39l.7 2.1 2.1.7-2.1.7L25 45.6l-.7-2.1-2.1-.7 2.1-.7Z" fill="#fff" opacity=".8"/>' +
      '<path d="M101 36l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6Z" fill="#fff" opacity=".8"/>' +
      '</svg>';
  }

  function factoryProductIdentityMarkup(productId, label) {
    var id = factoryProductKey(productId);
    var safeLabel = String(label || productId || 'Industrial product');
    return '<span class="fp-product-identity" data-factory-product-identity="' + esc(id) + '">' +
      '<span class="fp-product-icon-frame">' + factoryProductIconVisualMarkup(id, safeLabel) + '</span>' +
      '<span class="fp-product-identity-copy"><strong>' + esc(safeLabel) + '</strong><small>' + esc(productId || 'Product ID not recorded') + '</small></span></span>';
  }

  function factoryProductStockMarkup(productId, label, value) {
    var id = factoryProductKey(productId);
    return '<span class="fp-product-stock-quantity" data-factory-stock-product="' + esc(id) + '">' +
      '<span class="fp-product-icon-frame fp-product-icon-frame--stock">' + factoryProductIconVisualMarkup(id, label) + '</span>' +
      '<strong>' + value + '</strong></span>';
  }



  function playerCountryId() {
    var state = stateRoot() || {};
    var value = state.simulation && state.simulation.session && state.simulation.session.playerCountryId ||
      state.simulation && state.simulation.playerCountryId || state.playerCountryId ||
      g.Omega && g.Omega.Simulation && g.Omega.Simulation.playerCountryId ||
      g.Game && g.Game.playerCountryId || g.currentPlayerCountry || '';
    if (!value) {
      try { value = g.Omega && g.Omega.Simulation && typeof g.Omega.Simulation.getPlayerCountryId === 'function'
        ? g.Omega.Simulation.getPlayerCountryId() : ''; } catch (_) {}
    }
    return canonicalCountry(value);
  }
  function factoryAssetRows(resource, economy) {
    economy = economy && typeof economy === 'object' ? economy : {};
    // economy[country].productionAssets is the single authoritative factory registry.
    // Resource/industrial mirrors are not merged into ownership counts.
    var rows = Array.isArray(economy.productionAssets) ? economy.productionAssets : [];
    var byId = Object.create(null), ordered = [];
    rows.forEach(function (asset) {
      if (!asset || typeof asset !== 'object') return;
      var id = String(asset.id || asset.assetId || asset.factoryId || asset.projectId || '').trim();
      if (!id) return;
      var descriptor = [asset.factoryType, asset.facilityType, asset.assetType, asset.type, asset.stage, asset.name].join(' ').toUpperCase();
      var clearlyMineOnly = /(^|[\s_-])(MINE|MINING|EXTRACTION|EXTRACTOR|QUARRY|DEPOSIT|OIL_FIELD|GAS_FIELD)([\s_-]|$)/.test(descriptor) &&
        !/(PROCESS|MILL|SMELT|REFIN|FACTORY|PLANT)/.test(descriptor);
      if (clearlyMineOnly) return;
      var key = id.toUpperCase();
      if (byId[key]) {
        byId[key] = Object.assign({}, byId[key], asset);
        return;
      }
      byId[key] = Object.assign({}, asset);
      ordered.push(key);
    });
    return ordered.map(function (key) { return byId[key]; });
  }
  function countryMineSiteRows(country, resource) {
    var wanted = canonicalCountry(country), aliases = countryAliases(wanted), all = [];
    if (!wanted) return [];
    var canonical = g.OmegaResourceSiteCanonicalCatalogData || (g.Omega && g.Omega.ResourceSiteCanonicalCatalogData);
    var binding = g.OmegaIndividualResourceSiteBinding || (g.Omega && g.Omega.IndividualResourceSiteBinding);
    if (canonical && Array.isArray(canonical.sites)) all = all.concat(canonical.sites);
    if (binding && Array.isArray(binding.sites)) all = all.concat(binding.sites);
    if (resource && Array.isArray(resource.mineSiteReferences)) all = all.concat(resource.mineSiteReferences);
    var byId = Object.create(null);
    all.forEach(function (site) {
      if (!site || typeof site !== 'object' || (site.runtime && site.runtime.aliasOfSiteId)) return;
      var id = String(site.siteId || site.siteReferenceKey || site.id || '').trim();
      var siteCountry = site.countryId || site.countryCode || site.identity && site.identity.countryIso3 ||
        site.sourceSiteRecord && site.sourceSiteRecord.countryCode || '';
      if (!id || !siteCountry) return;
      var candidate = canonicalCountry(siteCountry);
      var matched = candidate === wanted;
      if (!matched) {
        var candidateAliases = countryAliases(siteCountry);
        matched = candidateAliases.some(function (value) { return aliases.indexOf(value) >= 0; });
      }
      if (!matched) return;
      if (!byId[id]) byId[id] = Object.assign({}, site, { siteId: id });
    });
    return Object.keys(byId).map(function (id) { return byId[id]; }).sort(function (a, b) {
      return String(a.siteName || a.name || a.siteId).localeCompare(String(b.siteName || b.name || b.siteId));
    });
  }
  function metricBasis(metric) {
    var status = String(metric && metric.status || metric && metric.authority || '').toUpperCase();
    if (/OBSERVED|MEASURED|REPORTED|VERIFIED_SOURCE/.test(status)) return 'Reported';
    if (/SIMULATED|MODELED|GAMEPLAY/.test(status)) return 'Game model';
    return status ? 'Source status: ' + status : 'Source not recorded';
  }
  function unitIsDaily(unit) { return /(?:\/\s*day|per[_\s-]*day|daily|day[_\s-]*1)/i.test(String(unit || '')); }
  function dayUnit(unit) {
    var value = String(unit || '').trim();
    if (!value) return 'units/day';
    if (unitIsDaily(value)) return value.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
    return value.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() + '/day';
  }
  function mineDailyProduction(site) {
    site = site && typeof site === 'object' ? site : {};
    var quantitative = site.quantitative || site.real && site.real.quantitative || {};
    var production = quantitative.production || site.production || {};
    var capacity = quantitative.capacity || site.capacity || {};
    var simulation = site.simulation || {};
    var rate = num(production.rate !== undefined ? production.rate : production.dailyRate);
    var unit = production.unit || production.rateUnit || simulation.rateUnit || simulation.productionRateUnit || '';
    if (rate !== null && unitIsDaily(unit)) {
      return { value: rate, unit: dayUnit(unit), basis: metricBasis(production), kind: 'rate' };
    }
    var annual = num(production.annual !== undefined ? production.annual : production.annualProduction);
    var annualUnit = production.annualUnit || unit;
    if (annual !== null && /(?:\/\s*year|per[_\s-]*year|annual|yearly)/i.test(String(annualUnit || ''))) {
      return { value: annual / 365, unit: dayUnit(String(annualUnit).replace(/\/\s*year|per[_\s-]*year|annual|yearly/i, '')), basis: metricBasis(production) + ' · annual ÷ 365 days', kind: 'derived' };
    }
    var simulatedDaily = num(simulation.dailyRate !== undefined ? simulation.dailyRate : simulation.dailyProductionRate);
    if (simulatedDaily !== null) {
      return { value: simulatedDaily, unit: dayUnit(simulation.rateUnit || simulation.productionRateUnit || unit), basis: 'Game model', kind: 'rate' };
    }
    var modeledRate = num(simulation.productionRate);
    if (modeledRate !== null && unitIsDaily(simulation.rateUnit || simulation.productionRateUnit || unit)) {
      return { value: modeledRate, unit: dayUnit(simulation.rateUnit || simulation.productionRateUnit || unit), basis: 'Game model', kind: 'rate' };
    }
    var nominal = num(capacity.nominal !== undefined ? capacity.nominal : capacity.quantity);
    var capacityUnit = capacity.unit || production.unit || '';
    if (nominal !== null && unitIsDaily(capacityUnit)) {
      return { value: nominal, unit: dayUnit(capacityUnit), basis: metricBasis(capacity) + ' · capacity, not guaranteed output', kind: 'capacity' };
    }
    var simulatedCapacity = num(simulation.nominalDailyCapacity !== undefined ? simulation.nominalDailyCapacity : simulation.minimumDailyCapacity);
    if (simulatedCapacity !== null) {
      return { value: simulatedCapacity, unit: dayUnit(simulation.productionRateUnit || simulation.capacityUnit || unit), basis: 'Game model · capacity, not guaranteed output', kind: 'capacity' };
    }
    return { value: null, unit: '', basis: 'Not recorded', kind: 'unknown' };
  }
  function currentTurnResourceAdded(resource, countryId) {
    var root = stateRoot() || {}, sim = root.simulation || {};
    var turn = num(sim.turn !== undefined ? sim.turn : root.turn !== undefined ? root.turn : root.simulationTurn);
    var daysPerTurn = num(sim.daysPerTurn !== undefined ? sim.daysPerTurn : root.daysPerTurn);
    if (daysPerTurn !== null && daysPerTurn <= 0) daysPerTurn = null;
    var industrial = resource && resource.industrialNetwork || {};
    var flows = Array.isArray(industrial.siteFlowLedger) ? industrial.siteFlowLedger :
      resource && Array.isArray(resource.siteFlowLedger) ? resource.siteFlowLedger : [];
    var groups = Object.create(null), ordered = [];
    flows.forEach(function (flow) {
      if (!flow || typeof flow !== 'object') return;
      var flowCountry = flow.countryId ? canonicalCountry(flow.countryId) : countryId;
      if (flowCountry !== countryId) return;
      var flowTurn = num(flow.extractionTurn !== undefined ? flow.extractionTurn : flow.createdTurn !== undefined ? flow.createdTurn : flow.turn);
      if (turn === null || flowTurn !== turn) return;
      if (/BLOCKED_EXTRACTION|EXTRACTION_BLOCKED|NO_EXTRACTION/.test(String(flow.status || '').toUpperCase())) return;
      var quantity = num(flow.quantity);
      var resourceId = String(flow.resourceId || flow.materialIdentity || 'Not recorded').trim();
      var unit = String(flow.unit || flow.quantityUnit || 'unit not recorded').trim();
      if (quantity === null || quantity <= 0) return;
      var key = resourceId.toLowerCase() + '|' + unit.toLowerCase();
      if (!groups[key]) {
        groups[key] = { resourceId: resourceId, unit: unit, quantity: 0, batchCount: 0, siteIds: Object.create(null) };
        ordered.push(key);
      }
      groups[key].quantity += quantity;
      groups[key].batchCount += 1;
      if (flow.siteId) groups[key].siteIds[String(flow.siteId)] = true;
    });
    return {
      turn: turn,
      rows: ordered.map(function (key) {
        var row = groups[key];
        return { resourceId: row.resourceId, unit: row.unit, quantity: row.quantity, batchCount: row.batchCount,
          siteCount: Object.keys(row.siteIds).length, averagePerDay: daysPerTurn === null ? null : Number((row.quantity / daysPerTurn).toFixed(6)) };
      }),
      daysPerTurn: daysPerTurn
    };
  }
  function mineAssetRows(resource) {
    var network = resource && resource.industrialNetwork || {};
    var rows = []
      .concat(Array.isArray(resource && resource.mineAssets) ? resource.mineAssets : [])
      .concat(Array.isArray(network.mineAssets) ? network.mineAssets : []);
    var byId = Object.create(null);
    rows.forEach(function (row) {
      if (!row || typeof row !== 'object') return;
      var id = String(row.siteId || row.assetId || row.id || '').trim();
      if (!id) return;
      byId[id] = Object.assign({}, byId[id] || {}, row);
    });
    return Object.keys(byId).map(function (id) { return byId[id]; });
  }

  function buildViewModel(options) {
    options = options || {};
    var context = countryContext(options.countryId);
    var resource = context.resource || {};
    var economy = context.economy || {};
    var industrial = resource.industrialNetwork && typeof resource.industrialNetwork === 'object' ? resource.industrialNetwork : {};
    var catalog = safeCatalog() || {};
    var factoryDataRuntime = g.OmegaCountryFactoryStartingBaselineV1 ||
      (g.Omega && g.Omega.CountryFactoryStartingBaselineV1) || null;
    var factoryStartingRegistry = null;
    if (context.countryId && factoryDataRuntime && typeof factoryDataRuntime.getCountryFactoryRegistry === 'function') {
      try { factoryStartingRegistry = factoryDataRuntime.getCountryFactoryRegistry(context.countryId); } catch (_) { factoryStartingRegistry = null; }
    }
    var inventoryRuntime = g.OmegaCountryInventoryRuntime || (g.Omega && g.Omega.CountryInventoryRuntime) || null;
    var nationalInventory = null, canonicalResourceIds = [];
    if (context.countryId && inventoryRuntime && typeof inventoryRuntime.getInventory === 'function') {
      try { nationalInventory = inventoryRuntime.getInventory(context.countryId, { includeZero: true, includeLedger: false }); } catch (_) { nationalInventory = null; }
    }
    var finishedGoodsLedger = Array.isArray(resource.finishedGoodsLedger) ? resource.finishedGoodsLedger.slice() : [];
    var economyIndustrialRuntime = economy.industrialRuntime && typeof economy.industrialRuntime === 'object' ? economy.industrialRuntime : {};
    var economyFinishedGoods = Array.isArray(economyIndustrialRuntime.finishedGoodsLedger) ? economyIndustrialRuntime.finishedGoodsLedger : [];
    var finishedEventIds = Object.create(null);
    finishedGoodsLedger.forEach(function (row) { if (row && row.transactionId) finishedEventIds[String(row.transactionId)] = true; });
    economyFinishedGoods.forEach(function (row) {
      var id = String(row && row.transactionId || '');
      if (row && (!id || !finishedEventIds[id])) { finishedGoodsLedger.push(row); if (id) finishedEventIds[id] = true; }
    });
    var resourceBatches = Array.isArray(resource.batches) ? resource.batches : [];
    var resourceInventoryLedger = Array.isArray(resource.inventoryLedger) ? resource.inventoryLedger : [];
    var processedWarehouse = resource.processedWarehouse && typeof resource.processedWarehouse === 'object' ? resource.processedWarehouse : {};
    var nationalDemandRuntime = resource.nationalDemandRuntime && typeof resource.nationalDemandRuntime === 'object'
      ? resource.nationalDemandRuntime : resource.demandRuntime && typeof resource.demandRuntime === 'object' ? resource.demandRuntime : {};
    var demandByProduct = nationalDemandRuntime.byResource && typeof nationalDemandRuntime.byResource === 'object'
      ? nationalDemandRuntime.byResource : {};
    var domesticSales = Array.isArray(context.trade && context.trade.domesticSales) ? context.trade.domesticSales : [];
    try {
      if (inventoryRuntime && typeof inventoryRuntime.getResourceCatalog === 'function') {
        canonicalResourceIds = inventoryRuntime.getResourceCatalog().map(function (row) {
          return String(row && (row.resourceId || row.id) || '').trim().toLowerCase();
        }).filter(Boolean);
      }
    } catch (_) { canonicalResourceIds = []; }
    var assets = factoryAssetRows(resource, economy);
    var rawMineSites = countryMineSiteRows(context.countryId, resource);
    var mineAssets = mineAssetRows(resource);
    var currentExtraction = currentTurnResourceAdded(resource, context.countryId);
    var projects = Array.isArray(industrial.projects) ? industrial.projects : (Array.isArray(economy.projects) ? economy.projects : []);
    var researchProjects = Array.isArray(resource.technologyResearchProjects) ? resource.technologyResearchProjects : [];
    var technologyTransfers = Array.isArray(resource.technologyTransfers) ? resource.technologyTransfers : [];
    var technologyCapabilities = Array.isArray(resource.technologyCapabilities) ? resource.technologyCapabilities : [];
    var technologyContracts = Array.isArray(industrial.technologyContracts) ? industrial.technologyContracts : [];
    var cycles = industrial.factoryProductionCycles && typeof industrial.factoryProductionCycles === 'object' ? industrial.factoryProductionCycles : {};
    var runs = industrial.factoryRuntime && typeof industrial.factoryRuntime === 'object' ? industrial.factoryRuntime : {};
    var profiles = catalog.factoryProfiles && typeof catalog.factoryProfiles === 'object' ? catalog.factoryProfiles : {};
    var recipeCatalog = catalog.downstreamFactoryRecipes && typeof catalog.downstreamFactoryRecipes === 'object' ? catalog.downstreamFactoryRecipes : {};
    var processingRules = catalog.processingRules && typeof catalog.processingRules === 'object' ? catalog.processingRules : {};
    var flows = Array.isArray(industrial.siteFlowLedger) ? industrial.siteFlowLedger : (Array.isArray(resource.siteFlowLedger) ? resource.siteFlowLedger : []);
    var mappedAssets = assets.map(function (asset) {
      asset = asset && typeof asset === 'object' ? asset : {};
      var id = String(asset.id || asset.assetId || asset.projectId || '');
      var rawType = String(asset.factoryType || asset.type || asset.facilityType || '');
      var type = normalizeFactoryType(rawType, catalog) || rawType;
      var profile = profiles[type] || profiles[rawType.toUpperCase()] || profiles[rawType] || {};
      var recipeId = String(asset.recipeId || profile.defaultRecipeId || '');
      var selectedRecipe = recipeCatalog[recipeId] || null;
      if (!selectedRecipe && Array.isArray(profile.recipeIds) && profile.recipeIds.length === 1) {
        selectedRecipe = recipeCatalog[String(profile.recipeIds[0])] || null;
        if (selectedRecipe) recipeId = String(selectedRecipe.recipeId || profile.recipeIds[0]);
      }
      var cycle = cycles[id] || null;
      var run = runs[id] || null;
      var health = asset.productionHealth && typeof asset.productionHealth === 'object' ? asset.productionHealth : {};
      var input = asset.inputInventory && typeof asset.inputInventory === 'object' ? asset.inputInventory : {};
      var inputRows = Object.keys(input).map(function (key) { return { resourceId: key, quantity: num(input[key]), rawValue: input[key] }; });
      var employment = asset.employment && typeof asset.employment === 'object' ? asset.employment : {};
      var inputCoefficients = asset.inputCoefficients || asset.inputs || asset.inputProfile || {};
      if (!Object.keys(inputCoefficients).length && selectedRecipe && selectedRecipe.inputs) inputCoefficients = selectedRecipe.inputs;
      if (!Object.keys(inputCoefficients).length) {
        var inputResource = String(asset.resourceId || asset.inputResourceId || asset.primaryInputResourceId || '').trim();
        var processingRule = inputResource ? processingRules[inputResource] : null;
        if (processingRule && (!processingRule.factoryType || normalizeFactoryType(processingRule.factoryType, catalog) === type) && processingRule.inputs) {
          inputCoefficients = processingRule.inputs;
        }
      }
      var outputProfile = asset.outputProfile || asset.outputs || asset.outputCoefficients || {};
      if (!Object.keys(outputProfile).length && selectedRecipe && selectedRecipe.outputs) outputProfile = selectedRecipe.outputs;
      var capacityPerDay = num(asset.capacityPerDay !== undefined ? asset.capacityPerDay : asset.capacity !== undefined ? asset.capacity : asset.productionCapacity);
      if (capacityPerDay === null) capacityPerDay = num(profile.defaultCapacityPerDay);
      return {
        id: id || null,
        name: String(asset.name || asset.factoryName || profile.name || type || id || 'Unnamed registered factory'),
        type: type || 'Not recorded',
        recipeId: recipeId || 'Not recorded',
        status: String(asset.status || 'NOT_RECORDED'),
        capacityPerDay: capacityPerDay,
        productivityPct: num(health.productivityPct),
        healthStatus: String(health.status || 'NOT_RECORDED'),
        healthReason: String(health.reason || 'Not recorded'),
        location: String(asset.locationNodeKey || asset.location || 'Not recorded'),
        jobsFilled: num(employment.jobsFilled),
        jobSlots: num(employment.jobsSupported !== undefined ? employment.jobsSupported : profile.employment && profile.employment.jobsPerFactory),
        vacancies: num(employment.vacancies),
        inputRows: inputRows,
        inputCoefficients: inputCoefficients,
        inputUnit: String(asset.inputUnit || selectedRecipe && selectedRecipe.inputUnit || profile.inputUnit || ''),
        cycleDays: num(selectedRecipe && selectedRecipe.cycleDays) || num(profile.cycleDays) || 1,
        inputLots: Array.isArray(asset.inputBatchLots) ? asset.inputBatchLots : [],
        inputUnits: asset.inputUnits && typeof asset.inputUnits === 'object' ? asset.inputUnits : {},
        hasInputInventory: !!(asset.inputInventory && typeof asset.inputInventory === 'object'),
        outputProfile: outputProfile,
        cycle: cycle,
        lastRun: run,
        lastProductionTurn: run && (run.turn !== undefined ? run.turn : run.simulationTurn) !== undefined ? (run.turn !== undefined ? run.turn : run.simulationTurn) : (asset.lastProductionTurn !== undefined ? asset.lastProductionTurn : null),
        latestOutputs: run && (run.outputQuantities || run.outputs) || null,
        authority: String(profile.authority || asset.authority || 'NOT_RECORDED'),
        raw: asset
      };
    }).filter(function (factory) { return !/^(DECOMMISSIONED|DESTROYED|UNDER_CONSTRUCTION)$/.test(String(factory.status || '').trim().toUpperCase()); });
    var mineSites = rawMineSites.map(function (site) {
      var quantitative = site.quantitative || site.real && site.real.quantitative || {};
      var production = mineDailyProduction(site);
      var resourceId = String(site.identity && (site.identity.resourceTypeId || site.identity.resourceId || site.identity.resourceName) ||
        site.sourceSiteRecord && (site.sourceSiteRecord.resourceId || site.sourceSiteRecord.resourceTypeId) || site.resourceId || site.resourceTypeId || 'Not recorded');
      var operation = site.operation || {};
      return {
        siteId: String(site.siteId || site.siteReferenceKey || site.id || ''),
        name: String(site.siteName || site.name || site.siteId || 'Unnamed resource site'),
        resourceId: resourceId,
        status: String(operation.realWorldStatus || operation.status || site.status || site.sourceSiteRecord && site.sourceSiteRecord.status || 'NOT_RECORDED'),
        dailyProduction: production,
        reserve: quantitative.reserve || null,
        raw: site
      };
    });
    var dailyProductionKnownCount = mineSites.filter(function (site) { return site.dailyProduction && site.dailyProduction.value !== null; }).length;
    var currentExtractionRows = currentExtraction.rows;
    var operatingMineCount = mineAssets.filter(function (asset) { return /^(OPERATIONAL|ACTIVE|RUNNING)$/.test(String(asset.status || '').toUpperCase()); }).length;
    var factoryTypeCountsIndex = Object.create(null);
    mappedAssets.forEach(function (factory) {
      var typeKey = normalizeFactoryType(factory.type || '', catalog) || String(factory.type || 'NOT_RECORDED').trim().toUpperCase() || 'NOT_RECORDED';
      if (!factoryTypeCountsIndex[typeKey]) {
        var profile = profiles[typeKey] || profiles[factory.type] || {};
        factoryTypeCountsIndex[typeKey] = { type: typeKey, name: String(profile.name || factory.type || 'Not recorded'), count: 0 };
      }
      factoryTypeCountsIndex[typeKey].count += 1;
    });
    // The baseline runtime already owns the country's factory counts. Use it only
    // to restore card display when starting asset records are absent. Once the
    // live registry is registered, the live asset count always wins.
    if (factoryStartingRegistry && factoryStartingRegistry.status === 'READY' && Array.isArray(factoryStartingRegistry.registry)) {
      var liveFactoryCounts = factoryStartingRegistry.liveFactoryTypeCounts || {};
      factoryStartingRegistry.registry.forEach(function (row) {
        var typeKey = normalizeFactoryType(row && row.factoryType || '', catalog);
        if (!typeKey) return;
        var liveCount = Number(liveFactoryCounts[typeKey]);
        if (!Number.isFinite(liveCount) || liveCount < 0) liveCount = 0;
        var nonBaselineActiveCount = mappedAssets.filter(function (factory) {
          return normalizeFactoryType(factory.type || '', catalog) === typeKey &&
            String(factory.raw && factory.raw.sourceType || '').toUpperCase() !== 'COUNTRY_STARTING_FACTORY_BASELINE';
        }).length;
        // The country baseline is the common factory count. Add completed
        // player builds, but never let missing baseline records hide the count.
        var count = factoryStartingRegistry.runtimeRegistered === true
          ? liveCount
          : Math.max(0, Number(row.startingCount) || 0) + nonBaselineActiveCount;
        var profile = profiles[typeKey] || {};
        if (!factoryTypeCountsIndex[typeKey]) {
          factoryTypeCountsIndex[typeKey] = { type: typeKey, name: String(row.name || profile.name || typeKey), count: count };
        } else {
          factoryTypeCountsIndex[typeKey].count = count;
          if (row.name || profile.name) factoryTypeCountsIndex[typeKey].name = String(row.name || profile.name);
        }
      });
    }
    var factoryTypeCounts = Object.keys(factoryTypeCountsIndex).map(function (key) {
      return factoryTypeCountsIndex[key];
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var factoryCount = factoryTypeCounts.reduce(function (total, row) { return total + (Number(row.count) || 0); }, 0);
    var seenCatalogTypes = Object.create(null);
    var factoryTypeCatalog = Object.keys(profiles).map(function (rawType) {
      var profile = profiles[rawType] || {};
      var type = normalizeFactoryType(rawType, catalog) || rawType;
      if (seenCatalogTypes[type]) return null;
      seenCatalogTypes[type] = true;
      return {
        type: type, name: String(profile.name || type),
        category: String(profile.category || profile.subCategory || 'Uncategorised'),
        constructionCost: num(profile.constructionCost), constructionDays: num(profile.constructionDays),
        defaultCapacityPerDay: num(profile.defaultCapacityPerDay),
        defaultRecipeId: String(profile.defaultRecipeId || ''), simulationOnly: profile.simulationOnly === true
      };
    }).filter(Boolean).sort(function (a, b) {
      return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
    });
    var cyclesList = Object.keys(cycles).map(function (id) { return Object.assign({ factoryId: id }, cycles[id] || {}); });
    return {
      countryId: context.countryId,
      hasCountryState: !!(context.resource || context.economy),
      factoryCount: factoryCount,
      factoryTypeCounts: factoryTypeCounts,
      factoryTypeCatalog: factoryTypeCatalog,
      canonicalResourceIds: canonicalResourceIds,
      factories: mappedAssets,
      factoryNames: mappedAssets.map(function (row) { return row.name; }),
      playerCountryId: playerCountryId() || null,
      canOperateSelectedCountry: !!context.countryId && !!playerCountryId() && playerCountryId() === context.countryId,
      registeredMineSiteCount: mineSites.length,
      mineAssetCount: mineAssets.length,
      operatingMineCount: operatingMineCount,
      mineSites: mineSites,
      dailyProductionKnownCount: dailyProductionKnownCount,
      currentTurnExtraction: currentExtractionRows,
      currentTurnNumber: currentExtraction.turn,
      currentTurnDaysPerTurn: currentExtraction.daysPerTurn,
      projects: projects.slice(),
      researchProjects: researchProjects.slice(),
      technologyTransfers: technologyTransfers.slice(),
      technologyCapabilities: technologyCapabilities.slice(),
      technologyContracts: technologyContracts.slice(),
      cycles: cyclesList,
      recentFlowCount: flows.length,
      recentFlows: flows.slice(-20).reverse(),
      catalogProfileCount: Object.keys(profiles).length,
      catalogProfiles: profiles,
      catalogRecipes: recipeCatalog,
      processingRules: processingRules,
      factoryBaselineStatus: factoryStartingRegistry && factoryStartingRegistry.status || 'NOT_READY',
      factoryInputCoverageDays: Math.max(1, Math.min(3650, Math.round(num(resource.factoryInputBaselineV1 && resource.factoryInputBaselineV1.targetCoverageDays) || num(resource.factoryInputPolicy && resource.factoryInputPolicy.targetCoverageDays) || 100))),
      inputInventoryCount: mappedAssets.reduce(function (total, row) { return total + row.inputRows.filter(function (input) { return input.quantity !== null && input.quantity > 0; }).length; }, 0),
      nationalInventory: nationalInventory,
      finishedGoodsLedger: finishedGoodsLedger,
      resourceBatches: resourceBatches,
      resourceInventoryLedger: resourceInventoryLedger,
      processedStock: processedWarehouse.availableByResource && typeof processedWarehouse.availableByResource === 'object' ? processedWarehouse.availableByResource : {},
      demandByProduct: demandByProduct,
      domesticSales: domesticSales,
      source: 'Game.state.economy[country].productionAssets + canonical industrial catalogue'
    };
  }

  function tabButton(id, label, active) {
    var fullLabels = {
      factories:'Factories',
      'production-lines':'Production Lines',
      inventory:'Input',
      'national-inventory':'Stock',
      research:'Research & Technology',
      projects:'Build Projects'
    };
    var accessibleLabel = fullLabels[id] || label;
    return '<button type="button" class="omega-v2-button ' + (active === id ? 'omega-v2-button--accent' : 'omega-v2-button--quiet') +
      '" data-omega-v2-industry-tab="' + esc(id) + '" aria-label="' + esc(accessibleLabel) + '" title="' + esc(accessibleLabel) +
      '" aria-pressed="' + (active === id ? 'true' : 'false') + '">' + esc(label) + '</button>';
  }
  function factoryVisual(type, label) {
    var catalog = g.OmegaFactoryVisualCatalog;
    if (catalog && typeof catalog.render === 'function') {
      try { return catalog.render(type, label); } catch (_) {}
    }
    return '<div class="omega-v2-photo-placeholder" aria-label="' + esc(label) + '">Factory art unavailable</div>';
  }
  function factoryPhoto(factory) {
    factory = factory && typeof factory === 'object' ? factory : {};
    var descriptor = [factory.type, factory.name, factory.recipeId, factory.category].join(' ').toUpperCase();
    var photoId = 'industrial-production-line';
    if (/(REFIN|PETRO|CHEMICAL|CHEM\b|OIL|GAS|FERTIL|FUEL)/.test(descriptor)) photoId = 'geelong-oil-refinery';
    else if (/(POWER|ENERGY|ELECTRIC|HYDRO|TURBINE|GENERATOR)/.test(descriptor)) photoId = 'hydroelectric-plant';
    else if (/(MINE|ORE|MINERAL|SMELT|STEEL|METAL|COPPER|ALUMIN)/.test(descriptor)) photoId = 'open-pit-mine';
    else if (/(AGRI|FOOD|WHEAT|GRAIN|SUGAR|COTTON|CEREAL)/.test(descriptor)) photoId = 'wheat-field';
    var lib=g.OmegaUIPhotoAssets,item=null;try{item=lib&&typeof lib.get==='function'?lib.get(photoId):null;}catch(_){}
    var defaultFactoryPhotoPath = 'assets/ui-photos/industrial-production-line.webp';
    var fallbackPaths = {
      'industrial-production-line':defaultFactoryPhotoPath,
      'geelong-oil-refinery':'assets/ui-photos/geelong-oil-refinery.webp',
      'hydroelectric-plant':'assets/ui-photos/hydroelectric-plant.webp',
      'open-pit-mine':'assets/ui-photos/open-pit-mine.webp',
      'wheat-field':'assets/ui-photos/wheat-field.webp'
    };
    var path=item&&/^assets\/ui-photos\/[a-z0-9-]+\.webp$/.test(String(item.path||''))?item.path:(fallbackPaths[photoId]||fallbackPaths['industrial-production-line']);
    var credit=item&&item.author&&item.sourcePageUrl&&item.licenseUrl?'<small class="omega-v2-photo-credit">Photo: <a href="'+esc(item.sourcePageUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(item.author)+'</a> · <a href="'+esc(item.licenseUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(item.licenseShortName||'License')+'</a></small>':'';
    return '<figure class="omega-v2-photo omega-v2-photo--tile omega-v2-factory-photo"><img loading="lazy" decoding="async" width="1280" height="720" src="'+esc(path)+'" alt="'+esc(factory.name||factory.type||'Industrial production')+', representative factory reference photograph"><figcaption><strong>'+esc(item&&item.caption||'INDUSTRIAL PRODUCTION')+'</strong><small>Representative reference photography only. Actual ownership, location, operating status and output come from the canonical game state.</small>'+credit+'</figcaption></figure>';
  }
  function factorySvgPath(factory) {
    var catalog = safeCatalog() || {};
    var type = normalizeFactoryType(factory && factory.type, catalog) || String(factory && factory.type || '');
    var slug = String(type).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug || slug.length > 90) slug = 'generic-resource-processing-plant';
    return 'assets/omega-industrial-icons-v1/factories/' + slug + '.svg';
  }

  function factorySvgMarkup(factory) {
    var label = String(factory && (factory.name || factory.type) || 'Factory');
    return '<img class="omega-v2-factory-svg" data-omega-v2-factory-svg src="' + esc(factorySvgPath(factory)) +
      '" data-fallback="assets/omega-industrial-icons-v1/factories/generic-resource-processing-plant.svg" alt="' +
      esc(label + ' factory illustration') + '" width="128" height="128" loading="eager" decoding="async">';
  }

  function factoryDailyOutput(factory) {
    factory = factory && typeof factory === 'object' ? factory : {};
    var raw = factory.raw && typeof factory.raw === 'object' ? factory.raw : {};
    var health = raw.productionHealth && typeof raw.productionHealth === 'object' ? raw.productionHealth : {};
    var run = factory.lastRun && typeof factory.lastRun === 'object' ? factory.lastRun : {};
    var earlyHealthStatus = String(health.status || factory.healthStatus || '').trim().toUpperCase();
    var earlyAssetStatus = String(raw.status || factory.status || '').trim().toUpperCase();
    var earlyCycleStatus = String(factory.cycle && factory.cycle.status || '').trim().toUpperCase();
    var earlyReason = String(health.reason || factory.healthReason || '').trim().toUpperCase();
    if (/^(STOPPED|BLOCKED|FAILED|CLOSED|DECOMMISSIONED|DESTROYED|OFFLINE|DISABLED|UNDER_CONSTRUCTION|MAINTENANCE|TECHNOLOGY_LOCKED|READY)$/.test(earlyHealthStatus) ||
        /^(STOPPED|BLOCKED|FAILED|CLOSED|DECOMMISSIONED|DESTROYED|OFFLINE|DISABLED|UNDER_CONSTRUCTION|MAINTENANCE|TECHNOLOGY_LOCKED|READY)$/.test(earlyAssetStatus) ||
        /^(PAUSED|CANCELLED|BLOCKED|FAILED|STOPPED)$/.test(earlyCycleStatus) ||
        /FACTORY_DECOMMISSIONED_BY_PLAYER/.test(earlyReason)) {
      return { value: 0, unit: String(health.outputUnit || raw.outputUnit || raw.productionUnit || ''), product: String(health.outputResourceId || raw.outputResourceId || ''), basis: 'Production stopped' };
    }
    var candidates = [
      { value: health.actualOutputPerDay, unit: health.outputUnit || raw.outputUnit, product: health.outputResourceId || raw.outputResourceId },
      { value: health.outputPerDay, unit: health.outputUnit || raw.outputUnit, product: health.outputResourceId || raw.outputResourceId },
      { value: health.dailyOutput, unit: health.outputUnit || raw.outputUnit, product: health.outputResourceId || raw.outputResourceId },
      { value: raw.actualOutputPerDay, unit: raw.outputUnit || raw.productionUnit, product: raw.outputResourceId || raw.primaryOutputResourceId },
      { value: raw.outputPerDay, unit: raw.outputUnit || raw.productionUnit, product: raw.outputResourceId || raw.primaryOutputResourceId },
      { value: raw.dailyOutput, unit: raw.outputUnit || raw.productionUnit, product: raw.outputResourceId || raw.primaryOutputResourceId },
      { value: run.actualOutputPerDay, unit: run.outputUnit || raw.outputUnit, product: run.outputResourceId || run.resourceId },
      { value: run.outputPerDay, unit: run.outputUnit || raw.outputUnit, product: run.outputResourceId || run.resourceId }
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = candidates[i], value = candidate.value, unit = candidate.unit || '';
      if (value && typeof value === 'object') {
        unit = value.unit || value.outputUnit || unit;
        value = value.valuePerDay !== undefined ? value.valuePerDay :
          value.quantityPerDay !== undefined ? value.quantityPerDay :
          value.rate !== undefined ? value.rate :
          value.quantity !== undefined ? value.quantity :
          value.value !== undefined ? value.value : value.amount;
      }
      var number = num(value);
      if (number !== null && number >= 0) {
        return { value: number, unit: String(unit || ''), product: String(candidate.product || ''), basis: 'Recorded daily output' };
      }
    }

    var activeCycle = factory.cycle && typeof factory.cycle === 'object' ? factory.cycle : null;
    var activeCycleStatus = String(activeCycle && activeCycle.status || '').trim().toUpperCase();
    var activeCycleDays = num(activeCycle && (activeCycle.cycleDays !== undefined ? activeCycle.cycleDays : activeCycle.durationDays));
    var activeCycleQuantity = num(activeCycle && activeCycle.productionQuantity);
    if (activeCycleStatus === 'IN_PROGRESS' && activeCycleDays !== null && activeCycleDays > 0 &&
        activeCycleQuantity !== null && activeCycleQuantity > 0) {
      return {
        value: activeCycleQuantity / activeCycleDays,
        unit: String(health.outputUnit || raw.outputUnit || raw.productionUnit || run.outputUnit || ''),
        product: String(health.outputResourceId || raw.outputResourceId || raw.primaryOutputResourceId || ''),
        basis: 'Active cycle quantity averaged over ' + activeCycleDays + ' game-day(s)'
      };
    }

    var outputs = factory.latestOutputs;
    var days = num(run.cycleDays !== undefined ? run.cycleDays : run.durationDays);
    if (outputs && typeof outputs === 'object' && !Array.isArray(outputs) && days !== null && days > 0) {
      var outputKeys = Object.keys(outputs);
      for (var oi = 0; oi < outputKeys.length; oi += 1) {
        var outputId = outputKeys[oi], outputValue = outputs[outputId];
        if (outputValue && typeof outputValue === 'object') {
          outputValue = outputValue.quantity !== undefined ? outputValue.quantity :
            outputValue.value !== undefined ? outputValue.value : outputValue.amount;
        }
        var outputNumber = num(outputValue);
        if (outputNumber !== null && outputNumber > 0) {
          return {
            value: outputNumber / days,
            unit: String(run.outputUnit || raw.outputUnit || raw.productionUnit || ''),
            product: String(outputId),
            basis: 'Committed output averaged across ' + days + ' game-day(s)'
          };
        }
      }
    }

    var healthStatus = String(health.status || factory.healthStatus || '').toUpperCase();
    var assetStatus = String(raw.status || factory.status || '').toUpperCase();
    if (/^(STOPPED|BLOCKED|FAILED|CLOSED|DECOMMISSIONED|DESTROYED|OFFLINE|DISABLED|UNDER_CONSTRUCTION|MAINTENANCE|TECHNOLOGY_LOCKED|READY)$/.test(healthStatus) ||
        /^(STOPPED|BLOCKED|FAILED|CLOSED|DECOMMISSIONED|DESTROYED|OFFLINE|DISABLED|UNDER_CONSTRUCTION|MAINTENANCE|TECHNOLOGY_LOCKED|READY)$/.test(assetStatus)) {
      return { value: 0, unit: String(health.outputUnit || raw.outputUnit || ''), product: String(raw.outputResourceId || ''), basis: 'Production stopped' };
    }
    return null;
  }

  function factoryProductionState(factory) {
    factory = factory && typeof factory === 'object' ? factory : {};
    var raw = factory.raw && typeof factory.raw === 'object' ? factory.raw : {};
    var health = raw.productionHealth && typeof raw.productionHealth === 'object' ? raw.productionHealth : {};
    var healthStatus = String(health.status || factory.healthStatus || '').trim().toUpperCase();
    var assetStatus = String(raw.status || factory.status || '').trim().toUpperCase();
    var cycleStatus = String(factory.cycle && factory.cycle.status || '').trim().toUpperCase();
    var reason = String(health.reason || factory.healthReason || health.detail && health.detail.reason || '').trim().toUpperCase();
    var actual = num(health.productionUnitsPerCycle);
    var daily = factoryDailyOutput(factory);
    var hasPositiveProduction = actual !== null && actual > 0 || !!(daily && daily.value > 0);
    var blockingReason = /FACTORY_(INPUT|UTILITY|POWER|WORKFORCE|OPERATION).*SHORTAGE/.test(reason) || /FACTORY_DECOMMISSIONED_BY_PLAYER/.test(reason);
    var stopped = /^(STOPPED|BLOCKED|FAILED|CLOSED|DECOMMISSIONED|DESTROYED|OFFLINE|DISABLED|UNDER_CONSTRUCTION|MAINTENANCE|TECHNOLOGY_LOCKED|PAUSED)$/.test(healthStatus) ||
      /^(STOPPED|BLOCKED|FAILED|CLOSED|DECOMMISSIONED|DESTROYED|OFFLINE|DISABLED|UNDER_CONSTRUCTION|MAINTENANCE|TECHNOLOGY_LOCKED|READY)$/.test(assetStatus) ||
      /^(PAUSED|CANCELLED|BLOCKED|FAILED|STOPPED)$/.test(cycleStatus) ||
      /FACTORY_DECOMMISSIONED_BY_PLAYER/.test(reason) || blockingReason && !hasPositiveProduction;
    if (stopped) return { key: 'stopped', label: /DECOMMISSIONED|DESTROYED/.test(assetStatus) ? 'Decommissioned' : 'Stopped', reason: reason };
    var productivity = num(health.productivityPct !== undefined ? health.productivityPct : factory.productivityPct);
    var degradedStatus = /^(REDUCED|DEGRADED|PARTIAL|UNDERPOWERED)$/.test(healthStatus);
    if (degradedStatus || productivity !== null && productivity > 0 && productivity < 99.999) {
      if (hasPositiveProduction || cycleStatus === 'IN_PROGRESS') return { key: 'reduced', label: 'Reduced output', reason: reason };
      return { key: 'stopped', label: 'Stopped', reason: reason };
    }
    var claimsRunning = /^(RUNNING|PRODUCING)$/.test(healthStatus) || cycleStatus === 'IN_PROGRESS';
    if (claimsRunning && hasPositiveProduction) return { key: 'running', label: 'Producing', reason: reason };
    return { key: 'unknown', label: 'Output not recorded', reason: reason };
  }


  function panelProductLabel(model, productId) {
    var wanted = String(productId || '').trim().toLowerCase();
    var items = model && model.nationalInventory && Array.isArray(model.nationalInventory.items) ? model.nationalInventory.items : [];
    for (var i = 0; i < items.length; i += 1) {
      if (String(items[i].productId || '').trim().toLowerCase() === wanted && items[i].name) return String(items[i].name);
    }
    return String(productId || 'Product').replace(/[_-]+/g, ' ').replace(/\b[a-z]/g, function (letter) { return letter.toUpperCase(); });
  }
  function panelCountryLabel(countryId) {
    var profile = countryProfile(countryId), identity = profile && (profile.identity || profile.country || profile);
    var name = String(profile && (profile.name || profile.officialName || profile.shortName) ||
      identity && (identity.name || identity.officialName || identity.countryName) || '').trim();
    return name || String(countryId || 'Destination not recorded').toUpperCase();
  }
  function panelValueByKey(source, wanted) {
    if (!source || typeof source !== 'object') return null;
    var key = String(wanted || '').trim().toLowerCase();
    var keys = Object.keys(source);
    for (var i = 0; i < keys.length; i += 1) {
      if (keys[i].trim().toLowerCase() === key) return num(source[keys[i]]);
    }
    return null;
  }
  function panelInputCoefficient(value) {
    if (value && typeof value === 'object') {
      value = value.coefficient !== undefined ? value.coefficient :
        value.quantity !== undefined ? value.quantity :
        value.amount !== undefined ? value.amount :
        value.ratio !== undefined ? value.ratio : null;
    }
    return num(value);
  }
  function factoryOutputRows(model) {
    var groups = Object.create(null), batchById = Object.create(null), batchOwners = Object.create(null);
    var transactions = Object.create(null), recordedBatchIds = Object.create(null), factoriesById = Object.create(null);
    var batches = Array.isArray(model.resourceBatches) ? model.resourceBatches : [];
    var ledger = Array.isArray(model.finishedGoodsLedger) ? model.finishedGoodsLedger : [];
    var factories = Array.isArray(model.factories) ? model.factories : [];
    factories.forEach(function (factory) { if (factory && factory.id) factoriesById[String(factory.id)] = factory; });
    batches.forEach(function (batch) {
      if (!batch || !batch.batchId) return;
      batchById[String(batch.batchId)] = batch;
      if (batch.sourceFactoryId) batchOwners[String(batch.batchId)] = {
        factoryId: String(batch.sourceFactoryId), productId: String(batch.resourceId || batch.materialIdentity || '')
      };
    });
    function keyFor(factoryId, productId) {
      return String(factoryId || '') + '|' + String(productId || '').toLowerCase();
    }
    function ensure(factoryId, productId) {
      var key = keyFor(factoryId, productId);
      if (!groups[key]) {
        groups[key] = {
          factoryId: String(factoryId || ''), productId: String(productId || ''),
          produced: 0, factoryUse: 0, domesticConsumption: 0, domesticSupply: 0,
          exported: 0, destinations: Object.create(null), batchIds: Object.create(null),
          currentStock: null, unit: null, hasProduction: false, batchProductionIds: Object.create(null)
        };
      }
      return groups[key];
    }
    function outputMap(record) {
      var map = record && (record.outputQuantities || record.outputs);
      if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
      return map;
    }
    function addProduction(record, fallbackFactoryId) {
      if (!record || typeof record !== 'object') return;
      var factoryId = String(record.factoryId || fallbackFactoryId || '');
      if (!factoryId || !factoriesById[factoryId]) return;
      var transactionId = String(record.transactionId || record.processId || record.cycleId || '');
      if (transactionId && transactions[transactionId]) return;
      if (transactionId) transactions[transactionId] = true;
      var outputs = outputMap(record), ids = Array.isArray(record.createdBatchIds) ? record.createdBatchIds : [];
      ids.forEach(function (batchId) { recordedBatchIds[String(batchId)] = true; });
      var entries = Object.keys(outputs);
      if (!entries.length && ids.length) {
        entries = [];
        ids.forEach(function (batchId) {
          var batch = batchById[String(batchId)];
          var productId = batch && (batch.resourceId || batch.materialIdentity);
          var quantity = batch && num(batch.quantity);
          if (productId && quantity !== null) outputs[productId] = (num(outputs[productId]) || 0) + quantity;
        });
        entries = Object.keys(outputs);
      }
      entries.forEach(function (productId) {
        var value = outputs[productId];
        if (value && typeof value === 'object') value = value.quantity !== undefined ? value.quantity : value.value !== undefined ? value.value : value.amount;
        var quantity = num(value);
        if (quantity === null || quantity <= 0) return;
        var row = ensure(factoryId, productId);
        row.produced += quantity;
        row.hasProduction = true;
        if (record.unit && !row.unit) row.unit = record.unit;
        ids.forEach(function (batchId) {
          var batch = batchById[String(batchId)];
          if (batch && String(batch.resourceId || batch.materialIdentity || '').toLowerCase() === String(productId).toLowerCase()) {
            row.batchIds[String(batchId)] = true;
            batchOwners[String(batchId)] = { factoryId: factoryId, productId: String(productId) };
            if (batch.unit && !row.unit) row.unit = batch.unit;
          } else if (batch) {
            batchOwners[String(batchId)] = batchOwners[String(batchId)] || { factoryId: factoryId, productId: String(productId) };
          }
        });
      });
    }
    ledger.forEach(function (record) { addProduction(record, record && record.factoryId); });
    factories.forEach(function (factory) {
      var run = factory && factory.lastRun;
      if (run && (run.outputQuantities || run.outputs) && String(run.status || '').toUpperCase() !== 'BLOCKED') {
        addProduction(run, factory.id);
      }
    });
    batches.forEach(function (batch) {
      if (!batch || !batch.sourceFactoryId) return;
      var stage = String(batch.stage || batch.inventoryStage || '').toUpperCase();
      if (stage && !/FINISHED|PROCESSED|REFINED|OUTPUT/.test(stage)) return;
      var factoryId = String(batch.sourceFactoryId), productId = String(batch.resourceId || batch.materialIdentity || '');
      if (!factoriesById[factoryId] || !productId) return;
      var row = ensure(factoryId, productId);
      row.batchIds[String(batch.batchId)] = true;
      batchOwners[String(batch.batchId)] = { factoryId: factoryId, productId: productId };
      if (batch.unit && !row.unit) row.unit = batch.unit;
      var processId = String(batch.processId || '');
      if (!recordedBatchIds[String(batch.batchId)] && (!processId || !transactions[processId]) && !row.batchProductionIds[String(batch.batchId)]) {
        var quantity = num(batch.quantity);
        if (quantity !== null && quantity > 0) {
          row.produced += quantity;
          row.hasProduction = true;
        }
        row.batchProductionIds[String(batch.batchId)] = true;
      }
    });
    Object.keys(groups).forEach(function (key) {
      var row = groups[key], hasTrackedBatch = false, current = 0;
      Object.keys(row.batchIds).forEach(function (batchId) {
        var batch = batchById[batchId];
        if (!batch) return;
        hasTrackedBatch = true;
        var remaining = num(batch.remainingQuantity !== undefined ? batch.remainingQuantity : batch.quantity);
        if (remaining !== null) {
          var status = String(batch.status || '').toUpperCase();
          if (/^(CONSUMED|EXPORTED|SOLD|DEPLETED|EXHAUSTED|TRANSFERRED_OUT|CANCELLED)$/.test(status)) remaining = 0;
          current += Math.max(0, remaining);
        }
      });
      row.currentStock = hasTrackedBatch ? current : null;
      delete row.batchProductionIds;
    });
    function ownerForBatch(batchId) {
      var owner = batchOwners[String(batchId || '')];
      return owner && owner.factoryId && owner.productId ? ensure(owner.factoryId, owner.productId) : null;
    }
    function attributeMovement(batchId, quantity, kind, destination) {
      var row = ownerForBatch(batchId), amount = num(quantity);
      if (!row || amount === null || amount <= 0) return;
      if (kind === 'FACTORY') row.factoryUse += amount;
      else if (kind === 'DOMESTIC') row.domesticConsumption += amount;
      else if (kind === 'SUPPLY') row.domesticSupply += amount;
      else if (kind === 'EXPORT') {
        row.exported += amount;
        var country = String(destination || '').trim().toUpperCase();
        var label = country ? panelCountryLabel(country) : 'Destination not recorded';
        row.destinations[label] = (row.destinations[label] || 0) + amount;
      }
    }
    (Array.isArray(model.resourceInventoryLedger) ? model.resourceInventoryLedger : []).forEach(function (entry) {
      if (!entry || String(entry.type || '').toUpperCase() !== 'INVENTORY_CONSUMED' || !Array.isArray(entry.consumed)) return;
      var reason = String(entry.reason || '').toUpperCase();
      entry.consumed.forEach(function (item) {
        if (!item) return;
        var sourceIds = Array.isArray(item.sourceBatchIds) ? item.sourceBatchIds.filter(Boolean) : [];
        var batchId = item.batchId || (sourceIds.length === 1 ? sourceIds[0] : null);
        if (!batchId) return;
        attributeMovement(batchId, item.quantity, /FACTORY|PROCESS|INPUT/.test(reason) ? 'FACTORY' : 'DOMESTIC');
      });
    });
    (Array.isArray(model.resourceInventoryLedger) ? model.resourceInventoryLedger : []).forEach(function (entry) {
      if (!entry || String(entry.type || '').toUpperCase() !== 'INTERNATIONAL_TRADE_EXPORT') return;
      (Array.isArray(entry.batchTransfers) ? entry.batchTransfers : []).forEach(function (transfer) {
        if (transfer) attributeMovement(transfer.sourceBatchId, transfer.quantity, 'EXPORT', transfer.destinationCountryId);
      });
    });
    (Array.isArray(model.domesticSales) ? model.domesticSales : []).forEach(function (entry) {
      var sale = entry && entry.sale && typeof entry.sale === 'object' ? entry.sale : entry;
      if (!sale || String(sale.direction || 'DOMESTIC').toUpperCase() !== 'DOMESTIC') return;
      (Array.isArray(sale.batchTransfers) ? sale.batchTransfers : []).forEach(function (transfer) {
        if (transfer) attributeMovement(transfer.sourceBatchId, transfer.quantity, 'SUPPLY');
      });
    });
    return Object.keys(groups).map(function (key) { return groups[key]; }).filter(function (row) {
      return row.hasProduction || row.batchIds && Object.keys(row.batchIds).length;
    }).sort(function (a, b) {
      var af = factoriesById[a.factoryId], bf = factoriesById[b.factoryId];
      return String(af && af.name || a.factoryId).localeCompare(String(bf && bf.name || b.factoryId)) ||
        String(a.productId).localeCompare(String(b.productId));
    });
  }
  function factoryStockStatus(model, row, sharedProduct) {
    var stock = row.currentStock, demand = panelValueByKey(model.demandByProduct, row.productId);
    if (sharedProduct) return stock === null
      ? { label:'Not recorded', key:'unknown' }
      : { label:'Factory stock · demand unallocated', key:'unknown' };
    var demandRow = null, keys = Object.keys(model.demandByProduct || {});
    for (var i = 0; i < keys.length; i += 1) {
      if (keys[i].toLowerCase() === String(row.productId).toLowerCase()) { demandRow = model.demandByProduct[keys[i]]; break; }
    }
    if (demandRow) {
      var unmet = num(demandRow.unmetDemand);
      demand = num(demandRow.demandThisTurn !== undefined ? demandRow.demandThisTurn :
        demandRow.demandPerDay !== undefined ? demandRow.demandPerDay : demandRow.demand);
      if (unmet !== null && unmet > 1e-9) return { label: 'Shortage · ' + fmt(unmet, row.unit), key: 'shortage' };
      if (String(demandRow.status || '').toUpperCase() === 'SHORTAGE') return { label: 'Shortage', key: 'shortage' };
      if (String(demandRow.status || '').toUpperCase() === 'LOW_COVERAGE') return { label: 'Low stock', key: 'low' };
      if (stock !== null && demand !== null && demand > 0) {
        var surplus = stock - demand;
        if (surplus > 1e-9) return { label: 'Surplus · ' + fmt(surplus, row.unit), key: 'surplus' };
        return { label: 'Sufficient', key: 'sufficient' };
      }
      if (String(demandRow.status || '').toUpperCase() === 'BALANCED') return { label: 'Sufficient', key: 'sufficient' };
    }
    if (stock === null) return { label: 'Not recorded', key: 'unknown' };
    return stock > 1e-9 ? { label: 'Stock on hand', key: 'sufficient' } : { label: 'No remaining stock', key: 'empty' };
  }

  function factoryProductionPlan(model) {
    model = model || {};
    var catalog = safeCatalog() || {};
    var profiles = model.catalogProfiles && typeof model.catalogProfiles === 'object' ? model.catalogProfiles :
      catalog.factoryProfiles && typeof catalog.factoryProfiles === 'object' ? catalog.factoryProfiles : {};
    var recipes = model.catalogRecipes && typeof model.catalogRecipes === 'object' ? model.catalogRecipes :
      catalog.downstreamFactoryRecipes && typeof catalog.downstreamFactoryRecipes === 'object' ? catalog.downstreamFactoryRecipes : {};
    var processingRules = model.processingRules && typeof model.processingRules === 'object' ? model.processingRules :
      catalog.processingRules && typeof catalog.processingRules === 'object' ? catalog.processingRules : {};
    var counts = Object.create(null);
    (Array.isArray(model.factoryTypeCounts) ? model.factoryTypeCounts : []).forEach(function (row) {
      var type = normalizeFactoryType(row && row.type, catalog) || String(row && row.type || '').toUpperCase();
      if (type) counts[type] = Math.max(0, Math.floor(num(row && row.count) || 0));
    });
    var assetsByType = Object.create(null);
    (Array.isArray(model.factories) ? model.factories : []).forEach(function (factory) {
      var type = normalizeFactoryType(factory && factory.type, catalog) || String(factory && factory.type || '').toUpperCase();
      if (!type) return;
      if (!assetsByType[type]) assetsByType[type] = [];
      assetsByType[type].push(factory);
    });
    var profileTypes = Object.keys(profiles);
    var typeRows = profileTypes.map(function (rawType) {
      var type = normalizeFactoryType(rawType, catalog) || rawType;
      var profile = profiles[rawType] || profiles[type] || {};
      var liveCapacities = (assetsByType[type] || []).map(function (factory) {
        return num(factory && factory.capacityPerDay);
      }).filter(function (value) { return value !== null && value > 0; });
      var capacity = num(profile.defaultCapacityPerDay);
      if (capacity === null && liveCapacities.length) {
        capacity = liveCapacities.reduce(function (sum, value) { return sum + value; }, 0) / liveCapacities.length;
      }
      return {
        type: type,
        name: String(profile.name || type),
        category: String(profile.category || profile.subCategory || 'Industry'),
        count: Object.prototype.hasOwnProperty.call(counts, type) ? counts[type] : (assetsByType[type] || []).length,
        capacityPerFactory: capacity,
        inputs: Object.create(null),
        outputs: Object.create(null),
        routes: []
      };
    }).sort(function (a, b) {
      var presentOrder = (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0);
      if (presentOrder) return presentOrder;
      if (a.count !== b.count) return b.count - a.count;
      return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
    });

    function addProduct(map, productId, perCycle, perDay, unit, source) {
      var id = String(productId || '').trim();
      if (!id) return;
      var key = id.toLowerCase();
      if (!map[key]) map[key] = { productId: id, perCycle: 0, perDay: 0, unit: String(unit || ''), sources: [] };
      map[key].perCycle += perCycle;
      map[key].perDay += perDay;
      if (!map[key].unit && unit) map[key].unit = String(unit);
      if (source) map[key].sources.push(source);
    }
    function addRoute(plan, factoryUnits, recipeId, rule, capacity, routeKind) {
      factoryUnits = Math.max(0, Math.floor(Number(factoryUnits) || 0));
      if (!factoryUnits || !rule || !(capacity > 0)) return;
      var cycleDays = Math.max(1, num(rule.cycleDays) || 1);
      var totalCapacity = factoryUnits * capacity;
      var inputs = rule.inputs && typeof rule.inputs === 'object' ? rule.inputs : {};
      var outputs = rule.outputs && typeof rule.outputs === 'object' ? rule.outputs : {};
      var source = {
        factoryType: plan.type,
        factoryCount: factoryUnits,
        recipeId: recipeId || ('PROCESSING:' + String(rule.resourceId || 'RESOURCE')),
        cycleDays: cycleDays,
        capacityPerCycle: capacity,
        allocationKind: routeKind || 'CATALOG_RECIPE'
      };
      Object.keys(inputs).forEach(function (productId) {
        var coefficient = panelInputCoefficient(inputs[productId]);
        if (coefficient === null || coefficient <= 0) return;
        var perCycle = totalCapacity * coefficient;
        var productUnit = rule.inputUnit || 'SIMULATION_RESOURCE_UNIT';
        addProduct(plan.inputs, productId, perCycle, perCycle / cycleDays, productUnit, source);
      });
      Object.keys(outputs).forEach(function (productId) {
        var coefficient = panelInputCoefficient(outputs[productId]);
        if (coefficient === null || coefficient <= 0) return;
        var perCycle = totalCapacity * coefficient;
        var productUnit = rule.outputUnit || 'SIMULATION_RESOURCE_UNIT';
        addProduct(plan.outputs, productId, perCycle, perCycle / cycleDays, productUnit, source);
      });
      plan.routes.push({
        recipeId: recipeId || ('PROCESSING:' + String(rule.resourceId || 'RESOURCE')),
        factoryCount: factoryUnits,
        cycleDays: cycleDays,
        capacityPerFactory: capacity,
        allocationKind: routeKind || 'CATALOG_RECIPE'
      });
    }
    function splitFactoryUnits(factoryCount, routes, defaultRecipeId) {
      var ordered = routes.slice().sort(function (left, right) {
        if (left === defaultRecipeId) return -1;
        if (right === defaultRecipeId) return 1;
        return routes.indexOf(left) - routes.indexOf(right);
      });
      if (!ordered.length || !factoryCount) return [];
      if (ordered.length === 1) return [{ recipeId: ordered[0], factoryCount: factoryCount }];
      var each = Math.floor(factoryCount / ordered.length);
      var remaining = factoryCount - each * ordered.length;
      return ordered.map(function (recipeId, index) {
        return { recipeId: recipeId, factoryCount: each + (index < remaining ? 1 : 0) };
      }).filter(function (row) { return row.factoryCount > 0; });
    }
    function splitBySiteWeight(factoryCount, resources) {
      if (!resources.length || !factoryCount) return [];
      var totalWeight = resources.reduce(function (sum, row) { return sum + row.siteCount; }, 0);
      if (!(totalWeight > 0)) return [];
      var allocations = resources.map(function (row) {
        var exact = factoryCount * row.siteCount / totalWeight;
        var base = Math.floor(exact);
        return { resourceId: row.resourceId, factoryCount: base, remainder: exact - base };
      });
      var remaining = factoryCount - allocations.reduce(function (sum, row) { return sum + row.factoryCount; }, 0);
      var priority = allocations.slice().sort(function (a, b) {
        return b.remainder - a.remainder || (a.resourceId < b.resourceId ? -1 : a.resourceId > b.resourceId ? 1 : 0);
      });
      for (var index = 0; index < remaining; index += 1) {
        var target = allocations.find(function (row) { return row.resourceId === priority[index].resourceId; });
        if (target) target.factoryCount += 1;
      }
      return allocations.filter(function (row) { return row.factoryCount > 0; });
    }

    var typeById = Object.create(null);
    typeRows.forEach(function (plan) { typeById[plan.type] = plan; });
    typeRows.forEach(function (plan) {
      var count = plan.count, capacity = plan.capacityPerFactory;
      if (!count || !(capacity > 0)) return;
      var profile = profiles[plan.type] || {};
      if (plan.type === 'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT') {
        var siteMix = Object.create(null);
        (Array.isArray(model.mineSites) ? model.mineSites : []).forEach(function (site) {
          var raw = site && site.raw || {};
          if (raw.commercialExtraction !== true) return;
          var resourceId = String(site.resourceId || raw.resourceId || raw.resourceTypeId ||
            raw.identity && (raw.identity.resourceTypeId || raw.identity.resourceId) || '')
            .trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
          if (!resourceId || !processingRules[resourceId]) return;
          siteMix[resourceId] = (siteMix[resourceId] || 0) + 1;
        });
        var resources = Object.keys(siteMix).sort().map(function (resourceId) {
          return { resourceId: resourceId, siteCount: siteMix[resourceId] };
        });
        var fallback = false;
        if (!resources.length) {
          fallback = true;
          resources = ['coal', 'iron_ore'].filter(function (resourceId) { return !!processingRules[resourceId]; })
            .map(function (resourceId) { return { resourceId: resourceId, siteCount: 1 }; });
        }
        splitBySiteWeight(count, resources).forEach(function (allocation) {
          var rule = processingRules[allocation.resourceId];
          if (!rule) return;
          var processing = Object.assign({}, rule, { resourceId: allocation.resourceId });
          addRoute(plan, allocation.factoryCount, 'PROCESSING:' + allocation.resourceId, processing, capacity,
            fallback ? 'SIMULATED_IMPORT_BASELINE_NO_DOMESTIC_SITE' : 'DOMESTIC_COMMERCIAL_SITE_MIX');
        });
        return;
      }
      var recipeIds = (Array.isArray(profile.recipeIds) ? profile.recipeIds : []).filter(function (recipeId) {
        return !!(recipes[recipeId] && normalizeFactoryType(recipes[recipeId].factoryType, catalog) === plan.type);
      });
      if (!recipeIds.length && profile.defaultRecipeId && recipes[profile.defaultRecipeId] &&
          normalizeFactoryType(recipes[profile.defaultRecipeId].factoryType, catalog) === plan.type) {
        recipeIds = [profile.defaultRecipeId];
      }
      splitFactoryUnits(count, recipeIds, profile.defaultRecipeId).forEach(function (allocation) {
        var recipe = recipes[allocation.recipeId];
        if (recipe) addRoute(plan, allocation.factoryCount, allocation.recipeId, recipe, capacity, 'CATALOG_RECIPE');
      });
    });
    var coverageDays = Math.max(1, Math.min(3650, Math.round(num(model.factoryInputCoverageDays) || 100)));
    typeRows.forEach(function (plan) {
      plan.inputs = Object.keys(plan.inputs).map(function (key) { return plan.inputs[key]; })
        .sort(function (a, b) { return a.productId.localeCompare(b.productId); });
      plan.outputs = Object.keys(plan.outputs).map(function (key) { return plan.outputs[key]; })
        .sort(function (a, b) { return a.productId.localeCompare(b.productId); });
      plan.inputs.forEach(function (row) {
        row.coverageDays = coverageDays;
        row.coverageQuantity = row.perDay * coverageDays;
      });
    });
    return {
      countryId: model.countryId || null,
      totalFactories: Math.max(0, num(model.factoryCount) || typeRows.reduce(function (sum, row) { return sum + row.count; }, 0)),
      factoryTypeCount: typeRows.length,
      assignedFactoryTypeCount: typeRows.filter(function (row) { return row.count > 0; }).length,
      coverageDays: coverageDays,
      types: typeRows,
      authority: 'CANONICAL_FACTORY_PROFILES_AND_RECIPES',
      productionStarted: (Array.isArray(model.factories) ? model.factories : []).some(function (factory) {
        return !!(factory && factory.lastRun && (factory.lastRun.outputQuantities || factory.lastRun.outputs));
      }) || (Array.isArray(model.finishedGoodsLedger) && model.finishedGoodsLedger.length > 0)
    };
  }

  function factoryPlanPresenceMarkup(type, model) {
    var ownershipCount = model && model.hasCountryState === true ? factoryTypeOwnedCount({ type: type && type.type }, model) : null;
    var known = ownershipCount !== null;
    var count = Math.max(0, Math.floor(num(type && type.count) || 0));
    var state = !known ? 'unknown' : count > 0 ? 'present' : 'absent';
    var label = state === 'present' ? 'PRESENT · ' + fmt(count) + ' FACTORIES'
      : state === 'absent' ? 'NOT PRESENT IN THIS COUNTRY · 0 FACTORIES'
      : 'COUNTRY FACTORY DATA NOT LOADED';
    return '<span class="fp-factory-data-presence" data-state="' + state + '">' + label + '</span>';
  }

  function factoryPlanUnit(unit) {
    var value = String(unit || '').replace(/_/g, ' ').trim();
    if (!value || /SIMULATION RESOURCE UNIT/i.test(value)) return 'game units';
    return value;
  }

  function factoryInputPlanMarkup(model) {
    var plan = factoryProductionPlan(model);
    var html = '<section class="fp-factory-analytics fp-factory-plan" data-factory-input-plan="canonical-v1" aria-label="Calculated factory input requirements">' +
      '<h3 class="omega-v2-section-title">Factory-type input requirements</h3>' +
      '<div class="omega-v2-vehicle-stats"><div><span>Total factories</span><strong>' + fmt(plan.totalFactories) + '</strong></div>' +
      '<div><span>Factory types</span><strong>' + fmt(plan.factoryTypeCount) + '</strong></div>' +
      '<div><span>Types with factories</span><strong>' + fmt(plan.assignedFactoryTypeCount) + '</strong></div>' +
      '<div><span>Coverage target</span><strong>' + fmt(plan.coverageDays, 'days') + '</strong></div></div>' +
      '<p class="omega-v2-source">Calculated from the country factory allocation, canonical factory capacity and recipe cycle. Planned demand is not reported consumption.</p>';
    plan.types.forEach(function (type) {
      html += '<article class="fp-factory-data-card"><header class="fp-factory-data-heading"><div><span>FACTORY INPUT PLAN</span><strong>' +
        esc(type.name) + '</strong><small>' + esc(type.category) + ' · ' + esc(type.type) + '</small></div>' +
        factoryPlanPresenceMarkup(type, model) + '</header>';
      if (!type.count) {
        html += '<div class="fp-factory-table-wrap"><p class="fp-factory-muted">No factories of this type are assigned. Current input demand: 0.</p></div></article>';
        return;
      }
      if (!type.inputs.length) {
        html += '<div class="fp-factory-table-wrap"><p class="fp-factory-muted">No input recipe is defined for this factory type.</p></div></article>';
        return;
      }
      html += '<div class="fp-factory-table-wrap"><table class="fp-factory-table"><thead><tr>' +
        '<th>Required input product</th><th>Total / full cycle</th><th>Total / day</th><th>' + esc(String(plan.coverageDays)) + '-day requirement</th>' +
        '</tr></thead><tbody>';
      type.inputs.forEach(function (row) {
        var unit = factoryPlanUnit(row.unit);
        html += '<tr><td>' + factoryProductIdentityMarkup(row.productId, panelProductLabel(model, row.productId)) + '</td>' +
          '<td><strong>' + fmt(row.perCycle, unit) + '</strong></td>' +
          '<td><strong>' + fmt(row.perDay, unit) + '</strong></td>' +
          '<td>' + fmt(row.coverageQuantity, unit) + '</td></tr>';
      });
      html += '</tbody></table></div></article>';
    });
    return html + '</section>';
  }

  function factoryOutputPlanMarkup(model, actualRows) {
    var plan = factoryProductionPlan(model);
    actualRows = Array.isArray(actualRows) ? actualRows : factoryOutputRows(model);
    var factoryTypeById = Object.create(null);
    (Array.isArray(model.factories) ? model.factories : []).forEach(function (factory) {
      if (!factory || !factory.id) return;
      factoryTypeById[String(factory.id)] = normalizeFactoryType(factory.type, safeCatalog()) || String(factory.type || '').toUpperCase();
    });
    var html = '<section class="fp-factory-analytics fp-factory-plan" data-factory-output-plan="canonical-v1" aria-label="Planned factory outputs and actual finished stock">' +
      '<h3 class="omega-v2-section-title">Factory-type output and stock plan</h3>' +
      '<div class="omega-v2-vehicle-stats"><div><span>Total factories</span><strong>' + fmt(plan.totalFactories) + '</strong></div>' +
      '<div><span>Factory types</span><strong>' + fmt(plan.factoryTypeCount) + '</strong></div>' +
      '<div><span>Types with factories</span><strong>' + fmt(plan.assignedFactoryTypeCount) + '</strong></div>' +
      '<div><span>Production records</span><strong>' + (actualRows.length ? 'Recorded' : 'Not started') + '</strong></div></div>' +
      '<p class="omega-v2-source">Planned output is calculated from full factory capacity and recipe coefficients. Actual output and stock remain tied to committed production batches.</p>';
    plan.types.forEach(function (type) {
      html += '<article class="fp-factory-data-card"><header class="fp-factory-data-heading"><div><span>FACTORY OUTPUT PLAN</span><strong>' +
        esc(type.name) + '</strong><small>' + esc(type.category) + ' · ' + esc(type.type) + '</small></div>' +
        factoryPlanPresenceMarkup(type, model) + '</header>';
      if (!type.count) {
        html += '<div class="fp-factory-table-wrap"><p class="fp-factory-muted">No factories of this type are assigned. Planned output: 0.</p></div></article>';
        return;
      }
      if (!type.outputs.length) {
        html += '<div class="fp-factory-table-wrap"><p class="fp-factory-muted">No output recipe is defined for this factory type.</p></div></article>';
        return;
      }
      html += '<div class="fp-factory-table-wrap"><table class="fp-factory-table"><thead><tr>' +
        '<th>Output product</th><th>Planned / full cycle</th><th>Planned / day</th><th>Produced to date</th><th>Country warehouse stock</th>' +
        '</tr></thead><tbody>';
      type.outputs.forEach(function (row) {
        var matching = actualRows.filter(function (actual) {
          return factoryTypeById[String(actual.factoryId)] === type.type &&
            String(actual.productId || '').toLowerCase() === String(row.productId || '').toLowerCase();
        });
        var hasActual = matching.some(function (actual) { return actual.hasProduction === true; });
        var produced = matching.reduce(function (sum, actual) { return sum + (num(actual.produced) || 0); }, 0);
        var hasTracedStock = matching.some(function (actual) { return actual.currentStock !== null; });
        var tracedStock = matching.reduce(function (sum, actual) {
          return sum + (actual.currentStock === null ? 0 : num(actual.currentStock) || 0);
        }, 0);
        var warehouseStock = hasTracedStock ? tracedStock : panelValueByKey(model.processedStock, row.productId);
        var unit = factoryPlanUnit(row.unit);
        html += '<tr><td>' + factoryProductIdentityMarkup(row.productId, panelProductLabel(model, row.productId)) + '</td>' +
          '<td><strong>' + fmt(row.perCycle, unit) + '</strong></td>' +
          '<td><strong>' + fmt(row.perDay, unit) + '</strong></td>' +
          '<td>' + (hasActual ? fmt(produced, unit) : '<span class="fp-factory-muted">Not started / no committed output</span>') + '</td>' +
          '<td>' + (warehouseStock === null ? '<span class="fp-factory-muted">Not recorded</span>' : factoryProductStockMarkup(row.productId, panelProductLabel(model, row.productId), fmt(warehouseStock, unit))) + '</td></tr>';
      });
      html += '</tbody></table></div></article>';
    });
    return html + '</section>';
  }

  function factoryStockPanelMarkup(model) {
    var rows = factoryOutputRows(model), factoryMap = Object.create(null);
    (model.factories || []).forEach(function (factory) { if (factory && factory.id) factoryMap[String(factory.id)] = factory; });
    var planMarkup = factoryOutputPlanMarkup(model, rows);
    if (!rows.length) return planMarkup + '<div class="omega-v2-empty">No committed factory output batches are recorded yet. Planned outputs remain shown above.</div>';
    var html = '<section class="fp-factory-analytics" aria-label="Recorded factory output stock"><h3 class="omega-v2-section-title">Recorded factory output batches</h3>';
    var byFactory = Object.create(null), productProducerCounts = Object.create(null), nationalConsumptionShown = Object.create(null);
    rows.forEach(function (row) {
      var productKey = String(row.productId || '').toLowerCase();
      productProducerCounts[productKey] = (productProducerCounts[productKey] || 0) + 1;
      if (!byFactory[row.factoryId]) byFactory[row.factoryId] = [];
      byFactory[row.factoryId].push(row);
    });
    Object.keys(byFactory).forEach(function (factoryId) {
      var factory = factoryMap[factoryId] || {}, name = factory.name || factoryId;
      html += '<article class="fp-factory-data-card"><header class="fp-factory-data-heading"><div><span>FACTORY OUTPUT</span><strong>' +
        esc(name) + '</strong><small>' + esc(factory.type || 'Factory type not recorded') + '</small></div><span class="fp-factory-data-count">' +
        fmt(byFactory[factoryId].length) + ' product line(s)</span></header>';
      html += '<div class="fp-factory-table-wrap"><table class="fp-factory-table"><thead><tr>' +
        '<th>Output product</th><th>Produced</th><th>Factory use</th><th>Domestic consumption</th><th>Domestic supply</th><th>Exported</th><th>Destination country</th><th>Current stock</th><th>Stock condition</th>' +
        '</tr></thead><tbody>';
      byFactory[factoryId].forEach(function (row) {
        var unit = row.unit || '';
        var destinations = Object.keys(row.destinations).map(function (country) {
          return '<span class="fp-factory-destination"><strong>' + esc(country) + '</strong><small>' + fmt(row.destinations[country], unit) + '</small></span>';
        }).join('');
        if (!destinations && row.exported <= 0) destinations = '<span class="fp-factory-muted">No recorded export</span>';
        else if (!destinations) destinations = '<span class="fp-factory-muted">Destination not recorded</span>';
        var productKey = String(row.productId || '').toLowerCase();
        var demandRow = null, demandKeys = Object.keys(model.demandByProduct || {});
        for (var di = 0; di < demandKeys.length; di += 1) {
          if (demandKeys[di].toLowerCase() === productKey) { demandRow = model.demandByProduct[demandKeys[di]]; break; }
        }
        var nationalConsumption = demandRow ? num(demandRow.nationalConsumption) : null;
        var consumptionMarkup = row.domesticConsumption > 0
          ? fmt(row.domesticConsumption, unit)
          : '<span class="fp-factory-muted">Not recorded</span>';
        if (nationalConsumption !== null && nationalConsumption > 0 && !nationalConsumptionShown[productKey]) {
          if (row.domesticConsumption <= 0 || Math.abs(nationalConsumption - row.domesticConsumption) > 1e-9) {
            consumptionMarkup += '<small>Country total, including traced batch: ' + fmt(nationalConsumption, unit) + '</small>';
          }
          nationalConsumptionShown[productKey] = true;
        }
        var status = factoryStockStatus(model, row, productProducerCounts[String(row.productId || '').toLowerCase()] > 1);
        html += '<tr><td>' + factoryProductIdentityMarkup(row.productId, panelProductLabel(model, row.productId)) + '</td>' +
          '<td><strong>' + fmt(row.produced, unit) + '</strong></td>' +
          '<td>' + (row.factoryUse > 0 ? fmt(row.factoryUse, unit) : '<span class="fp-factory-muted">Not recorded</span>') + '</td>' +
          '<td>' + consumptionMarkup + '</td>' +
          '<td>' + (row.domesticSupply > 0 ? fmt(row.domesticSupply, unit) : '<span class="fp-factory-muted">Not recorded</span>') + '</td>' +
          '<td>' + (row.exported > 0 ? fmt(row.exported, unit) : '<span class="fp-factory-muted">Not recorded</span>') + '</td>' +
          '<td>' + destinations + '</td><td>' + factoryProductStockMarkup(row.productId, panelProductLabel(model, row.productId), fmt(row.currentStock, unit)) + '</td>' +
          '<td><span class="fp-factory-state" data-state="' + status.key + '">' + esc(status.label) + '</span></td></tr>';
      });
      html += '</tbody></table></div></article>';
    });
    return planMarkup + html + '</section>';
  }
  function factoryInputSourceMarkup(factory, productId, model) {
    var lots = (factory.inputLots || []).filter(function (lot) {
      return lot && String(lot.resourceId || lot.materialIdentity || '').toLowerCase() === String(productId).toLowerCase();
    });
    var sourceGroups = Object.create(null), batches = model.resourceBatches || [], factoryNames = Object.create(null);
    (model.factories || []).forEach(function (row) { if (row && row.id) factoryNames[String(row.id)] = row.name; });
    lots.forEach(function (lot) {
      var remaining = num(lot.remainingQuantity !== undefined ? lot.remainingQuantity : lot.quantity);
      if (remaining === null || remaining <= 0) return;
      var provenance = lot.provenance && typeof lot.provenance === 'object' ? lot.provenance : {};
      var sourceCountry = String(lot.sourceCountryId || lot.originCountryId || provenance.sourceCountryId || '').toUpperCase();
      var sourceFactory = String(lot.sourceFactoryId || '').trim();
      var sites = Array.isArray(lot.sourceSiteIds) ? lot.sourceSiteIds.filter(Boolean).map(String) : [];
      if (lot.siteId) sites.push(String(lot.siteId));
      (Array.isArray(lot.sourceBatchIds) ? lot.sourceBatchIds : []).forEach(function (batchId) {
        var sourceBatch = batches.find(function (batch) { return batch && String(batch.batchId) === String(batchId); });
        if (!sourceBatch) return;
        if (sourceBatch.siteId || sourceBatch.sourceSiteId || sourceBatch.siteReferenceKey) sites.push(String(sourceBatch.siteId || sourceBatch.sourceSiteId || sourceBatch.siteReferenceKey));
        if (!sourceFactory && sourceBatch.sourceFactoryId) sourceFactory = String(sourceBatch.sourceFactoryId);
        if (!sourceCountry && (sourceBatch.sourceCountryId || sourceBatch.originCountryId)) sourceCountry = String(sourceBatch.sourceCountryId || sourceBatch.originCountryId).toUpperCase();
      });
      var label;
      if (sourceCountry && sourceCountry !== model.countryId) label = 'Import · ' + panelCountryLabel(sourceCountry);
      else if (sites.length) label = 'Domestic mine · ' + Array.from(new Set(sites)).join(', ');
      else if (sourceFactory) label = 'Domestic factory · ' + (factoryNames[sourceFactory] || sourceFactory);
      else if (/OPENING|STARTUP/.test(String(provenance.status || provenance.source || lot.batchId || '').toUpperCase())) label = 'Opening allocation';
      else if (sourceCountry === model.countryId) label = 'Domestic warehouse · mine lineage not recorded';
      else label = 'Source not recorded';
      var key = label.toLowerCase();
      sourceGroups[key] = sourceGroups[key] || { label: label, quantity: 0, unit: String(lot.unit || '') };
      sourceGroups[key].quantity += remaining;
    });
    var lines = Object.keys(sourceGroups).map(function (key) {
      var source = sourceGroups[key];
      return '<span class="fp-factory-source"><strong>' + esc(source.label) + '</strong><small>' + fmt(source.quantity, source.unit) + '</small></span>';
    });
    if (!lines.length) {
      var current = panelValueByKey(factory.raw && factory.raw.inputInventory, productId);
      return current > 0 ? '<span class="fp-factory-muted">Source not recorded</span>' : '<span class="fp-factory-muted">No delivered source batch</span>';
    }
    return lines.join('');
  }
  function factoryInputEfficiency(factory, inputRows) {
    var raw = factory.raw || {}, health = raw.productionHealth && typeof raw.productionHealth === 'object' ? raw.productionHealth : {};
    var reason = String(health.reason || factory.healthReason || '').toUpperCase();
    var detail = health.detail && typeof health.detail === 'object' ? health.detail : {};
    var constraints = detail.constraints && typeof detail.constraints === 'object' ? detail.constraints :
      health.productionConstraints && typeof health.productionConstraints === 'object' ? health.productionConstraints : {};
    var rawMaterialRatio = num(constraints.rawMaterialRatio);
    if (rawMaterialRatio !== null) return { value: Math.max(0, Math.min(100, (1 - rawMaterialRatio) * 100)), observed: true };
    if (/FACTORY_INPUT|INPUT_SHORTAGE|MATERIAL_SHORTAGE/.test(reason) && num(health.productivityPct) !== null) {
      return { value: Math.max(0, 100 - Number(health.productivityPct)), observed: true };
    }
    var ratio = 1, observed = false;
    inputRows.forEach(function (row) {
      if (row.required === null || row.required <= 0 || row.current === null) return;
      observed = true;
      ratio = Math.min(ratio, Math.max(0, Math.min(1, row.current / row.required)));
    });
    if (observed) return { value: Math.max(0, (1 - ratio) * 100), observed: true };
    return { value: null, observed: false };
  }
  function factoryInputPanelMarkup(model) {
    var planMarkup = factoryInputPlanMarkup(model);
    var factories = Array.isArray(model.factories) ? model.factories : [];
    if (!factories.length) return planMarkup;
    var html = '<section class="fp-factory-analytics" aria-label="Recorded factory input deliveries"><h3 class="omega-v2-section-title">Actual factory input inventory and deliveries</h3>';
    var visibleFactories = 0;
    factories.forEach(function (factory) {
      var coefficientMap = factory.inputCoefficients && typeof factory.inputCoefficients === 'object' ? factory.inputCoefficients : {};
      var ids = Object.keys(coefficientMap);
      (factory.inputRows || []).forEach(function (row) {
        if (ids.map(function (id) { return id.toLowerCase(); }).indexOf(String(row.resourceId).toLowerCase()) < 0) ids.push(row.resourceId);
      });
      (factory.inputLots || []).forEach(function (lot) {
        var id = String(lot && (lot.resourceId || lot.materialIdentity) || '');
        if (id && ids.map(function (value) { return value.toLowerCase(); }).indexOf(id.toLowerCase()) < 0) ids.push(id);
      });
      if (!ids.length) return;
      visibleFactories += 1;
      var capacity = num(factory.capacityPerDay), rows = [];
      ids.forEach(function (productId) {
        var coefficient = panelInputCoefficient(coefficientMap[productId]);
        if (coefficient === null) {
          var coefficientKey = Object.keys(coefficientMap).find(function (key) { return key.toLowerCase() === productId.toLowerCase(); });
          if (coefficientKey) coefficient = panelInputCoefficient(coefficientMap[coefficientKey]);
        }
        var required = capacity !== null && coefficient !== null ? capacity * coefficient / Math.max(1, num(factory.cycleDays) || 1) : null;
        var current = factory.hasInputInventory ? panelValueByKey(factory.raw.inputInventory, productId) : null;
        if (factory.hasInputInventory && current === null) current = 0;
        var lots = factory.inputLots.filter(function (lot) {
          return String(lot && (lot.resourceId || lot.materialIdentity) || '').toLowerCase() === productId.toLowerCase();
        });
        var seen = Object.create(null), received = 0, hasReceipt = false, unit = '';
        lots.forEach(function (lot) {
          var batchId = String(lot.batchId || '');
          if (batchId && seen[batchId]) return;
          if (batchId) seen[batchId] = true;
          var quantity = num(lot.quantity);
          if (quantity !== null) { received += quantity; hasReceipt = true; }
          if (!unit && lot.unit) unit = lot.unit;
        });
        var inputUnit = factory.inputUnits && Object.keys(factory.inputUnits).find(function (key) { return key.toLowerCase() === productId.toLowerCase(); });
        unit = unit || (inputUnit ? factory.inputUnits[inputUnit] : '') || factory.inputUnit || '';
        rows.push({ productId: productId, coefficient: coefficient, required: required, current: current,
          received: hasReceipt ? received : null, unit: unit });
      });
      var efficiency = factoryInputEfficiency(factory, rows);
      var productionHealth = factory.healthStatus || factory.status || 'Not recorded';
      html += '<article class="fp-factory-data-card"><header class="fp-factory-data-heading"><div><span>FACTORY INPUT</span><strong>' +
        esc(factory.name) + '</strong><small>' + esc(factory.type) + ' · ' + esc(productionHealth) + '</small></div>' +
        '<span class="fp-factory-data-count">' + fmt(rows.length) + ' input line(s)</span></header>';
      html += '<div class="fp-factory-table-wrap"><table class="fp-factory-table fp-factory-input-table"><thead><tr>' +
        '<th>Input product</th><th>Required / day</th><th>Total received</th><th>Current factory stock</th><th>Supply source</th><th>Availability</th><th>Efficiency reduction</th>' +
        '</tr></thead><tbody>';
      rows.forEach(function (row) {
        var shortage = row.required !== null && row.current !== null ? Math.max(0, row.required - row.current) : null;
        var state = shortage !== null ? (shortage > 1e-9 ? 'shortage' : 'sufficient') : 'unknown';
        var stateLabel = shortage === null ? 'Not recorded' : shortage > 1e-9
          ? 'Shortage · ' + fmt(shortage, row.unit) : 'Sufficient';
        html += '<tr><td>' + factoryProductIdentityMarkup(row.productId, panelProductLabel(model, row.productId)) + '</td>' +
          '<td>' + fmt(row.required, row.unit) + '</td><td>' + fmt(row.received, row.unit) + '</td>' +
          '<td>' + factoryProductStockMarkup(row.productId, panelProductLabel(model, row.productId), fmt(row.current, row.unit)) + '</td><td>' + factoryInputSourceMarkup(factory, row.productId, model) + '</td>' +
          '<td><span class="fp-factory-state" data-state="' + state + '">' + esc(stateLabel) + '</span></td>' +
          '<td>' + (efficiency.value === null ? '<span class="fp-factory-muted">Not recorded</span>' :
            '<span class="fp-factory-state" data-state="' + (efficiency.value > 1e-9 ? 'shortage' : 'sufficient') + '">' +
            fmt(efficiency.value, '%') + '</span>') + '</td></tr>';
      });
      html += '</tbody></table></div></article>';
    });
    if (!visibleFactories) return planMarkup + '<div class="omega-v2-empty">No delivered factory input rows are recorded yet. Planned requirements remain shown above.</div>';
    return planMarkup + html + '</section>';
  }

  function factoryTypeLabel(factory) {
    var catalog = safeCatalog() || {};
    var type = normalizeFactoryType(factory && factory.type, catalog) || String(factory && factory.type || '').toUpperCase();
    var profiles = catalog.factoryProfiles && typeof catalog.factoryProfiles === 'object' ? catalog.factoryProfiles : {};
    var profile = profiles[type] || profiles[String(factory && factory.type || '').toUpperCase()] || {};
    return String(profile.name || factory && factory.type || 'Factory');
  }

  function factoryTypeOwnedCount(factory, model) {
    var catalog = safeCatalog() || {};
    var type = normalizeFactoryType(factory && factory.type, catalog) || String(factory && factory.type || '').toUpperCase();
    var rows = model && Array.isArray(model.factoryTypeCounts) ? model.factoryTypeCounts : [];
    for (var i = 0; i < rows.length; i += 1) {
      if ((normalizeFactoryType(rows[i].type, catalog) || String(rows[i].type || '').toUpperCase()) === type) {
        var count = num(rows[i].count);
        return count === null ? null : Math.max(0, Math.floor(count));
      }
    }
    return null;
  }

  function factoryCardUiState(model) {
    return model && model.factoryCardUiState && typeof model.factoryCardUiState === 'object'
      ? model.factoryCardUiState : { expandedKey:'', buildKey:'', sections:Object.create(null), buildMaterialsExpanded:false };
  }

  function factoryRouteProductIds(route, field, validMap) {
    var presentation = route && route.presentation && typeof route.presentation === 'object' ? route.presentation : {};
    var values = Array.isArray(presentation[field]) ? presentation[field] : [];
    return values.filter(function (id) {
      return Object.prototype.hasOwnProperty.call(validMap || {}, String(id));
    });
  }

  function factoryPresentationRoutes(model, type, asset) {
    model = model || {};
    var catalog = safeCatalog() || {};
    var profiles = model.catalogProfiles || catalog.factoryProfiles || {};
    var recipes = model.catalogRecipes || catalog.downstreamFactoryRecipes || {};
    var processing = model.processingRules || catalog.processingRules || {};
    var wanted = normalizeFactoryType(type || asset && asset.type, catalog) || String(type || asset && asset.type || '').toUpperCase();
    var profile = profiles[wanted] || profiles[String(type || asset && asset.type || '').toUpperCase()] || {};
    if (asset) {
      var recipeId = String(asset.recipeId || asset.raw && asset.raw.recipeId || profile.defaultRecipeId || '');
      var exact = recipes[recipeId];
      if (exact && (normalizeFactoryType(exact.factoryType, catalog) || String(exact.factoryType || '').toUpperCase()) === wanted) {
        return [Object.assign({ recipeId:recipeId, routeKind:'FACTORY_RECIPE' }, exact)];
      }
      var raw = asset.raw && typeof asset.raw === 'object' ? asset.raw : {};
      var resourceId = String(raw.resourceId || raw.inputResourceId || raw.primaryInputResourceId ||
        raw.primaryResourceId || asset.resourceId || '').trim().toLowerCase();
      var rule = resourceId && processing[resourceId];
      if (rule && (normalizeFactoryType(rule.factoryType, catalog) || String(rule.factoryType || '').toUpperCase()) === wanted) {
        return [Object.assign({ recipeId:'PROCESSING:' + resourceId, name:resourceId.replace(/_/g, ' ') + ' processing', resourceId:resourceId, routeKind:'RESOURCE_PROCESSING' }, rule)];
      }
      var inputs = asset.inputCoefficients && typeof asset.inputCoefficients === 'object' ? asset.inputCoefficients : {};
      var outputs = asset.outputProfile && typeof asset.outputProfile === 'object' ? asset.outputProfile : {};
      if (Object.keys(inputs).length || Object.keys(outputs).length) {
        return [{
          recipeId:recipeId || 'ASSET_ROUTE_NOT_RECORDED',
          name:profile.name || asset.name || 'Factory route',
          factoryType:wanted,
          inputs:inputs,
          outputs:outputs,
          cycleDays:asset.cycleDays,
          inputUnit:asset.inputUnit,
          outputUnit:asset.raw && asset.raw.outputUnit || '',
          quantityBasis:'PER_SIMULATION_PRODUCTION_UNIT',
          presentation:null,
          routeKind:'ASSET_RECORDED_PROFILE'
        }];
      }
      return [];
    }
    if (wanted === 'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT') {
      var siteResources = Object.create(null);
      (Array.isArray(model.mineSites) ? model.mineSites : []).forEach(function (site) {
        var raw = site && site.raw || {};
        var id = String(site && site.resourceId || raw.resourceId || raw.resourceTypeId ||
          raw.identity && (raw.identity.resourceTypeId || raw.identity.resourceId) || '').trim().toLowerCase();
        if (!id || raw.commercialExtraction !== true || !processing[id]) return;
        if ((normalizeFactoryType(processing[id].factoryType, catalog) || String(processing[id].factoryType || '').toUpperCase()) !== wanted) return;
        siteResources[id] = true;
      });
      return Object.keys(siteResources).sort().map(function (resourceId) {
        return Object.assign({
          recipeId:'PROCESSING:' + resourceId,
          name:resourceId.replace(/_/g, ' ') + ' processing',
          resourceId:resourceId,
          routeKind:'RESOURCE_PROCESSING'
        }, processing[resourceId]);
      });
    }
    var routeIds = Array.isArray(profile.recipeIds) ? profile.recipeIds.slice() : [];
    if (!routeIds.length && profile.defaultRecipeId) routeIds = [String(profile.defaultRecipeId)];
    routeIds = routeIds.filter(function (id) {
      var route = recipes[id];
      return route && (normalizeFactoryType(route.factoryType, catalog) || String(route.factoryType || '').toUpperCase()) === wanted;
    });
    var defaultId = String(profile.defaultRecipeId || '');
    routeIds.sort(function (a, b) {
      if (a === defaultId) return -1;
      if (b === defaultId) return 1;
      return a.localeCompare(b);
    });
    return routeIds.map(function (id) {
      return Object.assign({ recipeId:id, routeKind:'FACTORY_RECIPE' }, recipes[id]);
    });
  }

  function factoryQuantityBasisLabel(value, route, side) {
    var amount = num(value);
    if (amount === null) return 'Quantity not recorded';
    var unit = String(side === 'input' ? route && route.inputUnit || '' : route && route.outputUnit || '');
    var basis = String(route && route.quantityBasis || '');
    var amountText = amount.toLocaleString('en-US', { maximumFractionDigits:4 });
    if (basis === 'PER_SIMULATION_PRODUCTION_UNIT') return amountText + ' / production unit';
    if (basis) return amountText + ' / ' + basis.toLowerCase().replace(/_/g, ' ');
    return amountText + (unit ? ' ' + unit : '') + ' · basis not recorded';
  }

  function factoryFindValue(source, productId) {
    if (!source || typeof source !== 'object') return null;
    var wanted = String(productId || '').toLowerCase();
    var key = Object.keys(source).find(function (candidate) { return String(candidate).toLowerCase() === wanted; });
    if (!key) return null;
    var value = source[key];
    if (value && typeof value === 'object') {
      value = value.quantity !== undefined ? value.quantity :
        value.remainingQuantity !== undefined ? value.remainingQuantity :
        value.availableQuantity !== undefined ? value.availableQuantity :
        value.value !== undefined ? value.value : value.amount;
    }
    return num(value);
  }

  function factoryInventoryRow(model, productId) {
    var inventory = model && model.nationalInventory;
    var items = inventory && Array.isArray(inventory.items) ? inventory.items : [];
    var wanted = String(productId || '').toLowerCase();
    return items.find(function (row) {
      return String(row && (row.productId || row.resourceId || row.id) || '').toLowerCase() === wanted;
    }) || null;
  }

  function factoryConstructionAvailability(model, productId, requiredUnit) {
    var row = factoryInventoryRow(model, productId);
    if (!row) return { value:null, unit:'', comparable:false };
    var value = num(row.quantity !== undefined ? row.quantity :
      row.availableQuantity !== undefined ? row.availableQuantity : row.onHand);
    if (value === null) return { value:null, unit:String(row.unit || ''), comparable:false };
    var unit = String(row.unit || '');
    return {
      value:value,
      unit:unit,
      comparable:!!unit && !!requiredUnit && unit.toUpperCase() === String(requiredUnit).toUpperCase()
    };
  }

  function factoryBuildRequirementsMarkup(type, model, cardKey) {
    model = model || {};
    var catalog = safeCatalog() || {};
    var wanted = normalizeFactoryType(type, catalog) || String(type || '').toUpperCase();
    var profile = (model.catalogProfiles || catalog.factoryProfiles || {})[wanted] || {};
    var state = factoryCardUiState(model);
    var materials = profile.constructionMaterials && typeof profile.constructionMaterials === 'object'
      ? Object.keys(profile.constructionMaterials).map(function (id) {
          return { id:id, quantity:num(profile.constructionMaterials[id]) };
        }).filter(function (row) { return row.quantity !== null; })
      : [];
    materials.sort(function (a, b) { return a.id.localeCompare(b.id); });
    var unit = String(profile.constructionMaterialUnit || '');
    var visible = state.buildMaterialsExpanded ? materials : materials.slice(0, 3);
    var rows = visible.map(function (row) {
      var available = factoryConstructionAvailability(model, row.id, unit);
      var amount = fmt(row.quantity, unit ? unit.replace(/_/g, ' ').toLowerCase() : '');
      var availability = available.value === null ? 'Not recorded'
        : fmt(available.value, available.unit || '');
      var stockNote = available.value === null ? 'Stock not recorded'
        : available.comparable ? (available.value + ' available')
        : ('Stock recorded' + (available.unit ? ' · ' + available.unit : ' · unit not comparable'));
      return '<div class="fp-card-bom-row">' +
        factoryProductIdentityMarkup(row.id, panelProductLabel(model, row.id)) +
        '<strong class="fp-card-bom-required">' + esc(amount) + '</strong>' +
        '<span class="fp-card-bom-availability" data-state="' + (available.value === null ? 'unknown' : available.comparable && available.value < row.quantity ? 'shortage' : 'recorded') + '">' +
          esc(stockNote) + '</span></div>';
    }).join('');
    var materialsMarkup = materials.length
      ? '<div class="fp-card-build-materials"><div class="fp-card-build-section-head"><strong>Construction materials</strong><span>' + fmt(materials.length) + ' materials</span></div>' +
        rows +
        (materials.length > 3 ? '<button type="button" class="fp-card-inline-more" data-omega-v2-factory-build-materials="' + esc(cardKey) + '" aria-expanded="' + (state.buildMaterialsExpanded ? 'true' : 'false') + '">' +
          (state.buildMaterialsExpanded ? 'Show fewer materials' : 'Show all ' + materials.length + ' materials') +
          '<span aria-hidden="true">' + (state.buildMaterialsExpanded ? '⌃' : '⌄') + '</span></button>' : '') +
      '</div>'
      : '<div class="fp-card-empty-note">Construction material requirements are not recorded for this profile.</div>';
    var infrastructure = Array.isArray(profile.requiredInfrastructure) ? profile.requiredInfrastructure : [];
    var technology = Array.isArray(profile.requiredTechnologyIds) ? profile.requiredTechnologyIds : [];
    var formatTags = function (values) {
      return values.length ? values.map(function (value) {
        return '<span class="fp-card-requirement-tag">' + esc(String(value).replace(/_/g, ' ')) + '</span>';
      }).join('') : '<span class="fp-card-muted">None recorded</span>';
    };
    var costUnit = String(profile.unit || 'GAME_CURRENCY_UNITS').replace(/_/g, ' ').toLowerCase();
    return '<section class="fp-card-build-state" data-factory-build-state="' + esc(cardKey) + '">' +
      '<header class="fp-card-build-heading"><div><span>CONSTRUCTION / BILL OF MATERIALS</span><strong>Build requirements</strong></div>' +
        '<button type="button" class="fp-card-back-button" data-omega-v2-factory-build-details-close aria-label="Back to factory overview"><span aria-hidden="true">‹</span> Back</button></header>' +
      '<div class="fp-card-build-metrics">' +
        '<div><small>Build duration</small><strong>' + fmt(profile.constructionDays, 'game-days') + '</strong></div>' +
        '<div><small>Construction cost</small><strong>' + fmt(profile.constructionCost, costUnit) + '</strong></div>' +
        '<div><small>Designed capacity</small><strong>' + fmt(profile.defaultCapacityPerDay, 'simulation units/day') + '</strong></div>' +
      '</div>' +
      materialsMarkup +
      '<div class="fp-card-requirements-grid"><div><small>Required infrastructure</small><div class="fp-card-requirement-tags">' + formatTags(infrastructure) + '</div></div>' +
        '<div><small>Required technology</small><div class="fp-card-requirement-tags">' + formatTags(technology) + '</div></div></div>' +
      (profile.simulationOnly === true || profile.constructionMaterialsAuthority ? '<p class="fp-card-build-provenance">Modeled construction requirements · gameplay quantities, not real-world engineering measurements.</p>' : '') +
      '<div class="fp-card-build-actions"><button type="button" class="omega-v2-factory-button omega-v2-factory-button--build" data-omega-v2-factory-build="CATALOG" data-factory-type="' + esc(wanted) + '"' +
        (model.canOperateSelectedCountry === true ? '' : ' disabled title="Building is available only for the active player country."') +
        '><span aria-hidden="true" class="omega-v2-action-icon omega-v2-action-icon--build"></span>Start construction project</button></div>' +
    '</section>';
  }

  function factoryRecipeProductRow(route, productId, side, model, asset, roleLabel) {
    var map = side === 'input' ? route.inputs || {} : route.outputs || {};
    var amount = map[productId];
    var quantity = factoryQuantityBasisLabel(amount, route, side);
    var actual = '';
    if (asset && side === 'input') {
      var current = asset.hasInputInventory ? factoryFindValue(asset.raw && asset.raw.inputInventory, productId) : null;
      if (asset.hasInputInventory && current === null) current = 0;
      actual = '<small class="fp-card-product-actual">Factory stock: ' + (current === null ? 'Not recorded' : fmt(current, 'simulation units')) + '</small>';
    } else if (asset && side === 'output') {
      var committed = factoryFindValue(asset.latestOutputs, productId);
      var stock = factoryFindValue(model && model.processedStock, productId);
      actual = '<small class="fp-card-product-actual">Committed: ' + (committed === null ? 'Not started / no committed output' : fmt(committed, 'simulation units')) +
        ' · Warehouse: ' + (stock === null ? 'Not recorded' : fmt(stock, 'simulation units')) + '</small>';
    }
    return '<div class="fp-card-product-row" data-product-role="' + esc(roleLabel || side) + '">' +
      factoryProductIdentityMarkup(productId, panelProductLabel(model, productId)) +
      '<span class="fp-card-product-quantity">' + esc(quantity) + '</span>' + actual +
    '</div>';
  }

  function factoryRouteFullDetailsMarkup(route, model, asset) {
    var inputs = Object.keys(route.inputs || {});
    var outputs = Object.keys(route.outputs || {});
    var presentation = route.presentation || {};
    var primary = factoryRouteProductIds(route, 'primaryOutputs', route.outputs || {});
    var co = factoryRouteProductIds(route, 'coProducts', route.outputs || {});
    var by = factoryRouteProductIds(route, 'byProducts', route.outputs || {});
    var roleMap = Object.create(null);
    primary.forEach(function (id) { roleMap[id] = 'Primary output'; });
    co.forEach(function (id) { roleMap[id] = 'Co-product'; });
    by.forEach(function (id) { roleMap[id] = 'By-product'; });
    var unclassified = outputs.filter(function (id) { return !roleMap[id]; });
    var html = '<section class="fp-card-route-detail"><header><strong>' + esc(route.name || route.recipeId || 'Production route') + '</strong>' +
      '<small>' + esc(route.recipeId || 'Recipe ID not recorded') + ' · ' + esc(fmt(route.cycleDays, 'game-days/cycle')) + '</small></header>';
    html += '<div class="fp-card-detail-columns"><div><h4>Inputs required</h4>' +
      (inputs.length ? inputs.map(function (id) {
        return factoryRecipeProductRow(route, id, 'input', model, asset, 'input');
      }).join('') : '<p class="fp-card-muted">No input identity recorded.</p>') +
      '</div><div><h4>Outputs</h4>' +
      (primary.length ? '<div class="fp-card-role-heading">Primary products</div>' + primary.map(function (id) {
        return factoryRecipeProductRow(route, id, 'output', model, asset, 'primary');
      }).join('') : '') +
      (co.length ? '<div class="fp-card-role-heading">Co-products</div>' + co.map(function (id) {
        return factoryRecipeProductRow(route, id, 'output', model, asset, 'co-product');
      }).join('') : '') +
      (by.length ? '<div class="fp-card-role-heading">By-products</div>' + by.map(function (id) {
        return factoryRecipeProductRow(route, id, 'output', model, asset, 'by-product');
      }).join('') : '') +
      (unclassified.length ? '<div class="fp-card-role-heading">Other outputs · classification not recorded</div>' + unclassified.map(function (id) {
        return factoryRecipeProductRow(route, id, 'output', model, asset, 'unclassified');
      }).join('') : '') +
      '</div></div>' +
      '<footer><span>Quantity basis: ' + esc(route.quantityBasis || 'Not recorded') + '</span><span>Cycle: ' + esc(fmt(route.cycleDays, 'game-days')) + '</span>' +
      (route.simulationOnly === true ? '<span>Modeled gameplay recipe</span>' : '') +
      '</footer></section>';
    return html;
  }

  function factoryCardRecipeMarkup(routes, model, cardKey, asset) {
    model = model || {};
    routes = Array.isArray(routes) ? routes : [];
    var state = factoryCardUiState(model);
    var expanded = state.expandedKey === cardKey;
    if (!routes.length) {
      return '<section class="fp-card-recipe fp-card-recipe--empty"><span class="fp-card-muted">' +
        (String(cardKey).indexOf('type:UNIVERSAL_MATERIALS') === 0
          ? 'No eligible country resource-processing route is recorded.'
          : 'Canonical production route not recorded.') +
        '</span></section>';
    }
    var route = routes[0];
    var inputs = Object.keys(route.inputs || {});
    var outputs = Object.keys(route.outputs || {});
    var primaryInputs = factoryRouteProductIds(route, 'primaryInputs', route.inputs || {});
    var primaryOutputs = factoryRouteProductIds(route, 'primaryOutputs', route.outputs || {});
    var coProducts = factoryRouteProductIds(route, 'coProducts', route.outputs || {});
    var byProducts = factoryRouteProductIds(route, 'byProducts', route.outputs || {});
    if (!primaryInputs.length && inputs.length === 1) primaryInputs = inputs.slice();
    if (!primaryOutputs.length && outputs.length === 1) primaryOutputs = outputs.slice();
    var visibleInputs = primaryInputs.slice(0, 1);
    var visibleOutputs = primaryOutputs.slice(0, 2);
    var hiddenInputs = inputs.filter(function (id) { return visibleInputs.indexOf(id) < 0; });
    var hiddenOutputs = outputs.filter(function (id) {
      return visibleOutputs.indexOf(id) < 0 && byProducts.indexOf(id) < 0;
    });
    var visibleByProducts = byProducts.slice(0, 1);
    var hiddenByProducts = byProducts.slice(1);
    var hasAlternatives = routes.length > 1;
    var sectionState = state.sections || {};
    var html = '<section class="fp-card-recipe" data-factory-card-recipe="' + esc(cardKey) + '">';
    if (visibleOutputs.length) {
      html += '<div class="fp-card-product-section fp-card-product-section--output"><div class="fp-card-section-label">Main output</div>' +
        visibleOutputs.map(function (id) { return factoryRecipeProductRow(route, id, 'output', model, asset, 'primary'); }).join('') +
        (hiddenOutputs.length ? '<button type="button" class="fp-card-section-toggle" data-omega-v2-factory-section-toggle data-card-key="' + esc(cardKey) + '" data-section="outputs" aria-expanded="' + (sectionState[cardKey + ':outputs'] ? 'true' : 'false') + '">Other outputs +' + hiddenOutputs.length + ' <span aria-hidden="true">' + (sectionState[cardKey + ':outputs'] ? '⌃' : '⌄') + '</span></button>' : '') +
        (sectionState[cardKey + ':outputs'] ? hiddenOutputs.map(function (id) {
          var role = coProducts.indexOf(id) >= 0 ? 'co-product' : 'unclassified';
          return factoryRecipeProductRow(route, id, 'output', model, asset, role);
        }).join('') : '') +
      '</div>';
    } else {
      html += '<div class="fp-card-product-section"><div class="fp-card-section-label">Outputs</div><p class="fp-card-muted">Output roles not classified. Open full details to inspect the route.</p></div>';
    }
    if (visibleByProducts.length) {
      html += '<div class="fp-card-byproduct-row"><span class="fp-card-section-label">By-product:</span>' +
        factoryRecipeProductRow(route, visibleByProducts[0], 'output', model, asset, 'by-product') +
        (hiddenByProducts.length ? '<button type="button" class="fp-card-section-toggle fp-card-section-toggle--inline" data-omega-v2-factory-section-toggle data-card-key="' + esc(cardKey) + '" data-section="byProducts" aria-expanded="' + (sectionState[cardKey + ':byProducts'] ? 'true' : 'false') + '" aria-label="Show additional by-products">' + hiddenByProducts.length + ' more <span aria-hidden="true">' + (sectionState[cardKey + ':byProducts'] ? '⌃' : '⌄') + '</span></button>' : '') +
        (sectionState[cardKey + ':byProducts'] ? hiddenByProducts.map(function (id) {
          return factoryRecipeProductRow(route, id, 'output', model, asset, 'by-product');
        }).join('') : '') +
      '</div>';
    }
    if (visibleInputs.length) {
      html += '<div class="fp-card-input-section"><div class="fp-card-section-label">Input</div>' +
        factoryRecipeProductRow(route, visibleInputs[0], 'input', model, asset, 'input') +
        (hiddenInputs.length ? '<button type="button" class="fp-card-section-toggle" data-omega-v2-factory-section-toggle data-card-key="' + esc(cardKey) + '" data-section="inputs" aria-expanded="' + (sectionState[cardKey + ':inputs'] ? 'true' : 'false') + '">+' + hiddenInputs.length + ' more inputs <span aria-hidden="true">' + (sectionState[cardKey + ':inputs'] ? '⌃' : '⌄') + '</span></button>' : '') +
        (sectionState[cardKey + ':inputs'] ? hiddenInputs.map(function (id) {
          return factoryRecipeProductRow(route, id, 'input', model, asset, 'input');
        }).join('') : '') +
      '</div>';
    }
    var canExpand = hasAlternatives || hiddenInputs.length > 0 || hiddenOutputs.length > 0 || hiddenByProducts.length > 0 || coProducts.length > 0;
    if (expanded) {
      html += '<div class="fp-card-expanded-details">' +
        '<div class="fp-card-expanded-heading"><strong>Complete production formula</strong><span>' + esc(route.recipeId || 'Route not recorded') + '</span></div>' +
        routes.map(function (item) { return factoryRouteFullDetailsMarkup(item, model, asset); }).join('') +
      '</div>';
    }
    if (canExpand || expanded) {
      html += '<button type="button" class="fp-card-disclosure" data-omega-v2-factory-card-expand data-card-key="' + esc(cardKey) + '" aria-expanded="' + (expanded ? 'true' : 'false') + '" aria-label="' + (expanded ? 'Collapse full production details' : 'Expand full production details') + '">' +
        '<span class="fp-card-disclosure-plate"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 9 7 7 7-7M5 4l7 7 7-7"/></svg></span>' +
      '</button>';
    }
    if (hasAlternatives && !expanded) {
      html += '<small class="fp-card-route-count">' + (routes.length - 1) + ' alternative production route(s) available in details</small>';
    }
    return html + '</section>';
  }

  function factoryCard(factory, options) {
    options = options || {};
    var model = options.model || {};
    var id = String(factory.id || factory.raw && (factory.raw.id || factory.raw.assetId || factory.raw.projectId) || '');
    var type = normalizeFactoryType(factory.type, safeCatalog()) || String(factory.type || '').toUpperCase();
    var cardKey = 'asset:' + id;
    var state = factoryCardUiState(model);
    var status = factoryProductionState(factory);
    var daily = factoryDailyOutput(factory);
    var selected = String(options.selectedFactoryId || '') === id;
    var ownedCount = factoryTypeOwnedCount(factory, model);
    var displayOutput = daily
      ? (daily.value > 0 ? '+ ' : '') + fmt(daily.value) + (daily.unit ? ' ' + esc(daily.unit) : '') + '/day'
      : 'Not recorded';
    var outputProduct = daily && daily.product ? '<small class="omega-v2-factory-output-product">' + esc(daily.product) + '</small>' : '';
    var reasonText = String(status.reason || '').trim();
    var reason = reasonText && !/^(NOT_RECORDED|NOT RECORDED|UNKNOWN)$/.test(reasonText.toUpperCase())
      ? '<small class="omega-v2-factory-reason">' + esc(reasonText.replace(/_/g, ' ').toLowerCase()) + '</small>' : '';
    var canOperate = model.canOperateSelectedCountry === true;
    var isDecommissioned = /^(DECOMMISSIONED|DESTROYED)$/.test(String(factory.status || '').toUpperCase());
    var typeName = factoryTypeLabel(factory);
    var head = '<span class="fp-badge" aria-hidden="true">' + factorySvgMarkup(factory) + '</span>' +
      '<button type="button" class="omega-v2-factory-title" data-omega-v2-factory-select="' + esc(id) + '" aria-pressed="' + (selected ? 'true' : 'false') + '" aria-label="Select ' + esc(factory.name) + '">' +
        '<strong>' + esc(factory.name) + '</strong><small>' + esc(typeName) + '</small><span class="omega-v2-factory-title-mark" aria-hidden="true"></span>' +
      '</button>';
    if (state.buildKey === cardKey) {
      return '<article class="omega-v2-factory-card fp-card fp-card--build" data-omega-v2-factory-card data-factory-id="' + esc(id) + '" data-state="' + status.key + '">' +
        head + factoryBuildRequirementsMarkup(type, model, cardKey) + '</article>';
    }
    var routes = factoryPresentationRoutes(model, type, factory);
    return '<article class="omega-v2-factory-card fp-card' + (state.expandedKey === cardKey ? ' fp-card--expanded' : '') + '" data-omega-v2-factory-card data-factory-id="' + esc(id) +
      '" data-state="' + status.key + '" data-selected="' + (selected ? 'true' : 'false') +
      '" data-search="' + esc((factory.name + ' ' + id + ' ' + factory.type + ' ' + factory.recipeId).toLowerCase()) + '">' +
      head +
      '<button type="button" class="omega-v2-factory-art" data-omega-v2-factory-select="' + esc(id) + '" aria-pressed="' + (selected ? 'true' : 'false') + '" aria-label="Select ' + esc(factory.name) + ' factory">' +
        '<span class="omega-v2-factory-ring" aria-hidden="true"></span><span class="omega-v2-factory-artwell">' + factorySvgMarkup(factory) + '</span>' +
      '</button>' +
      '<div class="omega-v2-factory-status-plate" data-state="' + status.key + '">' +
        '<span class="omega-v2-factory-status-led" aria-hidden="true"></span><strong>' + esc(status.label) + '</strong>' +
        '<span class="omega-v2-factory-output">' + displayOutput + '</span>' + outputProduct + reason +
      '</div>' +
      '<div class="omega-v2-factory-count"><span>Owned:</span><strong>' + fmt(ownedCount) + '</strong></div>' +
      factoryCardRecipeMarkup(routes, model, cardKey, factory) +
      '<div class="omega-v2-factory-actions">' +
        '<button type="button" class="omega-v2-factory-button omega-v2-factory-button--build" data-omega-v2-factory-build-details data-factory-card-key="' + esc(cardKey) + '" data-factory-type="' + esc(type) + '"' +
          (canOperate ? '' : ' disabled title="Build actions are available only for the active player country."') + '><span aria-hidden="true" class="omega-v2-action-icon omega-v2-action-icon--build"></span>Build</button>' +
        '<button type="button" class="omega-v2-factory-button omega-v2-factory-button--destroy" data-omega-v2-factory-destroy="' + esc(id) + '"' +
          (!canOperate || isDecommissioned ? ' disabled title="This factory cannot be decommissioned from the current country view."': '') +
          '><span aria-hidden="true" class="omega-v2-action-icon omega-v2-action-icon--destroy"></span>Destroy</button>' +
      '</div></article>';
  }
  function factoryTypeBuildSupport(type, catalog) {
    catalog = catalog || safeCatalog() || {};
    var wanted = normalizeFactoryType(type, catalog) || String(type || '').toUpperCase();
    var recipes = Object.keys(catalog.downstreamFactoryRecipes || {}).map(function (key) {
      return Object.assign({ recipeId: key }, catalog.downstreamFactoryRecipes[key] || {});
    }).filter(function (row) {
      return (normalizeFactoryType(row.factoryType, catalog) || String(row.factoryType || '').toUpperCase()) === wanted;
    }).sort(function (a, b) { return String(a.recipeId || '').localeCompare(String(b.recipeId || '')); });
    var resources = Object.keys(catalog.processingRules || {}).filter(function (resourceId) {
      var row = catalog.processingRules[resourceId] || {};
      return (normalizeFactoryType(row.factoryType, catalog) || String(row.factoryType || '').toUpperCase()) === wanted;
    }).sort();
    return { recipes: recipes, resources: resources, canBuild: recipes.length > 0 || resources.length > 0 };
  }

  function factoryTypeCard(item, model) {
    item = item || {};
    model = model || {};
    var catalog = safeCatalog() || {};
    var type = normalizeFactoryType(item.type, catalog) || String(item.type || '').toUpperCase();
    var cardKey = 'type:' + type;
    var state = factoryCardUiState(model);
    var support = factoryTypeBuildSupport(type, catalog);
    var ownedCount = model.hasCountryState ? factoryTypeOwnedCount({ type: type }, model) : null;
    var presence = ownedCount === null ? 'unknown' : Number(ownedCount) > 0 ? 'present' : 'absent';
    var presenceLabel = presence === 'present' ? 'EXISTING IN THIS COUNTRY'
      : presence === 'absent' ? 'NOT PRESENT IN THIS COUNTRY' : 'COUNTRY DATA NOT LOADED';
    var canBuild = model.canOperateSelectedCountry === true && support.canBuild;
    var duration = item.constructionDays == null ? 'Not recorded' : fmt(item.constructionDays) + ' game-days';
    var capacity = item.defaultCapacityPerDay == null ? 'Not recorded' : fmt(item.defaultCapacityPerDay) + ' simulation units/day';
    var cost = item.constructionCost == null ? 'Not recorded' : fmt(item.constructionCost);
    var disabledReason = !model.canOperateSelectedCountry
      ? 'Building is available only for the active player country.'
      : !support.canBuild ? 'No canonical recipe/input is registered for this type.' : '';
    var header = '<header class="fp-type-card-head"><span class="fp-type-card-art">' + factorySvgMarkup({ type:type, name:item.name || type }) + '</span>' +
      '<span class="fp-type-card-name"><strong>' + esc(item.name || type) + '</strong><small>' + esc(item.category || 'Uncategorised') + '</small></span></header>';
    if (state.buildKey === cardKey) {
      return '<article class="omega-v2-factory-type-card omega-v2-factory-type-card--' + presence + ' fp-type-card--build" data-omega-v2-factory-type-card data-factory-type="' + esc(type) + '" data-factory-presence="' + presence + '">' +
        header + '<div class="fp-type-card-count"><span>Factories</span><strong>' + fmt(ownedCount) + '</strong></div>' +
        factoryBuildRequirementsMarkup(type, model, cardKey) + '</article>';
    }
    var routes = factoryPresentationRoutes(model, type, null);
    return '<article class="omega-v2-factory-type-card omega-v2-factory-type-card--' + presence + (state.expandedKey === cardKey ? ' fp-type-card--expanded' : '') + '" data-omega-v2-factory-type-card data-factory-type="' + esc(type) + '" data-factory-presence="' + presence + '">' +
      header +
      '<div class="fp-type-card-count"><span>Factories</span><strong>' + fmt(ownedCount) + '</strong></div>' +
      '<div class="fp-type-card-presence" data-state="' + presence + '"><span class="fp-type-card-presence-led" aria-hidden="true"></span><strong>' + presenceLabel + '</strong></div>' +
      '<dl class="fp-type-card-metrics"><div><dt>Modeled build time</dt><dd>' + esc(duration) + '</dd></div>' +
      '<div><dt>Modeled capacity</dt><dd>' + esc(capacity) + '</dd></div>' +
      '<div><dt>Modeled construction cost</dt><dd>' + esc(cost) + '</dd></div></dl>' +
      factoryCardRecipeMarkup(routes, model, cardKey, null) +
      '<div class="fp-type-card-actions"><button type="button" class="omega-v2-factory-button omega-v2-factory-button--build" data-omega-v2-factory-build-details data-factory-card-key="' + esc(cardKey) + '" data-factory-type="' + esc(type) + '"' +
      (canBuild ? '' : ' disabled title="' + esc(disabledReason) + '"') +
      '><span aria-hidden="true" class="omega-v2-action-icon omega-v2-action-icon--build"></span>Build project</button></div></article>';
  }

  function factoryTypeCatalogMarkup(model) {
    model = model || {};
    var rows = Array.isArray(model.factoryTypeCatalog) ? model.factoryTypeCatalog.slice() : [];
    function owned(item) {
      return model.hasCountryState === true
        ? factoryTypeOwnedCount({ type: item && item.type }, model)
        : null;
    }
    function rank(item) {
      var count = owned(item);
      return count === null ? 0 : Number(count) > 0 ? 2 : 1;
    }
    rows.sort(function (a, b) {
      var presenceOrder = rank(b) - rank(a);
      if (presenceOrder) return presenceOrder;
      var countA = owned(a), countB = owned(b);
      if (countA !== null && countB !== null && Number(countA) !== Number(countB)) return Number(countB) - Number(countA);
      var categoryA = String(a && a.category || 'Uncategorised');
      var categoryB = String(b && b.category || 'Uncategorised');
      var byCategory = categoryA.localeCompare(categoryB);
      return byCategory || String(a && (a.name || a.type) || '').localeCompare(String(b && (b.name || b.type) || ''));
    });
    var cardRows = rows.map(function (item) { return factoryTypeCard(item, model); });
    var cards = '', lastCategory = null, lastPresence = null;
    rows.forEach(function (item, index) {
      var category = String(item && item.category || 'Uncategorised');
      var count = owned(item);
      var presence = count === null ? 'unknown' : Number(count) > 0 ? 'present' : 'absent';
      if (lastPresence !== presence) {
        var groupLabel = presence === 'present' ? 'EXISTING FACTORIES IN THIS COUNTRY'
          : presence === 'absent' ? 'FACTORY TYPES NOT PRESENT IN THIS COUNTRY'
          : 'FACTORY TYPES · COUNTRY DATA NOT LOADED';
        cards += '<div class="fp-type-catalog-divider fp-type-catalog-divider--presence" role="separator" data-factory-presence-group="' + presence + '"><span>' + groupLabel + '</span></div>';
        lastPresence = presence;
        lastCategory = null;
      }
      if (lastCategory !== null && category !== lastCategory) cards += '<div class="fp-type-catalog-divider" role="separator" aria-hidden="true"></div>';
      cards += cardRows[index];
      lastCategory = category;
    });
    var empty = '<div class="omega-v2-factory-type-empty">Factory type profiles are not loaded. No ownership or production figures have been invented.</div>';
    return '<section class="fp-type-catalog" aria-label="Factory types and selected-country totals">' +
      '<header class="fp-type-catalog-heading"><div><span>OMEGA / COUNTRY INDUSTRY REGISTER</span><strong>Factory types &amp; country totals</strong></div>' +
      '<span class="fp-type-catalog-total">' + fmt(rows.length) + ' types</span></header>' +
      '<p class="fp-type-catalog-note">Factory types owned by this country appear first. Types with no recorded factories are grouped at the bottom.</p>' +
      '<div class="fp-type-catalog-grid">' + (cards || empty) + '</div></section>';
  }

  function factoryProjectModal(model, requestedType) {
    model = model || {};
    var catalog = safeCatalog() || {};
    var type = normalizeFactoryType(requestedType, catalog) || String(requestedType || '').toUpperCase();
    var profiles = catalog.factoryProfiles && typeof catalog.factoryProfiles === 'object' ? catalog.factoryProfiles : {};
    var profile = profiles[type] || {};
    var support = factoryTypeBuildSupport(type, catalog);
    var recipeControl = support.recipes.length
      ? '<label>Production recipe<select name="recipeId"><option value="">Use the profile default</option>' + support.recipes.map(function (recipe) {
          var id = String(recipe.recipeId || recipe.id || '');
          var selected = id && id === String(profile.defaultRecipeId || '') ? ' selected' : '';
          return '<option value="' + esc(id) + '"' + selected + '>' + esc(recipe.name || recipe.title || id) + ' · ' + esc(id) + '</option>';
        }).join('') + '</select></label>'
      : '';
    var resourceControl = !support.recipes.length && support.resources.length
      ? '<label>Processing input<select name="resourceId" required><option value="">Select a registered input</option>' + support.resources.map(function (resourceId) {
          return '<option value="' + esc(resourceId) + '">' + esc(resourceId.replace(/_/g, ' ')) + '</option>';
        }).join('') + '</select></label>'
      : '';
    var disabled = !model.canOperateSelectedCountry || !support.canBuild;
    var gateText = !model.canOperateSelectedCountry
      ? 'This is a read-only country view. Select it as the active player country before building.'
      : !support.canBuild
        ? 'No canonical recipe/input is linked to this type. Construction cannot start with missing production rules.'
        : 'The authoritative runtime validates recipe, construction materials and stock. Opening this form does not guarantee approval.';
    return '<div class="omega-v2-factory-project-overlay" role="presentation"><section class="omega-v2-factory-project-dialog" role="dialog" aria-modal="true" aria-labelledby="omega-v2-factory-project-title">' +
      '<header class="fp-project-heading"><div><span>OMEGA / INDUSTRIAL PROJECTS</span><h2 id="omega-v2-factory-project-title">Start factory construction</h2></div>' +
      '<button type="button" class="fp-project-close" data-omega-v2-factory-project-cancel aria-label="Close construction form">×</button></header>' +
      '<form data-omega-v2-factory-project-form><input type="hidden" name="factoryType" value="' + esc(type) + '">' +
      '<div class="fp-project-type"><span>Factory type</span><strong>' + esc(profile.name || type) + '</strong><small>' + esc(type) + '</small></div>' +
      recipeControl + resourceControl +
      '<div class="fp-project-fields"><label>Build duration (modeled game-days)<input type="number" name="buildDays" min="1" step="1" inputmode="numeric" placeholder="' + esc(profile.constructionDays || 'Use profile default') + '"></label>' +
      '<label>Capacity (simulation units/day)<input type="number" name="capacityPerDay" min="1" step="any" inputmode="decimal" placeholder="' + esc(profile.defaultCapacityPerDay || 'Use profile default') + '"></label>' +
      '<label>Construction cost (' + esc(profile.unit || 'GAME_CURRENCY_UNITS') + ')<input type="number" name="cost" min="1" step="any" inputmode="decimal" placeholder="' + esc(profile.constructionCost || 'Use profile default') + '"></label></div>' +
      '<p class="fp-project-note">' + esc(gateText) + '</p><div class="fp-project-actions">' +
      '<button type="submit" class="omega-v2-factory-button omega-v2-factory-button--build"' + (disabled ? ' disabled' : '') + '>Start construction project</button>' +
      '<button type="button" class="omega-v2-factory-button fp-project-cancel" data-omega-v2-factory-project-cancel>Cancel</button></div></form></section></div>';
  }

  function scheduleRender(root, options, label) {
    options = options || {};
    var scheduler = options.onScheduleRender;
    if (typeof scheduler === 'function') {
      return scheduler(function () { return render(root, options); }, label || 'Updating this section', root);
    }
    return render(root, options);
  }


  function warmFactoryPlanningData(root, options, model) {
    if (!root || !model) return;
    var countryKey = String(model.countryId || '');
    if (!countryKey) return;
    var runtime = g.OmegaCountryFactoryStartingBaselineV1 ||
      (g.Omega && g.Omega.CountryFactoryStartingBaselineV1) || null;
    var network = safeNetwork();
    var waits = [];
    if (model.factoryBaselineStatus === 'LOADING' && runtime) {
      try {
        var ready = runtime.ready;
        if (ready && typeof ready.then === 'function') waits.push(ready);
      } catch (_) {}
    }
    if (!(model.catalogProfileCount > 0) && network && typeof network.loadCatalog === 'function') {
      try {
        var catalogReady = network.loadCatalog();
        if (catalogReady && typeof catalogReady.then === 'function') waits.push(catalogReady);
      } catch (_) {}
    }
    if (!waits.length) return;
    var pending = root.__omegaV2IndustryPlanWarmup;
    if (pending && pending.countryId === countryKey) return;
    pending = { countryId: countryKey, completed: false };
    root.__omegaV2IndustryPlanWarmup = pending;
    pending.promise = Promise.all(waits.map(function (promise) {
      return Promise.resolve(promise).catch(function () { return null; });
    })).then(function () {
      pending.completed = true;
      if (root.__omegaV2IndustryPlanWarmup !== pending ||
          String(root.__omegaV2IndustryCountryId || '') !== countryKey) return;
      // Do not revive a hidden Industry screen after the player has navigated
      // to another ministry while this read-only source request was pending.
      if (typeof root.querySelector === 'function' &&
          !root.querySelector('[data-omega-v2-industry-tab]')) return;
      var refreshedModel = buildViewModel({ countryId:countryKey });
      if (!(refreshedModel.catalogProfileCount > 0) && refreshedModel.factoryBaselineStatus !== 'READY') return;
      var active = root.__omegaV2IndustryTab || options.tab || 'factories';
      scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || options || {}, { countryId:countryKey, tab:active }),
        'Factory planning catalog ready');
    });
  }

  function render(root, options) {
    options = options || {};
    if (!root) return { ok: false, code: 'INDUSTRY_ROOT_REQUIRED' };
    var model = buildViewModel(options);
    var active = options.tab || root.__omegaV2IndustryTab || 'factories';
    var countryKey = String(model.countryId || '');
    warmFactoryPlanningData(root, options, model);
    if (root.__omegaV2IndustryCountryId !== countryKey) {
      root.__omegaV2IndustryCountryId = countryKey;
      root.__omegaV2IndustryFactoryViewExplicit = false;
      root.__omegaV2IndustryFactoryView = 'types';
      root.__omegaV2FactoryCardUiState = { expandedKey:'', buildKey:'', sections:Object.create(null), buildMaterialsExpanded:false };
    }
    if (!root.__omegaV2FactoryCardUiState || typeof root.__omegaV2FactoryCardUiState !== 'object') {
      root.__omegaV2FactoryCardUiState = { expandedKey:'', buildKey:'', sections:Object.create(null), buildMaterialsExpanded:false };
    }
    if (!root.__omegaV2FactoryCardUiState.sections) root.__omegaV2FactoryCardUiState.sections = Object.create(null);
    if (active !== 'factories') {
      root.__omegaV2FactoryCardUiState.expandedKey = '';
      root.__omegaV2FactoryCardUiState.buildKey = '';
      root.__omegaV2FactoryCardUiState.buildMaterialsExpanded = false;
    }
    model.factoryCardUiState = root.__omegaV2FactoryCardUiState;
    if (options.factoryView === 'assets' || options.factoryView === 'types') {
      root.__omegaV2IndustryFactoryView = options.factoryView;
      root.__omegaV2IndustryFactoryViewExplicit = true;
    }
    if (!root.__omegaV2IndustryFactoryViewExplicit) root.__omegaV2IndustryFactoryView = 'types';
    var factoryView = root.__omegaV2IndustryFactoryView === 'types' ? 'types' : 'assets';
    var content = '';
    if (active === 'factories') {
      content = model.factories.length ? '<div class="omega-v2-grid">' + model.factories.map(function (row) { return factoryCard(row, options); }).join('') + '</div>' : '<div class="omega-v2-empty">No factories are recorded for ' + esc(model.countryId || 'the selected country') + '.</div>';
    } else if (active === 'production-lines') {
      content = model.cycles.length ? '<div class="omega-v2-grid">' + model.cycles.map(function (cycle) {
        return '<article class="omega-v2-card"><h3 class="omega-v2-card-title">' + esc(cycle.factoryId) + '</h3><span class="omega-v2-status">' + esc(cycle.status || 'NOT_RECORDED') + '</span><div class="omega-v2-vehicle-stats"><div><span>Output quantity</span><strong>' + fmt(cycle.productionQuantity) + '</strong></div><div><span>Start date</span><strong>' + esc(cycle.startDate || 'Not recorded') + '</strong></div><div><span>Finish date</span><strong>' + esc(cycle.finishDate || 'Not recorded') + '</strong></div><div><span>Source batches</span><strong>' + fmt(Array.isArray(cycle.sourceBatchIds) ? cycle.sourceBatchIds.length : null) + '</strong></div></div></article>';
      }).join('') + '</div>' : '<div class="omega-v2-empty">No tracked production cycles were returned by this country’s industrial state.</div>';
    } else if (active === 'inventory') {
      content = factoryInputPanelMarkup(model);
    } else if (active === 'research') {
      var researchRows = model.researchProjects.map(function (item) { return Object.assign({ recordType:'RESEARCH' }, item || {}); })
        .concat(model.technologyTransfers.map(function (item) { return Object.assign({ recordType:'TECHNOLOGY TRANSFER' }, item || {}); }))
        .concat(model.technologyContracts.map(function (item) { return Object.assign({ recordType:'TECHNOLOGY CONTRACT' }, item || {}); }));
      var researchCards = researchRows.map(function (item) {
        var title = item.technologyName || item.name || item.title || item.technologyId || item.projectId || item.id || item.contractId || 'Technology record';
        var progress = num(item.progressPct !== undefined ? item.progressPct : item.progress);
        var progressText = progress === null ? 'Not recorded' : fmt(Math.max(0, Math.min(100, progress)), '%');
        var progressUnits = item.progressUnits !== undefined || item.requiredUnits !== undefined
          ? fmt(item.progressUnits) + ' / ' + fmt(item.requiredUnits) : 'Not recorded';
        var source = item.donorCountryName || item.donorCountryId || item.sourceCountryId || item.source || 'Not recorded';
        return '<article class="omega-v2-card"><div class="omega-v2-card-header"><div><h3 class="omega-v2-card-title">' + esc(title) + '</h3><div class="omega-v2-card-meta">' + esc(item.recordType) + ' · ' + esc(item.technologyId || item.projectId || item.id || 'ID not recorded') + '</div></div><span class="omega-v2-status">' + esc(item.status || 'NOT_RECORDED') + '</span></div><div class="omega-v2-vehicle-stats"><div><span>Progress</span><strong>' + progressText + '</strong></div><div><span>Progress units</span><strong>' + progressUnits + '</strong></div><div><span>Research / transfer rate</span><strong>' + fmt(item.researchRate !== undefined ? item.researchRate : item.transferRate) + '</strong></div><div><span>Source / donor</span><strong>' + esc(source) + '</strong></div><div><span>Started turn</span><strong>' + fmt(item.startedTurn !== undefined ? item.startedTurn : item.requestedTurn) + '</strong></div><div><span>Completed turn</span><strong>' + fmt(item.completedTurn) + '</strong></div></div></article>';
      }).join('');
      var capabilityCards = model.technologyCapabilities.map(function (item) {
        var title = item.technologyName || item.name || item.technologyId || item.capabilityId || item.id || 'Technology capability';
        return '<article class="omega-v2-card"><div class="omega-v2-card-header"><h3 class="omega-v2-card-title">' + esc(title) + '</h3><span class="omega-v2-status">' + esc(item.status || item.sourceType || 'UNLOCKED') + '</span></div><div class="omega-v2-vehicle-stats"><div><span>Capability ID</span><strong>' + esc(item.capabilityId || item.technologyId || item.id || 'Not recorded') + '</strong></div><div><span>Source</span><strong>' + esc(item.sourceType || item.source || 'Not recorded') + '</strong></div><div><span>Completed turn</span><strong>' + fmt(item.completedTurn) + '</strong></div></div></article>';
      }).join('');
      content = '<section><h3 class="omega-v2-section-title">Research projects and technology transfers</h3>' +
        (researchCards ? '<div class="omega-v2-grid">' + researchCards + '</div>' : '<div class="omega-v2-empty">No research or technology-transfer records are recorded for ' + esc(model.countryId || 'the selected country') + '.</div>') +
        '<h3 class="omega-v2-section-title">Unlocked technology capabilities</h3>' +
        (capabilityCards ? '<div class="omega-v2-grid">' + capabilityCards + '</div>' : '<div class="omega-v2-empty">No technology capabilities are recorded for this country.</div>') +
        '<p class="omega-v2-source">Research, transfer and capability rows are read from this country’s authoritative resource state. Foreign-country project rows are not copied into this view.</p></section>';
    } else if (active === 'national-inventory') {
      content = factoryStockPanelMarkup(model);
    } else {
      content = model.projects.length ? '<div class="omega-v2-grid">' + model.projects.slice().reverse().map(function (project) {
        return '<article class="omega-v2-card"><div class="omega-v2-card-header"><h3 class="omega-v2-card-title">' + esc(project.projectType || 'Industrial project') + '</h3><span class="omega-v2-status">' + esc(project.status || 'NOT_RECORDED') + '</span></div><div class="omega-v2-vehicle-stats"><div><span>Project ID</span><strong>' + esc(project.projectId || 'Not recorded') + '</strong></div><div><span>Site / factory</span><strong>' + esc(project.siteId || project.factoryId || 'Not recorded') + '</strong></div><div><span>Start turn</span><strong>' + fmt(project.createdTurn !== undefined ? project.createdTurn : project.startedTurn) + '</strong></div><div><span>Cost</span><strong>' + (num(project.costUsd) === null ? 'Not recorded' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num(project.costUsd))) + '</strong></div></div></article>';
      }).join('') + '</div>' : '<div class="omega-v2-empty">No industrial or construction project rows are recorded for this country.</div>';
    }

    root.classList.add('omega-v2-screen');
    var tabLabels = {
      factories:'Factories',
      'production-lines':'Production lines',
      inventory:'Input',
      'national-inventory':'Stock',
      research:'Research & technology',
      projects:'Industrial projects'
    };
    var activeLabel = tabLabels[active] || 'Factory production';
    if (active !== 'factories') root.__omegaV2IndustryNotice = '';
    var compactTabs = '<header class="fp-top" aria-label="Factory production navigation">' +
      '<div class="fp-logo" aria-hidden="true"><svg class="fp-ic" viewBox="0 0 24 24"><path d="M3 21V9l6 3V8l6 4V6l6 3v12Z"/><path d="M6 21v-5m5 5v-5m5 5v-5M3 21h18"/></svg></div>' +
      '<div class="fp-top-identity"><span>OMEGA / INDUSTRIAL SYSTEMS</span><strong>FACTORY PRODUCTION</strong><small>COUNTRY: ' + esc(model.countryId || 'Not recorded') + ' · ' + (model.canOperateSelectedCountry ? 'PLAYER CONTROL' : 'REFERENCE VIEW') + '</small></div>' +
      '<nav class="omega-v2-factory-tabs fp-tabs" aria-label="Industrial panels">' +
      tabButton('factories', 'Factories', active) +
      tabButton('production-lines', 'Lines', active) +
      tabButton('inventory', 'Input', active) +
      tabButton('national-inventory', 'Stock', active) +
      tabButton('research', 'R&D', active) +
      tabButton('projects', 'Projects', active) +
      (active === 'factories' ? '<button type="button" class="omega-v2-button fp-view-toggle" data-omega-v2-factory-view-toggle aria-label="' +
        (factoryView === 'types' ? 'Show factory details' : 'Show factory type totals') + '">' +
        (factoryView === 'types' ? 'Details' : 'Type totals') + '</button>' : '') +
      '</nav></header>';
    var factoryCards = model.factories.length
      ? model.factories.map(function (row) {
          return factoryCard(row, Object.assign({}, options, {
            model: model,
            selectedFactoryId: root.__omegaV2SelectedFactoryId || '',
            onOpenFactory: options.onOpenFactory
          }));
        }).join('')
      : '<div class="omega-v2-factory-empty">No factories are recorded for ' + esc(model.countryId || 'the selected country') + '.</div>';
    var summaryMarkup = '<div class="fp-summary" aria-label="Selected country production summary">' +
      '<div class="fp-summary-item"><span>COUNTRY</span><strong>' + esc(model.countryId || 'Not recorded') + '</strong></div>' +
      '<div class="fp-summary-item"><span>FACTORIES</span><strong>' + fmt(model.factoryCount) + '</strong></div>' +
      '<div class="fp-summary-item"><span>FACTORY TYPES</span><strong>' + fmt(model.factoryTypeCatalog.length) + '</strong></div>' +
      '<div class="fp-summary-item"><span>PRODUCTION CYCLES</span><strong>' + fmt(model.cycles.length) + '</strong></div>' +
      '</div>';
    var panelBody = active === 'factories'
      ? (factoryView === 'types' ? factoryTypeCatalogMarkup(model) : '<div class="omega-v2-factory-deck">' + factoryCards + '</div>')
      : '<div class="fp-content" data-omega-v2-industry-content data-active-tab="' + esc(active) + '">' +
          '<header class="fp-content-heading"><div><span>OMEGA / COUNTRY DATA</span><strong>' + esc(activeLabel) + '</strong></div>' +
          '<span class="fp-content-country">' + esc(model.countryId || 'Country not selected') + '</span></header>' +
          '<div class="fp-content-body">' + content + '</div>' +
        '</div>';
    root.innerHTML = '<section class="omega-v2-shell omega-v2-industry omega-v2-industry--factory-home" data-factory-stock-input-ui="v2">' +
      '<div class="omega-v2-factory-command fp-stage" data-glow="hover" data-active-tab="' + esc(active) + '" data-factory-view="' + esc(active === 'factories' ? factoryView : 'assets') + '" aria-label="Factory production control">' +
      '<img class="omega-v2-factory-backdrop" src="assets/ui-photos/industrial-production-line.webp" alt="" aria-hidden="true" loading="lazy" decoding="async" width="1280" height="720">' +
      '<a class="omega-v2-factory-photo-credit" href="https://commons.wikimedia.org/wiki/File:Industrial_production_line_operating_in_a_large_modern_factory.jpg" target="_blank" rel="noopener noreferrer" aria-label="Photo credit: Shixart1985. CC BY 2.0 license. Image resized and converted to WebP.">Photo: <span class="omega-v2-factory-photo-author">Shixart1985</span></a><a class="omega-v2-factory-photo-license" href="https://creativecommons.org/licenses/by/2.0/" target="_blank" rel="license noopener noreferrer" aria-label="Creative Commons Attribution 2.0 license">CC BY 2.0</a><span class="omega-v2-factory-photo-credit__changes">Image resized and converted to WebP.</span>' +
      (root.__omegaV2IndustryNotice ? '<div class="omega-v2-factory-notice" role="status">' + esc(root.__omegaV2IndustryNotice) + '</div>' : '') +
      compactTabs + summaryMarkup + panelBody + '<div class="fp-deck" aria-hidden="true"></div></div>' +
      (root.__omegaV2IndustryBuildFactoryType ? factoryProjectModal(model, root.__omegaV2IndustryBuildFactoryType) : '') + '</section>';

    if (!root.__omegaV2IndustryBound && typeof root.addEventListener === 'function') {
      root.addEventListener('error', function (event) {
        var image = event && event.target;
        if (!image || !image.matches || !image.matches('[data-omega-v2-factory-svg]')) return;
        var fallback = image.getAttribute('data-fallback') || '';
        if (!fallback || image.getAttribute('src') === fallback) return;
        image.setAttribute('src', fallback);
      }, true);
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;

        var viewToggle = target.closest('[data-omega-v2-factory-view-toggle]');
        if (viewToggle && root.contains(viewToggle)) {
          root.__omegaV2IndustryFactoryView = factoryView === 'types' ? 'assets' : 'types';
          root.__omegaV2IndustryFactoryViewExplicit = true;
          root.__omegaV2FactoryCardUiState.expandedKey = '';
          root.__omegaV2FactoryCardUiState.buildKey = '';
          root.__omegaV2FactoryCardUiState.sections = Object.create(null);
          root.__omegaV2FactoryCardUiState.buildMaterialsExpanded = false;
          root.__omegaV2IndustryNotice = '';
          scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories', factoryView: root.__omegaV2IndustryFactoryView }));
          return;
        }
        var cancelProject = target.closest('[data-omega-v2-factory-project-cancel]');
        if (cancelProject && root.contains(cancelProject)) {
          root.__omegaV2IndustryBuildFactoryType = '';
          root.__omegaV2IndustryNotice = '';
          scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: root.__omegaV2IndustryTab || 'factories' }));
          return;
        }

        var factorySelect = target.closest('[data-omega-v2-factory-select]');        var cardDisclosure = target.closest('[data-omega-v2-factory-card-expand]');
        if (cardDisclosure && root.contains(cardDisclosure)) {
          var disclosureKey = cardDisclosure.getAttribute('data-card-key') || '';
          var cardState = root.__omegaV2FactoryCardUiState || (root.__omegaV2FactoryCardUiState = { expandedKey:'', buildKey:'', sections:Object.create(null), buildMaterialsExpanded:false });
          cardState.expandedKey = cardState.expandedKey === disclosureKey ? '' : disclosureKey;
          cardState.buildKey = '';
          cardState.sections = Object.create(null);
          cardState.buildMaterialsExpanded = false;
          scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab:'factories' }));
          return;
        }

        var sectionToggle = target.closest('[data-omega-v2-factory-section-toggle]');
        if (sectionToggle && root.contains(sectionToggle)) {
          var sectionCardKey = sectionToggle.getAttribute('data-card-key') || '';
          var sectionName = sectionToggle.getAttribute('data-section') || '';
          var sectionState = root.__omegaV2FactoryCardUiState || (root.__omegaV2FactoryCardUiState = { expandedKey:'', buildKey:'', sections:Object.create(null), buildMaterialsExpanded:false });
          var sectionStateKey = sectionCardKey + ':' + sectionName;
          sectionState.sections[sectionStateKey] = !sectionState.sections[sectionStateKey];
          scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab:'factories' }));
          return;
        }

        var buildDetails = target.closest('[data-omega-v2-factory-build-details]');
        if (buildDetails && root.contains(buildDetails) && !buildDetails.disabled) {
          var buildState = root.__omegaV2FactoryCardUiState || (root.__omegaV2FactoryCardUiState = { expandedKey:'', buildKey:'', sections:Object.create(null), buildMaterialsExpanded:false });
          buildState.buildKey = buildDetails.getAttribute('data-factory-card-key') || '';
          buildState.expandedKey = '';
          buildState.sections = Object.create(null);
          buildState.buildMaterialsExpanded = false;
          root.__omegaV2IndustryNotice = '';
          scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab:'factories' }));
          return;
        }

        var buildDetailsClose = target.closest('[data-omega-v2-factory-build-details-close]');
        if (buildDetailsClose && root.contains(buildDetailsClose)) {
          var closeState = root.__omegaV2FactoryCardUiState || {};
          closeState.buildKey = '';
          closeState.buildMaterialsExpanded = false;
          root.__omegaV2IndustryNotice = '';
          scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab:'factories' }));
          return;
        }

        var buildMaterialsToggle = target.closest('[data-omega-v2-factory-build-materials]');
        if (buildMaterialsToggle && root.contains(buildMaterialsToggle)) {
          var materialsState = root.__omegaV2FactoryCardUiState || {};
          materialsState.buildMaterialsExpanded = !materialsState.buildMaterialsExpanded;
          scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab:'factories' }));
          return;
        }

        var factorySelect = target.closest('[data-omega-v2-factory-select]');
        if (factorySelect && root.contains(factorySelect)) {
          root.__omegaV2SelectedFactoryId = factorySelect.getAttribute('data-omega-v2-factory-select') || '';
          root.__omegaV2IndustryNotice = '';
          scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
          return;
        }

        var buildFactory = target.closest('[data-omega-v2-factory-build]');
        if (buildFactory && root.contains(buildFactory) && !buildFactory.disabled) {
          var selectedFactoryType = normalizeFactoryType(buildFactory.getAttribute('data-factory-type') || '', safeCatalog() || {});
          if (!selectedFactoryType) {
            root.__omegaV2IndustryNotice = 'This factory type is not registered in the canonical catalogue.';
            scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
            return;
          }
          root.__omegaV2IndustryBuildFactoryType = selectedFactoryType;
          root.__omegaV2IndustryNotice = '';
          scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
          return;
        }

        var destroyFactory = target.closest('[data-omega-v2-factory-destroy]');
        if (destroyFactory && root.contains(destroyFactory) && !destroyFactory.disabled) {
          var destroyModel = root.__omegaV2IndustryModel || model;
          var factoryIdToDestroy = destroyFactory.getAttribute('data-omega-v2-factory-destroy') || '';
          var industrialNetwork = safeNetwork();
          if (!industrialNetwork || typeof industrialNetwork.decommissionFactory !== 'function') {
            root.__omegaV2IndustryNotice = 'Factory decommissioning is unavailable; no game state was changed.';
            scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
            return;
          }
          var confirmed = typeof g.confirm === 'function' && g.confirm('Decommission this factory? Active production will stop. Historical records will be preserved.');
          if (!confirmed) return;
          var decommissionResult = industrialNetwork.decommissionFactory({
            countryId: destroyModel.countryId, factoryId: factoryIdToDestroy, confirmed: true
          });
          var decommissionStatus = String(decommissionResult && decommissionResult.status || '').toUpperCase();
          root.__omegaV2IndustryNotice = decommissionStatus === 'DECOMMISSIONED'
            ? 'Factory decommissioned. Production stopped; history preserved.'
            : 'Factory unchanged. ' + String(decommissionResult && (decommissionResult.reason || decommissionResult.status) || 'Runtime rejected the request').replace(/_/g, ' ').toLowerCase() + '.';
          root.__omegaV2SelectedFactoryId = '';
          scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
          return;
        }
        var tab = target.closest('[data-omega-v2-industry-tab]');
        if (tab && root.contains(tab)) {
          root.__omegaV2IndustryTab = tab.getAttribute('data-omega-v2-industry-tab');
          root.__omegaV2FactoryCardUiState.expandedKey = '';
          root.__omegaV2FactoryCardUiState.buildKey = '';
          root.__omegaV2FactoryCardUiState.sections = Object.create(null);
          root.__omegaV2FactoryCardUiState.buildMaterialsExpanded = false;
          scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: root.__omegaV2IndustryTab }));
          return;
        }
        var commandAction = target.closest('[data-omega-v2-industry-action]');
        if (commandAction && root.contains(commandAction) && !commandAction.disabled) {
          var activeModel = root.__omegaV2IndustryModel || model;
          var actionName = commandAction.getAttribute('data-omega-v2-industry-action');
          if (actionName === 'open-mines' || actionName === 'open-extraction') {
            var mineUi = g.OmegaResourceMineManagementUI || (g.Omega && g.Omega.ResourceMineManagementUI);
            if (mineUi && typeof mineUi.open === 'function') {
              var selected = activeModel.countryId;
              if (actionName === 'open-extraction' && activeModel.canOperateSelectedCountry) mineUi.open('my-mines', selected);
              else mineUi.open('mines', selected);
            } else {
              var app = g.OmegaUIV2App;
              if (app && typeof app.navigate === 'function') app.navigate(root.closest('.omega-v2-app-root') || root, 'resources');
              else if (typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function') {
                g.dispatchEvent(new g.CustomEvent('OMEGA_OPEN_RESOURCE_MINE_MANAGEMENT', { detail: { countryId: activeModel.countryId, view: actionName === 'open-extraction' ? 'my-mines' : 'mines' } }));
              }
            }
            return;
          }
          if (actionName === 'factory-projects') {
            root.__omegaV2IndustryTab = 'projects';
            scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'projects' }));
            return;
          }
          if (actionName === 'research') {
            root.__omegaV2IndustryTab = 'research';
            scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'research' }));
            return;
          }
        }
        var factory = target.closest('[data-omega-v2-open-factory]');
        if (factory && root.contains(factory) && !factory.disabled) {
          var callback = root.__omegaV2IndustryOptions && root.__omegaV2IndustryOptions.onOpenFactory;
          if (typeof callback === 'function') callback(factory.getAttribute('data-omega-v2-open-factory'), root.__omegaV2IndustryModel || model);
        }
      });
      root.addEventListener('submit', async function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;
        var form = target.closest('[data-omega-v2-factory-project-form]');
        if (!form || !root.contains(form)) return;
        if (typeof event.preventDefault === 'function') event.preventDefault();
        function valueOf(name) {
          var control = form.elements && form.elements[name];
          return control && control.value !== undefined ? String(control.value).trim() : '';
        }
        function positiveNumber(name) {
          var raw = valueOf(name);
          if (!raw) return null;
          var parsed = Number(raw);
          return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        }
        var activeModel = root.__omegaV2IndustryModel || model;
        var catalog = safeCatalog() || {};
        var type = normalizeFactoryType(valueOf('factoryType'), catalog) || '';
        var modalType = normalizeFactoryType(root.__omegaV2IndustryBuildFactoryType, catalog) || '';
        if (!type || type !== modalType) {
          root.__omegaV2IndustryNotice = 'Construction cancelled: the selected factory type changed.';
          root.__omegaV2IndustryBuildFactoryType = '';
          scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
          return;
        }
        if (!activeModel.canOperateSelectedCountry) {
          root.__omegaV2IndustryNotice = 'Construction blocked: only the active player country may start factory projects.';
          scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
          return;
        }
        var network = safeNetwork();
        if (!network || typeof network.startFactoryProject !== 'function') {
          root.__omegaV2IndustryNotice = 'Factory construction runtime is unavailable. No game state was changed.';
          scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
          return;
        }
        var request = {
          countryId: activeModel.countryId, factoryType: type,
          requestId: 'OMEGA-UI-V2-FACTORY:' + String(activeModel.countryId || '') + ':' + type + ':' + Date.now()
        };
        var recipeId = valueOf('recipeId');
        var resourceId = valueOf('resourceId');
        var cost = positiveNumber('cost');
        var capacityPerDay = positiveNumber('capacityPerDay');
        var buildDays = positiveNumber('buildDays');
        if (recipeId) request.recipeId = recipeId;
        if (resourceId) request.resourceId = resourceId;
        if (cost !== null) request.cost = cost;
        if (capacityPerDay !== null) request.capacityPerDay = capacityPerDay;
        if (buildDays !== null) request.buildDays = buildDays;
        try {
          if (typeof network.loadCatalog === 'function') await network.loadCatalog();
          var result = network.startFactoryProject(request);
          var status = String(result && result.status || '').toUpperCase();
          if (status === 'UNDER_CONSTRUCTION' && String(result.projectType || '') === 'FACTORY_CONSTRUCTION') {
            root.__omegaV2IndustryBuildFactoryType = '';
            root.__omegaV2IndustryFactoryView = 'assets';
            root.__omegaV2IndustryFactoryViewExplicit = true;
            scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'projects', factoryView: 'assets' }));
          } else {
            var reason = String(result && (result.reason || result.status) || 'FACTORY_PROJECT_NOT_STARTED').replace(/_/g, ' ').toLowerCase();
            root.__omegaV2IndustryNotice = 'Factory project not started. ' + reason + '. The runtime did not confirm construction.';
            scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
          }
        } catch (error) {
          root.__omegaV2IndustryNotice = 'Factory construction failed safely: ' + String(error && error.message || error || 'runtime error') + '.';
          scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
        }
      });
      root.addEventListener('keydown', function (event) {
        if (!event || event.key !== 'Escape' || !root.__omegaV2IndustryBuildFactoryType) return;
        root.__omegaV2IndustryBuildFactoryType = '';
        root.__omegaV2IndustryNotice = '';
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
        scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: root.__omegaV2IndustryTab || 'factories' }));
      });
      root.__omegaV2IndustryBound = true;
    }
    if (!root.__omegaV2IndustryEventsBound && typeof g.addEventListener === 'function') {
      ['OMEGA_RESOURCE_EXTRACTION_COMPLETED','OMEGA_RESOURCE_SITE_FLOW_DISPATCHED','OMEGA_RESOURCE_INVENTORY_CHANGED',
       'OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE','OMEGA_RESOURCE_PROCESSING_COMPLETED','OMEGA_RESOURCE_TECHNOLOGY_PROJECT_STARTED',
       'OMEGA_INFRASTRUCTURE_PROJECT_STARTED','OMEGA_RESOURCE_MINE_PROJECT_STARTED','OMEGA_RESOURCE_MINE_COMMISSIONED',
       'OMEGA_RESOURCE_MINE_CAPACITY_CHANGED','OMEGA_SIMULATION_TURN_COMMITTED',
       'OMEGA_FACTORY_CAPACITY_CHANGED','OMEGA_FACTORY_DECOMMISSIONED',
       'OMEGA_COUNTRY_STARTING_FACTORY_ASSETS_REGISTERED','OMEGA_COUNTRY_FACTORY_STARTING_BASELINE_READY','OMEGA_COUNTRY_FACTORY_STARTING_BASELINE_INITIALIZED',
       ].forEach(function (eventName) {
        g.addEventListener(eventName, function () {
          if (!root.querySelector || !root.querySelector('.omega-v2-industry-command, .omega-v2-factory-command')) return;
          scheduleRender(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: root.__omegaV2IndustryTab || 'factories' }));
        });
      });
      root.__omegaV2IndustryEventsBound = true;
    }
    root.__omegaV2IndustryOptions = options;
    root.__omegaV2IndustryModel = model;
    if (active !== 'factories') root.__omegaV2IndustryNotice = '';
    root.__omegaV2IndustryTab = active;
    try {
      var visuals = g.OmegaFactoryVisualCatalog;
      if (visuals && typeof visuals.ready === 'function') visuals.ready().then(function () { if (typeof visuals.refresh === 'function') visuals.refresh(root); }).catch(function () {});
    } catch (_) {}
    return { ok: true, model: model };
  }

  g.OmegaUIV2Industry = Object.freeze({ version: '1.1.0', buildViewModel: buildViewModel, render: render, resourceIconPath: factoryResourceIconPath, productIconVisualMarkup: factoryProductIconVisualMarkup, productIdentityMarkup: factoryProductIdentityMarkup });
})(typeof window !== 'undefined' ? window : globalThis);
