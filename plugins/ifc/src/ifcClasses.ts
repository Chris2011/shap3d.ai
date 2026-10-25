/**
 * The IFC4 element classes the export can write, with their number of STEP attributes and where
 * their PredefinedType sits (0-based; -1 = none). The first eight attributes are the same for all
 * elements (GlobalId … Tag), the rest are written as $ (all optional). Generated from the IFC4
 * schema in web-ifc; abstract classes, openings and the "StandardCase" variants (which need
 * layer-based geometry) are left out. Anything else becomes an IfcBuildingElementProxy.
 */
// i18n-ignore-start – IFC class names
const ELEMENT_ATTRIBUTES: Record<string, number> = {
  IfcActuator: 9,
  IfcAirTerminal: 9,
  IfcAirTerminalBox: 9,
  IfcAirToAirHeatRecovery: 9,
  IfcAlarm: 9,
  IfcAudioVisualAppliance: 9,
  IfcBeam: 9,
  IfcBoiler: 9,
  IfcBuildingElementPart: 9,
  IfcBuildingElementProxy: 9,
  IfcBurner: 9,
  IfcCableCarrierFitting: 9,
  IfcCableCarrierSegment: 9,
  IfcCableFitting: 9,
  IfcCableSegment: 9,
  IfcChiller: 9,
  IfcChimney: 9,
  IfcCivilElement: 8,
  IfcCoil: 9,
  IfcColumn: 9,
  IfcCommunicationsAppliance: 9,
  IfcCompressor: 9,
  IfcCondenser: 9,
  IfcController: 9,
  IfcCooledBeam: 9,
  IfcCoolingTower: 9,
  IfcCovering: 9,
  IfcCurtainWall: 9,
  IfcDamper: 9,
  IfcDiscreteAccessory: 9,
  IfcDistributionChamberElement: 9,
  IfcDistributionControlElement: 8,
  IfcDistributionElement: 8,
  IfcDistributionFlowElement: 8,
  IfcDoor: 13,
  IfcDuctFitting: 9,
  IfcDuctSegment: 9,
  IfcDuctSilencer: 9,
  IfcElectricAppliance: 9,
  IfcElectricDistributionBoard: 9,
  IfcElectricFlowStorageDevice: 9,
  IfcElectricGenerator: 9,
  IfcElectricMotor: 9,
  IfcElectricTimeControl: 9,
  IfcElementAssembly: 10,
  IfcEnergyConversionDevice: 8,
  IfcEngine: 9,
  IfcEvaporativeCooler: 9,
  IfcEvaporator: 9,
  IfcFan: 9,
  IfcFastener: 9,
  IfcFilter: 9,
  IfcFireSuppressionTerminal: 9,
  IfcFlowController: 8,
  IfcFlowFitting: 8,
  IfcFlowInstrument: 9,
  IfcFlowMeter: 9,
  IfcFlowMovingDevice: 8,
  IfcFlowSegment: 8,
  IfcFlowStorageDevice: 8,
  IfcFlowTerminal: 8,
  IfcFlowTreatmentDevice: 8,
  IfcFooting: 9,
  IfcFurnishingElement: 8,
  IfcFurniture: 9,
  IfcGeographicElement: 9,
  IfcHeatExchanger: 9,
  IfcHumidifier: 9,
  IfcInterceptor: 9,
  IfcJunctionBox: 9,
  IfcLamp: 9,
  IfcLightFixture: 9,
  IfcMechanicalFastener: 11,
  IfcMedicalDevice: 9,
  IfcMember: 9,
  IfcMotorConnection: 9,
  IfcOutlet: 9,
  IfcPile: 10,
  IfcPipeFitting: 9,
  IfcPipeSegment: 9,
  IfcPlate: 9,
  IfcProtectiveDevice: 9,
  IfcProtectiveDeviceTrippingUnit: 9,
  IfcPump: 9,
  IfcRailing: 9,
  IfcRamp: 9,
  IfcRampFlight: 9,
  IfcRoof: 9,
  IfcSanitaryTerminal: 9,
  IfcSensor: 9,
  IfcShadingDevice: 9,
  IfcSlab: 9,
  IfcSolarDevice: 9,
  IfcSpaceHeater: 9,
  IfcStackTerminal: 9,
  IfcStair: 9,
  IfcStairFlight: 13,
  IfcSwitchingDevice: 9,
  IfcSystemFurnitureElement: 9,
  IfcTank: 9,
  IfcTransformer: 9,
  IfcTransportElement: 9,
  IfcTubeBundle: 9,
  IfcUnitaryControlElement: 9,
  IfcUnitaryEquipment: 9,
  IfcValve: 9,
  IfcVibrationIsolator: 9,
  IfcWall: 9,
  IfcWasteTerminal: 9,
  IfcWindow: 13,
};

/** classes whose PredefinedType is not the ninth attribute */
const PREDEFINED_AT: Record<string, number> = {
  IfcDoor: 10,
  IfcWindow: 10,
  IfcElementAssembly: 9,
  IfcMechanicalFastener: 10,
  IfcPile: 8,
  IfcStairFlight: 12,
};
// i18n-ignore-end

export interface ElementClass {
  name: string;
  attributes: number;
  /** index of PredefinedType, -1 = the class has none */
  predefinedAt: number;
}

/** The class an element is written as: "IfcWallStandardCase" → IfcWall, unknown → IfcBuildingElementProxy. */
export const exportClass = (ifcClass: string | undefined): ElementClass => {
  const name = (ifcClass ?? '').replace(/(StandardCase|ElementedCase)$/, '');
  const known = ELEMENT_ATTRIBUTES[name] ? name : 'IfcBuildingElementProxy';
  const attributes = ELEMENT_ATTRIBUTES[known];
  return { name: known, attributes, predefinedAt: PREDEFINED_AT[known] ?? (attributes >= 9 ? 8 : -1) };
};

/** every class that can be chosen for a group, the spatial structure first */
export const CLASS_CHOICES = ['IfcSite', 'IfcBuilding', 'IfcBuildingStorey', 'IfcSpace', ...Object.keys(ELEMENT_ATTRIBUTES)];
