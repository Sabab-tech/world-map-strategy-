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

window.GSRSK_DataFoundation = (() => {
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

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = PublicCompilerAdapter;
    } else {
        global.GSRSK_WorldKnowledgeCompiler = PublicCompilerAdapter;
    }

})(typeof window !== 'undefined' ? window : globalThis);

/**
 * ============================================================================
 * GSRSK — PART 03: AUTHORITATIVE WORLD STATE ENGINE & MUTATION CORE
 * ============================================================================
 * Architecture Phase: 03 of 16 (Unified Authoritative State Engine)
 * Constitutional Role: Universal Mutable State Standards, Multi-Dimensional
 *                      Quantity Engine, Location & Spatial Contracts, Multi-Layer
 *                      Ownership Model, Temporal Engine, Base State Envelopes,
 *                      Sovereign Entities, Physical Asset Containers, Command-Driven
 *                      Mutation Pipeline, Invariant Verification, Multi-Index Store,
 *                      Adler32 Checkpoints, Knowledge Hydrator & Master Orchestrator.
 * 
 * STRICT CONSTITUTIONAL BOUNDARIES & USER MANDATES:
 * 1. Reference ≠ Canonical Asset ≠ Operational Asset:
 *    - References from Part 02 refCatalog are indexed as UNVERIFIED_REFERENCE entities.
 *    - They are NOT promoted to factual canonical operational assets.
 *    - isReferenceOnly: true, factualPromotionBlocked: true.
 * 2. Strict Unit/Dimension Enforcement:
 *    - Source declares unit -> use declared unit.
 *    - Source does NOT declare unit -> unit: 'UNKNOWN_UNIT', dimension: UNKNOWN.
 *    - NEVER guess or hardcode (Iron -> MASS, Oil -> VOLUME, Gas -> VOLUME).
 * 3. Operational Status Separation & Provenance:
 *    - sourceDeclaredOperationalStatus and engineLiveOperationalStatus are strictly separated.
 *    - ZERO assumption of ACTIVE/OPERATIONAL by default (default is UNKNOWN / UNVERIFIED).
 * 4. Zero Simulation Math in Part 03:
 *    - Part 03 defines, validates, indexes, and stores mutable state envelopes.
 *    - No extraction yields, trade pricing math, or market clearance formulas.
 * 5. Full Pipeline Integration:
 *    - Seamless connectivity across Part 01 (Data Foundation), Part 02 (Knowledge Compiler),
 *      and Part 03 (World State Engine & Mutation Core).
 * ============================================================================
 */

