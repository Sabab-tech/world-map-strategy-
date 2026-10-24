/* OMEGA UI v2 ministry visual registry.
 * Every image is a local repository asset. Visuals are presentation only and do not imply ownership or readiness.
 */
(function (g) {
  'use strict';
  var records = {
    cabinet_council: { title:'Executive Cabinet', subtitle:'National executive coordination', category:'Governance', image:'assets/ui-photos/bangladesh-parliament.webp', alt:'Bangladesh Parliament building', gallery:[] },
    trade: { title:'Trade & Commerce', subtitle:'International trade, shipping and exports', category:'Economy', image:'assets/ui-photos/container-ship.webp', alt:'Container ship in international trade', gallery:['assets/images (18).jpeg','assets/futuristic-digital-visualization-global-import-260nw-2615199881.jpg'] },
    production: { title:'Production & Industry', subtitle:'Factories, manufacturing and production lines', category:'Industry', image:'assets/factories/omega_factory_atlas_01.webp', alt:'OMEGA factory atlas reference image', gallery:['assets/ui-photos/industrial-production-line.webp','assets/factories/omega_factory_atlas_02.webp'] },
    taxes: { title:'National Revenue & Tax', subtitle:'Tax administration and public revenue', category:'Economy', image:'assets/economy_bg.jpg.jpg', alt:'Economy and finance background', gallery:[] },
    central_bank: { title:'Central Bank', subtitle:'Monetary policy and currency stability', category:'Finance', image:'assets/economy_bg.jpg.jpg', alt:'Economy and finance background', gallery:[] },
    laws: { title:'Justice & Law', subtitle:'Constitution, courts and legal administration', category:'Governance', image:'assets/images (16).jpeg', alt:'Legal scales and gavel, user-provided reference image', gallery:[] },
    education: { title:'Education & Talent', subtitle:'Education, universities and skills', category:'Social', image:'assets/ui-photos/dhaka-skyline.webp', alt:'Dhaka skyline as a civic reference image', gallery:[] },
    infrastructure: { title:'Infrastructure & Logistics', subtitle:'Transport, ports and national networks', category:'Infrastructure', image:'assets/images (17).jpeg', alt:'Transport and logistics network, user-provided reference image', gallery:['assets/ui-photos/container-ship.webp'] },
    science_research: { title:'Science & Research', subtitle:'Science, technology and advanced research', category:'Science', image:'assets/ui-photos/wind-farm.webp', alt:'Wind energy technology infrastructure', gallery:['assets/China_Military_Facilities_What_Satellites_Reveal_f6efe2c1b2.jpg','assets/1776286900118.png'] },
    defense: { title:'Defense & Armed Forces', subtitle:'National defense and military readiness', category:'Defense', image:'assets/images (15).jpeg', alt:'Fighter aircraft, user-provided reference image', logo:'assets/Military_Ministry_Logo_Concept_A.png.jpg', logoAlt:'Uploaded Defense Ministry logo concept', gallery:['assets/images (6).jpeg','assets/ui-photos/uss-nimitz.webp','assets/vecteezy_ai-generated_futuristic_army_combatants_in_a_firefight_with_35839258.jpg'] },
    foreign_affairs: { title:'Foreign Affairs', subtitle:'Diplomacy and international relations', category:'Diplomacy', image:'assets/ui-photos/un-assembly-building.webp', alt:'United Nations General Assembly building', logo:'assets/IMG_20260703_180105.jpg', logoAlt:'Uploaded Ministry of Foreign Affairs seal', gallery:[] },
    energy_mining: { title:'Energy & Mining', subtitle:'Natural resources, energy and mines', category:'Resources', image:'assets/ui-photos/open-pit-mine.webp', alt:'Open-pit mine reference image', gallery:['assets/ui-photos/geelong-oil-refinery.webp'] },
    intelligence_cyber: { title:'Intelligence & Cyber', subtitle:'Intelligence analysis, satellite and cyber systems', category:'Security', image:'assets/China_Military_Facilities_What_Satellites_Reveal_f6efe2c1b2.jpg', alt:'Satellite view of military facilities, user-provided reference image', gallery:['assets/images (14).jpeg','assets/images (11).jpeg','assets/1783055273164.jpg','assets/1783068102501.jpg'] },
    agriculture_food: { title:'Agriculture & Food', subtitle:'Agriculture and food security', category:'Agriculture', image:'assets/ui-photos/wheat-field.webp', alt:'Wheat field and food production', gallery:[] },
    interior_security: { title:'Interior & Public Safety', subtitle:'Civil administration, police and public safety', category:'Security', image:'assets/ui-photos/bangladesh-police-headquarters.webp', alt:'Bangladesh Police Headquarters', gallery:[] },
    health_welfare: { title:'Health & Welfare', subtitle:'Medical services and public welfare', category:'Social', image:'assets/ui-photos/chittagong-hospital.webp', alt:'Chittagong International Medical College and Hospital', logo:'assets/ministers/health.svg', logoAlt:'Health ministry emblem', gallery:[] },
    treasury_finance: { title:'Treasury & Finance', subtitle:'Budget, treasury and national assets', category:'Finance', image:'assets/economy_bg.jpg.jpg', alt:'Economy and finance background', gallery:[] },
    mega_projects: { title:'Mega Projects', subtitle:'Strategic infrastructure and major projects', category:'Infrastructure', image:'assets/ui-photos/hydroelectric-plant.webp', alt:'Hydroelectric infrastructure project', gallery:['assets/factories/omega_factory_atlas_03.webp'] }
  };
  var ids = Object.freeze(Object.keys(records));
  function get(id) { var key = String(id || '').trim(); return Object.prototype.hasOwnProperty.call(records, key) ? records[key] : null; }
  function list() { return ids.map(function (id) { return records[id]; }); }
  g.OmegaUIV2MinistryVisualRegistry = Object.freeze({ version:'1.0.0', ids:ids, count:ids.length, get:get, list:list });
})(typeof window !== 'undefined' ? window : globalThis);