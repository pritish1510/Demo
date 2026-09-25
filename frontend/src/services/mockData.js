// Dummy data shaped exactly like the API contract, so pages built against it
// work unchanged once the real backend is connected.

export const SAMPLE_IMAGES = {
  front: { fileName: 'sample-biscuit-front.png', imageUrl: '/samples/biscuit-front.svg' },
  back: { fileName: 'sample-biscuit-back.png', imageUrl: '/samples/biscuit-back.svg' },
};

const r = (ruleId, fieldName, status, confidence, extractedValue, evidenceBoundingBox = null, extra = {}) => ({
  ruleId,
  fieldName,
  status,
  extractedValue,
  confidence,
  evidenceText: extractedValue,
  evidenceBoundingBox,
  needsInspectorReview: status !== 'PASS' && status !== 'NOT_APPLICABLE',
  ...extra,
});

/** Results for the sample biscuit label — bounding boxes match public/samples/biscuit-back.svg (600×800). */
export function sampleBiscuitResults() {
  const img = { imageUrl: SAMPLE_IMAGES.back.imageUrl };
  return [
    r('LMPC-6-1-A-MFR', 'Manufacturer', 'PASS', 0.96, 'Sunrise Foods Pvt. Ltd., Plot 14, MIDC Bhosari, Pune 411026', '[34,252,492,300]', img),
    r('LMPC-6-1-C-GENERIC', 'Generic Name', 'PASS', 0.94, 'Cream Biscuits', '[34,322,318,352]', img),
    r('LMPC-6-1-D-NETQTY', 'Net Quantity', 'PASS', 0.98, '200 g', '[34,372,250,410]', img),
    r('LMPC-6-1-E-MRP', 'MRP', 'PASS', 0.96, 'MRP Rs. 100', '[120,450,340,490]', img),
    r('LMPC-6-1-F-PKDATE', 'Pack Date', 'REVIEW_REQUIRED', 0.61, 'PKD: 14/0?/2026', '[34,520,262,556]', {
      ...img,
      evidenceText: 'PKD: 14/0?/2026 (month digit partially illegible)',
    }),
    r('LMPC-6-1-G-CARE', 'Consumer Care', 'POTENTIAL_SHORTFALL', 0.72, 'care@sunrisefoods.in', '[34,590,330,642]', {
      ...img,
      evidenceText: 'For consumer complaints, write to: care@sunrisefoods.in — no telephone number or address detected',
    }),
    r('FSSAI-LBL-BEST-BEFORE', 'Best Before', 'REVIEW_REQUIRED', 0.58, 'Best before 9 months from', '[284,520,566,556]', {
      ...img,
      evidenceText: 'BEST BEFORE 9 MONTHS FROM — text cut off at package fold',
    }),
    r('LMPC-6-1-B-ORIGIN', 'Country of Origin', 'NOT_APPLICABLE', null, null, null, {
      evidenceText: 'Not required — product declared as Indian origin',
    }),
  ];
}

/** Text-only results for seeded history rows (no images in demo data). */
function textResults(values, statuses = {}) {
  const fields = [
    ['LMPC-6-1-A-MFR', 'Manufacturer', 'mfr'],
    ['LMPC-6-1-C-GENERIC', 'Generic Name', 'generic'],
    ['LMPC-6-1-D-NETQTY', 'Net Quantity', 'netQty'],
    ['LMPC-6-1-E-MRP', 'MRP', 'mrp'],
    ['LMPC-6-1-F-PKDATE', 'Pack Date', 'pkd'],
    ['LMPC-6-1-G-CARE', 'Consumer Care', 'care'],
    ['LMPC-6-1-B-ORIGIN', 'Country of Origin', 'origin'],
  ];
  return fields.map(([ruleId, fieldName, key], i) => {
    const [status, confidence] = statuses[key] ?? (values[key] ? ['PASS', 0.9 + ((i * 7) % 9) / 100] : ['NOT_APPLICABLE', null]);
    return r(ruleId, fieldName, status, confidence, values[key] ?? null);
  });
}

const daysAgo = (d, h = 10, m = 30) => {
  const t = new Date();
  t.setDate(t.getDate() - d);
  t.setHours(h, m, 0, 0);
  return t.toISOString();
};