(function(global) {
    'use strict';

    // =========================================================================
    // 03.01: EPISTEMIC, LIFECYCLE, OPERATIONAL & STATE CLASSIFICATION ENUMS
    // =========================================================================

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
            // RULE: Explicit Separation of Reference vs Canonical vs Operational
            isReferenceOnly = false,
            referenceStatus = ReferenceStatus.CANONICAL_PROVEN,
            sourceDeclaredOperationalStatus = null,
            engineLiveOperationalStatus = OperationalStatus.UNKNOWN,
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
            this.sourceDeclaredOperationalStatus = sourceDeclaredOperationalStatus;
            this.engineLiveOperationalStatus = engineLiveOperationalStatus;
            this.statusProvenance = statusProvenance || {
                sourceDeclared: Boolean(sourceDeclaredOperationalStatus),
                declaredStatus: sourceDeclaredOperationalStatus || null,
                engineDerived: !Boolean(sourceDeclaredOperationalStatus)
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
                sourceDeclaredOperationalStatus: this.sourceDeclaredOperationalStatus,
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
            this.assetHealthIndex = typeof params.assetHealthIndex === 'number' ? params.assetHealthIndex : 1.0;
            this.conversionEfficiencyRatio = typeof params.conversionEfficiencyRatio === 'number' ? params.conversionEfficiencyRatio : 0.95;
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
                metadata: this.metadata,
                isReferenceOnly: this.isReferenceOnly,
                referenceStatus: this.referenceStatus,
                sourceDeclaredOperationalStatus: this.sourceDeclaredOperationalStatus,
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
            this.throughputCapacityPerDay = params.throughputCapacityPerDay || null;
            this.congestionRatio = typeof params.congestionRatio === 'number' ? params.congestionRatio : 0.0;
            this.corridorConnectedNodes = Array.isArray(params.corridorConnectedNodes) ? [...params.corridorConnectedNodes] : [];
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
                metadata: this.metadata,
                isReferenceOnly: this.isReferenceOnly,
                referenceStatus: this.referenceStatus,
                sourceDeclaredOperationalStatus: this.sourceDeclaredOperationalStatus,
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
    // 03.10: MUTATION PIPELINE, COMMANDS & INVARIANT VALIDATORS
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
    // 03.11: HIGH-SPEED WORLD STATE REGISTRY & MULTI-INDEX STORE
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
            if (!this.typeIndex.has(entity.entityType)) this.typeIndex.set(entity.entityType, new Set());
            this.typeIndex.get(entity.entityType).add(entity.entityId);

            // Country index
            const countryId = entity.location?.countryId || 'GLOBAL';
            if (!this.countryIndex.has(countryId)) this.countryIndex.set(countryId, new Set());
            this.countryIndex.get(countryId).add(entity.entityId);

            // Operational status index
            const opStatus = entity.operationalStatus || OperationalStatus.UNKNOWN;
            if (!this.operationalStatusIndex.has(opStatus)) this.operationalStatusIndex.set(opStatus, new Set());
            this.operationalStatusIndex.get(opStatus).add(entity.entityId);

            // Lifecycle status index
            const lifeStatus = entity.lifecycleStatus || LifecycleStatus.UNKNOWN;
            if (!this.lifecycleStatusIndex.has(lifeStatus)) this.lifecycleStatusIndex.set(lifeStatus, new Set());
            this.lifecycleStatusIndex.get(lifeStatus).add(entity.entityId);

            // Reference index
            if (entity.isReferenceOnly) {
                this.referenceIndex.set(entity.entityId, entity);
            }
        }

        _removeFromIndexes(entity) {
            if (this.typeIndex.has(entity.entityType)) this.typeIndex.get(entity.entityType).delete(entity.entityId);
            const countryId = entity.location?.countryId || 'GLOBAL';
            if (this.countryIndex.has(countryId)) this.countryIndex.get(countryId).delete(entity.entityId);
            const opStatus = entity.operationalStatus || OperationalStatus.UNKNOWN;
            if (this.operationalStatusIndex.has(opStatus)) this.operationalStatusIndex.get(opStatus).delete(entity.entityId);
            const lifeStatus = entity.lifecycleStatus || LifecycleStatus.UNKNOWN;
            if (this.lifecycleStatusIndex.has(lifeStatus)) this.lifecycleStatusIndex.get(lifeStatus).delete(entity.entityId);
            if (this.referenceIndex.has(entity.entityId)) this.referenceIndex.delete(entity.entityId);
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
    // 03.12: DETERMINISTIC CHECKPOINT & ADLER-32 SNAPSHOT ENGINE
    // =========================================================================

    class WorldStateSnapshotEngine {
        static calculateAdler32(str) {
            let a = 1, b = 0;
            const MOD_ADLER = 65521;
            for (let i = 0; i < str.length; i++) {
                a = (a + str.charCodeAt(i)) % MOD_ADLER;
                b = (b + a) % MOD_ADLER;
            }
            return ((b << 16) | a) >>> 0;
        }

        static createSnapshot(registry, tick = 0, calendarDate = '2030-01-01') {
            const entitiesArray = registry.getAll().map(e => e.toJSON());
            const serialized = JSON.stringify(entitiesArray);
            const checksum = this.calculateAdler32(serialized);

            return {
                timestamp: Date.now(),
                tick,
                calendarDate,
                entityCount: entitiesArray.length,
                checksum,
                data: serialized
            };
        }

        static restoreSnapshot(registry, snapshot) {
            if (!snapshot || !snapshot.data || typeof snapshot.checksum !== 'number') {
                throw new Error('[WorldStateSnapshotEngine]: Invalid snapshot payload.');
            }

            const calculatedChecksum = this.calculateAdler32(snapshot.data);
            if (calculatedChecksum !== snapshot.checksum) {
                throw new Error('[WorldStateSnapshotEngine]: Adler-32 Checksum mismatch! Corrupt snapshot detected.');
            }

            registry.clear();
            const entitiesRaw = JSON.parse(snapshot.data);

            for (const item of entitiesRaw) {
                let entity;
                switch (item.entityType) {
                    case EntityStateType.COUNTRY_STATE:
                        entity = new CountryState(item);
                        break;
                    case EntityStateType.RESOURCE_TYPE_STATE:
                        entity = new ResourceTypeState(item);
                        break;
                    case EntityStateType.DEPOSIT_STATE:
                        entity = new DepositState(item);
                        break;
                    case EntityStateType.EXTRACTION_ASSET_STATE:
                        entity = new ExtractionAssetState(item);
                        break;
                    case EntityStateType.FACILITY_STATE:
                        entity = new FacilityState(item);
                        break;
                    case EntityStateType.INFRASTRUCTURE_STATE:
                        entity = new InfrastructureState(item);
                        break;
                    case EntityStateType.STORAGE_FACILITY_STATE:
                        entity = new StorageFacilityState(item);
                        break;
                    case EntityStateType.ORGANIZATION_STATE:
                        entity = new OrganizationState(item);
                        break;
                    case EntityStateType.MARKET_STATE:
                        entity = new MarketState(item);
                        break;
                    case TradeState:
                    case EntityStateType.TRADE_STATE:
                        entity = new TradeState(item);
                        break;
                    default:
                        entity = new BaseStateEntity(item);
                        break;
                }

                // Restore dynamic sub-containers
                if (item.quantities) {
                    Object.entries(item.quantities).forEach(([k, v]) => entity.setQuantity(k, new QuantityRecord(v)));
                }
                if (item.capabilities) {
                    Object.entries(item.capabilities).forEach(([k, v]) => entity.registerCapability(k, v));
                }
                if (item.conditions) {
                    Object.entries(item.conditions).forEach(([k, v]) => entity.setCondition(k, v));
                }
                if (item.relationships) {
                    Object.entries(item.relationships).forEach(([k, arr]) => {
                        if (Array.isArray(arr)) arr.forEach(target => entity.addRelationship(k, target));
                    });
                }
                entity.provenanceChain = Array.isArray(item.provenanceChain) ? item.provenanceChain : [];

                registry.register(entity);
            }

            return {
                restoredCount: registry.getAll().length,
                tick: snapshot.tick,
                calendarDate: snapshot.calendarDate,
                checksum: snapshot.checksum
            };
        }
    }

    // =========================================================================
    // 03.13: MASTER WORLD STATE ENGINE & KNOWLEDGE HYDRATOR
    // =========================================================================

    class WorldStateEngine {
        constructor() {
            this.registry = new WorldStateRegistry();
            this.currentTick = 0;
            this.calendarDate = '2030-01-01';
            this.isHydrated = false;
            this.snapshots = new Map();
        }

        /**
         * Hydrates WorldStateEngine from Part 02 WorldKnowledgeModel
         * STRICT ARCHITECTURAL RULES:
         * 1. Sovereign canonical entities are hydrated directly.
         * 2. References (refCatalog) are registered strictly as UNVERIFIED_REFERENCE
         *    entities (isReferenceOnly: true, factualPromotionBlocked: true).
         * 3. Source units are preserved as-is. Undefined units -> 'UNKNOWN_UNIT', QuantityDimension.UNKNOWN.
         * 4. Operational status from Part 03 vs Source-declared operational status are separated.
         *    No assumption of ACTIVE/OPERATIONAL by default.
         */
        hydrateFromKnowledgeModel(knowledgeModel) {
            if (!knowledgeModel) {
                throw new Error('[WorldStateEngine]: knowledgeModel is required for hydration.');
            }

            this.registry.clear();

            // 1. Hydrate Sovereign Countries (Canonical Tier-A)
            if (knowledgeModel.sovereignEntities && knowledgeModel.sovereignEntities.countries) {
                knowledgeModel.sovereignEntities.countries.forEach(country => {
                    const countryState = new CountryState({
                        entityId: country.id || country.isoCode,
                        isoCode: country.isoCode || country.id,
                        canonicalName: country.name || country.canonicalName || country.id,
                        locationState: new LocationState({
                            countryId: country.id || country.isoCode,
                            locationType: LocationType.SOVEREIGN_TERRITORY
                        }),
                        lifecycleStatus: LifecycleStatus.ACTIVE,
                        operationalStatus: OperationalStatus.OPERATIONAL,
                        metadata: { source: 'WORLD_KNOWLEDGE_COMPILER_CANONICAL' }
                    });

                    // Set reserves if source declared
                    if (country.gdp || country.gdpTreasury) {
                        countryState.setQuantity('TREASURY_GDP', new QuantityRecord({
                            value: Number(country.gdp || country.gdpTreasury),
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
            if (knowledgeModel.sovereignEntities && knowledgeModel.sovereignEntities.resourceTypes) {
                knowledgeModel.sovereignEntities.resourceTypes.forEach(res => {
                    const declaredUnit = res.unit || res.standardUnit || 'UNKNOWN_UNIT';
                    const declaredDimension = (declaredUnit !== 'UNKNOWN_UNIT' && res.dimension) 
                        ? res.dimension 
                        : QuantityDimension.UNKNOWN;

                    const resState = new ResourceTypeState({
                        entityId: res.id || res.resourceId,
                        resourceId: res.id || res.resourceId,
                        standardSymbol: res.symbol || res.id,
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

            // 3. Hydrate Reference Catalog (Tier-B References)
            // MANDATE: Reference != Canonical Asset != Operational Asset
            // Preserved strictly as UNVERIFIED references, NOT promoted to active factual physical assets!
            if (knowledgeModel.refCatalog && Array.isArray(knowledgeModel.refCatalog.allReferences)) {
                knowledgeModel.refCatalog.allReferences.forEach(ref => {
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
                        engineLiveOperationalStatus: OperationalStatus.UNKNOWN,
                        statusProvenance: {
                            sourceDeclared: isSourceDeclared,
                            declaredStatus: sourceDeclaredStatus,
                            factualPromotionBlocked: true
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
            
            // Execute state mutation
            if (currentEntity) {
                if (command.payload.operationalStatus) {
                    currentEntity.operationalStatus = command.payload.operationalStatus;
                    currentEntity.engineLiveOperationalStatus = command.payload.operationalStatus;
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
    // 03.14: UNIFIED PUBLIC ADAPTER & MASTER GSRSK PIPELINE
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
        }
    });

    /**
     * Master GSRSK Engine: Seamless End-to-End Orchestrator
     * Unifies Part 01 (Foundation), Part 02 (Knowledge Compiler), and Part 03 (World State Engine)
     */
    class MasterGSRSKEngine {
        constructor() {
            this.dataFoundation = global.GSRSK_DataFoundation || null;
            this.compiler = global.GSRSK_WorldKnowledgeCompiler || null;
            this.stateEngine = new WorldStateEngine();
            this.isReady = false;
        }

        bootstrap(inputData = {}) {
            // 1. Data Foundation
            if (!this.dataFoundation && global.GSRSK_DataFoundation) {
                this.dataFoundation = global.GSRSK_DataFoundation;
            }

            // 2. Compile Knowledge or normalize input
            let knowledgeModel = null;
            if (inputData && inputData.sovereignEntities && inputData.refCatalog) {
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
                    refCatalog: {
                        allReferences: inputData.deposits || inputData.references || []
                    }
                };
            }

            // 3. Hydrate World State
            const hydrationResult = this.stateEngine.hydrateFromKnowledgeModel(knowledgeModel);
            this.isReady = true;
            return {
                status: 'READY',
                hydration: hydrationResult,
                tick: this.stateEngine.currentTick,
                calendarDate: this.stateEngine.calendarDate
            };
        }

        getStateEngine() {
            return this.stateEngine;
        }

        queryEntities(filterFn) {
            const all = this.stateEngine.registry.getAll();
            return typeof filterFn === 'function' ? all.filter(filterFn) : all;
        }
    }

    const MasterEngineSingleton = new MasterGSRSKEngine();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            WorldStateEngineAdapter,
            MasterGSRSKEngine,
            MasterEngineSingleton
        };
    } else {
        global.GSRSK_Part03 = WorldStateEngineAdapter;
        global.GSRSK_WorldStateEngine = WorldStateEngineAdapter;
        global.GSRSK_MasterEngine = MasterEngineSingleton;
        global.GSRSK_Engine = MasterEngineSingleton;
    }

})(typeof window !== 'undefined' ? window : globalThis);
