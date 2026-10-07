  const FILE_ROUTES=Object.freeze({
    country:{files:['countries.json'],recordKeys:['code','iso2','iso3','name','officialName']},
    economy:{files:['economy.json'],recordKeys:['country key','gdp','gdp_growth','inflation','unemployment_rate','budget_balance','debt','trade_balance','reserves']},
    population:{files:['population.json'],recordKeys:['country key','population_2015','annual_growth_rate','birth_rate','death_rate','migration_rate','urbanization_rate']},
    cities:{files:['cities.json'],recordKeys:['countries[]','name','capital','cities','economic','military','secret']},
    relations:{files:['relations.json'],recordKeys:['country -> target','overall','trade','political','military','intelligence','trust','dependency','border_tension','trade_agreement','defense_pact','alliance','sanctions','war_state']},
    trade:{files:['relations.json'],recordKeys:['country -> target','overall','trade','political','military','intelligence','trust','dependency','border_tension','trade_agreement','defense_pact','alliance','sanctions','war_state']},
    resources:{files:['resources_2.json','resources.json'],recordKeys:['resource_types','GSRSK_Master_CountryProfiles_v14.countryProfiles','srie_database']},
    finance:{files:['Game.state only'],recordKeys:['finance.*']},
    industry:{files:['Game.state only'],recordKeys:['economy.production','economy.productionCapacity','industry.*']},
    infrastructure:{files:['Game.state only'],recordKeys:['transport.*','infrastructure.*']},
    military:{files:['Game.state only'],recordKeys:['military.*','defense.*']},
    intelligence:{files:['Game.state only'],recordKeys:['intelligence.*']}
  });

  const DECISION_WEIGHTS=Object.freeze({