export function seedInspections() {
  const seeds = [
    {
      id: 1009,
      inspectionCode: 'INS-7F3A91C2',
      productName: 'Sample Biscuit',
      category: 'FOOD',
      contextType: 'RETAIL_PACKAGE',
      originType: 'INDIAN',
      status: 'REVIEW_REQUIRED',
      createdAt: daysAgo(0, 9, 42),
      images: [
        { id: 91, ...SAMPLE_IMAGES.front },
        { id: 92, ...SAMPLE_IMAGES.back },
      ],
      results: sampleBiscuitResults(),
    },
    {
      id: 1008,
      inspectionCode: 'INS-2B8D4E10',
      productName: 'Mango Fruit Drink 200 ml',
      category: 'BEVERAGES',
      contextType: 'RETAIL_PACKAGE',
      originType: 'INDIAN',
      status: 'COMPLETED',
      createdAt: daysAgo(1, 16, 5),
      results: textResults({
        mfr: 'Tropic Beverages Ltd., Sonipat, Haryana',
        generic: 'Mango Fruit Drink',
        netQty: '200 ml',
        mrp: 'MRP ₹20',
        pkd: 'PKD 08/2026',
        care: '1800-102-3344, care@tropic.in',
      }),
    },
    {
      id: 1007,
      inspectionCode: 'INS-C91E0A57',
      productName: 'Herbal Neem Face Wash 100 ml',
      category: 'COSMETICS',
      contextType: 'RETAIL_PACKAGE',
      originType: 'INDIAN',
      status: 'REVIEW_REQUIRED',
      createdAt: daysAgo(1, 11, 20),
      results: textResults(
        {
          mfr: 'Vana Naturals, Baddi, Himachal Pradesh',
          generic: 'Face Wash',
          netQty: '100 ml',
          mrp: 'MRP ₹1?9',
          pkd: 'Mfg 07/2026',
          care: 'vananaturals.in',
        },
        { mrp: ['REVIEW_REQUIRED', 0.55], care: ['POTENTIAL_SHORTFALL', 0.81] },
      ),
    },
    {
      id: 1006,
      inspectionCode: 'INS-5D0F3B88',
      productName: 'Basmati Rice 25 kg',
      category: 'FOOD',
      contextType: 'BULK_INSTITUTIONAL',
      originType: 'INDIAN',
      status: 'COMPLETED',
      createdAt: daysAgo(2, 14, 50),
      results: textResults({
        mfr: 'Kisan Agro Mills, Karnal, Haryana',
        generic: 'Basmati Rice',
        netQty: '25 kg',
        mrp: 'MRP ₹2,450',
        pkd: 'PKD 06/2026',
        care: '0184-2250011',
      }),
    },
    {
      id: 1005,
      inspectionCode: 'INS-A4E6720D',
      productName: 'Cotton Crew T-Shirt',
      category: 'APPAREL',
      contextType: 'ECOMMERCE_LISTING',
      originType: 'INDIAN',
      status: 'COMPLETED',
      createdAt: daysAgo(3, 12, 15),
      results: textResults({
        mfr: 'Loomcraft Apparel, Tiruppur, Tamil Nadu',
        generic: 'T-Shirt',
        netQty: '1 N',
        mrp: 'MRP ₹599',
        pkd: 'Mfg 05/2026',
        care: 'support@loomcraft.in',
      }),
    },
    {
      id: 1004,
      inspectionCode: 'INS-0E7C19B4',
      productName: 'Imported Dark Chocolate 100 g',
      category: 'IMPORTED_GOODS',
      contextType: 'RETAIL_PACKAGE',
      originType: 'IMPORTED',
      status: 'REVIEW_REQUIRED',
      createdAt: daysAgo(4, 15, 40),
      results: textResults(
        {
          mfr: 'Chocolaterie Alpine AG, Switzerland',
          generic: 'Dark Chocolate',
          netQty: '100 g',
          mrp: 'MRP ₹450',
          pkd: 'PKD 03/2026',
          care: '+41 44 000 1122',
          origin: 'Made in Switzerland',
        },
        { mfr: ['POTENTIAL_SHORTFALL', 0.77], care: ['POTENTIAL_SHORTFALL', 0.69], pkd: ['LOW_CONFIDENCE', 0.42] },
      ),
    },
    {
      id: 1003,
      inspectionCode: 'INS-93B2F6E1',
      productName: 'Stainless Steel Water Bottle 1 L',
      category: 'ECOMMERCE_LISTING',
      contextType: 'ECOMMERCE_LISTING',
      originType: 'UNKNOWN',
      status: 'UPLOADED',
      createdAt: daysAgo(5, 10, 5),
      images: [{ id: 31, ...SAMPLE_IMAGES.front }],
    },
    {
      id: 1002,
      inspectionCode: 'INS-6C5A08DF',
      productName: 'Toor Dal 1 kg',
      category: 'GENERAL_PACKAGED_GOODS',
      contextType: 'RETAIL_PACKAGE',
      originType: 'INDIAN',
      status: 'CREATED',
      createdAt: daysAgo(6, 17, 30),
    },
    {
      id: 1001,
      inspectionCode: 'INS-E27D4C3A',
      productName: 'Sunscreen SPF 50 50 g',
      category: 'COSMETICS',
      contextType: 'RETAIL_PACKAGE',
      originType: 'INDIAN',
      status: 'COMPLETED',
      createdAt: daysAgo(8, 13, 10),
      results: textResults({
        mfr: 'DermaLeaf Labs, Vapi, Gujarat',
        generic: 'Sunscreen Lotion',
        netQty: '50 g',
        mrp: 'MRP ₹349',
        pkd: 'Mfg 04/2026',
        care: '1800-200-7788',
      }),
    },
  ];
  return seeds.map((s) => ({ images: [], results: null, reviews: {}, ...s }));
}
