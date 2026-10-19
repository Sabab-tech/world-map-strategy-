/* OMEGA HOME MINISTRY POLICE UI v1.0.0
 * Additive UI extension for the existing cabinet adapter.
 * Uses the authoritative HomeMinistry engine instead of UI-local counters.
 */
(function (g) {
  'use strict';
  const ui = g.OMEGA_UI_ADAPTER;
  if (!ui) return;
  const STYLE_ID = 'omega-home-police-ui-v1';
  let hostedBodyNode = null;

  function engine() {
    const value = g.OmegaHomeMinistryEngine || g.Omega && g.Omega.HomeMinistry;
    if (value && typeof value.init === 'function') value.init();
    return value || null;
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function money(e, value) {
    return e && typeof e.formatMoney === 'function' ? e.formatMoney(value) : 'Unavailable';
  }
  function formatDuration(ms) {
    const total = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const mins = Math.floor((total % 3600) / 60);
    if (days > 0) return days + 'd ' + hours + 'h ' + mins + 'm';
    if (hours > 0) return hours + 'h ' + mins + 'm';
    return mins + 'm';
  }
  function failMessage(result) {
    const reason = result && result.reason || 'ACTION_FAILED';
    const map = {
      TREASURY_DATA_UNAVAILABLE: 'The country treasury balance is not available. No money was invented or charged.',
      INSUFFICIENT_TREASURY: 'Insufficient treasury funds. Available: ' + money(engine(), result && result.balance) + '; required: ' + money(engine(), result && result.cost) + '.',
      VEHICLE_TIER_LOCKED: 'This vehicle tier is locked. Complete the current tier order for 180 simulation days before advancing.',
      PROCUREMENT_ALREADY_IN_PROGRESS: 'A vehicle order is already in progress. Complete delivery before starting another order.',
      ACADEMY_LEVEL_TOO_LOW: 'Training quality cannot exceed the current Police Academy level. Upgrade the academy first.',
      RESEARCH_ALREADY_IN_PROGRESS: 'Another police research project is already in progress.',
      TACTIC_ALREADY_RESEARCHED: 'This tactical doctrine has already been researched.',
      INTELLIGENCE_AGENT_REQUIRED: 'Recruit at least one intelligence agent before starting this research.',
      MINIMUM_FORCE_REQUIRED: 'At least one police officer must remain in service.',
      PLAYER_COUNTRY_UNAVAILABLE: 'The active country could not be resolved.',
      STATE_COMMAND_FAILED: 'The authoritative ministry state could not be saved. Treasury changes were rolled back.'
    };
    return map[reason] || (result && result.message) || ('The action was not completed: ' + reason + '.');
  }
  function report(result, successTitle, successText) {
    if (result && result.ok) ui.showAdvisePopup(successTitle || 'MINISTERIAL ORDER ACCEPTED', successText || 'The command has been committed to the country state.');
    else ui.showAdvisePopup('ORDER NOT EXECUTED', failMessage(result));
  }
  const VEHICLE_ART = Object.freeze({
    cityline:{body:'M24 102 L34 87 L62 82 L86 59 Q92 53 104 53 H150 Q161 54 174 75 L208 82 Q224 86 234 101 L235 113 H22 Z',glass:'M84 78 L102 58 H126 V78 Z M132 58 H149 Q158 59 167 78 Z',wheels:[65,197],wheelR:16,siren:[119,49],stripe:'M29 94 L226 94 L231 101 L27 101 Z',addon:'<path d="M54 82 L72 82" stroke="#d8f5ff" stroke-width="2"/>',colors:['#355d86','#14263b','#4bdcff']},
    falcon:{body:'M18 103 L29 91 L60 86 L85 70 L112 62 L158 64 L179 80 L211 86 L238 100 L238 112 H19 Z',glass:'M90 77 L115 66 H137 V79 Z M142 66 L156 67 L171 79 H142 Z',wheels:[63,202],wheelR:15,siren:[121,59],stripe:'M25 96 L230 96 L234 102 L22 102 Z',addon:'<path d="M206 85 L225 83 L239 93 L237 98 L215 92 Z" fill="#dcecff" opacity=".8"/><path d="M38 84 L51 77" stroke="#d9e8f7" stroke-width="2"/>',colors:['#43678c','#172b41','#ff5d70']},
    ranger:{body:'M20 104 L30 85 L52 80 L65 55 Q71 49 86 49 H153 Q165 51 179 77 L212 82 L237 98 L237 114 H20 Z',glass:'M70 77 L78 57 H108 V77 Z M114 57 H151 Q160 59 168 77 Z',wheels:[62,200],wheelR:18,siren:[119,45],stripe:'M25 94 L230 94 L235 102 L23 102 Z',addon:'<path d="M72 48 H157 L165 53 H70 Z" fill="#d0b56d"/><path d="M30 81 L48 81" stroke="#e7ebd6" stroke-width="3"/>',colors:['#4f7059','#21352d','#edce69']},
    sentinel:{body:'M20 103 L30 86 L52 82 L60 47 Q63 42 76 42 H151 Q160 43 167 58 L178 79 L213 85 L236 99 L236 114 H20 Z',glass:'M68 76 L73 50 H105 V76 Z M111 50 H148 Q154 50 159 62 L166 76 Z',wheels:[61,199],wheelR:17,siren:[117,38],stripe:'M23 94 L231 94 L235 102 L22 102 Z',addon:'<path d="M69 42 H153" stroke="#dceaf7" stroke-width="4"/><path d="M177 83 H210" stroke="#d0f4fa" stroke-width="2"/>',colors:['#61788d','#26384a','#5be2ed']},
    bastion:{body:'M20 104 L28 88 L50 83 L56 58 Q59 52 70 52 H157 L179 78 L212 84 L236 100 L236 115 H20 Z',glass:'M65 76 L70 59 H105 V76 Z M112 59 H151 L166 76 H112 Z',wheels:[61,199],wheelR:17,siren:[117,48],stripe:'M23 95 L231 95 L235 103 L22 103 Z',addon:'<path d="M52 82 L59 57 M173 77 L178 86" stroke="#c8d1da" stroke-width="3"/><path d="M80 88 L93 88" stroke="#efc95e" stroke-width="3"/>',colors:['#5a6572','#202b36','#f2c65b']},
    interceptor:{body:'M16 105 L31 95 L56 89 L86 74 L112 69 H158 L183 82 L211 87 L240 101 L240 111 H16 Z',glass:'M89 79 L115 73 H135 V82 Z M141 73 H157 L174 82 H141 Z',wheels:[62,204],wheelR:14,siren:[121,64],stripe:'M22 98 L231 98 L237 103 L20 103 Z',addon:'<path d="M31 91 L27 82 L41 84 L51 89 Z" fill="#f2f4fa"/><path d="M195 87 L211 78 L224 83 L218 88 Z" fill="#202a3c"/><path d="M20 110 H241" stroke="#a5c7e8" stroke-width="2"/>',colors:['#2d5d82','#12233a','#ff4d67']},
    terraguard:{body:'M19 103 L29 83 L53 78 L65 52 Q69 46 83 46 H151 L174 73 L210 79 L236 98 L236 114 H18 Z',glass:'M70 75 L78 53 H108 V75 Z M114 53 H149 L165 75 H114 Z',wheels:[60,199],wheelR:20,siren:[118,42],stripe:'M24 93 L230 93 L235 102 L22 102 Z',addon:'<path d="M66 43 H155 L166 47 H61 Z" fill="#e3cf77"/><path d="M47 80 L57 64 L60 80 Z" fill="#cfdbb6"/><circle cx="224" cy="91" r="3" fill="#f6d56f"/>',colors:['#667448','#293a2b','#f3d66c']},
    beacon:{body:'M20 104 L30 86 L55 82 L64 57 Q68 51 82 51 H151 L174 76 L211 82 L236 99 L236 114 H20 Z',glass:'M71 77 L79 57 H109 V77 Z M115 57 H148 L164 77 H115 Z',wheels:[61,199],wheelR:17,siren:[117,47],stripe:'M24 94 L230 94 L235 102 L22 102 Z',addon:'<path d="M130 45 L133 32 L139 32 L142 45" fill="#63d9ff" stroke="#d8f9ff" stroke-width="1.3"/><path d="M135 32 L135 25 M129 29 L141 29" stroke="#6be4ff" stroke-width="2"/><rect x="74" y="82" width="34" height="4" rx="2" fill="#6ce6ff"/>',colors:['#3e6784','#192f45','#5fe4ff']},
    civicshield:{body:'M13 104 L23 90 L37 87 L42 49 Q44 43 54 43 H174 Q183 44 188 57 L196 83 L224 87 L243 100 L243 115 H13 Z',glass:'M49 75 L52 50 H81 V75 Z M87 50 H118 V75 H87 Z M124 50 H160 Q169 50 173 61 L178 75 H124 Z',wheels:[54,202],wheelR:17,siren:[113,39],stripe:'M17 94 L238 94 L242 102 L16 102 Z',addon:'<path d="M43 43 H175" stroke="#b9c9d8" stroke-width="3"/><path d="M188 79 H216 L233 92 H196 Z" fill="#d3dce4"/><rect x="82" y="85" width="35" height="3" rx="1.5" fill="#f7ca59"/>',colors:['#596f82','#263746','#ffc84d']},
    ironwall:{body:'M13 103 L24 88 L48 82 L59 58 H147 L166 78 H194 L215 65 H226 L228 84 L244 98 L244 115 H13 Z',glass:'M64 63 H100 V77 H57 Z M107 63 H145 L157 77 H107 Z M191 70 H215 V82 H191 Z',wheels:[56,169,221],wheelR:16,siren:[113,52],stripe:'M17 93 L239 93 L243 102 L15 102 Z',addon:'<path d="M178 63 H218 L226 70 H178 Z" fill="#6f7f8d"/><path d="M211 65 L219 55 H229 L229 83" stroke="#dfe9f2" stroke-width="3"/><rect x="27" y="83" width="21" height="5" fill="#dfe9f2"/>',colors:['#5b6874','#27323d','#ff6c72']},
    aegis:{body:'M21 103 L31 88 L58 83 L79 62 H151 Q162 62 175 79 L208 83 L235 99 L235 113 H20 Z',glass:'M85 78 L99 66 H126 V78 Z M132 66 H150 Q159 67 168 78 H132 Z',wheels:[63,198],wheelR:15,siren:[117,57],stripe:'M25 94 L230 94 L234 102 L22 102 Z',addon:'<path d="M125 61 L130 47 H139 L143 61" stroke="#9effff" stroke-width="2" fill="none"/><circle cx="134" cy="45" r="4" fill="#6ff5ee"/><path d="M72 84 L94 84" stroke="#94fbff" stroke-width="3"/>',colors:['#248991','#143f4c','#91fff3']},
    nexus:{body:'M19 104 L30 85 L53 80 L66 53 Q70 47 84 47 H152 L176 75 L210 81 L237 99 L237 114 H19 Z',glass:'M71 76 L79 54 H110 V76 Z M116 54 H149 L166 76 H116 Z',wheels:[61,199],wheelR:18,siren:[117,43],stripe:'M23 94 L230 94 L235 102 L22 102 Z',addon:'<path d="M134 44 L138 26 L142 26 L146 44" stroke="#c2aaff" stroke-width="2" fill="none"/><path d="M128 32 H150 M130 28 H148" stroke="#b794ff" stroke-width="2"/><circle cx="139" cy="23" r="4" fill="#c5a7ff"/>',colors:['#5a4a8e','#242443','#c5a1ff']},
    viper:{body:'M17 105 L28 94 L56 88 L84 74 Q96 67 111 67 H160 L183 81 L212 86 L239 101 L239 112 H16 Z',glass:'M91 79 L115 71 H137 V80 Z M143 71 H158 L174 80 H143 Z',wheels:[62,204],wheelR:14,siren:[122,62],stripe:'M22 98 L231 98 L236 103 L20 103 Z',addon:'<path d="M188 81 L211 70 L225 75 L215 85 Z" fill="#17233e"/><path d="M21 96 L34 83 L49 86" fill="none" stroke="#dbe8ff" stroke-width="2"/><path d="M95 86 L123 86" stroke="#f7a4c0" stroke-width="3"/>',colors:['#4f65ab','#192542','#ff7f9f']},
    guardian:{body:'M17 104 L27 86 L51 81 L61 54 Q65 48 79 48 H159 L181 75 L211 81 L239 99 L239 114 H17 Z',glass:'M67 77 L74 55 H107 V77 Z M113 55 H155 L173 77 H113 Z',wheels:[59,201],wheelR:18,siren:[118,44],stripe:'M21 94 L233 94 L237 102 L19 102 Z',addon:'<path d="M58 48 H158 L171 53 H55 Z" fill="#e3d18b"/><path d="M177 78 L202 78 L221 88" fill="none" stroke="#f0e1ab" stroke-width="2"/><rect x="82" y="84" width="35" height="4" rx="2" fill="#e7d28b"/>',colors:['#3d5c78','#172e43','#e5d086']},
    sovereign:{body:'M15 104 L27 87 L51 82 L66 55 Q71 47 86 47 H158 Q171 49 182 74 L213 80 L242 99 L242 115 H15 Z',glass:'M74 76 L84 53 H113 V76 Z M119 53 H155 L175 76 H119 Z',wheels:[58,204],wheelR:18,siren:[122,42],stripe:'M19 94 L235 94 L240 102 L18 102 Z',addon:'<path d="M64 47 H159 L175 52 H58 Z" fill="#8afff3"/><path d="M181 76 L215 80 L233 95 L202 88 Z" fill="#55e1db"/><path d="M84 84 H133" stroke="#a8fff4" stroke-width="3"/><circle cx="137" cy="43" r="5" fill="#77fff4"/>',colors:['#1f8691','#122e3c','#6dfff1']}
  });

  function vehicleSvg(vehicle, slot) {
    const art = VEHICLE_ART[vehicle && vehicle.iconId] || VEHICLE_ART.cityline;
    const key = (String(slot || 'card') + '-' + String(vehicle.level)).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80);
    const wheels = art.wheels.map(function (x) {
      return '<circle cx="' + x + '" cy="111" r="' + art.wheelR + '" fill="#08111b" stroke="#7e9ab0" stroke-width="2.2"/><path d="M' + (x - art.wheelR * .62) + ' 102 A ' + (art.wheelR * .82) + ' ' + (art.wheelR * .82) + ' 0 0 1 ' + (x + art.wheelR * .62) + ' 102" fill="none" stroke="#dceaf4" stroke-width="1.3" opacity=".55"/><circle cx="' + x + '" cy="111" r="' + Math.round(art.wheelR * .52) + '" fill="url(#police-metal-' + key + ')" stroke="#dce8f1" stroke-width="2"/><circle cx="' + x + '" cy="111" r="3" fill="#243849"/>';
    }).join('');
    return '<svg class="home-police-vehicle-art ' + (slot === 'hero' ? 'home-police-vehicle-art-hero' : '') + '" viewBox="0 0 260 150" role="img" aria-label="' + esc(vehicle.name) + ' police vehicle illustration" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="police-body-' + key + '" x1="0" y1="0" x2="0.15" y2="1"><stop offset="0" stop-color="' + art.colors[0] + '"/><stop offset=".2" stop-color="' + art.colors[0] + '"/><stop offset=".58" stop-color="' + art.colors[1] + '"/><stop offset="1" stop-color="#071321"/></linearGradient><linearGradient id="police-gloss-' + key + '" x1="0" y1="0" x2=".15" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".44"/><stop offset=".24" stop-color="#ffffff" stop-opacity=".08"/><stop offset=".62" stop-color="#ffffff" stop-opacity=".015"/><stop offset="1" stop-color="#020812" stop-opacity=".27"/></linearGradient><linearGradient id="police-metal-' + key + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4fbff"/><stop offset=".42" stop-color="#7891a4"/><stop offset="1" stop-color="#263b4d"/></linearGradient><linearGradient id="police-glass-' + key + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8fbff"/><stop offset=".23" stop-color="#7db7cc"/><stop offset=".55" stop-color="#35637c"/><stop offset="1" stop-color="#091827"/></linearGradient></defs>' +
      '<ellipse cx="132" cy="128" rx="112" ry="8" fill="#02060c" opacity=".68"/>' +
      '<path d="' + art.body + '" fill="url(#police-body-' + key + ')" stroke="#e2edf8" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<path d="' + art.body + '" fill="url(#police-gloss-' + key + ')" opacity=".72"/>' +
      '<path d="M34 91 L60 85 L84 61 Q92 53 105 53 H150 Q160 54 173 75" fill="none" stroke="#f5fbff" stroke-width="2.3" stroke-linecap="round" opacity=".43"/>' +
      '<path d="' + art.stripe + '" fill="' + art.colors[2] + '" opacity=".93"/>' +
      '<path d="M24 101 L234 101 L233 110 L22 110 Z" fill="#020915" opacity=".21"/>' +
      '<path d="' + art.glass + '" fill="url(#police-glass-' + key + ')" stroke="#cde5f0" stroke-width="1.7" stroke-linejoin="round"/>' +
      '<path d="M91 61 L104 57 H122" fill="none" stroke="#ffffff" stroke-width="2" opacity=".5" stroke-linecap="round"/>' +
      '<path d="M132 57 L132 78 M177 79 L174 93" stroke="#a6c5d7" stroke-width="1.4" opacity=".8"/>' +
      '<path d="M28 103 L44 103" stroke="#edfaff" stroke-width="3" stroke-linecap="round"/><path d="M222 100 L233 101" stroke="#fff3bf" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M108 49 H137" stroke="#d5e9f7" stroke-width="3" stroke-linecap="round"/>' +
      '<rect x="' + art.siren[0] + '" y="' + art.siren[1] + '" width="14" height="5" rx="2" fill="#f4485b" stroke="#ffe5e7" stroke-width=".7"/><rect x="' + (art.siren[0] + 14) + '" y="' + art.siren[1] + '" width="14" height="5" rx="2" fill="#33dcff" stroke="#e0fbff" stroke-width=".7"/>' +
      '<path d="M109 86 L127 86" stroke="#f7fbff" stroke-width="2" opacity=".8"/><path d="M123 90 L128 86 L123 82" fill="none" stroke="#f7fbff" stroke-width="1.5"/>' +
      '<circle cx="143" cy="91" r="7" fill="#0b1622" stroke="' + art.colors[2] + '" stroke-width="1.7"/><path d="M143 85 L145 89 L150 90 L146 93 L147 98 L143 95 L139 98 L140 93 L136 90 L141 89 Z" fill="#f5d77a" stroke="#fff0be" stroke-width=".5"/>' +
      '<text x="160" y="107" font-size="7.5" font-weight="900" fill="#f7fbff" stroke="#122638" stroke-width=".45" paint-order="stroke" letter-spacing=".65">POLICE</text>' +
      art.addon + wheels +
      '<path d="M29 115 L42 115 M222 115 L233 115" stroke="' + art.colors[2] + '" stroke-width="3" stroke-linecap="round"/>' +
      '</svg>';
  }

  function injectStyles() {
    if (!g.document || g.document.getElementById(STYLE_ID)) return;
    const style = g.document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.home-police-shell{box-sizing:border-box;width:min(calc(100% - 18px),1040px);margin:12px auto 42px;padding:clamp(14px,3vw,28px);color:#edf5ff;background:radial-gradient(circle at 50% 0%,rgba(25,67,105,.62),transparent 42%),linear-gradient(150deg,#081525 0%,#050b14 72%);border:1px solid rgba(218,177,75,.5);border-radius:18px;box-shadow:0 16px 45px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.06);font-family:Inter,system-ui,sans-serif;overflow:visible}',
      '.home-police-head{text-align:center;margin:0 auto 18px;max-width:760px}',
      '.home-police-orb{display:flex;align-items:center;justify-content:center;width:94px;height:94px;margin:2px auto 14px;border-radius:50%;background:radial-gradient(circle at 32% 22%,#fef3c7 0,#eabf52 16%,#173d61 47%,#09111f 75%);border:2px solid #dcb75d;box-shadow:0 0 0 5px rgba(220,183,93,.09),0 0 28px rgba(0,212,255,.18);font-size:48px;line-height:1}',
      '.home-police-title{color:#f6d67e;font-size:clamp(18px,3.6vw,28px);font-weight:900;letter-spacing:.08em;margin:0 0 6px;text-transform:uppercase}',
      '.home-police-subtitle{color:#9fb5cb;font-size:12px;line-height:1.6;margin:0}',
      '.home-police-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:18px 0}',
      '.home-police-kpi{background:linear-gradient(145deg,rgba(24,47,70,.95),rgba(8,17,29,.98));border:1px solid rgba(118,164,199,.22);border-radius:11px;padding:11px 8px;text-align:center;min-width:0}',
      '.home-police-kpi strong{display:block;color:#f7d77e;font-size:clamp(16px,3vw,24px);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}',
      '.home-police-kpi span{display:block;color:#91a9bf;font-size:10px;letter-spacing:.08em;text-transform:uppercase;margin-top:5px}',
      '.home-police-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:16px 0}',
      '.home-police-btn{box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;width:100%;padding:12px 13px;border-radius:10px;border:1px solid rgba(104,190,231,.45);background:linear-gradient(140deg,#173c5b,#0c1c30 72%);color:#f3f8ff;font-size:12px;font-weight:850;letter-spacing:.045em;text-align:center;line-height:1.35;cursor:pointer;touch-action:manipulation;box-shadow:0 4px 0 #03080f,0 7px 15px rgba(0,0,0,.18);transition:transform .14s ease,border-color .14s ease,filter .14s ease}',
      '.home-police-btn:active{transform:translateY(2px);box-shadow:0 2px 0 #03080f;filter:brightness(1.12)}',
      '.home-police-btn:disabled{opacity:.46;filter:saturate(.55);cursor:not-allowed;box-shadow:none}',
      '.home-police-btn-gold{border-color:rgba(238,198,92,.7);background:linear-gradient(135deg,#6e5420,#273044 72%)}',
      '.home-police-btn-green{border-color:rgba(63,210,150,.65);background:linear-gradient(135deg,#145f4c,#102d30 72%)}',
      '.home-police-btn-purple{border-color:rgba(189,123,255,.65);background:linear-gradient(135deg,#4c2b71,#1b1835 72%)}',
      '.home-police-btn-red{border-color:rgba(255,112,112,.6);background:linear-gradient(135deg,#6a2635,#251723 72%)}',
      '.home-police-btn-plain{border-color:rgba(154,175,197,.26);background:linear-gradient(135deg,#263747,#101a27 72%)}',
      '.home-police-section-title{display:flex;align-items:center;gap:10px;margin:22px 0 10px;color:#f2d47b;font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}',
      '.home-police-section-title:after{content:"";height:1px;flex:1;background:linear-gradient(90deg,rgba(218,177,75,.48),transparent)}',
      '.home-police-note{color:#a7bbcf;font-size:12px;line-height:1.55;margin:8px 0}',
      '.home-police-panel{box-sizing:border-box;background:linear-gradient(150deg,rgba(18,38,58,.96),rgba(7,15,26,.98));border:1px solid rgba(221,183,90,.3);border-radius:13px;padding:14px;margin:12px 0}',
      '.home-police-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}',
      '.home-police-card{box-sizing:border-box;position:relative;display:flex;flex-direction:column;align-items:center;gap:7px;min-width:0;min-height:112px;padding:13px 8px 12px;border:1px solid rgba(106,169,209,.3);border-radius:12px;background:linear-gradient(155deg,rgba(24,51,76,.96),rgba(7,17,30,.96));color:#eef5ff;text-align:center;cursor:pointer;touch-action:manipulation;contain:layout paint}',
      '.home-police-card:active{transform:scale(.99)}',
      '.home-police-card.is-selected{border-color:#f4cf71;box-shadow:0 0 0 1px rgba(244,207,113,.16),0 0 18px rgba(0,205,255,.08)}',
      '.home-police-card.is-locked{opacity:.57;border-style:dashed}',
      '.home-police-route-matrix{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:10px 0}',
      '.home-police-route-cell{min-width:0;padding:8px;border:1px solid rgba(110,161,196,.2);border-radius:8px;background:rgba(0,0,0,.17);font-size:10px;color:#abc0d3}',
      '.home-police-route-cell strong{display:flex;justify-content:space-between;gap:6px;color:#ecf5ff;font-size:11px;margin-bottom:5px}',
      '.home-police-route-track{height:5px;border-radius:5px;overflow:hidden;background:#020811}',
      '.home-police-route-track span{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#e6a94b,#45c8e8,#4de0a9)}',
      '.home-police-condition{height:8px;border-radius:8px;background:#030912;overflow:hidden;border:1px solid rgba(128,163,191,.25);margin:7px 0}',
      '.home-police-condition span{display:block;height:100%;background:linear-gradient(90deg,#f56b5f,#f3c45d,#4bdc9a)}',
      '.home-police-fleet-card{min-width:0;padding:12px;border:1px solid rgba(98,180,218,.25);background:linear-gradient(150deg,rgba(18,43,63,.95),rgba(7,15,26,.97));border-radius:11px;contain:layout paint}',
      '.home-police-fleet-card h3{font-size:12px;color:#ffdfa0;line-height:1.4;margin:4px 0}',
      '.home-police-fleet-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:9px 0}',
      '.home-police-fleet-meta>div{min-width:0;padding:7px;border-radius:6px;background:rgba(0,0,0,.18);font-size:10px;color:#9fb7ca;overflow-wrap:anywhere}',
      '.home-police-fleet-meta strong{display:block;color:#eef6ff;font-size:11px;margin-top:3px}',
      '.home-police-card-emoji{font-size:30px;line-height:1.2;min-height:36px}',
      '.home-police-vehicle-art{display:block;width:100%;height:76px;max-width:220px;overflow:visible;filter:none;shape-rendering:geometricPrecision}',
      '.home-police-vehicle-art-hero{height:122px;max-width:340px;margin:0 auto 8px}',
      '.home-police-feature-list{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin:10px 0}',
      '.home-police-feature-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 9px;border-radius:7px;background:rgba(72,197,221,.1);border:1px solid rgba(92,204,232,.24);color:#cbeaf4;font-size:10px;line-height:1.35}',
      '.home-police-vehicle-brief{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:10px 0}',
      '.home-police-brief-card{border:1px solid rgba(128,163,191,.2);border-radius:9px;background:rgba(0,0,0,.18);padding:10px;font-size:11px;line-height:1.5;color:#9fb7ca;min-width:0}',
      '.home-police-brief-card strong{display:block;font-size:12px;color:#f4f7fb;margin:4px 0;overflow-wrap:anywhere}',
      '.home-police-mission-icon{font-size:24px;line-height:1}',
      '.home-police-deployment-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}',
      '.home-police-deployment-card{min-width:0;padding:12px;border:1px solid rgba(98,180,218,.28);background:linear-gradient(150deg,rgba(18,43,63,.95),rgba(7,15,26,.97));border-radius:11px}',
      '.home-police-deployment-card h3{font-size:12px;color:#ffdfa0;line-height:1.4;margin:5px 0}',
      '.home-police-score-line{display:flex;justify-content:space-between;gap:10px;font-size:10px;color:#9fb7ca;margin-top:9px}',
      '@media(max-width:540px){.home-police-vehicle-art{height:68px}.home-police-vehicle-art-hero{height:108px}.home-police-deployment-list{grid-template-columns:1fr}.home-police-vehicle-brief{gap:6px}.home-police-feature-chip{font-size:9px;padding:6px 7px}}',
      '.home-police-card-name{font-size:11px;font-weight:850;line-height:1.35;overflow-wrap:anywhere}',
      '.home-police-tag{display:inline-flex;align-items:center;justify-content:center;padding:4px 7px;border-radius:5px;background:rgba(13,173,211,.15);color:#7cdeff;border:1px solid rgba(13,173,211,.32);font-size:9px;font-weight:900;letter-spacing:.07em}',
      '.home-police-tag-gold{color:#ffe199;background:rgba(200,154,38,.13);border-color:rgba(245,207,104,.42)}',
      '.home-police-tag-green{color:#78edba;background:rgba(23,176,112,.13);border-color:rgba(57,214,154,.36)}',
      '.home-police-form-row{display:flex;align-items:stretch;gap:9px;margin:11px 0}',
      '.home-police-field{box-sizing:border-box;width:100%;min-width:0;min-height:44px;border:1px solid rgba(131,174,208,.42);border-radius:8px;background:#07111e;color:#fff;padding:10px 12px;font-size:14px;outline:none}',
      '.home-police-field:focus{border-color:#3bd8ff;box-shadow:0 0 0 2px rgba(59,216,255,.12)}',
      '.home-police-field-wrap{flex:1;min-width:0}',
      '.home-police-label{display:block;color:#9fb6cb;font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;margin-bottom:6px}',
      '.home-police-cost{box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;min-width:116px;padding:8px 10px;border:1px solid rgba(240,196,91,.44);border-radius:8px;background:rgba(104,75,22,.18);color:#ffdf91;text-align:center}',
      '.home-police-cost strong{font-size:13px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}',
      '.home-police-cost span{font-size:9px;line-height:1.3;color:#b6c2d0;text-transform:uppercase;margin-top:4px}',
      '.home-police-detail{border:1px solid rgba(231,190,91,.37);border-radius:13px;padding:15px;margin:14px 0;background:linear-gradient(145deg,rgba(24,45,65,.93),rgba(7,15,26,.97));}',
      '.home-police-detail-top{text-align:center;margin:0 auto 12px}',
      '.home-police-detail-emoji{display:flex;align-items:center;justify-content:center;width:78px;height:78px;border-radius:50%;margin:0 auto 9px;background:radial-gradient(circle at 30% 20%,#fff4c9,#d8ae45 22%,#1a3b5a 56%,#07111c 80%);border:2px solid #d7b35d;font-size:40px;box-shadow:0 0 0 4px rgba(215,179,93,.08)}',
      '.home-police-detail h3{font-size:16px;color:#ffe3a0;margin:4px 0 6px;text-align:center;line-height:1.35}',
      '.home-police-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:12px 0}',
      '.home-police-stat{border-radius:7px;padding:9px;background:rgba(2,8,15,.48);border:1px solid rgba(121,154,184,.17);font-size:11px;color:#a5b9cc}',
      '.home-police-stat strong{display:block;color:#f5f7fa;font-size:13px;margin-top:4px}',
      '.home-police-plus{display:flex;align-items:center;justify-content:center;width:58px;height:58px;border-radius:50%;margin:12px auto;border:2px solid #e4c064;background:radial-gradient(circle at 28% 24%,#fff2ba,#c08b22 40%,#45310d 78%);color:#1d1606;font-size:34px;font-weight:950;box-shadow:0 0 0 5px rgba(228,192,100,.09),0 8px 20px rgba(0,0,0,.3);cursor:pointer}',
      '.home-police-progress{height:10px;border-radius:100px;overflow:hidden;background:#030914;border:1px solid rgba(111,167,204,.3);margin:9px 0}',
      '.home-police-progress-fill{height:100%;width:0;background:linear-gradient(90deg,#10b9d5,#5e88ff,#efc65d);transition:width .25s ease}',
      '.home-police-alert{font-size:11px;color:#f4d98f;background:rgba(151,108,19,.12);border:1px solid rgba(221,183,90,.3);padding:10px;border-radius:8px;line-height:1.5;margin:10px 0}',
      '.home-police-incidents{display:flex;flex-direction:column;gap:7px}',
      '.home-police-incident{border:1px solid rgba(125,163,193,.22);border-radius:8px;padding:10px;background:rgba(0,0,0,.2);font-size:11px;line-height:1.5;color:#b8cada}',
      '.home-police-divider{height:1px;background:rgba(126,163,192,.18);margin:12px 0}',
      '@media(prefers-reduced-motion:reduce),(max-width:540px){.home-police-btn{transition:none}.home-police-progress-fill{transition:none}.home-police-card:active{transform:none}.home-police-card{contain:layout paint}}',
      '@media(max-width:540px){.home-police-shell{width:calc(100% - 12px);padding:12px;margin-top:8px;border-radius:13px}.home-police-kpis{gap:6px}.home-police-kpi{padding:9px 4px}.home-police-actions{grid-template-columns:1fr}.home-police-form-row{gap:6px}.home-police-cost{min-width:102px;padding:7px}.home-police-btn{min-height:46px;font-size:11px}.home-police-card{min-height:105px}.home-police-stats{gap:6px}}'
    ].join('\n');
    g.document.head.appendChild(style);
  }
  function bodyNode() {
    if (hostedBodyNode && hostedBodyNode.isConnected !== false) return hostedBodyNode;
    hostedBodyNode = null;
    return g.document && g.document.getElementById('cabinet-body');
  }
  function returnToHomeMinistry(view) {
    const target = bodyNode();
    if (hostedBodyNode && target === hostedBodyNode && typeof view.renderHomeMinistryDashboard === 'function') {
      view.renderHomeMinistryDashboard();
      return;
    }
    if (typeof view.renderInteriorHQ === 'function') view.renderInteriorHQ();
  }
  function backButton(id, label) {
    return '<button id="' + id + '" class="home-police-btn home-police-btn-plain">' + label + '</button>';
  }
  function bindGlobalProgressListener() {
    if (g.__OMEGA_POLICE_UI_PROGRESS_LISTENER__ || typeof g.addEventListener !== 'function') return;
    g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED', function () {
      const e = engine();
      if (!e) return;
      const s = e.getState();
      const order = s.pendingVehicleOrder;
      const label = g.document && g.document.getElementById('home-police-vehicle-countdown');
      const bar = g.document && g.document.getElementById('home-police-vehicle-progress');
      if (label && order) {
        const now = e.getSimulationTimeMs();
        label.textContent = 'Estimated simulation-time delivery: ' + formatDuration(order.completesAtMs - now);
        if (bar) bar.style.width = Math.max(0, Math.min(100, 100 * (1 - (order.completesAtMs - now) / order.durationMs))) + '%';
      }
      const researchLabel = g.document && g.document.getElementById('home-police-research-countdown');
      const researchBar = g.document && g.document.getElementById('home-police-research-progress');
      const progress = e.getResearchProgress();
      if (researchLabel && progress) {
        researchLabel.textContent = progress.name + ' · ' + formatDuration(progress.remainingMs) + ' remaining';
        if (researchBar) researchBar.style.width = progress.progress + '%';
      }
    });
    g.__OMEGA_POLICE_UI_PROGRESS_LISTENER__ = true;
  }

  ui.getHomePoliceEngine = engine;
  ui.formatHomePoliceDuration = formatDuration;

  // Mount the real Home Ministry control system inside the canonical Cabinet dashboard.
  // The host is explicit so the existing cabinet-body route remains backward compatible.
  ui.renderHomeMinistryInto = function (container) {
    if (!container || typeof container !== 'object') return false;
    hostedBodyNode = container;
    injectStyles();
    if (!engine()) {
      container.innerHTML = '<div class="home-police-shell"><h2 class="home-police-title">HOME MINISTRY RUNTIME UNAVAILABLE</h2><p class="home-police-note">The authoritative Home Ministry engine has not initialized. No local counters or mock controls were substituted.</p></div>';
      return false;
    }
    return this.renderHomeMinistryDashboard();
  };

  ui.renderHomeMinistryDashboard = function () {
    injectStyles();
    const body = bodyNode(), e = engine();
    if (!body || !e) return false;
    const countryId = typeof e.getCurrentCountryId === 'function' ? e.getCurrentCountryId() : undefined;
    const s = e.getState(countryId), treasury = e.getTreasury(countryId);
    const fleet = typeof e.getVehicleFleet === 'function' ? e.getVehicleFleet(countryId) : [];
    const rows = Array.isArray(fleet) ? fleet : [];
    const totalOwned = Object.keys(s.vehiclesOwned || {}).reduce((sum, key) => sum + Math.max(0, Number(s.vehiclesOwned[key]) || 0), 0);
    const available = rows.filter(unit => unit.status === 'AVAILABLE').length;
    const deployed = rows.filter(unit => unit.status === 'DEPLOYED').length;
    const maintenance = rows.filter(unit => unit.status === 'MAINTENANCE_DUE' || unit.status === 'REPAIR_REQUIRED').length;
    const deployments = Array.isArray(s.guardDeployments) ? s.guardDeployments.length : 0;
    const incidents = Array.isArray(s.incidentLedger) ? s.incidentLedger.length : 0;
    const dailyPayroll = typeof e.getDailyPayroll === 'function' ? e.getDailyPayroll(countryId) : null;
    const dailyOperatingCost = typeof e.getDailyOperatingCost === 'function' ? e.getDailyOperatingCost(countryId) : null;
    body.innerHTML =
      '<div class="home-police-shell">' +
        '<header class="home-police-head"><div class="home-police-orb">🏛️</div><h1 class="home-police-title">MINISTRY OF HOME AFFAIRS</h1><p class="home-police-subtitle">National public safety, police fleet readiness, critical-asset protection and internal security. All controls use the authoritative Home Ministry runtime.</p></header>' +
        '<div class="home-police-kpis">' +
          '<div class="home-police-kpi"><strong>' + Number(s.policeCount || 0).toLocaleString() + '</strong><span>Active personnel</span></div>' +
          '<div class="home-police-kpi"><strong>' + Math.round(Number(s.policeEfficiency) || 0) + '%</strong><span>Operational efficiency</span></div>' +
          '<div class="home-police-kpi"><strong>' + Math.round(Number(s.policeTrust) || 0) + '%</strong><span>Public trust</span></div>' +
          '<div class="home-police-kpi"><strong>' + totalOwned.toLocaleString() + '</strong><span>Vehicles owned</span></div>' +
          '<div class="home-police-kpi"><strong>' + available.toLocaleString() + '</strong><span>Vehicles ready</span></div>' +
          '<div class="home-police-kpi"><strong>' + deployed.toLocaleString() + '</strong><span>Vehicles deployed</span></div>' +
          '<div class="home-police-kpi"><strong>' + maintenance.toLocaleString() + '</strong><span>Service / repair due</span></div>' +
          '<div class="home-police-kpi"><strong>' + deployments.toLocaleString() + '</strong><span>Active guard posts</span></div>' +
          '<div class="home-police-kpi"><strong>' + incidents.toLocaleString() + '</strong><span>Recorded incidents</span></div>' +
        '</div>' +
        '<div class="home-police-alert">' +
          (treasury && treasury.available ? 'Authoritative treasury balance: <strong>' + esc(money(e, treasury.balance)) + '</strong>. Daily police payroll: <strong>' + esc(money(e, dailyPayroll)) + '</strong>; scheduled security operating cost: <strong>' + esc(money(e, dailyOperatingCost)) + '</strong>.' : 'Treasury balance is not recorded. Procurement, repair and payroll debits remain blocked until the game exposes an authoritative country balance. No funds are invented.') +
        '</div>' +
        '<div class="home-police-section-title">Operational control systems</div>' +
        '<div class="home-police-actions">' +
          '<button id="home-police-dashboard-command" class="home-police-btn home-police-btn-green">🚔 POLICE COMMAND & PERSONNEL</button>' +
          '<button id="home-police-dashboard-hangar" class="home-police-btn home-police-btn-gold">🚓 VEHICLE HANGAR · 15 TIERS</button>' +
          '<button id="home-police-dashboard-procurement" class="home-police-btn home-police-btn-gold">🏗️ PROCUREMENT & FACILITIES</button>' +
          '<button id="home-police-dashboard-fleet" class="home-police-btn home-police-btn-purple">🧰 FLEET HEALTH & REPAIR</button>' +
          '<button id="home-police-dashboard-guard" class="home-police-btn home-police-btn-green">🚧 GUARD OUT · PATROL DEPLOYMENT</button>' +
          '<button id="home-police-dashboard-tactics" class="home-police-btn home-police-btn-purple">🛡️ TACTICS, TRAINING & INTELLIGENCE</button>' +
          '<button id="home-police-dashboard-incidents" class="home-police-btn">📋 SECURITY INCIDENT LEDGER</button>' +
        '</div>' +
        '<p class="home-police-note">Fleet units have unique identities and persistent condition, mileage, availability, maintenance and deployment status. Guard posts reserve both vehicles and officers; standing down releases them. Purchase, repair and staffing actions are committed through the simulation state and country treasury ledger.</p>' +
      '</div>';
    g.document.getElementById('home-police-dashboard-command').onclick = () => this.openPoliceCommand();
    g.document.getElementById('home-police-dashboard-hangar').onclick = () => this.renderVehicleCatalog(s.unlockedVehicleLevel);
    g.document.getElementById('home-police-dashboard-procurement').onclick = () => this.renderUpgradeMenu();
    g.document.getElementById('home-police-dashboard-fleet').onclick = () => this.renderFleetMaintenance();
    g.document.getElementById('home-police-dashboard-guard').onclick = () => this.renderGuardOut(s.unlockedVehicleLevel);
    g.document.getElementById('home-police-dashboard-tactics').onclick = () => this.renderTacticsMenu();
    g.document.getElementById('home-police-dashboard-incidents').onclick = () => this.renderPoliceIncidentLog();
    return true;
  };

  ui.openPoliceCommand = function () {
    injectStyles();
    const body = bodyNode(), e = engine();
    if (!body || !e) { if (this.showAdvisePopup) this.showAdvisePopup('POLICE COMMAND UNAVAILABLE', 'The Home Ministry runtime is not ready.'); return; }
    const s = e.getState(), t = e.getTreasury();
    body.innerHTML =
      '<div class="home-police-shell">' +
        '<header class="home-police-head"><div class="home-police-orb">🚔</div><h1 class="home-police-title">NATIONAL POLICE COMMAND</h1><p class="home-police-subtitle">Home Ministry · Public Safety, Crime Prevention & Critical-Asset Protection</p></header>' +
        '<div class="home-police-kpis">' +
          '<div class="home-police-kpi"><strong>' + Number(s.policeCount).toLocaleString() + '</strong><span>Active personnel</span></div>' +
          '<div class="home-police-kpi"><strong>' + Math.round(s.policeEfficiency) + '%</strong><span>Operational efficiency</span></div>' +
          '<div class="home-police-kpi"><strong>' + Math.round(s.policeTrust) + '%</strong><span>Public trust</span></div>' +
          '<div class="home-police-kpi"><strong>' + money(e, e.getDailyOperatingCost()) + '</strong><span>Daily security operating cost</span></div>' +
          '<div class="home-police-kpi"><strong>' + Number(s.specialAgents).toLocaleString() + '</strong><span>Intelligence agents</span></div>' +
          '<div class="home-police-kpi"><strong>' + Math.round(s.sabotageRisk) + '%</strong><span>Threat exposure</span></div>' +
        '</div>' +
        '<div class="home-police-alert">' + (t.available ? 'Verified ' + (t.source === 'FINANCE_AVAILABLE' ? 'Finance ledger' : 'economy treasury field') + ' balance: <strong>' + money(e, t.balance) + '</strong>. Staffing, procurement and operating costs use the active country balance.' : 'Treasury / finance cash balance is unavailable. Costly orders remain blocked until the game provides an authoritative country balance.') + '</div>' +
        '<div class="home-police-section-title">Personnel & capability</div>' +
        '<div class="home-police-actions">' +
          '<button id="btn-recruit-police" class="home-police-btn home-police-btn-green">👮 1.1 · RECRUIT / FIRE PERSONNEL</button>' +
          '<button id="btn-upgrade-vehicles" class="home-police-btn home-police-btn-gold">🚔 1.2 · AAA FLEET & FACILITY ASCENSION</button>' +
          '<button id="btn-police-guard-out" class="home-police-btn home-police-btn-green">🚧 GUARD OUT · PATROL DEPLOYMENT</button>' +
          '<button id="btn-tactics-police" class="home-police-btn home-police-btn-purple">🛡️ 1.3 · TACTICS, TRAINING & INTELLIGENCE</button>' +
          '<button id="btn-police-incident-log" class="home-police-btn">📋 SECURITY INCIDENT LEDGER</button>' +
        '</div>' +
        '<p class="home-police-note">Vehicle progression is sequential. Each new top tier requires an order and 180 simulation days of procurement time. Police and agent payroll is charged on simulation-day boundaries.</p>' +
        backButton('btn-back-interior', '← BACK TO HOME MINISTRY') +
      '</div>';
    g.document.getElementById('btn-recruit-police').onclick = () => this.renderRecruitScreen();
    g.document.getElementById('btn-upgrade-vehicles').onclick = () => this.renderUpgradeMenu();
    g.document.getElementById('btn-police-guard-out').onclick = () => this.renderGuardOut();
    g.document.getElementById('btn-tactics-police').onclick = () => this.renderTacticsMenu();
    g.document.getElementById('btn-police-incident-log').onclick = () => this.renderPoliceIncidentLog();
    g.document.getElementById('btn-back-interior').onclick = () => returnToHomeMinistry(this);
  };

  ui.renderRecruitScreen = function () {
    injectStyles();
    const body = bodyNode(), e = engine();
    if (!body || !e) return;
    const s = e.getState();
    body.innerHTML =
      '<div class="home-police-shell">' +
        '<header class="home-police-head"><div class="home-police-orb">👮</div><h1 class="home-police-title">PERSONNEL CONTROL</h1><p class="home-police-subtitle">Recruitment is an upfront expense plus continuing daily payroll. Dismissal stops future payroll for the released staff.</p></header>' +
        '<div class="home-police-kpis"><div class="home-police-kpi"><strong>' + Number(s.policeCount).toLocaleString() + '</strong><span>Current officers</span></div><div class="home-police-kpi"><strong>' + money(e, e.getDailyPayroll()) + '</strong><span>Current daily payroll</span></div><div class="home-police-kpi"><strong>' + money(e, e.POLICE_RECRUITMENT_COST) + '</strong><span>Upfront cost / recruit</span></div></div>' +
        '<div class="home-police-actions"><button id="home-police-mode-recruit" class="home-police-btn home-police-btn-green">👮 RECRUIT POLICE</button><button id="home-police-mode-fire" class="home-police-btn home-police-btn-red">📉 FIRE / RELEASE POLICE</button></div>' +
        '<div id="home-police-amount-panel" class="home-police-panel" style="display:none">' +
          '<div class="home-police-section-title">Personnel quantity</div>' +
          '<div class="home-police-form-row"><div class="home-police-field-wrap"><label class="home-police-label" for="home-police-amount">Enter number of officers</label><input id="home-police-amount" class="home-police-field" type="number" min="1" max="100000" step="1" value="10" inputmode="numeric"></div>' +
          '<div id="home-police-daily-cost-box" class="home-police-cost"><strong id="home-police-daily-cost">' + money(e, 10 * e.POLICE_SALARY_PER_DAY) + '</strong><span>Added daily payroll</span></div></div>' +
          '<div id="home-police-cost-note" class="home-police-note">Recruitment fee: ' + money(e, 10 * e.POLICE_RECRUITMENT_COST) + '. Estimated extra payroll is ' + money(e, 10 * e.POLICE_SALARY_PER_DAY) + ' per simulation day.</div>' +
          '<div class="home-police-actions"><button id="home-police-confirm" class="home-police-btn home-police-btn-green">CONFIRM RECRUITMENT</button><button id="home-police-minister-advice" class="home-police-btn home-police-btn-gold">🏛️ MINISTER ADVICE</button></div>' +
        '</div>' +
        '<div class="home-police-alert">Budget discipline: recruitment and dismissal only update the active country personnel record. The daily payroll engine charges this workforce on each simulation-day boundary; missing treasury data does not create free money.</div>' +
        backButton('home-police-back-command', '← BACK TO POLICE COMMAND') +
      '</div>';
    let mode = 'recruit';
    const panel = g.document.getElementById('home-police-amount-panel'), amount = g.document.getElementById('home-police-amount');
    const dailyBox = g.document.getElementById('home-police-daily-cost-box'), dailyText = g.document.getElementById('home-police-daily-cost');
    const costNote = g.document.getElementById('home-police-cost-note'), confirm = g.document.getElementById('home-police-confirm');
    const refresh = () => {
      const n = Math.max(0, Math.floor(Number(amount.value) || 0));
      if (mode === 'recruit') {
        dailyBox.style.display = 'flex';
        dailyText.textContent = money(e, n * e.POLICE_SALARY_PER_DAY);
        costNote.textContent = 'Upfront recruitment fee: ' + money(e, n * e.POLICE_RECRUITMENT_COST) + '. Added daily payroll: ' + money(e, n * e.POLICE_SALARY_PER_DAY) + '.';
        confirm.textContent = 'CONFIRM RECRUITMENT';
        confirm.className = 'home-police-btn home-police-btn-green';
      } else {
        dailyBox.style.display = 'none';
        costNote.textContent = 'Dismissal has no upfront purchase charge. Estimated daily payroll savings: ' + money(e, n * e.POLICE_SALARY_PER_DAY) + '.';
        confirm.textContent = 'CONFIRM DISMISSAL';
        confirm.className = 'home-police-btn home-police-btn-red';
      }
    };
    const setMode = value => { mode = value; panel.style.display = 'block'; g.document.getElementById('home-police-mode-recruit').className = 'home-police-btn ' + (mode === 'recruit' ? 'home-police-btn-green' : 'home-police-btn-plain'); g.document.getElementById('home-police-mode-fire').className = 'home-police-btn ' + (mode === 'fire' ? 'home-police-btn-red' : 'home-police-btn-plain'); refresh(); };
    g.document.getElementById('home-police-mode-recruit').onclick = () => setMode('recruit');
    g.document.getElementById('home-police-mode-fire').onclick = () => setMode('fire');
    amount.oninput = refresh;
    confirm.onclick = () => {
      const n = Math.floor(Number(amount.value) || 0);
      const result = mode === 'recruit' ? e.recruitPolice(n) : e.firePolice(n);
      if (result.ok) {
        report(result, mode === 'recruit' ? 'RECRUITMENT COMMITTED' : 'PERSONNEL RELEASED', mode === 'recruit' ? n.toLocaleString() + ' officers added. Added daily payroll: ' + money(e, n * e.POLICE_SALARY_PER_DAY) + '.' : n.toLocaleString() + ' officers released. Daily payroll saving: ' + money(e, n * e.POLICE_SALARY_PER_DAY) + '.');
        this.renderRecruitScreen();
      } else report(result);
    };
    g.document.getElementById('home-police-minister-advice').onclick = () => {
      const result = e.advice(mode, { amount: Math.floor(Number(amount.value) || 0) });
      if (result && Number.isFinite(Number(result.amount))) amount.value = result.amount;
      refresh();
      this.showAdvisePopup('MINISTER OF HOME AFFAIRS · ADVICE', result.text);
    };
    g.document.getElementById('home-police-back-command').onclick = () => this.openPoliceCommand();
  };

  ui.renderUpgradeMenu = function () {
    injectStyles();
    const body = bodyNode(), e = engine();
    if (!body || !e) return;
    const s = e.getState(), order = s.pendingVehicleOrder;
    const progress = order ? Math.max(0, Math.min(100, 100 * (1 - (order.completesAtMs - e.getSimulationTimeMs()) / order.durationMs))) : 0;
    body.innerHTML =
      '<div class="home-police-shell">' +
        '<header class="home-police-head"><div class="home-police-orb">🚔</div><h1 class="home-police-title">AAA FLEET & FACILITY ASCENSION</h1><p class="home-police-subtitle">A sequential procurement ladder and scalable public-safety infrastructure grid.</p></header>' +
        '<div class="home-police-kpis"><div class="home-police-kpi"><strong>Tier ' + s.unlockedVehicleLevel + ' / 15</strong><span>Highest unlocked vehicle</span></div><div class="home-police-kpi"><strong>' + Object.keys(s.vehiclesOwned).reduce((n, k) => n + (Number(s.vehiclesOwned[k]) || 0), 0).toLocaleString() + '</strong><span>Vehicles delivered</span></div><div class="home-police-kpi"><strong>' + Object.values(s.facilityLevels).reduce((n, v) => n + (Number(v) || 0), 0).toLocaleString() + '</strong><span>Facility levels</span></div></div>' +
        (order ? '<div class="home-police-panel"><strong>🚚 PROCUREMENT IN TRANSIT · TIER ' + order.level + '</strong><p class="home-police-note">' + esc(e.VEHICLES[order.level - 1].name) + ' · Quantity ' + order.quantity + ' · Cost ' + money(e, order.totalCost) + '</p><div class="home-police-progress"><div class="home-police-progress-fill" style="width:' + progress + '%"></div></div><div id="home-police-vehicle-countdown" class="home-police-note">Estimated simulation-time delivery: ' + formatDuration(order.completesAtMs - e.getSimulationTimeMs()) + '</div></div>' : '') +
        '<div class="home-police-actions"><button id="home-police-open-vehicles" class="home-police-btn home-police-btn-gold">🚓 VEHICLE HANGAR · 15 TIERS</button><button id="home-police-open-facilities" class="home-police-btn home-police-btn-green">🏗️ FACILITY COMMAND GRID</button><button id="home-police-open-fleet-maintenance" class="home-police-btn home-police-btn-purple">🧰 FLEET HEALTH & REPAIR</button></div>' +
        '<div class="home-police-alert">Progression rule: only the next uncompleted tier unlocks after the previous tier is delivered. Each tier requires 180 simulation days; skipping directly to Tier XV is blocked.</div>' +
        backButton('home-police-upgrade-back', '← BACK TO POLICE COMMAND') +
      '</div>';
    g.document.getElementById('home-police-open-vehicles').onclick = () => this.renderVehicleCatalog(s.unlockedVehicleLevel);
    g.document.getElementById('home-police-open-facilities').onclick = () => this.renderFacilitiesPanel();
    g.document.getElementById('home-police-open-fleet-maintenance').onclick = () => this.renderFleetMaintenance();
    g.document.getElementById('home-police-upgrade-back').onclick = () => this.openPoliceCommand();
    bindGlobalProgressListener();
  };

  ui.renderVehicleCatalog = function (selectedLevel) {
    injectStyles(); bindGlobalProgressListener();
    const body = bodyNode(), e = engine();
    if (!body || !e) return;
    const s = e.getState(), selected = e.VEHICLES.find(v => v.level === Number(selectedLevel)) || e.VEHICLES.find(v => v.level === s.unlockedVehicleLevel) || e.VEHICLES[0];
    const order = s.pendingVehicleOrder, owned = Number(s.vehiclesOwned[selected.level]) || 0, guardCapacity = e.getGuardCapacity();
    const available = Math.max(0, Number(guardCapacity.availableVehicles[selected.level]) || 0);
    const cards = e.VEHICLES.map(v => {
      const unlocked = v.level <= s.unlockedVehicleLevel, chosen = v.level === selected.level;
      const stock = Number(s.vehiclesOwned[v.level]) || 0, free = Math.max(0, Number(guardCapacity.availableVehicles[v.level]) || 0);
      const bestEnvironments = [['city','City'],['highway','Highway'],['border','Border']].map(item => ({name:item[1],fit:Number(v.environmentFit[item[0]])||0})).sort((a,b)=>b.fit-a.fit).slice(0,2);
      const fitLine = bestEnvironments.map(item => '<span class="home-police-tag">' + esc(item.name) + ' ' + item.fit + '</span>').join(' ');
      return '<button type="button" aria-label="View Tier ' + v.level + ' ' + esc(v.name) + '" class="home-police-card ' + (chosen ? 'is-selected ' : '') + (!unlocked ? 'is-locked' : '') + '" data-home-vehicle="' + v.level + '">' +
        vehicleSvg(v, 'card') +
        '<span class="home-police-tag ' + (unlocked ? 'home-police-tag-green' : 'home-police-tag-gold') + '">' + (unlocked ? 'TIER UNLOCKED' : '🔒 RESEARCH / TIER LOCKED') + '</span>' +
        '<span class="home-police-card-name">TIER ' + v.level + ' · ' + esc(v.name) + '</span>' +
        '<span class="home-police-note">' + money(e, v.cost) + ' / vehicle</span>' +
        '<span class="home-police-note">Owned ' + stock + ' · Ready ' + free + '</span><span>' + fitLine + '</span></button>';
    }).join('');
    const locked = selected.level > s.unlockedVehicleLevel;
    const progress = order ? Math.max(0, Math.min(100, 100 * (1 - (order.completesAtMs - e.getSimulationTimeMs()) / order.durationMs))) : 0;
    const capabilityNames = {response:'Response',patrol:'Patrol',protection:'Protection',crowdControl:'Crowd control',surveillance:'Surveillance',offRoad:'Off-road',command:'Command',counterSmuggling:'Anti-smuggling'};
    const capabilityRows = Object.keys(capabilityNames).map(key => {
      const val = Number(selected.capabilities[key]) || 0;
      return '<div class="home-police-stat">' + capabilityNames[key] + '<strong>' + val + ' / 100</strong><div class="home-police-progress"><div class="home-police-progress-fill" style="width:' + val + '%"></div></div></div>';
    }).join('');
    const environments = typeof e.getOperatingEnvironments === 'function' ? e.getOperatingEnvironments() : [];
    const environmentRows = environments.map(env => {
      const fit = Number(selected.environmentFit[env.id]) || 0;
      const label = fit >= 80 ? 'Excellent' : fit >= 65 ? 'Good' : fit >= 45 ? 'Strained' : 'Poor fit';
      return '<div class="home-police-route-cell"><strong><span>' + env.emoji + ' ' + esc(env.name) + '</span><span>' + fit + '/100</span></strong><div class="home-police-route-track"><span style="width:' + fit + '%"></span></div><span>' + label + '</span></div>';
    }).join('');
    const featureChips = selected.specialFeatures.map(item => '<span class="home-police-feature-chip"><span style="color:#79e7ff">✦</span>' + esc(item) + '</span>').join('');
    const orderPanel = locked
      ? '<div class="home-police-alert">🔒 Tier ' + selected.level + ' is locked. Review its full specification now; purchasing is enabled only after prior vehicle deliveries unlock this tier. Current frontier: Tier ' + s.unlockedVehicleLevel + '.</div>'
      : order
        ? '<div class="home-police-alert"><strong>PROCUREMENT LOCK:</strong> ' + esc(e.VEHICLES[order.level - 1].name) + ' × ' + order.quantity + ' is in transit. Another order opens after delivery.<div class="home-police-progress"><div id="home-police-vehicle-progress" class="home-police-progress-fill" style="width:' + progress + '%"></div></div><div id="home-police-vehicle-countdown" class="home-police-note">' + formatDuration(order.completesAtMs - e.getSimulationTimeMs()) + ' remaining in simulation time</div></div>'
        : '<div class="home-police-section-title">Procurement console</div>' +
          '<div class="home-police-form-row"><div class="home-police-field-wrap"><label class="home-police-label" for="home-police-vehicle-amount">Order quantity · 1 to 100</label><input id="home-police-vehicle-amount" class="home-police-field" type="number" min="1" max="100" step="1" value="1" inputmode="numeric"></div><div class="home-police-cost"><strong id="home-police-vehicle-cost">' + money(e, selected.cost) + '</strong><span>Quoted order total</span></div></div>' +
          '<div class="home-police-note">One purchase begins a 180-simulation-day procurement window. Previously unlocked vehicles may be reordered, but only one vehicle order can run at once.</div>' +
          '<div class="home-police-actions"><button id="home-police-buy-vehicle" class="home-police-btn home-police-btn-green">🛒 CONFIRM VEHICLE ORDER</button><button id="home-police-vehicle-advice" class="home-police-btn home-police-btn-gold">🏛️ MINISTER BUDGET ADVICE</button></div>';
    body.innerHTML =
      '<div class="home-police-shell">' +
        '<header class="home-police-head"><div class="home-police-orb">🚔</div><h1 class="home-police-title">POLICE VEHICLE HANGAR</h1><p class="home-police-subtitle">15 individually styled SVG vehicles · eight capability ratings · strengths, trade-offs and mission fit.</p></header>' +
        '<div class="home-police-kpis"><div class="home-police-kpi"><strong>TIER ' + s.unlockedVehicleLevel + ' / 15</strong><span>Unlock frontier</span></div><div class="home-police-kpi"><strong>' + Object.keys(s.vehiclesOwned).reduce((n,k)=>n+(Number(s.vehiclesOwned[k])||0),0).toLocaleString() + '</strong><span>Total vehicles owned</span></div><div class="home-police-kpi"><strong>' + available.toLocaleString() + '</strong><span>Selected tier · guard-ready</span></div></div>' +
        (order ? '<div class="home-police-panel"><strong>🚚 ORDER IN TRANSIT · TIER ' + order.level + '</strong><p class="home-police-note">' + esc(e.VEHICLES[order.level - 1].name) + ' · Quantity ' + order.quantity + ' · Total ' + money(e, order.totalCost) + '</p><div class="home-police-progress"><div class="home-police-progress-fill" style="width:' + progress + '%"></div></div><div id="home-police-vehicle-countdown" class="home-police-note">Delivery estimate: ' + formatDuration(order.completesAtMs - e.getSimulationTimeMs()) + '</div></div>' : '') +
        '<div class="home-police-section-title">Select vehicle · inspect every tier</div><div class="home-police-grid">' + cards + '</div>' +
        '<section class="home-police-detail"><div class="home-police-detail-top">' + vehicleSvg(selected, 'hero') + '<span class="home-police-tag home-police-tag-gold">' + esc(selected.className) + '</span><h3>TIER ' + selected.level + ' · ' + esc(selected.name) + '</h3><p class="home-police-note">' + esc(selected.specialty) + ' · Best terrain: ' + esc(selected.terrain) + '</p></div>' +
          '<div class="home-police-stats"><div class="home-police-stat">Top speed<strong>' + selected.speed + ' km/h</strong></div><div class="home-police-stat">Acceleration<strong>' + selected.acceleration + ' / 100</strong></div><div class="home-police-stat">Officer capacity<strong>' + selected.capacity + ' persons / vehicle</strong></div><div class="home-police-stat">Durability<strong>' + selected.durability + ' / 120</strong></div><div class="home-police-stat">Operational range<strong>' + selected.rangeKm.toLocaleString() + ' km</strong></div><div class="home-police-stat">Shift endurance<strong>' + selected.enduranceHours + ' hours</strong></div><div class="home-police-stat">Purchase price<strong>' + money(e, selected.cost) + '</strong></div><div class="home-police-stat">Maintenance<strong>' + money(e, selected.maintenancePerDay) + ' / day</strong></div><div class="home-police-stat">Owned / guard-ready<strong>' + owned + ' / ' + available + '</strong></div><div class="home-police-stat">Currently assigned<strong>' + Math.max(0, Number(guardCapacity.deployedVehicles[selected.level]) || 0) + '</strong></div></div>' +
          '<div class="home-police-section-title">Distinct capability profile</div><div class="home-police-stats">' + capabilityRows + '</div>' +
          '<div class="home-police-section-title">Environment suitability · 0–100</div><div class="home-police-route-matrix">' + environmentRows + '</div>' +
          '<p class="home-police-note">The same vehicle can behave differently across city traffic, highways, borders, rough tracks and wetland roads. Poor fit reduces mission effectiveness and accelerates wear.</p>' +
          '<div class="home-police-section-title">Vehicle-specific equipment</div><div class="home-police-feature-list">' + featureChips + '</div>' +
          '<div class="home-police-vehicle-brief"><div class="home-police-brief-card"><span class="home-police-tag home-police-tag-green">STRENGTH</span><strong>' + esc(selected.strengths) + '</strong></div><div class="home-police-brief-card"><span class="home-police-tag home-police-tag-gold">TRADE-OFF</span><strong>' + esc(selected.tradeoff) + '</strong></div></div>' +
          '<div class="home-police-note"><strong>Operational role:</strong> ' + esc(selected.role) + '</div>' +
          orderPanel +
          '<div class="home-police-actions"><button id="home-police-deploy-selected" class="home-police-btn home-police-btn-purple" ' + (!available ? 'disabled' : '') + '>🚧 DEPLOY TO GUARD DUTY</button>' + backButton('home-police-vehicles-back', '← BACK TO FLEET COMMAND') + '</div>' +
        '</section></div>';
    Array.from(g.document.querySelectorAll('[data-home-vehicle]')).forEach(button => {
      button.onclick = () => this.renderVehicleCatalog(Number(button.getAttribute('data-home-vehicle')));
    });
    const deployButton = g.document.getElementById('home-police-deploy-selected');
    deployButton.onclick = () => this.renderGuardOut(selected.level);
    if (!locked && !order) {
      const input = g.document.getElementById('home-police-vehicle-amount'), cost = g.document.getElementById('home-police-vehicle-cost');
      input.oninput = () => {
        const n = Math.max(0, Math.min(100, Math.floor(Number(input.value) || 0)));
        cost.textContent = money(e, e.estimateVehicleCost(selected.level, n));
      };
      g.document.getElementById('home-police-buy-vehicle').onclick = () => {
        const n = Math.floor(Number(input.value) || 0), result = e.orderVehicle(selected.level, n);
        if (!result.ok) { report(result); return; }
        report(result, 'VEHICLE ORDER ACCEPTED', selected.name + ' × ' + n + ' ordered for ' + money(e, result.cost) + '. The 180-day delivery timer follows game simulation time.');
        this.renderVehicleCatalog(selected.level);
      };
      g.document.getElementById('home-police-vehicle-advice').onclick = () => {
        const result = e.advice('vehicle', { level: selected.level });
        if (Number.isFinite(Number(result.amount)) && result.amount > 0) input.value = result.amount;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        this.showAdvisePopup('MINISTER OF HOME AFFAIRS · PROCUREMENT ADVICE', result.text);
      };
    }
    g.document.getElementById('home-police-vehicles-back').onclick = () => this.renderUpgradeMenu();
  };

  ui.renderGuardOut = function (preferredVehicleLevel, filters) {
    injectStyles();
    const body = bodyNode(), e = engine();
    if (!body || !e) return;
    const state = e.getState(), capacity = e.getGuardCapacity();
    const availableTiers = e.VEHICLES.filter(v => v.level <= state.unlockedVehicleLevel && (Number(capacity.availableVehicles[v.level]) || 0) > 0);
    const selected = availableTiers.find(v => v.level === Number(preferredVehicleLevel)) || availableTiers[0] || null;
    const vehicleOptions = availableTiers.length
      ? availableTiers.map(v => '<option value="' + v.level + '"' + (selected && selected.level === v.level ? ' selected' : '') + '>TIER ' + v.level + ' · ' + esc(v.name) + ' · free ' + (Number(capacity.availableVehicles[v.level]) || 0) + '</option>').join('')
      : '<option value="">No unassigned vehicles available</option>';
    const missionOptions = e.GUARD_MISSIONS.map(m => '<option value="' + m.id + '">' + m.emoji + ' ' + esc(m.name) + '</option>').join('');
    const environments = e.getOperatingEnvironments(), roads = e.getRoadConditions();
    const routeOptions = Object.assign({ environment: 'city', road: 'congested' }, filters || {});
    const environmentOptions = environments.map(env => '<option value="' + env.id + '"' + (routeOptions.environment === env.id ? ' selected' : '') + '>' + env.emoji + ' ' + esc(env.name) + '</option>').join('');
    const currentEnvironment = environments.find(env => env.id === routeOptions.environment) || environments[0];
    const allowedRoads = roads.filter(road => currentEnvironment.roadConditions.includes(road.id));
    const selectedRoad = allowedRoads.find(road => road.id === routeOptions.road) || allowedRoads.find(road => road.id === currentEnvironment.roadDefault) || allowedRoads[0] || roads[0];
    const roadOptions = allowedRoads.map(road => '<option value="' + road.id + '"' + (selectedRoad.id === road.id ? ' selected' : '') + '>' + esc(road.name) + '</option>').join('');
    const guardableAssets = typeof e.getGuardableAssets === 'function' ? e.getGuardableAssets() : [];
    const guardAssetOptions = '<option value="">General mission coverage · no single asset</option>' + guardableAssets.map(asset => '<option value="' + esc(asset.id) + '">' + esc(asset.name) + ' · ' + esc(asset.category) + '</option>').join('');
    const activeDeployments = (state.guardDeployments || []).slice().reverse();
    const fleetSummary = e.getVehicleFleet();
    const deploymentCards = activeDeployments.length ? activeDeployments.map(unit => {
      const vehicle = e.VEHICLES.find(v => v.level === Number(unit.vehicleLevel)), mission = e.GUARD_MISSIONS.find(m => m.id === unit.missionId);
      if (!vehicle || !mission) return '';
      const score = Number(unit.effectiveness) || 0;
      const assignedFleet = fleetSummary.filter(row => (unit.vehicleIds || []).includes(row.id));
      const condition = assignedFleet.length ? Math.round(assignedFleet.reduce((sum,row) => sum + Number(row.condition || 0),0) / assignedFleet.length) : 100;
      return '<article class="home-police-deployment-card">' +
        vehicleSvg(vehicle, 'guard-' + unit.id) +
        '<span class="home-police-tag home-police-tag-green">DEPLOYED · ' + esc(mission.id.replace(/_/g, ' ').toUpperCase()) + '</span>' +
        '<h3>' + esc(vehicle.name) + ' × ' + Number(unit.quantity) + '</h3>' +
        '<p class="home-police-note">' + esc(mission.name) + ' · ' + esc(unit.sector || 'General Sector') + '</p>' +
        '<span class="home-police-tag">' + esc(environments.find(env => env.id === unit.environmentId)?.name || unit.environmentId || 'Dense City') + ' · ' + esc(roads.find(road => road.id === unit.roadCondition)?.name || unit.roadCondition || 'congested') + '</span>' +
        '<div class="home-police-score-line"><span>Average vehicle condition</span><strong>' + condition + ' / 100</strong></div><div class="home-police-condition"><span style="width:' + condition + '%"></span></div>' +
        '<div class="home-police-score-line"><span>Assigned officers</span><strong>' + Number(unit.officers).toLocaleString() + '</strong></div>' +
        '<div class="home-police-score-line"><span>Mission effectiveness</span><strong>' + score + ' / 100</strong></div>' +
        '<div class="home-police-progress"><div class="home-police-progress-fill" style="width:' + score + '%"></div></div>' +
        (unit.assetId ? '<span class="home-police-tag home-police-tag-gold">TARGETED ASSET · ' + esc(unit.assetName || unit.assetId) + '</span>' : '<span class="home-police-tag">GENERAL AREA COVERAGE</span>') +
        '<p class="home-police-note">' + esc(mission.description) + '</p>' +
        '<button type="button" class="home-police-btn home-police-btn-red" data-home-standdown="' + esc(unit.id) + '">↩ STAND DOWN · RETURN TO POOL</button>' +
      '</article>';
    }).join('') : '<div class="home-police-alert">No active guard-out assignments. Buy and receive a vehicle first, then assign it to a mission.</div>';
    body.innerHTML =
      '<div class="home-police-shell">' +
        '<header class="home-police-head"><div class="home-police-orb">🚧</div><h1 class="home-police-title">GUARD OUT · DEPLOYMENT CONTROL</h1><p class="home-police-subtitle">Dispatch owned police vehicles to specific guard missions. Fleet and staff are reserved while on duty and returned to the pool when stood down.</p></header>' +
        '<div class="home-police-kpis">' +
          '<div class="home-police-kpi"><strong>' + Number(capacity.availableOfficers).toLocaleString() + '</strong><span>Unassigned officers</span></div>' +
          '<div class="home-police-kpi"><strong>' + activeDeployments.length + '</strong><span>Active guard assignments</span></div>' +
          '<div class="home-police-kpi"><strong>' + (Number(capacity.availableVehicles[selected ? selected.level : 0]) || 0) + '</strong><span>Available selected-tier vehicles</span></div>' +
        '</div>' +
        '<div class="home-police-panel">' +
          '<div class="home-police-section-title">1 · Deployment order</div>' +
          '<label class="home-police-label" for="home-police-guard-vehicle">Select owned and unassigned vehicle</label>' +
          '<select id="home-police-guard-vehicle" class="home-police-field" ' + (availableTiers.length ? '' : 'disabled') + '>' + vehicleOptions + '</select>' +
          (selected ? '<div class="home-police-detail-top">' + vehicleSvg(selected, 'guard-preview') + '<p class="home-police-note">' + esc(selected.specialty) + ' · capacity ' + selected.capacity + ' officers per vehicle</p></div>' : '<div class="home-police-alert">No dispatchable vehicles found. Open Fleet & Facility Ascension to order the unlocked tier and let its 180-day delivery finish.</div>') +
          '<label class="home-police-label" for="home-police-guard-mission">Guard mission</label><select id="home-police-guard-mission" class="home-police-field">' + missionOptions + '</select>' +
          '<div class="home-police-form-row"><div class="home-police-field-wrap"><label class="home-police-label" for="home-police-guard-environment">Operating environment</label><select id="home-police-guard-environment" class="home-police-field">' + environmentOptions + '</select></div><div class="home-police-field-wrap"><label class="home-police-label" for="home-police-guard-road">Road / weather condition</label><select id="home-police-guard-road" class="home-police-field">' + roadOptions + '</select></div></div>' +
          '<div class="home-police-vehicle-brief"><div class="home-police-brief-card"><span class="home-police-tag home-police-tag-gold">ROUTE FIT</span><strong id="home-police-route-fit">-- / 100</strong><span id="home-police-route-status">Select a vehicle and route.</span></div><div class="home-police-brief-card"><span class="home-police-tag home-police-tag-gold">30-DAY WEAR FORECAST</span><strong id="home-police-route-wear">-- condition points</strong><span id="home-police-route-risk">Maintenance exposure unavailable</span></div></div>' +
          '<div id="home-police-route-warnings" class="home-police-alert" aria-live="polite">Choose a route. Each vehicle has individual environment fit; poor matches wear faster and may break down.</div>' +
          '<div class="home-police-section-title">Fleet strategy recommendation</div><div id="home-police-route-recommendations" class="home-police-deployment-list"><div class="home-police-alert">Checking available fleet and route fit…</div></div>' +
          '<label class="home-police-label" for="home-police-guard-asset">Recorded factory / infrastructure target (optional)</label><select id="home-police-guard-asset" class="home-police-field">' + guardAssetOptions + '</select>' +
          '<p class="home-police-note">Only assets already recorded in this country are listed. An empty selection keeps the unit on general mission coverage; targeted guards affect the matching asset event only.</p>' +
          '<div class="home-police-form-row"><div class="home-police-field-wrap"><label class="home-police-label" for="home-police-guard-quantity">Vehicles to deploy</label><input id="home-police-guard-quantity" class="home-police-field" type="number" min="1" max="' + (selected ? Number(capacity.availableVehicles[selected.level]) || 1 : 1) + '" step="1" value="1" inputmode="numeric" ' + (selected ? '' : 'disabled') + '></div>' +
          '<div class="home-police-cost"><strong id="home-police-guard-officers">' + (selected ? selected.capacity : 0) + '</strong><span>Officers assigned</span></div></div>' +
          '<label class="home-police-label" for="home-police-guard-sector">Area / sector assignment</label><input id="home-police-guard-sector" class="home-police-field" type="text" maxlength="80" placeholder="e.g. Aluminium Plant North Gate or Sector 4" value="General Sector" ' + (selected ? '' : 'disabled') + '>' +
          '<div class="home-police-vehicle-brief">' +
            '<div class="home-police-brief-card"><span class="home-police-tag home-police-tag-green">MISSION FIT</span><strong id="home-police-guard-effectiveness">0 / 100</strong><span id="home-police-guard-fit-note">Select a vehicle and mission.</span></div>' +
            '<div class="home-police-brief-card"><span class="home-police-tag home-police-tag-gold">AVAILABILITY CHECK</span><strong id="home-police-guard-availability">Checking…</strong><span id="home-police-guard-availability-note">Vehicles and officers are reserved at dispatch.</span></div>' +
          '</div>' +
          '<div id="home-police-guard-error" class="home-police-alert" aria-live="polite">Choose an available owned vehicle and a mission. Deployment itself has no procurement fee; vehicle upkeep continues while the vehicle remains in the fleet.</div>' +
          '<div class="home-police-actions"><button id="home-police-confirm-guard" class="home-police-btn home-police-btn-green" ' + (selected ? '' : 'disabled') + '>🚧 CONFIRM GUARD DEPLOYMENT</button><button id="home-police-guard-refresh" class="home-police-btn home-police-btn-plain">↻ REFRESH CAPACITY</button></div>' +
        '</div>' +
        '<div class="home-police-section-title">2 · Active guard-out assignments</div>' +
        '<div id="home-police-active-guards" class="home-police-deployment-list">' + deploymentCards + '</div>' +
        '<p class="home-police-note">Mission effectiveness is calculated from the selected vehicle’s individual capability ratings, training quality, police facilities and completed tactics. Guard missions affect modeled incident frequency and detection. They do not guarantee zero incidents.</p>' +
        backButton('home-police-guard-back', '← BACK TO POLICE COMMAND') +
      '</div>';
    const vehicleSelect = g.document.getElementById('home-police-guard-vehicle'), missionSelect = g.document.getElementById('home-police-guard-mission');
    const environmentSelect = g.document.getElementById('home-police-guard-environment'), roadSelect = g.document.getElementById('home-police-guard-road');
    const quantityInput = g.document.getElementById('home-police-guard-quantity'), sectorInput = g.document.getElementById('home-police-guard-sector'), assetSelect = g.document.getElementById('home-police-guard-asset');
    const officerLabel = g.document.getElementById('home-police-guard-officers'), effectLabel = g.document.getElementById('home-police-guard-effectiveness');
    const fitNote = g.document.getElementById('home-police-guard-fit-note'), availabilityLabel = g.document.getElementById('home-police-guard-availability');
    const availabilityNote = g.document.getElementById('home-police-guard-availability-note'), errorBox = g.document.getElementById('home-police-guard-error');
    const routeFit = g.document.getElementById('home-police-route-fit'), routeStatus = g.document.getElementById('home-police-route-status');
    const routeWear = g.document.getElementById('home-police-route-wear'), routeRisk = g.document.getElementById('home-police-route-risk'), routeWarnings = g.document.getElementById('home-police-route-warnings');
    const routeRecommendations = g.document.getElementById('home-police-route-recommendations');
    const deployButton = g.document.getElementById('home-police-confirm-guard');
    const refresh = () => {
      const level = Math.floor(Number(vehicleSelect.value) || 0), missionId = missionSelect.value, quantity = Math.floor(Number(quantityInput.value) || 0);
      const environmentId = environmentSelect.value, roadId = roadSelect.value;
      const v = e.VEHICLES.find(row => row.level === level), preview = e.getGuardDeploymentPreview(level, missionId, quantity, e.getCurrentCountryId(), environmentId, roadId);
      const use = preview.environment || e.getVehicleUseAssessment(level, environmentId, roadId);
      routeFit.textContent = use.fit + ' / 100';
      routeStatus.textContent = use.status + ' · ' + use.environment.name;
      routeWear.textContent = (use.wearPerDay * 30).toFixed(1) + ' condition points';
      routeRisk.textContent = 'Damage exposure ×' + use.damageRisk + ' · approx. ' + use.dailyDistanceKm + ' km/day';
      routeWarnings.textContent = (use.summary || 'Route profile unavailable.') + (use.penalties.length ? ' ' + use.penalties.join(' ') : '') + (preview.estimatedConditionLoss30Days > 5 ? ' Expected wear is high; schedule maintenance.' : '');
      const recommendations = e.getVehicleRecommendations(missionId, environmentId, roadId, Math.max(1, quantity), e.getCurrentCountryId());
      routeRecommendations.innerHTML = recommendations.length ? recommendations.map((row, index) =>
        '<article class="home-police-deployment-card">' +
          '<span class="home-police-tag ' + (index === 0 ? 'home-police-tag-green' : '') + '">' + (index === 0 ? 'BEST STRATEGIC FIT' : 'ALTERNATIVE ' + index) + ' · SCORE ' + row.strategicScore + '</span>' +
          vehicleSvg(e.VEHICLES.find(v => v.level === row.vehicleLevel), 'recommend-' + row.vehicleLevel) +
          '<h3>' + esc(row.vehicleName) + '</h3>' +
          '<p class="home-police-note">' + esc(row.why) + '</p>' +
          '<div class="home-police-fleet-meta"><div>Route suitability<strong>' + row.environmentFit + ' / 100</strong></div><div>Mission effectiveness<strong>' + row.effectiveness + ' / 100</strong></div><div>Wear over 30 days<strong>' + row.estimatedWear30Days + ' points</strong></div><div>Estimated upkeep<strong>' + money(e, row.estimatedMaintenancePerDay) + ' / day</strong></div></div>' +
          '<p class="home-police-note">Ready units ' + row.availableVehicles + ' · Recommended quantity ' + row.recommendedQuantity + ' · ' + esc(row.tradeoff) + '</p>' +
          '<button type="button" class="home-police-btn home-police-btn-plain" data-home-choose-vehicle="' + row.vehicleLevel + '" data-home-recommend-quantity="' + row.recommendedQuantity + '">USE THIS VEHICLE SETUP</button>' +
        '</article>'
      ).join('') : '<div class="home-police-alert">No unlocked, ready vehicle currently matches this mission and route. Buy an unlocked unit or service vehicles that are due.</div>';
      Array.from(g.document.querySelectorAll('[data-home-choose-vehicle]')).forEach(button => {
        button.onclick = () => {
          vehicleSelect.value = button.getAttribute('data-home-choose-vehicle');
          quantityInput.value = button.getAttribute('data-home-recommend-quantity') || '1';
          refresh();
        };
      });
      officerLabel.textContent = String(preview.requiredOfficers || 0);
      effectLabel.textContent = String(preview.effectiveness || 0) + ' / 100';
      fitNote.textContent = preview.mission && v ? preview.mission.name + ' · ' + preview.effectiveness + '% after route-fit and condition adjustments.' : 'Select a vehicle and mission.';
      availabilityLabel.textContent = preview.availableVehicles + ' vehicle(s) free';
      availabilityNote.textContent = preview.availableOfficers + ' unassigned officer(s) · ' + (v ? v.capacity + ' crew per vehicle' : 'no vehicle');
      quantityInput.max = String(Math.max(1, preview.availableVehicles || 1));
      deployButton.disabled = !preview.ok || use.fit < 20;
      if (!v) errorBox.textContent = 'No owned, unassigned vehicle is available. Purchase and receive one before deployment.';
      else if (preview.reason === 'INSUFFICIENT_UNASSIGNED_VEHICLES') errorBox.textContent = 'Not enough vehicles are free. Available for this tier: ' + preview.availableVehicles + '. Reduce the order quantity or stand down another assignment.';
      else if (preview.reason === 'INSUFFICIENT_UNASSIGNED_OFFICERS') errorBox.textContent = 'Not enough free officers for this assignment. ' + preview.availableOfficers + ' are available, but ' + preview.requiredOfficers + ' are required.';
      else if (use.fit < 20) errorBox.textContent = 'DEPLOYMENT BLOCKED: this vehicle is a poor match for the selected route. Choose a more suitable model or change the environment.';
      else if (preview.reason) errorBox.textContent = 'Deployment is blocked: ' + preview.reason.replace(/_/g, ' ').toLowerCase() + '.';
      else errorBox.textContent = 'Ready: ' + quantity + ' × ' + v.name + ' to ' + (preview.mission ? preview.mission.name : 'the selected mission') + '. Route fit ' + use.fit + '/100, estimated effectiveness ' + preview.effectiveness + '/100. Approximate wear over 30 simulation days: ' + (use.wearPerDay * 30).toFixed(1) + ' condition points.';
    };
    vehicleSelect.onchange = refresh;
    missionSelect.onchange = refresh;
    quantityInput.oninput = refresh;
    const updateRoadOptions = () => {
      const env = environments.find(row => row.id === environmentSelect.value) || environments[0];
      const previousRoad = roadSelect.value;
      const allowed = roads.filter(row => env.roadConditions.includes(row.id));
      roadSelect.innerHTML = allowed.map(row => '<option value="' + row.id + '">' + esc(row.name) + '</option>').join('');
      roadSelect.value = allowed.some(row => row.id === previousRoad) ? previousRoad : env.roadDefault;
      refresh();
    };
    environmentSelect.onchange = updateRoadOptions;
    roadSelect.onchange = refresh;
    assetSelect.onchange = () => {
      const asset = guardableAssets.find(row => row.id === assetSelect.value);
      if (asset) {
        if (!sectorInput.value.trim() || sectorInput.value.trim() === 'General Sector') sectorInput.value = asset.name;
        if (/factory|industrial|plant|smelt/i.test(String(asset.category || '') + ' ' + String(asset.name || ''))) {
          environmentSelect.value = 'industrial';
          roadSelect.value = 'rough';
          updateRoadOptions();
          return;
        }
      }
      refresh();
    };
    g.document.getElementById('home-police-guard-refresh').onclick = () => this.renderGuardOut(Number(vehicleSelect.value) || undefined, { environment: environmentSelect.value, road: roadSelect.value });
    deployButton.onclick = () => {
      const level = Math.floor(Number(vehicleSelect.value) || 0), quantity = Math.floor(Number(quantityInput.value) || 0), missionId = missionSelect.value;
      const result = e.deployGuard(level, quantity, missionId, sectorInput.value, e.getCurrentCountryId(), assetSelect.value || null, environmentSelect.value, roadSelect.value);
      if (!result.ok) { report(result); this.renderGuardOut(level); return; }
      report(result, 'GUARD DEPLOYMENT COMMITTED', result.deployment.quantity + ' × ' + result.vehicle + ' assigned to ' + result.mission + ' at ' + result.deployment.sector + '. ' + result.assignedOfficers + ' officers reserved; current mission rating ' + result.estimatedEffectiveness + ' / 100.');
      this.renderGuardOut(level, { environment: environmentSelect.value, road: roadSelect.value });
    };
    Array.from(g.document.querySelectorAll('[data-home-standdown]')).forEach(button => {
      button.onclick = () => {
        const id = button.getAttribute('data-home-standdown'), result = e.standDownGuard(id);
        if (!result.ok) { report(result); return; }
        report(result, 'GUARD UNIT STOOD DOWN', result.releasedVehicles + ' vehicle(s) and ' + result.releasedOfficers + ' officer(s) have returned to the available pool.');
        this.renderGuardOut();
      };
    });
    g.document.getElementById('home-police-guard-back').onclick = () => this.openPoliceCommand();
    updateRoadOptions();
  };

  ui.renderFleetMaintenance = function (filters) {
    injectStyles();
    const body = bodyNode(), e = engine();
    if (!body || !e) return;
    const options = Object.assign({ tier: 'all', status: 'all', page: 0 }, filters || {});
    const fleet = e.getVehicleFleet(), environments = e.getOperatingEnvironments();
    const filtered = fleet.filter(unit => {
      const tierMatch = options.tier === 'all' || Number(unit.vehicleLevel) === Number(options.tier);
      const statusMatch = options.status === 'all' || unit.status === options.status;
      return tierMatch && statusMatch;
    });
    const pageSize = 12, pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(pageCount - 1, Math.max(0, Math.floor(Number(options.page) || 0)));
    const visible = filtered.slice(page * pageSize, page * pageSize + pageSize);
    const counts = {
      total: fleet.length,
      deployed: fleet.filter(unit => unit.status === 'DEPLOYED').length,
      due: fleet.filter(unit => unit.status === 'MAINTENANCE_DUE').length,
      repair: fleet.filter(unit => unit.status === 'REPAIR_REQUIRED').length,
      ready: fleet.filter(unit => unit.status === 'AVAILABLE').length,
    };
    const statusName = { AVAILABLE: 'READY FOR SERVICE', DEPLOYED: 'ON GUARD DUTY', MAINTENANCE_DUE: 'SERVICE DUE', REPAIR_REQUIRED: 'REPAIR REQUIRED' };
    const cards = visible.map(unit => {
      const vehicle = e.VEHICLES.find(row => row.level === Number(unit.vehicleLevel));
      if (!vehicle) return '';
      const condition = Math.max(0, Math.min(100, Number(unit.condition) || 0));
      const deployed = unit.status === 'DEPLOYED';
      const serviceRequired = unit.status === 'MAINTENANCE_DUE' || unit.status === 'REPAIR_REQUIRED' || condition < 99;
      const cost = e.estimateVehicleRepairCost(unit);
      const use = unit.environmentAssessment;
      return '<article class="home-police-fleet-card">' +
        vehicleSvg(vehicle, 'fleet-' + unit.id) +
        '<span class="home-police-tag ' + (deployed ? '' : unit.status === 'AVAILABLE' ? 'home-police-tag-green' : 'home-police-tag-gold') + '">' + esc(statusName[unit.status] || unit.status) + '</span>' +
        '<h3>' + esc(vehicle.name) + '</h3><p class="home-police-note">' + esc(unit.id) + '</p>' +
        '<div class="home-police-score-line"><span>Vehicle condition</span><strong>' + condition.toFixed(1) + ' / 100</strong></div>' +
        '<div class="home-police-condition"><span style="width:' + condition + '%"></span></div>' +
        '<div class="home-police-fleet-meta">' +
          '<div>Odometer<strong>' + Math.round(Number(unit.odometerKm) || 0).toLocaleString() + ' km</strong></div>' +
          '<div>Next service<strong>' + Math.max(0, Math.round((Number(unit.nextServiceAtKm) || 0) - (Number(unit.odometerKm) || 0))).toLocaleString() + ' km remaining</strong></div>' +
          '<div>Daily upkeep<strong>' + money(e, vehicle.maintenancePerDay) + '</strong></div>' +
          '<div>Last route<strong>' + esc(unit.lastEnvironment || 'Not deployed') + ' · ' + esc(unit.lastRoadCondition || 'clear') + '</strong></div>' +
        '</div>' +
        (deployed ? '<div class="home-police-alert">Assigned to ' + esc(unit.deploymentMission || 'guard duty') + ' · ' + esc(unit.sector || 'General sector') + (use ? '<br>Route fit ' + use.fit + '/100 · estimated damage exposure ×' + use.damageRisk : '') + '. Stand down first if the unit must be serviced.</div>' : '') +
        '<div class="home-police-cost"><strong>' + money(e, cost) + '</strong><span>Estimated full repair / scheduled service</span></div>' +
        '<button type="button" class="home-police-btn ' + (serviceRequired ? 'home-police-btn-gold' : 'home-police-btn-plain') + '" data-home-service="' + esc(unit.id) + '" ' + (deployed || !serviceRequired ? 'disabled' : '') + '>' + (deployed ? 'VEHICLE CURRENTLY DEPLOYED' : serviceRequired ? '🧰 REPAIR & RETURN TO FULL CONDITION' : '✓ NO SERVICE REQUIRED') + '</button>' +
      '</article>';
    }).join('');
    const tierOptions = '<option value="all">All vehicle tiers</option>' + e.VEHICLES.map(v => '<option value="' + v.level + '"' + (options.tier !== 'all' && Number(options.tier) === v.level ? ' selected' : '') + '>Tier ' + v.level + ' · ' + esc(v.name) + '</option>').join('');
    const statusOptions = [['all','All statuses'],['AVAILABLE','Ready'],['DEPLOYED','On guard duty'],['MAINTENANCE_DUE','Service due'],['REPAIR_REQUIRED','Repair required']].map(row => '<option value="' + row[0] + '"' + (options.status === row[0] ? ' selected' : '') + '>' + row[1] + '</option>').join('');
    body.innerHTML =
      '<div class="home-police-shell">' +
        '<header class="home-police-head"><div class="home-police-orb">🧰</div><h1 class="home-police-title">FLEET HEALTH & MAINTENANCE</h1><p class="home-police-subtitle">Every owned vehicle has its own condition, odometer, service interval and deployable status. Poor route choices create real wear, lost uptime and repair cost.</p></header>' +
        '<div class="home-police-kpis">' +
          '<div class="home-police-kpi"><strong>' + counts.total + '</strong><span>Total fleet units</span></div>' +
          '<div class="home-police-kpi"><strong>' + counts.ready + '</strong><span>Ready</span></div>' +
          '<div class="home-police-kpi"><strong>' + counts.deployed + '</strong><span>On duty</span></div>' +
          '<div class="home-police-kpi"><strong>' + counts.due + '</strong><span>Service due</span></div>' +
          '<div class="home-police-kpi"><strong>' + counts.repair + '</strong><span>Needs repair</span></div>' +
        '</div>' +
        '<div class="home-police-panel"><div class="home-police-section-title">Fleet filters · low DOM workload</div>' +
          '<label class="home-police-label" for="home-police-fleet-tier">Vehicle model / tier</label><select id="home-police-fleet-tier" class="home-police-field">' + tierOptions + '</select>' +
          '<label class="home-police-label" for="home-police-fleet-status">Operational status</label><select id="home-police-fleet-status" class="home-police-field">' + statusOptions + '</select>' +
          '<p class="home-police-note">Showing ' + (filtered.length ? (page * pageSize + 1) + '–' + Math.min(filtered.length, (page + 1) * pageSize) : 0) + ' of ' + filtered.length + ' matching units. Only 12 vehicle cards are rendered per page for smooth low-end Android performance.</p>' +
        '</div>' +
        (cards ? '<div class="home-police-deployment-list">' + cards + '</div>' : '<div class="home-police-alert">No fleet units match these filters. Orders that are still in transit are not counted as owned vehicles.</div>') +
        '<div class="home-police-actions"><button id="home-police-fleet-prev" class="home-police-btn home-police-btn-plain" ' + (page <= 0 ? 'disabled' : '') + '>← PREVIOUS 12</button><button id="home-police-fleet-next" class="home-police-btn home-police-btn-plain" ' + (page >= pageCount - 1 ? 'disabled' : '') + '>NEXT 12 →</button></div>' +
        '<p class="home-police-note">Repairs and scheduled servicing restore condition and reset the service interval. Maintenance is blocked while a vehicle remains assigned to a live guard mission. Road damage can automatically stand a vehicle down and release its crew.</p>' +
        backButton('home-police-fleet-back', '← BACK TO FLEET COMMAND') +
      '</div>';
    const rerender = (pageNum) => this.renderFleetMaintenance({ tier: g.document.getElementById('home-police-fleet-tier').value, status: g.document.getElementById('home-police-fleet-status').value, page: pageNum });
    g.document.getElementById('home-police-fleet-tier').onchange = () => this.renderFleetMaintenance({ tier: g.document.getElementById('home-police-fleet-tier').value, status: g.document.getElementById('home-police-fleet-status').value, page: 0 });
    g.document.getElementById('home-police-fleet-status').onchange = () => this.renderFleetMaintenance({ tier: g.document.getElementById('home-police-fleet-tier').value, status: g.document.getElementById('home-police-fleet-status').value, page: 0 });
    g.document.getElementById('home-police-fleet-prev').onclick = () => rerender(page - 1);
    g.document.getElementById('home-police-fleet-next').onclick = () => rerender(page + 1);
    Array.from(g.document.querySelectorAll('[data-home-service]')).forEach(button => {
      button.onclick = () => {
        const id = button.getAttribute('data-home-service'), result = e.serviceVehicle(id);
        if (!result.ok) { report(result); return; }
        const vehicleName = e.VEHICLES.find(row => row.level === Number(result.vehicle.vehicleLevel))?.name || result.vehicle.id;
        report(result, 'VEHICLE SERVICE COMPLETE', vehicleName + ' is restored to full condition. Service cost: ' + money(e, result.serviceCost) + '.');
        this.renderFleetMaintenance(options);
      };
    });
    g.document.getElementById('home-police-fleet-back').onclick = () => this.renderUpgradeMenu();
  };

  ui.renderFacilitiesPanel = function (selectedId, showBuildForm) {
    injectStyles();
    const body = bodyNode(), e = engine();
    if (!body || !e) return;
    const s = e.getState(), selected = e.FACILITIES.find(f => f.id === selectedId) || e.FACILITIES[0];
    const levels = s.facilityLevels || {};
    const cards = e.FACILITIES.map(f => {
      const level = Number(levels[f.id]) || 0;
      return '<button type="button" class="home-police-card ' + (f.id === selected.id ? 'is-selected' : '') + '" data-home-facility="' + f.id + '">' +
        '<span class="home-police-card-emoji">' + f.emoji + '</span><span class="home-police-card-name">' + esc(f.name) + '</span><span class="home-police-tag ' + (level > 0 ? 'home-police-tag-green' : 'home-police-tag-gold') + '">LEVEL ' + level + '</span><span class="home-police-note">Base ' + money(e, f.baseCost) + '</span></button>';
    }).join('');
    const currentLevel = Number(levels[selected.id]) || 0;
    body.innerHTML =
      '<div class="home-police-shell"><header class="home-police-head"><div class="home-police-orb">🏗️</div><h1 class="home-police-title">POLICE FACILITY COMMAND GRID</h1><p class="home-police-subtitle">Select a facility node, set the number of levels, and review the total before committing construction.</p></header>' +
      '<div class="home-police-kpis"><div class="home-police-kpi"><strong>' + Object.values(levels).reduce((a, v) => a + (Number(v) || 0), 0) + '</strong><span>Aggregate facility levels</span></div><div class="home-police-kpi"><strong>' + currentLevel + '</strong><span>Selected facility level</span></div><div class="home-police-kpi"><strong>' + money(e, e.getTreasury().balance) + '</strong><span>Recorded treasury</span></div></div>' +
      '<div class="home-police-section-title">Infrastructure nodes</div><div class="home-police-grid">' + cards + '</div>' +
      '<section class="home-police-detail"><div class="home-police-detail-top"><div class="home-police-detail-emoji">' + selected.emoji + '</div><h3>' + esc(selected.name) + '</h3><span class="home-police-tag home-police-tag-gold">CURRENT LEVEL ' + currentLevel + '</span><p class="home-police-note">' + esc(selected.effect) + '</p></div>' +
        '<button type="button" id="home-police-facility-plus" class="home-police-plus" aria-label="Open construction quantity">+</button>' +
        '<div id="home-police-facility-build-form" style="display:' + (showBuildForm ? 'block' : 'none') + '">' +
          '<div class="home-police-form-row"><div class="home-police-field-wrap"><label class="home-police-label" for="home-police-facility-amount">Levels to build</label><input id="home-police-facility-amount" class="home-police-field" type="number" min="1" max="100" step="1" value="1" inputmode="numeric"></div><div class="home-police-cost"><strong id="home-police-facility-cost">' + money(e, e.estimateFacilityCost(selected.id, 1)) + '</strong><span>Total construction cost</span></div></div>' +
          '<p class="home-police-note">Cost increases with each additional level. Construction affects the active country and commits to the interior-ministry state.</p>' +
          '<div class="home-police-actions"><button id="home-police-build-facility" class="home-police-btn home-police-btn-green">🏗️ BUILD LEVELS</button><button id="home-police-facility-advice" class="home-police-btn home-police-btn-gold">🏛️ MINISTER ADVICE</button></div>' +
        '</div></section>' + backButton('home-police-facilities-back', '← BACK TO FLEET & FACILITY COMMAND') + '</div>';
    Array.from(g.document.querySelectorAll('[data-home-facility]')).forEach(button => {
      button.onclick = () => this.renderFacilitiesPanel(button.getAttribute('data-home-facility'), false);
    });
    g.document.getElementById('home-police-facility-plus').onclick = () => {
      const form = g.document.getElementById('home-police-facility-build-form');
      if (form.style.display === 'none') { form.style.display = 'block'; }
      else { form.style.display = 'none'; }
    };
    const input = g.document.getElementById('home-police-facility-amount');
    const cost = g.document.getElementById('home-police-facility-cost');
    input.oninput = () => { const n = Math.max(0, Math.min(100, Math.floor(Number(input.value) || 0))); cost.textContent = money(e, e.estimateFacilityCost(selected.id, n)); };
    g.document.getElementById('home-police-build-facility').onclick = () => {
      const amount = Math.floor(Number(input.value) || 0), result = e.buildFacility(selected.id, amount);
      if (!result.ok) { report(result); return; }
      report(result, 'FACILITY CONSTRUCTION COMMITTED', selected.name + ' advanced to Level ' + result.newLevel + '. Cost charged: ' + money(e, result.cost) + '.');
      this.renderFacilitiesPanel(selected.id, true);
    };
    g.document.getElementById('home-police-facility-advice').onclick = () => {
      const result = e.advice('facility', { id: selected.id });
      if (Number.isFinite(Number(result.amount))) input.value = result.amount;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      this.showAdvisePopup('MINISTER OF HOME AFFAIRS · FACILITY ADVICE', result.text);
    };
    g.document.getElementById('home-police-facilities-back').onclick = () => this.renderUpgradeMenu();
  };

  ui.renderTacticsMenu = function () {
    injectStyles();
    const body = bodyNode(), e = engine();
    if (!body || !e) return;
    const s = e.getState(), pending = s.pendingResearch;
    body.innerHTML =
      '<div class="home-police-shell"><header class="home-police-head"><div class="home-police-orb">🛡️</div><h1 class="home-police-title">ADVANCED POLICE OPERATIONS</h1><p class="home-police-subtitle">Research-linked doctrines, measurable training progression and cross-border intelligence collection.</p></header>' +
      '<div class="home-police-kpis"><div class="home-police-kpi"><strong>' + Math.round(s.policeEfficiency) + '%</strong><span>Police efficiency</span></div><div class="home-police-kpi"><strong>Level ' + s.trainingQualityLevel + '</strong><span>Training quality</span></div><div class="home-police-kpi"><strong>' + s.specialAgents + '</strong><span>Active agents</span></div></div>' +
      (pending ? '<div class="home-police-panel"><strong>🧪 RESEARCH IN PROGRESS</strong><p class="home-police-note">' + esc(pending.name) + '</p><div class="home-police-progress"><div id="home-police-research-progress" class="home-police-progress-fill" style="width:' + (e.getResearchProgress().progress) + '%"></div></div><p id="home-police-research-countdown" class="home-police-note">' + formatDuration(pending.completesAtMs - e.getSimulationTimeMs()) + ' remaining in simulation time</p></div>' : '') +
      '<div class="home-police-actions"><button id="home-police-open-research" class="home-police-btn home-police-btn-purple">🧬 TACTICAL RESEARCH</button><button id="home-police-open-training" class="home-police-btn home-police-btn-green">🎓 TRAINING QUALITY</button><button id="home-police-open-agents" class="home-police-btn home-police-btn-gold">🕵️ SPECIAL FORCES / INTELLIGENCE</button><button id="home-police-open-log" class="home-police-btn">📋 SECURITY INCIDENT LEDGER</button></div>' +
      '<p class="home-police-note">Tactics take simulation time and use treasury funds. Training cannot exceed Police Academy level. Agents improve event detection and reduce sabotage exposure, but they do not guarantee zero risk.</p>' +
      backButton('home-police-tactics-back', '← BACK TO POLICE COMMAND') + '</div>';
    g.document.getElementById('home-police-open-research').onclick = () => this.renderTacticsResearch();
    g.document.getElementById('home-police-open-training').onclick = () => this.renderTrainingFacilities();
    g.document.getElementById('home-police-open-agents').onclick = () => this.renderSpecialForces();
    g.document.getElementById('home-police-open-log').onclick = () => this.renderPoliceIncidentLog();
    g.document.getElementById('home-police-tactics-back').onclick = () => this.openPoliceCommand();
    bindGlobalProgressListener();
  };

  ui.renderTacticsResearch = function () {
    injectStyles(); bindGlobalProgressListener();
    const body = bodyNode(), e = engine();
    if (!body || !e) return;
    const s = e.getState(), pending = s.pendingResearch;
    const rows = e.TACTICS.map(t => {
      const done = Boolean(s.tacticsResearched[t.id]), active = Boolean(pending && pending.id === t.id), occupied = Boolean(pending && !active);
      return '<div class="home-police-panel"><div style="display:flex;align-items:center;gap:12px"><div style="font-size:29px">' + t.emoji + '</div><div style="flex:1;min-width:0"><strong style="color:#ffe2a0;font-size:12px">' + esc(t.name) + '</strong><p class="home-police-note">' + esc(t.effect) + '</p><span class="home-police-tag ' + (done ? 'home-police-tag-green' : 'home-police-tag-gold') + '">' + (done ? 'RESEARCHED' : active ? 'IN PROGRESS' : 'REQUIRES RESEARCH') + '</span></div></div><div class="home-police-divider"></div><p class="home-police-note">Research cost: ' + money(e, t.cost) + ' · Duration: ' + t.durationDays + ' simulation days · Efficiency +' + t.efficiency + ' · Risk −' + t.riskReduction + '</p><button type="button" class="home-police-btn home-police-btn-purple" data-home-tactic="' + t.id + '" ' + ((done || active || occupied) ? 'disabled' : '') + '>' + (done ? 'DOCTRINE ACTIVE' : active ? 'RESEARCH IN PROGRESS' : occupied ? 'ANOTHER PROJECT IN PROGRESS' : 'START RESEARCH') + '</button></div>';
    }).join('');
    body.innerHTML =
      '<div class="home-police-shell"><header class="home-police-head"><div class="home-police-orb">🧬</div><h1 class="home-police-title">TACTICAL RESEARCH DIRECTORATE</h1><p class="home-police-subtitle">Research completion updates national police effectiveness and security-risk calculations.</p></header>' +
      (pending ? '<div class="home-police-alert"><strong>Active project:</strong> ' + esc(pending.name) + '<div class="home-police-progress"><div id="home-police-research-progress" class="home-police-progress-fill" style="width:' + e.getResearchProgress().progress + '%"></div></div><div id="home-police-research-countdown" class="home-police-note">' + formatDuration(pending.completesAtMs - e.getSimulationTimeMs()) + ' remaining</div></div>' : '<div class="home-police-alert">No tactical research is currently running. Start one project at a time.</div>') +
      rows + backButton('home-police-research-back', '← BACK TO ADVANCED OPERATIONS') + '</div>';
    Array.from(g.document.querySelectorAll('[data-home-tactic]')).forEach(button => {
      button.onclick = () => {
        const id = button.getAttribute('data-home-tactic'), tactic = e.TACTICS.find(t => t.id === id), result = e.startResearch(id);
        if (!result.ok) report(result);
        else report(result, 'RESEARCH COMMISSIONED', tactic.name + ' is funded and running for ' + tactic.durationDays + ' simulation days. It becomes active only after completion.');
        this.renderTacticsResearch();
      };
    });
    g.document.getElementById('home-police-research-back').onclick = () => this.renderTacticsMenu();
  };

  ui.renderTrainingFacilities = function () {
    injectStyles();
    const body = bodyNode(), e = engine();
    if (!body || !e) return;
    const s = e.getState(), academy = Number(s.facilityLevels.academy) || 0, training = Number(s.trainingQualityLevel) || 1;
    body.innerHTML =
      '<div class="home-police-shell"><header class="home-police-head"><div class="home-police-orb">🎓</div><h1 class="home-police-title">POLICE TRAINING & READINESS</h1><p class="home-police-subtitle">Training is capped by academy capacity. Minister targets are explicit and separately controlled.</p></header>' +
      '<div class="home-police-kpis"><div class="home-police-kpi"><strong>Level ' + academy + '</strong><span>Academy capacity</span></div><div class="home-police-kpi"><strong>Level ' + training + '</strong><span>Training quality</span></div><div class="home-police-kpi"><strong>' + Math.round(s.policeEfficiency) + '%</strong><span>Police efficiency</span></div></div>' +
      '<div class="home-police-panel"><div class="home-police-section-title">1 · Facility target</div><label class="home-police-label" for="home-police-target-academy">Target Police Academy level</label><input id="home-police-target-academy" class="home-police-field" type="number" min="' + academy + '" max="100" step="1" value="' + Math.max(academy, academy + 1) + '" inputmode="numeric"><div class="home-police-actions"><button id="btn-up-acad-fac" class="home-police-btn home-police-btn-gold">🏗️ OPEN FACILITY GRID</button><button id="home-police-academy-advice" class="home-police-btn">GET FACILITY ADVICE</button></div></div>' +
      '<div class="home-police-panel"><div class="home-police-section-title">2 · Training target</div><label class="home-police-label" for="home-police-target-training">Target training quality level</label><input id="home-police-target-training" class="home-police-field" type="number" min="' + training + '" max="100" step="1" value="' + Math.min(100, training + 1) + '" inputmode="numeric"><p class="home-police-note">' + (academy <= training ? 'Academy capacity must be increased before the next training level can be unlocked.' : 'Current academy capacity supports training up to Level ' + academy + '.') + '</p><div class="home-police-actions"><button id="btn-up-drill-qual" class="home-police-btn home-police-btn-green" ' + (academy <= training ? 'disabled' : '') + '>🎯 UPGRADE TRAINING QUALITY</button><button id="home-police-training-advice" class="home-police-btn home-police-btn-gold">GET TRAINING ADVICE</button></div></div>' +
      '<div class="home-police-alert">Minister target fields are independent. The directive builds the academy first, then applies the training target only if the academy cap and available treasury permit it. Partial completion is reported rather than disguised.</div>' +
      '<div class="home-police-actions"><button id="btn-training-minister" class="home-police-btn home-police-btn-purple">🏛️ ISSUE MINISTER DIRECTIVE</button></div>' +
      backButton('btn-back-tactics', '← BACK TO ADVANCED OPERATIONS') + '</div>';
    g.document.getElementById('btn-up-acad-fac').onclick = () => this.renderFacilitiesPanel('academy', true);
    g.document.getElementById('btn-up-drill-qual').onclick = () => {
      const target = Math.floor(Number(g.document.getElementById('home-police-target-training').value) || 0), result = e.upgradeTraining(target);
      if (!result.ok) report(result);
      else report(result, 'TRAINING STANDARD UPGRADED', 'Training quality advanced to Level ' + target + '. Cost charged: ' + money(e, result.cost) + '.');
      this.renderTrainingFacilities();
    };
    g.document.getElementById('home-police-academy-advice').onclick = () => {
      const target = Math.max(academy, Math.floor(Number(g.document.getElementById('home-police-target-academy').value) || academy + 1));
      const count = target - academy, cost = e.estimateFacilityCost('academy', count);
      const treasury = e.getTreasury();
      const text = count <= 0 ? 'The selected academy level does not exceed the current level.' : !treasury.available ? 'Treasury is unavailable, so the academy plan cannot be funded or certified.' : 'Minister advice: raise the academy from Level ' + academy + ' to Level ' + target + '. Estimated construction cost: ' + money(e, cost) + '. Available treasury: ' + money(e, treasury.balance) + '.';
      this.showAdvisePopup('MINISTER · FACILITY TARGET', text);
    };
    g.document.getElementById('home-police-training-advice').onclick = () => {
      const target = Math.max(training, Math.floor(Number(g.document.getElementById('home-police-target-training').value) || training + 1)), result = e.advice('training', { target: target });
      if (result.target > 0) g.document.getElementById('home-police-target-training').value = result.target;
      this.showAdvisePopup('MINISTER · TRAINING TARGET', result.text);
    };
    g.document.getElementById('btn-training-minister').onclick = () => {
      const facilityTarget = Math.max(0, Math.floor(Number(g.document.getElementById('home-police-target-academy').value) || 0));
      const trainingTarget = Math.max(0, Math.floor(Number(g.document.getElementById('home-police-target-training').value) || 0));
      const result = e.issueMinisterDirective(facilityTarget, trainingTarget);
      if (!result.ok) this.showAdvisePopup('MINISTER DIRECTIVE PARTIALLY EXECUTED', (result.message || failMessage(result)) + (result.actions && result.actions.length ? ' Completed steps: ' + result.actions.join('; ') : ''));
      else this.showAdvisePopup('MINISTER DIRECTIVE COMPLETED', result.actions.join('\n') + ' Total committed expenditure: ' + money(e, result.cost) + '.');
      this.renderTrainingFacilities();
    };
    g.document.getElementById('btn-back-tactics').onclick = () => this.renderTacticsMenu();
  };

  ui.renderSpecialForces = function () {
    injectStyles();
    const body = bodyNode(), e = engine();
    if (!body || !e) return;
    const s = e.getState(), recent = s.incidentLedger.slice(-5).reverse(), targets = e.getAvailableCountries(), targetOptions = targets.map(id => '<option value="' + esc(id) + '">' + esc(id) + '</option>').join(''), deployments = Object.keys(s.agentDeployments || {}).filter(id => id !== 'UNASSIGNED' && Number(s.agentDeployments[id]) > 0).map(id => '<span class="home-police-tag home-police-tag-green">' + esc(id) + ' · ' + Number(s.agentDeployments[id]) + ' AGENT(S)</span>').join(' '), intel = s.intelligenceReports.slice(-5).reverse();
    body.innerHTML =
      '<div class="home-police-shell"><header class="home-police-head"><div class="home-police-orb">🕵️</div><h1 class="home-police-title">SPECIAL FORCES & INTELLIGENCE</h1><p class="home-police-subtitle">Cross-border intelligence collection, threat detection and early warning for riots, smuggling and industrial sabotage.</p></header>' +
      '<div class="home-police-kpis"><div class="home-police-kpi"><strong>' + Number(s.specialAgents).toLocaleString() + '</strong><span>Active agents</span></div><div class="home-police-kpi"><strong>' + Math.round(s.sabotageRisk) + '%</strong><span>Recorded threat exposure</span></div><div class="home-police-kpi"><strong>' + money(e, s.specialAgents * e.AGENT_SALARY_PER_DAY) + '</strong><span>Daily agent payroll</span></div></div>' +
      '<div class="home-police-panel"><p class="home-police-note">Agents collect fictional game-world intelligence on rival networks and hostile events. They lower modeled exposure and raise event-detection probability; intelligence does not make every threat disappear.</p><label class="home-police-label" for="home-police-agent-target">Foreign intelligence target country</label><select id="home-police-agent-target" class="home-police-field" ' + (targets.length ? '' : 'disabled') + '>' + (targets.length ? targetOptions : '<option value="">No rival country records loaded</option>') + '</select><p class="home-police-note">Agents are assigned to the selected recorded rival country. The engine only reports fields that exist in the game state.</p><label class="home-police-label" for="home-police-agent-amount">Number of special agents to recruit</label><div class="home-police-form-row"><div class="home-police-field-wrap"><input id="home-police-agent-amount" class="home-police-field" type="number" min="1" max="100" step="1" value="1" inputmode="numeric"></div><div class="home-police-cost"><strong id="home-police-agent-cost">' + money(e, e.AGENT_RECRUITMENT_COST) + '</strong><span>Recruitment cost</span></div></div>' +
      '<p id="home-police-agent-daily-cost" class="home-police-note">Added daily operating cost: ' + money(e, e.AGENT_SALARY_PER_DAY) + ' per agent.</p><div class="home-police-actions"><button id="home-police-recruit-agent" class="home-police-btn home-police-btn-purple" ' + (targets.length ? '' : 'disabled') + '>🕵️ RECRUIT AGENTS</button><button id="home-police-agent-advice" class="home-police-btn home-police-btn-gold">🏛️ MINISTER ADVICE</button></div></div>' +
      '<div class="home-police-section-title">Cross-border deployments</div>' + (deployments ? '<div class="home-police-panel">' + deployments + '</div>' : '<div class="home-police-alert">No foreign deployments have been assigned yet.</div>') + '<div class="home-police-section-title">Latest intelligence reports</div>' + (intel.length ? '<div class="home-police-incidents">' + intel.map(x => '<div class="home-police-incident"><strong>' + esc(x.targetCountryId) + '</strong> · ' + esc(x.assessment) + '<br>Confidence ' + x.confidencePercent + '% · observed fields ' + x.observations.length + '<br>Turn ' + x.simulationTurn + '</div>').join('') + '</div>' : '<div class="home-police-alert">Reports are collected on simulation-week boundaries when agents are assigned to an existing foreign country.</div>') + '<div class="home-police-section-title">Latest security incidents</div>' +
      (recent.length ? '<div class="home-police-incidents">' + recent.map(x => '<div class="home-police-incident"><strong>' + esc(x.type.replace(/_/g, ' ')) + '</strong> · ' + esc(x.status) + '<br>Week ' + x.simulationWeek + ' · ' + (x.detected ? 'Detected and contained' : 'Response required') + (x.assetImpact && x.assetImpact.assetId ? '<br>Recorded asset impact: ' + esc(x.assetImpact.assetId) : '') + '</div>').join('') + '</div>' : '<div class="home-police-alert">No security incidents are recorded for this country yet. The incident ledger updates at simulation-time intervals.</div>') +
      backButton('home-police-agents-back', '← BACK TO ADVANCED OPERATIONS') + '</div>';
    const input = g.document.getElementById('home-police-agent-amount'), cost = g.document.getElementById('home-police-agent-cost'), daily = g.document.getElementById('home-police-agent-daily-cost');
    input.oninput = () => { const n = Math.max(0, Math.min(100, Math.floor(Number(input.value) || 0))); cost.textContent = money(e, n * e.AGENT_RECRUITMENT_COST); daily.textContent = 'Added daily operating cost: ' + money(e, n * e.AGENT_SALARY_PER_DAY) + ' per simulation day.'; };
    g.document.getElementById('home-police-recruit-agent').onclick = () => {
      const amount = Math.floor(Number(input.value) || 0), targetCountry = g.document.getElementById('home-police-agent-target').value, result = e.recruitAgents(amount, e.getCurrentCountryId(), targetCountry);
      if (!result.ok) report(result);
      else report(result, 'INTELLIGENCE NETWORK EXPANDED', amount + ' agent(s) recruited. Added daily operating cost: ' + money(e, amount * e.AGENT_SALARY_PER_DAY) + '. Recorded threat exposure now ' + result.newSabotageRisk + '%.');
      this.renderSpecialForces();
    };
    g.document.getElementById('home-police-agent-advice').onclick = () => {
      const result = e.advice('specialAgents');
      if (Number.isFinite(Number(result.amount))) input.value = result.amount;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      this.showAdvisePopup('MINISTER OF HOME AFFAIRS · INTELLIGENCE ADVICE', result.text);
    };
    g.document.getElementById('home-police-agents-back').onclick = () => this.renderTacticsMenu();
  };

  ui.renderPoliceIncidentLog = function () {
    injectStyles();
    const body = bodyNode(), e = engine();
    if (!body || !e) return;
    const s = e.getState(), rows = s.incidentLedger.slice().reverse();
    body.innerHTML =
      '<div class="home-police-shell"><header class="home-police-head"><div class="home-police-orb">📋</div><h1 class="home-police-title">SECURITY INCIDENT LEDGER</h1><p class="home-police-subtitle">Simulation events, detection outcomes and recorded asset impacts.</p></header>' +
      '<div class="home-police-kpis"><div class="home-police-kpi"><strong>' + rows.length + '</strong><span>Recorded events</span></div><div class="home-police-kpi"><strong>' + rows.filter(x => x.detected).length + '</strong><span>Detected / contained</span></div><div class="home-police-kpi"><strong>' + rows.filter(x => !x.detected).length + '</strong><span>Need response</span></div></div>' +
      (rows.length ? '<div class="home-police-incidents">' + rows.map(x => '<div class="home-police-incident"><strong>' + esc(x.type.replace(/_/g, ' ')) + '</strong> · ' + esc(x.status) + '<br>Simulation week ' + x.simulationWeek + ' · turn ' + x.simulationTurn + '<br>Exposure at event: ' + x.baselineRiskPercent + '% · agent/tactic mitigation: ' + x.mitigationPercent + '% · guard coverage: ' + (Number(x.guardMitigationPercent) || 0) + '%' + (x.targetAssetName ? '<br>Incident target: ' + esc(x.targetAssetName) + (x.targetAssetId ? ' · ' + esc(x.targetAssetId) : '') : '<br>Incident target asset: no eligible recorded asset') + (x.assetImpact && x.assetImpact.assetId ? '<br>Actual recorded asset impacted: ' + esc(x.assetImpact.assetId) + ' · ' + esc(x.assetImpact.condition) : '') + '</div>').join('') + '</div>' : '<div class="home-police-alert">No incidents recorded. Missing asset data is never represented as a destroyed factory.</div>') +
      backButton('home-police-log-back', '← BACK TO POLICE COMMAND') + '</div>';
    g.document.getElementById('home-police-log-back').onclick = () => this.openPoliceCommand();
  };

  injectStyles();
  bindGlobalProgressListener();
  g.__OMEGA_HOME_POLICE_UI_READY__ = true;
})(typeof window !== 'undefined' ? window : globalThis);
