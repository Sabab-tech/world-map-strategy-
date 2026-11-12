/* OMEGA SANCTION RESPONSE + NATIONAL DECISION PIPELINE v1.0.0
 * Records an auditable policy -> notification -> impact -> decision -> recovery -> investigation flow.
 * Analysis only: no cash, inventory, trade, production, treaty or diplomatic value is mutated here.
 */
(function (g) {
  'use strict';
  const VERSION = '1.1.0';
  if (g.OmegaSanctionResponseRuntime?.VERSION === VERSION) return;
  const MAX_POLICIES = 6, MAX_PRODUCTS = 4, MAX_MARKET_QUERIES = 12;
  const LEDGER_WINDOW = 30, MAX_HISTORY = 256, MAX_ALTERNATIVES = 5, MAX_BUYER_CHECKS = 3;
  const MAX_SUPPLIER_COUNTRIES_PER_POLICY = 3, MAX_SUPPLIER_COUNTRIES_PER_TURN = 6;
  const MAX_SUPPLIER_INVESTIGATIONS_PER_TURN = 6;
  const num = v => v === null || v === undefined || v === '' ? null :
    (Number.isFinite(Number(v)) ? Number(v) : null);
  const nn = v => { const n = num(v); return n === null ? null : Math.max(0, n); };
  const clamp = (value, min = 0, max = 1) => {
    const n = num(value);
    return n === null ? min : Math.max(min, Math.min(max, n));
  };
  const token = v => String(v ?? '').normalize('NFKC').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const clone = v => { try { return v == null ? v : JSON.parse(JSON.stringify(v)); } catch (_) { return null; } };
  const state = () => g.Game?.state || g.gameState || g.Omega?.Simulation?.world?.state || {};
  const turn = () => num(state()?.simulation?.turn ?? state()?.turn ??
    state()?.simulationTurn ?? g.Omega?.Simulation?.clock?.turn) ?? 0;
  const mesh = () => g.Omega?.MinistryInteroperability || g.OmegaMinistryInteroperability || null;
  const market = () => g.OmegaGlobalMarket || g.Omega?.GlobalMarket || null;
  const bank = () => g.OmegaGovernmentBanking || g.Omega?.GovernmentBanking || null;
  const transmission = () => g.OmegaEconomicTransmissionRuntime || g.Omega?.EconomicTransmissionRuntime || g.Omega?.EconomicTransmission || null;
  const network = () => g.OmegaBlackMarketNetworkV1 || g.Omega?.BlackMarketNetworkV1 || null;
  const identity = () => g.OmegaCanonicalIdentityRegistry || g.OmegaCountrySemanticBridge || g.Omega?.CanonicalIdentity || null;

  function country(v) {
    const raw = v && typeof v === 'object'
      ? (v.iso3 || v.iso3Code || v.countryCode || v.countryId || v.country_id || v.code || v.id || v.name) : v;
    if (raw == null) return '';
    try {
      const r = identity()?.resolveCountry?.(raw);
      const resolved = r?.raw?.iso3 || r?.iso3 || r?.iso3Code || r?.id || r?.canonicalId;
      if (resolved && /^[A-Z0-9]{2,3}$/i.test(String(resolved))) return String(resolved).toUpperCase();
    } catch (_) {}
    const id = String(raw).trim().toUpperCase();
    return /^[A-Z0-9]{2,3}$/.test(id) ? id : '';
  }
  function bucket(domain, c) {
    const root = state()?.[domain], id = country(c);
    if (!root || typeof root !== 'object' || Array.isArray(root) || !id) return {};
    const key = Object.keys(root).find(k => country(k) === id);
    return key === undefined ? {} : (root[key] || {});
  }
  function countries(domain) {
    const root = state()?.[domain];
    return root && typeof root === 'object' && !Array.isArray(root)
      ? Object.keys(root).map(country).filter(Boolean) : [];
  }
  function worldCountries() {
    const ids = new Set();
    for (const domain of ['trade', 'foreign', 'resource', 'finance', 'economy', 'transport'])
      countries(domain).forEach(id => ids.add(id));
    try {
      const rows = identity()?.list?.('COUNTRY') || identity()?.list?.() || [];
      rows.forEach(row => { const id = country(row); if (id) ids.add(id); });
    } catch (_) {}
    return [...ids].sort();
  }
  function field(map, id) {
    if (!map || typeof map !== 'object') return undefined;
    const key = Object.keys(map).find(k => token(k) === token(id));
    return key === undefined ? undefined : map[key];
  }
  function first(...values) {
    for (const value of values) { const n = num(value); if (n !== null) return n; }
    return null;
  }
  function relation(a, b) {
    return field(bucket('foreign', a).relations, b) ||
      field(bucket('trade', a).relations, b) ||
      field(bucket('foreign', b).relations, a) ||
      field(bucket('trade', b).relations, a) || null;
  }
  function active(row) {
    if (!row || typeof row !== 'object') return false;
    if (/EXPIRED|REVOKED|INACTIVE|CANCELLED|LIFTED|TERMINATED/.test(
      String(row.status || row.stage || 'ACTIVE').toUpperCase())) return false;
    const start = first(row.startTurn, row.effectiveTurn, row.issuedTurn, row.createdTurn);
    const end = first(row.endTurn, row.expiresTurn, row.expiryTurn);
    return (start === null || start <= turn()) && (end === null || turn() <= end);
  }
  function hash(value) {
    let h = 2166136261;
    for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36).toUpperCase();
  }
  function resourceIds(row) {
    const ids = [];
    const primary = row?.resourceId || row?.commodityId || row?.productId;
    if (primary) ids.push(String(primary));
    for (const id of Array.isArray(row?.resourceIds) ? row.resourceIds : []) if (id) ids.push(String(id));
    return [...new Map(ids.map(id => [token(id), id])).values()].slice(0, MAX_PRODUCTS);
  }
  function policies() {
    const result = new Map();
    for (const owner of worldCountries()) {
      const tradeState = bucket('trade', owner), foreignState = bucket('foreign', owner);
      const policyRows = [
        ...(Array.isArray(tradeState.sanctions) ? tradeState.sanctions : []),
        ...(Array.isArray(foreignState.sanctions) ? foreignState.sanctions : []),
        ...(Array.isArray(tradeState.resourceEmbargoes) ? tradeState.resourceEmbargoes : []),
        ...(Array.isArray(foreignState.resourceEmbargoes) ? foreignState.resourceEmbargoes : [])
      ];
      for (const row of policyRows) {
        if (!active(row)) continue;
        const target = country(row.targetCountryId || row.subjectCountryId ||
          row.targetCountry || row.countryId || row.targetId);
        const issuer = country(row.issuerCountryId || row.issuingCountryId || row.sourceCountryId) || owner;
        if (!issuer || !target || issuer === target) continue;
        const products = resourceIds(row);
        const policyId = String(row.policyId || row.sanctionId || row.id || '').trim();
        const type = String(row.type || row.measure || row.scope || 'SANCTIONS').toUpperCase();
        const direction = String(row.direction || row.tradeDirection ||
          (/EXPORT/.test(type) ? 'EXPORT' : (/IMPORT/.test(type) ? 'IMPORT' : 'BOTH'))).toUpperCase();
        const start = first(row.startTurn, row.effectiveTurn, row.issuedTurn, row.createdTurn);
        const signature = [issuer, target, policyId || 'NO_ID', type, direction,
          start === null ? 'UNSPECIFIED_START' : start,
          products.map(token).join(',')].join('|');
        const policyKey = 'SAN-' + hash(signature);
        const old = result.get(policyKey);
        if (old) old.resourceIds = [...new Set(old.resourceIds.concat(products))].slice(0, MAX_PRODUCTS);
        else result.set(policyKey, {
          policyKey, policyId: policyId || policyKey, issuerCountryId: issuer,
          targetCountryId: target, type, direction, startTurn: start,
          endTurn: first(row.endTurn, row.expiresTurn, row.expiryTurn),
          secondarySanctions: row.secondarySanctions === true ||
            /SECONDARY|EXTRATERRITORIAL/.test(type + ' ' + direction + ' ' + String(row.scope || '')),
          resourceIds: products, status: String(row.status || 'ACTIVE').toUpperCase()
        });
      }
    }
    return [...result.values()].sort((a, b) =>
      a.startTurn - b.startTurn || a.policyKey.localeCompare(b.policyKey));
  }
  function ledger(rows, predicate) {
    const selected = (Array.isArray(rows) ? rows : []).filter(row => {
      if (!row || typeof row !== 'object' || !predicate(row)) return false;
      const t = first(row.turn, row.recordedTurn, row.settlementTurn);
      return t === null || (t >= turn() - LEDGER_WINDOW && t <= turn());
    });
    const dated = selected.filter(row => first(row.turn, row.recordedTurn, row.settlementTurn) !== null);
    const quantities = selected.map(row => nn(row.quantity)).filter(v => v !== null);
    const valueByCurrency = {}, missingCurrencyValueRows = [];
    for (const row of selected) {
      const value = nn(row.totalValue ?? row.value ?? row.settlementValue ?? row.amount);
      if (value === null) continue;
      const currency = String(row.currency || row.currencyCode || row.valueCurrency || '').trim().toUpperCase();
      if (!currency) { missingCurrencyValueRows.push(value); continue; }
      valueByCurrency[currency] = (valueByCurrency[currency] || 0) + value;
    }
    const currencies = Object.keys(valueByCurrency);
    const oneCurrency = currencies.length === 1 && missingCurrencyValueRows.length === 0;
    return {
      recordCount: selected.length, datedRecordCount: dated.length,
      unscopedRecordCount: selected.length - dated.length,
      quantity: quantities.length ? Number(quantities.reduce((a, b) => a + b, 0).toFixed(6)) : null,
      value: oneCurrency ? Number(valueByCurrency[currencies[0]].toFixed(6)) : null,
      currency: oneCurrency ? currencies[0] : null,
      valueByCurrency: Object.fromEntries(Object.entries(valueByCurrency).map(([key, value]) =>
        [key, Number(value.toFixed(6))])),
      currencyStatus: oneCurrency ? 'SINGLE_CURRENCY' :
        (currencies.length || missingCurrencyValueRows.length ? 'MIXED_OR_UNATTRIBUTED_CURRENCY' : 'NO_VALUE_RECORDED'),
      unattributedCurrencyValue: missingCurrencyValueRows.length
        ? Number(missingCurrencyValueRows.reduce((a, b) => a + b, 0).toFixed(6)) : null,
      settlementIds: selected.map(row => row.settlementId || row.id).filter(Boolean).slice(-12)
    };
  }
  function exposure(c, partner, rid) {
    const t = bucket('trade', c);
    return {
      exportsAtRisk: ledger(t.exportLedger, row =>
        token(row.resourceId || row.commodityId) === token(rid) &&
        country(row.buyerCountryId || row.destinationCountryId || row.targetCountryId) === country(partner)),
      importsAtRisk: ledger(t.importLedger, row =>
        token(row.resourceId || row.commodityId) === token(rid) &&
        country(row.sourceCountryId || row.sellerCountryId || row.originCountryId) === country(partner))
    };
  }
  function supplierCustomerExposure(supplier, target, rid, policy) {
    const exportRows = bucket('trade', supplier).exportLedger;
    const importRows = bucket('trade', target).importLedger;
    const recent = row => {
      const stamp = first(row?.turn, row?.settlementTurn, row?.recordedTurn);
      return stamp === null || (stamp >= turn() - LEDGER_WINDOW && stamp <= turn());
    };
    const matchesProduct = row => token(row?.resourceId || row?.commodityId) === token(rid);
    const sellerRows = (Array.isArray(exportRows) ? exportRows : []).filter(row =>
      row && matchesProduct(row) && recent(row) &&
      country(row.buyerCountryId || row.destinationCountryId || row.targetCountryId) === target);
    const buyerRows = (Array.isArray(importRows) ? importRows : []).filter(row =>
      row && matchesProduct(row) && recent(row) &&
      country(row.sourceCountryId || row.sellerCountryId || row.originCountryId) === supplier);
    if (!sellerRows.length || !buyerRows.length) return null;
    const allProductExports = (Array.isArray(exportRows) ? exportRows : []).filter(row =>
      row && matchesProduct(row) && recent(row));
    const customerQuantity = sellerRows.reduce((sum, row) => sum + (nn(row.quantity) || 0), 0);
    const totalQuantity = allProductExports.reduce((sum, row) => sum + (nn(row.quantity) || 0), 0);
    const share = totalQuantity > 0 ? clamp(customerQuantity / totalQuantity) : null;
    const exportLedger = ledger(sellerRows, () => true);
    const importLedger = ledger(buyerRows, () => true);
    return {
      supplierCountryId: supplier, customerCountryId: target, resourceId: rid,
      policyKey: policy.policyKey, policyId: policy.policyId,
      secondarySanctions: policy.secondarySanctions === true,
      exportSettlementCount: sellerRows.length, importSettlementCount: buyerRows.length,
      exportQuantityToTarget: customerQuantity, totalProductExportQuantity: totalQuantity || null,
      exportShare: share, exportValue: exportLedger.value,
      exportValueCurrency: exportLedger.currency, exportValueByCurrency: exportLedger.valueByCurrency,
      importValueEvidence: importLedger.value, importValueCurrency: importLedger.currency,
      evidenceStatus: 'TARGET_IMPORT_AND_SUPPLIER_EXPORT_SETTLEMENTS_CORROBORATED',
      attribution: 'CUSTOMER_EXPOSURE_NOT_PROOF_OF_A_LEGAL_PROHIBITION_ON_THE_SUPPLIER'
    };
  }
  function supplierCountriesFor(policy, productIds) {
    const imports = bucket('trade', policy.targetCountryId).importLedger;
    const candidates = new Map();
    for (const row of Array.isArray(imports) ? imports : []) {
      const rid = String(row?.resourceId || row?.commodityId || '').trim();
      const supplier = country(row?.sourceCountryId || row?.sellerCountryId || row?.originCountryId);
      if (!rid || !supplier || supplier === policy.issuerCountryId ||
          supplier === policy.targetCountryId ||
          !productIds.some(id => token(id) === token(rid))) continue;
      const evidence = supplierCustomerExposure(supplier, policy.targetCountryId, rid, policy);
      if (!evidence || (evidence.exportShare !== null && evidence.exportShare < 0.05 &&
          !policy.secondarySanctions)) continue;
      let group = candidates.get(supplier);
      if (!group) {
        group = { supplierCountryId: supplier, targetCountryId: policy.targetCountryId,
          policyKey: policy.policyKey, policyId: policy.policyId,
          secondarySanctions: policy.secondarySanctions === true,
          resourceExposures: [] };
        candidates.set(supplier, group);
      }
      if (!group.resourceExposures.some(item => token(item.resourceId) === token(evidence.resourceId)))
        group.resourceExposures.push(evidence);
    }
    return [...candidates.values()].map(group => {
      const resourceExposures = group.resourceExposures
        .sort((a, b) => (b.exportShare ?? -1) - (a.exportShare ?? -1) ||
          b.exportQuantityToTarget - a.exportQuantityToTarget).slice(0, MAX_PRODUCTS);
      const lead = resourceExposures[0] || {};
      return Object.assign({}, group, lead, {
        supplierCountryId: group.supplierCountryId, targetCountryId: group.targetCountryId,
        policyKey: group.policyKey, policyId: group.policyId,
        secondarySanctions: group.secondarySanctions,
        resourceIds: resourceExposures.map(item => item.resourceId),
        resourceExposures
      });
    }).sort((a, b) =>
      (b.exportShare ?? -1) - (a.exportShare ?? -1) ||
      b.exportQuantityToTarget - a.exportQuantityToTarget ||
      a.supplierCountryId.localeCompare(b.supplierCountryId))
      .slice(0, MAX_SUPPLIER_COUNTRIES_PER_POLICY);
  }
  function intelligenceCapability(c) {
    const i = bucket('intelligence', c), inside = bucket('interior', c), defence = bucket('defense', c);
    const raw = [i.tradeSurveillance, i.counterSmugglingReadiness, i.blackMarketDetection,
      i.foreignIntelligenceCapability, i.collectionCapability, inside.customsInspectionCoverage,
      inside.borderInspectionCoverage, defence.maritimeAwareness, defence.borderSecurityReadiness];
    const values = raw.map(num).filter(value => value !== null)
      .map(value => clamp(value > 1 ? value / 100 : value));
    return {
      score: values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4)) : null,
      observedIndicators: values.length,
      status: values.length ? 'EXISTING_CAPABILITY_OBSERVED' : 'CAPABILITY_UNOBSERVED'
    };
  }
  function demandSource(c, rid) {
    const rows = bucket('resource', c).demandRuntime?.byResource;
    const row = field(rows, rid);
    return row && typeof row === 'object' ? row : null;
  }
  function demand(row) {
    if (!row) return null;
    const unmet = nn(row.unmetDemand), perDay = nn(row.demandPerDay ?? row.demand);
    const coverage = nn(row.stockCoverageDays), target = nn(row.stockCoverageTargetDays);
    const factoryInput = nn(row.activeFactoryInputDemandPerDay ?? row.factoryInputDemandPerDay);
    const below = coverage !== null && target !== null && coverage < target;
    let required = unmet !== null && unmet > 0 ? unmet : null;
    if (required === null && below && perDay !== null) required = Number((perDay * (target - coverage)).toFixed(6));
    return {
      unmetDemand: unmet, demandPerDay: perDay, stockCoverageDays: coverage,
      stockCoverageTargetDays: target, activeFactoryInputDemandPerDay: factoryInput,
      importDependencyPct: first(row.importDependencyPct, row.importDependency, row.importShare),
      procurementScore: num(row.procurementScore), requiredQuantity: required,
      belowTarget: below, status: row.status || null,
      lastDemandTurn: num(row.lastDemandTurn)
    };
  }
  function production(c, rid, source) {
    const r = bucket('resource', c), e = bucket('economy', c);
    const p = field(r.productionByResource, rid) || field(r.production, rid) ||
      field(e.productionByResource, rid) || field(e.industryOutputByResource, rid);
    const output = first(source?.actualProductionPerDay, source?.domesticProductionPerDay,
      source?.productionPerDay, p?.actualOutputPerDay, p?.outputPerDay, p?.productionPerDay);
    const capacity = first(source?.installedCapacityPerDay, p?.installedCapacityPerDay, p?.capacityPerDay);
    return { productionPerDay: output, installedCapacityPerDay: capacity,
      outputValue: first(p?.outputValue, source?.outputValue),
      source: p ? 'RECORDED_RESOURCE_OR_ECONOMY_PRODUCTION' :
        (output !== null ? 'RECORDED_DEMAND_RUNTIME' : null) };
  }
  function logistics(c, partner, rid) {
    const t = bucket('transport', c), tr = bucket('trade', c), r = bucket('resource', c);
    const lists = [t.routes, t.shipments, t.corridors, tr.routes, tr.shipments,
      tr.transitLedger, r.logisticsRoutes, r.routes, r.shipments].filter(Array.isArray).flat();
    const matches = lists.filter(row => {
      if (!row || typeof row !== 'object') return false;
      const product = row.resourceId || row.commodityId;
      if (product && token(product) !== token(rid)) return false;
      const parties = [country(row.originCountryId || row.sourceCountryId || row.sellerCountryId),
        country(row.destinationCountryId || row.targetCountryId || row.buyerCountryId),
        country(row.partnerCountryId)].filter(Boolean);
      return !parties.length || parties.includes(country(partner));
    });
    return { recordCount: matches.length,
      routeIds: matches.map(row => row.routeId || row.transitId || row.shipmentId).filter(Boolean).slice(-8),
      status: matches.length ? 'OBSERVED' : (lists.length ? 'NO_MATCHING_ROUTE_RECORD' : 'UNAVAILABLE') };
  }
  function employment(c, rid) {
    const e = bucket('economy', c), rows = e.employmentBySector || e.workforceBySector;
    const sector = field(rows, rid);
    const persons = first(sector?.employedPersons, sector?.workers, sector?.employment,
      e.employedPersons, e.employmentTotal);
    return { employedPersons: persons, unemploymentRate: first(sector?.unemploymentRate, e.unemploymentRate),
      affectedSector: sector?.sector || sector?.sectorId || null,
      source: sector ? 'RECORDED_SECTOR_EMPLOYMENT' :
        (persons !== null ? 'RECORDED_NATIONAL_EMPLOYMENT' : null) };
  }
  function budgets(c) {
    const f = bucket('finance', c), map = f.ministryAllocations || f.appropriations || {};
    const keys = ['foreign', 'foreign_affairs', 'diplomacy', 'trade', 'international_trade',
      'economy', 'industry', 'transport', 'finance', 'intelligence'];
    const allocations = [];
    if (map && typeof map === 'object' && !Array.isArray(map)) {
      for (const [key, value] of Object.entries(map)) {
        if (!keys.some(known => token(key) === token(known) || token(key).includes(token(known)))) continue;
        if (!value || typeof value !== 'object') continue;
        allocations.push({
          ministry: key, allocated: first(value.allocatedUsd, value.budgetUsd, value.allocated, value.budget),
          spent: first(value.spentUsd, value.spent),
          remaining: first(value.remainingUsd, value.remaining),
          currency: value.currency || value.currencyCode || 'USD',
          source: value.source || 'RECORDED_FINANCE_MINISTRY_ALLOCATION'
        });
      }
    }
    return {
      availableTreasury: first(f.available, f.availableCash, f.treasuryBalance, f.treasuryBalanceUsd),
      foreignReserveCoverageDays: first(f.foreignReserveCoverageDays, f.reserveCoverageDays),
      ministryAllocations: allocations.slice(0, 8),
      budgetObserved: allocations.some(x => x.allocated !== null || x.remaining !== null)
    };
  }
  function financial(c, tradeRisk) {
    const f = bucket('finance', c), code = f.currencyCode || f.homeCurrencyCode || f.nationalCurrencyCode || null;
    let cost = null, stress = null, account = null;
    try { if (typeof transmission()?.getImportCostMultiplier === 'function')
      cost = num(transmission().getImportCostMultiplier(c)); } catch (_) {}
    try { if (code && typeof transmission()?.getMonetaryStress === 'function')
      stress = clone(transmission().getMonetaryStress(code)); } catch (_) {}
    try { account = bank()?.getCountryAccount?.(c) || bank()?.getCountryBalances?.(c) || null; } catch (_) {}
    const budget = budgets(c);
    return {
      currencyCode: code, importCostMultiplier: cost, monetaryStress: stress,
      foreignReserveCoverageDays: budget.foreignReserveCoverageDays,
      treasuryAvailable: budget.availableTreasury,
      bankAccountEvidence: account ? {
        currency: account.homeCurrencyCode || account.currencyCode || code,
        available: first(account.available, account.availableBalance, account.availableUsd, account.treasuryBalanceUsd),
        balance: first(account.balance, account.balanceUsd, account.totalBalanceUsd),
        source: account.openingSource || account.source || 'GOVERNMENT_BANKING_ACCOUNT_SUMMARY'
      } : null,
      ministryBudgetEvidence: budget.ministryAllocations,
      tradeValueAtRisk: {
        exports: tradeRisk.exportsAtRisk.value, imports: tradeRisk.importsAtRisk.value,
        currency: tradeRisk.exportsAtRisk.currency || tradeRisk.importsAtRisk.currency || null
      }
    };
  }
  function restrictedPair(a, b, rid) {
    const rel = relation(a, b);
    if (rel?.war_state === true || rel?.sanctions === true) return true;
    for (const owner of [a, b]) {
      const t = bucket('trade', owner), f = bucket('foreign', owner);
      for (const row of [
        ...(Array.isArray(t.sanctions) ? t.sanctions : []),
        ...(Array.isArray(f.sanctions) ? f.sanctions : []),
        ...(Array.isArray(t.resourceEmbargoes) ? t.resourceEmbargoes : []),
        ...(Array.isArray(f.resourceEmbargoes) ? f.resourceEmbargoes : [])
      ]) {
        if (!active(row)) continue;
        const target = country(row.targetCountryId || row.subjectCountryId || row.countryId || row.targetId);
        const product = row.resourceId || row.commodityId;
        if ((target === country(a) || target === country(b)) &&
          (!product || token(product) === token(rid))) return true;
      }
    }
    return false;
  }
  function localPrice(c, rid) {
    try { return num(market()?.localPrice?.(c, rid)); } catch (_) { return null; }
  }
  function legalSuppliers(c, rid, quantity, budget) {
    if (!(quantity > 0) || budget.used >= MAX_MARKET_QUERIES) return [];
    let rows = [];
    try { budget.used++; rows = market()?.suppliers?.(rid, quantity, c) || []; } catch (_) { return []; }
    return (Array.isArray(rows) ? rows : []).filter(row => {
      const seller = country(row?.countryId || row?.sellerCountryId);
      const available = nn(row?.available ?? row?.availableQuantity);
      return !!seller && seller !== c && !restrictedPair(c, seller, rid) &&
        available !== null && available + 1e-8 >= quantity;
    }).map(row => {
      const seller = country(row.countryId || row.sellerCountryId);
      return {
        sellerCountryId: seller, verifiedAvailableQuantity: nn(row.available ?? row.availableQuantity),
        localPrice: localPrice(seller, rid), marketQuote: clone(row.marketQuote || null),
        relationObserved: row.relationObserved === true,
        tradeAgreementObserved: row.tradeAgreementObserved === true,
        priceComparison: localPrice(seller, rid) === null ? 'UNAVAILABLE' : 'SOURCE_LOCAL_PRICE_ONLY',
        evidence: 'OMEGA_GLOBAL_MARKET_LEGAL_SUPPLIER'
      };
    }).sort((a, b) => (a.localPrice ?? Number.MAX_SAFE_INTEGER) -
      (b.localPrice ?? Number.MAX_SAFE_INTEGER) || a.sellerCountryId.localeCompare(b.sellerCountryId))
      .slice(0, MAX_ALTERNATIVES);
  }
  function legalAlternativeBuyers(c, rid, budget) {
    const candidates = [];
    for (const buyerId of worldCountries()) {
      if (buyerId === c || restrictedPair(c, buyerId, rid)) continue;
      const row = field(bucket('resource', buyerId).demandRuntime?.byResource, rid);
      const d = demand(row);
      const need = d?.requiredQuantity ?? d?.activeFactoryInputDemandPerDay;
      if (num(need) > 0) candidates.push({ buyerCountryId: buyerId, quantityNeeded: need,
        unmetDemand: d.unmetDemand, stockCoverageDays: d.stockCoverageDays });
    }
    candidates.sort((a, b) => (b.unmetDemand ?? b.quantityNeeded) -
      (a.unmetDemand ?? a.quantityNeeded) || a.buyerCountryId.localeCompare(b.buyerCountryId));
    const result = [];
    for (const candidate of candidates.slice(0, MAX_BUYER_CHECKS)) {
      if (budget.used >= MAX_MARKET_QUERIES) break;
      let rows = [];
      try { budget.used++; rows = market()?.suppliers?.(rid, candidate.quantityNeeded, candidate.buyerCountryId) || []; }
      catch (_) { continue; }
      const verified = (Array.isArray(rows) ? rows : []).find(row =>
        country(row?.countryId || row?.sellerCountryId) === c &&
        nn(row?.available ?? row?.availableQuantity) !== null &&
        nn(row?.available ?? row?.availableQuantity) + 1e-8 >= candidate.quantityNeeded);
      if (verified) result.push({
        buyerCountryId: candidate.buyerCountryId, observedDemandQuantity: candidate.quantityNeeded,
        stockCoverageDays: candidate.stockCoverageDays,
        verifiedAvailableQuantity: nn(verified.available ?? verified.availableQuantity),
        localPrice: localPrice(c, rid),
        evidence: 'OBSERVED_BUYER_DEMAND_AND_GLOBAL_MARKET_LEGAL_SUPPLIER'
      });
    }
    return result.slice(0, MAX_ALTERNATIVES);
  }
  function productsFor(policy) {
    if (policy.resourceIds.length) return policy.resourceIds.slice(0, MAX_PRODUCTS);
    const ids = new Map(), rows = bucket('resource', policy.targetCountryId).demandRuntime?.byResource;
    if (rows && typeof rows === 'object') Object.keys(rows).forEach(id => ids.set(token(id), id));
    for (const c of [policy.targetCountryId, policy.issuerCountryId]) {
      const t = bucket('trade', c);
      for (const list of [t.exportLedger, t.importLedger]) {
        if (!Array.isArray(list)) continue;
        for (const row of list.slice(-MAX_HISTORY)) {
          const id = row?.resourceId || row?.commodityId;
          if (id) ids.set(token(id), String(id));
        }
      }
    }
    return [...ids.values()].slice(0, MAX_PRODUCTS);
  }
  function productAssessment(policy, c, partner, rid, role, budget) {
    const source = rid ? demandSource(c, rid) : null, d = demand(source);
    const tradeRisk = rid ? exposure(c, partner, rid) : {
      exportsAtRisk: ledger([], () => false), importsAtRisk: ledger([], () => false)
    };
    const productionEvidence = rid ? production(c, rid, source) : null;
    const employmentEvidence = rid ? employment(c, rid) : null;
    const logisticsEvidence = rid ? logistics(c, partner, rid) : null;
    const price = rid ? localPrice(c, rid) : null;
    const sources = role === 'TARGET' && d?.requiredQuantity > 0
      ? legalSuppliers(c, rid, d.requiredQuantity, budget) : [];
    const buyers = ['TARGET', 'SUPPLIER'].includes(role) && tradeRisk.exportsAtRisk.recordCount > 0
      ? legalAlternativeBuyers(c, rid, budget) : [];
    const shortage = !!d && ((d.unmetDemand !== null && d.unmetDemand > 0) ||
      d.belowTarget || (d.activeFactoryInputDemandPerDay !== null &&
        d.activeFactoryInputDemandPerDay > 0 && d.stockCoverageDays !== null &&
        d.stockCoverageDays < (d.stockCoverageTargetDays ?? d.stockCoverageDays)));
    return {
      resourceId: rid || null,
      productName: rid ? (market()?.describeProduct?.(rid)?.name || rid) : null,
      role, tradeExposure: tradeRisk, domesticDemand: d,
      production: productionEvidence, employment: employmentEvidence, logistics: logisticsEvidence,
      observedLocalPrice: price, importAlternatives: sources, alternativeExportBuyers: buyers,
      shortageEvidence: shortage,
      policyRestrictsImports: ['IMPORT', 'BOTH', 'ALL'].includes(policy.direction) ||
        /IMPORT|ALL|TRADE|FINANCIAL|COMPREHENSIVE/.test(policy.type),
      policyRestrictsExports: ['EXPORT', 'BOTH', 'ALL'].includes(policy.direction) ||
        /EXPORT|ALL|TRADE|COMPREHENSIVE/.test(policy.type),
      evidenceConfidence: [
        tradeRisk.exportsAtRisk.recordCount || tradeRisk.importsAtRisk.recordCount ? 'SETTLED_TRADE_LEDGER' : null,
        d ? 'NATIONAL_DEMAND_RUNTIME' : null, productionEvidence?.source || null,
        logisticsEvidence?.recordCount ? 'TRANSPORT_ROUTE_LEDGER' : null,
        price !== null ? 'LOCAL_MARKET_PRICE' : null
      ].filter(Boolean)
    };
  }
  function relationEvidence(policy) {
    const r = relation(policy.targetCountryId, policy.issuerCountryId);
    if (!r) return { observed: false, overall: null, trade: null, trust: null,
      sanctionsFlag: null, warFlag: null };
    return { observed: true, overall: first(r.overall, r.score, r.relationScore),
      trade: first(r.trade, r.tradeScore), trust: first(r.trust, r.trustScore),
      sanctionsFlag: typeof r.sanctions === 'boolean' ? r.sanctions : null,
      warFlag: typeof r.war_state === 'boolean' ? r.war_state : null };
  }
  function governmentActors(c, products = []) {
    const e = bucket('economy', c), f = bucket('finance', c);
    const rows = [...(Array.isArray(e.companies) ? e.companies : []),
      ...(Array.isArray(e.enterprises) ? e.enterprises : []),
      ...(Array.isArray(f.stateOwnedEnterprises) ? f.stateOwnedEnterprises : [])];
    return rows.filter(row => row && /STATE|PUBLIC|GOVERNMENT|MINISTRY/.test(
      String(row.ownership || row.ownerType || row.entityType || '').toUpperCase()))
      .slice(0, 8).map(row => ({
        companyId: row.companyId || row.enterpriseId || row.id || null,
        name: row.name || row.companyName || row.officialName || null,
        ownership: row.ownership || row.ownerType || row.entityType || null,
        sector: row.sector || row.sectorId || null,
        commodityLinkStatus: products.some(product => product.resourceId &&
          token(product.resourceId) === token(row.resourceId || row.commodityId))
          ? 'MATCHED_RESOURCE_RECORD' : 'NOT_ESTABLISHED',
        source: 'EXISTING_COUNTRY_COMPANY_OR_STATE_ENTERPRISE_RECORD'
      }));
  }
  function sumMoney(rows, getter) {
    const totals = {}, unattributed = [];
    for (const row of rows) {
      const ledgerRow = getter(row);
      if (!ledgerRow || typeof ledgerRow !== 'object') continue;
      for (const [currency, raw] of Object.entries(ledgerRow.valueByCurrency || {})) {
        const value = nn(raw);
        if (value !== null) totals[String(currency).toUpperCase()] =
          (totals[String(currency).toUpperCase()] || 0) + value;
      }
      if (nn(ledgerRow.unattributedCurrencyValue) !== null)
        unattributed.push(nn(ledgerRow.unattributedCurrencyValue));
    }
    const currencies = Object.keys(totals);
    const single = currencies.length === 1 && unattributed.length === 0;
    return {
      value: single ? Number(totals[currencies[0]].toFixed(6)) : null,
      currency: single ? currencies[0] : null,
      valueByCurrency: Object.fromEntries(Object.entries(totals).map(([key, value]) =>
        [key, Number(value.toFixed(6))])),
      currencyStatus: single ? 'SINGLE_CURRENCY' :
        (currencies.length || unattributed.length ? 'MIXED_OR_UNATTRIBUTED_CURRENCY' : 'NO_VALUE_RECORDED')
    };
  }
  function decisionOptions(policy, products, finance, relationRow, role) {
    const options = [], shortage = products.some(row => row.shortageEvidence);
    const legalSource = products.some(row => row.importAlternatives.length);
    const exportBuyer = products.some(row => row.alternativeExportBuyers.length);
    const importsAtRisk = products.some(row => row.tradeExposure.importsAtRisk.recordCount);
    const exportsAtRisk = products.some(row => row.tradeExposure.exportsAtRisk.recordCount);
    const restricted = products.some(row => row.policyRestrictsImports || row.policyRestrictsExports);
    if (role === 'SUPPLIER') {
      if (exportBuyer) options.push({ id: 'ALTERNATIVE_EXPORT_BUYER_REDIRECTION',
        title: 'Redirect exposed exports to verified legal buyers', priority: 100,
        feasibility: 'SUPPORTED_BY_OBSERVED_DEMAND_AND_VERIFIED_SUPPLIER_STOCK',
        evidence: products.filter(row => row.alternativeExportBuyers.length).map(row => ({
          resourceId: row.resourceId, buyers: row.alternativeExportBuyers.map(x => ({
            buyerCountryId: x.buyerCountryId, verifiedAvailableQuantity: x.verifiedAvailableQuantity,
            stockCoverageDays: x.stockCoverageDays
          }))
        })),
        costEvidence: { exposedExportValue: sumMoney(products, row => row.tradeExposure.exportsAtRisk) },
        riskEvidence: { newContractsAndFreight: 'NOT_YET_NEGOTIATED' } });
      if (products.some(row => row.tradeExposure.exportsAtRisk.recordCount))
        options.push({ id: 'CUSTOMER_CONCENTRATION_REVIEW',
          title: 'Review dependence on the sanctioned customer', priority: 85,
          feasibility: 'SUPPLIER_AND_TARGET_SETTLEMENTS_CORROBORATED',
          evidence: products.filter(row => row.tradeExposure.exportsAtRisk.recordCount).map(row => ({
            resourceId: row.resourceId, exportsAtRisk: row.tradeExposure.exportsAtRisk,
            importsAtRisk: row.tradeExposure.importsAtRisk
          })),
          costEvidence: {}, riskEvidence: { actualLoss: 'NOT_INFERRED_FROM_HISTORICAL_SETTLEMENTS' } });
      if (policy.secondarySanctions) options.push({ id: 'SECONDARY_SANCTIONS_COMPLIANCE_REVIEW',
        title: 'Assess secondary-sanctions, payment and route exposure', priority: 95,
        feasibility: 'SECONDARY_SANCTIONS_SCOPE_RECORDED', evidence: [policy.policyKey],
        costEvidence: {}, riskEvidence: { supplierLegalExposure: 'REQUIRES_POLICY_AND_JURISDICTION_REVIEW' } });
    } else if (role === 'TARGET') {
      if (legalSource) options.push({ id: 'LEGAL_SOURCE_DIVERSIFICATION',
        title: 'Diversify into verified legal suppliers', priority: 100,
        feasibility: 'SUPPORTED_BY_CURRENT_MARKET_STOCK',
        evidence: products.filter(row => row.importAlternatives.length).map(row => ({
          resourceId: row.resourceId, suppliers: row.importAlternatives.map(x => x.sellerCountryId)
        })), costEvidence: { priceBasis: 'SOURCE_LOCAL_PRICE_ONLY',
          pricesObserved: products.some(row => row.importAlternatives.some(x => x.localPrice !== null)) },
        riskEvidence: { freightAndTariff: 'NOT_FULLY_MODELLED' } });
      if (exportBuyer) options.push({ id: 'EXPORT_MARKET_REDIRECTION',
        title: 'Redirect exports to verified alternative demand', priority: 95,
        feasibility: 'SUPPORTED_BY_DEMAND_AND_LEGAL_SUPPLY_CHECK',
        evidence: products.filter(row => row.alternativeExportBuyers.length).map(row => ({
          resourceId: row.resourceId, buyers: row.alternativeExportBuyers.map(x => x.buyerCountryId)
        })), costEvidence: { recentExportValueAtRisk: sumMoney(products, row => row.tradeExposure.exportsAtRisk) },
        riskEvidence: { newContractsAndFreight: 'NOT_YET_NEGOTIATED' } });
      if (relationRow.observed) options.push({ id: 'DIPLOMATIC_WAIVER_OR_RENEGOTIATION',
        title: 'Seek clarification, waiver or negotiated terms', priority: 75,
        feasibility: 'RELATIONSHIP_EVIDENCE_AVAILABLE', evidence: [relationRow],
        costEvidence: { ministryBudget: finance.ministryBudgetEvidence },
        riskEvidence: { counterpartDecisionRequired: true } });
      if (shortage || importsAtRisk) options.push({ id: 'DOMESTIC_STOCK_AND_INPUT_REBALANCING',
        title: 'Review stock cover, input allocation and domestic substitution', priority: 70,
        feasibility: 'REQUIRES_RESOURCE_AND_INDUSTRY_MINISTRY_REVIEW',
        evidence: products.filter(row => row.shortageEvidence || row.tradeExposure.importsAtRisk.recordCount)
          .map(row => ({ resourceId: row.resourceId, demand: row.domesticDemand, production: row.production })),
        costEvidence: { treasuryEvidence: finance.treasuryAvailable },
        riskEvidence: { productionSubstitution: 'UNPROVEN_UNLESS_CAPACITY_IS_RECORDED' } });
      if (shortage && restricted && !legalSource && network()) options.push({
        id: 'BLACK_MARKET_EVIDENCE_REVIEW',
        title: 'Refer restricted shortage to the bounded Black Market evidence planner',
        priority: 55, feasibility: 'REVIEW_CANDIDATE_NOT_AN_ACCEPTED_ORDER',
        evidence: products.filter(row => row.shortageEvidence).map(row => row.resourceId),
        costEvidence: { automaticGovernmentFunding: false },
        riskEvidence: { stockAndRouteAuthority: 'EXISTING_BLACK_MARKET_RUNTIME',
          participationCreated: false } });
      if (restricted) options.push({ id: 'COMPLIANCE_AND_SUPPLY_MONITORING',
        title: 'Monitor policy scope and supply disruption', priority: 40,
        feasibility: 'ALWAYS_AVAILABLE', evidence: [policy.policyKey],
        costEvidence: {}, riskEvidence: { enforcement: 'POLICY_DEPENDENT' } });
    } else {
      options.push({ id: 'SANCTION_COMPLIANCE_REVIEW',
        title: 'Review enforcement scope and domestic exposure', priority: 90,
        feasibility: 'POLICY_RECORD_OBSERVED', evidence: [policy.policyKey],
        costEvidence: { ministryBudget: finance.ministryBudgetEvidence },
        riskEvidence: { diplomaticSpillover: 'RELATIONSHIP_MONITORING_REQUIRED' } });
      if (exportsAtRisk || importsAtRisk) options.push({ id: 'DOMESTIC_TRADE_EXPOSURE_MONITORING',
        title: 'Monitor affected exporters, importers and financial exposure', priority: 80,
        feasibility: 'SETTLED_TRADE_EXPOSURE_OBSERVED',
        evidence: products.map(row => ({ resourceId: row.resourceId,
          exports: row.tradeExposure.exportsAtRisk, imports: row.tradeExposure.importsAtRisk })),
        costEvidence: {}, riskEvidence: { actualLoss: 'NOT_INFERRED_FROM_HISTORICAL_SETTLEMENTS' } });
      if (relationRow.observed) options.push({ id: 'DIPLOMATIC_CHANNEL_MAINTENANCE',
        title: 'Maintain a diplomatic channel for clarification and spillovers', priority: 60,
        feasibility: 'RELATIONSHIP_EVIDENCE_AVAILABLE', evidence: [relationRow],
        costEvidence: {}, riskEvidence: { counterpartResponse: 'NOT_GUARANTEED' } });
    }
    if (!options.length) options.push({ id: 'MONITOR_WITH_DATA_GAPS',
      title: 'Monitor until relevant trade or demand evidence is available',
      priority: 10, feasibility: 'INSUFFICIENT_EVIDENCE', evidence: [],
      costEvidence: {}, riskEvidence: {} });
    options.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    return options;
  }
  function motives(policy, role, products, finance) {
    const values = [];
    if (role === 'ISSUER') values.push('SANCTION_COMPLIANCE_AND_POLICY_ENFORCEMENT');
    else if (role === 'SUPPLIER') {
      if (products.some(row => row.tradeExposure.exportsAtRisk.recordCount))
        values.push('PRESERVE_EXPORT_CUSTOMER_REVENUE_AND_FOREIGN_EXCHANGE');
      if (products.some(row => row.alternativeExportBuyers.length))
        values.push('REDIRECT_EXPORTS_TO_VERIFIED_LEGAL_BUYERS');
      if (policy.secondarySanctions) values.push('ASSESS_SECONDARY_SANCTIONS_AND_PAYMENT_ROUTE_RISK');
      if (finance.foreignReserveCoverageDays !== null && finance.foreignReserveCoverageDays < 45)
        values.push('FOREIGN_CURRENCY_LIQUIDITY_PRESSURE');
    } else {
      if (products.some(row => row.shortageEvidence)) values.push('PROTECT_DOMESTIC_INPUT_AND_CONSUMER_SUPPLY');
      if (products.some(row => row.tradeExposure.exportsAtRisk.recordCount))
        values.push('PRESERVE_EXPORT_REVENUE_AND_FOREIGN_EXCHANGE');
      if (finance.foreignReserveCoverageDays !== null && finance.foreignReserveCoverageDays < 45)
        values.push('FOREIGN_CURRENCY_LIQUIDITY_PRESSURE');
      if (products.some(row => row.production && row.production.productionPerDay !== null))
        values.push('KEEP_DOMESTIC_INDUSTRY_OPERATING');
    }
    if (!values.length) values.push('POLICY_MONITORING_WITH_INSUFFICIENT_ECONOMIC_EVIDENCE');
    return [...new Set(values)];
  }
  function notify(policy, c, partner, role) {
    return { notificationId: policy.policyKey + '-' + c, countryId: c,
      counterpartCountryId: partner, role, policyKey: policy.policyKey, policyId: policy.policyId,
      issuerCountryId: policy.issuerCountryId, targetCountryId: policy.targetCountryId,
      policyType: policy.type, direction: policy.direction, effectiveTurn: policy.startTurn,
      expiryTurn: policy.endTurn, secondarySanctions: policy.secondarySanctions,
      notifiedTurn: turn(), status: role === 'SUPPLIER'
        ? 'SUPPLY_CHAIN_SPILLOVER_RECORDED' : 'DELIVERED_TO_COUNTRY_POLICY_RECORD',
      rationale: role === 'TARGET'
        ? 'An active foreign sanction names this country as its target; economic review has been queued.'
        : (role === 'SUPPLIER'
          ? 'This country has corroborated settled exports to the sanction target; customer and market exposure review has been queued.'
          : 'This country is recorded as the issuer; compliance and domestic exposure review has been queued.'),
      source: 'OMEGA_SANCTION_RESPONSE_RUNTIME_V1' };
  }
  function investigation(policy, c, partner, role, products, finance) {
    const reasons = [];
    if (products.some(row => row.tradeExposure.exportsAtRisk.recordCount ||
      row.tradeExposure.importsAtRisk.recordCount)) reasons.push('COMPLETED_BILATERAL_TRADE_EXPOSURE');
    if (products.some(row => row.shortageEvidence)) reasons.push('RECORDED_DOMESTIC_SHORTAGE_OR_LOW_STOCK_COVERAGE');
    if (finance.importCostMultiplier !== null && finance.importCostMultiplier > 1)
      reasons.push('OBSERVED_IMPORT_COST_PRESSURE');
    if (finance.foreignReserveCoverageDays !== null && finance.foreignReserveCoverageDays < 45)
      reasons.push('OBSERVED_FOREIGN_RESERVE_PRESSURE');
    if (role === 'TARGET') reasons.push('ACTIVE_INCOMING_SANCTION_POLICY');
    else if (role === 'SUPPLIER') reasons.push('RECORDED_EXPORT_CUSTOMER_EXPOSURE_TO_SANCTION_TARGET');
    else reasons.push('ISSUED_SANCTION_POLICY');
    if (role === 'SUPPLIER' && policy.secondarySanctions)
      reasons.push('SECONDARY_SANCTIONS_SCOPE_RECORDED');
    const capability = intelligenceCapability(c);
    const sources = ['TRADE_SANCTION_POLICY_REGISTER', 'SETTLED_IMPORT_AND_EXPORT_LEDGER',
      'RESOURCE_NATIONAL_DEMAND_AND_STOCK_COVERAGE', 'FINANCE_TREASURY_AND_FX_RECORDS',
      'BILATERAL_FOREIGN_RELATION_RECORDS'];
    if (products.some(row => row.logistics?.recordCount)) sources.push('RECORDED_TRANSPORT_AND_TRANSIT_MANIFESTS');
    return { investigationId: policy.policyKey + '-' + c, countryId: c,
      counterpartCountryId: partner, role, policyKey: policy.policyKey, policyId: policy.policyId,
      openedTurn: policy.startTurn, lastReviewedTurn: turn(),
      status: reasons.length > 1 && capability.score !== null && capability.score >= 0.25
        ? 'OPEN' : 'PASSIVE_MONITORING',
      triggerReasons: [...new Set(reasons)], collectionPlan: sources,
      productIds: products.map(row => row.resourceId).filter(Boolean),
      confidence: products.some(row => row.evidenceConfidence.length >= 2) ? 'MEDIUM' : 'LOW',
      capabilityScore: capability.score, capabilityIndicatorsObserved: capability.observedIndicators,
      capabilityStatus: capability.status,
      collectionMode: capability.score !== null && capability.score >= 0.25
        ? 'EXISTING_CAPABILITY_BOUNDED_REVIEW' : 'PASSIVE_MONITORING_ONLY',
      activeFieldOperation: false, noAutomaticSpending: true,
      scope: 'COUNTRY_OWNED_CASE_FILE_ONLY', noOmniscientIntelligence: true };
  }
  function upsert(ctx, domain, fieldName, record, key) {
    const c = country(ctx?.countryId);
    if (!c || !record || country(record.countryId) !== c || !record[key])
      return { accepted: false, reason: 'SANCTION_RECORD_COUNTRY_OR_ID_INVALID' };
    const path = domain + '.' + fieldName;
    const prior = ctx.stateTransaction.get(path);
    const rows = Array.isArray(prior) ? clone(prior) : [];
    const index = rows.findIndex(row => String(row?.[key] || '') === String(record[key]));
    if (index >= 0 && fieldName === 'sanctionNotifications')
      return { accepted: true, duplicate: true, record: clone(rows[index]) };
    const old = index >= 0 ? rows[index] : {};
    const merged = Object.assign({}, old, clone(record), {
      createdTurn: old.createdTurn ?? record.createdTurn ?? turn()
    });
    if (fieldName === 'sanctionInvestigations') {
      const history = Array.isArray(old.history) ? old.history.slice() : [];
      if (history[history.length - 1]?.turn !== record.lastReviewedTurn)
        history.push({ turn: record.lastReviewedTurn, status: record.status });
      merged.history = history.slice(-16);
    }
    if (index >= 0) rows[index] = merged; else rows.push(merged);
    ctx.stateTransaction.set(path, rows.slice(-MAX_HISTORY));
    return { accepted: true, record: clone(merged) };
  }
  const HANDLERS = [
    ['OMEGA_SANCTION_RECORD_NOTIFICATION', 'foreign', 'sanctionNotifications', 'notificationId'],
    ['OMEGA_SANCTION_RECORD_ECONOMIC_IMPACT', 'economy', 'sanctionEconomicAssessments', 'impactId'],
    ['OMEGA_SANCTION_RECORD_NATIONAL_DECISION', 'foreign', 'sanctionNationalDecisions', 'decisionId'],
    ['OMEGA_SANCTION_RECORD_MARKET_RECOVERY', 'trade', 'sanctionMarketRecoveryPlans', 'recoveryId'],
    ['OMEGA_SANCTION_RECORD_INVESTIGATION', 'intelligence', 'sanctionInvestigations', 'investigationId'],
    ['OMEGA_SANCTION_RECORD_FINANCIAL_EXPOSURE', 'finance', 'sanctionFinancialExposureLedger', 'exposureId']
  ];
  let registration = { ready: false, registered: 0, total: HANDLERS.length, errors: [] };
  let lastProcessedTurn = null, lastMarketQueryCount = 0, policyCursor = 0;

  function install() {
    const api = mesh();
    if (!api?.registerCommandHandler || !api?.dispatchCommand) return false;
    if (g.__omegaSanctionResponseHandlersInstalled) return true;
    let registered = 0;
    const errors = [];
    for (const [command, owner, fieldName, key] of HANDLERS) {
      try {
        api.registerAction?.(command, { actionId: command,
          stateOwnerMinistry: owner, authority: 'OMEGA_SANCTION_RESPONSE_RUNTIME_V1' });
        api.registerCommandHandler(command, owner, (cmd, ctx) =>
          upsert(ctx, owner, fieldName, cmd?.payload?.record, key));
        registered++;
      } catch (error) { errors.push({ command, reason: String(error?.message || error) }); }
    }
    registration = { ready: registered === HANDLERS.length, registered,
      total: HANDLERS.length, errors };
    if (registration.ready) g.__omegaSanctionResponseHandlersInstalled = true;
    return registration.ready;
  }
  function dispatch(owner, command, c, record) {
    try {
      const result = mesh()?.dispatchCommand?.(owner, command, c, { record: clone(record) }, {
        turn: turn(), commandType: command, correlationId: record?.policyKey || record?.notificationId || null
      });
      return result && ['APPLIED', 'FAILED', 'REJECTED'].includes(String(result.status || '')) &&
        result.result ? result.result : result;
    } catch (error) { return { accepted: false, reason: String(error?.message || error) }; }
  }
  function impactRecord(policy, c, partner, role, products, finances) {
    const rows = products.map(row => ({ resourceId: row.resourceId,
      exportsAtRisk: row.tradeExposure.exportsAtRisk, importsAtRisk: row.tradeExposure.importsAtRisk }));
    const evidence = products.reduce((sum, row) => sum + row.evidenceConfidence.length, 0);
    return {
      impactId: policy.policyKey + '-' + c + '-' + turn(),
      countryId: c, counterpartCountryId: partner, role, policyKey: policy.policyKey,
      policyId: policy.policyId, assessedTurn: turn(), windowTurns: LEDGER_WINDOW,
      tradeExposure: rows,
      aggregateExportsAtRisk: sumMoney(products, row => row.tradeExposure.exportsAtRisk).value,
      aggregateExportsAtRiskCurrency: sumMoney(products, row => row.tradeExposure.exportsAtRisk).currency,
      aggregateExportsAtRiskByCurrency: sumMoney(products, row => row.tradeExposure.exportsAtRisk).valueByCurrency,
      aggregateImportsAtRisk: sumMoney(products, row => row.tradeExposure.importsAtRisk).value,
      aggregateImportsAtRiskCurrency: sumMoney(products, row => row.tradeExposure.importsAtRisk).currency,
      aggregateImportsAtRiskByCurrency: sumMoney(products, row => row.tradeExposure.importsAtRisk).valueByCurrency,
      demandAndIndustry: products.map(row => ({ resourceId: row.resourceId,
        domesticDemand: row.domesticDemand, production: row.production,
        employment: row.employment, shortageEvidence: row.shortageEvidence })),
      logisticsExposure: products.map(row => ({ resourceId: row.resourceId, logistics: row.logistics })),
      fiscalAndFx: finances,
      evidenceConfidence: evidence >= 4 ? 'MEDIUM' : (evidence > 0 ? 'LOW' : 'INSUFFICIENT'),
      actualLossAssumed: false,
      note: 'Recent settled ledger exposure is not a realised loss. Missing evidence remains null.'
    };
  }
  function financeRecord(policy, c, partner, role, products, finance) {
    return {
      exposureId: policy.policyKey + '-' + c + '-' + turn(),
      countryId: c, counterpartCountryId: partner, role, policyKey: policy.policyKey,
      policyId: policy.policyId, reviewedTurn: turn(), currencyCode: finance.currencyCode,
      fxImportCostMultiplier: finance.importCostMultiplier, monetaryStress: finance.monetaryStress,
      foreignReserveCoverageDays: finance.foreignReserveCoverageDays,
      treasuryAvailable: finance.treasuryAvailable, bankAccountEvidence: finance.bankAccountEvidence,
      ministryBudgetEvidence: finance.ministryBudgetEvidence,
      exportValueAtRisk: sumMoney(products, row => row.tradeExposure.exportsAtRisk).value,
      exportValueAtRiskCurrency: sumMoney(products, row => row.tradeExposure.exportsAtRisk).currency,
      exportValueAtRiskByCurrency: sumMoney(products, row => row.tradeExposure.exportsAtRisk).valueByCurrency,
      importValueAtRisk: sumMoney(products, row => row.tradeExposure.importsAtRisk).value,
      importValueAtRiskCurrency: sumMoney(products, row => row.tradeExposure.importsAtRisk).currency,
      importValueAtRiskByCurrency: sumMoney(products, row => row.tradeExposure.importsAtRisk).valueByCurrency,
      actualDebit: 0, actualCredit: 0, budgetSpent: 0,
      authority: 'OBSERVED_FINANCE_AND_SETTLED_TRADE_EVIDENCE_ONLY'
    };
  }
  function recovery(policy, c, products, decision, finance) {
    return {
      recoveryId: policy.policyKey + '-' + c + '-' + turn(),
      countryId: c, policyKey: policy.policyKey, policyId: policy.policyId,
      reviewedTurn: turn(),
      status: products.some(row => row.importAlternatives.length || row.alternativeExportBuyers.length)
        ? 'ALTERNATIVES_IDENTIFIED' : 'REVIEW_REQUIRED',
      importDiversification: products.filter(row => row.importAlternatives.length).map(row => ({
        resourceId: row.resourceId, requiredQuantity: row.domesticDemand?.requiredQuantity,
        currentLocalPrice: row.observedLocalPrice, legalSources: row.importAlternatives
      })),
      exportRedirection: products.filter(row => row.alternativeExportBuyers.length).map(row => ({
        resourceId: row.resourceId, historicExportExposure: row.tradeExposure.exportsAtRisk,
        alternativeBuyers: row.alternativeExportBuyers
      })),
      domesticIndustryReview: products.map(row => ({ resourceId: row.resourceId,
        demand: row.domesticDemand, production: row.production, employment: row.employment })),
      logisticsReview: products.map(row => ({ resourceId: row.resourceId, routeEvidence: row.logistics })),
      fiscalAndFxConstraints: { importCostMultiplier: finance.importCostMultiplier,
        foreignReserveCoverageDays: finance.foreignReserveCoverageDays,
        budgetEvidence: finance.ministryBudgetEvidence },
      recommendedDecision: decision.selectedAction,
      executionStatus: 'PLANNING_ONLY_NO_PURCHASE_NO_PRODUCTION_NO_EXPORT',
      unknownsRemainUnknown: true
    };
  }
  function runSupplierSide(policy, evidence, budget, supplierBudget) {
    const c = evidence.supplierCountryId, partner = policy.targetCountryId;
    const exposedProducts = Array.isArray(evidence.resourceExposures) && evidence.resourceExposures.length
      ? evidence.resourceExposures : [evidence];
    const productRows = exposedProducts.map(item =>
      productAssessment(policy, c, partner, item.resourceId, 'SUPPLIER', budget))
      .filter(row => row.tradeExposure.exportsAtRisk.recordCount > 0);
    if (!productRows.length) return null;
    let writes = 0;
    const notification = notify(policy, c, partner, 'SUPPLIER');
    const savedNotification = dispatch('foreign', 'OMEGA_SANCTION_RECORD_NOTIFICATION', c, notification);
    if (savedNotification?.accepted) writes++;
    const aggregateRisk = {
      exportsAtRisk: sumMoney(productRows, row => row.tradeExposure.exportsAtRisk),
      importsAtRisk: sumMoney(productRows, row => row.tradeExposure.importsAtRisk)
    };
    const finance = financial(c, aggregateRisk);
    const impactId = policy.policyKey + '-' + c + '-' + turn();
    const oldImpact = bucket('economy', c).sanctionEconomicAssessments;
    if (!Array.isArray(oldImpact) || !oldImpact.some(row => row?.impactId === impactId)) {
      const saved = dispatch('economy', 'OMEGA_SANCTION_RECORD_ECONOMIC_IMPACT',
        c, impactRecord(policy, c, partner, 'SUPPLIER', productRows, finance));
      if (saved?.accepted) writes++;
    }
    const exposureId = policy.policyKey + '-' + c + '-' + turn();
    const oldFinance = bucket('finance', c).sanctionFinancialExposureLedger;
    if (!Array.isArray(oldFinance) || !oldFinance.some(row => row?.exposureId === exposureId)) {
      const saved = dispatch('finance', 'OMEGA_SANCTION_RECORD_FINANCIAL_EXPOSURE',
        c, financeRecord(policy, c, partner, 'SUPPLIER', productRows, finance));
      if (saved?.accepted) writes++;
    }
    const options = decisionOptions(policy, productRows, finance, relationEvidence(policy), 'SUPPLIER');
    const selected = options[0];
    const decision = {
      decisionId: policy.policyKey + '-' + c + '-' + turn(),
      countryId: c, counterpartCountryId: partner, role: 'SUPPLIER',
      policyKey: policy.policyKey, policyId: policy.policyId, decidedTurn: turn(),
      decisionModel: 'EVIDENCE_WEIGHTED_OPTION_COMPARISON_V1',
      options, selectedAction: selected.id, selectedActionTitle: selected.title,
      decisionStatus: selected.feasibility,
      decisionBasis: 'COMPARE_RECORDED_CUSTOMER_EXPORT_SHARE_ALTERNATIVE_LEGAL_BUYERS_SECONDARY_SANCTIONS_AND_FISCAL_CONSTRAINTS',
      governmentMotives: motives(policy, 'SUPPLIER', productRows, finance),
      governmentActors: governmentActors(c, productRows),
      budgetAvailability: finance.ministryBudgetEvidence,
      budgetAuthority: finance.ministryBudgetEvidence.length
        ? 'EXISTING_FINANCE_MINISTRY_APPROPRIATIONS_ONLY' : 'NO_RELEVANT_APPROPRIATION_OBSERVED',
      budgetAction: 'NO_BUDGET_CREATED_OR_SPENT', customerExposure: evidence
    };
    const priorDecision = bucket('foreign', c).sanctionNationalDecisions;
    if (!Array.isArray(priorDecision) || !priorDecision.some(row => row?.decisionId === decision.decisionId)) {
      const saved = dispatch('foreign', 'OMEGA_SANCTION_RECORD_NATIONAL_DECISION', c, decision);
      if (saved?.accepted) writes++;
    }
    const materialInterest = policy.secondarySanctions === true ||
      (evidence.exportShare !== null && evidence.exportShare >= 0.15);
    const capability = intelligenceCapability(c);
    let investigationRecorded = false;
    if (materialInterest && capability.score !== null && capability.score >= 0.25 &&
        supplierBudget.investigations.used < MAX_SUPPLIER_INVESTIGATIONS_PER_TURN) {
      const inv = investigation(policy, c, partner, 'SUPPLIER', productRows, finance);
      const saved = dispatch('intelligence', 'OMEGA_SANCTION_RECORD_INVESTIGATION', c, inv);
      if (saved?.accepted) {
        writes++; supplierBudget.investigations.used++; investigationRecorded = true;
      }
    }
    const plan = recovery(policy, c, productRows, decision, finance);
    const priorPlans = bucket('trade', c).sanctionMarketRecoveryPlans;
    if (!Array.isArray(priorPlans) || !priorPlans.some(row => row?.recoveryId === plan.recoveryId)) {
      const saved = dispatch('trade', 'OMEGA_SANCTION_RECORD_MARKET_RECOVERY', c, plan);
      if (saved?.accepted) writes++;
    }
    return { countryId: c, role: 'SUPPLIER', selectedAction: decision.selectedAction,
      productCount: productRows.length, exportShare: evidence.exportShare,
      investigationRecorded, writes };
  }
  function runPolicy(policy, budget, supplierBudget) {
    const ids = productsFor(policy), productIds = ids.length ? ids : [null];
    const pair = relationEvidence(policy), sides = [
      { c: policy.targetCountryId, partner: policy.issuerCountryId, role: 'TARGET' },
      { c: policy.issuerCountryId, partner: policy.targetCountryId, role: 'ISSUER' }
    ];
    const results = [];
    let writes = 0;
    for (const side of sides) {
      const notificationId = policy.policyKey + '-' + side.c;
      const oldNotifications = bucket('foreign', side.c).sanctionNotifications;
      if (!Array.isArray(oldNotifications) || !oldNotifications.some(row => row?.notificationId === notificationId)) {
        const saved = dispatch('foreign', 'OMEGA_SANCTION_RECORD_NOTIFICATION', side.c,
          { notificationId, countryId: side.c, counterpartCountryId: side.partner, role: side.role,
            policyKey: policy.policyKey, policyId: policy.policyId,
            issuerCountryId: policy.issuerCountryId, targetCountryId: policy.targetCountryId,
            policyType: policy.type, direction: policy.direction, effectiveTurn: policy.startTurn,
            expiryTurn: policy.endTurn, secondarySanctions: policy.secondarySanctions,
            notifiedTurn: turn(), status: 'DELIVERED_TO_COUNTRY_POLICY_RECORD',
            rationale: side.role === 'TARGET'
              ? 'Active foreign sanction names this country as its target; economic review is queued.'
              : 'This country is recorded as the sanction issuer; compliance review is queued.',
            source: 'OMEGA_SANCTION_RESPONSE_RUNTIME_V1' });
        if (saved?.accepted) writes++;
      }
      const productRows = productIds.map(rid =>
        productAssessment(policy, side.c, side.partner, rid, side.role, budget));
      const aggregateRisk = {
        exportsAtRisk: sumMoney(productRows, row => row.tradeExposure.exportsAtRisk),
        importsAtRisk: sumMoney(productRows, row => row.tradeExposure.importsAtRisk)
      };
      const finance = financial(side.c, aggregateRisk);
      const impactId = policy.policyKey + '-' + side.c + '-' + turn();
      const previousImpact = bucket('economy', side.c).sanctionEconomicAssessments;
      if (!Array.isArray(previousImpact) || !previousImpact.some(row => row?.impactId === impactId)) {
        const saved = dispatch('economy', 'OMEGA_SANCTION_RECORD_ECONOMIC_IMPACT',
          side.c, impactRecord(policy, side.c, side.partner, side.role, productRows, finance));
        if (saved?.accepted) writes++;
      }
      const exposureId = policy.policyKey + '-' + side.c + '-' + turn();
      const previousFinance = bucket('finance', side.c).sanctionFinancialExposureLedger;
      if (!Array.isArray(previousFinance) || !previousFinance.some(row => row?.exposureId === exposureId)) {
        const saved = dispatch('finance', 'OMEGA_SANCTION_RECORD_FINANCIAL_EXPOSURE',
          side.c, financeRecord(policy, side.c, side.partner, side.role, productRows, finance));
        if (saved?.accepted) writes++;
      }
      const inv = {
        investigationId: policy.policyKey + '-' + side.c, countryId: side.c,
        counterpartCountryId: side.partner, role: side.role, policyKey: policy.policyKey,
        policyId: policy.policyId, openedTurn: policy.startTurn, lastReviewedTurn: turn(),
        status: productRows.some(row => row.tradeExposure.exportsAtRisk.recordCount ||
          row.tradeExposure.importsAtRisk.recordCount || row.shortageEvidence) ? 'OPEN' : 'MONITORING',
        triggerReasons: [
          ...(productRows.some(row => row.tradeExposure.exportsAtRisk.recordCount ||
            row.tradeExposure.importsAtRisk.recordCount) ? ['COMPLETED_BILATERAL_TRADE_EXPOSURE'] : []),
          ...(productRows.some(row => row.shortageEvidence) ? ['RECORDED_DOMESTIC_SHORTAGE_OR_LOW_STOCK_COVERAGE'] : []),
          ...(finance.importCostMultiplier !== null && finance.importCostMultiplier > 1
            ? ['OBSERVED_IMPORT_COST_PRESSURE'] : []),
          ...(finance.foreignReserveCoverageDays !== null && finance.foreignReserveCoverageDays < 45
            ? ['OBSERVED_FOREIGN_RESERVE_PRESSURE'] : []),
          side.role === 'TARGET' ? 'ACTIVE_INCOMING_SANCTION_POLICY' : 'ISSUED_SANCTION_POLICY'
        ],
        collectionPlan: ['TRADE_SANCTION_POLICY_REGISTER', 'SETTLED_IMPORT_AND_EXPORT_LEDGER',
          'RESOURCE_NATIONAL_DEMAND_AND_STOCK_COVERAGE', 'FINANCE_TREASURY_AND_FX_RECORDS',
          'BILATERAL_FOREIGN_RELATION_RECORDS',
          ...(productRows.some(row => row.logistics?.recordCount)
            ? ['RECORDED_TRANSPORT_AND_TRANSIT_MANIFESTS'] : [])],
        productIds: productRows.map(row => row.resourceId).filter(Boolean),
        confidence: productRows.some(row => row.evidenceConfidence.length >= 2) ? 'MEDIUM' : 'LOW',
        scope: 'COUNTRY_OWNED_CASE_FILE_ONLY', noOmniscientIntelligence: true
      };
      const savedInv = dispatch('intelligence', 'OMEGA_SANCTION_RECORD_INVESTIGATION', side.c, inv);
      if (savedInv?.accepted) writes++;
      const options = decisionOptions(policy, productRows, finance, pair, side.role);
      const selected = options[0];
      const decision = {
        decisionId: policy.policyKey + '-' + side.c + '-' + turn(),
        countryId: side.c, counterpartCountryId: side.partner, role: side.role,
        policyKey: policy.policyKey, policyId: policy.policyId, decidedTurn: turn(),
        decisionModel: 'EVIDENCE_WEIGHTED_OPTION_COMPARISON_V1',
        options, selectedAction: selected.id, selectedActionTitle: selected.title,
        decisionStatus: selected.feasibility,
        decisionBasis: side.role === 'TARGET'
          ? 'COMPARE_OBSERVED_SHORTAGE_EXPORT_EXPOSURE_LEGAL_SUPPLIERS_DIPLOMACY_AND_FISCAL_HEADROOM'
          : 'COMPARE_POLICY_SCOPE_SETTLED_TRADE_EXPOSURE_AND_DOMESTIC_COMPLIANCE_CAPACITY',
        governmentMotives: motives(policy, side.role, productRows, finance),
        governmentActors: governmentActors(side.c, productRows),
        budgetAvailability: finance.ministryBudgetEvidence,
        budgetAuthority: finance.ministryBudgetEvidence.length
          ? 'EXISTING_FINANCE_MINISTRY_APPROPRIATIONS_ONLY' : 'NO_RELEVANT_APPROPRIATION_OBSERVED',
        budgetAction: 'NO_BUDGET_CREATED_OR_SPENT'
      };
      const previous = bucket('foreign', side.c).sanctionNationalDecisions;
      if (!Array.isArray(previous) || !previous.some(row => row?.decisionId === decision.decisionId)) {
        const saved = dispatch('foreign', 'OMEGA_SANCTION_RECORD_NATIONAL_DECISION', side.c, decision);
        if (saved?.accepted) writes++;
      }
      if (side.role === 'TARGET') {
        const plan = recovery(policy, side.c, productRows, decision, finance);
        const savedPlan = dispatch('trade', 'OMEGA_SANCTION_RECORD_MARKET_RECOVERY', side.c, plan);
        if (savedPlan?.accepted) writes++;
      }
      results.push({ countryId: side.c, role: side.role,
        selectedAction: decision.selectedAction, productCount: productRows.length });
    }
    const suppliers = supplierCountriesFor(policy, ids);
    for (const evidence of suppliers) {
      if (supplierBudget.used >= MAX_SUPPLIER_COUNTRIES_PER_TURN) break;
      supplierBudget.used++;
      try {
        const supplierResult = runSupplierSide(policy, evidence, budget, supplierBudget);
        if (supplierResult) {
          writes += supplierResult.writes;
          results.push(supplierResult);
        }
      } catch (error) {
        results.push({ countryId: evidence.supplierCountryId, role: 'SUPPLIER',
          error: String(error?.message || error) });
      }
    }
    return { policyKey: policy.policyKey, writes, countries: results };
  }
  function selectPolicies(all) {
    const fresh = all.filter(policy => {
      const targetRows = bucket('foreign', policy.targetCountryId).sanctionNotifications;
      const issuerRows = bucket('foreign', policy.issuerCountryId).sanctionNotifications;
      const targetId = policy.policyKey + '-' + policy.targetCountryId;
      const issuerId = policy.policyKey + '-' + policy.issuerCountryId;
      return !Array.isArray(targetRows) || !targetRows.some(row => row?.notificationId === targetId) ||
        !Array.isArray(issuerRows) || !issuerRows.some(row => row?.notificationId === issuerId);
    }).sort((a, b) => (b.startTurn ?? -1) - (a.startTurn ?? -1));
    const reviewed = all.filter(policy => !fresh.includes(policy));
    const chosen = fresh.slice(0, MAX_POLICIES);
    const slots = MAX_POLICIES - chosen.length;
    if (slots > 0 && reviewed.length) {
      const offset = policyCursor % reviewed.length;
      const count = Math.min(slots, reviewed.length);
      for (let index = 0; index < count; index++)
        chosen.push(reviewed[(offset + index) % reviewed.length]);
      policyCursor = (offset + count) % reviewed.length;
    }
    return chosen;
  }
  function runTurn() {
    if (!install()) return { status: 'WAITING_FOR_MINISTRY_INTEROPERABILITY', turn: turn() };
    const now = turn();
    if (lastProcessedTurn === now || g.__omegaSanctionResponseProcessedTurn === now)
      return { status: 'ALREADY_PROCESSED', turn: now };
    lastProcessedTurn = now;
    g.__omegaSanctionResponseProcessedTurn = now;
    const all = policies(), chosen = selectPolicies(all), budget = { used: 0 };
    const supplierBudget = { used: 0, investigations: { used: 0 } };
    const results = [];
    for (const policy of chosen) {
      try { results.push(runPolicy(policy, budget, supplierBudget)); }
      catch (error) { results.push({ policyKey: policy.policyKey, error: String(error?.message || error) }); }
    }
    lastMarketQueryCount = budget.used;
    const result = { status: 'COMPLETED', turn: now, activePoliciesFound: all.length,
      policiesProcessed: results.length, policyBudget: MAX_POLICIES,
      marketQueries: budget.used, marketQueryBudget: MAX_MARKET_QUERIES,
      supplierCountriesProcessed: supplierBudget.used,
      supplierCountryBudget: MAX_SUPPLIER_COUNTRIES_PER_TURN,
      supplierInvestigationsRecorded: supplierBudget.investigations.used,
      supplierInvestigationBudget: MAX_SUPPLIER_INVESTIGATIONS_PER_TURN, results };
    try {
      if (typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function')
        g.dispatchEvent(new g.CustomEvent('OMEGA_SANCTION_RESPONSE_PIPELINE_COMPLETED', { detail: clone(result) }));
    } catch (_) {}
    return result;
  }
  function diagnostics() {
    return {
      version: VERSION, ready: registration.ready, registration: clone(registration),
      turn: turn(), activePolicyCount: policies().length, worldCountryCount: worldCountries().length,
      lastProcessedTurn, lastMarketQueryCount, policyCursor,
      planner: 'POLICY_NOTIFICATION_ECONOMIC_ANALYSIS_NATIONAL_DECISION_MARKET_RECOVERY_INVESTIGATION',
      caps: { policiesPerTurn: MAX_POLICIES, productsPerPolicy: MAX_PRODUCTS,
        marketQueriesPerTurn: MAX_MARKET_QUERIES, tradeLedgerWindowTurns: LEDGER_WINDOW,
        supplierCountriesPerPolicy: MAX_SUPPLIER_COUNTRIES_PER_POLICY,
        supplierCountriesPerTurn: MAX_SUPPLIER_COUNTRIES_PER_TURN,
        supplierInvestigationsPerTurn: MAX_SUPPLIER_INVESTIGATIONS_PER_TURN },
      invariants: ['NO_CASH_OR_INVENTORY_CREATION', 'NO_AUTOMATIC_TRADE_OR_TREATY_EXECUTION',
        'NO_COUNTRY_WIDE_OMNISCIENT_INTELLIGENCE', 'UNKNOWN_EVIDENCE_REMAINS_NULL']
    };
  }
  function init() {
    install();
    if (!g.__omegaSanctionResponseHooksInstalled) {
      g.__omegaSanctionResponseHooksInstalled = true;
      g.addEventListener?.('OMEGA_READY', install);
      g.addEventListener?.('OMEGA_GAME_SESSION_STARTED', install);
      g.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED', runTurn);
    }
    return diagnostics();
  }
  const API = Object.freeze({ VERSION, init, install, diagnostics, runTurn, sanctionPolicies: policies,
    resourceIdsForPolicy: productsFor, demandMetrics: demand, tradeExposure: exposure,
    legalSuppliers, legalAlternativeBuyers, supplierCountriesFor, supplierCustomerExposure,
    intelligenceCapability, MAX_POLICIES, MAX_PRODUCTS, MAX_MARKET_QUERIES,
    MAX_SUPPLIER_COUNTRIES_PER_POLICY, MAX_SUPPLIER_COUNTRIES_PER_TURN,
    MAX_SUPPLIER_INVESTIGATIONS_PER_TURN });
  g.Omega = g.Omega || {};
  g.Omega.SanctionResponseRuntime = API;
  g.OmegaSanctionResponseRuntime = API;
  try { init(); } catch (error) { g.OmegaSanctionResponseRuntimeError = String(error?.message || error); }
})(typeof window !== 'undefined' ? window : globalThis);
