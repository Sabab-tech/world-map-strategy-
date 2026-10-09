import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../omega_resource_strategic_logistics_v1.js',import.meta.url),'utf8');
let turn=1;
const site={siteId:'SITE_BGD_barapukuria_coal_mine',countryId:'BGD',siteName:'Barapukuria Coal Mine',real:{resourceId:'coal'},sourceSiteRecord:{resourceId:'coal',commercialExtraction:true},simulation:{transportRoute:[]}};
const factory={id:'FAC-BGD-STEEL-1',countryId:'BGD',locationNodeKey:'FACTORY:BGD:FAC-BGD-STEEL-1',capacity:1000,inputCoefficients:{coal:1},outputProfile:{steel:0.5}};
const state={simulation:{turn:turn,year:2015,daysPerTurn:30},transport:{},resource:{BGD:{warehouse:{availableByResource:{},reservedByResource:{}},inventory:{},industrialNetwork:{shipments:[],reservations:{},deliveries:[]}}},economy:{BGD:{productionAssets:[factory]}},diplomacy:{}};
const routeMap={siteCount:199,commercialSiteCount:195,records:[{siteId:site.siteId,countryId:'BGD',siteName:site.siteName,resourceId:'coal',commercialExtraction:true,factoryBinding:{acceptedInputResourceId:'coal'},sourceNodeKey:'MINE:BGD:'+site.siteId,sourceCoordinates:{lat:25.5,lng:88.9},routeModel:{primaryMode:'ROAD'}}]};
const base={
 planShipment(input){return{status:'PLANNED',countryId:'BGD',siteId:input.siteId||site.siteId,resourceId:'coal',factoryId:factory.id,recipe:{inputs:{coal:1},outputs:{steel:.5}},route:{requestedQuantity:Number(input.quantity)||500,dispatchQuantity:Number(input.quantity)||500,etaTurn:turn+1,travelTimeDays:1,legs:[]}};},
 dispatchShipment(input){const qty=Number(input.quantity)||500, id='SHIP-TEST-'+turn;const r=state.resource.BGD;r.warehouse.reservedByResource.coal=(r.warehouse.reservedByResource.coal||0)+qty;const shipment={shipmentId:id,countryId:'BGD',siteId:site.siteId,resourceId:'coal',factoryId:factory.id,quantity:qty,status:'IN_TRANSIT',etaTurn:turn+1,route:{},reservationId:id};r.industrialNetwork.shipments.push(shipment);r.industrialNetwork.reservations[id]={resourceId:'coal',quantity:qty,status:'RESERVED'};return{status:'DISPATCHED',shipment};},
 advanceShipments(countryId){const r=state.resource[countryId],delivered=[];for(const s of r.industrialNetwork.shipments){if(s.status!=='IN_TRANSIT'||s.etaTurn>turn)continue;s.status='DELIVERED';s.deliveredTurn=turn;delivered.push(JSON.parse(JSON.stringify(s)));r.industrialNetwork.deliveries.push(JSON.parse(JSON.stringify(s)));}return{status:'ADVANCED',countryId,delivered:delivered.length,shipments:delivered};},
 executeFactoryCycle({countryId,factoryId,resourceId,quantity}){const r=state.resource[countryId],qty=Number(quantity)||0;if((r.inventory[resourceId]||0)<qty)return{status:'BLOCKED',reason:'FACTORY_INPUT_SHORTAGE'};r.inventory[resourceId]-=qty;r.inventory.steel=(r.inventory.steel||0)+qty*.5;return{status:'COMPLETED',factoryId,resourceId,inputQuantity:qty,outputs:{steel:qty*.5}};}
};
const ctx={Omega:{ResourceIndustrialNetwork:base,ResourceSiteMasterResearchData:{sites:[site]},ResourceSiteFactoryRouteMapData:routeMap,ResourceScenarioEngineeringData:{records:[{siteId:site.siteId,countryId:'BGD',resourceId:'coal',unit:'TONNES',nominalCapacity:100,minimumCapacity:50,maximumCapacity:150,utilization:.8,recovery:.9,decline:.01,maintenance:.1,scenarioLifeYears:100}]}},Game:{state},OmegaResourceSiteMasterResearchData:{sites:[site]},OmegaResourceSiteFactoryRouteMapData:routeMap,OmegaResourceScenarioEngineeringData:{records:[{siteId:site.siteId,countryId:'BGD',resourceId:'coal',unit:'TONNES',nominalCapacity:100,minimumCapacity:50,maximumCapacity:150,utilization:.8,recovery:.9,decline:.01,maintenance:.1,scenarioLifeYears:100}]}};
ctx.globalThis=ctx;ctx.CustomEvent=function(name,opts){this.type=name;this.detail=opts?.detail};ctx.dispatchEvent=()=>true;ctx.addEventListener=()=>{};vm.createContext(ctx);vm.runInContext(source,ctx);
const N=ctx.Omega.ResourceIndustrialNetwork;

