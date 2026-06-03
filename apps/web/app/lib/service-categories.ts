export type ServiceItem = { id: string; name: string };
export type ServiceCategory = { id: string; name: string; services: ServiceItem[] };

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    id: 'water', name: 'מים',
    services: [
      { id: 'comprehensive_drinking_water_test', name: 'בדיקה מקיפה לגילוי מתכות וחיידקים במי שתייה' },
      { id: 'drinking_water_bacteria_test',      name: 'בדיקת חיידקים במי שתייה' },
      { id: 'partial_metals_drinking_water_test', name: 'בדיקה חלקית לגילוי מתכות במי שתייה' },
      { id: 'full_metals_drinking_water_test',   name: 'בדיקה מלאה לגילוי מתכות במי שתייה' },
    ],
  },
  {
    id: 'odor', name: 'ריח',
    services: [
      { id: 'odor_investigation',    name: 'חקירה ואיתור מטרדי ריח בבנייני משרדים ועסקים' },
      { id: 'odor_panel_assessment', name: 'בדיקה לקביעת מפגע ריח ע״י צוות מריחים' },
    ],
  },
  {
    id: 'soil', name: 'קרקע',
    services: [
      { id: 'phase1_soil_survey',   name: 'סקר קרקע היסטורי (Phase 1)' },
      { id: 'phase2_soil_sampling', name: 'סקר דיגום קרקע (Phase 2)' },
      { id: 'soil_gas_survey',      name: 'סקר גז קרקע' },
    ],
  },
  {
    id: 'asbestos', name: 'אסבסט',
    services: [
      { id: 'asbestos_survey', name: 'סקר אסבסט' },
    ],
  },
  {
    id: 'air', name: 'אוויר',
    services: [
      { id: 'data_center_air_monitoring', name: 'בדיקות וניטור סביבתי לחדרי שרתים ומרכזי נתונים' },
      { id: 'office_air_quality',         name: 'בדיקת איכות אוויר במשרדים' },
      { id: 'air_mold_test',              name: 'בדיקת עובש באוויר' },
    ],
  },
  {
    id: 'radon', name: 'ראדון',
    services: [
      { id: 'short_term_radon_certified', name: 'בדיקת ראדון קצרת טווח באמצעות בודק מוסמך' },
      { id: 'short_term_radon_kit',       name: 'בדיקת ראדון קצרת טווח עם ערכה' },
      { id: 'long_term_radon_certified',  name: 'בדיקת ראדון ארוכת טווח באמצעות בודק מוסמך' },
      { id: 'long_term_radon_kit',        name: 'בדיקת ראדון ארוכת טווח עם ערכה' },
      { id: 'radon_form4',                name: 'בדיקת ראדון לטופס 4 עבור קבלנים' },
    ],
  },
  {
    id: 'noise', name: 'רעש',
    services: [
      { id: 'acoustic_report',        name: 'דוח אקוסטי / חוות דעת אקוסטית' },
      { id: 'acoustic_building_permit', name: 'דוח אקוסטי להיתר בנייה' },
      { id: 'impact_sound_test',      name: 'בדיקת קול הולם בין קומות' },
      { id: 'airborne_sound_test',    name: 'בדיקה אקוסטית לקול נישא באוויר בין דירות, משרדים ומבנים' },
      { id: 'plumbing_acoustic_test', name: 'בדיקה אקוסטית שרברבות' },
      { id: 'traffic_noise_test',     name: 'בדיקת רעש מתחבורה' },
      { id: 'environmental_noise_test', name: 'בדיקת רעש סביבתית' },
    ],
  },
  {
    id: 'radiation', name: 'קרינה',
    services: [
      { id: 'electric_grid_radiation', name: 'בדיקת קרינה מרשת החשמל' },
      { id: 'rf_radiation_test',       name: 'בדיקת קרינה RF' },
      { id: 'radiation_prediction',    name: 'חיזוי קרינה' },
      { id: 'radiation_shielding',     name: 'מיגון קרינה' },
    ],
  },
];

export function getServiceName(id: string): string {
  for (const cat of SERVICE_CATEGORIES) {
    const s = cat.services.find((s) => s.id === id);
    if (s) return s.name;
  }
  return id;
}

export function getCategoryName(id: string): string {
  return SERVICE_CATEGORIES.find((c) => c.id === id)?.name ?? id;
}
