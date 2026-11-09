const fs = require('fs');

// Load datasets
const res1 = JSON.parse(fs.readFileSync('./resources.json', 'utf8'));
const res2 = JSON.parse(fs.readFileSync('./resources_2.json', 'utf8'));
const onto = JSON.parse(fs.readFileSync('./resource_ontology.json', 'utf8'));
const eco = JSON.parse(fs.readFileSync('./economy.json', 'utf8'));
const pop = JSON.parse(fs.readFileSync('./population.json', 'utf8'));
const min = JSON.parse(fs.readFileSync('./ministers.json', 'utf8'));
const lex = JSON.parse(fs.readFileSync('./offline_lexicon.json', 'utf8'));

const allCountries = Object.assign({}, res1.GSRSK_Master_CountryProfiles_v14.countryProfiles, res2.GSRSK_Master_CountryProfiles_v14.countryProfiles);

console.log("Testing Minister Cognition Query Resolver with live data:");

function resolveCountryCode(text) {
  const t = text.toLowerCase();
  if (t.includes('bangladesh') || t.includes('বাংলাদেশ') || t.includes('bgd')) return 'BGD';
  if (t.includes('united states') || t.includes('america') || t.includes('যুক্তরাষ্ট্র') || t.includes('usa')) return 'USA';
  if (t.includes('china') || t.includes('চীন') || t.includes('chn')) return 'CHN';
  if (t.includes('india') || t.includes('ভারত') || t.includes('ind')) return 'IND';
  if (t.includes('russia') || t.includes('রাশিয়া') || t.includes('rus')) return 'RUS';
  if (t.includes('saudi') || t.includes('সৌদি') || t.includes('sau')) return 'SAU';
  if (t.includes('chile') || t.includes('চিলি') || t.includes('chl')) return 'CHL';
  if (t.includes('congo') || t.includes('কঙ্গো') || t.includes('cod')) return 'COD';
  if (t.includes('australia') || t.includes('অস্ট্রেলিয়া') || t.includes('aus')) return 'AUS';
  return 'BGD';
}

console.log("Resolved country for 'How many iron Mine in Bangladesh':", resolveCountryCode('How many iron Mine in Bangladesh'));