// 1. Automatic extraction creates per-site warehouse stock.
const extraction=N.simulateExtractionTurn({countryId:'BGD',siteId:site.siteId,resourceId:'coal'});
assert.equal(extraction.status,'PRODUCED');assert.ok(extraction.quantity>0);
assert.equal(state.resource.BGD.warehouse.availableByResource.coal,extraction.quantity);

// 2. The exact site/factory pair gets its own route graph.
const planned=N.planShipment({countryId:'BGD',siteId:site.siteId,resourceId:'coal',factoryId:factory.id,quantity:Math.min(500,extraction.quantity)});
assert.equal(planned.status,'PLANNED');assert.equal(planned.route.routeModel,'STRATEGIC_NETWORK_GRAPH');
assert.equal(planned.route.sourceSiteId,site.siteId);assert.equal(planned.route.destinationFactoryId,factory.id);
assert.ok(planned.route.legs.length>0);assert.ok(planned.route.legs.every(x=>x.authority==='MODELED'));

// 3. Dispatch creates an in-transit shipment. Destroying its road must prevent arrival.
const sent=N.dispatchShipment({countryId:'BGD',siteId:site.siteId,resourceId:'coal',factoryId:factory.id,quantity:Math.min(500,extraction.quantity)});
assert.equal(sent.status,'DISPATCHED');assert.equal(sent.shipment.status,'IN_TRANSIT');
const edgeId=sent.shipment.route.legs[0].edgeId;
assert.equal(N.setEdgeCondition({countryId:'BGD',edgeId,action:'DESTROY'}).status,'APPLIED');
turn=2;state.simulation.turn=turn;
const blocked=N.advanceShipments('BGD');
assert.equal(blocked.delivered,0,'destroyed route must stop delivery');
assert.equal(state.resource.BGD.industrialNetwork.shipments[0].status,'IN_TRANSIT');

// 4. Repair and advance the same session: warehouse stock is settled into factory inventory.
assert.equal(N.setEdgeCondition({countryId:'BGD',edgeId,action:'REPAIR'}).status,'APPLIED');
turn=3;state.simulation.turn=turn;
const arrived=N.advanceShipments('BGD');
assert.equal(arrived.delivered,1);
assert.ok(state.resource.BGD.inventory.coal>0);
assert.ok(state.resource.BGD.warehouse.availableByResource.coal<extraction.quantity);
assert.equal(state.resource.BGD.warehouse.reservedByResource.coal,0);

// 5. The factory consumes the delivered input and emits final output.
const qty=state.resource.BGD.inventory.coal;
const produced=N.executeFactoryCycle({countryId:'BGD',factoryId:factory.id,resourceId:'coal',quantity:qty});
assert.equal(produced.status,'COMPLETED');
assert.equal(state.resource.BGD.inventory.coal,0);
assert.ok(state.resource.BGD.inventory.steel>0);

// 6. Non-commercial placeholder sites cannot produce resources.
routeMap.records.push({siteId:'SITE_MCO_no_verified_commercial_mining_site',countryId:'MCO',resourceId:null,commercialExtraction:false,factoryBinding:null});
ctx.Omega.ResourceSiteMasterResearchData.sites.push({siteId:'SITE_MCO_no_verified_commercial_mining_site',countryId:'MCO'});
const noMine=N.simulateExtractionTurn({countryId:'MCO',siteId:'SITE_MCO_no_verified_commercial_mining_site'});
assert.equal(noMine.status,'BLOCKED');
console.log('OMEGA CONNECTED EXTRACTION→WAREHOUSE→ROUTE DAMAGE→DELIVERY→FACTORY OUTPUT TEST PASSED');
