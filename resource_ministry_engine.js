                const subType = (ref.metadata && ref.metadata.subType) || ref.subType || '';
                const category = ref.category || '';

                // 1. Only mines, deposits, and geological sites become Geological Deposits
                const isGeologicalSite = (
                    subType === 'mineSites' ||
                    category === 'GEOLOGICAL_SITE' ||
                    category === 'DEPOSIT' ||
                    Boolean(ref.geologicalType) ||
                    Boolean(ref.resourceType || ref.resourceTypeCode || ref.resourceId || ref.resId || ref.resIdCode)
                );

                if (isGeologicalSite) {
                    const depositKey = DeterministicKeyEngine.generateDepositKey(cIso3, normRef, 'MINE_SITE');
                    if (!scratch.deposits.has(depositKey)) {
                        const locKey = DeterministicKeyEngine.generateLocationKey(cIso3, 'LOCALITY', normRef);
                        const location = new HierarchicalLocationIdentity({
                            locationNodeKey: locKey,
                            countryIso3: cIso3,
                            adminStateProvince: 'LOCALITY',
                            siteSpecificLocality: rawName,
                            lat: typeof ref.lat === 'number' ? ref.lat : (ref.coordinates ? ref.coordinates.lat : null),
                            lng: typeof ref.lng === 'number' ? ref.lng : (ref.coordinates ? ref.coordinates.lng : null),
                            provenance: ProvenanceBridgeEngine.bridgeToIdentityProvenance(ref, 'TIER_B_MINE_LOCATION')
                        });
                        scratch.registerLocation(location);

                        const deposit = new GeologicalDepositIdentity({
                            depositKey,
                            depositRawName: rawName,
                            hostCountryIso3: cIso3,
                            locationNodeKey: location.locationNodeKey,
                            geologicalType: ref.geologicalType || DepositTypeClassification.UNKNOWN_GEOLOGICAL,
                            resolutionStatus: IdentityResolutionStatus.RESOLVED,
                            provenance: ProvenanceBridgeEngine.bridgeToIdentityProvenance(ref, 'TIER_B_MINE_DEPOSIT')
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
                        const resTypeRaw = ref.resourceType || ref.resourceTypeCode || ref.resourceId || ref.resId || ref.resourceTypeId;
                        if (resTypeRaw) {