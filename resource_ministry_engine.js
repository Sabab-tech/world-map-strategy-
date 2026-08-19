/**
 * ============================================================================
 * GSRSK — PART 01 DATA FOUNDATION ARCHITECTURE
 * AUTHORITATIVE, COMPILER-LIKE, SCHEMA-AGNOSTIC DATA FOUNDATION KERNEL
 * Final Change Control: Run-State Isolation & Surgical Precision Locking.
 * Subsystems:
 *   P0: Foundation Contract & System State Definitions
 *   P1: Source Ingestion & Honest Cryptographic Hashing (UTF-8 Bytes)
 *   P2: Idempotent Raw Preservation & Raw Data Tree
 *   P3: Data Profiling Engine (Field-Level Presence & Missingness Tracking)
 *   P4: Schema Intelligence Engine (Structural Paths & Schema Drift Detector)
 *   P5: Semantic Profiling Engine (Multi-Factor Evidence Matrix)
 *   P6: Type & Extensible 4-Layer Unit System (Data-Driven, No Fake Fallbacks)
 *   P7: Identity Foundation Engine (Multi-Stage Resolution & Unicode Normalization)
 *   P8: Reference & Relationship Foundation Engine
 *   P9: True 5-Level Generic Validation Engine (L1 Syntax to L5 Referential)
 *   P10: Source Claims, Evidence & Unit-Aware Conflict Hybridization Engine
 *   P11: Foundation Knowledge Compiler & Master Registry
 *   P12: Diagnostics Engine (Dynamic Health & Global Coverage Reports)
 *
 * STRICT BOUNDARY: NO Simulation Logic, NO Country Hardcoding, NO Unit Hardcoding.
 * ============================================================================
 */

const _globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : global);
_globalScope.GSRSK_DataFoundation = (() => {
    'use strict';

    // =========================================================================
    // P0: FOUNDATION CONTRACT & SYSTEM STATE DEFINITIONS
    // =========================================================================
    const DataState = Object.freeze({
        PRESENT: 'PRESENT',
        MISSING: 'MISSING',
        UNKNOWN: 'UNKNOWN',
        INVALID: 'INVALID',
        UNVERIFIED: 'UNVERIFIED',
        NOT_APPLICABLE: 'NOT_APPLICABLE'
    });

    const IntegrityStatus = Object.freeze({
        CRYPTOGRAPHIC: 'CRYPTOGRAPHIC',
        NON_CRYPTOGRAPHIC: 'NON_CRYPTOGRAPHIC',
        UNAVAILABLE: 'UNAVAILABLE'
    });

    const RawNodeType = Object.freeze({
        DOCUMENT: 'DOCUMENT',
        OBJECT_NODE: 'OBJECT_NODE',
        ARRAY_NODE: 'ARRAY_NODE',
        FIELD_NODE: 'FIELD_NODE',
        VALUE_NODE: 'VALUE_NODE'
    });

    const ValidationSeverity = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        ERROR: 'ERROR',
        CRITICAL: 'CRITICAL'
    });

    const IdentityResolutionOutcome = Object.freeze({
        AUTO_ACCEPT: 'AUTO_ACCEPT',
        REVIEW: 'REVIEW',
        REJECT: 'REJECT'
    });

    const CanonicalValueStatus = Object.freeze({
        OBSERVED: 'OBSERVED',
        RESOLVED: 'RESOLVED',
        DERIVED: 'DERIVED',
        PREFERRED: 'PREFERRED',
        UNRESOLVED: 'UNRESOLVED',
        CONFLICTED: 'CONFLICTED'
    });

    const FoundationHealthStatus = Object.freeze({
        HEALTHY: 'DATA_FOUNDATION_HEALTHY',
        DEGRADED: 'DATA_FOUNDATION_DEGRADED',
        FAILED: 'DATA_FOUNDATION_FAILED'
    });

    // =========================================================================
    // P1: SOURCE INGESTION & HONEST CRYPTOGRAPHIC HASHING
    // =========================================================================
    class HonestHashEngine {
        /**
         * Computes true SHA-256 via Web Crypto API with honest fallback labeling
         */
        static async computeSourceFingerprint(dataBytesOrString) {
            if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
                try {
                    const encoder = new TextEncoder();
                    const data = typeof dataBytesOrString === 'string' ? encoder.encode(dataBytesOrString) : dataBytesOrString;
                    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                    
                    return {
                        hash: hashHex,
                        algorithm: 'SHA-256',
                        integrityStatus: IntegrityStatus.CRYPTOGRAPHIC
                    };
                } catch (e) {
                    // Fallthrough to explicit non-cryptographic fallback
                }
            }

            const fallbackFingerprint = HonestHashEngine._computeNonCryptoFingerprint(dataBytesOrString);
            return {
                hash: fallbackFingerprint,
                algorithm: 'NON_CRYPTOGRAPHIC_FINGERPRINT',
                integrityStatus: IntegrityStatus.NON_CRYPTOGRAPHIC
            };
        }

        static _computeNonCryptoFingerprint(str) {
            let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
            const s = typeof str === 'string' ? str : JSON.stringify(str);
            for (let i = 0; i < s.length; i++) {
                const ch = s.charCodeAt(i);
                h1 = Math.imul(h1 ^ ch, 2654435761);
                h2 = Math.imul(h2 ^ ch, 1597334677);
            }
            h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
            h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
            return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(64, '0');
        }

        static calculateTrueByteLength(dataPayload) {
            if (typeof Blob !== 'undefined') {
                return new Blob([dataPayload]).size;
            }
            if (typeof TextEncoder !== 'undefined') {
                return new TextEncoder().encode(typeof dataPayload === 'string' ? dataPayload : JSON.stringify(dataPayload)).length;
            }
            return typeof dataPayload === 'string' ? encodeURIComponent(dataPayload).split(/%..|./).length - 1 : 0;
        }
    }

    class ImportSession {
        constructor(sourceName, customMachineUuid = null) {
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const machineUuid = customMachineUuid || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 10));
            
            this.sessionId = `IMPORT-${dateStr}-001-${machineUuid}`;
            this.sessionNumber = 1;
            this.displayLabel = `IMPORT-${dateStr}-001`;
            this.sourceName = sourceName;
            this.startTime = Date.now();
            this.endTime = null;
            this.recordsProcessed = 0;
            this.status = 'INITIALIZED';
        }

        closeSession(recordsCount, status = 'COMPLETED') {
            this.recordsProcessed = recordsCount;
            this.endTime = Date.now();
            this.status = status;
        }
    }

    // =========================================================================
    // P2: RAW PRESERVATION & IDEMPOTENT RAW DATA TREE ARCHITECTURE
    // =========================================================================
    class RawDataNode {
        constructor(params) {
            this.nodeId = params.nodeId;
            this.parentNodeId = params.parentNodeId || null;
            this.nodeType = params.nodeType;
            this.path = params.path;
            this.arrayIndex = params.arrayIndex !== undefined ? params.arrayIndex : null;
            this.fieldName = params.fieldName || null;
            this.sourceRawPayload = params.sourceRawPayload;
            this.parsedValue = params.parsedValue;
            this.sourceId = params.sourceId;
            this.childrenNodeIds = [];
        }
    }

    class RawDataTreeRegistry {
        constructor() {
            this.nodes = new Map();
            this.documents = new Map();
            this.nodeCounter = 0;
        }

        async registerRawSource(sourceId, rawPayload, encoding = 'UTF-8') {
            if (this.documents.has(sourceId)) {
                this.clearSourceNodes(sourceId);
            }

            const fingerprint = await HonestHashEngine.computeSourceFingerprint(rawPayload);
            const trueByteLength = HonestHashEngine.calculateTrueByteLength(rawPayload);
            const rootNodeId = `node_doc_${sourceId}_${++this.nodeCounter}`;
            
            const rootNode = new RawDataNode({
                nodeId: rootNodeId,
                nodeType: RawNodeType.DOCUMENT,
                path: '$',
                sourceRawPayload: rawPayload,
                parsedValue: typeof rawPayload === 'string' ? null : rawPayload,
                sourceId: sourceId
            });

            this.nodes.set(rootNodeId, rootNode);
            this.documents.set(sourceId, {
                rootNodeId: rootNodeId,
                encoding: encoding,
                hash: fingerprint.hash,
                algorithm: fingerprint.algorithm,
                integrityStatus: fingerprint.integrityStatus,
                rawLengthBytes: trueByteLength,
                ingestedAt: Date.now()
            });

            let parsedObj;
            try {
                parsedObj = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
                rootNode.parsedValue = parsedObj;
            } catch (e) {
                parsedObj = { _unparsedRawPayload: rawPayload, _parseError: e.message };
                rootNode.parsedValue = parsedObj;
            }

            this._buildTreeRecursive(parsedObj, rootNodeId, '$', sourceId);
            return rootNodeId;
        }

        clearSourceNodes(sourceId) {
            for (let [nodeId, node] of this.nodes) {
                if (node.sourceId === sourceId) {
                    this.nodes.delete(nodeId);
                }
            }
            this.documents.delete(sourceId);
        }

        _buildTreeRecursive(currentVal, parentNodeId, currentPath, sourceId, fieldName = null, arrayIdx = null) {
            const nodeId = `node_${++this.nodeCounter}`;
            let nodeType = RawNodeType.VALUE_NODE;

            if (Array.isArray(currentVal)) {
                nodeType = RawNodeType.ARRAY_NODE;
            } else if (currentVal !== null && typeof currentVal === 'object') {
                nodeType = RawNodeType.OBJECT_NODE;
            } else {
                nodeType = RawNodeType.VALUE_NODE;
            }

            const node = new RawDataNode({
                nodeId: nodeId,
                parentNodeId: parentNodeId,
                nodeType: nodeType,
                path: currentPath,
                arrayIndex: arrayIdx,
                fieldName: fieldName,
                sourceRawPayload: JSON.stringify(currentVal),
                parsedValue: currentVal,
                sourceId: sourceId
            });

            this.nodes.set(nodeId, node);

            const parentNode = this.nodes.get(parentNodeId);
            if (parentNode) {
                parentNode.childrenNodeIds.push(nodeId);
            }

            if (nodeType === RawNodeType.OBJECT_NODE) {
                Object.keys(currentVal).forEach(key => {
                    const childPath = `${currentPath}.${key}`;
                    this._buildTreeRecursive(currentVal[key], nodeId, childPath, sourceId, key, null);
                });
            } else if (nodeType === RawNodeType.ARRAY_NODE) {
                currentVal.forEach((item, idx) => {
                    const childPath = `${currentPath}[${idx}]`;
                    this._buildTreeRecursive(item, nodeId, childPath, sourceId, null, idx);
                });
            }
        }

        getNode(nodeId) { return this.nodes.get(nodeId); }
    }

    // =========================================================================
    // P3: DATA PROFILING ENGINE (FIELD-LEVEL PRESENCE & MISSINGNESS)
    // =========================================================================
    class DataProfilingEngine {
        static profileDataset(treeRegistry, sourceId) {
            const doc = treeRegistry.documents.get(sourceId);
            if (!doc) return null;

            const profile = {
                sourceId: sourceId,
                documentCount: 1,
                recordCount: 0,
                objectCount: 0,
                arrayCount: 0,
                fieldCount: 0,
                uniqueFieldCount: 0,
                primitiveTypeDistribution: { string: 0, number: 0, boolean: 0, null: 0 },
                nullDistribution: { nullCount: 0, missingCount: 0, totalValues: 0 },
                fieldPresenceMap: new Map(),
                fieldCardinalityMap: new Map(),
                potentialIdentifiers: [],
                potentialReferences: []
            };

            const uniqueFieldsSet = new Set();
            const observedFieldOccurrences = new Map();
            const observedFieldNulls = new Map();

            treeRegistry.nodes.forEach(node => {
                if (node.sourceId !== sourceId) return;

                if (node.nodeType === RawNodeType.OBJECT_NODE) {
                    profile.objectCount++;
                    if (node.parentNodeId && treeRegistry.getNode(node.parentNodeId).nodeType === RawNodeType.ARRAY_NODE) {
                        profile.recordCount++;
                    }
                }

                if (node.nodeType === RawNodeType.ARRAY_NODE) profile.arrayCount++;
                if (node.fieldName) {
                    profile.fieldCount++;
                    uniqueFieldsSet.add(node.fieldName);
                }

                if (node.nodeType === RawNodeType.VALUE_NODE) {
                    profile.nullDistribution.totalValues++;
                    const val = node.parsedValue;
                    const valType = val === null ? 'null' : typeof val;

                    if (val === null) {
                        profile.nullDistribution.nullCount++;
                        if (node.fieldName) {
                            observedFieldNulls.set(node.fieldName, (observedFieldNulls.get(node.fieldName) || 0) + 1);
                        }
                    } else if (val === undefined) {
                        profile.nullDistribution.missingCount++;
                    } else if (valType === 'string' || valType === 'number' || valType === 'boolean') {
                        profile.primitiveTypeDistribution[valType] = (profile.primitiveTypeDistribution[valType] || 0) + 1;
                    }

                    if (node.fieldName) {
                        observedFieldOccurrences.set(node.fieldName, (observedFieldOccurrences.get(node.fieldName) || 0) + 1);

                        if (!profile.fieldCardinalityMap.has(node.fieldName)) {
                            profile.fieldCardinalityMap.set(node.fieldName, new Set());
                        }
                        profile.fieldCardinalityMap.get(node.fieldName).add(val);

                        const lowerField = node.fieldName.toLowerCase();
                        if (lowerField === 'id' || lowerField.endsWith('id') || lowerField.endsWith('code')) {
                            if (!profile.potentialIdentifiers.includes(node.fieldName)) {
                                profile.potentialIdentifiers.push(node.fieldName);
                            }
                        } else if (lowerField.includes('ref') || lowerField.includes('parent')) {
                            if (!profile.potentialReferences.includes(node.fieldName)) {
                                profile.potentialReferences.push(node.fieldName);
                            }
                        }
                    }
                }
            });

            profile.uniqueFieldCount = uniqueFieldsSet.size;

            observedFieldOccurrences.forEach((count, fieldName) => {
                const nulls = observedFieldNulls.get(fieldName) || 0;
                const denominator = profile.recordCount > 0 ? profile.recordCount : 1;
                profile.fieldPresenceMap.set(fieldName, {
                    fieldName: fieldName,
                    presenceCount: count,
                    nullCount: nulls,
                    missingCount: Math.max(0, denominator - count),
                    recordDenominator: denominator,
                    presenceRatePercent: parseFloat(((count / denominator) * 100).toFixed(2))
                });
            });

            return profile;
        }
    }

    // =========================================================================
    // P4: SCHEMA INTELLIGENCE & GENERIC SCHEMA DRIFT DETECTOR
    // =========================================================================
    class SchemaIntelligenceEngine {
        constructor() {
            this.discoveredSchemas = new Map();
        }

        discoverSchemaFromTree(treeRegistry, sourceId) {
            const schemaId = `schema_${sourceId}`;
            const fieldPathMap = new Map();

            treeRegistry.nodes.forEach(node => {
                if (node.sourceId !== sourceId || !node.fieldName) return;

                const structuralPath = node.path.replace(/\[\d+\]/g, '[]');
                
                if (!fieldPathMap.has(structuralPath)) {
                    fieldPathMap.set(structuralPath, {
                        fieldName: node.fieldName,
                        structuralPath: structuralPath,
                        parentContext: node.path.substring(0, node.path.lastIndexOf('.')),
                        occurrenceCount: 0,
                        observedTypes: new Set(),
                        sampleValues: []
                    });
                }

                const entry = fieldPathMap.get(structuralPath);
                entry.occurrenceCount++;
                entry.observedTypes.add(node.parsedValue === null ? 'null' : typeof node.parsedValue);
                if (entry.sampleValues.length < 5) {
                    entry.sampleValues.push(node.parsedValue);
                }
            });

            const schemaDef = {
                schemaId: schemaId,
                sourceId: sourceId,
                discoveredAt: Date.now(),
                fields: Array.from(fieldPathMap.values()).map(f => ({
                    fieldName: f.fieldName,
                    structuralPath: f.structuralPath,
                    parentContext: f.parentContext,
                    occurrenceCount: f.occurrenceCount,
                    types: Array.from(f.observedTypes),
                    sampleValues: f.sampleValues
                }))
            };

            this.discoveredSchemas.set(schemaId, schemaDef);
            return schemaDef;
        }

        static detectSchemaDrift(schemaA, schemaB) {
            if (!schemaA || !schemaB) return { hasDrift: false, driftCount: 0, driftReport: [] };

            const fieldsA = new Map(schemaA.fields.map(f => [f.structuralPath, f]));
            const fieldsB = new Map(schemaB.fields.map(f => [f.structuralPath, f]));

            const driftReport = [];

            fieldsB.forEach((fieldB, path) => {
                if (!fieldsA.has(path)) {
                    driftReport.push({ type: 'ADDED_FIELD', path: path, details: fieldB });
                } else {
                    const fieldA = fieldsA.get(path);
                    const typesA = fieldA.types.sort().join(',');
                    const typesB = fieldB.types.sort().join(',');
                    if (typesA !== typesB) {
                        driftReport.push({ type: 'TYPE_DRIFT', path: path, typesA: typesA, typesB: typesB });
                    }
                }
            });

            fieldsA.forEach((fieldA, path) => {
                if (!fieldsB.has(path)) {
                    driftReport.push({ type: 'REMOVED_FIELD', path: path, details: fieldA });
                }
            });

            return {
                hasDrift: driftReport.length > 0,
                driftCount: driftReport.length,
                driftReport: driftReport
            };
        }
    }

    // =========================================================================
    // P5: SEMANTIC PROFILING ENGINE (MULTI-FACTOR EVIDENCE MATRIX)
    // =========================================================================
    class SemanticProfilingEngine {
        analyzeFieldSemantics(schemaDef) {
            const candidates = [];

            schemaDef.fields.forEach(field => {
                const lowerField = field.fieldName.toLowerCase();
                let evidenceScore = 0.0;
                let candidateMeaning = 'UNKNOWN';
                const signals = [];

                if (lowerField === 'id' || lowerField.endsWith('id') || lowerField.endsWith('code')) {
                    candidateMeaning = 'IDENTIFIER';
                    evidenceScore += 0.40;
                    signals.push('NAME_PATTERN_IDENTIFIER');
                } else if (lowerField.includes('name') || lowerField.includes('label')) {
                    candidateMeaning = 'DISPLAY_NAME';
                    evidenceScore += 0.40;
                    signals.push('NAME_PATTERN_DISPLAY_NAME');
                } else if (lowerField.includes('lat') || lowerField.includes('lng')) {
                    candidateMeaning = 'GEOSPATIAL_COORDINATE';
                    evidenceScore += 0.50;
                    signals.push('NAME_PATTERN_GEOSPATIAL');
                }

                if (field.types.includes('number')) {
                    if (candidateMeaning === 'UNKNOWN') candidateMeaning = 'NUMERIC_MEASURE';
                    evidenceScore += 0.30;
                    signals.push('TYPE_NUMERIC');
                } else if (field.types.includes('string')) {
                    evidenceScore += 0.20;
                    signals.push('TYPE_STRING');
                }

                if (field.structuralPath.includes('location') || field.structuralPath.includes('region')) {
                    evidenceScore += 0.20;
                    signals.push('PATH_GEOSPATIAL_CONTEXT');
                }

                candidates.push({
                    fieldPath: field.structuralPath,
                    fieldName: field.fieldName,
                    candidateMeaning: candidateMeaning,
                    evidenceScore: Math.min(1.0, parseFloat(evidenceScore.toFixed(2))),
                    evidenceSignals: signals
                });
            });

            return candidates;
        }
    }

    // =========================================================================
    // P6: EXTENSIBLE DATA-DRIVEN 4-LAYER UNIT SYSTEM
    // =========================================================================
    class UnitDefinition {
        constructor(params) {
            this.unitId = params.unitId;
            this.dimension = params.dimension;
            this.baseUnit = params.baseUnit;
            this.scale = params.scale ?? 1.0;
            this.offset = params.offset ?? 0.0;
            this.aliases = params.aliases || [];
            this.context = params.context || 'GENERIC';
        }
    }

    class FourLayerUnitSystem {
        constructor() {
            this.unitRegistry = new Map();
            this.exchangeRates = new Map();
        }

        registerUnit(unitDef) {
            this.unitRegistry.set(unitDef.unitId.toLowerCase(), unitDef);
            unitDef.aliases.forEach(alias => this.unitRegistry.set(alias.toLowerCase(), unitDef));
        }

        updateExchangeRate(fromCurrency, toCurrency, rate) {
            this.exchangeRates.set(`${fromCurrency.toUpperCase()}_${toCurrency.toUpperCase()}`, rate);
        }

        getExchangeRate(fromCurrency, toCurrency) {
            if (fromCurrency === toCurrency) return { rate: 1.0, status: DataState.PRESENT };
            const pairKey = `${fromCurrency.toUpperCase()}_${toCurrency.toUpperCase()}`;
            if (this.exchangeRates.has(pairKey)) {
                return { rate: this.exchangeRates.get(pairKey), status: DataState.PRESENT };
            }
            return { rate: null, status: DataState.UNKNOWN }; // Honest UNKNOWN
        }

        convertUnit(value, fromUnitId, toUnitId) {
            const uFromKey = fromUnitId.toLowerCase();
            const uToKey = toUnitId.toLowerCase();

            if (uFromKey === uToKey) return { value: value, status: DataState.PRESENT };

            const uFrom = this.unitRegistry.get(uFromKey);
            const uTo = this.unitRegistry.get(uToKey);

            if (!uFrom || !uTo) return { value: null, status: DataState.UNVERIFIED };

            if (uFrom.dimension === 'CURRENCY' && uTo.dimension === 'CURRENCY') {
                const exResult = this.getExchangeRate(fromUnitId, toUnitId);
                if (exResult.status === DataState.UNKNOWN || exResult.rate === null) {
                    return { value: null, status: DataState.UNKNOWN };
                }
                return { value: value * exResult.rate, status: DataState.PRESENT };
            }

            if (uFrom.dimension === uTo.dimension) {
                const baseValue = (value * uFrom.scale) + uFrom.offset;
                const convertedValue = (baseValue - uTo.offset) / uTo.scale;
                return { value: convertedValue, status: DataState.PRESENT };
            }

            return { value: null, status: DataState.INVALID };
        }
    }

    // =========================================================================
    // P7: IDENTITY FOUNDATION & MULTI-STAGE RESOLUTION PIPELINE
    // =========================================================================
    class CanonicalEntityIdentity {
        constructor(canonicalId, entityConceptType) {
            this.canonicalId = canonicalId;
            this.entityConceptType = entityConceptType;
            this.aliases = new Set();
            this.externalIds = new Map();
        }
    }

    class IdentityFoundationEngine {
        constructor() {
            this.canonicalEntities = new Map();
            this.conceptAwareAliasMap = new Map();
            this.idCounter = 0;
        }

        _normalizeAlias(alias) {
            if (typeof alias !== 'string') return String(alias);
            return alias.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\u00C0-\u024F\u0400-\u04FF\u0980-\u09FF]/g, '');
        }

        registerCanonicalEntity(entityConceptType, primaryName, externalIds = {}) {
            const canonicalId = `ent_${entityConceptType.toLowerCase()}_${++this.idCounter}`;
            const entity = new CanonicalEntityIdentity(canonicalId, entityConceptType);
            
            this.canonicalEntities.set(canonicalId, entity);
            this.addAliasToEntity(canonicalId, primaryName);

            Object.keys(externalIds).forEach(sys => {
                entity.externalIds.set(sys, externalIds[sys]);
            });

            return entity;
        }

        addAliasToEntity(canonicalId, alias) {
            const entity = this.canonicalEntities.get(canonicalId);
            if (!entity) return false;

            const normalized = this._normalizeAlias(alias);
            const lookupKey = `${entity.entityConceptType.toUpperCase()}:${normalized}`;

            entity.aliases.add(alias);
            this.conceptAwareAliasMap.set(lookupKey, canonicalId);
            return true;
        }

        resolveIdentityCandidate(entityConceptType, candidateString, externalSysId = null) {
            if (!candidateString) return { outcome: IdentityResolutionOutcome.REJECT, canonicalId: null, confidenceScore: 0.0 };

            // Stage 1: External ID Match
            if (externalSysId) {
                for (let [id, entity] of this.canonicalEntities) {
                    if (entity.externalIds.get(externalSysId.system) === externalSysId.value) {
                        return { outcome: IdentityResolutionOutcome.AUTO_ACCEPT, canonicalId: id, confidenceScore: 0.99 };
                    }
                }
            }

            // Stage 2: Exact Normalized Alias Match
            const normalized = this._normalizeAlias(candidateString);
            const lookupKey = `${entityConceptType.toUpperCase()}:${normalized}`;

            if (this.conceptAwareAliasMap.has(lookupKey)) {
                return {
                    outcome: IdentityResolutionOutcome.AUTO_ACCEPT,
                    canonicalId: this.conceptAwareAliasMap.get(lookupKey),
                    confidenceScore: 0.92
                };
            }

            // Stage 3: Review Threshold for Partial Candidate Matches
            if (candidateString.length > 4) {
                for (let [key, id] of this.conceptAwareAliasMap) {
                    if (key.startsWith(`${entityConceptType.toUpperCase()}:`) && (key.includes(normalized) || normalized.includes(key.split(':')[1]))) {
                        return { outcome: IdentityResolutionOutcome.REVIEW, canonicalId: id, confidenceScore: 0.70 };
                    }
                }
            }

            return {
                outcome: IdentityResolutionOutcome.REJECT,
                canonicalId: null,
                confidenceScore: 0.0
            };
        }
    }

    // =========================================================================
    // P8: REFERENCE & RELATIONSHIP FOUNDATION
    // =========================================================================
    class ReferenceCandidate {
        constructor(params) {
            this.sourceNodeId = params.sourceNodeId;
            this.sourcePath = params.sourcePath;
            this.targetCandidateValue = params.targetCandidateValue;
            this.targetConceptType = params.targetConceptType;
            this.resolvedTargetCanonicalId = params.resolvedTargetCanonicalId || null;
            this.confidenceScore = params.confidenceScore || 0.0;
            this.status = params.status || 'UNRESOLVED';
        }
    }

    class ReferenceFoundationEngine {
        constructor(identityEngine) {
            this.identityEngine = identityEngine;
            this.referenceCandidates = [];
        }

        detectAndResolveReference(sourceNode, targetCandidateValue, targetConceptType) {
            const resolution = this.identityEngine.resolveIdentityCandidate(targetConceptType, targetCandidateValue);
            
            const refCandidate = new ReferenceCandidate({
                sourceNodeId: sourceNode.nodeId,
                sourcePath: sourceNode.path,
                targetCandidateValue: targetCandidateValue,
                targetConceptType: targetConceptType,
                resolvedTargetCanonicalId: resolution.canonicalId,
                confidenceScore: resolution.confidenceScore,
                status: resolution.outcome === IdentityResolutionOutcome.AUTO_ACCEPT ? 'RESOLVED' : 'UNRESOLVED'
            });

            this.referenceCandidates.push(refCandidate);
            return refCandidate;
        }
    }

    // =========================================================================
    // P9: TRUE 5-LEVEL GENERIC VALIDATION ENGINE
    // =========================================================================
    class ValidationReportItem {
        constructor(params) {
            this.ruleId = params.ruleId;
            this.level = params.level;
            this.fieldId = params.fieldId;
            this.path = params.path;
            this.actualValue = params.actualValue;
            this.expectedConstraint = params.expectedConstraint;
            this.severity = params.severity;
            this.blocking = params.blocking || false;
            this.repairable = params.repairable || false;
            this.suggestedAction = params.suggestedAction || null;
            this.provenanceRawNodeId = params.provenanceRawNodeId || null;
        }
    }

    class FiveLevelValidationEngine {
        constructor(unitSystem, identityEngine) {
            this.unitSystem = unitSystem;
            this.identityEngine = identityEngine;
        }

        validateDataset(treeRegistry, sourceId) {
            const report = {
                sourceId: sourceId,
                totalIssues: 0,
                l1_syntaxDiagnostics: [],
                l2_structuralDiagnostics: [],
                l3_typeRangeDiagnostics: [],
                l4_semanticUnitDiagnostics: [],
                l5_referentialDiagnostics: []
            };

            treeRegistry.nodes.forEach(node => {
                if (node.sourceId !== sourceId) return;

                // Level 1: Syntax & Byte Integrity
                if (node.nodeType === RawNodeType.DOCUMENT && node.parsedValue && node.parsedValue._parseError) {
                    report.l1_syntaxDiagnostics.push(new ValidationReportItem({
                        ruleId: 'L1_SYNTAX_ERROR', level: 'L1_SYNTAX', fieldId: '$', path: '$',
                        actualValue: node.parsedValue._parseError, expectedConstraint: 'VALID_JSON',
                        severity: ValidationSeverity.CRITICAL, blocking: true, provenanceRawNodeId: node.nodeId
                    }));
                }

                // Level 2: Structural Integrity
                if (node.nodeType === RawNodeType.VALUE_NODE && !node.parentNodeId) {
                    report.l2_structuralDiagnostics.push(new ValidationReportItem({
                        ruleId: 'L2_ORPHAN_NODE', level: 'L2_STRUCTURE', fieldId: node.fieldName || '$', path: node.path,
                        actualValue: node.parsedValue, expectedConstraint: 'PARENT_EXISTS',
                        severity: ValidationSeverity.ERROR, blocking: true, provenanceRawNodeId: node.nodeId
                    }));
                }

                // Level 3: Type & Numeric Sanity
                if (node.nodeType === RawNodeType.VALUE_NODE && typeof node.parsedValue === 'number') {
                    if (isNaN(node.parsedValue)) {
                        report.l3_typeRangeDiagnostics.push(new ValidationReportItem({
                            ruleId: 'L3_NAN_VALUE', level: 'L3_TYPE_RANGE', fieldId: node.fieldName, path: node.path,
                            actualValue: 'NaN', expectedConstraint: 'VALID_NUMBER',
                            severity: ValidationSeverity.ERROR, blocking: true, provenanceRawNodeId: node.nodeId
                        }));
                    }
                }

                // Level 4: Unit Compatibility Check
                if (node.fieldName && node.fieldName.toLowerCase() === 'unit' && typeof node.parsedValue === 'string') {
                    const unitRegistered = this.unitSystem.unitRegistry.has(node.parsedValue.toLowerCase());
                    if (!unitRegistered) {
                        report.l4_semanticUnitDiagnostics.push(new ValidationReportItem({
                            ruleId: 'L4_UNREGISTERED_UNIT', level: 'L4_SEMANTIC_UNIT', fieldId: node.fieldName, path: node.path,
                            actualValue: node.parsedValue, expectedConstraint: 'REGISTERED_IN_UNIT_SYSTEM',
                            severity: ValidationSeverity.WARNING, blocking: false, provenanceRawNodeId: node.nodeId
                        }));
                    }
                }

                // Level 5: Referential Integrity Check
                if (node.fieldName && (node.fieldName.toLowerCase().endsWith('_ref') || node.fieldName.toLowerCase().endsWith('parent'))) {
                    const candidateRef = String(node.parsedValue);
                    const resolution = this.identityEngine.resolveIdentityCandidate('ENTITY', candidateRef);

                    if (resolution.outcome !== IdentityResolutionOutcome.AUTO_ACCEPT) {
                        report.l5_referentialDiagnostics.push(new ValidationReportItem({
                            ruleId: 'L5_UNRESOLVED_ALIAS_REFERENCE', level: 'L5_REFERENTIAL', fieldId: node.fieldName, path: node.path,
                            actualValue: candidateRef, expectedConstraint: 'RESOLVED_CANONICAL_ALIAS',
                            severity: ValidationSeverity.WARNING, blocking: false, provenanceRawNodeId: node.nodeId
                        }));
                    }
                }
            });

            report.totalIssues = report.l1_syntaxDiagnostics.length + report.l2_structuralDiagnostics.length +
                                 report.l3_typeRangeDiagnostics.length + report.l4_semanticUnitDiagnostics.length +
                                 report.l5_referentialDiagnostics.length;

            return report;
        }
    }

    // =========================================================================
    // P10: SOURCE CLAIMS, EVIDENCE & UNIT-AWARE CONFLICT HYBRIDIZATION
    // =========================================================================
    class SourceClaim {
        constructor(params) {
            this.claimId = params.claimId;
            this.sourceId = params.sourceId;
            this.rawNodeId = params.rawNodeId;
            this.entityCanonicalId = params.entityCanonicalId;
            this.attributePath = params.attributePath;
            this.claimedValue = params.claimedValue;
            this.claimedUnit = params.claimedUnit || null;
            this.claimedTimestamp = params.claimedTimestamp || Date.now();
        }
    }

    class ClaimRepository {
        constructor() {
            this.claims = new Map();
            this.entityClaimsMap = new Map();
            this.counter = 0;
        }

        registerClaim(params) {
            const claimId = `claim_${++this.counter}`;
            const claim = new SourceClaim({ claimId, ...params });
            this.claims.set(claimId, claim);

            if (!this.entityClaimsMap.has(claim.entityCanonicalId)) {
                this.entityClaimsMap.set(claim.entityCanonicalId, new Set());
            }
            this.entityClaimsMap.get(claim.entityCanonicalId).add(claimId);
            return claim;
        }

        getClaimsForEntity(entityCanonicalId) {
            const claimIds = this.entityClaimsMap.get(entityCanonicalId);
            if (!claimIds) return [];
            return Array.from(claimIds).map(id => this.claims.get(id));
        }
    }

    class DataCrossingHybridizationEngine {
        constructor(identityEngine, claimRepo, unitSystem) {
            this.identityEngine = identityEngine;
            this.claimRepo = claimRepo;
            this.unitSystem = unitSystem;
            this.crossDocumentConflicts = [];
        }

        crossReferenceAndHybridize(sourceA_Profile, sourceB_Profile) {
            const crossingReport = {
                sourceA: sourceA_Profile ? sourceA_Profile.sourceId : 'SOURCE_A',
                sourceB: sourceB_Profile ? sourceB_Profile.sourceId : 'SOURCE_B',
                matchedEntitiesCount: 0,
                conflictsDetectedCount: 0,
                hybridizedRecordsIndex: new Map()
            };

            this.identityEngine.canonicalEntities.forEach((entity, canonicalId) => {
                const claims = this.claimRepo.getClaimsForEntity(canonicalId);
                const claimsByPath = new Map();

                claims.forEach(c => {
                    if (!claimsByPath.has(c.attributePath)) {
                        claimsByPath.set(c.attributePath, []);
                    }
                    claimsByPath.get(c.attributePath).push(c);
                });

                claimsByPath.forEach((claimList, path) => {
                    if (claimList.length > 1) {
                        const valA = claimList[0].claimedValue;
                        const valB = claimList[1].claimedValue;

                        let isConflict = String(valA) !== String(valB);

                        // Unit-Aware Normalization Check
                        if (typeof valA === 'number' && typeof valB === 'number' && claimList[0].claimedUnit && claimList[1].claimedUnit) {
                            const conv = this.unitSystem.convertUnit(valB, claimList[1].claimedUnit, claimList[0].claimedUnit);
                            if (conv.status === DataState.PRESENT && conv.value === valA) {
                                isConflict = false;
                            }
                        }

                        if (isConflict) {
                            crossingReport.conflictsDetectedCount++;
                            this.crossDocumentConflicts.push({
                                canonicalId: canonicalId,
                                attributePath: path,
                                claimA: { source: claimList[0].sourceId, value: valA, unit: claimList[0].claimedUnit },
                                claimB: { source: claimList[1].sourceId, value: valB, unit: claimList[1].claimedUnit },
                                canonicalStatus: CanonicalValueStatus.UNRESOLVED
                            });
                        }
                    }
                });

                crossingReport.hybridizedRecordsIndex.set(canonicalId, {
                    canonicalId: entity.canonicalId,
                    conceptType: entity.entityConceptType,
                    aliases: Array.from(entity.aliases),
                    claimsCount: claims.length
                });
            });

            crossingReport.matchedEntitiesCount = crossingReport.hybridizedRecordsIndex.size;
            return crossingReport;
        }
    }

    // =========================================================================
    // P11 & P12: KNOWLEDGE COMPILER & HONEST DIAGNOSTICS & COVERAGE REPORTS
    // =========================================================================
    class FoundationKnowledgeCompiler {
        constructor(treeRegistry, identityEngine, claimRepo, crossingEngine) {
            this.treeRegistry = treeRegistry;
            this.identityEngine = identityEngine;
            this.claimRepo = claimRepo;
            this.crossingEngine = crossingEngine;
        }

        compileMasterFoundationRegistry() {
            const masterRegistry = {
                compiledAt: Date.now(),
                documentsProcessed: this.treeRegistry.documents.size,
                rawNodesCount: this.treeRegistry.nodes.size,
                canonicalEntitiesCount: this.identityEngine.canonicalEntities.size,
                claimsCount: this.claimRepo.claims.size,
                conflictsCount: this.crossingEngine.crossDocumentConflicts.length,
                compiledEntitiesMap: new Map(),
                unresolvedConflicts: this.crossingEngine.crossDocumentConflicts
            };

            this.identityEngine.canonicalEntities.forEach((entity, canonicalId) => {
                const claims = this.claimRepo.getClaimsForEntity(canonicalId);
                masterRegistry.compiledEntitiesMap.set(canonicalId, {
                    canonicalId: entity.canonicalId,
                    conceptType: entity.entityConceptType,
                    aliases: Array.from(entity.aliases),
                    claims: claims.map(c => ({ path: c.attributePath, value: c.claimedValue, sourceId: c.sourceId }))
                });
            });

            return masterRegistry;
        }
    }

    class FoundationDiagnosticsEngine {
        static generateCoverageReport(treeRegistry, identityEngine, masterRegistry, validationReportA, validationReportB) {
            const l1CriticalA = validationReportA ? validationReportA.l1_syntaxDiagnostics.length : 0;
            const l1CriticalB = validationReportB ? validationReportB.l1_syntaxDiagnostics.length : 0;
            const totalIssues = (validationReportA ? validationReportA.totalIssues : 0) + (validationReportB ? validationReportB.totalIssues : 0);

            let healthStatus = FoundationHealthStatus.HEALTHY;
            if (l1CriticalA > 0 || l1CriticalB > 0) {
                healthStatus = FoundationHealthStatus.FAILED;
            } else if ((masterRegistry && masterRegistry.conflictsCount > 0) || totalIssues > 0 || identityEngine.canonicalEntities.size === 0) {
                healthStatus = FoundationHealthStatus.DEGRADED;
            }

            const coverageByConcept = {};
            identityEngine.canonicalEntities.forEach(entity => {
                const concept = entity.entityConceptType;
                coverageByConcept[concept] = (coverageByConcept[concept] || 0) + 1;
            });

            return {
                generatedAt: Date.now(),
                totalSourcesProcessed: treeRegistry.documents.size,
                totalEntitiesDiscovered: identityEngine.canonicalEntities.size,
                totalConflictsDetected: masterRegistry ? masterRegistry.conflictsCount : 0,
                coverageByConcept: coverageByConcept,
                healthStatus: healthStatus
            };
        }
    }

    // =========================================================================
    // MASTER DATA FOUNDATION PIPELINE (A1: RUN-STATE ISOLATED ORCHESTRATION)
    // =========================================================================
    class MasterDataFoundationPipeline {
        constructor(customUnitSystem = null) {
            this.sharedUnitSystem = customUnitSystem || new FourLayerUnitSystem();
        }

        /**
         * A1 Fix: Isolated Run Context - Each invocation executes within fresh, isolated subsystem states!
         */
        async processSourceDatasets(sourceA_Name, payloadA, sourceB_Name = null, payloadB = null) {
            // Run-Scoped Subsystem Instantiations (Guarantees zero cross-run data contamination)
            const runTreeRegistry = new RawDataTreeRegistry();
            const runUnitSystem = this.sharedUnitSystem;
            const runSchemaEngine = new SchemaIntelligenceEngine();
            const runSemanticEngine = new SemanticProfilingEngine();
            const runIdentityEngine = new IdentityFoundationEngine();
            const runReferenceEngine = new ReferenceFoundationEngine(runIdentityEngine);
            const runClaimRepo = new ClaimRepository();
            const runCrossingEngine = new DataCrossingHybridizationEngine(runIdentityEngine, runClaimRepo, runUnitSystem);
            const runValidator = new FiveLevelValidationEngine(runUnitSystem, runIdentityEngine);
            const runCompiler = new FoundationKnowledgeCompiler(runTreeRegistry, runIdentityEngine, runClaimRepo, runCrossingEngine);

            const sessionA = new ImportSession(sourceA_Name);

            // Step 1: Raw Ingestion
            const rootA = await runTreeRegistry.registerRawSource(sourceA_Name, payloadA);
            let rootB = null;
            if (payloadB) {
                rootB = await runTreeRegistry.registerRawSource(sourceB_Name, payloadB);
            }

            // Step 2: Profiling & Schema Intelligence
            const profileA = DataProfilingEngine.profileDataset(runTreeRegistry, sourceA_Name);
            const schemaA = runSchemaEngine.discoverSchemaFromTree(runTreeRegistry, sourceA_Name);
            const semanticsA = runSemanticEngine.analyzeFieldSemantics(schemaA);

            let profileB = null, schemaB = null, semanticsB = null;
            if (payloadB) {
                profileB = DataProfilingEngine.profileDataset(runTreeRegistry, sourceB_Name);
                schemaB = runSchemaEngine.discoverSchemaFromTree(runTreeRegistry, sourceB_Name);
                semanticsB = runSemanticEngine.analyzeFieldSemantics(schemaB);
            }

            // Detect Schema Drift
            const schemaDrift = SchemaIntelligenceEngine.detectSchemaDrift(schemaA, schemaB);

            // Step 3: Populate Identity Candidates & Source Claims (Array-Object Fix)
            runTreeRegistry.nodes.forEach(node => {
                if (node.nodeType === RawNodeType.OBJECT_NODE) {
                    let conceptType = 'ENTITY';

                    if (node.fieldName) {
                        conceptType = node.fieldName;
                    } else if (node.parentNodeId) {
                        const parentNode = runTreeRegistry.getNode(node.parentNodeId);
                        if (parentNode && parentNode.fieldName) {
                            conceptType = parentNode.fieldName;
                        }
                    }

                    const canonicalEntity = runIdentityEngine.registerCanonicalEntity(conceptType, `${conceptType}_${node.nodeId}`);
                    
                    node.childrenNodeIds.forEach(childId => {
                        const childNode = runTreeRegistry.getNode(childId);
                        if (childNode && childNode.fieldName && childNode.nodeType === RawNodeType.VALUE_NODE) {
                            runClaimRepo.registerClaim({
                                sourceId: node.sourceId,
                                rawNodeId: childNode.nodeId,
                                entityCanonicalId: canonicalEntity.canonicalId,
                                attributePath: childNode.fieldName,
                                claimedValue: childNode.parsedValue
                            });

                            if (childNode.fieldName.toLowerCase().endsWith('_ref') || childNode.fieldName.toLowerCase().endsWith('id')) {
                                runReferenceEngine.detectAndResolveReference(childNode, String(childNode.parsedValue), 'ENTITY');
                            }
                        }
                    });
                }
            });

            // Step 4: Hybridize & Data Crossing
            const crossingReport = runCrossingEngine.crossReferenceAndHybridize(profileA, profileB);

            // Step 5: Validate BOTH Datasets (Source A + Source B)
            const validationA = runValidator.validateDataset(runTreeRegistry, sourceA_Name);
            let validationB = null;
            if (payloadB) {
                validationB = runValidator.validateDataset(runTreeRegistry, sourceB_Name);
            }

            // Step 6: Knowledge Compilation into Master Foundation Registry
            const masterRegistry = runCompiler.compileMasterFoundationRegistry();
            const diagnostics = FoundationDiagnosticsEngine.generateCoverageReport(runTreeRegistry, runIdentityEngine, masterRegistry, validationA, validationB);

            sessionA.closeSession(profileA ? profileA.recordCount : 0, diagnostics.healthStatus);

            return {
                pipelineStatus: diagnostics.healthStatus,
                importSessionA: sessionA,
                profileA,
                schemaA,
                semanticsA,
                profileB,
                schemaB,
                semanticsB,
                schemaDrift,
                crossingReport,
                validationA,
                validationB,
                masterRegistry,
                diagnostics
            };
        }
    }

    // =========================================================================
    // PUBLIC ADAPTER BINDING
    // =========================================================================
    const PublicEngineAdapter = {
        DataState,
        IntegrityStatus,
        RawNodeType,
        ValidationSeverity,
        IdentityResolutionOutcome,
        CanonicalValueStatus,
        FoundationHealthStatus,
        HonestHashEngine,
        ImportSession,
        RawDataNode,
        RawDataTreeRegistry,
        DataProfilingEngine,
        SchemaIntelligenceEngine,
        SemanticProfilingEngine,
        UnitDefinition,
        FourLayerUnitSystem,
        CanonicalEntityIdentity,
        IdentityFoundationEngine,
        ReferenceCandidate,
        ReferenceFoundationEngine,
        SourceClaim,
        ClaimRepository,
        DataCrossingHybridizationEngine,
        ValidationReportItem,
        FiveLevelValidationEngine,
        FoundationKnowledgeCompiler,
        FoundationDiagnosticsEngine,
        MasterDataFoundationPipeline
    };

    return PublicEngineAdapter;
})();

/**
 * ============================================================================
 * GSRSK — PART 02: WORLD KNOWLEDGE COMPILER & ONTOLOGY ENGINE
 * ============================================================================
 * Architecture Phase: 02 of 16
 * Constitutional Role: Authoritative Semantic Knowledge Compilation, Ontology
 *                      Modeling, Directed Relationship Graph & Projections.
 * 
 * STRICT CONSTITUTIONAL BOUNDARIES:
 * 1. Zero Simulation Leakage: No extraction math, pricing, trading, or AI decisions.
 * 2. Zero Domain Hardcoding: No hardcoded country logic or artificial concept mapping.
 * 3. Zero Fallback Inventions: Missing data marked as UNKNOWN, never invented.
 * 4. Epistemic & Derivation Integrity: Explicit evidence states for every claim.
 * 5. General Directed Graph: Preserves real-world cycles with provenance.
 * 6. True Deep Immutability: Deeply sealed read-only contract for Part 03.
 * ============================================================================
 */

(function(global) {
    'use strict';

    // =========================================================================
    // 02.0: EPISTEMIC, DERIVATION & ONTOLOGICAL ENUMS
    // =========================================================================

    const KnowledgeState = Object.freeze({
        KNOWN: 'KNOWN',
        PROBABLE: 'PROBABLE',
        POTENTIAL: 'POTENTIAL',
        ABSENT_OR_NEGLIGIBLE: 'ABSENT_OR_NEGLIGIBLE',
        UNKNOWN: 'UNKNOWN',
        UNRESOLVED: 'UNRESOLVED',
        CONFLICTED: 'CONFLICTED'
    });

    const DerivationType = Object.freeze({
        OBSERVED: 'OBSERVED',
        DECLARED: 'DECLARED',
        RESOLVED: 'RESOLVED',
        DERIVED: 'DERIVED',
        INFERRED: 'INFERRED',
        UNKNOWN: 'UNKNOWN',
        CONFLICTED: 'CONFLICTED'
    });

    const EntityTier = Object.freeze({
        TIER_A_CANONICAL: 'TIER_A_CANONICAL',
        TIER_B_REFERENCED: 'TIER_B_REFERENCED'
    });

    const ConceptCategory = Object.freeze({
        COUNTRY: 'COUNTRY',
        RESOURCE_TYPE: 'RESOURCE_TYPE',
        RESOURCE_REGION: 'RESOURCE_REGION',
        INFRASTRUCTURE_REFERENCE: 'INFRASTRUCTURE_REFERENCE',
        TRANSPORT_CORRIDOR: 'TRANSPORT_CORRIDOR',
        CAPABILITY: 'CAPABILITY',
        CONSTRAINT_SPEC: 'CONSTRAINT_SPEC',
        RISK_SPEC: 'RISK_SPEC',
        ORGANIZATION: 'ORGANIZATION',
        GENERAL_CONCEPT: 'GENERAL_CONCEPT'
    });

    const RelationType = Object.freeze({
        // Endowments
        HAS_RESOURCE_KNOWN: 'HAS_RESOURCE_KNOWN',
        HAS_RESOURCE_PROBABLE: 'HAS_RESOURCE_PROBABLE',
        HAS_RESOURCE_POTENTIAL: 'HAS_RESOURCE_POTENTIAL',
        HAS_RESOURCE_ABSENT: 'HAS_RESOURCE_ABSENT',
        
        // Strategic & Dependencies
        HAS_STRATEGIC_RESOURCE: 'HAS_STRATEGIC_RESOURCE',
        HAS_DOMESTIC_AVAILABILITY: 'HAS_DOMESTIC_AVAILABILITY',
        HAS_IMPORT_DEPENDENCY: 'HAS_IMPORT_DEPENDENCY',
        HAS_EXPORT_CRITICALITY: 'HAS_EXPORT_CRITICALITY',
        HAS_DUAL_USE_RELEVANCE: 'HAS_DUAL_USE_RELEVANCE',
        
        // Quality Context
        DECLARES_HIGH_GRADE_RESOURCE: 'DECLARES_HIGH_GRADE_RESOURCE',
        DECLARES_LOW_GRADE_RESOURCE: 'DECLARES_LOW_GRADE_RESOURCE',

        // Resource Potentials
        DECLARES_DEEP_POTENTIAL: 'DECLARES_DEEP_POTENTIAL',
        DECLARES_SECONDARY_POTENTIAL: 'DECLARES_SECONDARY_POTENTIAL',
        DECLARES_OFFSHORE_POTENTIAL: 'DECLARES_OFFSHORE_POTENTIAL',

        // Extraction & Industrial Declarations
        DECLARES_EXTRACTION_POTENTIAL: 'DECLARES_EXTRACTION_POTENTIAL',
        DECLARES_CONVENTIONAL_EXTRACTION: 'DECLARES_CONVENTIONAL_EXTRACTION',
        DECLARES_CHALLENGING_EXTRACTION: 'DECLARES_CHALLENGING_EXTRACTION',
        DECLARES_PROCESSING_CAPABILITY: 'DECLARES_PROCESSING_CAPABILITY',
        DECLARES_INDUSTRIAL_CAPACITY_REF: 'DECLARES_INDUSTRIAL_CAPACITY_REF',
        DECLARES_TECHNOLOGY_CAPABILITY: 'DECLARES_TECHNOLOGY_CAPABILITY',

        // Spatial & Physical Linkages
        LOCATED_IN_REGION: 'LOCATED_IN_REGION',
        REFERENCES_INFRASTRUCTURE: 'REFERENCES_INFRASTRUCTURE',
        CONNECTED_BY_CORRIDOR: 'CONNECTED_BY_CORRIDOR',

        // Systemic Constraints & Risks
        CONSTRAINED_BY: 'CONSTRAINED_BY',
        EXPOSED_TO_RISK: 'EXPOSED_TO_RISK'
    });

    const OwnershipStatus = Object.freeze({
        DECLARED: 'DECLARED',
        UNKNOWN: 'UNKNOWN',
        NOT_APPLICABLE: 'NOT_APPLICABLE',
        INFERRED: 'INFERRED'
    });

    // =========================================================================
    // 02.1: DEEP IMMUTABILITY & HELPER UTILITIES
    // =========================================================================

    function deepFreeze(obj, seen = new WeakSet()) {
        if (obj === null || typeof obj !== 'object' || seen.has(obj)) {
            return obj;
        }
        seen.add(obj);

        if (obj instanceof Map) {
            for (const [key, value] of obj.entries()) {
                deepFreeze(key, seen);
                deepFreeze(value, seen);
            }
            obj.set = function() { throw new Error('[GSRSK Immutability Violation]: Mutation forbidden on frozen Map.'); };
            obj.delete = function() { throw new Error('[GSRSK Immutability Violation]: Mutation forbidden on frozen Map.'); };
            obj.clear = function() { throw new Error('[GSRSK Immutability Violation]: Mutation forbidden on frozen Map.'); };
        } else if (obj instanceof Set) {
            for (const item of obj) {
                deepFreeze(item, seen);
            }
            obj.add = function() { throw new Error('[GSRSK Immutability Violation]: Mutation forbidden on frozen Set.'); };
            obj.delete = function() { throw new Error('[GSRSK Immutability Violation]: Mutation forbidden on frozen Set.'); };
            obj.clear = function() { throw new Error('[GSRSK Immutability Violation]: Mutation forbidden on frozen Set.'); };
        } else {
            const propNames = Object.getOwnPropertyNames(obj);
            for (const name of propNames) {
                deepFreeze(obj[name], seen);
            }
        }
        return Object.freeze(obj);
    }

    function normalizeToken(str) {
        if (!str || typeof str !== 'string') return '';
        return str
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
            .replace(/[\s\-_/.]+/g, '_')
            .replace(/[^a-z0-9_]/g, '');
    }

    function safeClone(data) {
        if (data === undefined) return undefined;
        return JSON.parse(JSON.stringify(data));
    }

    // =========================================================================
    // 02.2: PROVENANCE RECORD MODEL
    // =========================================================================

    class ProvenanceRecord {
        constructor({ sourceDatasetId, sourceContextPath, derivationType, confidence, evidenceState }) {
            this.sourceDatasetId = sourceDatasetId || 'UNKNOWN_SOURCE';
            this.sourceContextPath = sourceContextPath || 'UNKNOWN_PATH';
            this.derivationType = derivationType || DerivationType.DECLARED;
            this.confidence = typeof confidence === 'number' ? confidence : 1.0;
            this.evidenceState = evidenceState || KnowledgeState.KNOWN;
            this.compiledTimestamp = Date.now();
        }
    }

    // =========================================================================
    // 02.3: TIER A CANONICAL & TIER B REFERENCED ENTITY STRUCTURES
    // =========================================================================

    class CanonicalResourceProfile {
        constructor({ resourceId, name, category, unit, strategicImportance, description, provenance }) {
            this.resourceId = resourceId;
            this.name = name || resourceId;
            this.category = category || KnowledgeState.UNKNOWN;
            this.unit = unit || KnowledgeState.UNKNOWN; // STRICT: Zero fallback invention
            this.strategicImportance = strategicImportance || KnowledgeState.UNKNOWN; // STRICT: Zero fallback invention
            this.description = description || '';
            this.tier = EntityTier.TIER_A_CANONICAL;
            this.provenance = provenance instanceof ProvenanceRecord ? provenance : new ProvenanceRecord(provenance || {});
        }
    }

    class CanonicalCountryProfile {
        constructor({ countryId, name, officialName, iso2, iso3, continent, subcontinent, region, aliases = [] }) {
            this.countryId = countryId;
            this.name = name || countryId;
            this.officialName = officialName || name || countryId;
            this.iso2 = iso2 || KnowledgeState.UNKNOWN;
            this.iso3 = iso3 || countryId;
            this.continent = continent || KnowledgeState.UNKNOWN;
            this.subcontinent = subcontinent || KnowledgeState.UNKNOWN;
            this.region = region || KnowledgeState.UNKNOWN;
            this.aliases = Array.from(new Set(aliases.filter(Boolean)));
            this.tier = EntityTier.TIER_A_CANONICAL;
            
            // Rich Context Views
            this.geography = null;
            this.resourceRegions = [];
            this.endowmentProfiles = [];
            this.strategicProfile = null;
            this.dependencyContext = null;
            this.qualityContext = null;
            this.extractionContext = null;
            this.industrialContext = null;
            this.potentialContext = null;
            this.constraints = [];
            this.risks = [];
            this.infrastructureReferences = [];
            this.transportCorridorReferences = [];
        }
    }

    class ReferencedKnowledgeEntity {
        constructor(params) {
            this.referenceId = params.referenceId;
            this.rawReferenceString = params.rawReferenceString;
            this.normalizedToken = params.normalizedToken;
            this.category = params.category || ConceptCategory.INFRASTRUCTURE_REFERENCE;
            this.tier = EntityTier.TIER_B_REFERENCED;
            this.parentCountryId = params.parentCountryId;
            this.sourceDatasetId = params.sourceDatasetId;
            this.sourceContextPaths = params.sourceContextPath ? [params.sourceContextPath] : [];
            this.occurrenceCount = 1;
            this.resolvedCanonicalTarget = null;
            this.resolutionConfidence = 0.0;
            this.metadata = safeClone(params.metadata) || {};
        }
    }

    // =========================================================================
    // 02.4: TIER B REFERENCE CATALOG (Deduplicating Registry)
    // =========================================================================

    class TierBReferenceCatalog {
        constructor() {
            this.references = new Map(); // referenceId -> ReferencedKnowledgeEntity
            this.lookupIndex = new Map(); // "COUNTRY:CATEGORY:NORM" -> referenceId
        }

        registerReference({ rawString, category, parentCountryId, sourceContextPath, sourceDatasetId, metadata = {} }) {
            if (!rawString || typeof rawString !== 'string' || !rawString.trim()) return null;

            const norm = normalizeToken(rawString);
            const lookupKey = `${parentCountryId || 'GLOBAL'}__${category}__${norm}`;

            if (this.lookupIndex.has(lookupKey)) {
                const existingId = this.lookupIndex.get(lookupKey);
                const existing = this.references.get(existingId);
                existing.occurrenceCount += 1;
                if (sourceContextPath && !existing.sourceContextPaths.includes(sourceContextPath)) {
                    existing.sourceContextPaths.push(sourceContextPath);
                }
                return existing;
            }

            const referenceId = `ref_${category.toLowerCase()}_${this.references.size + 1}`;
            const refEntity = new ReferencedKnowledgeEntity({
                referenceId,
                rawReferenceString: rawString.trim(),
                normalizedToken: norm,
                category: category.toUpperCase(),
                parentCountryId,
                sourceContextPath,
                sourceDatasetId,
                metadata
            });

            this.references.set(referenceId, refEntity);
            this.lookupIndex.set(lookupKey, referenceId);
            return refEntity;
        }

        getReference(referenceId) {
            return this.references.get(referenceId) || null;
        }

        getAllReferences() {
            return Array.from(this.references.values());
        }
    }

    // =========================================================================
    // 02.5: DATA-DRIVEN CONCEPT RESOLVER (Zero Hardcoded Guessing)
    // =========================================================================

    class DynamicConceptResolver {
        constructor() {
            this.canonicalConcepts = new Map(); // conceptType -> Set of canonical IDs
            this.aliasLookup = new Map();      // "CONCEPT_TYPE:NORM_ALIAS" -> canonicalId
        }

        registerCanonicalConcept(conceptType, canonicalId, aliases = []) {
            const cType = conceptType.toUpperCase();
            if (!this.canonicalConcepts.has(cType)) {
                this.canonicalConcepts.set(cType, new Set());
            }
            this.canonicalConcepts.get(cType).add(canonicalId);

            // Register canonical ID itself as alias
            const selfNorm = normalizeToken(canonicalId);
            this.aliasLookup.set(`${cType}:${selfNorm}`, canonicalId);

            // Register all provided aliases
            aliases.forEach(alias => {
                const norm = normalizeToken(alias);
                if (norm) {
                    this.aliasLookup.set(`${cType}:${norm}`, canonicalId);
                }
            });
        }

        resolve(conceptType, rawTerm) {
            if (!rawTerm || typeof rawTerm !== 'string') return null;
            const cType = conceptType.toUpperCase();
            const norm = normalizeToken(rawTerm);
            const lookupKey = `${cType}:${norm}`;

            if (this.aliasLookup.has(lookupKey)) {
                return {
                    canonicalId: this.aliasLookup.get(lookupKey),
                    derivationType: DerivationType.RESOLVED,
                    confidence: 1.0,
                    status: KnowledgeState.KNOWN
                };
            }

            return {
                canonicalId: null,
                normalizedToken: norm,
                derivationType: DerivationType.UNKNOWN,
                confidence: 0.0,
                status: KnowledgeState.UNRESOLVED
            };
        }
    }

    // =========================================================================
    // 02.6: MASTER DIRECTED RELATIONSHIP GRAPH (Cycle-Preserved)
    // =========================================================================

    class KnowledgeGraphEdge {
        constructor({ edgeId, sourceId, targetId, relationType, targetCategory, isTargetReferenced, provenance, metadata = {} }) {
            this.edgeId = edgeId;
            this.sourceId = sourceId;
            this.targetId = targetId;
            this.relationType = relationType;
            this.targetCategory = targetCategory || ConceptCategory.GENERAL_CONCEPT;
            this.isTargetReferenced = isTargetReferenced || false;
            this.provenance = provenance instanceof ProvenanceRecord ? provenance : new ProvenanceRecord(provenance || {});
            this.metadata = metadata;
        }
    }

    class GeneralDirectedKnowledgeGraph {
        constructor() {
            this.adjacencyList = new Map(); // sourceId -> Array<KnowledgeGraphEdge>
            this.inboundList = new Map();   // targetId -> Array<KnowledgeGraphEdge>
            this.nodes = new Map();         // nodeId -> { id, category, label }
            this.edgeCounter = 0;
        }

        registerNode(id, category, label = '') {
            if (!this.nodes.has(id)) {
                this.nodes.set(id, { id, category, label: label || id });
            }
        }

        addEdge(sourceId, targetId, relationType, provenance, targetCategory = ConceptCategory.GENERAL_CONCEPT, isTargetReferenced = false, metadata = {}) {
            this.registerNode(sourceId, ConceptCategory.GENERAL_CONCEPT);
            this.registerNode(targetId, targetCategory);

            const edgeId = `edge_${++this.edgeCounter}`;
            const edge = new KnowledgeGraphEdge({
                edgeId,
                sourceId,
                targetId,
                relationType,
                targetCategory,
                isTargetReferenced,
                provenance,
                metadata
            });

            if (!this.adjacencyList.has(sourceId)) {
                this.adjacencyList.set(sourceId, []);
            }
            this.adjacencyList.get(sourceId).push(edge);

            if (!this.inboundList.has(targetId)) {
                this.inboundList.set(targetId, []);
            }
            this.inboundList.get(targetId).push(edge);

            return edge;
        }

        getOutboundEdges(sourceId) {
            return this.adjacencyList.get(sourceId) || [];
        }

        getInboundEdges(targetId) {
            return this.inboundList.get(targetId) || [];
        }

        detectCycles() {
            const visited = new Set();
            const recursionStack = new Set();
            const detectedCycles = [];
            const currentPath = [];

            const dfs = (nodeId) => {
                visited.add(nodeId);
                recursionStack.add(nodeId);
                currentPath.push(nodeId);

                const edges = this.adjacencyList.get(nodeId) || [];
                for (const edge of edges) {
                    const neighbor = edge.targetId;
                    if (!visited.has(neighbor)) {
                        dfs(neighbor);
                    } else if (recursionStack.has(neighbor)) {
                        const cycleStartIndex = currentPath.indexOf(neighbor);
                        if (cycleStartIndex !== -1) {
                            detectedCycles.push({
                                path: currentPath.slice(cycleStartIndex).concat(neighbor),
                                relation: edge.relationType
                            });
                        }
                    }
                }

                currentPath.pop();
                recursionStack.delete(nodeId);
            };

            for (const nodeId of this.nodes.keys()) {
                if (!visited.has(nodeId)) {
                    dfs(nodeId);
                }
            }

            return detectedCycles;
        }
    }

    // =========================================================================
    // 02.7 – 02.10: PROJECTIONS (OWNERSHIP, CAPABILITY, DEPENDENCY)
    // =========================================================================

    class OwnershipProjectionView {
        constructor() {
            this.records = new Map(); // entityId -> Record
        }

        registerOwnership({ entityId, ownerId = null, operatorId = null, hostCountryId = null, status = OwnershipStatus.UNKNOWN, provenance }) {
            const record = {
                entityId,
                ownerId: ownerId || null,
                operatorId: operatorId || null,
                hostCountryId: hostCountryId || null,
                ownershipStatus: status,
                provenance: provenance instanceof ProvenanceRecord ? provenance : new ProvenanceRecord(provenance || {})
            };
            this.records.set(entityId, record);
            return record;
        }

        getOwnership(entityId) {
            return this.records.get(entityId) || {
                entityId,
                ownerId: null,
                operatorId: null,
                hostCountryId: null,
                ownershipStatus: OwnershipStatus.UNKNOWN,
                provenance: new ProvenanceRecord({ derivationType: DerivationType.UNKNOWN, evidenceState: KnowledgeState.UNKNOWN })
            };
        }
    }

    class StructuralCapabilityProjectionView {
        constructor() {
            this.capabilities = []; // Array of capability records
        }

        registerCapability({ entityId, domain, capabilityName, relationType, provenance }) {
            const record = {
                entityId,
                domain: domain || 'GENERAL',
                capabilityName,
                isExistenceDeclared: true,
                numericalCapacity: null, // STRICT: No capacity simulation math allowed in Part 02
                relationType,
                provenance: provenance instanceof ProvenanceRecord ? provenance : new ProvenanceRecord(provenance || {})
            };
            this.capabilities.push(record);
            return record;
        }

        getCapabilitiesForEntity(entityId) {
            return this.capabilities.filter(c => c.entityId === entityId);
        }
    }

    class StructuralDependencyGraphView {
        constructor() {
            this.dependencies = []; // Array of dependency records
        }

        registerDependency({ sourceCountryId, targetResourceId, direction, derivationType, provenance }) {
            const record = {
                sourceCountryId,
                targetResourceId,
                direction, // 'IMPORT_DEPENDENCE' | 'EXPORT_CRITICALITY'
                derivationType: derivationType || DerivationType.DECLARED,
                provenance: provenance instanceof ProvenanceRecord ? provenance : new ProvenanceRecord(provenance || {})
            };
            this.dependencies.push(record);
            return record;
        }

        getCountryDependencies(countryId) {
            return this.dependencies.filter(d => d.sourceCountryId === countryId);
        }
    }

    // =========================================================================
    // 02.11: HIGH-SPEED KNOWLEDGE INDEX HUB
    // =========================================================================

    class KnowledgeIndexHub {
        constructor() {
            this.byCountryId = new Map();
            this.byResourceId = new Map();
            this.byReferenceId = new Map();
            this.byResourceCategory = new Map();
            this.byContinent = new Map();
            this.byRegion = new Map();
            this.byEpistemicState = new Map();
        }

        buildIndexes(canonicalCountries, canonicalResources, referenceCatalog) {
            this.byCountryId = new Map(canonicalCountries);
            this.byResourceId = new Map(canonicalResources);
            this.byReferenceId = new Map(referenceCatalog.references);

            // Resource Categories Index
            canonicalResources.forEach(res => {
                const cat = res.category || KnowledgeState.UNKNOWN;
                if (!this.byResourceCategory.has(cat)) {
                    this.byResourceCategory.set(cat, []);
                }
                this.byResourceCategory.get(cat).push(res.resourceId);
            });

            // Geographic Spatial Indexes
            canonicalCountries.forEach(country => {
                const cont = country.continent || KnowledgeState.UNKNOWN;
                if (!this.byContinent.has(cont)) {
                    this.byContinent.set(cont, []);
                }
                this.byContinent.get(cont).push(country.countryId);

                const reg = country.region || KnowledgeState.UNKNOWN;
                if (!this.byRegion.has(reg)) {
                    this.byRegion.set(reg, []);
                }
                this.byRegion.get(reg).push(country.countryId);

                // Epistemic State Distribution Index
                if (country.endowmentProfiles) {
                    country.endowmentProfiles.forEach(endow => {
                        const state = endow.epistemicState || KnowledgeState.UNKNOWN;
                        if (!this.byEpistemicState.has(state)) {
                            this.byEpistemicState.set(state, []);
                        }
                        this.byEpistemicState.get(state).push({
                            countryId: country.countryId,
                            resource: endow.resolvedResourceId || endow.rawItem
                        });
                    });
                }
            });
        }
    }

    // =========================================================================
    // 02.12: FORENSIC KNOWLEDGE DIAGNOSTICS & INTEGRITY ENGINE
    // =========================================================================

    class KnowledgeDiagnosticsEngine {
        static runDiagnostics(canonicalCountries, canonicalResources, referenceCatalog, relationshipGraph) {
            const cycles = relationshipGraph.detectCycles();
            const orphanReferences = [];
            const ungroundedTargets = [];
            const epistemicCounts = {};

            Object.values(KnowledgeState).forEach(k => { epistemicCounts[k] = 0; });

            // Audit Tier B References
            referenceCatalog.references.forEach(ref => {
                if (ref.parentCountryId && !canonicalCountries.has(ref.parentCountryId)) {
                    orphanReferences.push({
                        referenceId: ref.referenceId,
                        rawString: ref.rawReferenceString,
                        missingParentCountryId: ref.parentCountryId
                    });
                }
            });

            // Audit Graph Edges
            relationshipGraph.adjacencyList.forEach((edges, sourceId) => {
                edges.forEach(edge => {
                    const state = edge.provenance?.evidenceState || KnowledgeState.UNKNOWN;
                    if (epistemicCounts[state] !== undefined) {
                        epistemicCounts[state]++;
                    }

                    if (!edge.isTargetReferenced &&
                        !canonicalCountries.has(edge.targetId) &&
                        !canonicalResources.has(edge.targetId) &&
                        !referenceCatalog.references.has(edge.targetId) &&
                        !relationshipGraph.nodes.has(edge.targetId)) {
                        ungroundedTargets.push({
                            edgeId: edge.edgeId,
                            sourceId: edge.sourceId,
                            targetId: edge.targetId,
                            relationType: edge.relationType
                        });
                    }
                });
            });

            return {
                diagnosticsTimestamp: Date.now(),
                totalCanonicalCountries: canonicalCountries.size,
                totalCanonicalResources: canonicalResources.size,
                totalTierBReferences: referenceCatalog.references.size,
                totalGraphNodes: relationshipGraph.nodes.size,
                totalGraphEdges: relationshipGraph.edgeCounter,
                cyclesAudit: {
                    detectedCyclesCount: cycles.length,
                    hasCycles: cycles.length > 0,
                    cyclesList: cycles
                },
                orphanReferencesAudit: {
                    count: orphanReferences.length,
                    orphans: orphanReferences
                },
                ungroundedTargetsAudit: {
                    count: ungroundedTargets.length,
                    targets: ungroundedTargets
                },
                epistemicDistribution: epistemicCounts,
                integrityStatus: (orphanReferences.length === 0 && ungroundedTargets.length === 0) 
                    ? 'AUTHORITATIVE_HEALTHY' 
                    : 'AUTHORITATIVE_WITH_WARNINGS'
            };
        }
    }

    // =========================================================================
    // 02.13: IMMUTABLE WORLD KNOWLEDGE MODEL CONTAINER
    // =========================================================================

    class WorldKnowledgeModel {
        constructor(params) {
            this.compiledAt = params.compiledAt;
            this.engineVersion = '2.1.0-AUTHORITATIVE-EPISTEMIC';
            this.architecturePhase = '02_KNOWLEDGE_AND_ONTOLOGY';
            
            // Tier A & Tier B Catalogs
            this.canonicalCountries = params.canonicalCountries;
            this.canonicalResources = params.canonicalResources;
            this.referenceCatalog = params.referenceCatalog;
            
            // Relationship Graph & Projections
            this.relationshipGraph = params.relationshipGraph;
            this.ownershipView = params.ownershipView;
            this.capabilityView = params.capabilityView;
            this.dependencyView = params.dependencyView;
            
            // Multi-Key Indexes & Diagnostics
            this.indexes = params.indexes;
            this.diagnostics = params.diagnostics;
            this.compilationLogs = params.compilationLogs;

            // Query Facade
            this.queries = {
                getCountry: (countryId) => this.canonicalCountries.get(countryId) || null,
                getResource: (resId) => this.canonicalResources.get(resId) || null,
                getReference: (refId) => this.referenceCatalog.getReference(refId),
                getCountryOutboundEdges: (countryId) => this.relationshipGraph.getOutboundEdges(countryId),
                getCountryInboundEdges: (targetId) => this.relationshipGraph.getInboundEdges(targetId),
                getCountryDependencies: (countryId) => this.dependencyView.getCountryDependencies(countryId),
                getCountryCapabilities: (countryId) => this.capabilityView.getCapabilitiesForEntity(countryId),
                getOwnershipRecord: (entityId) => this.ownershipView.getOwnership(entityId)
            };

            // STRICT: True Deep Immutability Seal
            deepFreeze(this);
        }
    }

    // =========================================================================
    // 02.14: MASTER WORLD KNOWLEDGE COMPILER PIPELINE
    // =========================================================================

    class WorldKnowledgeCompilerPipeline {
        constructor() {
            this.canonicalResources = new Map();
            this.canonicalCountries = new Map();
            this.referenceCatalog = new TierBReferenceCatalog();
            this.conceptResolver = new DynamicConceptResolver();
            this.relationshipGraph = new GeneralDirectedKnowledgeGraph();
            this.ownershipView = new OwnershipProjectionView();
            this.capabilityView = new StructuralCapabilityProjectionView();
            this.dependencyView = new StructuralDependencyGraphView();
            this.indexHub = new KnowledgeIndexHub();
            this.compilationLogs = [];
        }

        compileWorldKnowledge(part1MasterRegistry, sourceRawDataTrees = []) {
            this.compilationLogs.push({ step: 'START', timestamp: Date.now() });

            // Step 1: Ingest Resource Types Metadata (Pure Data-Driven Ingestion)
            this._ingestResourceTypes(part1MasterRegistry, sourceRawDataTrees);

            // Step 2: Ingest 197 Country Profiles and all 14 Rich Semantic Views
            this._ingestCountryProfiles(part1MasterRegistry, sourceRawDataTrees);

            // Step 3: Compile Structural Indexes
            this.indexHub.buildIndexes(this.canonicalCountries, this.canonicalResources, this.referenceCatalog);

            // Step 4: Run Forensic Diagnostics
            const diagnostics = KnowledgeDiagnosticsEngine.runDiagnostics(
                this.canonicalCountries,
                this.canonicalResources,
                this.referenceCatalog,
                this.relationshipGraph
            );

            this.compilationLogs.push({ step: 'COMPLETE', timestamp: Date.now(), status: diagnostics.integrityStatus });

            // Step 5: Construct and Deep-Freeze Model
            return new WorldKnowledgeModel({
                compiledAt: Date.now(),
                canonicalCountries: this.canonicalCountries,
                canonicalResources: this.canonicalResources,
                referenceCatalog: this.referenceCatalog,
                relationshipGraph: this.relationshipGraph,
                ownershipView: this.ownershipView,
                capabilityView: this.capabilityView,
                dependencyView: this.dependencyView,
                indexes: this.indexHub,
                diagnostics: diagnostics,
                compilationLogs: this.compilationLogs
            });
        }

        _ingestResourceTypes(part1Registry, sourceTrees) {
            const rawResourceNodes = this._extractResourceObjects(part1Registry, sourceTrees);

            rawResourceNodes.forEach(({ resId, payload, sourceId }) => {
                if (!resId) return;
                const normalizedId = normalizeToken(resId);
                const provenance = new ProvenanceRecord({
                    sourceDatasetId: sourceId || 'RESOURCE_DATASET',
                    sourceContextPath: `resource_types.${resId}`,
                    derivationType: DerivationType.DECLARED,
                    confidence: 1.0,
                    evidenceState: KnowledgeState.KNOWN
                });

                const resourceProfile = new CanonicalResourceProfile({
                    resourceId: normalizedId,
                    name: payload.name || resId,
                    category: payload.category || KnowledgeState.UNKNOWN,
                    unit: payload.unit || KnowledgeState.UNKNOWN, // Strict: No METRIC_TON fallback
                    strategicImportance: payload.strategicImportance || KnowledgeState.UNKNOWN, // Strict: No STANDARD fallback
                    description: payload.description || '',
                    provenance
                });

                this.canonicalResources.set(normalizedId, resourceProfile);
                this.conceptResolver.registerCanonicalConcept('RESOURCE_TYPE', normalizedId, [resId, payload.name]);
                this.relationshipGraph.registerNode(normalizedId, ConceptCategory.RESOURCE_TYPE, resourceProfile.name);
            });
        }

        _ingestCountryProfiles(part1Registry, sourceTrees) {
            const rawCountryNodes = this._extractCountryObjects(part1Registry, sourceTrees);

            rawCountryNodes.forEach(({ payload, sourceId }) => {
                const rawCId = payload.countryId || payload.iso3 || payload.iso2 || (payload.identity && (payload.identity.countryId || payload.identity.iso3));
                const rawName = payload.name || payload.country || (payload.identity && payload.identity.name);
                if (!rawCId && !rawName) return;

                const canonicalCountryId = (rawCId && rawCId.toUpperCase().trim()) || normalizeToken(rawName).toUpperCase();
                const aliases = [canonicalCountryId, rawName, payload.officialName, payload.iso2, payload.iso3].filter(Boolean);

                const countryProfile = new CanonicalCountryProfile({
                    countryId: canonicalCountryId,
                    name: rawName || canonicalCountryId,
                    officialName: payload.officialName || rawName || canonicalCountryId,
                    iso2: payload.iso2 || KnowledgeState.UNKNOWN,
                    iso3: payload.iso3 || canonicalCountryId,
                    continent: payload.continent || KnowledgeState.UNKNOWN,
                    subcontinent: payload.subcontinent || KnowledgeState.UNKNOWN,
                    region: payload.region || KnowledgeState.UNKNOWN,
                    aliases
                });

                this.canonicalCountries.set(canonicalCountryId, countryProfile);
                this.conceptResolver.registerCanonicalConcept('COUNTRY', canonicalCountryId, aliases);
                this.relationshipGraph.registerNode(canonicalCountryId, ConceptCategory.COUNTRY, countryProfile.name);

                // --- 1. GEOGRAPHY ---
                if (payload.geography || payload.location) {
                    const geo = payload.geography || payload.location;
                    countryProfile.geography = {
                        capital: geo.capital || KnowledgeState.UNKNOWN,
                        coordinates: safeClone(geo.coordinates) || null,
                        bounds: safeClone(geo.bounds) || null,
                        totalLandAreaSqKm: geo.totalLandAreaSqKm !== undefined ? geo.totalLandAreaSqKm : KnowledgeState.UNKNOWN,
                        coastal: typeof geo.coastal === 'boolean' ? geo.coastal : KnowledgeState.UNKNOWN
                    };
                }

                // --- 2. RESOURCE REGIONS ---
                const regions = payload.administrative_resource_regions || payload.resource_regions || payload.resourceRegions || [];
                if (Array.isArray(regions)) {
                    regions.forEach((reg, idx) => {
                        const regId = reg.regionId || `${canonicalCountryId}_REGION_${idx + 1}`;
                        const regRecord = {
                            regionId: regId,
                            name: reg.name || regId,
                            description: reg.description || '',
                            primaryResources: Array.isArray(reg.primaryResources) ? [...reg.primaryResources] : []
                        };
                        countryProfile.resourceRegions.push(regRecord);
                        this.relationshipGraph.addEdge(
                            canonicalCountryId,
                            regId,
                            RelationType.LOCATED_IN_REGION,
                            new ProvenanceRecord({
                                sourceDatasetId: sourceId,
                                sourceContextPath: `resource_regions[${idx}]`,
                                derivationType: DerivationType.DECLARED,
                                evidenceState: KnowledgeState.KNOWN
                            }),
                            ConceptCategory.RESOURCE_REGION
                        );
                    });
                }

                // --- 3. RESOURCE ENDOWMENT (KNOWN, PROBABLE, POTENTIAL, ABSENT) ---
                const endow = payload.resource_endowment || {};
                if (typeof endow === 'object') {
                    this._processEndowmentContext(canonicalCountryId, endow.known, KnowledgeState.KNOWN, RelationType.HAS_RESOURCE_KNOWN, sourceId, 'resource_endowment.known', countryProfile);
                    this._processEndowmentContext(canonicalCountryId, endow.probable, KnowledgeState.PROBABLE, RelationType.HAS_RESOURCE_PROBABLE, sourceId, 'resource_endowment.probable', countryProfile);
                    this._processEndowmentContext(canonicalCountryId, endow.potential, KnowledgeState.POTENTIAL, RelationType.HAS_RESOURCE_POTENTIAL, sourceId, 'resource_endowment.potential', countryProfile);
                    this._processEndowmentContext(canonicalCountryId, endow.absentOrNegligible, KnowledgeState.ABSENT_OR_NEGLIGIBLE, RelationType.HAS_RESOURCE_ABSENT, sourceId, 'resource_endowment.absentOrNegligible', countryProfile);
                }

                // --- 4. STRATEGIC RESOURCES ---
                const strat = payload.strategic_resources || {};
                if (typeof strat === 'object') {
                    countryProfile.strategicProfile = {
                        domesticallyAvailable: Array.isArray(strat.domesticallyAvailable) ? [...strat.domesticallyAvailable] : [],
                        strategicallyImportant: Array.isArray(strat.strategicallyImportant) ? [...strat.strategicallyImportant] : [],
                        importDependent: Array.isArray(strat.importDependent) ? [...strat.importDependent] : [],
                        exportCritical: Array.isArray(strat.exportCritical) ? [...strat.exportCritical] : [],
                        dualUseRelevant: Array.isArray(strat.dualUseRelevant) ? [...strat.dualUseRelevant] : [],
                        knownResourceTypes: Array.isArray(strat.knownResourceTypes) ? [...strat.knownResourceTypes] : []
                    };

                    this._linkStrategicContext(canonicalCountryId, strat.domesticallyAvailable, RelationType.HAS_DOMESTIC_AVAILABILITY, sourceId, 'strategic_resources.domesticallyAvailable');
                    this._linkStrategicContext(canonicalCountryId, strat.strategicallyImportant, RelationType.HAS_STRATEGIC_RESOURCE, sourceId, 'strategic_resources.strategicallyImportant');
                    this._linkStrategicContext(canonicalCountryId, strat.importDependent, RelationType.HAS_IMPORT_DEPENDENCY, sourceId, 'strategic_resources.importDependent');
                    this._linkStrategicContext(canonicalCountryId, strat.exportCritical, RelationType.HAS_EXPORT_CRITICALITY, sourceId, 'strategic_resources.exportCritical');
                    this._linkStrategicContext(canonicalCountryId, strat.knownResourceTypes, RelationType.HAS_RESOURCE_KNOWN, sourceId, 'strategic_resources.knownResourceTypes');

                    // Dual-Use references (Distinguish facilities vs resource concepts)
                    if (Array.isArray(strat.dualUseRelevant)) {
                        strat.dualUseRelevant.forEach((itemStr, idx) => {
                            const ref = this.referenceCatalog.registerReference({
                                rawString: itemStr,
                                category: ConceptCategory.INFRASTRUCTURE_REFERENCE,
                                parentCountryId: canonicalCountryId,
                                sourceContextPath: `strategic_resources.dualUseRelevant[${idx}]`,
                                sourceDatasetId: sourceId,
                                metadata: { dualUse: true }
                            });
                            if (ref) {
                                countryProfile.infrastructureReferences.push(ref.referenceId);
                                this.relationshipGraph.addEdge(
                                    canonicalCountryId,
                                    ref.referenceId,
                                    RelationType.HAS_DUAL_USE_RELEVANCE,
                                    new ProvenanceRecord({
                                        sourceDatasetId: sourceId,
                                        sourceContextPath: `strategic_resources.dualUseRelevant[${idx}]`,
                                        derivationType: DerivationType.DECLARED,
                                        evidenceState: KnowledgeState.KNOWN
                                    }),
                                    ConceptCategory.INFRASTRUCTURE_REFERENCE,
                                    true
                                );
                            }
                        });
                    }
                }

                // --- 5. DIRECTIONAL DEPENDENCIES (IMPORTS & EXPORTS) ---
                const dep = payload.resource_dependency || payload.dependencies || {};
                if (typeof dep === 'object') {
                    countryProfile.dependencyContext = {
                        criticalImports: Array.isArray(dep.criticalImports) ? [...dep.criticalImports] : [],
                        criticalExports: Array.isArray(dep.criticalExports) ? [...dep.criticalExports] : []
                    };

                    if (Array.isArray(dep.criticalImports)) {
                        dep.criticalImports.forEach((rTerm, idx) => {
                            const resolved = this.conceptResolver.resolve('RESOURCE_TYPE', rTerm);
                            const targetId = resolved.canonicalId || normalizeToken(rTerm);
                            const prov = new ProvenanceRecord({
                                sourceDatasetId: sourceId,
                                sourceContextPath: `resource_dependency.criticalImports[${idx}]`,
                                derivationType: resolved.derivationType,
                                evidenceState: KnowledgeState.KNOWN
                            });
                            this.dependencyView.registerDependency({
                                sourceCountryId: canonicalCountryId,
                                targetResourceId: targetId,
                                direction: 'IMPORT_DEPENDENCE',
                                derivationType: resolved.derivationType,
                                provenance: prov
                            });
                            this.relationshipGraph.addEdge(canonicalCountryId, targetId, RelationType.HAS_IMPORT_DEPENDENCY, prov, ConceptCategory.RESOURCE_TYPE);
                        });
                    }

                    if (Array.isArray(dep.criticalExports)) {
                        dep.criticalExports.forEach((rTerm, idx) => {
                            const resolved = this.conceptResolver.resolve('RESOURCE_TYPE', rTerm);
                            const targetId = resolved.canonicalId || normalizeToken(rTerm);
                            const prov = new ProvenanceRecord({
                                sourceDatasetId: sourceId,
                                sourceContextPath: `resource_dependency.criticalExports[${idx}]`,
                                derivationType: resolved.derivationType,
                                evidenceState: KnowledgeState.KNOWN
                            });
                            this.dependencyView.registerDependency({
                                sourceCountryId: canonicalCountryId,
                                targetResourceId: targetId,
                                direction: 'EXPORT_CRITICALITY',
                                derivationType: resolved.derivationType,
                                provenance: prov
                            });
                            this.relationshipGraph.addEdge(canonicalCountryId, targetId, RelationType.HAS_EXPORT_CRITICALITY, prov, ConceptCategory.RESOURCE_TYPE);
                        });
                    }
                }

                // --- 6. RESOURCE QUALITY CONTEXT ---
                const qual = payload.resource_quality_context || {};
                if (typeof qual === 'object') {
                    countryProfile.qualityContext = {
                        knownHighGradeResources: Array.isArray(qual.knownHighGradeResources) ? [...qual.knownHighGradeResources] : [],
                        knownLowGradeResources: Array.isArray(qual.knownLowGradeResources) ? [...qual.knownLowGradeResources] : []
                    };
                    this._linkQualityContext(canonicalCountryId, qual.knownHighGradeResources, RelationType.DECLARES_HIGH_GRADE_RESOURCE, sourceId, 'resource_quality_context.knownHighGradeResources');
                    this._linkQualityContext(canonicalCountryId, qual.knownLowGradeResources, RelationType.DECLARES_LOW_GRADE_RESOURCE, sourceId, 'resource_quality_context.knownLowGradeResources');
                }

                // --- 7. RESOURCE POTENTIAL ---
                const pot = payload.resource_potential || {};
                if (typeof pot === 'object') {
                    countryProfile.potentialContext = {
                        deepResourcePotential: Array.isArray(pot.deepResourcePotential) ? [...pot.deepResourcePotential] : [],
                        secondaryResourcePotential: Array.isArray(pot.secondaryResourcePotential) ? [...pot.secondaryResourcePotential] : [],
                        offshorePotential: Array.isArray(pot.offshorePotential) ? [...pot.offshorePotential] : []
                    };
                    this._linkPotentialContext(canonicalCountryId, pot.deepResourcePotential, RelationType.DECLARES_DEEP_POTENTIAL, sourceId, 'resource_potential.deepResourcePotential');
                    this._linkPotentialContext(canonicalCountryId, pot.secondaryResourcePotential, RelationType.DECLARES_SECONDARY_POTENTIAL, sourceId, 'resource_potential.secondaryResourcePotential');
                    this._linkPotentialContext(canonicalCountryId, pot.offshorePotential, RelationType.DECLARES_OFFSHORE_POTENTIAL, sourceId, 'resource_potential.offshorePotential');
                }

                // --- 8. EXTRACTION CONTEXT (Pure Declarative Context) ---
                const ext = payload.extraction_context || payload.extraction || {};
                if (typeof ext === 'object') {
                    countryProfile.extractionContext = {
                        surfaceMiningPotential: Array.isArray(ext.surfaceMiningPotential) ? [...ext.surfaceMiningPotential] : [],
                        undergroundMiningPotential: Array.isArray(ext.undergroundMiningPotential) ? [...ext.undergroundMiningPotential] : [],
                        inSituPotential: Array.isArray(ext.inSituPotential) ? [...ext.inSituPotential] : [],
                        offshoreExtractionPotential: Array.isArray(ext.offshoreExtractionPotential) ? [...ext.offshoreExtractionPotential] : [],
                        conventionalExtractionResources: Array.isArray(ext.conventionalExtractionResources) ? [...ext.conventionalExtractionResources] : [],
                        technicallyChallengingResources: Array.isArray(ext.technicallyChallengingResources) ? [...ext.technicallyChallengingResources] : []
                    };
                    this._linkExtractionDeclarations(canonicalCountryId, countryProfile.extractionContext, sourceId);
                }

                // --- 9. PROCESSING & INDUSTRIAL CONTEXT (Pure Capability Declarations) ---
                const procCtx = payload.processing_context || payload.processing_resource_context || payload.processing || {};
                const indCtx = payload.industrial_context || payload.resource_industrial_context || payload.industry || {};
                countryProfile.industrialContext = {
                    refiningResources: Array.isArray(procCtx.refiningResources) ? [...procCtx.refiningResources] : [],
                    smeltingResources: Array.isArray(procCtx.smeltingResources) ? [...procCtx.smeltingResources] : [],
                    advancedProcessingResources: Array.isArray(procCtx.advancedProcessingResources) ? [...procCtx.advancedProcessingResources] : [],
                    metallurgicalCapacityReferences: Array.isArray(indCtx.metallurgicalCapacityReferences) ? [...indCtx.metallurgicalCapacityReferences] : [],
                    refiningCapacityReferences: Array.isArray(indCtx.refiningCapacityReferences) ? [...indCtx.refiningCapacityReferences] : [],
                    mineralProcessingReferences: Array.isArray(indCtx.mineralProcessingReferences) ? [...indCtx.mineralProcessingReferences] : [],
                    resourceTechnologyCapabilities: Array.isArray(indCtx.resourceTechnologyCapabilities || payload.resourceTechnologyCapabilities) ? [...(indCtx.resourceTechnologyCapabilities || payload.resourceTechnologyCapabilities)] : []
                };
                this._linkIndustrialDeclarations(canonicalCountryId, countryProfile.industrialContext, sourceId);

                // --- 10. INFRASTRUCTURE REFERENCES (Tier B Catalog) ---
                const infra = payload.infrastructure_context || payload.resource_infrastructure_context || payload.infrastructure || {};
                const infraCategories = ['ports', 'refineries', 'pipelineHubs', 'railTerminals', 'mineSites', 'processingFacilities'];
                infraCategories.forEach(catKey => {
                    if (Array.isArray(infra[catKey])) {
                        infra[catKey].forEach((itemStr, idx) => {
                            const ref = this.referenceCatalog.registerReference({
                                rawString: itemStr,
                                category: ConceptCategory.INFRASTRUCTURE_REFERENCE,
                                parentCountryId: canonicalCountryId,
                                sourceContextPath: `infrastructure_context.${catKey}[${idx}]`,
                                sourceDatasetId: sourceId,
                                metadata: { subType: catKey }
                            });
                            if (ref) {
                                countryProfile.infrastructureReferences.push(ref.referenceId);
                                const prov = new ProvenanceRecord({
                                    sourceDatasetId: sourceId,
                                    sourceContextPath: `infrastructure_context.${catKey}[${idx}]`,
                                    derivationType: DerivationType.DECLARED,
                                    evidenceState: KnowledgeState.KNOWN
                                });
                                this.relationshipGraph.addEdge(
                                    canonicalCountryId,
                                    ref.referenceId,
                                    RelationType.REFERENCES_INFRASTRUCTURE,
                                    prov,
                                    ConceptCategory.INFRASTRUCTURE_REFERENCE,
                                    true
                                );
                                this.ownershipView.registerOwnership({
                                    entityId: ref.referenceId,
                                    ownerId: null, // STRICT: Unknown unless explicitly stated
                                    operatorId: null,
                                    hostCountryId: canonicalCountryId,
                                    status: OwnershipStatus.UNKNOWN,
                                    provenance: prov
                                });
                            }
                        });
                    }
                });

                // --- 11. TRANSPORT CORRIDORS (Tier B Catalog) ---
                const trans = payload.transport_context || payload.resource_transport_context || payload.transport || {};
                const transportCategories = ['maritimeResourceCorridors', 'pipelineCorridors', 'railResourceCorridors'];
                transportCategories.forEach(tCat => {
                    if (Array.isArray(trans[tCat])) {
                        trans[tCat].forEach((corrStr, idx) => {
                            const ref = this.referenceCatalog.registerReference({
                                rawString: corrStr,
                                category: ConceptCategory.TRANSPORT_CORRIDOR,
                                parentCountryId: canonicalCountryId,
                                sourceContextPath: `transport_context.${tCat}[${idx}]`,
                                sourceDatasetId: sourceId,
                                metadata: { corridorType: tCat }
                            });
                            if (ref) {
                                countryProfile.transportCorridorReferences.push(ref.referenceId);
                                this.relationshipGraph.addEdge(
                                    canonicalCountryId,
                                    ref.referenceId,
                                    RelationType.CONNECTED_BY_CORRIDOR,
                                    new ProvenanceRecord({
                                        sourceDatasetId: sourceId,
                                        sourceContextPath: `transport_context.${tCat}[${idx}]`,
                                        derivationType: DerivationType.DECLARED,
                                        evidenceState: KnowledgeState.KNOWN
                                    }),
                                    ConceptCategory.TRANSPORT_CORRIDOR,
                                    true
                                );
                            }
                        });
                    }
                });

                // --- 12. CONSTRAINTS (Typed Objects) ---
                const constraints = payload.constraints || payload.resource_constraints || {};
                ['topographical', 'environmental', 'geopolitical'].forEach(cType => {
                    if (Array.isArray(constraints[cType])) {
                        constraints[cType].forEach((cItem, idx) => {
                            const cStr = typeof cItem === 'string' ? cItem : (cItem.name || 'CONSTRAINT');
                            const cId = `CONSTRAINT_${cType.toUpperCase()}_${normalizeToken(cStr)}`;
                            countryProfile.constraints.push({ constraintId: cId, category: cType, description: cStr });
                            this.relationshipGraph.addEdge(
                                canonicalCountryId,
                                cId,
                                RelationType.CONSTRAINED_BY,
                                new ProvenanceRecord({
                                    sourceDatasetId: sourceId,
                                    sourceContextPath: `constraints.${cType}[${idx}]`,
                                    derivationType: DerivationType.DECLARED,
                                    evidenceState: KnowledgeState.KNOWN
                                }),
                                ConceptCategory.CONSTRAINT_SPEC,
                                false,
                                { description: cStr, constraintType: cType }
                            );
                        });
                    }
                });

                // --- 13. RISKS (Typed Objects) ---
                const risks = payload.risks || payload.resource_risks || {};
                ['environmentalRisks', 'geopoliticalRisks'].forEach(rType => {
                    if (Array.isArray(risks[rType])) {
                        risks[rType].forEach((rItem, idx) => {
                            const rStr = typeof rItem === 'string' ? rItem : (rItem.name || 'RISK');
                            const rId = `RISK_${rType.toUpperCase()}_${normalizeToken(rStr)}`;
                            countryProfile.risks.push({ riskId: rId, category: rType, description: rStr });
                            this.relationshipGraph.addEdge(
                                canonicalCountryId,
                                rId,
                                RelationType.EXPOSED_TO_RISK,
                                new ProvenanceRecord({
                                    sourceDatasetId: sourceId,
                                    sourceContextPath: `risks.${rType}[${idx}]`,
                                    derivationType: DerivationType.DECLARED,
                                    evidenceState: KnowledgeState.KNOWN
                                }),
                                ConceptCategory.RISK_SPEC,
                                false,
                                { description: rStr, riskType: rType }
                            );
                        });
                    }
                });
            });
        }

        _processEndowmentContext(countryId, rawItems, epistemicState, relationType, sourceId, contextPath, countryProfile) {
            if (!Array.isArray(rawItems)) return;
            rawItems.forEach((item, idx) => {
                const resolved = this.conceptResolver.resolve('RESOURCE_TYPE', item);
                const targetId = resolved.canonicalId || normalizeToken(item);
                const record = {
                    rawItem: item,
                    resolvedResourceId: targetId,
                    epistemicState: epistemicState,
                    sourceContextPath: `${contextPath}[${idx}]`
                };
                countryProfile.endowmentProfiles.push(record);
                this.relationshipGraph.addEdge(
                    countryId,
                    targetId,
                    relationType,
                    new ProvenanceRecord({
                        sourceDatasetId: sourceId,
                        sourceContextPath: `${contextPath}[${idx}]`,
                        derivationType: resolved.derivationType,
                        confidence: resolved.confidence || 0.8,
                        evidenceState: epistemicState
                    }),
                    ConceptCategory.RESOURCE_TYPE
                );
            });
        }

        _linkStrategicContext(countryId, rawItems, relationType, sourceId, contextPath) {
            if (!Array.isArray(rawItems)) return;
            rawItems.forEach((item, idx) => {
                const resolved = this.conceptResolver.resolve('RESOURCE_TYPE', item);
                const targetId = resolved.canonicalId || normalizeToken(item);
                this.relationshipGraph.addEdge(
                    countryId,
                    targetId,
                    relationType,
                    new ProvenanceRecord({
                        sourceDatasetId: sourceId,
                        sourceContextPath: `${contextPath}[${idx}]`,
                        derivationType: resolved.derivationType,
                        confidence: resolved.confidence || 0.8,
                        evidenceState: KnowledgeState.KNOWN
                    }),
                    ConceptCategory.RESOURCE_TYPE
                );
            });
        }

        _linkQualityContext(countryId, rawItems, relationType, sourceId, contextPath) {
            if (!Array.isArray(rawItems)) return;
            rawItems.forEach((item, idx) => {
                const resolved = this.conceptResolver.resolve('RESOURCE_TYPE', item);
                const targetId = resolved.canonicalId || normalizeToken(item);
                this.relationshipGraph.addEdge(
                    countryId,
                    targetId,
                    relationType,
                    new ProvenanceRecord({
                        sourceDatasetId: sourceId,
                        sourceContextPath: `${contextPath}[${idx}]`,
                        derivationType: resolved.derivationType,
                        confidence: 1.0,
                        evidenceState: KnowledgeState.KNOWN
                    }),
                    ConceptCategory.RESOURCE_TYPE
                );
            });
        }

        _linkPotentialContext(countryId, rawItems, relationType, sourceId, contextPath) {
            if (!Array.isArray(rawItems)) return;
            rawItems.forEach((item, idx) => {
                const resolved = this.conceptResolver.resolve('RESOURCE_TYPE', item);
                const targetId = resolved.canonicalId || normalizeToken(item);
                this.relationshipGraph.addEdge(
                    countryId,
                    targetId,
                    relationType,
                    new ProvenanceRecord({
                        sourceDatasetId: sourceId,
                        sourceContextPath: `${contextPath}[${idx}]`,
                        derivationType: resolved.derivationType,
                        confidence: 0.85,
                        evidenceState: KnowledgeState.POTENTIAL
                    }),
                    ConceptCategory.RESOURCE_TYPE
                );
            });
        }

        _linkExtractionDeclarations(countryId, extCtx, sourceId) {
            const mappings = [
                { list: extCtx.surfaceMiningPotential, rel: RelationType.DECLARES_EXTRACTION_POTENTIAL, path: 'surfaceMiningPotential', sub: 'SURFACE' },
                { list: extCtx.undergroundMiningPotential, rel: RelationType.DECLARES_EXTRACTION_POTENTIAL, path: 'undergroundMiningPotential', sub: 'UNDERGROUND' },
                { list: extCtx.inSituPotential, rel: RelationType.DECLARES_EXTRACTION_POTENTIAL, path: 'inSituPotential', sub: 'IN_SITU' },
                { list: extCtx.offshoreExtractionPotential, rel: RelationType.DECLARES_EXTRACTION_POTENTIAL, path: 'offshoreExtractionPotential', sub: 'OFFSHORE' },
                { list: extCtx.conventionalExtractionResources, rel: RelationType.DECLARES_CONVENTIONAL_EXTRACTION, path: 'conventionalExtractionResources', sub: 'CONVENTIONAL' },
                { list: extCtx.technicallyChallengingResources, rel: RelationType.DECLARES_CHALLENGING_EXTRACTION, path: 'technicallyChallengingResources', sub: 'CHALLENGING' }
            ];

            mappings.forEach(({ list, rel, path, sub }) => {
                if (Array.isArray(list)) {
                    list.forEach((item, idx) => {
                        const resolved = this.conceptResolver.resolve('RESOURCE_TYPE', item);
                        const targetId = resolved.canonicalId || normalizeToken(item);
                        const prov = new ProvenanceRecord({
                            sourceDatasetId: sourceId,
                            sourceContextPath: `extraction_context.${path}[${idx}]`,
                            derivationType: DerivationType.DECLARED,
                            evidenceState: KnowledgeState.KNOWN
                        });
                        this.relationshipGraph.addEdge(countryId, targetId, rel, prov, ConceptCategory.RESOURCE_TYPE, false, { subDomain: sub });
                        this.capabilityView.registerCapability({
                            entityId: countryId,
                            domain: `EXTRACTION_${sub}`,
                            capabilityName: `EXTRACTION_${sub}_${targetId}`,
                            relationType: rel,
                            provenance: prov
                        });
                    });
                }
            });
        }

        _linkIndustrialDeclarations(countryId, indCtx, sourceId) {
            const industrialArrays = [
                { list: indCtx.refiningResources, rel: RelationType.DECLARES_PROCESSING_CAPABILITY, domain: 'REFINING', path: 'refiningResources' },
                { list: indCtx.smeltingResources, rel: RelationType.DECLARES_PROCESSING_CAPABILITY, domain: 'SMELTING', path: 'smeltingResources' },
                { list: indCtx.advancedProcessingResources, rel: RelationType.DECLARES_PROCESSING_CAPABILITY, domain: 'ADVANCED_PROCESSING', path: 'advancedProcessingResources' },
                { list: indCtx.metallurgicalCapacityReferences, rel: RelationType.DECLARES_INDUSTRIAL_CAPACITY_REF, domain: 'METALLURGY_REF', path: 'metallurgicalCapacityReferences' },
                { list: indCtx.refiningCapacityReferences, rel: RelationType.DECLARES_INDUSTRIAL_CAPACITY_REF, domain: 'REFINING_CAPACITY_REF', path: 'refiningCapacityReferences' },
                { list: indCtx.mineralProcessingReferences, rel: RelationType.DECLARES_INDUSTRIAL_CAPACITY_REF, domain: 'MINERAL_PROCESSING_REF', path: 'mineralProcessingReferences' },
                { list: indCtx.resourceTechnologyCapabilities, rel: RelationType.DECLARES_TECHNOLOGY_CAPABILITY, domain: 'TECH_CAPABILITY', path: 'resourceTechnologyCapabilities' }
            ];

            industrialArrays.forEach(({ list, rel, domain, path }) => {
                if (Array.isArray(list)) {
                    list.forEach((item, idx) => {
                        const targetCapId = `CAPABILITY_${domain}_${normalizeToken(item)}`;
                        const prov = new ProvenanceRecord({
                            sourceDatasetId: sourceId,
                            sourceContextPath: `industrial_context.${path}[${idx}]`,
                            derivationType: DerivationType.DECLARED,
                            evidenceState: KnowledgeState.KNOWN
                        });
                        this.relationshipGraph.addEdge(countryId, targetCapId, rel, prov, ConceptCategory.CAPABILITY, false, { rawDeclaration: item });
                        this.capabilityView.registerCapability({
                            entityId: countryId,
                            domain: domain,
                            capabilityName: item,
                            relationType: rel,
                            provenance: prov
                        });
                    });
                }
            });
        }

        _extractResourceObjects(part1Registry, sourceTrees) {
            const list = [];
            
            // Check Part 01 Registry map
            if (part1Registry) {
                const map = part1Registry.compiledEntitiesMap || (part1Registry.masterRegistry && part1Registry.masterRegistry.compiledEntitiesMap);
                if (map instanceof Map) {
                    map.forEach((entity, id) => {
                        if (entity.conceptType === 'RESOURCE_TYPE' || entity.conceptType === 'RESOURCE') {
                            list.push({ resId: id, payload: entity.payload || entity, sourceId: entity.sourceId });
                        }
                    });
                }
            }

            // Check Raw Trees safely via defined nodes
            if (Array.isArray(sourceTrees)) {
                sourceTrees.forEach(tree => {
                    if (tree && Array.isArray(tree.nodes)) {
                        tree.nodes.forEach(node => {
                            if (node.nodeType === 'OBJECT_NODE' && node.parsedValue && node.parsedValue.resource_types) {
                                Object.entries(node.parsedValue.resource_types).forEach(([rKey, rMeta]) => {
                                    list.push({ resId: rKey, payload: rMeta, sourceId: node.sourceId });
                                });
                            }
                        });
                    }
                });
            }

            return list;
        }

        _extractCountryObjects(part1Registry, sourceTrees) {
            const list = [];

            if (part1Registry) {
                const map = part1Registry.compiledEntitiesMap || (part1Registry.masterRegistry && part1Registry.masterRegistry.compiledEntitiesMap);
                if (map instanceof Map) {
                    map.forEach((entity) => {
                        if (entity.conceptType === 'COUNTRY' || entity.conceptType === 'COUNTRY_PROFILE') {
                            list.push({ payload: entity.payload || entity, sourceId: entity.sourceId });
                        }
                    });
                }
            }

            if (Array.isArray(sourceTrees)) {
                sourceTrees.forEach(tree => {
                    if (tree && Array.isArray(tree.nodes)) {
                        tree.nodes.forEach(node => {
                            if (node.nodeType === 'OBJECT_NODE' && node.parsedValue) {
                                const val = node.parsedValue;
                                if (val.countryId || val.iso3 || val.iso2 || val.resource_endowment || val.strategic_resources) {
                                    list.push({ payload: val, sourceId: node.sourceId });
                                }
                            }
                        });
                    }
                });
            }

            return list;
        }
    }

    // =========================================================================
    // 02.15: PUBLIC INTERFACE & EXPORTS
    // =========================================================================

    const PublicCompilerAdapter = Object.freeze({
        // Enums & Vocabularies
        KnowledgeState,
        DerivationType,
        EntityTier,
        ConceptCategory,
        RelationType,
        OwnershipStatus,

        // Core Typology Classes
        ProvenanceRecord,
        CanonicalResourceProfile,
        CanonicalCountryProfile,
        ReferencedKnowledgeEntity,
        TierBReferenceCatalog,
        DynamicConceptResolver,
        GeneralDirectedKnowledgeGraph,

        // Projection Views
        OwnershipProjectionView,
        StructuralCapabilityProjectionView,
        StructuralDependencyGraphView,
        KnowledgeIndexHub,
        KnowledgeDiagnosticsEngine,
        WorldKnowledgeModel,
        WorldKnowledgeCompilerPipeline,

        /**
         * Primary Public Method: Compiles Part 01 Master Registry into Authoritative Knowledge Model
         */
        compileWorldKnowledge(part1MasterRegistry, sourceRawDataTrees = []) {
            const pipeline = new WorldKnowledgeCompilerPipeline();
            return pipeline.compileWorldKnowledge(part1MasterRegistry, sourceRawDataTrees);
        }
    });

    global.GSRSK_WorldKnowledgeCompiler = PublicCompilerAdapter;
    if (typeof globalThis !== 'undefined') globalThis.GSRSK_WorldKnowledgeCompiler = PublicCompilerAdapter;

})(typeof window !== 'undefined' ? window : globalThis);

/**
 * ============================================================================
 * GSRSK — PART 03: AUTHORITATIVE WORLD STATE ENGINE & MUTATION CORE
 * ============================================================================
 * Architecture Phase: 03 of 16 (Unified Authoritative State Engine & Resource Bridge)
 * Constitutional Role: Universal Mutable State Standards, Multi-Dimensional
 *                      Quantity Engine, Location & Spatial Contracts, Multi-Layer
 *                      Ownership Model, Temporal Engine, Base State Envelopes,
 *                      Sovereign Entities, Physical Asset Containers, Command-Driven
 *                      Mutation Pipeline, Invariant Verification, Multi-Index Store,
 *                      Adler32 Checkpoints, Telemetry Schema Validation & Decompression,
 *                      Resource Identity Bridge (Formal Bridge to Part 04),
 *                      Knowledge Hydrator & Master Orchestrator.
 * 
 * STRICT CONSTITUTIONAL BOUNDARIES & USER MANDATES:
 * 1. Reference ≠ Canonical Asset ≠ Operational Asset:
 *    - Triad distinction enforced across every physical and abstract entity.
 *    - Reference: pointer/unverified catalog record (isReferenceOnly: true, factualPromotionBlocked: true).
 *    - Canonical Asset: raw identity, immutable geological/structural constraints, nominal capacity.
 *    - Operational Asset: live active runtime state container, failure modes, telemetry, health index.
 * 2. Strict Unit & Dimensionality Governance:
 *    - Source declares unit -> use declared unit and verified dimension.
 *    - Source does NOT declare unit -> unit: 'UNKNOWN_UNIT', dimension: UNKNOWN.
 *    - ZERO guesswork / assumptions (Iron -> MASS, Oil -> VOLUME, etc.).
 * 3. Explicit Operational Status & Provenance Distinction:
 *    - sourceDeclaredOperationalStatus and engineLiveOperationalStatus / engineInferredOperationalStatus
 *      are strictly separated. Engine inference NEVER overwrites raw source-declared status.
 * 4. Lossless Telemetry Decompression & Schema Validation:
 *    - Ingests compressed and irregular incoming telemetry into robust FacilityState and
 *      InfrastructureState containers without data loss.
 * 5. Zero Simulation Math in Part 03:
 *    - Part 03 provides authoritative state envelopes, schemas, indexes, and bridge contracts.
 * ============================================================================
 */

(function(global) {
    'use strict';

    // =========================================================================
    // 03.01: EPISTEMIC, LIFECYCLE, OPERATIONAL & STATE CLASSIFICATION ENUMS
    // =========================================================================

    const AssetEpistemicClassification = Object.freeze({
        REFERENCE: 'REFERENCE',
        CANONICAL_ASSET: 'CANONICAL_ASSET',
        OPERATIONAL_ASSET: 'OPERATIONAL_ASSET'
    });

    const LifecycleStatus = Object.freeze({
        PLANNED: 'PLANNED',
        ACTIVE: 'ACTIVE',
        INACTIVE: 'INACTIVE',
        SUSPENDED: 'SUSPENDED',
        DEPLETED: 'DEPLETED',
        DESTROYED: 'DESTROYED',
        ABANDONED: 'ABANDONED',
        CLOSED: 'CLOSED',
        UNKNOWN: 'UNKNOWN',
        UNVERIFIED: 'UNVERIFIED'
    });

    const OperationalStatus = Object.freeze({
        OPERATIONAL: 'OPERATIONAL',
        LIMITED: 'LIMITED',
        DEGRADED: 'DEGRADED',
        OFFLINE: 'OFFLINE',
        DAMAGED: 'DAMAGED',
        BLOCKED: 'BLOCKED',
        MAINTENANCE: 'MAINTENANCE',
        UNKNOWN: 'UNKNOWN'
    });

    const StateClass = Object.freeze({
        INITIAL: 'INITIAL',
        CURRENT: 'CURRENT',
        DERIVED: 'DERIVED',
        TRANSIENT: 'TRANSIENT'
    });

    const StateTier = Object.freeze({
        TIER_A_SOVEREIGN_CANONICAL: 'TIER_A_SOVEREIGN_CANONICAL',
        TIER_B_PHYSICAL_ASSET: 'TIER_B_PHYSICAL_ASSET',
        TIER_C_MARKET_TRADE: 'TIER_C_MARKET_TRADE',
        TIER_D_TEMPORARY_EVENT: 'TIER_D_TEMPORARY_EVENT'
    });

    const FailureMode = Object.freeze({
        NONE: 'NONE',
        DEGRADED_THROUGHPUT: 'DEGRADED_THROUGHPUT',
        ISOLATED: 'ISOLATED',
        HALTED: 'HALTED',
        CATASTROPHIC_FAILURE: 'CATASTROPHIC_FAILURE',
        UNKNOWN: 'UNKNOWN'
    });

    const OwnershipStatus = Object.freeze({
        DECLARED: 'DECLARED',
        INFERRED: 'INFERRED',
        UNKNOWN: 'UNKNOWN',
        NOT_APPLICABLE: 'NOT_APPLICABLE',
        DISPUTED: 'DISPUTED',
        JOINT_VENTURE: 'JOINT_VENTURE'
    });

    const LocationType = Object.freeze({
        SOVEREIGN_TERRITORY: 'SOVEREIGN_TERRITORY',
        ADMINISTRATIVE_DISTRICT: 'ADMINISTRATIVE_DISTRICT',
        MARITIME_EXCLUSIVE_ZONE: 'MARITIME_EXCLUSIVE_ZONE',
        OFFSHORE_SEABED: 'OFFSHORE_SEABED',
        TRANSIT_CORRIDOR: 'TRANSIT_CORRIDOR',
        LOGISTICS_NODE: 'LOGISTICS_NODE',
        FACILITY_POINT: 'FACILITY_POINT',
        GLOBAL_COMMONS: 'GLOBAL_COMMONS'
    });

    const EntityStateType = Object.freeze({
        COUNTRY_STATE: 'COUNTRY_STATE',
        RESOURCE_TYPE_STATE: 'RESOURCE_TYPE_STATE',
        DEPOSIT_STATE: 'DEPOSIT_STATE',
        EXTRACTION_ASSET_STATE: 'EXTRACTION_ASSET_STATE',
        FACILITY_STATE: 'FACILITY_STATE',
        INFRASTRUCTURE_STATE: 'INFRASTRUCTURE_STATE',
        STORAGE_FACILITY_STATE: 'STORAGE_FACILITY_STATE',
        ORGANIZATION_STATE: 'ORGANIZATION_STATE',
        MARKET_STATE: 'MARKET_STATE',
        TRADE_STATE: 'TRADE_STATE',
        POLITICAL_STATE: 'POLITICAL_STATE',
        ENVIRONMENTAL_STATE: 'ENVIRONMENTAL_STATE',
        REFERENCE_ENTITY_STATE: 'REFERENCE_ENTITY_STATE'
    });

    const ReferenceStatus = Object.freeze({
        CANONICAL_PROVEN: 'CANONICAL_PROVEN',
        UNVERIFIED_REFERENCE: 'UNVERIFIED_REFERENCE',
        INFERRED_REFERENCE: 'INFERRED_REFERENCE',
        EXTERNAL_CATALOG: 'EXTERNAL_CATALOG'
    });

    // =========================================================================
    // 03.02: UNIVERSAL QUANTITY STANDARD & DIMENSIONALITY ENGINE
    // =========================================================================

    const QuantityDimension = Object.freeze({
        MASS: 'MASS',
        VOLUME: 'VOLUME',
        ENERGY: 'ENERGY',
        AREA: 'AREA',
        COUNT: 'COUNT',
        CURRENCY: 'CURRENCY',
        FLOW_RATE: 'FLOW_RATE',
        TIME: 'TIME',
        POWER: 'POWER',
        DENSITY: 'DENSITY',
        DIMENSIONLESS: 'DIMENSIONLESS',
        UNKNOWN: 'UNKNOWN'
    });

    const QuantitySemanticType = Object.freeze({
        RESERVE: 'RESERVE',
        INVENTORY: 'INVENTORY',
        CAPACITY: 'CAPACITY',
        FLOW: 'FLOW',
        PRODUCTION: 'PRODUCTION',
        CONSUMPTION: 'CONSUMPTION',
        IMPORT: 'IMPORT',
        EXPORT: 'EXPORT',
        DEMAND: 'DEMAND',
        STOCK: 'STOCK',
        THROUGHPUT: 'THROUGHPUT',
        BUFFER: 'BUFFER',
        STRATEGIC_RESERVE: 'STRATEGIC_RESERVE',
        LOSS: 'LOSS',
        EMISSION: 'EMISSION',
        UNKNOWN: 'UNKNOWN'
    });

    class QuantityRecord {
        constructor({
            value = null,
            unit = 'UNKNOWN_UNIT',
            dimension = QuantityDimension.UNKNOWN,
            semanticType = QuantitySemanticType.UNKNOWN,
            precision = 4,
            uncertainty = 0.0,
            timestamp = 0,
            tick = 0,
            minBound = null,
            maxBound = null,
            provenance = 'SOURCE_UNDEFINED',
            isSourceDeclared = false
        } = {}) {
            this.value = (typeof value === 'number' && !isNaN(value)) ? value : null;
            // RULE: Strict Unit & Dimension preservation - Never guess
            this.unit = (typeof unit === 'string' && unit.trim() && unit.trim() !== '') ? unit.trim() : 'UNKNOWN_UNIT';
            this.dimension = (dimension && Object.values(QuantityDimension).includes(dimension)) 
                ? dimension 
                : (this.unit === 'UNKNOWN_UNIT' ? QuantityDimension.UNKNOWN : QuantityDimension.DIMENSIONLESS);
            this.semanticType = semanticType || QuantitySemanticType.UNKNOWN;
            this.precision = typeof precision === 'number' ? precision : 4;
            this.uncertainty = typeof uncertainty === 'number' ? uncertainty : 0.0;
            this.timestamp = timestamp || Date.now();
            this.tick = typeof tick === 'number' ? tick : 0;
            this.minBound = typeof minBound === 'number' ? minBound : null;
            this.maxBound = typeof maxBound === 'number' ? maxBound : null;
            this.provenance = provenance;
            this.isSourceDeclared = Boolean(isSourceDeclared);
        }

        isValid() {
            if (this.value === null) return true; // Null values represent declared unknown state
            if (this.minBound !== null && this.value < this.minBound) return false;
            if (this.maxBound !== null && this.value > this.maxBound) return false;
            return true;
        }

        isCompatibleWith(otherQuantity) {
            if (!(otherQuantity instanceof QuantityRecord)) return false;
            if (this.dimension === QuantityDimension.UNKNOWN || otherQuantity.dimension === QuantityDimension.UNKNOWN) return false;
            return this.dimension === otherQuantity.dimension && this.unit === otherQuantity.unit;
        }

        clone() {
            return new QuantityRecord({
                value: this.value,
                unit: this.unit,
                dimension: this.dimension,
                semanticType: this.semanticType,
                precision: this.precision,
                uncertainty: this.uncertainty,
                timestamp: this.timestamp,
                tick: this.tick,
                minBound: this.minBound,
                maxBound: this.maxBound,
                provenance: this.provenance,
                isSourceDeclared: this.isSourceDeclared
            });
        }

        toJSON() {
            return {
                value: this.value,
                unit: this.unit,
                dimension: this.dimension,
                semanticType: this.semanticType,
                precision: this.precision,
                uncertainty: this.uncertainty,
                timestamp: this.timestamp,
                tick: this.tick,
                minBound: this.minBound,
                maxBound: this.maxBound,
                provenance: this.provenance,
                isSourceDeclared: this.isSourceDeclared
            };
        }
    }

    // =========================================================================
    // 03.03: UNIVERSAL SPATIAL & LOCATION CONTRACT
    // =========================================================================

    class SpatialCoordinates {
        constructor({ lat = null, lng = null, elevationMeters = null, precisionMeters = null } = {}) {
            this.lat = (typeof lat === 'number' && lat >= -90 && lat <= 90) ? lat : null;
            this.lng = (typeof lng === 'number' && lng >= -180 && lng <= 180) ? lng : null;
            this.elevationMeters = typeof elevationMeters === 'number' ? elevationMeters : null;
            this.precisionMeters = typeof precisionMeters === 'number' ? precisionMeters : null;
        }

        hasCoordinates() {
            return this.lat !== null && this.lng !== null;
        }

        clone() {
            return new SpatialCoordinates({
                lat: this.lat,
                lng: this.lng,
                elevationMeters: this.elevationMeters,
                precisionMeters: this.precisionMeters
            });
        }
    }

    class SpatialBoundingBox {
        constructor({ north = null, south = null, east = null, west = null } = {}) {
            this.north = typeof north === 'number' ? north : null;
            this.south = typeof south === 'number' ? south : null;
            this.east = typeof east === 'number' ? east : null;
            this.west = typeof west === 'number' ? west : null;
        }

        hasBounds() {
            return this.north !== null && this.south !== null && this.east !== null && this.west !== null;
        }

        contains(lat, lng) {
            if (!this.hasBounds() || typeof lat !== 'number' || typeof lng !== 'number') return false;
            return lat <= this.north && lat >= this.south && lng <= this.east && lng >= this.west;
        }

        clone() {
            return new SpatialBoundingBox({
                north: this.north,
                south: this.south,
                east: this.east,
                west: this.west
            });
        }
    }

    class LocationState {
        constructor({
            locationType = LocationType.SOVEREIGN_TERRITORY,
            countryId = 'GLOBAL',
            districtName = null,
            coordinates = null,
            boundingBox = null,
            polygonVertices = [],
            maritimeZone = null,
            logisticsCorridorId = null,
            uncertaintyRadiusMeters = null
        } = {}) {
            this.locationType = locationType;
            this.countryId = countryId || 'GLOBAL';
            this.districtName = districtName;
            this.coordinates = coordinates instanceof SpatialCoordinates ? coordinates : new SpatialCoordinates(coordinates || {});
            this.boundingBox = boundingBox instanceof SpatialBoundingBox ? boundingBox : new SpatialBoundingBox(boundingBox || {});
            this.polygonVertices = Array.isArray(polygonVertices) ? [...polygonVertices] : [];
            this.maritimeZone = maritimeZone;
            this.logisticsCorridorId = logisticsCorridorId;
            this.uncertaintyRadiusMeters = typeof uncertaintyRadiusMeters === 'number' ? uncertaintyRadiusMeters : null;
        }

        clone() {
            return new LocationState({
                locationType: this.locationType,
                countryId: this.countryId,
                districtName: this.districtName,
                coordinates: this.coordinates.clone(),
                boundingBox: this.boundingBox.clone(),
                polygonVertices: [...this.polygonVertices],
                maritimeZone: this.maritimeZone,
                logisticsCorridorId: this.logisticsCorridorId,
                uncertaintyRadiusMeters: this.uncertaintyRadiusMeters
            });
        }

        toJSON() {
            return {
                locationType: this.locationType,
                countryId: this.countryId,
                districtName: this.districtName,
                coordinates: { ...this.coordinates },
                boundingBox: { ...this.boundingBox },
                polygonVertices: [...this.polygonVertices],
                maritimeZone: this.maritimeZone,
                logisticsCorridorId: this.logisticsCorridorId,
                uncertaintyRadiusMeters: this.uncertaintyRadiusMeters
            };
        }
    }

    // =========================================================================
    // 03.04: MULTI-LAYER OWNERSHIP & CONTROL MODEL
    // =========================================================================

    class OwnershipStake {
        constructor({ entityId = 'UNKNOWN', stakeRatio = 1.0, stakeType = 'DIRECT_EQUITY' } = {}) {
            this.entityId = entityId;
            this.stakeRatio = typeof stakeRatio === 'number' ? Math.max(0, Math.min(1, stakeRatio)) : 1.0;
            this.stakeType = stakeType;
        }

        clone() {
            return new OwnershipStake({
                entityId: this.entityId,
                stakeRatio: this.stakeRatio,
                stakeType: this.stakeType
            });
        }
    }

    class OwnershipState {
        constructor({
            legalOwnerId = 'UNKNOWN_OWNER',
            operatingEntityId = 'UNKNOWN_OPERATOR',
            controllingSovereignId = 'UNKNOWN_SOVEREIGN',
            hostCountryId = 'GLOBAL',
            ownershipStatus = OwnershipStatus.UNKNOWN,
            equityStakes = [],
            concessionExpirationTick = null,
            nationalizationRiskScore = null
        } = {}) {
            this.legalOwnerId = legalOwnerId;
            this.operatingEntityId = operatingEntityId;
            this.controllingSovereignId = controllingSovereignId;
            this.hostCountryId = hostCountryId || 'GLOBAL';
            this.ownershipStatus = ownershipStatus;
            this.equityStakes = Array.isArray(equityStakes) 
                ? equityStakes.map(s => s instanceof OwnershipStake ? s : new OwnershipStake(s))
                : [];
            this.concessionExpirationTick = typeof concessionExpirationTick === 'number' ? concessionExpirationTick : null;
            this.nationalizationRiskScore = typeof nationalizationRiskScore === 'number' ? nationalizationRiskScore : null;
        }

        clone() {
            return new OwnershipState({
                legalOwnerId: this.legalOwnerId,
                operatingEntityId: this.operatingEntityId,
                controllingSovereignId: this.controllingSovereignId,
                hostCountryId: this.hostCountryId,
                ownershipStatus: this.ownershipStatus,
                equityStakes: this.equityStakes.map(s => s.clone()),
                concessionExpirationTick: this.concessionExpirationTick,
                nationalizationRiskScore: this.nationalizationRiskScore
            });
        }

        toJSON() {
            return {
                legalOwnerId: this.legalOwnerId,
                operatingEntityId: this.operatingEntityId,
                controllingSovereignId: this.controllingSovereignId,
                hostCountryId: this.hostCountryId,
                ownershipStatus: this.ownershipStatus,
                equityStakes: this.equityStakes.map(s => ({ ...s })),
                concessionExpirationTick: this.concessionExpirationTick,
                nationalizationRiskScore: this.nationalizationRiskScore
            };
        }
    }

    // =========================================================================
    // 03.05: TEMPORAL STATE, TICK CLOCK & VERSION LINEAGE
    // =========================================================================

    class TemporalState {
        constructor({
            simulationTick = 0,
            calendarDate = '2030-01-01',
            fractionalTickTime = 0.0,
            stateVersion = 1,
            lastMutatedTimestamp = Date.now(),
            lastMutationModule = 'INITIAL_KNOWLEDGE_COMPILER'
        } = {}) {
            this.simulationTick = typeof simulationTick === 'number' ? simulationTick : 0;
            this.calendarDate = calendarDate || '2030-01-01';
            this.fractionalTickTime = typeof fractionalTickTime === 'number' ? fractionalTickTime : 0.0;
            this.stateVersion = typeof stateVersion === 'number' ? stateVersion : 1;
            this.lastMutatedTimestamp = lastMutatedTimestamp || Date.now();
            this.lastMutationModule = lastMutationModule || 'INITIAL_KNOWLEDGE_COMPILER';
        }

        advance(tick, calendarDate, fractionalTime, mutationSource) {
            this.simulationTick = tick;
            if (calendarDate) this.calendarDate = calendarDate;
            if (typeof fractionalTime === 'number') this.fractionalTickTime = fractionalTime;
            this.stateVersion += 1;
            this.lastMutatedTimestamp = Date.now();
            this.lastMutationModule = mutationSource || 'SIMULATION_KERNEL';
        }

        clone() {
            return new TemporalState({
                simulationTick: this.simulationTick,
                calendarDate: this.calendarDate,
                fractionalTickTime: this.fractionalTickTime,
                stateVersion: this.stateVersion,
                lastMutatedTimestamp: this.lastMutatedTimestamp,
                lastMutationModule: this.lastMutationModule
            });
        }

        toJSON() {
            return {
                simulationTick: this.simulationTick,
                calendarDate: this.calendarDate,
                fractionalTickTime: this.fractionalTickTime,
                stateVersion: this.stateVersion,
                lastMutatedTimestamp: this.lastMutatedTimestamp,
                lastMutationModule: this.lastMutationModule
            };
        }
    }

    // =========================================================================
    // 03.06: BASE STATE ENTITY ENVELOPE (ROOT UNIVERSAL CONTRACT)
    // =========================================================================

    class BaseStateEntity {
        constructor({
            entityId,
            entityType,
            knowledgeRef = null,
            stateClass = StateClass.CURRENT,
            stateTier = StateTier.TIER_B_PHYSICAL_ASSET,
            lifecycleStatus = LifecycleStatus.UNKNOWN,
            operationalStatus = OperationalStatus.UNKNOWN,
            failureMode = FailureMode.NONE,
            ownershipState = null,
            locationState = null,
            temporalState = null,
            metadata = {},
            // RULE: Strict Separation of Reference vs Canonical Asset vs Operational Asset
            isReferenceOnly = false,
            referenceStatus = ReferenceStatus.CANONICAL_PROVEN,
            sourceDeclaredOperationalStatus = null,
            engineInferredOperationalStatus = null,
            engineLiveOperationalStatus = null,
            statusProvenance = null
        } = {}) {
            if (!entityId || typeof entityId !== 'string') {
                throw new Error('[GSRSK State Contract Violation]: BaseStateEntity requires a valid non-empty entityId string.');
            }
            if (!entityType || !Object.values(EntityStateType).includes(entityType)) {
                throw new Error('[GSRSK State Contract Violation]: Invalid or missing entityType: ' + entityType);
            }

            this.entityId = entityId;
            this.entityType = entityType;
            this.knowledgeRef = knowledgeRef || ('WK:' + entityType + ':' + entityId);
            this.stateClass = stateClass;
            this.stateTier = stateTier;
            this.lifecycleStatus = lifecycleStatus;
            this.operationalStatus = operationalStatus;
            this.failureMode = failureMode;

            // RULE: Reference Distinction & Provenance Tracking
            this.isReferenceOnly = Boolean(isReferenceOnly);
            this.referenceStatus = referenceStatus;
            this.sourceDeclaredOperationalStatus = sourceDeclaredOperationalStatus || null;
            this.engineInferredOperationalStatus = engineInferredOperationalStatus || null;
            this.engineLiveOperationalStatus = engineLiveOperationalStatus || operationalStatus || OperationalStatus.UNKNOWN;
            
            this.statusProvenance = statusProvenance || {
                sourceDeclared: Boolean(sourceDeclaredOperationalStatus),
                sourceDeclaredStatus: sourceDeclaredOperationalStatus || null,
                engineInferredStatus: engineInferredOperationalStatus || null,
                inferredReason: null,
                factualPromotionBlocked: Boolean(isReferenceOnly),
                provenanceHistory: []
            };

            this.ownership = ownershipState instanceof OwnershipState ? ownershipState : new OwnershipState(ownershipState || {});
            this.location = locationState instanceof LocationState ? locationState : new LocationState(locationState || {});
            this.temporal = temporalState instanceof TemporalState ? temporalState : new TemporalState(temporalState || {});

            // Dynamic Containers
            this.quantities = new Map();
            this.capabilities = new Map();
            this.conditions = new Map();
            this.relationships = new Map();
            this.provenanceChain = [];
            this.metadata = JSON.parse(JSON.stringify(metadata || {}));
        }

        getEpistemicClassification() {
            if (this.isReferenceOnly || this.referenceStatus === ReferenceStatus.UNVERIFIED_REFERENCE) {
                return AssetEpistemicClassification.REFERENCE;
            }
            if (this.stateTier === StateTier.TIER_A_SOVEREIGN_CANONICAL || this.operationalStatus === OperationalStatus.UNKNOWN) {
                return AssetEpistemicClassification.CANONICAL_ASSET;
            }
            return AssetEpistemicClassification.OPERATIONAL_ASSET;
        }

        recordInferredStatus(inferredStatus, reason = 'ENGINE_INFERENCE', tick = 0, calendarDate = '') {
            const prevStatus = this.engineLiveOperationalStatus;
            this.engineInferredOperationalStatus = inferredStatus;
            this.engineLiveOperationalStatus = inferredStatus;
            this.operationalStatus = inferredStatus;

            if (!this.statusProvenance) {
                this.statusProvenance = {
                    sourceDeclared: Boolean(this.sourceDeclaredOperationalStatus),
                    sourceDeclaredStatus: this.sourceDeclaredOperationalStatus,
                    engineInferredStatus: inferredStatus,
                    inferredReason: reason,
                    factualPromotionBlocked: Boolean(this.isReferenceOnly),
                    provenanceHistory: []
                };
            } else {
                this.statusProvenance.engineInferredStatus = inferredStatus;
                this.statusProvenance.inferredReason = reason;
                if (!Array.isArray(this.statusProvenance.provenanceHistory)) {
                    this.statusProvenance.provenanceHistory = [];
                }
                this.statusProvenance.provenanceHistory.push({
                    tick,
                    calendarDate,
                    prevStatus,
                    newStatus: inferredStatus,
                    reason,
                    timestamp: Date.now()
                });
            }
        }

        setQuantity(key, quantityRecord) {
            if (!key || typeof key !== 'string') throw new Error('Quantity key must be a non-empty string.');
            if (!(quantityRecord instanceof QuantityRecord)) {
                quantityRecord = new QuantityRecord(quantityRecord);
            }
            this.quantities.set(key, quantityRecord);
        }

        getQuantity(key) {
            return this.quantities.get(key) || null;
        }

        hasQuantity(key) {
            return this.quantities.has(key);
        }

        removeQuantity(key) {
            return this.quantities.delete(key);
        }

        registerCapability(capabilityId, capabilityObj) {
            if (!capabilityId) return;
            this.capabilities.set(capabilityId, capabilityObj);
        }

        setCondition(conditionKey, value) {
            if (!conditionKey) return;
            this.conditions.set(conditionKey, value);
        }

        getCondition(conditionKey) {
            return this.conditions.get(conditionKey);
        }

        addRelationship(relationType, targetEntityId) {
            if (!relationType || !targetEntityId) return;
            if (!this.relationships.has(relationType)) {
                this.relationships.set(relationType, new Set());
            }
            this.relationships.get(relationType).add(targetEntityId);
        }

        getRelationships(relationType) {
            const set = this.relationships.get(relationType);
            return set ? Array.from(set) : [];
        }

        touch(tick, calendarDate, mutationSource) {
            this.temporal.advance(tick, calendarDate, 0.0, mutationSource);
        }

        validateStateEnvelope() {
            if (!this.entityId || typeof this.entityId !== 'string') return false;
            if (!this.entityType || !Object.values(EntityStateType).includes(this.entityType)) return false;
            if (!this.temporal || typeof this.temporal.stateVersion !== 'number') return false;
            return true;
        }

        clone() {
            const cloned = new BaseStateEntity({
                entityId: this.entityId,
                entityType: this.entityType,
                knowledgeRef: this.knowledgeRef,
                stateClass: this.stateClass,
                stateTier: this.stateTier,
                lifecycleStatus: this.lifecycleStatus,
                operationalStatus: this.operationalStatus,
                failureMode: this.failureMode,
                ownershipState: this.ownership.clone(),
                locationState: this.location.clone(),
                temporalState: this.temporal.clone(),
                metadata: this.metadata,
                isReferenceOnly: this.isReferenceOnly,
                referenceStatus: this.referenceStatus,
                sourceDeclaredOperationalStatus: this.sourceDeclaredOperationalStatus,
                engineInferredOperationalStatus: this.engineInferredOperationalStatus,
                engineLiveOperationalStatus: this.engineLiveOperationalStatus,
                statusProvenance: JSON.parse(JSON.stringify(this.statusProvenance))
            });

            this.quantities.forEach((val, key) => cloned.setQuantity(key, val.clone()));
            this.capabilities.forEach((val, key) => cloned.registerCapability(key, JSON.parse(JSON.stringify(val))));
            this.conditions.forEach((val, key) => cloned.setCondition(key, val));
            this.relationships.forEach((set, key) => {
                set.forEach(target => cloned.addRelationship(key, target));
            });
            cloned.provenanceChain = JSON.parse(JSON.stringify(this.provenanceChain));

            return cloned;
        }

        toJSON() {
            const quantitiesObj = {};
            this.quantities.forEach((val, key) => { quantitiesObj[key] = val.toJSON(); });

            const capabilitiesObj = {};
            this.capabilities.forEach((val, key) => { capabilitiesObj[key] = val; });

            const conditionsObj = {};
            this.conditions.forEach((val, key) => { conditionsObj[key] = val; });

            const relationshipsObj = {};
            this.relationships.forEach((set, key) => { relationshipsObj[key] = Array.from(set); });

            return {
                entityId: this.entityId,
                entityType: this.entityType,
                knowledgeRef: this.knowledgeRef,
                stateClass: this.stateClass,
                stateTier: this.stateTier,
                lifecycleStatus: this.lifecycleStatus,
                operationalStatus: this.operationalStatus,
                failureMode: this.failureMode,
                isReferenceOnly: this.isReferenceOnly,
                referenceStatus: this.referenceStatus,
                epistemicClassification: this.getEpistemicClassification(),
                sourceDeclaredOperationalStatus: this.sourceDeclaredOperationalStatus,
                engineInferredOperationalStatus: this.engineInferredOperationalStatus,
                engineLiveOperationalStatus: this.engineLiveOperationalStatus,
                statusProvenance: this.statusProvenance,
                ownership: this.ownership.toJSON(),
                location: this.location.toJSON(),
                temporal: this.temporal.toJSON(),
                quantities: quantitiesObj,
                capabilities: capabilitiesObj,
                conditions: conditionsObj,
                relationships: relationshipsObj,
                provenanceChain: this.provenanceChain,
                metadata: this.metadata
            };
        }
    }

    // =========================================================================
    // 03.07: SOVEREIGN COUNTRY STATE CONTAINER
    // =========================================================================

    class CountryState extends BaseStateEntity {
        constructor(params = {}) {
            super({
                ...params,
                entityType: EntityStateType.COUNTRY_STATE,
                stateTier: StateTier.TIER_A_SOVEREIGN_CANONICAL,
                lifecycleStatus: params.lifecycleStatus || LifecycleStatus.ACTIVE,
                operationalStatus: params.operationalStatus || OperationalStatus.OPERATIONAL
            });

            this.isoCode = params.isoCode || this.entityId;
            this.canonicalName = params.canonicalName || this.entityId;
            
            this.sovereignty = {
                stabilityIndex: typeof params.sovereignty?.stabilityIndex === 'number' ? params.sovereignty.stabilityIndex : 1.0,
                legitimacyScore: typeof params.sovereignty?.legitimacyScore === 'number' ? params.sovereignty.legitimacyScore : 1.0,
                corruptionIndex: typeof params.sovereignty?.corruptionIndex === 'number' ? params.sovereignty.corruptionIndex : 0.0,
                sanctionSeverityTier: params.sovereignty?.sanctionSeverityTier ?? 0
            };

            this.macroEconomy = {
                treasuryReserves: params.macroEconomy?.treasuryReserves instanceof QuantityRecord 
                    ? params.macroEconomy.treasuryReserves 
                    : new QuantityRecord({ dimension: QuantityDimension.CURRENCY, semanticType: QuantitySemanticType.STOCK, unit: 'USD' }),
                inflationRate: typeof params.macroEconomy?.inflationRate === 'number' ? params.macroEconomy.inflationRate : 0.02,
                creditRatingTier: params.macroEconomy?.creditRatingTier ?? 'AAA'
            };
        }

        clone() {
            const cloned = new CountryState({
                entityId: this.entityId,
                knowledgeRef: this.knowledgeRef,
                stateClass: this.stateClass,
                stateTier: this.stateTier,
                lifecycleStatus: this.lifecycleStatus,
                operationalStatus: this.operationalStatus,
                failureMode: this.failureMode,
                ownershipState: this.ownership.clone(),
                locationState: this.location.clone(),
                temporalState: this.temporal.clone(),
                isoCode: this.isoCode,
                canonicalName: this.canonicalName,
                sovereignty: { ...this.sovereignty },
                macroEconomy: {
                    treasuryReserves: this.macroEconomy.treasuryReserves.clone(),
                    inflationRate: this.macroEconomy.inflationRate,
                    creditRatingTier: this.macroEconomy.creditRatingTier
                },
                metadata: this.metadata
            });

            this.quantities.forEach((val, key) => cloned.setQuantity(key, val.clone()));
            this.capabilities.forEach((val, key) => cloned.registerCapability(key, JSON.parse(JSON.stringify(val))));
            this.conditions.forEach((val, key) => cloned.setCondition(key, val));
            this.relationships.forEach((set, key) => {
                set.forEach(target => cloned.addRelationship(key, target));
            });
            cloned.provenanceChain = JSON.parse(JSON.stringify(this.provenanceChain));

            return cloned;
        }
    }

    // =========================================================================
    // 03.08: RESOURCE TYPE STATE CONTAINER
    // =========================================================================

    class ResourceTypeState extends BaseStateEntity {
        constructor(params = {}) {
            super({
                ...params,
                entityType: EntityStateType.RESOURCE_TYPE_STATE,
                stateTier: StateTier.TIER_A_SOVEREIGN_CANONICAL,
                lifecycleStatus: params.lifecycleStatus || LifecycleStatus.ACTIVE,
                operationalStatus: params.operationalStatus || OperationalStatus.OPERATIONAL
            });

            this.resourceId = params.resourceId || this.entityId;
            this.standardSymbol = params.standardSymbol || this.entityId;
            // RULE: Strict Unit/Dimension - No guessing!
            this.primaryDimension = params.primaryDimension || QuantityDimension.UNKNOWN;
            this.standardUnit = params.standardUnit || 'UNKNOWN_UNIT';

            this.strategicClassification = {
                criticalityIndex: typeof params.strategicClassification?.criticalityIndex === 'number' ? params.strategicClassification.criticalityIndex : 0.5,
                substitutabilityRating: typeof params.strategicClassification?.substitutabilityRating === 'number' ? params.strategicClassification.substitutabilityRating : 0.5,
                recyclabilityRate: typeof params.strategicClassification?.recyclabilityRate === 'number' ? params.strategicClassification.recyclabilityRate : 0.0,
                scarcityTier: params.strategicClassification?.scarcityTier ?? 'MODERATE'
            };
        }

        clone() {
            const cloned = new ResourceTypeState({
                entityId: this.entityId,
                knowledgeRef: this.knowledgeRef,
                stateClass: this.stateClass,
                stateTier: this.stateTier,
                lifecycleStatus: this.lifecycleStatus,
                operationalStatus: this.operationalStatus,
                failureMode: this.failureMode,
                ownershipState: this.ownership.clone(),
                locationState: this.location.clone(),
                temporalState: this.temporal.clone(),
                resourceId: this.resourceId,
                standardSymbol: this.standardSymbol,
                primaryDimension: this.primaryDimension,
                standardUnit: this.standardUnit,
                strategicClassification: { ...this.strategicClassification },
                metadata: this.metadata
            });

            this.quantities.forEach((val, key) => cloned.setQuantity(key, val.clone()));
            this.capabilities.forEach((val, key) => cloned.registerCapability(key, JSON.parse(JSON.stringify(val))));
            this.conditions.forEach((val, key) => cloned.setCondition(key, val));
            this.relationships.forEach((set, key) => {
                set.forEach(target => cloned.addRelationship(key, target));
            });
            cloned.provenanceChain = JSON.parse(JSON.stringify(this.provenanceChain));

            return cloned;
        }
    }

    // =========================================================================
    // 03.09: PHYSICAL ASSET STATE ENTITIES
    // =========================================================================

    class DepositState extends BaseStateEntity {
        constructor(params = {}) {
            super({
                ...params,
                entityType: EntityStateType.DEPOSIT_STATE,
                stateTier: StateTier.TIER_B_PHYSICAL_ASSET,
                lifecycleStatus: params.lifecycleStatus || LifecycleStatus.UNKNOWN,
                operationalStatus: params.operationalStatus || OperationalStatus.UNKNOWN
            });

            this.resourceTypeId = params.resourceTypeId || 'UNKNOWN_RESOURCE';
            this.geologicalMaturityTier = params.geologicalMaturityTier || 'PROVEN_DEVELOPED';
            this.oreGradeConcentration = typeof params.oreGradeConcentration === 'number' ? params.oreGradeConcentration : null;
            this.overburdenDepthMeters = typeof params.overburdenDepthMeters === 'number' ? params.overburdenDepthMeters : null;
        }

        clone() {
            const cloned = new DepositState({
                entityId: this.entityId,
                knowledgeRef: this.knowledgeRef,
                stateClass: this.stateClass,
                stateTier: this.stateTier,
                lifecycleStatus: this.lifecycleStatus,
                operationalStatus: this.operationalStatus,
                failureMode: this.failureMode,
                ownershipState: this.ownership.clone(),
                locationState: this.location.clone(),
                temporalState: this.temporal.clone(),
                resourceTypeId: this.resourceTypeId,
                geologicalMaturityTier: this.geologicalMaturityTier,
                oreGradeConcentration: this.oreGradeConcentration,
                overburdenDepthMeters: this.overburdenDepthMeters,
                metadata: this.metadata,
                isReferenceOnly: this.isReferenceOnly,
                referenceStatus: this.referenceStatus,
                sourceDeclaredOperationalStatus: this.sourceDeclaredOperationalStatus,
                engineInferredOperationalStatus: this.engineInferredOperationalStatus,
                engineLiveOperationalStatus: this.engineLiveOperationalStatus,
                statusProvenance: JSON.parse(JSON.stringify(this.statusProvenance))
            });

            this.quantities.forEach((val, key) => cloned.setQuantity(key, val.clone()));
            this.capabilities.forEach((val, key) => cloned.registerCapability(key, JSON.parse(JSON.stringify(val))));
            this.conditions.forEach((val, key) => cloned.setCondition(key, val));
            this.relationships.forEach((set, key) => {
                set.forEach(target => cloned.addRelationship(key, target));
            });
            cloned.provenanceChain = JSON.parse(JSON.stringify(this.provenanceChain));

            return cloned;
        }
    }

    class ExtractionAssetState extends BaseStateEntity {
        constructor(params = {}) {
            super({
                ...params,
                entityType: EntityStateType.EXTRACTION_ASSET_STATE,
                stateTier: StateTier.TIER_B_PHYSICAL_ASSET,
                lifecycleStatus: params.lifecycleStatus || LifecycleStatus.UNKNOWN,
                operationalStatus: params.operationalStatus || OperationalStatus.UNKNOWN
            });

            this.depositId = params.depositId || null;
            this.primaryOutputResourceId = params.primaryOutputResourceId || 'UNKNOWN_RESOURCE';
            this.extractionTechnologyType = params.extractionTechnologyType || 'CONVENTIONAL';
            this.assetHealthIndex = typeof params.assetHealthIndex === 'number' ? params.assetHealthIndex : 1.0;
            this.energyIntensityMultiplier = typeof params.energyIntensityMultiplier === 'number' ? params.energyIntensityMultiplier : 1.0;
        }

        clone() {
            const cloned = new ExtractionAssetState({
                entityId: this.entityId,
                knowledgeRef: this.knowledgeRef,
                stateClass: this.stateClass,
                stateTier: this.stateTier,
                lifecycleStatus: this.lifecycleStatus,
                operationalStatus: this.operationalStatus,
                failureMode: this.failureMode,
                ownershipState: this.ownership.clone(),
                locationState: this.location.clone(),
                temporalState: this.temporal.clone(),
                depositId: this.depositId,
                primaryOutputResourceId: this.primaryOutputResourceId,
                extractionTechnologyType: this.extractionTechnologyType,
                assetHealthIndex: this.assetHealthIndex,
                energyIntensityMultiplier: this.energyIntensityMultiplier,
                metadata: this.metadata,
                isReferenceOnly: this.isReferenceOnly,
                referenceStatus: this.referenceStatus,
                sourceDeclaredOperationalStatus: this.sourceDeclaredOperationalStatus,
                engineInferredOperationalStatus: this.engineInferredOperationalStatus,
                engineLiveOperationalStatus: this.engineLiveOperationalStatus,
                statusProvenance: JSON.parse(JSON.stringify(this.statusProvenance))
            });

            this.quantities.forEach((val, key) => cloned.setQuantity(key, val.clone()));
            this.capabilities.forEach((val, key) => cloned.registerCapability(key, JSON.parse(JSON.stringify(val))));
            this.conditions.forEach((val, key) => cloned.setCondition(key, val));
            this.relationships.forEach((set, key) => {
                set.forEach(target => cloned.addRelationship(key, target));
            });
            cloned.provenanceChain = JSON.parse(JSON.stringify(this.provenanceChain));

            return cloned;
        }
    }

    class FacilityState extends BaseStateEntity {
        constructor(params = {}) {
            super({
                ...params,
                entityType: EntityStateType.FACILITY_STATE,
                stateTier: StateTier.TIER_B_PHYSICAL_ASSET,
                lifecycleStatus: params.lifecycleStatus || LifecycleStatus.UNKNOWN,
                operationalStatus: params.operationalStatus || OperationalStatus.UNKNOWN
            });

            this.facilityCategory = params.facilityCategory || 'PROCESSING';
            this.primaryProcessType = params.primaryProcessType || 'REFINING';
            this.assetHealthIndex = typeof params.assetHealthIndex === 'number' ? Math.max(0, Math.min(1, params.assetHealthIndex)) : 1.0;
            this.conversionEfficiencyRatio = typeof params.conversionEfficiencyRatio === 'number' ? Math.max(0, Math.min(1, params.conversionEfficiencyRatio)) : 0.95;
            
            // Bridge Attributes for Part 04 (Resource Identity Engine)
            this.inputResourceIds = Array.isArray(params.inputResourceIds) ? [...params.inputResourceIds] : [];
            this.outputResourceIds = Array.isArray(params.outputResourceIds) ? [...params.outputResourceIds] : [];
            this.nominalCapacity = params.nominalCapacity instanceof QuantityRecord ? params.nominalCapacity : (params.nominalCapacity ? new QuantityRecord(params.nominalCapacity) : null);
            this.currentThroughput = params.currentThroughput instanceof QuantityRecord ? params.currentThroughput : (params.currentThroughput ? new QuantityRecord(params.currentThroughput) : null);
        }

        clone() {
            const cloned = new FacilityState({
                entityId: this.entityId,
                knowledgeRef: this.knowledgeRef,
                stateClass: this.stateClass,
                stateTier: this.stateTier,
                lifecycleStatus: this.lifecycleStatus,
                operationalStatus: this.operationalStatus,
                failureMode: this.failureMode,
                ownershipState: this.ownership.clone(),
                locationState: this.location.clone(),
                temporalState: this.temporal.clone(),
                facilityCategory: this.facilityCategory,
                primaryProcessType: this.primaryProcessType,
                assetHealthIndex: this.assetHealthIndex,
                conversionEfficiencyRatio: this.conversionEfficiencyRatio,
                inputResourceIds: [...this.inputResourceIds],
                outputResourceIds: [...this.outputResourceIds],
                nominalCapacity: this.nominalCapacity ? this.nominalCapacity.clone() : null,
                currentThroughput: this.currentThroughput ? this.currentThroughput.clone() : null,
                metadata: this.metadata,
                isReferenceOnly: this.isReferenceOnly,
                referenceStatus: this.referenceStatus,
                sourceDeclaredOperationalStatus: this.sourceDeclaredOperationalStatus,
                engineInferredOperationalStatus: this.engineInferredOperationalStatus,
                engineLiveOperationalStatus: this.engineLiveOperationalStatus,
                statusProvenance: JSON.parse(JSON.stringify(this.statusProvenance))
            });

            this.quantities.forEach((val, key) => cloned.setQuantity(key, val.clone()));
            this.capabilities.forEach((val, key) => cloned.registerCapability(key, JSON.parse(JSON.stringify(val))));
            this.conditions.forEach((val, key) => cloned.setCondition(key, val));
            this.relationships.forEach((set, key) => {
                set.forEach(target => cloned.addRelationship(key, target));
            });
            cloned.provenanceChain = JSON.parse(JSON.stringify(this.provenanceChain));

            return cloned;
        }

        toJSON() {
            const base = super.toJSON();
            return {
                ...base,
                facilityCategory: this.facilityCategory,
                primaryProcessType: this.primaryProcessType,
                assetHealthIndex: this.assetHealthIndex,
                conversionEfficiencyRatio: this.conversionEfficiencyRatio,
                inputResourceIds: this.inputResourceIds,
                outputResourceIds: this.outputResourceIds,
                nominalCapacity: this.nominalCapacity ? this.nominalCapacity.toJSON() : null,
                currentThroughput: this.currentThroughput ? this.currentThroughput.toJSON() : null
            };
        }
    }

    class InfrastructureState extends BaseStateEntity {
        constructor(params = {}) {
            super({
                ...params,
                entityType: EntityStateType.INFRASTRUCTURE_STATE,
                stateTier: StateTier.TIER_B_PHYSICAL_ASSET,
                lifecycleStatus: params.lifecycleStatus || LifecycleStatus.UNKNOWN,
                operationalStatus: params.operationalStatus || OperationalStatus.UNKNOWN
            });

            this.infrastructureType = params.infrastructureType || 'TRANSPORT_CORRIDOR';
            this.throughputCapacityPerDay = params.throughputCapacityPerDay instanceof QuantityRecord 
                ? params.throughputCapacityPerDay 
                : (params.throughputCapacityPerDay ? new QuantityRecord(params.throughputCapacityPerDay) : null);
            this.congestionRatio = typeof params.congestionRatio === 'number' ? Math.max(0, Math.min(1, params.congestionRatio)) : 0.0;
            this.corridorConnectedNodes = Array.isArray(params.corridorConnectedNodes) ? [...params.corridorConnectedNodes] : [];
            this.transportedResourceIds = Array.isArray(params.transportedResourceIds) ? [...params.transportedResourceIds] : [];
        }

        clone() {
            const cloned = new InfrastructureState({
                entityId: this.entityId,
                knowledgeRef: this.knowledgeRef,
                stateClass: this.stateClass,
                stateTier: this.stateTier,
                lifecycleStatus: this.lifecycleStatus,
                operationalStatus: this.operationalStatus,
                failureMode: this.failureMode,
                ownershipState: this.ownership.clone(),
                locationState: this.location.clone(),
                temporalState: this.temporal.clone(),
                infrastructureType: this.infrastructureType,
                throughputCapacityPerDay: this.throughputCapacityPerDay ? this.throughputCapacityPerDay.clone() : null,
                congestionRatio: this.congestionRatio,
                corridorConnectedNodes: [...this.corridorConnectedNodes],
                transportedResourceIds: [...this.transportedResourceIds],
                metadata: this.metadata,
                isReferenceOnly: this.isReferenceOnly,
                referenceStatus: this.referenceStatus,
                sourceDeclaredOperationalStatus: this.sourceDeclaredOperationalStatus,
                engineInferredOperationalStatus: this.engineInferredOperationalStatus,
                engineLiveOperationalStatus: this.engineLiveOperationalStatus,
                statusProvenance: JSON.parse(JSON.stringify(this.statusProvenance))
            });

            this.quantities.forEach((val, key) => cloned.setQuantity(key, val.clone()));
            this.capabilities.forEach((val, key) => cloned.registerCapability(key, JSON.parse(JSON.stringify(val))));
            this.conditions.forEach((val, key) => cloned.setCondition(key, val));
            this.relationships.forEach((set, key) => {
                set.forEach(target => cloned.addRelationship(key, target));
            });
            cloned.provenanceChain = JSON.parse(JSON.stringify(this.provenanceChain));

            return cloned;
        }

        toJSON() {
            const base = super.toJSON();
            return {
                ...base,
                infrastructureType: this.infrastructureType,
                throughputCapacityPerDay: this.throughputCapacityPerDay ? this.throughputCapacityPerDay.toJSON() : null,
                congestionRatio: this.congestionRatio,
                corridorConnectedNodes: this.corridorConnectedNodes,
                transportedResourceIds: this.transportedResourceIds
            };
        }
    }

    class StorageFacilityState extends BaseStateEntity {
        constructor(params = {}) {
            super({
                ...params,
                entityType: EntityStateType.STORAGE_FACILITY_STATE,
                stateTier: StateTier.TIER_B_PHYSICAL_ASSET,
                lifecycleStatus: params.lifecycleStatus || LifecycleStatus.UNKNOWN,
                operationalStatus: params.operationalStatus || OperationalStatus.UNKNOWN
            });

            this.storedResourceType = params.storedResourceType || 'UNKNOWN_RESOURCE';
            this.maxCapacity = params.maxCapacity instanceof QuantityRecord ? params.maxCapacity : new QuantityRecord(params.maxCapacity || {});
            this.currentOccupied = params.currentOccupied instanceof QuantityRecord ? params.currentOccupied : new QuantityRecord(params.currentOccupied || {});
            this.fillRatio = typeof params.fillRatio === 'number' ? params.fillRatio : 0.0;
        }

        clone() {
            const cloned = new StorageFacilityState({
                entityId: this.entityId,
                knowledgeRef: this.knowledgeRef,
                stateClass: this.stateClass,
                stateTier: this.stateTier,
                lifecycleStatus: this.lifecycleStatus,
                operationalStatus: this.operationalStatus,
                failureMode: this.failureMode,
                ownershipState: this.ownership.clone(),
                locationState: this.location.clone(),
                temporalState: this.temporal.clone(),
                storedResourceType: this.storedResourceType,
                maxCapacity: this.maxCapacity.clone(),
                currentOccupied: this.currentOccupied.clone(),
                fillRatio: this.fillRatio,
                metadata: this.metadata,
                isReferenceOnly: this.isReferenceOnly,
                referenceStatus: this.referenceStatus,
                sourceDeclaredOperationalStatus: this.sourceDeclaredOperationalStatus,
                engineInferredOperationalStatus: this.engineInferredOperationalStatus,
                engineLiveOperationalStatus: this.engineLiveOperationalStatus,
                statusProvenance: JSON.parse(JSON.stringify(this.statusProvenance))
            });

            this.quantities.forEach((val, key) => cloned.setQuantity(key, val.clone()));
            this.capabilities.forEach((val, key) => cloned.registerCapability(key, JSON.parse(JSON.stringify(val))));
            this.conditions.forEach((val, key) => cloned.setCondition(key, val));
            this.relationships.forEach((set, key) => {
                set.forEach(target => cloned.addRelationship(key, target));
            });
            cloned.provenanceChain = JSON.parse(JSON.stringify(this.provenanceChain));

            return cloned;
        }
    }

    class OrganizationState extends BaseStateEntity {
        constructor(params = {}) {
            super({
                ...params,
                entityType: EntityStateType.ORGANIZATION_STATE,
                stateTier: StateTier.TIER_A_SOVEREIGN_CANONICAL,
                lifecycleStatus: params.lifecycleStatus || LifecycleStatus.ACTIVE,
                operationalStatus: params.operationalStatus || OperationalStatus.OPERATIONAL
            });

            this.organizationName = params.organizationName || this.entityId;
            this.hqCountryId = params.hqCountryId || 'GLOBAL';
            this.controlledAssetIds = Array.isArray(params.controlledAssetIds) ? [...params.controlledAssetIds] : [];
            this.creditRating = params.creditRating || 'BBB';
        }

        clone() {
            const cloned = new OrganizationState({
                entityId: this.entityId,
                knowledgeRef: this.knowledgeRef,
                stateClass: this.stateClass,
                stateTier: this.stateTier,
                lifecycleStatus: this.lifecycleStatus,
                operationalStatus: this.operationalStatus,
                failureMode: this.failureMode,
                ownershipState: this.ownership.clone(),
                locationState: this.location.clone(),
                temporalState: this.temporal.clone(),
                organizationName: this.organizationName,
                hqCountryId: this.hqCountryId,
                controlledAssetIds: [...this.controlledAssetIds],
                creditRating: this.creditRating,
                metadata: this.metadata
            });

            this.quantities.forEach((val, key) => cloned.setQuantity(key, val.clone()));
            this.capabilities.forEach((val, key) => cloned.registerCapability(key, JSON.parse(JSON.stringify(val))));
            this.conditions.forEach((val, key) => cloned.setCondition(key, val));
            this.relationships.forEach((set, key) => {
                set.forEach(target => cloned.addRelationship(key, target));
            });
            cloned.provenanceChain = JSON.parse(JSON.stringify(this.provenanceChain));

            return cloned;
        }
    }

    class MarketState extends BaseStateEntity {
        constructor(params = {}) {
            super({
                ...params,
                entityType: EntityStateType.MARKET_STATE,
                stateTier: StateTier.TIER_C_MARKET_TRADE,
                lifecycleStatus: params.lifecycleStatus || LifecycleStatus.ACTIVE,
                operationalStatus: params.operationalStatus || OperationalStatus.OPERATIONAL
            });

            this.resourceTypeId = params.resourceTypeId || this.entityId;
            this.spotPrice = params.spotPrice instanceof QuantityRecord ? params.spotPrice : new QuantityRecord({ dimension: QuantityDimension.CURRENCY, unit: 'USD' });
            this.supplyDemandRatio = typeof params.supplyDemandRatio === 'number' ? params.supplyDemandRatio : 1.0;
            this.volatilityIndex = typeof params.volatilityIndex === 'number' ? params.volatilityIndex : 0.1;
        }

        clone() {
            const cloned = new MarketState({
                entityId: this.entityId,
                knowledgeRef: this.knowledgeRef,
                stateClass: this.stateClass,
                stateTier: this.stateTier,
                lifecycleStatus: this.lifecycleStatus,
                operationalStatus: this.operationalStatus,
                failureMode: this.failureMode,
                ownershipState: this.ownership.clone(),
                locationState: this.location.clone(),
                temporalState: this.temporal.clone(),
                resourceTypeId: this.resourceTypeId,
                spotPrice: this.spotPrice.clone(),
                supplyDemandRatio: this.supplyDemandRatio,
                volatilityIndex: this.volatilityIndex,
                metadata: this.metadata
            });

            this.quantities.forEach((val, key) => cloned.setQuantity(key, val.clone()));
            this.capabilities.forEach((val, key) => cloned.registerCapability(key, JSON.parse(JSON.stringify(val))));
            this.conditions.forEach((val, key) => cloned.setCondition(key, val));
            this.relationships.forEach((set, key) => {
                set.forEach(target => cloned.addRelationship(key, target));
            });
            cloned.provenanceChain = JSON.parse(JSON.stringify(this.provenanceChain));

            return cloned;
        }
    }

    class TradeState extends BaseStateEntity {
        constructor(params = {}) {
            super({
                ...params,
                entityType: EntityStateType.TRADE_STATE,
                stateTier: StateTier.TIER_C_MARKET_TRADE,
                lifecycleStatus: params.lifecycleStatus || LifecycleStatus.ACTIVE,
                operationalStatus: params.operationalStatus || OperationalStatus.OPERATIONAL
            });

            this.exporterCountryId = params.exporterCountryId || 'UNKNOWN';
            this.importerCountryId = params.importerCountryId || 'UNKNOWN';
            this.resourceTypeId = params.resourceTypeId || 'UNKNOWN_RESOURCE';
            this.contractedVolume = params.contractedVolume instanceof QuantityRecord ? params.contractedVolume : new QuantityRecord(params.contractedVolume || {});
            this.fulfillmentRatio = typeof params.fulfillmentRatio === 'number' ? params.fulfillmentRatio : 1.0;
            this.isBlockaded = Boolean(params.isBlockaded);
        }

        clone() {
            const cloned = new TradeState({
                entityId: this.entityId,
                knowledgeRef: this.knowledgeRef,
                stateClass: this.stateClass,
                stateTier: this.stateTier,
                lifecycleStatus: this.lifecycleStatus,
                operationalStatus: this.operationalStatus,
                failureMode: this.failureMode,
                ownershipState: this.ownership.clone(),
                locationState: this.location.clone(),
                temporalState: this.temporal.clone(),
                exporterCountryId: this.exporterCountryId,
                importerCountryId: this.importerCountryId,
                resourceTypeId: this.resourceTypeId,
                contractedVolume: this.contractedVolume.clone(),
                fulfillmentRatio: this.fulfillmentRatio,
                isBlockaded: this.isBlockaded,
                metadata: this.metadata
            });

            this.quantities.forEach((val, key) => cloned.setQuantity(key, val.clone()));
            this.capabilities.forEach((val, key) => cloned.registerCapability(key, JSON.parse(JSON.stringify(val))));
            this.conditions.forEach((val, key) => cloned.setCondition(key, val));
            this.relationships.forEach((set, key) => {
                set.forEach(target => cloned.addRelationship(key, target));
            });
            cloned.provenanceChain = JSON.parse(JSON.stringify(this.provenanceChain));

            return cloned;
        }
    }

    // =========================================================================
    // 03.10: ROBUST SCHEMA VALIDATION & COMPRESSED TELEMETRY LAYER
    // =========================================================================

    class TelemetrySchemaValidator {
        /**
         * Decompresses and validates raw incoming telemetry for Facility entities
         */
        static decompressAndValidateFacility(raw) {
            if (!raw || typeof raw !== 'object') {
                throw new Error('[TelemetrySchemaValidator]: Invalid facility payload (must be an object)');
            }

            const id = raw.id || raw.entityId || raw.eid || ('FAC_' + Math.random().toString(36).substring(2, 9));
            const category = raw.facilityCategory || raw.category || raw.cat || raw.fc || 'PROCESSING';
            const processType = raw.primaryProcessType || raw.processType || raw.proc || raw.pt || 'REFINING';
            const countryId = raw.countryId || raw.country || raw.hostCountry || raw.cid || 'GLOBAL';
            
            // Health & efficiency (sanitized & bounded)
            const rawHealth = raw.assetHealthIndex ?? raw.health ?? raw.hlth ?? raw.ahi ?? 1.0;
            const assetHealthIndex = (typeof rawHealth === 'number' && !isNaN(rawHealth)) ? Math.max(0, Math.min(1, rawHealth)) : 1.0;

            const rawEff = raw.conversionEfficiencyRatio ?? raw.efficiency ?? raw.eff ?? raw.cer ?? 0.95;
            const conversionEfficiencyRatio = (typeof rawEff === 'number' && !isNaN(rawEff)) ? Math.max(0, Math.min(1, rawEff)) : 0.95;

            // Operational status distinction
            const declaredOpStatus = raw.sourceOperationalStatus || raw.sourceDeclaredStatus || raw.opStatus || raw.status || raw.st || null;
            const isDeclared = Boolean(declaredOpStatus && OperationalStatus[declaredOpStatus]);
            const operationalStatus = isDeclared ? OperationalStatus[declaredOpStatus] : OperationalStatus.UNKNOWN;

            // Resource couplings (strict array normalization)
            const inputResourceIds = Array.isArray(raw.inputResourceIds) ? raw.inputResourceIds : (raw.inRes ? [raw.inRes].flat() : (raw.inputs ? [raw.inputs].flat() : []));
            const outputResourceIds = Array.isArray(raw.outputResourceIds) ? raw.outputResourceIds : (raw.outRes ? [raw.outRes].flat() : (raw.outputs ? [raw.outputs].flat() : []));

            // Coordinates
            const lat = typeof raw.lat === 'number' ? raw.lat : (raw.coordinates ? raw.coordinates.lat : (raw.loc ? raw.loc.lat : null));
            const lng = typeof raw.lng === 'number' ? raw.lng : (raw.coordinates ? raw.coordinates.lng : (raw.loc ? raw.loc.lng : null));

            // Capacity & Throughput with strict dimension governance
            const capVal = raw.nominalCapacity?.value ?? raw.capacity ?? raw.cap ?? null;
            const capUnit = raw.nominalCapacity?.unit ?? raw.capacityUnit ?? raw.u ?? 'UNKNOWN_UNIT';
            const capDim = (capUnit !== 'UNKNOWN_UNIT' && (raw.nominalCapacity?.dimension || raw.dimension || raw.dim))
                ? (raw.nominalCapacity?.dimension || raw.dimension || raw.dim)
                : QuantityDimension.UNKNOWN;

            const nominalCapacity = (capVal !== null) ? new QuantityRecord({
                value: Number(capVal),
                unit: capUnit,
                dimension: capDim,
                semanticType: QuantitySemanticType.CAPACITY,
                isSourceDeclared: Boolean(capUnit !== 'UNKNOWN_UNIT')
            }) : null;

            return new FacilityState({
                entityId: String(id),
                facilityCategory: String(category),
                primaryProcessType: String(processType),
                assetHealthIndex,
                conversionEfficiencyRatio,
                inputResourceIds,
                outputResourceIds,
                nominalCapacity,
                lifecycleStatus: isDeclared ? LifecycleStatus.ACTIVE : LifecycleStatus.UNVERIFIED,
                operationalStatus,
                sourceDeclaredOperationalStatus: isDeclared ? operationalStatus : null,
                engineLiveOperationalStatus: operationalStatus,
                statusProvenance: {
                    sourceDeclared: isDeclared,
                    sourceDeclaredStatus: isDeclared ? operationalStatus : null,
                    engineInferredStatus: null,
                    inferredReason: null,
                    factualPromotionBlocked: !isDeclared,
                    provenanceHistory: []
                },
                locationState: new LocationState({
                    countryId,
                    locationType: LocationType.FACILITY_POINT,
                    coordinates: new SpatialCoordinates({ lat, lng })
                }),
                ownershipState: new OwnershipState({
                    hostCountryId: countryId,
                    legalOwnerId: raw.legalOwnerId || raw.owner || raw.own || 'UNKNOWN_OWNER',
                    operatingEntityId: raw.operatingEntityId || raw.operator || raw.op || 'UNKNOWN_OPERATOR'
                }),
                metadata: {
                    rawTelemetry: raw,
                    decompressedAt: Date.now()
                }
            });
        }

        /**
         * Decompresses and validates raw incoming telemetry for Infrastructure entities
         */
        static decompressAndValidateInfrastructure(raw) {
            if (!raw || typeof raw !== 'object') {
                throw new Error('[TelemetrySchemaValidator]: Invalid infrastructure payload (must be an object)');
            }

            const id = raw.id || raw.entityId || raw.eid || ('INFRA_' + Math.random().toString(36).substring(2, 9));
            const infraType = raw.infrastructureType || raw.type || raw.infraType || raw.it || 'TRANSPORT_CORRIDOR';
            const countryId = raw.countryId || raw.country || raw.hostCountry || raw.cid || 'GLOBAL';

            const rawCg = raw.congestionRatio ?? raw.congestion ?? raw.cg ?? 0.0;
            const congestionRatio = (typeof rawCg === 'number' && !isNaN(rawCg)) ? Math.max(0, Math.min(1, rawCg)) : 0.0;

            const connectedNodes = Array.isArray(raw.corridorConnectedNodes) 
                ? raw.corridorConnectedNodes 
                : (raw.connectedNodes ? [raw.connectedNodes].flat() : (raw.nodes ? [raw.nodes].flat() : (raw.cn ? [raw.cn].flat() : [])));

            const transportedResources = Array.isArray(raw.transportedResourceIds)
                ? raw.transportedResourceIds
                : (raw.transportedResources ? [raw.transportedResources].flat() : (raw.res ? [raw.res].flat() : []));

            // Operational status
            const declaredOpStatus = raw.sourceOperationalStatus || raw.sourceDeclaredStatus || raw.opStatus || raw.status || raw.st || null;
            const isDeclared = Boolean(declaredOpStatus && OperationalStatus[declaredOpStatus]);
            const operationalStatus = isDeclared ? OperationalStatus[declaredOpStatus] : OperationalStatus.UNKNOWN;

            // Throughput Capacity
            const thVal = raw.throughputCapacityPerDay?.value ?? raw.throughputCapacity ?? raw.throughput ?? raw.th ?? raw.cap ?? null;
            const thUnit = raw.throughputCapacityPerDay?.unit ?? raw.throughputUnit ?? raw.u ?? 'UNKNOWN_UNIT';
            const thDim = (thUnit !== 'UNKNOWN_UNIT' && (raw.throughputCapacityPerDay?.dimension || raw.dimension || raw.dim))
                ? (raw.throughputCapacityPerDay?.dimension || raw.dimension || raw.dim)
                : QuantityDimension.UNKNOWN;

            const throughputCapacityPerDay = (thVal !== null) ? new QuantityRecord({
                value: Number(thVal),
                unit: thUnit,
                dimension: thDim,
                semanticType: QuantitySemanticType.THROUGHPUT,
                isSourceDeclared: Boolean(thUnit !== 'UNKNOWN_UNIT')
            }) : null;

            return new InfrastructureState({
                entityId: String(id),
                infrastructureType: String(infraType),
                congestionRatio,
                corridorConnectedNodes: connectedNodes,
                transportedResourceIds: transportedResources,
                throughputCapacityPerDay,
                lifecycleStatus: isDeclared ? LifecycleStatus.ACTIVE : LifecycleStatus.UNVERIFIED,
                operationalStatus,
                sourceDeclaredOperationalStatus: isDeclared ? operationalStatus : null,
                engineLiveOperationalStatus: operationalStatus,
                statusProvenance: {
                    sourceDeclared: isDeclared,
                    sourceDeclaredStatus: isDeclared ? operationalStatus : null,
                    engineInferredStatus: null,
                    inferredReason: null,
                    factualPromotionBlocked: !isDeclared,
                    provenanceHistory: []
                },
                locationState: new LocationState({
                    countryId,
                    locationType: LocationType.TRANSIT_CORRIDOR
                }),
                ownershipState: new OwnershipState({
                    hostCountryId: countryId,
                    legalOwnerId: raw.legalOwnerId || raw.owner || raw.own || 'UNKNOWN_OWNER',
                    operatingEntityId: raw.operatingEntityId || raw.operator || raw.op || 'UNKNOWN_OPERATOR'
                }),
                metadata: {
                    rawTelemetry: raw,
                    decompressedAt: Date.now()
                }
            });
        }
    }

    // =========================================================================
    // 03.11: FORMAL RESOURCE IDENTITY BRIDGE (PART 03 -> PART 04 INTERFACE)
    // =========================================================================

    /**
     * Formal Bridge Contract between Physical State Entities (InfrastructureState & FacilityState)
     * and the Resource Identity Engine (Part 04).
     * Strictly enforces Epistemic Triad (Reference vs Canonical Asset vs Operational Asset)
     * and Explicit Provenance Separation.
     */
    class Part03ToPart04ResourceBridge {
        constructor(worldStateEngine = null) {
            this.engine = worldStateEngine;
        }

        bindEngine(worldStateEngine) {
            this.engine = worldStateEngine;
        }

        /**
         * Epistemic Classification Inspector:
         * Classifies any entity into REFERENCE (pointer), CANONICAL_ASSET (raw identity), or OPERATIONAL_ASSET (active).
         */
        classifyAsset(entity) {
            if (!entity) return null;
            if (typeof entity.getEpistemicClassification === 'function') {
                return entity.getEpistemicClassification();
            }
            if (entity.isReferenceOnly || entity.referenceStatus === ReferenceStatus.UNVERIFIED_REFERENCE) {
                return AssetEpistemicClassification.REFERENCE;
            }
            if (entity.stateTier === StateTier.TIER_A_SOVEREIGN_CANONICAL) {
                return AssetEpistemicClassification.CANONICAL_ASSET;
            }
            return AssetEpistemicClassification.OPERATIONAL_ASSET;
        }

        /**
         * Creates a formal Resource Transformation Contract for FacilityState
         * Consumed by Part 04 (Resource Identity Engine)
         */
        bridgeFacilityToResourceIdentity(facilityState) {
            if (!(facilityState instanceof FacilityState)) {
                throw new Error('[ResourceIdentityBridge]: Invalid FacilityState instance provided.');
            }

            const epistemicTier = this.classifyAsset(facilityState);

            return {
                bridgeContractVersion: '1.0.0',
                entityId: facilityState.entityId,
                epistemicTier,
                isReferenceOnly: facilityState.isReferenceOnly,
                // Canonical Identity Specification
                canonicalIdentity: {
                    facilityCategory: facilityState.facilityCategory,
                    primaryProcessType: facilityState.primaryProcessType,
                    conversionEfficiencyRatio: facilityState.conversionEfficiencyRatio,
                    inputResourceIds: [...facilityState.inputResourceIds],
                    outputResourceIds: [...facilityState.outputResourceIds],
                    nominalCapacity: facilityState.nominalCapacity ? facilityState.nominalCapacity.toJSON() : null
                },
                // Live Operational Profile
                operationalProfile: {
                    operationalStatus: facilityState.operationalStatus,
                    engineLiveStatus: facilityState.engineLiveOperationalStatus,
                    assetHealthIndex: facilityState.assetHealthIndex,
                    currentThroughput: facilityState.currentThroughput ? facilityState.currentThroughput.toJSON() : null,
                    failureMode: facilityState.failureMode
                },
                // Explicit Provenance & Audit Trail
                provenanceProfile: {
                    sourceDeclaredOperationalStatus: facilityState.sourceDeclaredOperationalStatus,
                    engineInferredOperationalStatus: facilityState.engineInferredOperationalStatus,
                    statusProvenance: JSON.parse(JSON.stringify(facilityState.statusProvenance || {}))
                },
                // Host Geography & Ownership
                spatialContext: {
                    hostCountryId: facilityState.location.countryId,
                    coordinates: { ...facilityState.location.coordinates }
                }
            };
        }

        /**
         * Creates a formal Logistics Corridor Contract for InfrastructureState
         * Consumed by Part 04 (Resource Identity Engine)
         */
        bridgeInfrastructureToResourceIdentity(infrastructureState) {
            if (!(infrastructureState instanceof InfrastructureState)) {
                throw new Error('[ResourceIdentityBridge]: Invalid InfrastructureState instance provided.');
            }

            const epistemicTier = this.classifyAsset(infrastructureState);

            return {
                bridgeContractVersion: '1.0.0',
                entityId: infrastructureState.entityId,
                epistemicTier,
                isReferenceOnly: infrastructureState.isReferenceOnly,
                // Canonical Identity Specification
                canonicalIdentity: {
                    infrastructureType: infrastructureState.infrastructureType,
                    corridorConnectedNodes: [...infrastructureState.corridorConnectedNodes],
                    transportedResourceIds: [...infrastructureState.transportedResourceIds],
                    throughputCapacityPerDay: infrastructureState.throughputCapacityPerDay ? infrastructureState.throughputCapacityPerDay.toJSON() : null
                },
                // Live Operational Profile
                operationalProfile: {
                    operationalStatus: infrastructureState.operationalStatus,
                    engineLiveStatus: infrastructureState.engineLiveOperationalStatus,
                    congestionRatio: infrastructureState.congestionRatio,
                    failureMode: infrastructureState.failureMode
                },
                // Explicit Provenance & Audit Trail
                provenanceProfile: {
                    sourceDeclaredOperationalStatus: infrastructureState.sourceDeclaredOperationalStatus,
                    engineInferredOperationalStatus: infrastructureState.engineInferredOperationalStatus,
                    statusProvenance: JSON.parse(JSON.stringify(infrastructureState.statusProvenance || {}))
                },
                // Spatial Context
                spatialContext: {
                    hostCountryId: infrastructureState.location.countryId
                }
            };
        }

        /**
         * Lossless Telemetry Hydration:
         * Ingests a batch of raw or compressed facility and infrastructure telemetry,
         * validates schemas, registers entities, and links them to the state registry.
         */
        hydratePhysicalTelemetry(batch = {}, targetRegistry = null) {
            const reg = targetRegistry || (this.engine ? this.engine.registry : null);
            if (!reg) throw new Error('[ResourceIdentityBridge]: No target WorldStateRegistry available.');

            const results = {
                facilitiesHydrated: 0,
                infrastructuresHydrated: 0,
                errors: []
            };

            // Ingest Facilities
            const rawFacilities = Array.isArray(batch.facilities) ? batch.facilities : [];
            for (const rawFac of rawFacilities) {
                try {
                    const facState = TelemetrySchemaValidator.decompressAndValidateFacility(rawFac);
                    reg.register(facState);
                    results.facilitiesHydrated++;
                } catch (err) {
                    results.errors.push({ type: 'FACILITY_ERROR', payload: rawFac, error: err.message });
                }
            }

            // Ingest Infrastructures
            const rawInfras = Array.isArray(batch.infrastructures) ? batch.infrastructures : [];
            for (const rawInfra of rawInfras) {
                try {
                    const infraState = TelemetrySchemaValidator.decompressAndValidateInfrastructure(rawInfra);
                    reg.register(infraState);
                    results.infrastructuresHydrated++;
                } catch (err) {
                    results.errors.push({ type: 'INFRASTRUCTURE_ERROR', payload: rawInfra, error: err.message });
                }
            }

            return results;
        }

        /**
         * Returns Bridge Health and Ingestion Summary
         */
        getBridgeHealthSummary() {
            const reg = this.engine ? this.engine.registry : null;
            const facilityCount = reg ? reg.getByType(EntityStateType.FACILITY_STATE).length : 0;
            const infraCount = reg ? reg.getByType(EntityStateType.INFRASTRUCTURE_STATE).length : 0;
            const referenceCount = reg ? reg.getReferencesOnly().length : 0;

            return {
                status: 'HEALTHY',
                bridgeVersion: '1.0.0',
                totalBridgedFacilities: facilityCount,
                totalBridgedInfrastructures: infraCount,
                totalBridgedReferences: referenceCount,
                isEngineConnected: Boolean(this.engine)
            };
        }

        /**
         * Synchronizes World State Engine with WorldEcosystemEngine
         */
        synchronizeWithWorldEcosystem(ecosystemEngine) {
            if (!ecosystemEngine || typeof ecosystemEngine.getAllSovereignStates !== 'function') {
                return { synchronized: false, reason: 'Invalid or missing WorldEcosystemEngine instance.' };
            }

            const sovereignStates = ecosystemEngine.getAllSovereignStates();
            let syncCount = 0;

            if (this.engine && this.engine.registry) {
                Object.values(sovereignStates).forEach(sov => {
                    const existing = this.engine.registry.get(sov.id);
                    if (existing && existing.entityType === EntityStateType.COUNTRY_STATE) {
                        existing.setCondition('ECOSYSTEM_PROFILE', sov);
                        syncCount++;
                    }
                });
            }

            return {
                synchronized: true,
                syncedCountries: syncCount
            };
        }
    }

    // =========================================================================
    // 03.12: MUTATION PIPELINE, COMMANDS & INVARIANT VALIDATORS
    // =========================================================================

    class StateTransitionCommand {
        constructor({
            commandId = ('CMD_' + Math.random().toString(36).substring(2, 10)),
            commandType = 'UPDATE_ENTITY_STATE',
            targetEntityId,
            payload = {},
            issuedBy = 'COMMAND_SYSTEM',
            tick = 0,
            calendarDate = '2030-01-01'
        } = {}) {
            if (!targetEntityId) throw new Error('[StateTransitionCommand]: targetEntityId is required.');
            this.commandId = commandId;
            this.commandType = commandType;
            this.targetEntityId = targetEntityId;
            this.payload = payload;
            this.issuedBy = issuedBy;
            this.tick = tick;
            this.calendarDate = calendarDate;
            this.timestamp = Date.now();
        }
    }

    class MutationEvent {
        constructor({
            eventId = ('EVT_' + Math.random().toString(36).substring(2, 10)),
            commandId,
            entityId,
            entityType,
            previousVersion,
            newVersion,
            diff = {},
            sourceModule = 'MUTATION_PIPELINE',
            tick = 0,
            calendarDate = '2030-01-01'
        } = {}) {
            this.eventId = eventId;
            this.commandId = commandId;
            this.entityId = entityId;
            this.entityType = entityType;
            this.previousVersion = previousVersion;
            this.newVersion = newVersion;
            this.diff = diff;
            this.sourceModule = sourceModule;
            this.tick = tick;
            this.calendarDate = calendarDate;
            this.timestamp = Date.now();
        }
    }

    class StateTransitionValidator {
        static validateEntity(entity) {
            if (!(entity instanceof BaseStateEntity)) {
                return { isValid: false, reason: 'Entity does not inherit from BaseStateEntity.' };
            }
            if (!entity.validateStateEnvelope()) {
                return { isValid: false, reason: 'State envelope contract validation failed.' };
            }

            // Invariant check on quantities: Non-negative bounds check
            for (const [qKey, qRecord] of entity.quantities.entries()) {
                if (!qRecord.isValid()) {
                    return { isValid: false, reason: 'QuantityRecord ' + qKey + ' violates boundary bounds.' };
                }
            }

            return { isValid: true };
        }

        static validateCommand(command, currentEntity) {
            if (!command || !command.targetEntityId) {
                return { isValid: false, reason: 'Invalid Command Structure.' };
            }
            if (!currentEntity) {
                if (command.commandType !== 'REGISTER_NEW_ENTITY') {
                    return { isValid: false, reason: 'Target entity ' + command.targetEntityId + ' does not exist in registry.' };
                }
            }
            return { isValid: true };
        }
    }

    // =========================================================================
    // 03.13: HIGH-SPEED WORLD STATE REGISTRY & MULTI-INDEX STORE
    // =========================================================================

    class WorldStateRegistry {
        constructor() {
            this.entities = new Map();
            this.typeIndex = new Map();
            this.countryIndex = new Map();
            this.operationalStatusIndex = new Map();
            this.lifecycleStatusIndex = new Map();
            this.referenceIndex = new Map();
            this.eventLog = [];
        }

        register(entity) {
            const validation = StateTransitionValidator.validateEntity(entity);
            if (!validation.isValid) {
                throw new Error('[WorldStateRegistry]: Registration rejected: ' + validation.reason);
            }

            this.entities.set(entity.entityId, entity);
            this._addToIndexes(entity);
            return entity;
        }

        get(entityId) {
            return this.entities.get(entityId) || null;
        }

        has(entityId) {
            return this.entities.has(entityId);
        }

        getAll() {
            return Array.from(this.entities.values());
        }

        getByType(entityType) {
            const set = this.typeIndex.get(entityType);
            if (!set) return [];
            return Array.from(set).map(id => this.entities.get(id)).filter(Boolean);
        }

        getByCountry(countryId) {
            const set = this.countryIndex.get(countryId);
            if (!set) return [];
            return Array.from(set).map(id => this.entities.get(id)).filter(Boolean);
        }

        getByOperationalStatus(status) {
            const set = this.operationalStatusIndex.get(status);
            if (!set) return [];
            return Array.from(set).map(id => this.entities.get(id)).filter(Boolean);
        }

        getReferencesOnly() {
            return Array.from(this.referenceIndex.values());
        }

        _addToIndexes(entity) {
            // Type index
            if (!this.typeIndex.has(entity.entityType)) {
                this.typeIndex.set(entity.entityType, new Set());
            }
            this.typeIndex.get(entity.entityType).add(entity.entityId);

            // Country index
            const cid = entity.location?.countryId || 'GLOBAL';
            if (!this.countryIndex.has(cid)) {
                this.countryIndex.set(cid, new Set());
            }
            this.countryIndex.get(cid).add(entity.entityId);

            // Operational status index
            const opStatus = entity.operationalStatus || OperationalStatus.UNKNOWN;
            if (!this.operationalStatusIndex.has(opStatus)) {
                this.operationalStatusIndex.set(opStatus, new Set());
            }
            this.operationalStatusIndex.get(opStatus).add(entity.entityId);

            // Lifecycle status index
            const lcStatus = entity.lifecycleStatus || LifecycleStatus.UNKNOWN;
            if (!this.lifecycleStatusIndex.has(lcStatus)) {
                this.lifecycleStatusIndex.set(lcStatus, new Set());
            }
            this.lifecycleStatusIndex.get(lcStatus).add(entity.entityId);

            // Reference index (Pointer Only)
            if (entity.isReferenceOnly) {
                this.referenceIndex.set(entity.entityId, entity);
            }
        }

        clear() {
            this.entities.clear();
            this.typeIndex.clear();
            this.countryIndex.clear();
            this.operationalStatusIndex.clear();
            this.lifecycleStatusIndex.clear();
            this.referenceIndex.clear();
            this.eventLog = [];
        }
    }

    // =========================================================================
    // 03.14: DETERMINISTIC ADLER-32 CHECKPOINT SNAPSHOT ENGINE
    // =========================================================================

    class WorldStateSnapshotEngine {
        static computeAdler32(str) {
            let a = 1, b = 0;
            const MOD_ADLER = 65521;
            for (let i = 0; i < str.length; i++) {
                a = (a + str.charCodeAt(i)) % MOD_ADLER;
                b = (b + a) % MOD_ADLER;
            }
            return ((b << 16) | a) >>> 0;
        }

        static createSnapshot(registry, tick, calendarDate) {
            const entitiesArray = registry.getAll().map(e => e.toJSON());
            const serialized = JSON.stringify({
                tick,
                calendarDate,
                entities: entitiesArray
            });

            const checksum = this.computeAdler32(serialized);

            return {
                tick,
                calendarDate,
                checksum,
                entityCount: entitiesArray.length,
                payload: serialized
            };
        }

        static restoreSnapshot(registry, snapshot) {
            if (!snapshot || !snapshot.payload) {
                throw new Error('[WorldStateSnapshotEngine]: Invalid Snapshot Payload.');
            }

            const currentChecksum = this.computeAdler32(snapshot.payload);
            if (currentChecksum !== snapshot.checksum) {
                throw new Error('[WorldStateSnapshotEngine]: Checksum mismatch! Corrupted snapshot.');
            }

            const parsed = JSON.parse(snapshot.payload);
            registry.clear();

            parsed.entities.forEach(rawObj => {
                let entity;
                switch (rawObj.entityType) {
                    case EntityStateType.COUNTRY_STATE:
                        entity = new CountryState(rawObj);
                        break;
                    case EntityStateType.RESOURCE_TYPE_STATE:
                        entity = new ResourceTypeState(rawObj);
                        break;
                    case EntityStateType.DEPOSIT_STATE:
                        entity = new DepositState(rawObj);
                        break;
                    case EntityStateType.EXTRACTION_ASSET_STATE:
                        entity = new ExtractionAssetState(rawObj);
                        break;
                    case EntityStateType.FACILITY_STATE:
                        entity = new FacilityState(rawObj);
                        break;
                    case EntityStateType.INFRASTRUCTURE_STATE:
                        entity = new InfrastructureState(rawObj);
                        break;
                    case EntityStateType.STORAGE_FACILITY_STATE:
                        entity = new StorageFacilityState(rawObj);
                        break;
                    case EntityStateType.ORGANIZATION_STATE:
                        entity = new OrganizationState(rawObj);
                        break;
                    case EntityStateType.MARKET_STATE:
                        entity = new MarketState(rawObj);
                        break;
                    case EntityStateType.TRADE_STATE:
                        entity = new TradeState(rawObj);
                        break;
                    default:
                        entity = new BaseStateEntity(rawObj);
                }

                if (rawObj.quantities) {
                    Object.entries(rawObj.quantities).forEach(([k, v]) => {
                        entity.setQuantity(k, new QuantityRecord(v));
                    });
                }
                registry.register(entity);
            });

            return {
                restoredCount: parsed.entities.length,
                tick: parsed.tick,
                calendarDate: parsed.calendarDate,
                checksum: snapshot.checksum
            };
        }
    }

    // =========================================================================
    // 03.15: AUTHORITATIVE WORLD STATE ENGINE
    // =========================================================================

    class WorldStateEngine {
        constructor() {
            this.registry = new WorldStateRegistry();
            this.currentTick = 0;
            this.calendarDate = '2030-01-01';
            this.snapshots = new Map();
            this.isHydrated = false;
            this.resourceBridge = new Part03ToPart04ResourceBridge(this);
            this.bridge = this.resourceBridge;
        }

        _extractEntries(collection) {
            if (!collection) return [];
            if (collection instanceof Map) return Array.from(collection.values());
            if (Array.isArray(collection)) return collection;
            if (typeof collection === 'object') return Object.values(collection);
            return [];
        }

        hydrateFromKnowledgeModel(knowledgeModel = {}) {
            this.registry.clear();

            // 1. Hydrate Countries (Canonical Tier-A)
            const rawCountries = (knowledgeModel.sovereignEntities && knowledgeModel.sovereignEntities.countries) ||
                                 knowledgeModel.canonicalCountries ||
                                 knowledgeModel.countries;

            const countriesList = this._extractEntries(rawCountries);
            if (countriesList.length > 0) {
                countriesList.forEach(country => {
                    const countryId = country.isoCode || country.iso3 || country.id || country.code;
                    if (!countryId) return;
                    const countryState = new CountryState({
                        entityId: countryId,
                        isoCode: countryId,
                        canonicalName: country.name || country.canonicalName || country.sovereignName || countryId,
                        locationState: new LocationState({
                            countryId: countryId,
                            locationType: LocationType.SOVEREIGN_TERRITORY
                        }),
                        lifecycleStatus: LifecycleStatus.ACTIVE,
                        operationalStatus: OperationalStatus.OPERATIONAL,
                        metadata: { source: 'WORLD_KNOWLEDGE_COMPILER_CANONICAL' }
                    });

                    // Set reserves if source declared
                    if (country.gdp || country.gdpTreasury || country.nominalGdpUsd) {
                        countryState.setQuantity('TREASURY_GDP', new QuantityRecord({
                            value: Number(country.gdp || country.gdpTreasury || country.nominalGdpUsd),
                            unit: 'USD',
                            dimension: QuantityDimension.CURRENCY,
                            semanticType: QuantitySemanticType.STOCK,
                            isSourceDeclared: true
                        }));
                    }
                    if (country.population) {
                        countryState.setQuantity('POPULATION', new QuantityRecord({
                            value: Number(country.population),
                            unit: 'PERSONS',
                            dimension: QuantityDimension.COUNT,
                            semanticType: QuantitySemanticType.STOCK,
                            isSourceDeclared: true
                        }));
                    }

                    this.registry.register(countryState);
                });
            }

            // 2. Hydrate Resource Types (Canonical Tier-A) - RULE: Zero dimension guessing
            const rawResources = (knowledgeModel.sovereignEntities && knowledgeModel.sovereignEntities.resourceTypes) ||
                                 knowledgeModel.canonicalResources ||
                                 knowledgeModel.resources;

            const resourcesList = this._extractEntries(rawResources);
            if (resourcesList.length > 0) {
                resourcesList.forEach(res => {
                    const resId = res.id || res.code || res.resourceId || res.resourceTypeCode;
                    if (!resId) return;
                    const declaredUnit = res.unit || res.standardUnit || 'UNKNOWN_UNIT';
                    const declaredDimension = (declaredUnit !== 'UNKNOWN_UNIT' && res.dimension) 
                        ? res.dimension 
                        : QuantityDimension.UNKNOWN;

                    const resState = new ResourceTypeState({
                        entityId: resId,
                        resourceId: resId,
                        standardSymbol: res.symbol || res.code || resId,
                        standardUnit: declaredUnit,
                        primaryDimension: declaredDimension,
                        strategicClassification: {
                            criticalityIndex: typeof res.criticality === 'number' ? res.criticality : 0.5,
                            substitutabilityRating: typeof res.substitutability === 'number' ? res.substitutability : 0.5
                        },
                        metadata: { source: 'WORLD_KNOWLEDGE_COMPILER_CANONICAL' }
                    });
                    this.registry.register(resState);
                });
            }

            // 3. Hydrate Facilities (Tier-B Physical Assets / Lossless Telemetry Decompression)
            if (Array.isArray(knowledgeModel.facilities)) {
                this.resourceBridge.hydratePhysicalTelemetry({ facilities: knowledgeModel.facilities }, this.registry);
            }

            // 4. Hydrate Infrastructures (Tier-B Physical Assets / Lossless Telemetry Decompression)
            if (Array.isArray(knowledgeModel.infrastructures)) {
                this.resourceBridge.hydratePhysicalTelemetry({ infrastructures: knowledgeModel.infrastructures }, this.registry);
            }

            // 5. Hydrate Reference Catalog (Tier-B References)
            // MANDATE: Reference != Canonical Asset != Operational Asset
            // Preserved strictly as UNVERIFIED references, NOT promoted to active factual physical assets!
            const referencesList = (knowledgeModel.refCatalog && Array.isArray(knowledgeModel.refCatalog.allReferences))
                ? knowledgeModel.refCatalog.allReferences
                : (Array.isArray(knowledgeModel.references) ? knowledgeModel.references : (Array.isArray(knowledgeModel.deposits) ? knowledgeModel.deposits : []));

            if (referencesList.length > 0) {
                referencesList.forEach(ref => {
                    const sourceUnit = ref.unit || ref.quantityUnit || 'UNKNOWN_UNIT';
                    const sourceDimension = (sourceUnit !== 'UNKNOWN_UNIT' && ref.dimension) 
                        ? ref.dimension 
                        : QuantityDimension.UNKNOWN;

                    // Strictly check if source declared status
                    const sourceDeclaredStatus = ref.sourceOperationalStatus || ref.declaredStatus || null;
                    const isSourceDeclared = Boolean(sourceDeclaredStatus);

                    const refEntity = new BaseStateEntity({
                        entityId: ref.id || ('REF_' + Math.random().toString(36).substring(2, 9)),
                        entityType: EntityStateType.REFERENCE_ENTITY_STATE,
                        stateTier: StateTier.TIER_B_PHYSICAL_ASSET,
                        stateClass: StateClass.CURRENT,
                        // RULE: Kept as UNVERIFIED / UNKNOWN, not promoted to active factual asset
                        lifecycleStatus: isSourceDeclared ? (LifecycleStatus[sourceDeclaredStatus] || LifecycleStatus.UNVERIFIED) : LifecycleStatus.UNVERIFIED,
                        operationalStatus: isSourceDeclared ? (OperationalStatus[sourceDeclaredStatus] || OperationalStatus.UNKNOWN) : OperationalStatus.UNKNOWN,
                        isReferenceOnly: true,
                        referenceStatus: ReferenceStatus.UNVERIFIED_REFERENCE,
                        sourceDeclaredOperationalStatus: sourceDeclaredStatus,
                        engineInferredOperationalStatus: null,
                        engineLiveOperationalStatus: OperationalStatus.UNKNOWN,
                        statusProvenance: {
                            sourceDeclared: isSourceDeclared,
                            sourceDeclaredStatus: sourceDeclaredStatus,
                            engineInferredStatus: null,
                            inferredReason: null,
                            factualPromotionBlocked: true,
                            provenanceHistory: []
                        },
                        locationState: new LocationState({
                            countryId: ref.countryId || ref.hostCountry || 'GLOBAL',
                            locationType: LocationType.SOVEREIGN_TERRITORY,
                            coordinates: new SpatialCoordinates({
                                lat: typeof ref.lat === 'number' ? ref.lat : (ref.coordinates ? ref.coordinates.lat : null),
                                lng: typeof ref.lng === 'number' ? ref.lng : (ref.coordinates ? ref.coordinates.lng : null)
                            })
                        }),
                        metadata: {
                            rawReference: ref,
                            category: ref.category || 'GENERAL_REFERENCE',
                            provenance: 'TIER_B_EXTERNAL_REFERENCE'
                        }
                    });

                    // Store declared quantity strictly without guessing units
                    if (ref.quantity !== undefined && ref.quantity !== null) {
                        refEntity.setQuantity('DECLARED_QUANTITY', new QuantityRecord({
                            value: Number(ref.quantity),
                            unit: sourceUnit,
                            dimension: sourceDimension,
                            isSourceDeclared: Boolean(ref.unit)
                        }));
                    }

                    this.registry.register(refEntity);
                });
            }

            this.isHydrated = true;
            return {
                success: true,
                totalEntities: this.registry.getAll().length,
                countryCount: this.registry.getByType(EntityStateType.COUNTRY_STATE).length,
                resourceTypeCount: this.registry.getByType(EntityStateType.RESOURCE_TYPE_STATE).length,
                facilityCount: this.registry.getByType(EntityStateType.FACILITY_STATE).length,
                infrastructureCount: this.registry.getByType(EntityStateType.INFRASTRUCTURE_STATE).length,
                referenceCount: this.registry.getReferencesOnly().length
            };
        }

        dispatchCommand(command) {
            if (!(command instanceof StateTransitionCommand)) {
                command = new StateTransitionCommand(command);
            }

            const currentEntity = this.registry.get(command.targetEntityId);
            const cmdValidation = StateTransitionValidator.validateCommand(command, currentEntity);
            if (!cmdValidation.isValid) {
                throw new Error('[WorldStateEngine]: Command rejected: ' + cmdValidation.reason);
            }

            const previousVersion = currentEntity ? currentEntity.temporal.stateVersion : 0;
            
            // Execute state mutation with Explicit Provenance Preservation
            if (currentEntity) {
                if (command.payload.operationalStatus) {
                    currentEntity.recordInferredStatus(
                        command.payload.operationalStatus,
                        command.payload.reason || ('COMMAND_' + command.commandType),
                        this.currentTick,
                        this.calendarDate
                    );
                }
                if (command.payload.lifecycleStatus) {
                    currentEntity.lifecycleStatus = command.payload.lifecycleStatus;
                }
                if (command.payload.quantities) {
                    Object.entries(command.payload.quantities).forEach(([k, q]) => {
                        currentEntity.setQuantity(k, q);
                    });
                }
                if (command.payload.conditions) {
                    Object.entries(command.payload.conditions).forEach(([k, c]) => {
                        currentEntity.setCondition(k, c);
                    });
                }
                currentEntity.touch(this.currentTick, this.calendarDate, command.issuedBy);
            }

            // Invariant verification on new state
            if (currentEntity) {
                const invariantValidation = StateTransitionValidator.validateEntity(currentEntity);
                if (!invariantValidation.isValid) {
                    throw new Error('[WorldStateEngine]: Post-mutation invariant violation: ' + invariantValidation.reason);
                }
            }

            // Record mutation event
            const mutationEvent = new MutationEvent({
                commandId: command.commandId,
                entityId: command.targetEntityId,
                entityType: currentEntity ? currentEntity.entityType : 'UNKNOWN',
                previousVersion,
                newVersion: currentEntity ? currentEntity.temporal.stateVersion : 1,
                diff: command.payload,
                sourceModule: command.issuedBy,
                tick: this.currentTick,
                calendarDate: this.calendarDate
            });

            this.registry.eventLog.push(mutationEvent);
            return mutationEvent;
        }

        tick(deltaDays = 1) {
            this.currentTick += 1;
            // Advance simulation clock
            const date = new Date(this.calendarDate);
            date.setDate(date.getDate() + deltaDays);
            this.calendarDate = date.toISOString().split('T')[0];
            return {
                tick: this.currentTick,
                calendarDate: this.calendarDate
            };
        }

        createSnapshot(label = ('SNAP_' + this.currentTick)) {
            const snapshot = WorldStateSnapshotEngine.createSnapshot(this.registry, this.currentTick, this.calendarDate);
            this.snapshots.set(label, snapshot);
            return {
                label,
                checksum: snapshot.checksum,
                entityCount: snapshot.entityCount
            };
        }

        restoreSnapshot(label) {
            const snapshot = this.snapshots.get(label);
            if (!snapshot) throw new Error('[WorldStateEngine]: Snapshot ' + label + ' not found.');
            const result = WorldStateSnapshotEngine.restoreSnapshot(this.registry, snapshot);
            this.currentTick = result.tick;
            this.calendarDate = result.calendarDate;
            return result;
        }
    }

    // =========================================================================
    // 03.16: UNIFIED PUBLIC ADAPTER & MASTER GSRSK PIPELINE
    // =========================================================================

    function deepFreeze(obj, seen = new WeakSet()) {
        if (obj === null || typeof obj !== 'object' || seen.has(obj)) return obj;
        seen.add(obj);
        if (obj instanceof Map || obj instanceof Set) return obj;
        const propNames = Object.getOwnPropertyNames(obj);
        for (const name of propNames) {
            deepFreeze(obj[name], seen);
        }
        return Object.freeze(obj);
    }

    const WorldStateEngineAdapter = Object.freeze({
        // Enums
        AssetEpistemicClassification,
        LifecycleStatus,
        OperationalStatus,
        StateClass,
        StateTier,
        FailureMode,
        OwnershipStatus,
        LocationType,
        EntityStateType,
        QuantityDimension,
        QuantitySemanticType,
        ReferenceStatus,

        // Core Contract Classes
        QuantityRecord,
        SpatialCoordinates,
        SpatialBoundingBox,
        LocationState,
        OwnershipStake,
        OwnershipState,
        TemporalState,
        BaseStateEntity,
        CountryState,
        ResourceTypeState,

        // Physical Assets
        DepositState,
        ExtractionAssetState,
        FacilityState,
        InfrastructureState,
        StorageFacilityState,
        OrganizationState,
        MarketState,
        TradeState,

        // Telemetry & Bridge
        TelemetrySchemaValidator,
        Part03ToPart04ResourceBridge,

        // Mutation & Validation Engines
        StateTransitionCommand,
        MutationEvent,
        StateTransitionValidator,
        WorldStateRegistry,
        WorldStateSnapshotEngine,
        WorldStateEngine,

        deepFreeze,

        createEngine() {
            return new WorldStateEngine();
        },

        createResourceBridge(engine) {
            return new Part03ToPart04ResourceBridge(engine);
        }
    });

    /**
     * Master GSRSK Engine: Seamless End-to-End Orchestrator
     * Unifies Part 01 (Foundation), Part 02 (Knowledge Compiler), Part 03 (World State Engine), and Part 04 (Resource Identity Engine)
     */
    class MasterGSRSKEngine {
        constructor() {
            this.dataFoundation = global.GSRSK_DataFoundation || (typeof _globalScope !== 'undefined' ? _globalScope.GSRSK_DataFoundation : null);
            this.compiler = global.GSRSK_WorldKnowledgeCompiler || null;
            this.stateEngine = new WorldStateEngine();
            this.part04 = global.GSRSK_Part04 || null;
            this.lastKnowledgeModel = null;
            this.resourceIdentityRegistry = null;
            this.isReady = false;
        }

        bootstrap(inputData = {}) {
            // 1. Data Foundation
            if (!this.dataFoundation && global.GSRSK_DataFoundation) {
                this.dataFoundation = global.GSRSK_DataFoundation;
            }

            // 2. Part 02 Compiler
            if (!this.compiler && global.GSRSK_WorldKnowledgeCompiler) {
                this.compiler = global.GSRSK_WorldKnowledgeCompiler;
            }

            // 3. Compile Knowledge or normalize input
            let knowledgeModel = null;
            if (inputData && inputData.sovereignEntities && (inputData.refCatalog || inputData.deposits || inputData.references)) {
                // Direct WorldKnowledgeModel passed
                knowledgeModel = inputData;
            } else if (this.compiler && typeof this.compiler.compileWorldKnowledge === 'function' && inputData && inputData.isPart1Registry) {
                knowledgeModel = this.compiler.compileWorldKnowledge(inputData, []);
            } else {
                // Construct standard knowledge model envelope
                knowledgeModel = {
                    sovereignEntities: {
                        countries: inputData.countries || [],
                        resourceTypes: inputData.resources || []
                    },
                    facilities: inputData.facilities || [],
                    infrastructures: inputData.infrastructures || [],
                    refCatalog: {
                        allReferences: inputData.deposits || inputData.references || []
                    }
                };
            }
            this.lastKnowledgeModel = knowledgeModel;

            // 4. Hydrate World State (Part 03)
            const hydrationResult = this.stateEngine.hydrateFromKnowledgeModel(knowledgeModel);

            // 5. Connect to WorldEcosystemEngine if available in environment
            if (global.WorldEcosystemEngine) {
                this.stateEngine.resourceBridge.synchronizeWithWorldEcosystem(global.WorldEcosystemEngine);
            }

            // 6. Automatically compile Part 04 Resource Identities if Part 04 is loaded
            const p4 = global.GSRSK_Part04 || this.part04;
            let identityCompilationResult = null;
            if (p4 && typeof p4.compileIdentities === 'function') {
                identityCompilationResult = p4.compileIdentities(
                    knowledgeModel,
                    this.stateEngine.registry,
                    this.dataFoundation && this.dataFoundation.masterRegistry ? this.dataFoundation.masterRegistry : null
                );
                this.resourceIdentityRegistry = identityCompilationResult.identityRegistry;
            }

            this.isReady = true;
            return {
                status: 'READY',
                hydration: hydrationResult,
                identityCompilation: identityCompilationResult,
                identityRegistry: this.resourceIdentityRegistry,
                tick: this.stateEngine.currentTick,
                calendarDate: this.stateEngine.calendarDate
            };
        }

        getStateEngine() {
            return this.stateEngine;
        }

        getResourceBridge() {
            return this.stateEngine.resourceBridge;
        }

        getResourceIdentityRegistry() {
            return this.resourceIdentityRegistry;
        }

        compileResourceIdentities() {
            const p4 = global.GSRSK_Part04 || this.part04;
            if (!p4 || typeof p4.compileIdentities !== 'function') {
                throw new Error('Part 04 Resource Identity Engine is not loaded');
            }
            const res = p4.compileIdentities(
                this.lastKnowledgeModel,
                this.stateEngine.registry,
                this.dataFoundation && this.dataFoundation.masterRegistry ? this.dataFoundation.masterRegistry : null
            );
            this.resourceIdentityRegistry = res.identityRegistry;
            return res;
        }

        queryEntities(filterFn) {
            const all = this.stateEngine.registry.getAll();
            return typeof filterFn === 'function' ? all.filter(filterFn) : all;
        }
    }

    const MasterEngineSingleton = new MasterGSRSKEngine();

    global.GSRSK_Part03 = WorldStateEngineAdapter;
    global.GSRSK_WorldStateEngine = WorldStateEngineAdapter;
    global.GSRSK_MasterEngine = MasterEngineSingleton;
    global.GSRSK_Engine = MasterEngineSingleton;
    global.Part03ToPart04ResourceBridge = Part03ToPart04ResourceBridge;
    global.TelemetrySchemaValidator = TelemetrySchemaValidator;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            DataFoundation: global.GSRSK_DataFoundation || (typeof _globalScope !== 'undefined' ? _globalScope.GSRSK_DataFoundation : null),
            WorldKnowledgeCompiler: global.GSRSK_WorldKnowledgeCompiler || null,
            WorldStateEngineAdapter,
            Part03ToPart04ResourceBridge,
            TelemetrySchemaValidator,
            MasterGSRSKEngine,
            MasterEngineSingleton,
            ...WorldStateEngineAdapter
        };
    }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : global));

/**
 * ============================================================================
 * GSRSK — PART 04: RESOURCE IDENTITY ENGINE (MODULE 1 OF 2)
 * ============================================================================
 * Architecture Phase: 04 of 16
 * Production Standard: GSRSK Canonical Identity Authority
 *
 * SUBSYSTEMS INCLUDED IN MODULE 1:
 *   04.01 Identity Schema, Domain Vocabularies, Unknown Semantics & Error Taxonomy
 *   04.02 Canonical Identity Serialization & Unicode-Aware Key Engine (Murmur64 Unsigned)
 *   04.03 Identity Basis Contracts & Field Mutability Classifiers
 *   04.04 Canonical Resource Type Identity Engine
 *   04.05 Geological Deposit Identity Engine
 *   04.06 Physical Origin & Genesis Anchor Engine
 *   04.07 Resource Occurrence Identity Engine
 *   04.08 Multi-Layer Ownership Identity & Stakeholder Engine
 *   04.09 Industrial Operator & Concession Tenancy Engine
 *   04.10 Hierarchical Spatial & Location Node Engine (Geospatial Bounds & Containment)
 *   04.11 Resource Variant, Grade & Metallurgical Assay Specifier
 * ============================================================================
 */

(function(global) {
    'use strict';

    // =========================================================================
    // 04.01: ENUMS, UNKNOWN SEMANTICS, RESOLUTION MATRIX & ERROR TAXONOMY
    // =========================================================================

    /**
     * Component and Overall Identity Resolution States
     */
    const IdentityResolutionStatus = Object.freeze({
        RESOLVED: 'RESOLVED',
        PARTIALLY_RESOLVED: 'PARTIALLY_RESOLVED',
        UNRESOLVED: 'UNRESOLVED',
        CONFLICTED: 'CONFLICTED',
        AMBIGUOUS: 'AMBIGUOUS',
        INVALID: 'INVALID'
    });

    /**
     * Strict Unknown State Taxonomy (Prevents ambiguous null/undefined handling)
     */
    const UnknownSemanticState = Object.freeze({
        DECLARED_UNKNOWN: 'DECLARED_UNKNOWN',       // Source explicitly stated it is unknown
        UNRESOLVED_REFERENCE: 'UNRESOLVED_REFERENCE', // Reference exists but target could not be bound
        MISSING_FROM_SOURCE: 'MISSING_FROM_SOURCE',   // Field entirely absent in source record
        NOT_APPLICABLE: 'NOT_APPLICABLE',           // Property does not apply to this entity class
        CONFLICTED_EVIDENCE: 'CONFLICTED_EVIDENCE'   // Multiple sources provided irreconcilable claims
    });

    /**
     * Epistemic Confidence Tier for Resource Occurrences
     */
    const ResourceOccurrenceTier = Object.freeze({
        TIER_A_PRIMARY_KNOWN: 'TIER_A_PRIMARY_KNOWN',
        TIER_B_SECONDARY_ASSOCIATED: 'TIER_B_SECONDARY_ASSOCIATED',
        TIER_C_INFERRED_OCCURRENCE: 'TIER_C_INFERRED_OCCURRENCE',
        TIER_D_UNVERIFIED_OCCURRENCE: 'TIER_D_UNVERIFIED_OCCURRENCE',
        TIER_E_TRACE_OCCURRENCE: 'TIER_E_TRACE_OCCURRENCE'
    });

    /**
     * Comprehensive Geological Classifications (16 Deposit Genesis Types)
     */
    const DepositTypeClassification = Object.freeze({
        MAGMATIC_SEGREGATION: 'MAGMATIC_SEGREGATION',
        HYDROTHERMAL_VEIN: 'HYDROTHERMAL_VEIN',
        PORPHYRY_SYSTEM: 'PORPHYRY_SYSTEM',
        SEDIMENTARY_BEDDED: 'SEDIMENTARY_BEDDED',
        BANDED_IRON_FORMATION: 'BANDED_IRON_FORMATION',
        PLACER_ALLUVIAL: 'PLACER_ALLUVIAL',
        EVAPORITE_BASIN: 'EVAPORITE_BASIN',
        METAMORPHIC_SKARN: 'METAMORPHIC_SKARN',
        REGOLITH_LATERITE: 'REGOLITH_LATERITE',
        HYDROCARBON_STRATIGRAPHIC: 'HYDROCARBON_STRATIGRAPHIC',
        HYDROCARBON_STRUCTURAL: 'HYDROCARBON_STRUCTURAL',
        UNCONVENTIONAL_SHALE: 'UNCONVENTIONAL_SHALE',
        GEOTHERMAL_BRINE: 'GEOTHERMAL_BRINE',
        POLYMETALLIC_NODULE_ABYSSAL: 'POLYMETALLIC_NODULE_ABYSSAL',
        SEAFLOOR_MASSIVE_SULFIDE: 'SEAFLOOR_MASSIVE_SULFIDE',
        UNKNOWN_GEOLOGICAL: 'UNKNOWN_GEOLOGICAL'
    });

    /**
     * Physical Genesis & Provenance Anchor Status
     */
    const OriginGenesisStatus = Object.freeze({
        NATURAL_CRUSTAL_IN_SITU: 'NATURAL_CRUSTAL_IN_SITU',
        DEEP_CONTINENTAL_BASEMENT: 'DEEP_CONTINENTAL_BASEMENT',
        OFFSHORE_CONTINENTAL_SHELF: 'OFFSHORE_CONTINENTAL_SHELF',
        ABYSSAL_OCEANIC_FLOOR: 'ABYSSAL_OCEANIC_FLOOR',
        SURFACE_ALLUVIAL_ELUVIAL: 'SURFACE_ALLUVIAL_ELUVIAL',
        TAILINGS_REPROCESSED: 'TAILINGS_REPROCESSED',
        SYNTHETIC_INDUSTRIAL_DERIVED: 'SYNTHETIC_INDUSTRIAL_DERIVED',
        SECONDARY_RECYCLED_STOCK: 'SECONDARY_RECYCLED_STOCK',
        UNKNOWN_ORIGIN: 'UNKNOWN_ORIGIN'
    });

    /**
     * Ownership & Concession Legal Control Models
     */
    const OwnershipControlModel = Object.freeze({
        SOVEREIGN_EXCLUSIVE_STATE: 'SOVEREIGN_EXCLUSIVE_STATE',
        STATE_OWNED_ENTERPRISE: 'STATE_OWNED_ENTERPRISE',
        MAJORITY_STATE_JOINT_VENTURE: 'MAJORITY_STATE_JOINT_VENTURE',
        PRIVATE_CONCESSION_LEASE: 'PRIVATE_CONCESSION_LEASE',
        PUBLIC_PRIVATE_CONSORTIUM: 'PUBLIC_PRIVATE_CONSORTIUM',
        COMMUNAL_ARTISANAL_CUSTOMARY: 'COMMUNAL_ARTISANAL_CUSTOMARY',
        INTERNATIONAL_COMMONS_REGIME: 'INTERNATIONAL_COMMONS_REGIME',
        UNREGISTERED_INFORMAL_CLAIM: 'UNREGISTERED_INFORMAL_CLAIM',
        DISPUTED_CONTESTED_SOVEREIGNTY: 'DISPUTED_CONTESTED_SOVEREIGNTY',
        UNKNOWN_CONTROL: 'UNKNOWN_CONTROL'
    });

    /**
     * Physical & Chemical Categories of Raw Materials
     */
    const ResourcePhysicalCategory = Object.freeze({
        FERROUS_METAL: 'FERROUS_METAL',
        NON_FERROUS_BASE_METAL: 'NON_FERROUS_BASE_METAL',
        PRECIOUS_METAL: 'PRECIOUS_METAL',
        CRITICAL_ENERGY_TRANSITION_MINERAL: 'CRITICAL_ENERGY_TRANSITION_MINERAL',
        RARE_EARTH_ELEMENT_LIGHT: 'RARE_EARTH_ELEMENT_LIGHT',
        RARE_EARTH_ELEMENT_HEAVY: 'RARE_EARTH_ELEMENT_HEAVY',
        FOSSIL_HYDROCARBON_LIQUID: 'FOSSIL_HYDROCARBON_LIQUID',
        FOSSIL_HYDROCARBON_GAS: 'FOSSIL_HYDROCARBON_GAS',
        SOLID_CARBONACEOUS_FUEL: 'SOLID_CARBONACEOUS_FUEL',
        NUCLEAR_FISSILE_FERTILE: 'NUCLEAR_FISSILE_FERTILE',
        INDUSTRIAL_MINERAL_CHEMICAL: 'INDUSTRIAL_MINERAL_CHEMICAL',
        CONSTRUCTION_AGGREGATE: 'CONSTRUCTION_AGGREGATE',
        AGRICULTURAL_NUTRIENT_MINERAL: 'AGRICULTURAL_NUTRIENT_MINERAL',
        UNKNOWN_PHYSICAL_CATEGORY: 'UNKNOWN_PHYSICAL_CATEGORY'
    });

    /**
     * Grade & Concentration Tiers
     */
    const GradeClassificationTier = Object.freeze({
        ULTRA_HIGH_PURITY: 'ULTRA_HIGH_PURITY',
        HIGH_GRADE_DIRECT_SHIPPING: 'HIGH_GRADE_DIRECT_SHIPPING',
        STANDARD_COMMERCIAL_GRADE: 'STANDARD_COMMERCIAL_GRADE',
        MEDIUM_GRADE_BENEFICIATION_REQ: 'MEDIUM_GRADE_BENEFICIATION_REQ',
        LOW_GRADE_MARGINAL: 'LOW_GRADE_MARGINAL',
        SUB_ECONOMIC_REFRACTORY: 'SUB_ECONOMIC_REFRACTORY',
        UNKNOWN_GRADE_TIER: 'UNKNOWN_GRADE_TIER'
    });

    /**
     * 14-Phase Resource Lifecycle Finite State Machine
     */
    const ResourceLifecyclePhase = Object.freeze({
        UNDISCOVERED_THEORETICAL: 'UNDISCOVERED_THEORETICAL',
        DISCOVERED_UNASSESSED: 'DISCOVERED_UNASSESSED',
        EXPLORATION_DELINEATED: 'EXPLORATION_DELINEATED',
        RESOURCE_ASSESSED: 'RESOURCE_ASSESSED',
        FEASIBILITY_PERMITTED: 'FEASIBILITY_PERMITTED',
        CAPEX_CONSTRUCTION: 'CAPEX_CONSTRUCTION',
        COMMISSIONED_OPERATIONAL: 'COMMISSIONED_OPERATIONAL',
        COMMERCIAL_EXTRACTION_ACTIVE: 'COMMERCIAL_EXTRACTION_ACTIVE',
        PRODUCTION_CURTAILED_SUSPENDED: 'PRODUCTION_CURTAILED_SUSPENDED',
        RESERVE_DEPLETING: 'RESERVE_DEPLETING',
        EXHAUSTED_DEPLETED: 'EXHAUSTED_DEPLETED',
        DECOMMISSIONED_RECLAIMED: 'DECOMMISSIONED_RECLAIMED',
        ABANDONED_UNREMEDIATED: 'ABANDONED_UNREMEDIATED',
        UNKNOWN_LIFECYCLE: 'UNKNOWN_LIFECYCLE'
    });

    /**
     * Candidate Ingestion Disposition Status
     */
    const CandidateDispositionState = Object.freeze({
        ACCEPTED_NEW: 'ACCEPTED_NEW',
        ACCEPTED_EQUIVALENT_MERGED: 'ACCEPTED_EQUIVALENT_MERGED',
        RESOLVED_TO_EXISTING: 'RESOLVED_TO_EXISTING',
        REJECTED_COLLISION: 'REJECTED_COLLISION',
        REJECTED_CORRUPT_SCHEMA: 'REJECTED_CORRUPT_SCHEMA',
        DEFERRED_UNRESOLVED: 'DEFERRED_UNRESOLVED',
        IGNORED_POLICY: 'IGNORED_POLICY'
    });

    /**
     * Severity Levels for Diagnostics
     */
    const CollisionSeverity = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        ERROR: 'ERROR',
        FATAL: 'FATAL'
    });

    /**
     * Systemic Identity Health Status
     */
    const IdentityHealthStatus = Object.freeze({
        HEALTHY: 'HEALTHY',
        HEALTHY_WITH_WARNINGS: 'HEALTHY_WITH_WARNINGS',
        DEGRADED: 'DEGRADED',
        CRITICAL_FAILURE: 'CRITICAL_FAILURE'
    });

    /**
     * Formal GSRSK Diagnostic Error Taxonomy
     */
    const ErrorTaxonomy = Object.freeze({
        ID_001_INVALID_IDENTITY: 'ID_001_INVALID_IDENTITY',
        ID_002_DUPLICATE_IDENTITY: 'ID_002_DUPLICATE_IDENTITY',
        ID_003_IDENTITY_COLLISION: 'ID_003_IDENTITY_COLLISION',
        ID_004_UNRESOLVED_REFERENCE: 'ID_004_UNRESOLVED_REFERENCE',
        ID_005_ALIAS_COLLISION: 'ID_005_ALIAS_COLLISION',
        ID_006_PROVENANCE_MISSING: 'ID_006_PROVENANCE_MISSING',
        ID_007_LINEAGE_ROOT_MISSING: 'ID_007_LINEAGE_ROOT_MISSING',
        ID_008_INVALID_RELATIONSHIP: 'ID_008_INVALID_RELATIONSHIP',
        ID_009_INVALID_LIFECYCLE_STATE: 'ID_009_INVALID_LIFECYCLE_STATE',
        ID_010_IMMUTABILITY_VIOLATION: 'ID_010_IMMUTABILITY_VIOLATION',
        ID_011_CIRCULAR_CONTAINMENT: 'ID_011_CIRCULAR_CONTAINMENT',
        ID_012_SELF_REFERENCE: 'ID_012_SELF_REFERENCE',
        ID_013_ORPHAN_ENTITY: 'ID_013_ORPHAN_ENTITY',
        ID_014_REFERENTIAL_CLOSURE_VIOLATION: 'ID_014_REFERENTIAL_CLOSURE_VIOLATION',
        ID_015_SILENT_DATA_LOSS: 'ID_015_SILENT_DATA_LOSS',
        ID_016_FIREWALL_BREACH: 'ID_016_FIREWALL_BREACH'
    });

    /**
     * Granular Component-Wise Resolution Tracker
     */
    class ComponentResolutionMatrix {
        constructor(initial = {}) {
            this.resourceType = initial.resourceType || IdentityResolutionStatus.UNRESOLVED;
            this.deposit = initial.deposit || IdentityResolutionStatus.UNRESOLVED;
            this.origin = initial.origin || IdentityResolutionStatus.UNRESOLVED;
            this.owner = initial.owner || IdentityResolutionStatus.UNRESOLVED;
            this.operator = initial.operator || IdentityResolutionStatus.UNRESOLVED;
            this.location = initial.location || IdentityResolutionStatus.UNRESOLVED;
            this.variant = initial.variant || IdentityResolutionStatus.UNRESOLVED;
            this.grade = initial.grade || IdentityResolutionStatus.UNRESOLVED;
        }

        computeOverallStatus() {
            const values = Object.values(this);
            if (values.every(v => v === IdentityResolutionStatus.RESOLVED)) {
                return IdentityResolutionStatus.RESOLVED;
            }
            if (values.some(v => v === IdentityResolutionStatus.CONFLICTED)) {
                return IdentityResolutionStatus.CONFLICTED;
            }
            if (values.some(v => v === IdentityResolutionStatus.INVALID)) {
                return IdentityResolutionStatus.INVALID;
            }
            if (values.some(v => v === IdentityResolutionStatus.RESOLVED || v === IdentityResolutionStatus.PARTIALLY_RESOLVED)) {
                return IdentityResolutionStatus.PARTIALLY_RESOLVED;
            }
            return IdentityResolutionStatus.UNRESOLVED;
        }

        toJSON() {
            return {
                overall: this.computeOverallStatus(),
                components: {
                    resourceType: this.resourceType,
                    deposit: this.deposit,
                    origin: this.origin,
                    owner: this.owner,
                    operator: this.operator,
                    location: this.location,
                    variant: this.variant,
                    grade: this.grade
                }
            };
        }
    }

    // =========================================================================
    // 04.02: CANONICAL SERIALIZATION & UNICODE-AWARE KEY ENGINE
    // =========================================================================

    class CanonicalIdentitySerializer {
        /**
         * Deterministically serializes values with fixed casing, sorted keys, and strict escaping.
         */
        static serializeValue(val) {
            if (val === null || val === undefined) return '__NULL__';
            if (typeof val === 'boolean') return val ? '__TRUE__' : '__FALSE__';
            if (typeof val === 'number') {
                if (!Number.isFinite(val)) return '__NON_FINITE_NUM__';
                return Number(val.toFixed(8)).toString(); // Normalizes floating point representations
            }
            if (typeof val === 'string') {
                return DeterministicKeyEngine.normalizeToken(val);
            }
            if (Array.isArray(val)) {
                const serializedItems = val.map(item => this.serializeValue(item));
                return `[${serializedItems.sort().join(',')}]`; // Always canonical sorted array
            }
            if (typeof val === 'object') {
                const keys = Object.keys(val).sort();
                const pairs = keys.map(k => `${this.serializeValue(k)}:${this.serializeValue(val[k])}`);
                return `{${pairs.join(';')}}`;
            }
            return String(val);
        }

        static serializeIdentityPayload(orderedFieldPairs) {
            return orderedFieldPairs
                .map(([field, val]) => `${field}=${this.serializeValue(val)}`)
                .join('|');
        }
    }

    class DeterministicKeyEngine {
        /**
         * 64-bit MurmurHash3-inspired string hash with unsigned overflow protection.
         */
        static compute64BitHash(inputData) {
            const str = typeof inputData === 'string' ? inputData : JSON.stringify(inputData);
            let h1 = (0xdeadbeef ^ str.length) >>> 0;
            let h2 = (0x41c6ce57 ^ str.length) >>> 0;

            for (let i = 0; i < str.length; i++) {
                const ch = str.charCodeAt(i);
                h1 = (Math.imul(h1 ^ ch, 2654435761) >>> 0);
                h2 = (Math.imul(h2 ^ ch, 1597334677) >>> 0);
            }

            h1 = ((Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)) >>> 0);
            h2 = ((Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)) >>> 0);

            const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
            const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
            return (hex1 + hex2).toLowerCase();
        }

        /**
         * Unicode-Aware Token Normalizer.
         * Retains Unicode letters, numbers, and underscores across all world scripts.
         */
        static normalizeToken(str) {
            if (!str || typeof str !== 'string') return 'UNKNOWN';
            const normalized = str
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '') // Strip combining diacritics
                .toLowerCase()
                .trim()
                .replace(/[\s\-_/.\\]+/g, '_')
                .replace(/[^\p{L}\p{N}_]/gu, '') // Retain all international letters and digits
                .replace(/^_+|_+$/g, '');

            return normalized.length > 0 ? normalized : 'UNKNOWN';
        }

        static generateResourceTypeKey(resourceTypeId) {
            const norm = this.normalizeToken(resourceTypeId).toUpperCase();
            return `RES_TYPE:${norm}`;
        }

        static generateDepositKey(hostCountryIso3, depositName, secondaryDisambiguator = '') {
            const normCountry = this.normalizeToken(hostCountryIso3).toUpperCase();
            const normDeposit = this.normalizeToken(depositName);
            const payload = CanonicalIdentitySerializer.serializeIdentityPayload([
                ['country', normCountry],
                ['deposit', normDeposit],
                ['disambig', secondaryDisambiguator]
            ]);
            const hash = this.compute64BitHash(payload).substring(0, 10);
            return `DEP:${normCountry}:${normDeposit.substring(0, 24)}_${hash}`;
        }

        static generateOccurrenceKey(resourceTypeId, depositKey, tierOrQualifier = 'PRIMARY') {
            const normRes = this.normalizeToken(resourceTypeId).toUpperCase();
            const payload = CanonicalIdentitySerializer.serializeIdentityPayload([
                ['resourceType', normRes],
                ['depositKey', depositKey],
                ['qualifier', tierOrQualifier]
            ]);
            const hash = this.compute64BitHash(payload).substring(0, 10);
            return `OCC:${normRes}:${hash}`;
        }

        static generateOriginKey(depositKey, genesisStatus) {
            const payload = CanonicalIdentitySerializer.serializeIdentityPayload([
                ['depositKey', depositKey],
                ['genesis', genesisStatus]
            ]);
            const hash = this.compute64BitHash(payload).substring(0, 10);
            return `ORG:${hash}`;
        }

        static generateOwnershipKey(legalOwnerId, jurisdictionIso3, controlModel) {
            const normOwner = this.normalizeToken(legalOwnerId).toUpperCase();
            const normJuris = this.normalizeToken(jurisdictionIso3).toUpperCase();
            const payload = CanonicalIdentitySerializer.serializeIdentityPayload([
                ['owner', normOwner],
                ['jurisdiction', normJuris],
                ['model', controlModel]
            ]);
            const hash = this.compute64BitHash(payload).substring(0, 10);
            return `OWN:${normOwner.substring(0, 20)}_${hash}`;
        }

        static generateOperatorKey(operatorCompanyId, operatingSiteOrCountry) {
            const normOpr = this.normalizeToken(operatorCompanyId).toUpperCase();
            const normSite = this.normalizeToken(operatingSiteOrCountry).toUpperCase();
            const payload = CanonicalIdentitySerializer.serializeIdentityPayload([
                ['operator', normOpr],
                ['site', normSite]
            ]);
            const hash = this.compute64BitHash(payload).substring(0, 10);
            return `OPR:${normOpr.substring(0, 20)}_${hash}`;
        }

        static generateLocationKey(countryIso3, adminDivision, siteName, lat = null, lng = null) {
            const normCountry = this.normalizeToken(countryIso3).toUpperCase();
            const normAdmin = this.normalizeToken(adminDivision);
            const normSite = this.normalizeToken(siteName);
            const payload = CanonicalIdentitySerializer.serializeIdentityPayload([
                ['country', normCountry],
                ['admin', normAdmin],
                ['site', normSite],
                ['lat', lat],
                ['lng', lng]
            ]);
            const hash = this.compute64BitHash(payload).substring(0, 10);
            return `LOC:${normCountry}:${hash}`;
        }

        static generateVariantGradeSpecKey(resourceTypeId, variantName, gradeTier) {
            const normRes = this.normalizeToken(resourceTypeId).toUpperCase();
            const payload = CanonicalIdentitySerializer.serializeIdentityPayload([
                ['resourceType', normRes],
                ['variant', variantName],
                ['grade', gradeTier]
            ]);
            const hash = this.compute64BitHash(payload).substring(0, 10);
            return `SPEC:${normRes}_${hash}`;
        }

        static generateLineageRootKey(occurrenceKey, originKey) {
            const payload = CanonicalIdentitySerializer.serializeIdentityPayload([
                ['occurrenceKey', occurrenceKey],
                ['originKey', originKey]
            ]);
            const hash = this.compute64BitHash(payload).substring(0, 12);
            return `LIN_ROOT:${hash}`;
        }

        static generateRelationshipKey(relType, subjectKey, objectKey) {
            const payload = CanonicalIdentitySerializer.serializeIdentityPayload([
                ['type', relType],
                ['subject', subjectKey],
                ['object', objectKey]
            ]);
            const hash = this.compute64BitHash(payload).substring(0, 10);
            return `REL:${relType}:${hash}`;
        }
    }

    // =========================================================================
    // 04.03: IDENTITY BASIS CONTRACTS & FIELD MUTABILITY CLASSIFIERS
    // =========================================================================

    class IdentityBasisContract {
        static get OCCURRENCE_BASIS() {
            return Object.freeze({
                identityDefining: ['resourceTypeId', 'depositKey', 'originKey', 'occurrenceTier'],
                relationships: ['ownerKey', 'operatorKey', 'locationNodeKey'],
                mutableState: ['lifecyclePhase', 'resolutionMatrix'],
                metadata: ['provenance', 'confidenceScore']
            });
        }

        static get DEPOSIT_BASIS() {
            return Object.freeze({
                identityDefining: ['hostCountryIso3', 'depositRawName', 'geologicalType'],
                relationships: ['locationNodeKey', 'containedOccurrenceKeys', 'associatedInfrastructureKeys'],
                mutableState: ['resolutionStatus'],
                metadata: ['provenance', 'depthProfileMinMeters', 'depthProfileMaxMeters', 'isOffshore']
            });
        }

        static get ORIGIN_BASIS() {
            return Object.freeze({
                identityDefining: ['depositKey', 'genesisStatus', 'hostCountryIso3'],
                relationships: [],
                mutableState: [],
                metadata: ['provenance', 'geologicalAgeEonEra', 'crustalTectonicTerrane', 'seismicZoneRiskIndex']
            });
        }

        static isIdentityDefiningField(entityType, fieldName) {
            const basis = this[`${entityType.toUpperCase()}_BASIS`];
            return basis ? basis.identityDefining.includes(fieldName) : false;
        }
    }

    // =========================================================================
    // 04.04: CANONICAL RESOURCE TYPE IDENTITY ENGINE
    // =========================================================================

    class ResourceTypeIdentity {
        constructor(params = {}) {
            const rawId = params.resourceTypeId || params.resourceId || params.rawResourceId;
            if (!rawId) {
                throw new Error('[ResourceTypeIdentity Violation]: resourceTypeId is strictly required.');
            }

            // IMMUTABLE IDENTITY CORE
            this.resourceTypeId = DeterministicKeyEngine.normalizeToken(rawId).toUpperCase();
            this.identityKey = params.identityKey || DeterministicKeyEngine.generateResourceTypeKey(this.resourceTypeId);
            this.canonicalName = params.canonicalName || params.name || this.resourceTypeId;
            this.standardSymbol = params.standardSymbol || params.symbol || this.canonicalName;
            
            // STRICT DIMENSIONAL CONTRACT (Zero Unit Guessing)
            this.declaredDimension = params.declaredDimension || params.dimension || 'UNKNOWN';
            this.declaredStandardUnit = params.declaredStandardUnit || params.unit || 'UNKNOWN_UNIT';
            
            this.physicalCategory = params.physicalCategory || params.category || ResourcePhysicalCategory.UNKNOWN_PHYSICAL_CATEGORY;
            this.casRegistryNumber = params.casRegistryNumber || null;
            this.unHarmonizedSystemCode = params.unHarmonizedSystemCode || null;
            this.criticalityClassification = params.criticalityClassification || params.strategicImportance || 'UNKNOWN';
            this.substitutabilityIndex = typeof params.substitutabilityIndex === 'number' ? params.substitutabilityIndex : null;
            this.recyclabilityPotentialTier = params.recyclabilityPotentialTier || 'UNKNOWN';
            
            const rawAliases = Array.isArray(params.aliases) ? params.aliases : [];
            this.aliases = Array.from(new Set([
                this.resourceTypeId.toLowerCase(),
                this.canonicalName.toLowerCase(),
                ...rawAliases.map(a => DeterministicKeyEngine.normalizeToken(a))
            ])).sort();
            
            this.provenance = params.provenance || { sourceSubsystem: 'WORLD_KNOWLEDGE_COMPILER', timestamp: 0 };
            this.isCanonical = true;
        }

        matchesIdentifier(candidateStr) {
            if (!candidateStr || typeof candidateStr !== 'string') return false;
            const norm = DeterministicKeyEngine.normalizeToken(candidateStr);
            return this.resourceTypeId.toLowerCase() === norm ||
                   this.standardSymbol.toLowerCase() === norm ||
                   this.aliases.includes(norm);
        }

        clone() {
            return new ResourceTypeIdentity({
                identityKey: this.identityKey,
                resourceTypeId: this.resourceTypeId,
                canonicalName: this.canonicalName,
                standardSymbol: this.standardSymbol,
                declaredDimension: this.declaredDimension,
                declaredStandardUnit: this.declaredStandardUnit,
                physicalCategory: this.physicalCategory,
                casRegistryNumber: this.casRegistryNumber,
                unHarmonizedSystemCode: this.unHarmonizedSystemCode,
                criticalityClassification: this.criticalityClassification,
                substitutabilityIndex: this.substitutabilityIndex,
                recyclabilityPotentialTier: this.recyclabilityPotentialTier,
                aliases: [...this.aliases],
                provenance: JSON.parse(JSON.stringify(this.provenance))
            });
        }

        toJSON() {
            return {
                identityKey: this.identityKey,
                resourceTypeId: this.resourceTypeId,
                canonicalName: this.canonicalName,
                standardSymbol: this.standardSymbol,
                declaredDimension: this.declaredDimension,
                declaredStandardUnit: this.declaredStandardUnit,
                physicalCategory: this.physicalCategory,
                casRegistryNumber: this.casRegistryNumber,
                unHarmonizedSystemCode: this.unHarmonizedSystemCode,
                criticalityClassification: this.criticalityClassification,
                substitutabilityIndex: this.substitutabilityIndex,
                recyclabilityPotentialTier: this.recyclabilityPotentialTier,
                aliases: this.aliases,
                provenance: this.provenance
            };
        }
    }

    // =========================================================================
    // 04.05: GEOLOGICAL DEPOSIT IDENTITY ENGINE
    // =========================================================================

    class GeologicalDepositIdentity {
        constructor(params = {}) {
            this.hostCountryIso3 = DeterministicKeyEngine.normalizeToken(params.hostCountryIso3 || params.hostCountryId || 'GLOBAL').toUpperCase();
            this.depositRawName = params.depositRawName || params.canonicalName || 'UNNAMED_GEOLOGICAL_DEPOSIT';
            this.geologicalType = params.geologicalType || DepositTypeClassification.UNKNOWN_GEOLOGICAL;

            // IMMUTABLE IDENTITY CORE
            this.depositKey = params.depositKey || DeterministicKeyEngine.generateDepositKey(
                this.hostCountryIso3, 
                this.depositRawName, 
                params.disambiguator || ''
            );

            this.canonicalName = params.canonicalName || this.depositRawName;
            
            // RELATIONSHIPS
            this.locationNodeKey = params.locationNodeKey || params.locationIdentityKey || null;
            this.containedOccurrenceKeys = new Set(Array.isArray(params.containedOccurrenceKeys) ? params.containedOccurrenceKeys : []);
            this.associatedInfrastructureKeys = new Set(Array.isArray(params.associatedInfrastructureKeys) ? params.associatedInfrastructureKeys : []);
            
            // DESCRIPTIVE METADATA
            this.depthProfileMinMeters = typeof params.depthProfileMinMeters === 'number' ? params.depthProfileMinMeters : null;
            this.depthProfileMaxMeters = typeof params.depthProfileMaxMeters === 'number' ? params.depthProfileMaxMeters : null;
            this.isOffshore = Boolean(params.isOffshore);
            this.bathymetryDepthMeters = typeof params.bathymetryDepthMeters === 'number' ? params.bathymetryDepthMeters : null;
            
            // RESOLUTION STATE
            this.resolutionStatus = params.resolutionStatus || IdentityResolutionStatus.UNRESOLVED;
            this.provenance = params.provenance || { sourceSubsystem: 'GEOLOGICAL_CADASTRAL_REGISTRY', timestamp: 0 };
        }

        addOccurrence(occurrenceKey) {
            if (occurrenceKey && typeof occurrenceKey === 'string') {
                this.containedOccurrenceKeys.add(occurrenceKey);
            }
        }

        addInfrastructureRef(infraKey) {
            if (infraKey && typeof infraKey === 'string') {
                this.associatedInfrastructureKeys.add(infraKey);
            }
        }

        bindLocation(locationKey) {
            this.locationNodeKey = locationKey;
        }

        clone() {
            return new GeologicalDepositIdentity({
                depositKey: this.depositKey,
                hostCountryIso3: this.hostCountryIso3,
                depositRawName: this.depositRawName,
                canonicalName: this.canonicalName,
                geologicalType: this.geologicalType,
                locationNodeKey: this.locationNodeKey,
                depthProfileMinMeters: this.depthProfileMinMeters,
                depthProfileMaxMeters: this.depthProfileMaxMeters,
                isOffshore: this.isOffshore,
                bathymetryDepthMeters: this.bathymetryDepthMeters,
                containedOccurrenceKeys: Array.from(this.containedOccurrenceKeys),
                associatedInfrastructureKeys: Array.from(this.associatedInfrastructureKeys),
                resolutionStatus: this.resolutionStatus,
                provenance: JSON.parse(JSON.stringify(this.provenance))
            });
        }

        toJSON() {
            return {
                depositKey: this.depositKey,
                hostCountryIso3: this.hostCountryIso3,
                depositRawName: this.depositRawName,
                canonicalName: this.canonicalName,
                geologicalType: this.geologicalType,
                locationNodeKey: this.locationNodeKey,
                depthProfileMinMeters: this.depthProfileMinMeters,
                depthProfileMaxMeters: this.depthProfileMaxMeters,
                isOffshore: this.isOffshore,
                bathymetryDepthMeters: this.bathymetryDepthMeters,
                containedOccurrenceKeys: Array.from(this.containedOccurrenceKeys).sort(),
                associatedInfrastructureKeys: Array.from(this.associatedInfrastructureKeys).sort(),
                resolutionStatus: this.resolutionStatus,
                provenance: this.provenance
            };
        }
    }

    // =========================================================================
    // 04.06: PHYSICAL ORIGIN & GENESIS ANCHOR ENGINE
    // =========================================================================

    class ResourceOriginIdentity {
        constructor(params = {}) {
            if (!params.depositKey) {
                throw new Error('[ResourceOriginIdentity Violation]: depositKey is strictly required.');
            }

            this.depositKey = params.depositKey;
            this.genesisStatus = params.genesisStatus || OriginGenesisStatus.NATURAL_CRUSTAL_IN_SITU;
            this.hostCountryIso3 = DeterministicKeyEngine.normalizeToken(params.hostCountryIso3 || params.hostCountryId || 'GLOBAL').toUpperCase();

            // IMMUTABLE IDENTITY CORE
            this.originKey = params.originKey || DeterministicKeyEngine.generateOriginKey(this.depositKey, this.genesisStatus);
            
            // GEOLOGICAL CONTEXT METADATA
            this.geologicalAgeEonEra = params.geologicalAgeEonEra || 'UNKNOWN_AGE';
            this.crustalTectonicTerrane = params.crustalTectonicTerrane || 'UNKNOWN_TERRANE';
            this.environmentalBiomeContext = params.environmentalBiomeContext || 'UNKNOWN_BIOME';
            this.seismicZoneRiskIndex = typeof params.seismicZoneRiskIndex === 'number' ? params.seismicZoneRiskIndex : null;
            this.watershedBasinIdentifier = params.watershedBasinIdentifier || null;

            this.provenanceAnchorHash = DeterministicKeyEngine.compute64BitHash(JSON.stringify({
                depositKey: this.depositKey,
                genesisStatus: this.genesisStatus,
                hostCountryIso3: this.hostCountryIso3,
                terrane: this.crustalTectonicTerrane
            }));

            this.provenance = params.provenance || { sourceSubsystem: 'ORIGIN_GENESIS_RESOLVER', timestamp: 0 };
        }

        clone() {
            return new ResourceOriginIdentity({
                originKey: this.originKey,
                depositKey: this.depositKey,
                genesisStatus: this.genesisStatus,
                hostCountryIso3: this.hostCountryIso3,
                geologicalAgeEonEra: this.geologicalAgeEonEra,
                crustalTectonicTerrane: this.crustalTectonicTerrane,
                environmentalBiomeContext: this.environmentalBiomeContext,
                seismicZoneRiskIndex: this.seismicZoneRiskIndex,
                watershedBasinIdentifier: this.watershedBasinIdentifier,
                provenance: JSON.parse(JSON.stringify(this.provenance))
            });
        }

        toJSON() {
            return {
                originKey: this.originKey,
                depositKey: this.depositKey,
                genesisStatus: this.genesisStatus,
                hostCountryIso3: this.hostCountryIso3,
                geologicalAgeEonEra: this.geologicalAgeEonEra,
                crustalTectonicTerrane: this.crustalTectonicTerrane,
                environmentalBiomeContext: this.environmentalBiomeContext,
                seismicZoneRiskIndex: this.seismicZoneRiskIndex,
                watershedBasinIdentifier: this.watershedBasinIdentifier,
                provenanceAnchorHash: this.provenanceAnchorHash,
                provenance: this.provenance
            };
        }
    }

    // =========================================================================
    // 04.07: RESOURCE OCCURRENCE IDENTITY ENGINE
    // =========================================================================

    class ResourceOccurrenceIdentity {
        constructor(params = {}) {
            if (!params.resourceTypeId || !params.depositKey) {
                throw new Error('[ResourceOccurrenceIdentity Violation]: resourceTypeId and depositKey are mandatory.');
            }

            // IMMUTABLE IDENTITY CORE
            this.resourceTypeId = DeterministicKeyEngine.normalizeToken(params.resourceTypeId).toUpperCase();
            this.resourceTypeKey = DeterministicKeyEngine.generateResourceTypeKey(this.resourceTypeId);
            this.depositKey = params.depositKey;
            this.occurrenceTier = params.occurrenceTier || ResourceOccurrenceTier.TIER_D_UNVERIFIED_OCCURRENCE;
            this.originKey = params.originKey || null;

            this.occurrenceKey = params.occurrenceKey || DeterministicKeyEngine.generateOccurrenceKey(
                this.resourceTypeId, 
                this.depositKey, 
                params.qualifier || this.occurrenceTier
            );

            // SPECIFICATION & LINEAGE BINDINGS
            this.variantSpecKey = params.variantSpecKey || null;
            this.gradeSpecKey = params.gradeSpecKey || null;
            this.lineageRootKey = params.lineageRootKey || null;

            // RELATIONSHIPS
            this.ownerKey = params.ownerKey || null;
            this.operatorKey = params.operatorKey || null;
            this.locationNodeKey = params.locationNodeKey || null;
            
            // CO-PRODUCT ASSOCIATIONS
            this.associatedCoProducts = Array.isArray(params.associatedCoProducts) 
                ? params.associatedCoProducts.map(c => DeterministicKeyEngine.normalizeToken(c).toUpperCase()).sort()
                : [];
            this.associatedByProducts = Array.isArray(params.associatedByProducts)
                ? params.associatedByProducts.map(b => DeterministicKeyEngine.normalizeToken(b).toUpperCase()).sort()
                : [];

            // STATE & FORENSIC VIEWS
            this.isPrimaryEndowment = Boolean(params.isPrimaryEndowment);
            this.isDeepCrustalTarget = Boolean(params.isDeepCrustalTarget);
            this.isOffshoreSeabedTarget = Boolean(params.isOffshoreSeabedTarget);
            this.confidenceScore = typeof params.confidenceScore === 'number' ? params.confidenceScore : 0.5;
            
            this.resolutionMatrix = params.resolutionMatrix instanceof ComponentResolutionMatrix 
                ? params.resolutionMatrix 
                : new ComponentResolutionMatrix(params.resolutionMatrix || {
                    resourceType: IdentityResolutionStatus.RESOLVED,
                    deposit: IdentityResolutionStatus.RESOLVED,
                    origin: this.originKey ? IdentityResolutionStatus.RESOLVED : IdentityResolutionStatus.UNRESOLVED
                });

            this.provenance = params.provenance || { sourceSubsystem: 'OCCURRENCE_RESOLVER', timestamp: 0 };
        }

        bindLineageRoot(rootKey) {
            this.lineageRootKey = rootKey;
        }

        bindOrigin(originKey) {
            this.originKey = originKey;
            this.resolutionMatrix.origin = IdentityResolutionStatus.RESOLVED;
        }

        bindVariantSpec(specKey) {
            this.variantSpecKey = specKey;
            this.resolutionMatrix.variant = IdentityResolutionStatus.RESOLVED;
        }

        bindOwner(ownerKey) {
            this.ownerKey = ownerKey;
            this.resolutionMatrix.owner = IdentityResolutionStatus.RESOLVED;
        }

        bindOperator(operatorKey) {
            this.operatorKey = operatorKey;
            this.resolutionMatrix.operator = IdentityResolutionStatus.RESOLVED;
        }

        bindLocation(locationKey) {
            this.locationNodeKey = locationKey;
            this.resolutionMatrix.location = IdentityResolutionStatus.RESOLVED;
        }

        clone() {
            return new ResourceOccurrenceIdentity({
                occurrenceKey: this.occurrenceKey,
                resourceTypeId: this.resourceTypeId,
                depositKey: this.depositKey,
                originKey: this.originKey,
                occurrenceTier: this.occurrenceTier,
                variantSpecKey: this.variantSpecKey,
                gradeSpecKey: this.gradeSpecKey,
                lineageRootKey: this.lineageRootKey,
                ownerKey: this.ownerKey,
                operatorKey: this.operatorKey,
                locationNodeKey: this.locationNodeKey,
                associatedCoProducts: [...this.associatedCoProducts],
                associatedByProducts: [...this.associatedByProducts],
                isPrimaryEndowment: this.isPrimaryEndowment,
                isDeepCrustalTarget: this.isDeepCrustalTarget,
                isOffshoreSeabedTarget: this.isOffshoreSeabedTarget,
                confidenceScore: this.confidenceScore,
                resolutionMatrix: this.resolutionMatrix.toJSON(),
                provenance: JSON.parse(JSON.stringify(this.provenance))
            });
        }

        toJSON() {
            return {
                occurrenceKey: this.occurrenceKey,
                resourceTypeKey: this.resourceTypeKey,
                resourceTypeId: this.resourceTypeId,
                depositKey: this.depositKey,
                originKey: this.originKey,
                occurrenceTier: this.occurrenceTier,
                variantSpecKey: this.variantSpecKey,
                gradeSpecKey: this.gradeSpecKey,
                lineageRootKey: this.lineageRootKey,
                ownerKey: this.ownerKey,
                operatorKey: this.operatorKey,
                locationNodeKey: this.locationNodeKey,
                associatedCoProducts: this.associatedCoProducts,
                associatedByProducts: this.associatedByProducts,
                isPrimaryEndowment: this.isPrimaryEndowment,
                isDeepCrustalTarget: this.isDeepCrustalTarget,
                isOffshoreSeabedTarget: this.isOffshoreSeabedTarget,
                confidenceScore: this.confidenceScore,
                resolution: this.resolutionMatrix.toJSON(),
                provenance: this.provenance
            };
        }
    }

    // =========================================================================
    // 04.08: MULTI-LAYER OWNERSHIP IDENTITY & STAKEHOLDER ENGINE
    // =========================================================================

    class OwnershipStakeHolder {
        constructor(params = {}) {
            this.holderEntityId = DeterministicKeyEngine.normalizeToken(params.holderEntityId || 'UNKNOWN_HOLDER').toUpperCase();
            this.holderCanonicalName = params.holderCanonicalName || this.holderEntityId;
            this.equityPercentage = typeof params.equityPercentage === 'number' ? Math.max(0, Math.min(100, params.equityPercentage)) : 100.0;
            this.isStateEntity = Boolean(params.isStateEntity);
            this.isForeignEntity = Boolean(params.isForeignEntity);
            this.domicileCountryIso3 = DeterministicKeyEngine.normalizeToken(params.domicileCountryIso3 || 'GLOBAL').toUpperCase();
        }

        toJSON() {
            return {
                holderEntityId: this.holderEntityId,
                holderCanonicalName: this.holderCanonicalName,
                equityPercentage: this.equityPercentage,
                isStateEntity: this.isStateEntity,
                isForeignEntity: this.isForeignEntity,
                domicileCountryIso3: this.domicileCountryIso3
            };
        }
    }

    class OwnershipIdentity {
        constructor(params = {}) {
            this.legalOwnerId = DeterministicKeyEngine.normalizeToken(params.legalOwnerId || 'UNKNOWN_LEGAL_OWNER').toUpperCase();
            this.sovereignJurisdictionIso3 = DeterministicKeyEngine.normalizeToken(params.sovereignJurisdictionIso3 || params.jurisdiction || 'GLOBAL').toUpperCase();
            this.controlModel = params.controlModel || OwnershipControlModel.UNKNOWN_CONTROL;
            
            // IMMUTABLE IDENTITY CORE
            this.ownershipKey = params.ownershipKey || DeterministicKeyEngine.generateOwnershipKey(
                this.legalOwnerId, 
                this.sovereignJurisdictionIso3, 
                this.controlModel
            );

            this.stateParticipationRatio = typeof params.stateParticipationRatio === 'number' 
                ? Math.max(0, Math.min(1, params.stateParticipationRatio)) 
                : (this.controlModel === OwnershipControlModel.SOVEREIGN_EXCLUSIVE_STATE ? 1.0 : 0.0);

            this.equityHolders = Array.isArray(params.equityHolders) 
                ? params.equityHolders.map(h => h instanceof OwnershipStakeHolder ? h : new OwnershipStakeHolder(h))
                : [new OwnershipStakeHolder({ holderEntityId: this.legalOwnerId, equityPercentage: 100.0 })];

            this.concessionAgreementExpiryTick = typeof params.concessionAgreementExpiryTick === 'number' ? params.concessionAgreementExpiryTick : null;
            this.isDisputedSovereignty = Boolean(params.isDisputedSovereignty);
            this.disputeContextSummary = params.disputeContextSummary || null;
            this.provenance = params.provenance || { sourceSubsystem: 'MINISTRY_OF_MINES_CADASTRAL', timestamp: 0 };
        }

        clone() {
            return new OwnershipIdentity({
                ownershipKey: this.ownershipKey,
                legalOwnerId: this.legalOwnerId,
                sovereignJurisdictionIso3: this.sovereignJurisdictionIso3,
                controlModel: this.controlModel,
                stateParticipationRatio: this.stateParticipationRatio,
                equityHolders: this.equityHolders.map(h => new OwnershipStakeHolder(h)),
                concessionAgreementExpiryTick: this.concessionAgreementExpiryTick,
                isDisputedSovereignty: this.isDisputedSovereignty,
                disputeContextSummary: this.disputeContextSummary,
                provenance: JSON.parse(JSON.stringify(this.provenance))
            });
        }

        toJSON() {
            return {
                ownershipKey: this.ownershipKey,
                legalOwnerId: this.legalOwnerId,
                sovereignJurisdictionIso3: this.sovereignJurisdictionIso3,
                controlModel: this.controlModel,
                stateParticipationRatio: this.stateParticipationRatio,
                equityHolders: this.equityHolders.map(h => h.toJSON()),
                concessionAgreementExpiryTick: this.concessionAgreementExpiryTick,
                isDisputedSovereignty: this.isDisputedSovereignty,
                disputeContextSummary: this.disputeContextSummary,
                provenance: this.provenance
            };
        }
    }

    // =========================================================================
    // 04.09: INDUSTRIAL OPERATOR & CONCESSION TENANCY ENGINE
    // =========================================================================

    class OperatorIdentity {
        constructor(params = {}) {
            this.operatingCompanyId = DeterministicKeyEngine.normalizeToken(params.operatingCompanyId || 'UNKNOWN_OPERATOR').toUpperCase();
            this.operatingSiteOrCountry = DeterministicKeyEngine.normalizeToken(params.operatingSiteOrCountry || params.operatingCountry || 'GLOBAL').toUpperCase();
            
            // IMMUTABLE IDENTITY CORE
            this.operatorKey = params.operatorKey || DeterministicKeyEngine.generateOperatorKey(
                this.operatingCompanyId, 
                this.operatingSiteOrCountry
            );

            this.canonicalOperatorName = params.canonicalOperatorName || this.operatingCompanyId;
            this.domicileCountryIso3 = DeterministicKeyEngine.normalizeToken(params.domicileCountryIso3 || 'GLOBAL').toUpperCase();
            this.operationalScope = params.operationalScope || 'SURFACE_AND_UNDERGROUND_MINING';
            this.miningLeaseLicenseCode = params.miningLeaseLicenseCode || 'UNVERIFIED_LICENSE_CODE';
            this.environmentalPermitStatus = params.environmentalPermitStatus || 'UNKNOWN';
            this.lastSafetyComplianceAuditTick = typeof params.lastSafetyComplianceAuditTick === 'number' ? params.lastSafetyComplianceAuditTick : null;
            this.provenance = params.provenance || { sourceSubsystem: 'INDUSTRIAL_OPERATOR_CADASTRAL', timestamp: 0 };
        }

        clone() {
            return new OperatorIdentity({
                operatorKey: this.operatorKey,
                operatingCompanyId: this.operatingCompanyId,
                operatingSiteOrCountry: this.operatingSiteOrCountry,
                canonicalOperatorName: this.canonicalOperatorName,
                domicileCountryIso3: this.domicileCountryIso3,
                operationalScope: this.operationalScope,
                miningLeaseLicenseCode: this.miningLeaseLicenseCode,
                environmentalPermitStatus: this.environmentalPermitStatus,
                lastSafetyComplianceAuditTick: this.lastSafetyComplianceAuditTick,
                provenance: JSON.parse(JSON.stringify(this.provenance))
            });
        }

        toJSON() {
            return {
                operatorKey: this.operatorKey,
                operatingCompanyId: this.operatingCompanyId,
                operatingSiteOrCountry: this.operatingSiteOrCountry,
                canonicalOperatorName: this.canonicalOperatorName,
                domicileCountryIso3: this.domicileCountryIso3,
                operationalScope: this.operationalScope,
                miningLeaseLicenseCode: this.miningLeaseLicenseCode,
                environmentalPermitStatus: this.environmentalPermitStatus,
                lastSafetyComplianceAuditTick: this.lastSafetyComplianceAuditTick,
                provenance: this.provenance
            };
        }
    }

    // =========================================================================
    // 04.10: HIERARCHICAL SPATIAL & LOCATION NODE ENGINE
    // =========================================================================

    class HierarchicalLocationIdentity {
        constructor(params = {}) {
            this.countryIso3 = DeterministicKeyEngine.normalizeToken(params.countryIso3 || params.countryId || 'GLOBAL').toUpperCase();
            this.worldContinent = params.worldContinent || 'GLOBAL';
            this.worldMacroRegion = params.worldMacroRegion || 'GLOBAL';
            this.adminStateProvince = params.adminStateProvince || 'UNSPECIFIED_PROVINCE';
            this.adminCountyDistrict = params.adminCountyDistrict || 'UNSPECIFIED_DISTRICT';
            this.siteSpecificLocality = params.siteSpecificLocality || params.siteName || 'UNSPECIFIED_LOCALITY';

            this.coordinates = {
                lat: (typeof params.lat === 'number' && params.lat >= -90 && params.lat <= 90) ? params.lat : null,
                lng: (typeof params.lng === 'number' && params.lng >= -180 && params.lng <= 180) ? params.lng : null
            };

            // IMMUTABLE IDENTITY CORE
            this.locationNodeKey = params.locationNodeKey || params.locationIdentityKey || DeterministicKeyEngine.generateLocationKey(
                this.countryIso3, 
                this.adminStateProvince, 
                this.siteSpecificLocality,
                this.coordinates.lat,
                this.coordinates.lng
            );

            this.elevationMetersAboveSea = typeof params.elevationMetersAboveSea === 'number' ? params.elevationMetersAboveSea : null;
            this.spatialPrecisionRadiusKm = typeof params.spatialPrecisionRadiusKm === 'number' ? params.spatialPrecisionRadiusKm : null;
            this.cadastralParcelBoundary = Array.isArray(params.cadastralParcelBoundary) ? [...params.cadastralParcelBoundary] : [];
            this.parentLocationNodeKey = params.parentLocationNodeKey || null; // For hierarchical containment
            this.provenance = params.provenance || { sourceSubsystem: 'GIS_GEODETIC_SURVEY', timestamp: 0 };
        }

        hasPointCoordinates() {
            return this.coordinates.lat !== null && this.coordinates.lng !== null;
        }

        calculateBoundingBox() {
            if (!this.cadastralParcelBoundary || this.cadastralParcelBoundary.length === 0) {
                if (this.hasPointCoordinates()) {
                    return {
                        minLat: this.coordinates.lat,
                        maxLat: this.coordinates.lat,
                        minLng: this.coordinates.lng,
                        maxLng: this.coordinates.lng
                    };
                }
                return null;
            }

            let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
            this.cadastralParcelBoundary.forEach(pt => {
                if (typeof pt.lat === 'number' && typeof pt.lng === 'number') {
                    if (pt.lat < minLat) minLat = pt.lat;
                    if (pt.lat > maxLat) maxLat = pt.lat;
                    if (pt.lng < minLng) minLng = pt.lng;
                    if (pt.lng > maxLng) maxLng = pt.lng;
                }
            });

            return (minLat === Infinity) ? null : { minLat, maxLat, minLng, maxLng };
        }

        containsPoint(lat, lng) {
            const bbox = this.calculateBoundingBox();
            if (!bbox) return false;
            return lat >= bbox.minLat && lat <= bbox.maxLat && lng >= bbox.minLng && lng <= bbox.maxLng;
        }

        clone() {
            return new HierarchicalLocationIdentity({
                locationNodeKey: this.locationNodeKey,
                countryIso3: this.countryIso3,
                worldContinent: this.worldContinent,
                worldMacroRegion: this.worldMacroRegion,
                adminStateProvince: this.adminStateProvince,
                adminCountyDistrict: this.adminCountyDistrict,
                siteSpecificLocality: this.siteSpecificLocality,
                lat: this.coordinates.lat,
                lng: this.coordinates.lng,
                elevationMetersAboveSea: this.elevationMetersAboveSea,
                spatialPrecisionRadiusKm: this.spatialPrecisionRadiusKm,
                cadastralParcelBoundary: [...this.cadastralParcelBoundary],
                parentLocationNodeKey: this.parentLocationNodeKey,
                provenance: JSON.parse(JSON.stringify(this.provenance))
            });
        }

        toJSON() {
            return {
                locationNodeKey: this.locationNodeKey,
                countryIso3: this.countryIso3,
                worldContinent: this.worldContinent,
                worldMacroRegion: this.worldMacroRegion,
                adminStateProvince: this.adminStateProvince,
                adminCountyDistrict: this.adminCountyDistrict,
                siteSpecificLocality: this.siteSpecificLocality,
                coordinates: this.coordinates,
                elevationMetersAboveSea: this.elevationMetersAboveSea,
                spatialPrecisionRadiusKm: this.spatialPrecisionRadiusKm,
                cadastralParcelBoundary: this.cadastralParcelBoundary,
                parentLocationNodeKey: this.parentLocationNodeKey,
                provenance: this.provenance
            };
        }
    }

    // =========================================================================
    // 04.11: RESOURCE VARIANT, GRADE & METALLURGICAL ASSAY SPECIFIER
    // =========================================================================

    class ResourceVariantGradeSpec {
        constructor(params = {}) {
            if (!params.resourceTypeId) {
                throw new Error('[ResourceVariantGradeSpec Violation]: resourceTypeId is required.');
            }

            this.resourceTypeId = DeterministicKeyEngine.normalizeToken(params.resourceTypeId).toUpperCase();
            this.variantName = params.variantName || 'STANDARD_RUN_OF_MINE';
            this.gradeTier = params.gradeTier || GradeClassificationTier.STANDARD_COMMERCIAL_GRADE;
            
            // IMMUTABLE IDENTITY CORE
            this.specKey = params.specKey || DeterministicKeyEngine.generateVariantGradeSpecKey(
                this.resourceTypeId, 
                this.variantName, 
                this.gradeTier
            );

            this.nominalConcentrationPurityRatio = typeof params.nominalConcentrationPurityRatio === 'number' 
                ? Math.max(0, Math.min(1, params.nominalConcentrationPurityRatio)) 
                : null;
            
            this.cutoffGradeRatio = typeof params.cutoffGradeRatio === 'number' ? params.cutoffGradeRatio : null;
            this.moistureContentPercent = typeof params.moistureContentPercent === 'number' ? params.moistureContentPercent : null;
            this.finesDistributionRatio = typeof params.finesDistributionRatio === 'number' ? params.finesDistributionRatio : null;
            
            // Deleterious penalty assays (e.g. As, P, S, Hg in ore assays)
            this.deleteriousImpurityAssays = Array.isArray(params.deleteriousImpurityAssays) 
                ? [...params.deleteriousImpurityAssays] 
                : [];

            this.metallurgicalRefractoryIndex = typeof params.metallurgicalRefractoryIndex === 'number' ? params.metallurgicalRefractoryIndex : 0.0;
            this.provenance = params.provenance || { sourceSubsystem: 'LABORATORY_ASSAY_REGISTRY', timestamp: 0 };
        }

        clone() {
            return new ResourceVariantGradeSpec({
                specKey: this.specKey,
                resourceTypeId: this.resourceTypeId,
                variantName: this.variantName,
                gradeTier: this.gradeTier,
                nominalConcentrationPurityRatio: this.nominalConcentrationPurityRatio,
                cutoffGradeRatio: this.cutoffGradeRatio,
                moistureContentPercent: this.moistureContentPercent,
                finesDistributionRatio: this.finesDistributionRatio,
                deleteriousImpurityAssays: JSON.parse(JSON.stringify(this.deleteriousImpurityAssays)),
                metallurgicalRefractoryIndex: this.metallurgicalRefractoryIndex,
                provenance: JSON.parse(JSON.stringify(this.provenance))
            });
        }

        toJSON() {
            return {
                specKey: this.specKey,
                resourceTypeId: this.resourceTypeId,
                variantName: this.variantName,
                gradeTier: this.gradeTier,
                nominalConcentrationPurityRatio: this.nominalConcentrationPurityRatio,
                cutoffGradeRatio: this.cutoffGradeRatio,
                moistureContentPercent: this.moistureContentPercent,
                finesDistributionRatio: this.finesDistributionRatio,
                deleteriousImpurityAssays: this.deleteriousImpurityAssays,
                metallurgicalRefractoryIndex: this.metallurgicalRefractoryIndex,
                provenance: this.provenance
            };
        }
    }

    // =========================================================================
    // EXPORT MODULE 1 SCOPE
    // =========================================================================

    const Module1Scope = Object.freeze({
        IdentityResolutionStatus,
        UnknownSemanticState,
        ResourceOccurrenceTier,
        DepositTypeClassification,
        OriginGenesisStatus,
        OwnershipControlModel,
        ResourcePhysicalCategory,
        GradeClassificationTier,
        ResourceLifecyclePhase,
        CandidateDispositionState,
        CollisionSeverity,
        IdentityHealthStatus,
        ErrorTaxonomy,
        ComponentResolutionMatrix,
        CanonicalIdentitySerializer,
        DeterministicKeyEngine,
        IdentityBasisContract,
        ResourceTypeIdentity,
        GeologicalDepositIdentity,
        ResourceOriginIdentity,
        ResourceOccurrenceIdentity,
        OwnershipStakeHolder,
        OwnershipIdentity,
        OperatorIdentity,
        HierarchicalLocationIdentity,
        ResourceVariantGradeSpec
    });

    global.__GSRSK_P04_PART1__ = Module1Scope;

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : global));

/**
 * ============================================================================
 * GSRSK — PART 04: RESOURCE IDENTITY ENGINE (MODULE 2 OF 2)
 * ============================================================================
 * Architecture Phase: 04 of 16
 * Production Standard: GSRSK Canonical Identity Authority
 *
 * SUBSYSTEMS INCLUDED IN MODULE 2:
 *   04.12 Resource Lifecycle Identity & FSM Transition Engine
 *   04.13 Dual Identity Fingerprint Engine (Identity vs Resolution)
 *   04.14 Hard Collision Arbiter & Conflict Logger (Bounded Ring Buffer)
 *   04.15 Identity Alias Registry & Equivalence Ledger (Pure-Read DSU) [ERR-03 Fixed]
 *   04.16 First-Class Identity Relationship Engine (Circular & Self-Ref Detector)
 *   04.17 Lineage Root & Forward Traceability Tree
 *   04.18 Data Foundation (Part 01) Provenance Bridge Engine
 *   04.19 Candidate Resolution Trace & Disposition Ledger (Zero Silent Data Loss)
 *   04.20 Master Resource Identity Registry (Three-Tier Storage & Semantic Digest)
 *   04.21 Multi-Dimensional Inverted Identity Index Hub
 *   04.22 Forensic Identity Diagnostics & Integrity Audit Engine
 *   04.23 Systemic Identity Health Monitor & Quantitative Metrics Hub
 *   04.24 State Checkpoint, Snapshot & Delta Serialization Engine
 *   04.25 Boundary Hardcoding Firewall & Simulation Guard (Deep Map/Set Scan)
 *   04.26 Master Atomic Identity Compiler Pipeline [ERR-01, ERR-02, RSK-02 Fixed]
 *   04.27 Public Adapter, Deep Freeze & Master Assembly
 * ============================================================================
 */

(function(global) {
    'use strict';

    // Ingest Module 1 Scope
    const Part1 = global.__GSRSK_P04_PART1__;
    if (!Part1) {
        throw new Error('[GSRSK PART 04 FATAL]: Module 1 must be loaded before Module 2.');
    }

    const {
        IdentityResolutionStatus,
        UnknownSemanticState,
        ResourceOccurrenceTier,
        DepositTypeClassification,
        OriginGenesisStatus,
        OwnershipControlModel,
        ResourcePhysicalCategory,
        GradeClassificationTier,
        ResourceLifecyclePhase,
        CandidateDispositionState,
        CollisionSeverity,
        IdentityHealthStatus,
        ErrorTaxonomy,
        ComponentResolutionMatrix,
        CanonicalIdentitySerializer,
        DeterministicKeyEngine,
        IdentityBasisContract,
        ResourceTypeIdentity,
        GeologicalDepositIdentity,
        ResourceOriginIdentity,
        ResourceOccurrenceIdentity,
        OwnershipStakeHolder,
        OwnershipIdentity,
        OperatorIdentity,
        HierarchicalLocationIdentity,
        ResourceVariantGradeSpec
    } = Part1;

    // =========================================================================
    // 04.12: RESOURCE LIFECYCLE IDENTITY & FSM TRANSITION ENGINE
    // =========================================================================

    class LifecycleTransitionGuard {
        static get VALID_TRANSITIONS() {
            return Object.freeze({
                [ResourceLifecyclePhase.UNDISCOVERED_THEORETICAL]: [
                    ResourceLifecyclePhase.DISCOVERED_UNASSESSED,
                    ResourceLifecyclePhase.UNKNOWN_LIFECYCLE
                ],
                [ResourceLifecyclePhase.DISCOVERED_UNASSESSED]: [
                    ResourceLifecyclePhase.EXPLORATION_DELINEATED,
                    ResourceLifecyclePhase.RESOURCE_ASSESSED,
                    ResourceLifecyclePhase.ABANDONED_UNREMEDIATED
                ],
                [ResourceLifecyclePhase.EXPLORATION_DELINEATED]: [
                    ResourceLifecyclePhase.RESOURCE_ASSESSED,
                    ResourceLifecyclePhase.FEASIBILITY_PERMITTED,
                    ResourceLifecyclePhase.ABANDONED_UNREMEDIATED
                ],
                [ResourceLifecyclePhase.RESOURCE_ASSESSED]: [
                    ResourceLifecyclePhase.FEASIBILITY_PERMITTED,
                    ResourceLifecyclePhase.CAPEX_CONSTRUCTION,
                    ResourceLifecyclePhase.ABANDONED_UNREMEDIATED
                ],
                [ResourceLifecyclePhase.FEASIBILITY_PERMITTED]: [
                    ResourceLifecyclePhase.CAPEX_CONSTRUCTION,
                    ResourceLifecyclePhase.COMMISSIONED_OPERATIONAL,
                    ResourceLifecyclePhase.PRODUCTION_CURTAILED_SUSPENDED,
                    ResourceLifecyclePhase.ABANDONED_UNREMEDIATED
                ],
                [ResourceLifecyclePhase.CAPEX_CONSTRUCTION]: [
                    ResourceLifecyclePhase.COMMISSIONED_OPERATIONAL,
                    ResourceLifecyclePhase.COMMERCIAL_EXTRACTION_ACTIVE,
                    ResourceLifecyclePhase.PRODUCTION_CURTAILED_SUSPENDED,
                    ResourceLifecyclePhase.ABANDONED_UNREMEDIATED
                ],
                [ResourceLifecyclePhase.COMMISSIONED_OPERATIONAL]: [
                    ResourceLifecyclePhase.COMMERCIAL_EXTRACTION_ACTIVE,
                    ResourceLifecyclePhase.PRODUCTION_CURTAILED_SUSPENDED,
                    ResourceLifecyclePhase.RESERVE_DEPLETING
                ],
                [ResourceLifecyclePhase.COMMERCIAL_EXTRACTION_ACTIVE]: [
                    ResourceLifecyclePhase.PRODUCTION_CURTAILED_SUSPENDED,
                    ResourceLifecyclePhase.RESERVE_DEPLETING,
                    ResourceLifecyclePhase.EXHAUSTED_DEPLETED
                ],
                [ResourceLifecyclePhase.PRODUCTION_CURTAILED_SUSPENDED]: [
                    ResourceLifecyclePhase.COMMERCIAL_EXTRACTION_ACTIVE,
                    ResourceLifecyclePhase.RESERVE_DEPLETING,
                    ResourceLifecyclePhase.DECOMMISSIONED_RECLAIMED,
                    ResourceLifecyclePhase.ABANDONED_UNREMEDIATED
                ],
                [ResourceLifecyclePhase.RESERVE_DEPLETING]: [
                    ResourceLifecyclePhase.PRODUCTION_CURTAILED_SUSPENDED,
                    ResourceLifecyclePhase.EXHAUSTED_DEPLETED,
                    ResourceLifecyclePhase.DECOMMISSIONED_RECLAIMED
                ],
                [ResourceLifecyclePhase.EXHAUSTED_DEPLETED]: [
                    ResourceLifecyclePhase.DECOMMISSIONED_RECLAIMED,
                    ResourceLifecyclePhase.ABANDONED_UNREMEDIATED
                ],
                [ResourceLifecyclePhase.DECOMMISSIONED_RECLAIMED]: [],
                [ResourceLifecyclePhase.ABANDONED_UNREMEDIATED]: [
                    ResourceLifecyclePhase.EXPLORATION_DELINEATED,
                    ResourceLifecyclePhase.DECOMMISSIONED_RECLAIMED
                ],
                [ResourceLifecyclePhase.UNKNOWN_LIFECYCLE]: Object.values(ResourceLifecyclePhase)
            });
        }

        static canTransition(fromPhase, toPhase) {
            if (fromPhase === toPhase) return true;
            const allowed = this.VALID_TRANSITIONS[fromPhase];
            return Array.isArray(allowed) && allowed.includes(toPhase);
        }
    }

    class ResourceLifecycleRecord {
        constructor(params = {}) {
            this.occurrenceKey = params.occurrenceKey;
            if (!this.occurrenceKey) {
                throw new Error('[ResourceLifecycleRecord Violation]: occurrenceKey is required.');
            }

            this.currentPhase = params.currentPhase || ResourceLifecyclePhase.UNKNOWN_LIFECYCLE;
            this.phaseAssignedTick = typeof params.phaseAssignedTick === 'number' ? params.phaseAssignedTick : 0;
            this.isCurrentlyExtractable = [
                ResourceLifecyclePhase.COMMISSIONED_OPERATIONAL,
                ResourceLifecyclePhase.COMMERCIAL_EXTRACTION_ACTIVE,
                ResourceLifecyclePhase.RESERVE_DEPLETING
            ].includes(this.currentPhase);

            this.history = Array.isArray(params.history) ? [...params.history] : [{
                fromPhase: null,
                phase: this.currentPhase,
                tick: this.phaseAssignedTick,
                rationale: params.initialRationale || 'INITIAL_REGISTRATION',
                timestamp: 0
            }];

            this.provenance = params.provenance || { sourceSubsystem: 'LIFECYCLE_FSM_ENGINE', timestamp: 0 };
        }

        transitionTo(newPhase, tick = 0, rationale = 'OPERATIONAL_AUDIT') {
            if (!LifecycleTransitionGuard.canTransition(this.currentPhase, newPhase)) {
                throw new Error(`[LifecycleTransition Violation]: Invalid transition from ${this.currentPhase} to ${newPhase} for occurrence ${this.occurrenceKey}`);
            }

            this.history.push({
                fromPhase: this.currentPhase,
                phase: newPhase,
                tick: tick,
                rationale: rationale,
                timestamp: 0
            });

            this.currentPhase = newPhase;
            this.phaseAssignedTick = tick;
            this.isCurrentlyExtractable = [
                ResourceLifecyclePhase.COMMISSIONED_OPERATIONAL,
                ResourceLifecyclePhase.COMMERCIAL_EXTRACTION_ACTIVE,
                ResourceLifecyclePhase.RESERVE_DEPLETING
            ].includes(newPhase);
        }

        clone() {
            return new ResourceLifecycleRecord({
                occurrenceKey: this.occurrenceKey,
                currentPhase: this.currentPhase,
                phaseAssignedTick: this.phaseAssignedTick,
                history: JSON.parse(JSON.stringify(this.history)),
                provenance: JSON.parse(JSON.stringify(this.provenance))
            });
        }

        toJSON() {
            return {
                occurrenceKey: this.occurrenceKey,
                currentPhase: this.currentPhase,
                phaseAssignedTick: this.phaseAssignedTick,
                isCurrentlyExtractable: this.isCurrentlyExtractable,
                history: this.history,
                provenance: this.provenance
            };
        }
    }

    // =========================================================================
    // 04.13: DUAL IDENTITY FINGERPRINT ENGINE
    // =========================================================================

    class IdentityFingerprintEngine {
        /**
         * Pure Immutable Identity Basis Fingerprint (Determines physical uniqueness)
         */
        static computeOccurrenceIdentityFingerprint(occurrence) {
            const signature = {
                res: occurrence.resourceTypeKey,
                dep: occurrence.depositKey,
                org: occurrence.originKey,
                tier: occurrence.occurrenceTier
            };
            const serialized = CanonicalIdentitySerializer.serializeValue(signature);
            return `FP_ID_OCC_${DeterministicKeyEngine.compute64BitHash(serialized)}`;
        }

        /**
         * Contextual Resolution Fingerprint (Used for matching aliases/candidates across fragmented records)
         */
        static computeOccurrenceResolutionFingerprint(occurrence) {
            const signature = {
                res: occurrence.resourceTypeKey,
                dep: occurrence.depositKey,
                owner: occurrence.ownerKey || '__NULL__',
                operator: occurrence.operatorKey || '__NULL__',
                loc: occurrence.locationNodeKey || '__NULL__'
            };
            const serialized = CanonicalIdentitySerializer.serializeValue(signature);
            return `FP_RES_OCC_${DeterministicKeyEngine.compute64BitHash(serialized)}`;
        }

        static computeDepositFingerprint(deposit) {
            const signature = {
                country: deposit.hostCountryIso3,
                name: DeterministicKeyEngine.normalizeToken(deposit.depositRawName),
                geo: deposit.geologicalType
            };
            const serialized = CanonicalIdentitySerializer.serializeValue(signature);
            return `FP_ID_DEP_${DeterministicKeyEngine.compute64BitHash(serialized)}`;
        }

        static computeOwnershipFingerprint(ownership) {
            const signature = {
                owner: ownership.legalOwnerId,
                juris: ownership.sovereignJurisdictionIso3,
                model: ownership.controlModel
            };
            const serialized = CanonicalIdentitySerializer.serializeValue(signature);
            return `FP_ID_OWN_${DeterministicKeyEngine.compute64BitHash(serialized)}`;
        }
    }

    // =========================================================================
    // 04.14: HARD COLLISION ARBITER & CONFLICT LOGGER
    // =========================================================================

    class IdentityCollisionArbiter {
        constructor(maxLogCapacity = 5000) {
            this.registeredKeyMap = new Map(); // Key -> { entityType, fingerprint, source }
            this.collisionAuditLogs = [];
            this.maxLogCapacity = maxLogCapacity;
        }

        assertRegistration(key, entityType, fingerprint, source = 'PIPELINE') {
            if (!key || typeof key !== 'string') {
                this._log(CollisionSeverity.FATAL, key, ErrorTaxonomy.ID_001_INVALID_IDENTITY, 'Identity key must be a valid non-empty string.', source);
                return false;
            }

            if (this.registeredKeyMap.has(key)) {
                const existing = this.registeredKeyMap.get(key);
                if (existing.fingerprint !== fingerprint || existing.entityType !== entityType) {
                    this._log(
                        CollisionSeverity.ERROR,
                        key,
                        ErrorTaxonomy.ID_003_IDENTITY_COLLISION,
                        `Key collision: Existing (${existing.entityType}, FP:${existing.fingerprint}) vs Incoming (${entityType}, FP:${fingerprint})`,
                        source
                    );
                    return false;
                }
                return true; // Idempotent re-registration
            }

            this.registeredKeyMap.set(key, { entityType, fingerprint, source, registeredAt: 0 });
            return true;
        }

        _log(severity, key, violationCode, details, source) {
            if (this.collisionAuditLogs.length >= this.maxLogCapacity) {
                this.collisionAuditLogs.shift(); // Bounded sliding ring buffer
            }
            this.collisionAuditLogs.push({
                severity,
                key,
                violationCode,
                details,
                source,
                timestamp: 0
            });
        }

        hasFatalCollisions() {
            return this.collisionAuditLogs.some(l => l.severity === CollisionSeverity.FATAL || l.severity === CollisionSeverity.ERROR);
        }

        getReport() {
            // Deterministic sorting of collision audit logs
            const sortedLogs = [...this.collisionAuditLogs].sort((a, b) => {
                if (a.severity !== b.severity) return a.severity.localeCompare(b.severity);
                if (a.violationCode !== b.violationCode) return a.violationCode.localeCompare(b.violationCode);
                return a.key.localeCompare(b.key);
            });

            return {
                totalCollisionsLogged: sortedLogs.length,
                fatalCount: sortedLogs.filter(l => l.severity === CollisionSeverity.FATAL).length,
                errorCount: sortedLogs.filter(l => l.severity === CollisionSeverity.ERROR).length,
                warningCount: sortedLogs.filter(l => l.severity === CollisionSeverity.WARNING).length,
                logs: sortedLogs
            };
        }

        clear() {
            this.registeredKeyMap.clear();
            this.collisionAuditLogs = [];
        }
    }

    // =========================================================================
    // 04.15: IDENTITY ALIAS REGISTRY & NON-DESTRUCTIVE EQUIVALENCE LEDGER (PURE-READ DSU)
    // =========================================================================

    class IdentityAliasRegistry {
        constructor() {
            this.parentMap = new Map();
            this.rankMap = new Map();
            this.aliasLedger = new Map(); // Canonical Key -> Set of Raw Aliases with Source Metadata
        }

        /**
         * PURE READ: Returns canonical root without mutating internal maps.
         * Safe to call on deep-frozen registries. [ERR-03 Fixed]
         */
        _findRoot(key) {
            if (!this.parentMap.has(key)) {
                return key;
            }

            let root = key;
            let guard = 0;
            while (this.parentMap.has(root) && this.parentMap.get(root) !== root && guard < 1000) {
                root = this.parentMap.get(root);
                guard++;
            }
            return root;
        }

        _compressPath(key, root) {
            let curr = key;
            while (curr !== root && this.parentMap.has(curr)) {
                const next = this.parentMap.get(curr);
                this.parentMap.set(curr, root);
                curr = next;
            }
        }

        registerEquivalence(primaryKey, aliasKey, sourceContext = 'SYSTEM') {
            if (!primaryKey || !aliasKey || primaryKey === aliasKey) return;

            if (!this.parentMap.has(primaryKey)) {
                this.parentMap.set(primaryKey, primaryKey);
                this.rankMap.set(primaryKey, 0);
            }

            if (!this.parentMap.has(aliasKey)) {
                this.parentMap.set(aliasKey, aliasKey);
                this.rankMap.set(aliasKey, 0);
            }

            const rootA = this._findRoot(primaryKey);
            const rootB = this._findRoot(aliasKey);

            if (rootA !== rootB) {
                const rankA = this.rankMap.get(rootA) || 0;
                const rankB = this.rankMap.get(rootB) || 0;

                if (rankA < rankB) {
                    this.parentMap.set(rootA, rootB);
                    this._compressPath(primaryKey, rootB);
                    this._recordInLedger(rootB, aliasKey, sourceContext);
                } else if (rankA > rankB) {
                    this.parentMap.set(rootB, rootA);
                    this._compressPath(aliasKey, rootA);
                    this._recordInLedger(rootA, aliasKey, sourceContext);
                } else {
                    this.parentMap.set(rootB, rootA);
                    this.rankMap.set(rootA, rankA + 1);
                    this._compressPath(aliasKey, rootA);
                    this._recordInLedger(rootA, aliasKey, sourceContext);
                }
            } else {
                this._recordInLedger(rootA, aliasKey, sourceContext);
            }
        }

        _recordInLedger(canonicalKey, alias, sourceContext) {
            if (!this.aliasLedger.has(canonicalKey)) {
                this.aliasLedger.set(canonicalKey, new Map());
            }
            this.aliasLedger.get(canonicalKey).set(alias, { sourceContext, registeredAt: 0 });
        }

        resolveCanonicalKey(candidateKey) {
            if (!candidateKey) return null;
            return this._findRoot(candidateKey);
        }

        getAliasesFor(canonicalKey) {
            const root = this.resolveCanonicalKey(canonicalKey);
            const map = this.aliasLedger.get(root);
            return map ? Array.from(map.keys()).sort() : [];
        }

        clear() {
            this.parentMap.clear();
            this.rankMap.clear();
            this.aliasLedger.clear();
        }
    }

    // =========================================================================
    // 04.16: FIRST-CLASS IDENTITY RELATIONSHIP ENGINE
    // =========================================================================

    class IdentityRelationship {
        constructor(params = {}) {
            if (!params.relationshipType || !params.subjectKey || !params.objectKey) {
                throw new Error('[IdentityRelationship Violation]: relationshipType, subjectKey, and objectKey are required.');
            }

            this.relationshipType = params.relationshipType;
            this.subjectKey = params.subjectKey;
            this.objectKey = params.objectKey;
            this.relationshipKey = params.relationshipKey || DeterministicKeyEngine.generateRelationshipKey(
                this.relationshipType,
                this.subjectKey,
                this.objectKey
            );

            this.version = typeof params.version === 'number' ? params.version : 1;
            this.resolutionStatus = params.resolutionStatus || IdentityResolutionStatus.RESOLVED;
            this.provenance = params.provenance || { sourceSubsystem: 'RELATIONSHIP_ENGINE', timestamp: 0 };
        }

        toJSON() {
            return {
                relationshipKey: this.relationshipKey,
                relationshipType: this.relationshipType,
                subjectKey: this.subjectKey,
                objectKey: this.objectKey,
                version: this.version,
                resolutionStatus: this.resolutionStatus,
                provenance: this.provenance
            };
        }
    }

    class RelationshipIntegrityEngine {
        /**
         * Detects circular dependencies (e.g. Location A contains B, B contains A)
         */
        static detectCycles(relationships, targetRelType) {
            const adj = new Map();
            relationships.forEach(rel => {
                if (rel.relationshipType === targetRelType) {
                    if (!adj.has(rel.subjectKey)) adj.set(rel.subjectKey, []);
                    adj.get(rel.subjectKey).push(rel.objectKey);
                }
            });

            const visited = new Set();
            const inStack = new Set();
            const cycles = [];

            const dfs = (node, path) => {
                visited.add(node);
                inStack.add(node);
                path.push(node);

                const neighbors = adj.get(node) || [];
                for (const neighbor of neighbors) {
                    if (!visited.has(neighbor)) {
                        dfs(neighbor, path);
                    } else if (inStack.has(neighbor)) {
                        const cyclePath = path.slice(path.indexOf(neighbor));
                        cyclePath.push(neighbor);
                        cycles.push(cyclePath);
                    }
                }

                inStack.delete(node);
                path.pop();
            };

            adj.forEach((_, node) => {
                if (!visited.has(node)) {
                    dfs(node, []);
                }
            });

            return cycles;
        }

        /**
         * Detects self-references (e.g. Entity A owns Entity A)
         */
        static detectSelfReferences(relationships) {
            return relationships
                .filter(rel => rel.subjectKey === rel.objectKey)
                .map(rel => ({
                    relationshipKey: rel.relationshipKey,
                    type: rel.relationshipType,
                    node: rel.subjectKey
                }));
        }
    }

    // =========================================================================
    // 04.17: LINEAGE ROOT & FORWARD TRACEABILITY TREE
    // =========================================================================

    class LineageRootNode {
        constructor(params = {}) {
            if (!params.occurrenceKey || !params.depositKey || !params.resourceTypeKey) {
                throw new Error('[LineageRootNode Violation]: occurrenceKey, depositKey, and resourceTypeKey are mandatory.');
            }

            this.occurrenceKey = params.occurrenceKey;
            this.depositKey = params.depositKey;
            this.originKey = params.originKey || 'UNKNOWN_ORIGIN';
            this.resourceTypeKey = params.resourceTypeKey;
            this.hostCountryIso3 = DeterministicKeyEngine.normalizeToken(params.hostCountryIso3 || 'GLOBAL').toUpperCase();

            this.rootKey = params.rootKey || DeterministicKeyEngine.generateLineageRootKey(this.occurrenceKey, this.originKey);
            this.childBatchSequence = typeof params.childBatchSequence === 'number' ? params.childBatchSequence : 0;
            this.downstreamExtractionSites = new Set(Array.isArray(params.downstreamExtractionSites) ? params.downstreamExtractionSites : []);
            this.provenance = params.provenance || { sourceSubsystem: 'LINEAGE_ROOT_RESOLVER', timestamp: 0 };
        }

        generateNextBatchKey() {
            this.childBatchSequence += 1;
            const seqHex = this.childBatchSequence.toString(16).padStart(6, '0');
            return `BATCH:${this.rootKey}_${seqHex}`;
        }

        registerExtractionSite(siteKey) {
            if (siteKey && typeof siteKey === 'string') {
                this.downstreamExtractionSites.add(siteKey);
            }
        }

        clone() {
            return new LineageRootNode({
                rootKey: this.rootKey,
                occurrenceKey: this.occurrenceKey,
                depositKey: this.depositKey,
                originKey: this.originKey,
                resourceTypeKey: this.resourceTypeKey,
                hostCountryIso3: this.hostCountryIso3,
                childBatchSequence: this.childBatchSequence,
                downstreamExtractionSites: Array.from(this.downstreamExtractionSites),
                provenance: JSON.parse(JSON.stringify(this.provenance))
            });
        }

        toJSON() {
            return {
                rootKey: this.rootKey,
                occurrenceKey: this.occurrenceKey,
                depositKey: this.depositKey,
                originKey: this.originKey,
                resourceTypeKey: this.resourceTypeKey,
                hostCountryIso3: this.hostCountryIso3,
                childBatchSequence: this.childBatchSequence,
                downstreamExtractionSites: Array.from(this.downstreamExtractionSites).sort(),
                provenance: this.provenance
            };
        }
    }

    // =========================================================================
    // 04.18: DATA FOUNDATION (PART 01) PROVENANCE BRIDGE ENGINE
    // =========================================================================

    class ProvenanceBridgeEngine {
        static bridgeToIdentityProvenance(rawClaim, subsystemContext = 'UNKNOWN_SUBSYSTEM') {
            if (!rawClaim) {
                const syntheticHash = DeterministicKeyEngine.compute64BitHash(`SYNTHETIC_PROVENANCE:${subsystemContext}`).substring(0, 10);
                return {
                    provenanceId: `PRV_SYNTHETIC_${syntheticHash}`,
                    sourceSubsystem: subsystemContext,
                    confidenceScore: 0.0,
                    evidenceState: 'UNVERIFIED_SYNTHETIC',
                    sourceContext: 'NO_RAW_CLAIM_ATTACHED',
                    timestamp: 0
                };
            }

            const rawPayload = typeof rawClaim === 'string' ? rawClaim : JSON.stringify(rawClaim);
            const provHash = DeterministicKeyEngine.compute64BitHash(rawPayload).substring(0, 10);

            return {
                provenanceId: `PRV_${provHash}`,
                sourceSubsystem: subsystemContext,
                sourceId: rawClaim.sourceId || 'PRIMARY_DATA_FOUNDATION',
                rawNodeId: rawClaim.rawNodeId || null,
                confidenceScore: typeof rawClaim.confidence === 'number' ? rawClaim.confidence : 1.0,
                evidenceState: rawClaim.evidenceState || 'DECLARED',
                timestamp: 0
            };
        }
    }

    // =========================================================================
    // 04.19: CANDIDATE RESOLUTION TRACE & DISPOSITION LEDGER
    // =========================================================================

    class ResolutionDispositionLedger {
        constructor() {
            this.dispositions = new Map(); // Raw Candidate Ref -> Record
        }

        recordDisposition(rawCandidateId, dispositionState, canonicalKey = null, rationale = '') {
            this.dispositions.set(rawCandidateId, {
                rawCandidateId,
                dispositionState,
                canonicalKey,
                rationale,
                recordedAtTick: 0
            });
        }

        getSummary() {
            const summary = {
                totalCandidatesIngested: this.dispositions.size,
                acceptedNew: 0,
                merged: 0,
                resolvedExisting: 0,
                rejectedCollision: 0,
                rejectedCorrupt: 0,
                deferred: 0,
                ignored: 0
            };

            this.dispositions.forEach(d => {
                if (d.dispositionState === CandidateDispositionState.ACCEPTED_NEW) summary.acceptedNew++;
                else if (d.dispositionState === CandidateDispositionState.ACCEPTED_EQUIVALENT_MERGED) summary.merged++;
                else if (d.dispositionState === CandidateDispositionState.RESOLVED_TO_EXISTING) summary.resolvedExisting++;
                else if (d.dispositionState === CandidateDispositionState.REJECTED_COLLISION) summary.rejectedCollision++;
                else if (d.dispositionState === CandidateDispositionState.REJECTED_CORRUPT_SCHEMA) summary.rejectedCorrupt++;
                else if (d.dispositionState === CandidateDispositionState.DEFERRED_UNRESOLVED) summary.deferred++;
                else if (d.dispositionState === CandidateDispositionState.IGNORED_POLICY) summary.ignored++;
            });

            return summary;
        }

        clear() {
            this.dispositions.clear();
        }
    }

    // =========================================================================
    // 04.20 & 04.21: MASTER IDENTITY REGISTRY & INVERTED INDEX HUB
    // =========================================================================

    class IdentityIndexHub {
        constructor() {
            // Occurrence Inverted Indexes
            this.occurrencesByType = new Map();
            this.occurrencesByDeposit = new Map();
            this.occurrencesByCountry = new Map();
            this.occurrencesByStatus = new Map();
            this.occurrencesByTier = new Map();

            // Deposit & Location Inverted Indexes
            this.depositsByCountry = new Map();
            this.depositsByLocation = new Map();
            this.depositsByGeologicalType = new Map();

            // Origin & Cadastral Inverted Indexes
            this.originsByDeposit = new Map();
            this.originsByCountry = new Map();
            this.ownershipsByOwner = new Map();
            this.ownershipsByJurisdiction = new Map();
            this.operatorsByCompany = new Map();
            this.operatorsByCountry = new Map();

            // Spec & Lineage Indexes
            this.variantSpecsByType = new Map();
            this.lineageRootsByOccurrence = new Map();
            this.lineageRootsByDeposit = new Map();
            this.fingerprintsToKeys = new Map();
        }

        indexOccurrence(occurrence, hostCountryIso3) {
            const key = occurrence.occurrenceKey;
            const cIso3 = hostCountryIso3 || 'GLOBAL';

            this._addToMultiMap(this.occurrencesByType, occurrence.resourceTypeKey, key);
            this._addToMultiMap(this.occurrencesByDeposit, occurrence.depositKey, key);
            this._addToMultiMap(this.occurrencesByCountry, cIso3, key);
            this._addToMultiMap(this.occurrencesByStatus, occurrence.resolutionMatrix.computeOverallStatus(), key);
            this._addToMultiMap(this.occurrencesByTier, occurrence.occurrenceTier, key);
        }

        indexDeposit(deposit) {
            this._addToMultiMap(this.depositsByCountry, deposit.hostCountryIso3, deposit.depositKey);
            this._addToMultiMap(this.depositsByGeologicalType, deposit.geologicalType, deposit.depositKey);
            if (deposit.locationNodeKey) {
                this._addToMultiMap(this.depositsByLocation, deposit.locationNodeKey, deposit.depositKey);
            }
        }

        indexOrigin(origin) {
            this._addToMultiMap(this.originsByDeposit, origin.depositKey, origin.originKey);
            this._addToMultiMap(this.originsByCountry, origin.hostCountryIso3, origin.originKey);
        }

        indexOwnership(ownership) {
            this._addToMultiMap(this.ownershipsByOwner, ownership.legalOwnerId, ownership.ownershipKey);
            this._addToMultiMap(this.ownershipsByJurisdiction, ownership.sovereignJurisdictionIso3, ownership.ownershipKey);
        }

        indexOperator(operator) {
            this._addToMultiMap(this.operatorsByCompany, operator.operatingCompanyId, operator.operatorKey);
            this._addToMultiMap(this.operatorsByCountry, operator.operatingSiteOrCountry, operator.operatorKey);
        }

        indexVariantSpec(spec) {
            this._addToMultiMap(this.variantSpecsByType, spec.resourceTypeId, spec.specKey);
        }

        indexLineageRoot(rootNode) {
            this._addToMultiMap(this.lineageRootsByOccurrence, rootNode.occurrenceKey, rootNode.rootKey);
            this._addToMultiMap(this.lineageRootsByDeposit, rootNode.depositKey, rootNode.rootKey);
        }

        registerFingerprint(fingerprint, targetKey) {
            if (fingerprint && targetKey) {
                this.fingerprintsToKeys.set(fingerprint, targetKey);
            }
        }

        _addToMultiMap(map, indexKey, value) {
            if (!indexKey) return;
            if (!map.has(indexKey)) {
                map.set(indexKey, new Set());
            }
            map.get(indexKey).add(value);
        }

        clear() {
            this.occurrencesByType.clear();
            this.occurrencesByDeposit.clear();
            this.occurrencesByCountry.clear();
            this.occurrencesByStatus.clear();
            this.occurrencesByTier.clear();
            this.depositsByCountry.clear();
            this.depositsByLocation.clear();
            this.depositsByGeologicalType.clear();
            this.originsByDeposit.clear();
            this.originsByCountry.clear();
            this.ownershipsByOwner.clear();
            this.ownershipsByJurisdiction.clear();
            this.operatorsByCompany.clear();
            this.operatorsByCountry.clear();
            this.variantSpecsByType.clear();
            this.lineageRootsByOccurrence.clear();
            this.lineageRootsByDeposit.clear();
            this.fingerprintsToKeys.clear();
        }
    }

    class ResourceIdentityRegistry {
        constructor() {
            // Three-Tier Storage Catalogs
            this.resourceTypes = new Map();
            this.deposits = new Map();
            this.occurrences = new Map();
            this.origins = new Map();
            this.ownerships = new Map();
            this.operators = new Map();
            this.locations = new Map();
            this.variantSpecs = new Map();
            this.lifecycles = new Map();
            this.lineageRoots = new Map();
            this.relationships = new Map();

            // Subsystem Engines
            this.indexes = new IdentityIndexHub();
            this.collisionArbiter = new IdentityCollisionArbiter();
            this.aliasRegistry = new IdentityAliasRegistry();
            this.dispositionLedger = new ResolutionDispositionLedger();

            // Registry Traceability Metadata
            this.registryBuildId = 'UNCOMPILED';
            this.identitySchemaVersion = 1;
            this.identityRuleVersion = '1.0.0-PROD';
            this.normalizationPolicyVersion = 'UNICODE_NFD_V1';
            this.lastCompiledTimestamp = 0;
        }

        registerResourceType(resType) {
            if (!(resType instanceof ResourceTypeIdentity)) throw new Error('Expected ResourceTypeIdentity.');
            const fp = `FP_ID_TYPE_${resType.resourceTypeId}`;
            if (this.collisionArbiter.assertRegistration(resType.identityKey, 'RESOURCE_TYPE', fp)) {
                this.resourceTypes.set(resType.identityKey, resType);
                this.indexes.registerFingerprint(fp, resType.identityKey);
            }
            return resType;
        }

        registerLocation(location) {
            if (!(location instanceof HierarchicalLocationIdentity)) throw new Error('Expected HierarchicalLocationIdentity.');
            const fp = `FP_ID_LOC_${location.locationNodeKey}`;
            if (this.collisionArbiter.assertRegistration(location.locationNodeKey, 'LOCATION', fp)) {
                this.locations.set(location.locationNodeKey, location);
                this.indexes.registerFingerprint(fp, location.locationNodeKey);
            }
            return location;
        }

        registerVariantSpec(spec) {
            if (!(spec instanceof ResourceVariantGradeSpec)) throw new Error('Expected ResourceVariantGradeSpec.');
            const fp = `FP_ID_SPEC_${spec.specKey}`;
            if (this.collisionArbiter.assertRegistration(spec.specKey, 'VARIANT_SPEC', fp)) {
                this.variantSpecs.set(spec.specKey, spec);
                this.indexes.indexVariantSpec(spec);
                this.indexes.registerFingerprint(fp, spec.specKey);
            }
            return spec;
        }

        registerDeposit(deposit) {
            if (!(deposit instanceof GeologicalDepositIdentity)) throw new Error('Expected GeologicalDepositIdentity.');
            const fp = IdentityFingerprintEngine.computeDepositFingerprint(deposit);
            if (this.collisionArbiter.assertRegistration(deposit.depositKey, 'GEOLOGICAL_DEPOSIT', fp)) {
                this.deposits.set(deposit.depositKey, deposit);
                this.indexes.indexDeposit(deposit);
                this.indexes.registerFingerprint(fp, deposit.depositKey);
            }
            return deposit;
        }

        registerOrigin(origin) {
            if (!(origin instanceof ResourceOriginIdentity)) throw new Error('Expected ResourceOriginIdentity.');
            const fp = `FP_ID_ORG_${origin.provenanceAnchorHash}`;
            if (this.collisionArbiter.assertRegistration(origin.originKey, 'RESOURCE_ORIGIN', fp)) {
                this.origins.set(origin.originKey, origin);
                this.indexes.indexOrigin(origin);
                this.indexes.registerFingerprint(fp, origin.originKey);
            }
            return origin;
        }

        registerOwnership(ownership) {
            if (!(ownership instanceof OwnershipIdentity)) throw new Error('Expected OwnershipIdentity.');
            const fp = IdentityFingerprintEngine.computeOwnershipFingerprint(ownership);
            if (this.collisionArbiter.assertRegistration(ownership.ownershipKey, 'OWNERSHIP', fp)) {
                this.ownerships.set(ownership.ownershipKey, ownership);
                this.indexes.indexOwnership(ownership);
                this.indexes.registerFingerprint(fp, ownership.ownershipKey);
            }
            return ownership;
        }

        registerOperator(operator) {
            if (!(operator instanceof OperatorIdentity)) throw new Error('Expected OperatorIdentity.');
            const fp = `FP_ID_OPR_${operator.operatingCompanyId}_${operator.operatingSiteOrCountry}`;
            if (this.collisionArbiter.assertRegistration(operator.operatorKey, 'OPERATOR', fp)) {
                this.operators.set(operator.operatorKey, operator);
                this.indexes.indexOperator(operator);
                this.indexes.registerFingerprint(fp, operator.operatorKey);
            }
            return operator;
        }

        registerOccurrence(occurrence, hostCountryIso3 = 'GLOBAL') {
            if (!(occurrence instanceof ResourceOccurrenceIdentity)) throw new Error('Expected ResourceOccurrenceIdentity.');
            const idFp = IdentityFingerprintEngine.computeOccurrenceIdentityFingerprint(occurrence);
            const resFp = IdentityFingerprintEngine.computeOccurrenceResolutionFingerprint(occurrence);

            if (this.collisionArbiter.assertRegistration(occurrence.occurrenceKey, 'RESOURCE_OCCURRENCE', idFp)) {
                this.occurrences.set(occurrence.occurrenceKey, occurrence);
                this.indexes.indexOccurrence(occurrence, hostCountryIso3);
                this.indexes.registerFingerprint(idFp, occurrence.occurrenceKey);
                this.indexes.registerFingerprint(resFp, occurrence.occurrenceKey);
            }
            return occurrence;
        }

        registerLifecycle(lifecycle) {
            if (!(lifecycle instanceof ResourceLifecycleRecord)) throw new Error('Expected ResourceLifecycleRecord.');
            this.lifecycles.set(lifecycle.occurrenceKey, lifecycle);
            return lifecycle;
        }

        registerLineageRoot(rootNode) {
            if (!(rootNode instanceof LineageRootNode)) throw new Error('Expected LineageRootNode.');
            const fp = `FP_ID_LIN_${rootNode.rootKey}`;
            if (this.collisionArbiter.assertRegistration(rootNode.rootKey, 'LINEAGE_ROOT', fp)) {
                this.lineageRoots.set(rootNode.rootKey, rootNode);
                this.indexes.indexLineageRoot(rootNode);
                this.indexes.registerFingerprint(fp, rootNode.rootKey);
            }
            return rootNode;
        }

        registerRelationship(relationship) {
            if (!(relationship instanceof IdentityRelationship)) throw new Error('Expected IdentityRelationship.');
            this.relationships.set(relationship.relationshipKey, relationship);
            return relationship;
        }

        getOccurrence(key) {
            const canonical = this.aliasRegistry.resolveCanonicalKey(key);
            return this.occurrences.get(canonical) || null;
        }

        getDeposit(key) {
            const canonical = this.aliasRegistry.resolveCanonicalKey(key);
            return this.deposits.get(canonical) || null;
        }

        getResourceType(key) {
            const canonical = this.aliasRegistry.resolveCanonicalKey(key);
            return this.resourceTypes.get(canonical) || null;
        }

        getOrigin(key) {
            return this.origins.get(key) || null;
        }

        getLocation(key) {
            return this.locations.get(key) || null;
        }

        getOwnership(key) {
            return this.ownerships.get(key) || null;
        }

        getOperator(key) {
            return this.operators.get(key) || null;
        }

        getLifecycle(occurrenceKey) {
            const canonical = this.aliasRegistry.resolveCanonicalKey(occurrenceKey);
            return this.lifecycles.get(canonical) || null;
        }

        getLineageRoot(rootKey) {
            return this.lineageRoots.get(rootKey) || null;
        }

        getOccurrencesByCountry(countryIso3) {
            const norm = DeterministicKeyEngine.normalizeToken(countryIso3).toUpperCase();
            const keys = this.indexes.occurrencesByCountry.get(norm);
            if (!keys) return [];
            return Array.from(keys).sort().map(k => this.occurrences.get(k)).filter(Boolean);
        }

        getOccurrencesByResourceType(resourceTypeId) {
            const typeKey = DeterministicKeyEngine.generateResourceTypeKey(resourceTypeId);
            const keys = this.indexes.occurrencesByType.get(typeKey);
            if (!keys) return [];
            return Array.from(keys).sort().map(k => this.occurrences.get(k)).filter(Boolean);
        }

        getDepositsByCountry(countryIso3) {
            const norm = DeterministicKeyEngine.normalizeToken(countryIso3).toUpperCase();
            const keys = this.indexes.depositsByCountry.get(norm);
            if (!keys) return [];
            return Array.from(keys).sort().map(k => this.deposits.get(k)).filter(Boolean);
        }

        /**
         * Calculates live deterministic semantic digest for registry equivalence testing.
         */
        calculateSemanticDigest() {
            const sortedOccKeys = Array.from(this.occurrences.keys()).sort();
            const sortedDepKeys = Array.from(this.deposits.keys()).sort();
            const sortedRelKeys = Array.from(this.relationships.keys()).sort();
            const sortedLinKeys = Array.from(this.lineageRoots.keys()).sort();

            const digestPayload = [
                `OCC_COUNT=${sortedOccKeys.length}`,
                `DEP_COUNT=${sortedDepKeys.length}`,
                `OCC_HASH=${DeterministicKeyEngine.compute64BitHash(sortedOccKeys.join(','))}`,
                `DEP_HASH=${DeterministicKeyEngine.compute64BitHash(sortedDepKeys.join(','))}`,
                `REL_HASH=${DeterministicKeyEngine.compute64BitHash(sortedRelKeys.join(','))}`,
                `LIN_HASH=${DeterministicKeyEngine.compute64BitHash(sortedLinKeys.join(','))}`
            ].join('|');

            return `DIGEST_${DeterministicKeyEngine.compute64BitHash(digestPayload)}`;
        }

        clear() {
            this.resourceTypes.clear();
            this.deposits.clear();
            this.occurrences.clear();
            this.origins.clear();
            this.ownerships.clear();
            this.operators.clear();
            this.locations.clear();
            this.variantSpecs.clear();
            this.lifecycles.clear();
            this.lineageRoots.clear();
            this.relationships.clear();
            this.indexes.clear();
            this.collisionArbiter.clear();
            this.aliasRegistry.clear();
            this.dispositionLedger.clear();
            this.registryBuildId = 'UNCOMPILED';
            this.lastCompiledTimestamp = 0;
        }
    }

    // =========================================================================
    // 04.22 & 04.23: FORENSIC DIAGNOSTICS & SYSTEMIC HEALTH MONITOR
    // =========================================================================

    class IdentityDiagnosticsEngine {
        static runComprehensiveAudit(registry) {
            const brokenPointers = [];
            const orphanOccurrences = [];
            const ungroundedOrigins = [];
            const unrootedOccurrences = [];
            const missingLifecycles = [];
            const missingLocations = [];

            // 1. Audit Occurrences
            registry.occurrences.forEach((occ, key) => {
                if (!registry.resourceTypes.has(occ.resourceTypeKey)) {
                    brokenPointers.push({ key, target: occ.resourceTypeKey, field: 'resourceTypeKey', code: ErrorTaxonomy.ID_004_UNRESOLVED_REFERENCE });
                }
                if (!registry.deposits.has(occ.depositKey)) {
                    orphanOccurrences.push({ occurrenceKey: key, targetDepositKey: occ.depositKey, code: ErrorTaxonomy.ID_013_ORPHAN_ENTITY });
                }
                if (!occ.lineageRootKey || !registry.lineageRoots.has(occ.lineageRootKey)) {
                    unrootedOccurrences.push({ occurrenceKey: key, missingLineageRoot: occ.lineageRootKey, code: ErrorTaxonomy.ID_007_LINEAGE_ROOT_MISSING });
                }
                if (!registry.lifecycles.has(key)) {
                    missingLifecycles.push({ occurrenceKey: key, code: ErrorTaxonomy.ID_009_INVALID_LIFECYCLE_STATE });
                }
            });

            // 2. Audit Deposits
            registry.deposits.forEach((dep, key) => {
                if (dep.locationNodeKey && !registry.locations.has(dep.locationNodeKey)) {
                    missingLocations.push({ depositKey: key, locationKey: dep.locationNodeKey, code: ErrorTaxonomy.ID_004_UNRESOLVED_REFERENCE });
                }
            });

            // 3. Audit Origins
            registry.origins.forEach((org, key) => {
                if (!registry.deposits.has(org.depositKey)) {
                    ungroundedOrigins.push({ originKey: key, depositKey: org.depositKey, code: ErrorTaxonomy.ID_013_ORPHAN_ENTITY });
                }
            });

            // 4. Audit Relationships (Cycles & Self-References)
            const allRels = Array.from(registry.relationships.values());
            const selfRefs = RelationshipIntegrityEngine.detectSelfReferences(allRels);
            const locationCycles = RelationshipIntegrityEngine.detectCycles(allRels, 'CONTAINS_LOCATION');

            const collisionReport = registry.collisionArbiter.getReport();

            let healthStatus = IdentityHealthStatus.HEALTHY;
            if (collisionReport.fatalCount > 0 || brokenPointers.length > 0 || locationCycles.length > 0) {
                healthStatus = IdentityHealthStatus.CRITICAL_FAILURE;
            } else if (collisionReport.errorCount > 0 || orphanOccurrences.length > 0 || unrootedOccurrences.length > 0) {
                healthStatus = IdentityHealthStatus.DEGRADED;
            } else if (collisionReport.warningCount > 0 || missingLifecycles.length > 0 || missingLocations.length > 0 || selfRefs.length > 0) {
                healthStatus = IdentityHealthStatus.HEALTHY_WITH_WARNINGS;
            }

            // Deterministic sorting of diagnostic issues
            brokenPointers.sort((a, b) => a.key.localeCompare(b.key));
            orphanOccurrences.sort((a, b) => a.occurrenceKey.localeCompare(b.occurrenceKey));
            ungroundedOrigins.sort((a, b) => a.originKey.localeCompare(b.originKey));
            unrootedOccurrences.sort((a, b) => a.occurrenceKey.localeCompare(b.occurrenceKey));

            return {
                auditTimestamp: 0,
                healthStatus,
                metrics: {
                    resourceTypesCount: registry.resourceTypes.size,
                    depositsCount: registry.deposits.size,
                    occurrencesCount: registry.occurrences.size,
                    originsCount: registry.origins.size,
                    ownershipsCount: registry.ownerships.size,
                    operatorsCount: registry.operators.size,
                    locationsCount: registry.locations.size,
                    lifecyclesCount: registry.lifecycles.size,
                    lineageRootsCount: registry.lineageRoots.size,
                    relationshipsCount: registry.relationships.size
                },
                diagnostics: {
                    brokenPointersCount: brokenPointers.length,
                    brokenPointers,
                    orphanOccurrencesCount: orphanOccurrences.length,
                    orphanOccurrences,
                    ungroundedOriginsCount: ungroundedOrigins.length,
                    ungroundedOrigins,
                    unrootedOccurrencesCount: unrootedOccurrences.length,
                    unrootedOccurrences,
                    missingLifecyclesCount: missingLifecycles.length,
                    missingLocationsCount: missingLocations.length,
                    selfReferencesCount: selfRefs.length,
                    selfReferences: selfRefs,
                    locationCyclesCount: locationCycles.length,
                    locationCycles: locationCycles,
                    collisionReport
                }
            };
        }
    }

    // =========================================================================
    // 04.24: STATE CHECKPOINT, SNAPSHOT & DELTA SERIALIZATION ENGINE
    // =========================================================================

    class IdentitySnapshotAdapter {
        static calculateAdler32(str) {
            let a = 1, b = 0;
            const MOD = 65521;
            for (let i = 0; i < str.length; i++) {
                a = (a + str.charCodeAt(i)) % MOD;
                b = (b + a) % MOD;
            }
            return ((b << 16) | a) >>> 0;
        }

        static createSnapshot(registry) {
            const payloadObject = {
                registryBuildId: registry.registryBuildId,
                identitySchemaVersion: registry.identitySchemaVersion,
                locations: Array.from(registry.locations.values()).map(e => e.toJSON()).sort((a, b) => a.locationNodeKey.localeCompare(b.locationNodeKey)),
                variantSpecs: Array.from(registry.variantSpecs.values()).map(e => e.toJSON()).sort((a, b) => a.specKey.localeCompare(b.specKey)),
                resourceTypes: Array.from(registry.resourceTypes.values()).map(e => e.toJSON()).sort((a, b) => a.identityKey.localeCompare(b.identityKey)),
                deposits: Array.from(registry.deposits.values()).map(e => e.toJSON()).sort((a, b) => a.depositKey.localeCompare(b.depositKey)),
                origins: Array.from(registry.origins.values()).map(e => e.toJSON()).sort((a, b) => a.originKey.localeCompare(b.originKey)),
                ownerships: Array.from(registry.ownerships.values()).map(e => e.toJSON()).sort((a, b) => a.ownershipKey.localeCompare(b.ownershipKey)),
                operators: Array.from(registry.operators.values()).map(e => e.toJSON()).sort((a, b) => a.operatorKey.localeCompare(b.operatorKey)),
                occurrences: Array.from(registry.occurrences.values()).map(e => e.toJSON()).sort((a, b) => a.occurrenceKey.localeCompare(b.occurrenceKey)),
                lifecycles: Array.from(registry.lifecycles.values()).map(e => e.toJSON()).sort((a, b) => a.occurrenceKey.localeCompare(b.occurrenceKey)),
                lineageRoots: Array.from(registry.lineageRoots.values()).map(e => e.toJSON()).sort((a, b) => a.rootKey.localeCompare(b.rootKey)),
                relationships: Array.from(registry.relationships.values()).map(e => e.toJSON()).sort((a, b) => a.relationshipKey.localeCompare(b.relationshipKey))
            };

            const serialized = JSON.stringify(payloadObject);
            const checksum = this.calculateAdler32(serialized);

            return {
                registryBuildId: payloadObject.registryBuildId,
                identitySchemaVersion: payloadObject.identitySchemaVersion,
                checksum,
                payload: serialized
            };
        }

        /**
         * Restores entities in strict topological dependency order.
         */
        static restoreSnapshot(registry, snapshot) {
            if (!snapshot || !snapshot.payload || typeof snapshot.checksum !== 'number') {
                throw new Error('[IdentitySnapshotAdapter]: Corrupt snapshot envelope.');
            }

            const computedChecksum = this.calculateAdler32(snapshot.payload);
            if (computedChecksum !== snapshot.checksum) {
                throw new Error('[IdentitySnapshotAdapter]: Checksum validation failure! Snapshot data corrupt.');
            }

            const data = JSON.parse(snapshot.payload);
            registry.clear();

            // 1. Locations
            data.locations.forEach(l => registry.registerLocation(new HierarchicalLocationIdentity(l)));
            // 2. Variant Specs
            data.variantSpecs.forEach(v => registry.registerVariantSpec(new ResourceVariantGradeSpec(v)));
            // 3. Resource Types
            data.resourceTypes.forEach(t => registry.registerResourceType(new ResourceTypeIdentity(t)));
            // 4. Deposits
            data.deposits.forEach(d => registry.registerDeposit(new GeologicalDepositIdentity(d)));
            // 5. Origins
            data.origins.forEach(o => registry.registerOrigin(new ResourceOriginIdentity(o)));
            // 6. Ownerships
            data.ownerships.forEach(w => registry.registerOwnership(new OwnershipIdentity(w)));
            // 7. Operators
            data.operators.forEach(p => registry.registerOperator(new OperatorIdentity(p)));
            // 8. Occurrences
            data.occurrences.forEach(c => registry.registerOccurrence(new ResourceOccurrenceIdentity(c), c.hostCountryIso3));
            // 9. Lifecycles
            data.lifecycles.forEach(f => registry.registerLifecycle(new ResourceLifecycleRecord(f)));
            // 10. Lineage Roots
            data.lineageRoots.forEach(r => registry.registerLineageRoot(new LineageRootNode(r)));
            // 11. Relationships
            data.relationships.forEach(rel => registry.registerRelationship(new IdentityRelationship(rel)));

            registry.registryBuildId = data.registryBuildId;
            registry.identitySchemaVersion = data.identitySchemaVersion;
            registry.lastCompiledTimestamp = 0;

            return {
                restoredSuccessfully: true,
                entityCount: registry.occurrences.size,
                checksum: snapshot.checksum
            };
        }
    }

    // =========================================================================
    // 04.25: BOUNDARY HARDCODING FIREWALL & SIMULATION GUARD
    // =========================================================================

    class BoundaryHardcodingFirewall {
        static get FORBIDDEN_SIMULATION_KEYS() {
            return [
                'depletionrate',
                'extractionyield',
                'marketprice',
                'spotprice',
                'productionrate',
                'profitmargin',
                'tradetariff',
                'operatingcostperton',
                'discountrate',
                'extractioncost',
                'processingyield'
            ];
        }

        static auditRegistry(registry) {
            const violations = [];

            const inspectDeep = (target, currentPath) => {
                if (!target || typeof target !== 'object') return;

                if (target instanceof Map) {
                    target.forEach((val, key) => {
                        const normKey = String(key).toLowerCase().replace(/[^a-z]/g, '');
                        if (this.FORBIDDEN_SIMULATION_KEYS.some(forbidden => normKey.includes(forbidden))) {
                            violations.push({ path: `${currentPath}.Map<${key}>`, forbiddenKey: String(key) });
                        }
                        inspectDeep(val, `${currentPath}.Map<${key}>`);
                    });
                    return;
                }

                if (target instanceof Set) {
                    let idx = 0;
                    target.forEach(val => {
                        inspectDeep(val, `${currentPath}.Set[${idx++}]`);
                    });
                    return;
                }

                if (Array.isArray(target)) {
                    target.forEach((val, idx) => {
                        inspectDeep(val, `${currentPath}[${idx}]`);
                    });
                    return;
                }

                Object.keys(target).forEach(key => {
                    const normKey = key.toLowerCase().replace(/[^a-z]/g, '');
                    if (this.FORBIDDEN_SIMULATION_KEYS.some(forbidden => normKey.includes(forbidden))) {
                        violations.push({ path: `${currentPath}.${key}`, forbiddenKey: key });
                    }
                    inspectDeep(target[key], `${currentPath}.${key}`);
                });
            };

            inspectDeep(registry.occurrences, 'Registry.Occurrences');
            inspectDeep(registry.deposits, 'Registry.Deposits');
            inspectDeep(registry.resourceTypes, 'Registry.ResourceTypes');
            inspectDeep(registry.origins, 'Registry.Origins');
            inspectDeep(registry.ownerships, 'Registry.Ownerships');
            inspectDeep(registry.operators, 'Registry.Operators');
            inspectDeep(registry.relationships, 'Registry.Relationships');

            return {
                isCompliant: violations.length === 0,
                violationsCount: violations.length,
                violations
            };
        }
    }

    // =========================================================================
    // 04.26: MASTER ATOMIC IDENTITY COMPILER PIPELINE
    // =========================================================================

    class ResourceIdentityCompilerPipeline {
        constructor() {
            this.authoritativeRegistry = new ResourceIdentityRegistry();
        }

        /**
         * Atomic Compilation: Builds in scratch space; on error/firewall breach,
         * prevents partial registry publication.
         */
        compile(knowledgeModel, worldStateRegistry = null, dataFoundationRegistry = null) {
            const scratch = new ResourceIdentityRegistry();

            try {
                // 1. Ingest Canonical Resource Types
                this._compileResourceTypes(scratch, knowledgeModel);

                // 2. Ingest Sovereign Ownership & Concessions
                this._compileOwnerships(scratch, knowledgeModel);

                // 3. Ingest Industrial Operators & Mining Authorities [RSK-02 Fixed]
                this._compileOperators(scratch, knowledgeModel);

                // 4. Ingest Deposits, Origins & Occurrences (Tier-B Ingest) [ERR-02 Fixed]
                this._compileDepositsAndOccurrences(scratch, knowledgeModel);

                // 5. Build Lineage Roots & Lifecycles
                this._compileLineageAndLifecycles(scratch, knowledgeModel);

                // 6. Diagnostics & Firewall Audit
                const diagnostics = IdentityDiagnosticsEngine.runComprehensiveAudit(scratch);
                const firewallAudit = BoundaryHardcodingFirewall.auditRegistry(scratch);

                if (diagnostics.healthStatus === IdentityHealthStatus.CRITICAL_FAILURE || !firewallAudit.isCompliant) {
                    return {
                        status: 'COMPILATION_FAILED',
                        compiledTimestamp: 0,
                        registry: null,
                        diagnostics,
                        firewallAudit,
                        isAuthoritative: false
                    };
                }

                // Compute Stable Build ID & Commit Scratch Registry Atomically
                scratch.registryBuildId = `BLD_${DeterministicKeyEngine.compute64BitHash(scratch.calculateSemanticDigest()).substring(0, 12)}`;
                scratch.lastCompiledTimestamp = 0;

                this.authoritativeRegistry = scratch;

                return {
                    status: 'COMPILATION_SUCCESSFUL',
                    registryBuildId: scratch.registryBuildId,
                    semanticDigest: scratch.calculateSemanticDigest(),
                    compiledTimestamp: scratch.lastCompiledTimestamp,
                    registry: this.authoritativeRegistry,
                    dispositionSummary: scratch.dispositionLedger.getSummary(),
                    diagnostics,
                    firewallAudit,
                    isAuthoritative: true
                };

            } catch (err) {
                return {
                    status: 'COMPILATION_EXCEPTION',
                    error: err.message,
                    registry: null,
                    isAuthoritative: false
                };
            }
        }

        _toEntries(collection) {
            if (!collection) return [];
            if (collection instanceof Map) {
                return Array.from(collection.entries());
            }
            if (Array.isArray(collection)) {
                return collection.map((item, idx) => [item.id || item.iso3 || item.isoCode || item.code || item.resourceId || String(idx), item]);
            }
            if (typeof collection === 'object') {
                return Object.entries(collection);
            }
            return [];
        }

        _compileResourceTypes(scratch, knowledgeModel) {
            if (!knowledgeModel) return;

            const rawResources = knowledgeModel.canonicalResources || 
                                 (knowledgeModel.sovereignEntities && knowledgeModel.sovereignEntities.resourceTypes) ||
                                 knowledgeModel.resources;

            const entries = this._toEntries(rawResources);
            entries.forEach(([id, res]) => {
                if (!res) return;
                const rawId = res.resourceId || res.id || res.code || id;
                const declaredUnit = res.unit || res.standardUnit || 'UNKNOWN_UNIT';
                const declaredDim = res.dimension || (declaredUnit !== 'UNKNOWN_UNIT' ? 'DECLARED' : 'UNKNOWN');

                const resType = new ResourceTypeIdentity({
                    resourceTypeId: rawId,
                    canonicalName: res.name || res.canonicalName || rawId,
                    standardSymbol: res.symbol || res.code || res.name || rawId,
                    declaredDimension: declaredDim,
                    declaredStandardUnit: declaredUnit,
                    physicalCategory: res.category || res.physicalCategory || ResourcePhysicalCategory.UNKNOWN_PHYSICAL_CATEGORY,
                    criticalityClassification: res.strategicImportance || res.strategicTier || 'UNKNOWN',
                    aliases: Array.isArray(res.aliases) ? res.aliases : [rawId, res.name || rawId],
                    provenance: ProvenanceBridgeEngine.bridgeToIdentityProvenance(res.provenance, 'PART_02_ONTOLOGY')
                });

                scratch.registerResourceType(resType);
                scratch.dispositionLedger.recordDisposition(rawId, CandidateDispositionState.ACCEPTED_NEW, resType.identityKey, 'CANONICAL_RESOURCE_TYPE');
            });
        }

        _compileOwnerships(scratch, knowledgeModel) {
            if (!knowledgeModel) return;

            const rawCountries = knowledgeModel.canonicalCountries || 
                                 (knowledgeModel.sovereignEntities && knowledgeModel.sovereignEntities.countries) ||
                                 knowledgeModel.countries;

            const entries = this._toEntries(rawCountries);
            entries.forEach(([countryId, country]) => {
                if (!country) return;
                const cIso3 = (country.iso3 || country.isoCode || country.countryId || country.id || countryId).toUpperCase();
                const sovereignOwnerId = `SOVEREIGN_STATE_${cIso3}`;

                const ownership = new OwnershipIdentity({
                    legalOwnerId: sovereignOwnerId,
                    sovereignJurisdictionIso3: cIso3,
                    controlModel: OwnershipControlModel.SOVEREIGN_EXCLUSIVE_STATE,
                    stateParticipationRatio: 1.0,
                    equityHolders: [
                        new OwnershipStakeHolder({
                            holderEntityId: sovereignOwnerId,
                            holderCanonicalName: `State Treasury & Mineral Cadastre of ${country.name || country.sovereignName || cIso3}`,
                            equityPercentage: 100.0,
                            isStateEntity: true,
                            domicileCountryIso3: cIso3
                        })
                    ],
                    provenance: ProvenanceBridgeEngine.bridgeToIdentityProvenance(country.provenance, 'SOVEREIGN_CADASTRE')
                });

                scratch.registerOwnership(ownership);
            });
        }

        _compileOperators(scratch, knowledgeModel) {
            if (!knowledgeModel) return;

            const rawCountries = knowledgeModel.canonicalCountries || 
                                 (knowledgeModel.sovereignEntities && knowledgeModel.sovereignEntities.countries) ||
                                 knowledgeModel.countries;

            const entries = this._toEntries(rawCountries);
            entries.forEach(([countryId, country]) => {
                if (!country) return;
                const cIso3 = (country.iso3 || country.isoCode || country.countryId || country.id || countryId).toUpperCase();
                const operatorId = `OPERATOR_AUTHORITY_${cIso3}`;

                const operator = new OperatorIdentity({
                    operatingCompanyId: operatorId,
                    operatingSiteOrCountry: cIso3,
                    canonicalOperatorName: `National Mineral & Energy Authority of ${country.name || country.sovereignName || cIso3}`,
                    domicileCountryIso3: cIso3,
                    operationalScope: 'SURFACE_AND_UNDERGROUND_MINING',
                    miningLeaseLicenseCode: `SOV_AUTH_LEASE_${cIso3}`,
                    environmentalPermitStatus: 'SOVEREIGN_AUTHORIZED',
                    provenance: ProvenanceBridgeEngine.bridgeToIdentityProvenance(country.provenance, 'NATIONAL_OPERATOR_CADASTRE')
                });

                scratch.registerOperator(operator);
            });
        }

        _compileDepositsAndOccurrences(scratch, knowledgeModel) {
            if (!knowledgeModel) return;

            const rawCountries = knowledgeModel.canonicalCountries || 
                                 (knowledgeModel.sovereignEntities && knowledgeModel.sovereignEntities.countries) ||
                                 knowledgeModel.countries;

            // 1. Ingest Canonical Sovereign Endowments
            const countryEntries = this._toEntries(rawCountries);
            countryEntries.forEach(([countryId, country]) => {
                if (!country) return;
                const cIso3 = (country.iso3 || country.isoCode || country.countryId || country.id || countryId).toUpperCase();

                if (Array.isArray(country.endowmentProfiles)) {
                    country.endowmentProfiles.forEach(endow => {
                        const rawItem = endow.resolvedResourceId || endow.rawItem || 'UNKNOWN_RESOURCE';
                        const resKey = DeterministicKeyEngine.generateResourceTypeKey(rawItem);

                        // Ensure ResourceType
                        if (!scratch.resourceTypes.has(resKey)) {
                            const resType = new ResourceTypeIdentity({
                                resourceTypeId: rawItem,
                                canonicalName: rawItem,
                                provenance: ProvenanceBridgeEngine.bridgeToIdentityProvenance(endow, 'ENDOWMENT_INFERRED')
                            });
                            scratch.registerResourceType(resType);
                        }

                        // Content-Based Invariant Deposit Key
                        const epistemicTag = endow.epistemicState || 'KNOWN';
                        const normResource = DeterministicKeyEngine.normalizeToken(rawItem);
                        const depositName = `${cIso3}_DEP_${normResource}_${epistemicTag}`;
                        const depositKey = DeterministicKeyEngine.generateDepositKey(cIso3, depositName);

                        if (!scratch.deposits.has(depositKey)) {
                            const locKey = DeterministicKeyEngine.generateLocationKey(cIso3, 'PRIMARY_PROVINCE', depositName);
                            const location = new HierarchicalLocationIdentity({
                                locationNodeKey: locKey,
                                countryIso3: cIso3,
                                adminStateProvince: 'PRIMARY_PROVINCE',
                                siteSpecificLocality: depositName,
                                lat: country.geography?.coordinates?.lat || null,
                                lng: country.geography?.coordinates?.lng || null,
                                provenance: ProvenanceBridgeEngine.bridgeToIdentityProvenance(endow, 'GEOGRAPHIC_ANCHOR')
                            });
                            scratch.registerLocation(location);

                            const deposit = new GeologicalDepositIdentity({
                                depositKey,
                                depositRawName: depositName,
                                hostCountryIso3: cIso3,
                                locationNodeKey: location.locationNodeKey,
                                resolutionStatus: IdentityResolutionStatus.RESOLVED,
                                provenance: ProvenanceBridgeEngine.bridgeToIdentityProvenance(endow, 'ENDOWMENT_DEPOSIT')
                            });
                            scratch.registerDeposit(deposit);

                            const origin = new ResourceOriginIdentity({
                                depositKey: deposit.depositKey,
                                hostCountryIso3: cIso3,
                                genesisStatus: OriginGenesisStatus.NATURAL_CRUSTAL_IN_SITU,
                                provenance: deposit.provenance
                            });
                            scratch.registerOrigin(origin);
                        }

                        const deposit = scratch.deposits.get(depositKey);
                        const origin = scratch.origins.get(DeterministicKeyEngine.generateOriginKey(depositKey, OriginGenesisStatus.NATURAL_CRUSTAL_IN_SITU));

                        let tier = ResourceOccurrenceTier.TIER_D_UNVERIFIED_OCCURRENCE;
                        if (endow.epistemicState === 'KNOWN') tier = ResourceOccurrenceTier.TIER_A_PRIMARY_KNOWN;
                        else if (endow.epistemicState === 'PROBABLE') tier = ResourceOccurrenceTier.TIER_B_SECONDARY_ASSOCIATED;
                        else if (endow.epistemicState === 'POTENTIAL') tier = ResourceOccurrenceTier.TIER_C_INFERRED_OCCURRENCE;

                        const occurrence = new ResourceOccurrenceIdentity({
                            resourceTypeId: rawItem,
                            depositKey: deposit.depositKey,
                            originKey: origin ? origin.originKey : null,
                            occurrenceTier: tier,
                            isPrimaryEndowment: true,
                            ownerKey: DeterministicKeyEngine.generateOwnershipKey(`SOVEREIGN_STATE_${cIso3}`, cIso3, OwnershipControlModel.SOVEREIGN_EXCLUSIVE_STATE),
                            operatorKey: DeterministicKeyEngine.generateOperatorKey(`OPERATOR_AUTHORITY_${cIso3}`, cIso3),
                            locationNodeKey: deposit.locationNodeKey,
                            confidenceScore: typeof endow.confidence === 'number' ? endow.confidence : 1.0,
                            provenance: ProvenanceBridgeEngine.bridgeToIdentityProvenance(endow, 'ENDOWMENT_OCCURRENCE')
                        });

                        deposit.addOccurrence(occurrence.occurrenceKey);
                        scratch.registerOccurrence(occurrence, cIso3);

                        scratch.dispositionLedger.recordDisposition(
                            `${cIso3}_${rawItem}`,
                            CandidateDispositionState.ACCEPTED_NEW,
                            occurrence.occurrenceKey,
                            'CANONICAL_ENDOWMENT'
                        );
                    });
                }
            });

            // 2. Ingest Reference Catalog / Deposits / Physical Assets
            const refCatalog = knowledgeModel.referenceCatalog || knowledgeModel.refCatalog;
            let allRefs = [];
            if (refCatalog && typeof refCatalog.getAllReferences === 'function') {
                allRefs = refCatalog.getAllReferences();
            } else if (refCatalog && refCatalog.allReferences && Array.isArray(refCatalog.allReferences)) {
                allRefs = refCatalog.allReferences;
            } else if (refCatalog && refCatalog.references instanceof Map) {
                allRefs = Array.from(refCatalog.references.values());
            } else if (Array.isArray(knowledgeModel.deposits)) {
                allRefs = knowledgeModel.deposits;
            } else if (Array.isArray(knowledgeModel.references)) {
                allRefs = knowledgeModel.references;
            }

            allRefs.forEach(ref => {
                if (!ref) return;
                const cIso3 = (ref.countryIso3 || ref.parentCountryId || ref.countryId || ref.hostCountry || 'GLOBAL').toUpperCase();
                const rawName = ref.name || ref.depositRawName || ref.rawReferenceString || ref.id || ref.referenceId;
                const normRef = DeterministicKeyEngine.normalizeToken(rawName);
                const depositKey = DeterministicKeyEngine.generateDepositKey(cIso3, normRef, ref.geologicalType || 'REF_PHYSICAL');

                if (!scratch.deposits.has(depositKey)) {
                    const locKey = DeterministicKeyEngine.generateLocationKey(cIso3, 'LOCALITY', normRef);
                    const location = new HierarchicalLocationIdentity({
                        locationNodeKey: locKey,
                        countryIso3: cIso3,
                        adminStateProvince: 'LOCALITY',
                        siteSpecificLocality: rawName,
                        lat: typeof ref.lat === 'number' ? ref.lat : (ref.coordinates ? ref.coordinates.lat : null),
                        lng: typeof ref.lng === 'number' ? ref.lng : (ref.coordinates ? ref.coordinates.lng : null),
                        provenance: ProvenanceBridgeEngine.bridgeToIdentityProvenance(ref, 'TIER_B_LOCATION')
                    });
                    scratch.registerLocation(location);

                    const deposit = new GeologicalDepositIdentity({
                        depositKey,
                        depositRawName: rawName,
                        hostCountryIso3: cIso3,
                        locationNodeKey: location.locationNodeKey,
                        geologicalType: ref.geologicalType || DepositTypeClassification.UNKNOWN_GEOLOGICAL,
                        resolutionStatus: IdentityResolutionStatus.RESOLVED,
                        provenance: ProvenanceBridgeEngine.bridgeToIdentityProvenance(ref, 'TIER_B_DEPOSIT')
                    });
                    scratch.registerDeposit(deposit);

                    const origin = new ResourceOriginIdentity({
                        depositKey: deposit.depositKey,
                        hostCountryIso3: cIso3,
                        genesisStatus: OriginGenesisStatus.NATURAL_CRUSTAL_IN_SITU,
                        provenance: deposit.provenance
                    });
                    scratch.registerOrigin(origin);

                    // If reference specifies a resource type, create Occurrence
                    const resTypeRaw = ref.resourceType || ref.resourceTypeCode || ref.resourceId;
                    if (resTypeRaw) {
                        const resKey = DeterministicKeyEngine.generateResourceTypeKey(resTypeRaw);
                        if (!scratch.resourceTypes.has(resKey)) {
                            const resType = new ResourceTypeIdentity({
                                resourceTypeId: resTypeRaw,
                                canonicalName: resTypeRaw,
                                provenance: ProvenanceBridgeEngine.bridgeToIdentityProvenance(ref, 'DEPOSIT_REF_RESOURCE')
                            });
                            scratch.registerResourceType(resType);
                        }

                        const occ = new ResourceOccurrenceIdentity({
                            resourceTypeId: resTypeRaw,
                            depositKey: deposit.depositKey,
                            originKey: origin.originKey,
                            occurrenceTier: ResourceOccurrenceTier.TIER_A_PRIMARY_KNOWN,
                            isPrimaryEndowment: true,
                            ownerKey: DeterministicKeyEngine.generateOwnershipKey(`SOVEREIGN_STATE_${cIso3}`, cIso3, OwnershipControlModel.SOVEREIGN_EXCLUSIVE_STATE),
                            operatorKey: DeterministicKeyEngine.generateOperatorKey(`OPERATOR_AUTHORITY_${cIso3}`, cIso3),
                            locationNodeKey: deposit.locationNodeKey,
                            confidenceScore: 1.0,
                            provenance: deposit.provenance
                        });
                        deposit.addOccurrence(occ.occurrenceKey);
                        scratch.registerOccurrence(occ, cIso3);
                    }

                    scratch.dispositionLedger.recordDisposition(
                        ref.id || ref.referenceId || rawName,
                        CandidateDispositionState.ACCEPTED_NEW,
                        deposit.depositKey,
                        'TIER_B_PHYSICAL_ASSET'
                    );
                }
            });
        }

        _compileLineageAndLifecycles(scratch, knowledgeModel) {
            scratch.occurrences.forEach((occ) => {
                const deposit = scratch.deposits.get(occ.depositKey);
                const hostCountry = deposit ? deposit.hostCountryIso3 : 'GLOBAL';

                // Lineage Root
                const root = new LineageRootNode({
                    occurrenceKey: occ.occurrenceKey,
                    depositKey: occ.depositKey,
                    originKey: occ.originKey || 'UNKNOWN_ORIGIN',
                    resourceTypeKey: occ.resourceTypeKey,
                    hostCountryIso3: hostCountry,
                    provenance: occ.provenance
                });
                scratch.registerLineageRoot(root);
                occ.bindLineageRoot(root.rootKey);

                // Lifecycle Assignment
                let initialPhase = ResourceLifecyclePhase.UNKNOWN_LIFECYCLE;
                if (occ.occurrenceTier === ResourceOccurrenceTier.TIER_A_PRIMARY_KNOWN) {
                    initialPhase = ResourceLifecyclePhase.RESOURCE_ASSESSED;
                } else if (occ.occurrenceTier === ResourceOccurrenceTier.TIER_B_SECONDARY_ASSOCIATED) {
                    initialPhase = ResourceLifecyclePhase.EXPLORATION_DELINEATED;
                } else if (occ.occurrenceTier === ResourceOccurrenceTier.TIER_C_INFERRED_OCCURRENCE) {
                    initialPhase = ResourceLifecyclePhase.DISCOVERED_UNASSESSED;
                }

                const lifecycle = new ResourceLifecycleRecord({
                    occurrenceKey: occ.occurrenceKey,
                    currentPhase: initialPhase,
                    phaseAssignedTick: 0,
                    initialRationale: 'DATA_FOUNDATION_EPISTEMIC_INIT',
                    provenance: occ.provenance
                });
                scratch.registerLifecycle(lifecycle);

                // Register Relationships
                if (occ.ownerKey) {
                    scratch.registerRelationship(new IdentityRelationship({
                        relationshipType: 'OWNS_OCCURRENCE',
                        subjectKey: occ.ownerKey,
                        objectKey: occ.occurrenceKey,
                        provenance: occ.provenance
                    }));
                }

                if (occ.operatorKey) {
                    scratch.registerRelationship(new IdentityRelationship({
                        relationshipType: 'OPERATES_OCCURRENCE',
                        subjectKey: occ.operatorKey,
                        objectKey: occ.occurrenceKey,
                        provenance: occ.provenance
                    }));
                }

                if (deposit && deposit.locationNodeKey) {
                    scratch.registerRelationship(new IdentityRelationship({
                        relationshipType: 'LOCATED_AT',
                        subjectKey: occ.occurrenceKey,
                        objectKey: deposit.locationNodeKey,
                        provenance: occ.provenance
                    }));
                }
            });
        }
    }

    // =========================================================================
    // 04.27: PUBLIC ADAPTER, DEEP FREEZE & UNIFIED ENGINE ASSEMBLY
    // =========================================================================

    function deepFreeze(obj, seen = new WeakSet()) {
        if (obj === null || typeof obj !== 'object' || seen.has(obj)) return obj;
        seen.add(obj);
        if (obj instanceof Map || obj instanceof Set) return obj;
        const propNames = Object.getOwnPropertyNames(obj);
        for (const name of propNames) {
            deepFreeze(obj[name], seen);
        }
        return Object.freeze(obj);
    }

    const ResourceIdentityEngineAdapter = Object.freeze({
        // Module 1 Enums & Basis Contracts
        IdentityResolutionStatus,
        UnknownSemanticState,
        ResourceOccurrenceTier,
        DepositTypeClassification,
        OriginGenesisStatus,
        OwnershipControlModel,
        ResourcePhysicalCategory,
        GradeClassificationTier,
        ResourceLifecyclePhase,
        CandidateDispositionState,
        CollisionSeverity,
        IdentityHealthStatus,
        ErrorTaxonomy,
        ComponentResolutionMatrix,
        CanonicalIdentitySerializer,
        DeterministicKeyEngine,
        IdentityBasisContract,
        ResourceTypeIdentity,
        GeologicalDepositIdentity,
        ResourceOriginIdentity,
        ResourceOccurrenceIdentity,
        OwnershipStakeHolder,
        OwnershipIdentity,
        OperatorIdentity,
        HierarchicalLocationIdentity,
        ResourceVariantGradeSpec,

        // Module 2 Engines & Systems
        LifecycleTransitionGuard,
        ResourceLifecycleRecord,
        IdentityFingerprintEngine,
        IdentityCollisionArbiter,
        IdentityAliasRegistry,
        IdentityRelationship,
        RelationshipIntegrityEngine,
        LineageRootNode,
        ProvenanceBridgeEngine,
        ResolutionDispositionLedger,
        IdentityIndexHub,
        ResourceIdentityRegistry,
        IdentityDiagnosticsEngine,
        IdentitySnapshotAdapter,
        BoundaryHardcodingFirewall,
        ResourceIdentityCompilerPipeline,

        deepFreeze,

        /**
         * Primary Entrypoint: Atomically compiles knowledge and world state into Part 04 Identities.
         */
        compileIdentities(knowledgeModel, worldStateRegistry = null, dataFoundationRegistry = null) {
            const compiler = new ResourceIdentityCompilerPipeline();
            return compiler.compile(knowledgeModel, worldStateRegistry, dataFoundationRegistry);
        }
    });

    global.GSRSK_Part04 = ResourceIdentityEngineAdapter;
    global.GSRSK_ResourceIdentityEngine = ResourceIdentityEngineAdapter;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            DataFoundation: global.GSRSK_DataFoundation || (typeof _globalScope !== 'undefined' ? _globalScope.GSRSK_DataFoundation : null),
            WorldKnowledgeCompiler: global.GSRSK_WorldKnowledgeCompiler || null,
            WorldStateEngineAdapter: global.GSRSK_Part03 || null,
            WorldStateEngine: global.GSRSK_WorldStateEngine || null,
            ResourceIdentityEngine: ResourceIdentityEngineAdapter,
            MasterGSRSKEngine: global.GSRSK_MasterEngine ? global.GSRSK_MasterEngine.constructor : null,
            MasterEngineSingleton: global.GSRSK_MasterEngine || null,
            Part01: global.GSRSK_DataFoundation || null,
            Part02: global.GSRSK_WorldKnowledgeCompiler || null,
            Part03: global.GSRSK_Part03 || null,
            Part04: ResourceIdentityEngineAdapter,
            ...ResourceIdentityEngineAdapter
        };
    }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : global));
