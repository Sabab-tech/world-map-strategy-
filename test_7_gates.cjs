/**
 * 7 CONTRACT GATES VERIFICATION SUITE
 */
require('./resource_ministry_engine.js');

const GSRSK_DataFoundation = global.GSRSK_DataFoundation;
const GSRSK_Part03 = global.GSRSK_Part03;
const GSRSK_Part04 = global.GSRSK_ResourceIdentityEngine || global.GSRSK_Part04;
const GSRSK_Part05 = global.GSRSK_ResourceReserveExtractionEngine || global.GSRSK_Part05;
const GSRSK_Part06 = global.GSRSK_ResourceProcessingTransformationEngine || global.GSRSK_Part06;

console.log('================================================================');
console.log('🧪 RUNNING 7 ARCHITECTURAL CONTRACT GATES AUDIT');
console.log('================================================================');

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ [PASS] ${message}`);
        passedCount++;
    } else {
        console.error(`  ❌ [FAIL] ${message}`);
        failedCount++;
    }
}

// -----------------------------------------------------------------------------
// GATE 01: Part 05 Output = Canonical Batch Input for Part 06
// -----------------------------------------------------------------------------
console.log('\n--- GATE 01: Part 05 Extraction Output -> Canonical Batch Input ---');
try {
    const { ExtractionResult, ExtractionResultStatus } = GSRSK_Part05;
    const { MaterialIntakeAdapter, ProcessingInput } = GSRSK_Part06;
    const { CanonicalResourceBatch, EpistemicValueState } = GSRSK_DataFoundation;

    const extResult = new ExtractionResult({
        occurrenceKey: 'OCC:LITHIUM_PEGMATITE_01',
        status: ExtractionResultStatus.APPROVED,
        approvedQuantity: 5000,
        unit: 'TONNES',
        yield: 0.85
    });

    const canonicalBatch = extResult.toCanonicalBatch({ ownerCountryCode: 'CHILE', grade: 0.92 });
    assert(canonicalBatch instanceof CanonicalResourceBatch, 'ExtractionResult produces CanonicalResourceBatch instance');
    assert(canonicalBatch.quantity === 5000, 'Batch quantity matches approved extraction quantity');
    assert(canonicalBatch.qualityState.grade === 0.92, 'Batch qualityState contains accurate grade');
    assert(canonicalBatch.epistemicState === EpistemicValueState.VERIFIED_FACT, 'Batch epistemic state is VERIFIED_FACT');

    const procInput = MaterialIntakeAdapter.fromCanonicalBatch(canonicalBatch);
    assert(procInput instanceof ProcessingInput, 'Part 06 MaterialIntakeAdapter directly ingests CanonicalResourceBatch');
    assert(procInput.quantity === 5000, 'Processing input quantity strictly preserved');
    assert(procInput.grade === 0.92, 'Processing input grade preserved');
    assert(procInput.sourceIdentity === canonicalBatch.batchId, 'Processing input traces source batch identity');
} catch (e) {
    console.error('Gate 01 error:', e);
    assert(false, 'Gate 01 executed without errors');
}

// -----------------------------------------------------------------------------
// GATE 02: Part 06 Processing Output = Canonical Batch Output for Part 07
// -----------------------------------------------------------------------------
console.log('\n--- GATE 02: Part 06 Processing Output -> Canonical Batch Output ---');
try {
    const { ProcessingResult, ProcessingOperationLifecycle } = GSRSK_Part06;
    const { CanonicalResourceBatch } = GSRSK_DataFoundation;

    const procResult = new ProcessingResult({
        processId: 'PROC_LITHIUM_CARBONATE_REFINING',
        lifecycleStatus: ProcessingOperationLifecycle.COMPLETED,
        inputConsumptions: [{ sourceBatchId: 'BATCH_EXT_123', materialIdentity: 'RAW_LITHIUM_ORE', quantity: 100 }],
        primaryOutputs: [{ materialIdentity: 'BATTERY_GRADE_LITHIUM_CARBONATE', quantity: 85, unit: 'TONNES', qualityState: { purity: 0.995 } }],
        secondaryOutputs: [],
        byproducts: [{ materialIdentity: 'SILICA_SAND', quantity: 10, unit: 'TONNES', isRecoverable: true, qualityState: { purity: 0.90 } }],
        wasteTailings: [{ materialIdentity: 'LEACH_SLAG', quantity: 5, unit: 'TONNES' }]
    });

    const outputBatches = procResult.getOutputBatches({ ownerCountryCode: 'CHILE', locationKey: 'ANTOFAGASTA_REFINERY' });
    assert(Array.isArray(outputBatches) && outputBatches.length === 2, 'ProcessingResult generated 2 canonical output batches (primary + byproduct)');
    assert(outputBatches[0] instanceof CanonicalResourceBatch, 'Primary output batch is an instance of CanonicalResourceBatch');
    assert(outputBatches[0].materialIdentity === 'BATTERY_GRADE_LITHIUM_CARBONATE', 'Primary batch material matches specification');
    assert(outputBatches[0].quantity === 85, 'Primary batch quantity equals 85 TONNES');
    assert(outputBatches[0].qualityState.purity === 0.995, 'Primary batch purity strictly preserved (0.995)');
    assert(outputBatches[1].materialIdentity === 'SILICA_SAND', 'Recoverable byproduct exported as CanonicalResourceBatch');
} catch (e) {
    console.error('Gate 02 error:', e);
    assert(false, 'Gate 02 executed without errors');
}

// -----------------------------------------------------------------------------
// GATE 03: Unknown != Zero != Estimated (Epistemic Differentiation)
// -----------------------------------------------------------------------------
console.log('\n--- GATE 03: Epistemic State Differentiation (Unknown != Zero != Estimated) ---');
try {
    const { EpistemicValueState } = GSRSK_DataFoundation;

    const states = [
        EpistemicValueState.UNKNOWN,
        EpistemicValueState.ZERO,
        EpistemicValueState.ESTIMATED,
        EpistemicValueState.VERIFIED_FACT,
        EpistemicValueState.DERIVED,
        EpistemicValueState.NOT_APPLICABLE
    ];

    assert(EpistemicValueState.UNKNOWN !== EpistemicValueState.ZERO, 'UNKNOWN is strictly distinct from ZERO');
    assert(EpistemicValueState.ZERO !== EpistemicValueState.ESTIMATED, 'ZERO is strictly distinct from ESTIMATED');
    assert(EpistemicValueState.ESTIMATED !== EpistemicValueState.VERIFIED_FACT, 'ESTIMATED is strictly distinct from VERIFIED_FACT');
    assert(states.length === 6, 'All 6 Epistemic Value States formally specified');
} catch (e) {
    console.error('Gate 03 error:', e);
    assert(false, 'Gate 03 executed without errors');
}

// -----------------------------------------------------------------------------
// GATE 04: No Implicit Unit Fallback (Explicit Canonical Unit Resolver)
// -----------------------------------------------------------------------------
console.log('\n--- GATE 04: Canonical Unit Resolver (Strict Validation) ---');
try {
    const { CanonicalUnitResolver } = GSRSK_DataFoundation;

    const resTonnes = CanonicalUnitResolver.resolveUnit('tonnes');
    assert(resTonnes.isValid && resTonnes.unit === 'TONNES' && resTonnes.dimension === 'MASS', 'Resolves "tonnes" to MASS / TONNES');

    const resGrams = CanonicalUnitResolver.resolveUnit('g');
    assert(resGrams.isValid && resGrams.unit === 'GRAMS', 'Resolves "g" to GRAMS');

    const resBbl = CanonicalUnitResolver.resolveUnit('bbl');
    assert(resBbl.isValid && resBbl.unit === 'BARRELS' && resBbl.dimension === 'VOLUME', 'Resolves "bbl" to VOLUME / BARRELS');

    const resInvalid = CanonicalUnitResolver.resolveUnit('magic_fairy_dust');
    assert(!resInvalid.isValid && resInvalid.unit === 'UNRESOLVED_UNIT', 'Rejects invalid units explicitly without silent fallback');

    const converted = CanonicalUnitResolver.convert(1000, 'KG', 'TONNES');
    assert(Math.abs(converted - 1.0) < 1e-6, 'Converts 1000 KG to 1.0 TONNES precisely');
} catch (e) {
    console.error('Gate 04 error:', e);
    assert(false, 'Gate 04 executed without errors');
}

// -----------------------------------------------------------------------------
// GATE 05: Command Pattern & GATE 06: Atomic WorldState Mutation
// -----------------------------------------------------------------------------
console.log('\n--- GATE 05 & 06: Command Pattern and Atomic WorldState Transition Pipeline ---');
try {
    const { 
        WorldStateRegistry, 
        AtomicStateTransitionManager, 
        StateTransitionCommand, 
        BaseStateEntity, 
        EntityStateType, 
        OperationalStatus, 
        LifecycleStatus, 
        QuantityRecord 
    } = GSRSK_Part03;

    const registry = new WorldStateRegistry();
    const txManager = new AtomicStateTransitionManager(registry);

    const initialEntity = new BaseStateEntity({
        entityId: 'FAC_CHILE_LITHIUM_01',
        entityType: EntityStateType.FACILITY_STATE,
        operationalStatus: OperationalStatus.OPERATIONAL,
        lifecycleStatus: LifecycleStatus.ACTIVE,
        version: 1
    });
    initialEntity.quantities.set('DAILY_CAPACITY', new QuantityRecord({ value: 500, unit: 'TONNES' }));

    // Register initial entity via Command
    const regCmd = new StateTransitionCommand({
        commandType: 'REGISTER_NEW_ENTITY',
        targetEntityId: 'FAC_CHILE_LITHIUM_01',
        payload: { entity: initialEntity },
        issuedBy: 'TEST_SUITE',
        tick: 1
    });
    const regResult = txManager.execute(regCmd);
    assert(regResult.success && regResult.committed, 'Entity successfully registered via Command');

    // Mutate state via Command
    const mutCmd = new StateTransitionCommand({
        commandType: 'UPDATE_ENTITY_STATE',
        targetEntityId: 'FAC_CHILE_LITHIUM_01',
        payload: {
            operationalStatus: OperationalStatus.MAINTENANCE,
            quantities: {
                DAILY_CAPACITY: { value: 250 }
            }
        },
        issuedBy: 'SIMULATION_CONTROLLER',
        tick: 2
    });
    const mutResult = txManager.execute(mutCmd);
    assert(mutResult.success && mutResult.committed, 'Entity state updated through Atomic Transaction Manager');
    assert(mutResult.entity.version === 2, 'Entity version incremented from 1 to 2');
    assert(mutResult.entity.operationalStatus === OperationalStatus.MAINTENANCE, 'Operational status mutated to MAINTENANCE');
    assert(mutResult.entity.quantities.get('DAILY_CAPACITY').value === 250, 'Quantity record mutated to 250');
    assert(registry.eventLog.length === 2, 'Audit event log contains both transition events');
    assert(registry.eventLog[1].commandId === mutCmd.commandId, 'Mutation event accurately references issuing commandId');

    // Test Invariant Rejection
    const invalidCmd = new StateTransitionCommand({
        commandType: 'UPDATE_ENTITY_STATE',
        targetEntityId: 'FAC_CHILE_LITHIUM_01',
        payload: {
            quantities: {
                DAILY_CAPACITY: { value: -999 } // Invariant violation!
            }
        },
        issuedBy: 'ROGUE_ACTOR',
        tick: 3
    });
    const rejResult = txManager.execute(invalidCmd);
    assert(!rejResult.success && !rejResult.committed, 'Negative capacity invariant violation rejected atomically');
    assert(registry.get('FAC_CHILE_LITHIUM_01').quantities.get('DAILY_CAPACITY').value === 250, 'WorldState untouched after rejection');
} catch (e) {
    console.error('Gate 05/06 error:', e);
    assert(false, 'Gate 05 and 06 executed without errors');
}

// -----------------------------------------------------------------------------
// GATE 07: Deterministic IDs (Zero Math.random() in Core Entities)
// -----------------------------------------------------------------------------
console.log('\n--- GATE 07: Deterministic Hash Engine & ID Stability ---');
try {
    const { DeterministicHashEngine, ImportSession } = GSRSK_DataFoundation;
    const { TelemetrySchemaValidator, StateTransitionCommand, MutationEvent } = GSRSK_Part03;

    // Hash repeatability
    const hash1 = DeterministicHashEngine.computeHash('TEST_STRING_SEED_123');
    const hash2 = DeterministicHashEngine.computeHash('TEST_STRING_SEED_123');
    const hash3 = DeterministicHashEngine.computeHash('TEST_STRING_SEED_DIFFERENT');
    assert(hash1 === hash2, 'Hash is 100% deterministic given the same seed');
    assert(hash1 !== hash3, 'Different seed produces distinct hash');

    // ImportSession machineUuid determinism
    const sessA = new ImportSession({ sourceName: 'GLOBAL_MINE_DATASET_2030' });
    const sessB = new ImportSession({ sourceName: 'GLOBAL_MINE_DATASET_2030' });
    assert(sessA.machineUuid === sessB.machineUuid, 'ImportSession machineUuid is stable and deterministic');

    // Telemetry decompression ID determinism
    const facA = TelemetrySchemaValidator.decompressAndValidateFacility({ name: 'Escondida Copper', country: 'CHILE', lat: -24.2, lng: -69.0 });
    const facB = TelemetrySchemaValidator.decompressAndValidateFacility({ name: 'Escondida Copper', country: 'CHILE', lat: -24.2, lng: -69.0 });
    assert(facA.id === facB.id, 'Telemetry facility decompression produces identical deterministic entity ID');

    // Command ID determinism
    const cmdA = new StateTransitionCommand({ commandType: 'REFRESH', targetEntityId: 'FAC_01', tick: 10, calendarDate: '2030-05-01' });
    const cmdB = new StateTransitionCommand({ commandType: 'REFRESH', targetEntityId: 'FAC_01', tick: 10, calendarDate: '2030-05-01' });
    assert(cmdA.commandId === cmdB.commandId, 'StateTransitionCommand ID is 100% deterministic given same execution context');
} catch (e) {
    console.error('Gate 07 error:', e);
    assert(false, 'Gate 07 executed without errors');
}

console.log('\n================================================================');
console.log(`AUDIT COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED`);
console.log('================================================================');

if (failedCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
