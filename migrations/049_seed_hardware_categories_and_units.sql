-- Migration 049: Seed Hardware Store Categories and Units of Measurement
-- Automatically populates standard categories and units with comprehensive descriptions
-- for retail and wholesale hardware, construction, plumbing, electrical, and tools.

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: SEED HARDWARE STORE PRODUCT CATEGORIES
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO categories (category_name, description)
SELECT 'Masonry & Cement', 'Portland cement, pozzolan, concrete hollow blocks (CHB), aggregates, sand, gravel, tiling grout, and skim coat'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'masonry & cement');

INSERT INTO categories (category_name, description)
SELECT 'Steel & Rebars', 'Deformed structural rebars (kabilya), angle bars, flat bars, square tubing, C-purlins, and G.I. tie wire'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'steel & rebars');

INSERT INTO categories (category_name, description)
SELECT 'Lumber & Wood Products', 'Ordinary plywood, marine plywood, phenolic board, coco lumber, good lumber, and framing wood'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'lumber & wood products');

INSERT INTO categories (category_name, description)
SELECT 'Roofing & Tinsmithing', 'Corrugated G.I. sheets, rib-type roofing panels, plain G.I. sheets, ridge rolls, flashings, and gutters'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'roofing & tinsmithing');

INSERT INTO categories (category_name, description)
SELECT 'Plumbing & Pipes', 'PVC blue potable water pipes, PVC orange sanitary pipes, PPR pipes, ball valves, gate valves, faucets, and fittings'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'plumbing & pipes');

INSERT INTO categories (category_name, description)
SELECT 'Electrical & Wiring', 'THHN/THWN copper building wires, PDX wire, royal cord, circuit breakers, panel boards, and conduit pipes'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'electrical & wiring');

INSERT INTO categories (category_name, description)
SELECT 'Lighting & Fixtures', 'LED bulbs, fluorescent tubes, flood lights, convenience outlets, wall switches, receptacles, and extension cords'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'lighting & fixtures');

INSERT INTO categories (category_name, description)
SELECT 'Paints & Primers', 'Acrylic latex paints, quick-drying enamel, epoxy primers, flat wall enamel, roof paint, lacquer, and wood stains'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'paints & primers');

INSERT INTO categories (category_name, description)
SELECT 'Paint Sundries & Applicators', 'Paint brushes (1" to 4"), paint rollers, paint trays, masking tape, sandpaper, and putty knives'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'paint sundries & applicators');

INSERT INTO categories (category_name, description)
SELECT 'Chemicals, Solvents & Adhesives', 'Paint thinner, lacquer thinner, Vulcaseal, silicone sealant, PVC solvent cement, epoxy clay, and waterproofing'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'chemicals, solvents & adhesives');

INSERT INTO categories (category_name, description)
SELECT 'Fasteners & Nails', 'Common wire nails (CWN), concrete nails, blind rivets, drywall screws, tex screws, tox, and expansion bolts'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'fasteners & nails');

INSERT INTO categories (category_name, description)
SELECT 'Locks & Door Hardware', 'Cylindrical door knobs, deadbolts, padlocks, door hinges, concealed hinges, barrel bolts, and drawer glides'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'locks & door hardware');

INSERT INTO categories (category_name, description)
SELECT 'Hand Tools', 'Claw hammers, sledgehammers, pliers, screwdrivers, adjustable wrenches, pipe wrenches, hand saws, and trowels'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'hand tools');

INSERT INTO categories (category_name, description)
SELECT 'Power Tools & Machinery', 'Angle grinders, rotary hammer drills, circular saws, inverter welding machines, cut-off machines, and pumps'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'power tools & machinery');

INSERT INTO categories (category_name, description)
SELECT 'Power Tool Consumables', 'Cutting discs (4", 14"), grinding discs, masonry drill bits, metal drill bits, welding rods (E6013), and diamond blades'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'power tool consumables');

INSERT INTO categories (category_name, description)
SELECT 'Cutting Tools', 'Utility knives, tin snips, bolt cutters, hacksaws, replacement blades, and heavy duty shears'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'cutting tools');

INSERT INTO categories (category_name, description)
SELECT 'Safety & PPE', 'Safety hard hats, protective goggles, cotton/rubber coated gloves, welding face masks, dust masks, and safety boots'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'safety & ppe');

INSERT INTO categories (category_name, description)
SELECT 'Lawn & Gardening / General', 'Garden hoses, shovels, wheelbarrows, garden rakes, nylon cord, plastic pails, and utility items'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'lawn & gardening / general');

INSERT INTO categories (category_name, description)
SELECT 'Raw Materials', 'Bulk washed sand, crushed gravel, aggregate base course, crushed rock, and structural filling material'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'raw materials');

INSERT INTO categories (category_name, description)
SELECT 'Fuel & Lubricants', 'Kerosene, gasoline, engine oil, chain lube, WD-40 multi-use lubricant, and industrial grease'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(category_name) = 'fuel & lubricants');

-- Update descriptions of existing categories if they were empty
UPDATE categories SET description = 'Claw hammers, sledgehammers, pliers, screwdrivers, adjustable wrenches, pipe wrenches, hand saws, and trowels'
WHERE LOWER(category_name) = 'hand tools' AND (description IS NULL OR description = '');

UPDATE categories SET description = 'Corrugated G.I. sheets, rib-type roofing panels, plain G.I. sheets, ridge rolls, flashings, and gutters'
WHERE LOWER(category_name) = 'roofing' AND (description IS NULL OR description = '');

UPDATE categories SET description = 'Bulk washed sand, crushed gravel, aggregate base course, crushed rock, and structural filling material'
WHERE LOWER(category_name) = 'raw materials' AND (description IS NULL OR description = '');

UPDATE categories SET description = 'Kerosene, gasoline, engine oil, chain lube, WD-40 multi-use lubricant, and industrial grease'
WHERE LOWER(category_name) = 'fuel' AND (description IS NULL OR description = '');

UPDATE categories SET description = 'Utility knives, tin snips, bolt cutters, hacksaws, replacement blades, and heavy duty shears'
WHERE LOWER(category_name) = 'cutting tools' AND (description IS NULL OR description = '');


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: SEED HARDWARE STORE UNITS OF MEASUREMENT
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Piece (Count)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Piece', 'pc', 'Count', 0, 'Active', 'Individual piece or unit item')
ON DUPLICATE KEY UPDATE
  unit_name = 'Piece',
  unit_type = 'Count',
  allow_decimal = 0,
  status = 'Active',
  description = 'Individual piece or unit item';

-- 2. Set (Count)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Set', 'set', 'Count', 0, 'Active', 'Multi-piece set (e.g. lockset, tool kit, shower set)')
ON DUPLICATE KEY UPDATE
  unit_type = 'Count',
  allow_decimal = 0,
  status = 'Active',
  description = 'Multi-piece set (e.g. lockset, tool kit, shower set)';

-- 3. Pair (Count)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Pair', 'pair', 'Count', 0, 'Active', 'Sold as a pair (e.g. hinges, gloves, drawer slides)')
ON DUPLICATE KEY UPDATE
  unit_type = 'Count',
  allow_decimal = 0,
  status = 'Active',
  description = 'Sold as a pair (e.g. hinges, gloves, drawer slides)';

-- 4. Dozen (Count)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Dozen', 'dz', 'Count', 0, 'Active', 'Twelve (12) piece package quantity')
ON DUPLICATE KEY UPDATE
  unit_type = 'Count',
  allow_decimal = 0,
  status = 'Active',
  description = 'Twelve (12) piece package quantity';

-- 5. Kilogram (Weight)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Kilogram', 'kg', 'Weight', 1, 'Active', 'Weight measurement for nails, wire, gravel, welding rods')
ON DUPLICATE KEY UPDATE
  unit_type = 'Weight',
  allow_decimal = 1,
  status = 'Active',
  description = 'Weight measurement for nails, wire, gravel, welding rods';

-- 6. Gram (Weight)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Gram', 'g', 'Weight', 1, 'Active', 'Small weight measurement for colorants and specialty powders')
ON DUPLICATE KEY UPDATE
  unit_type = 'Weight',
  allow_decimal = 1,
  status = 'Active',
  description = 'Small weight measurement for colorants and specialty powders';

-- 7. Bag (Packaging)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Bag', 'bag', 'Packaging', 0, 'Active', 'Commercial bagged goods (e.g. 40kg cement, 25kg grout, skim coat)')
ON DUPLICATE KEY UPDATE
  unit_type = 'Packaging',
  allow_decimal = 0,
  status = 'Active',
  description = 'Commercial bagged goods (e.g. 40kg cement, 25kg grout, skim coat)';

-- 8. Meter (Length)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Meter', 'm', 'Length', 1, 'Active', 'Linear meter for electrical wire, garden hose, flexible pipe')
ON DUPLICATE KEY UPDATE
  unit_type = 'Length',
  allow_decimal = 1,
  status = 'Active',
  description = 'Linear meter for electrical wire, garden hose, flexible pipe';

-- 9. Foot (Length)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Foot', 'ft', 'Length', 1, 'Active', 'Linear foot for lumber, chain, or steel pipe cut to order')
ON DUPLICATE KEY UPDATE
  unit_type = 'Length',
  allow_decimal = 1,
  status = 'Active',
  description = 'Linear foot for lumber, chain, or steel pipe cut to order';

-- 10. Roll (Packaging)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Roll', 'roll', 'Packaging', 0, 'Active', 'Whole roll (e.g. electrical tape, Teflon tape, wire mesh)')
ON DUPLICATE KEY UPDATE
  unit_type = 'Packaging',
  allow_decimal = 0,
  status = 'Active',
  description = 'Whole roll (e.g. electrical tape, Teflon tape, wire mesh)';

-- 11. Length (Length)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Length', 'length', 'Length', 0, 'Active', 'Standard full-length bar or pipe (e.g. 6m rebar, 3m PVC/PPR pipe)')
ON DUPLICATE KEY UPDATE
  unit_type = 'Length',
  allow_decimal = 0,
  status = 'Active',
  description = 'Standard full-length bar or pipe (e.g. 6m rebar, 3m PVC/PPR pipe)';

-- 12. Sheet (Area)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Sheet', 'sheet', 'Area', 0, 'Active', 'Panel board or sheet (e.g. 4x8 plywood, marine board, G.I. sheet)')
ON DUPLICATE KEY UPDATE
  unit_type = 'Area',
  allow_decimal = 0,
  status = 'Active',
  description = 'Panel board or sheet (e.g. 4x8 plywood, marine board, G.I. sheet)';

-- 13. Liter (Volume)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Liter', 'L', 'Volume', 1, 'Active', 'Liquid volume for thinners, liquid additives, and solvents')
ON DUPLICATE KEY UPDATE
  unit_type = 'Volume',
  allow_decimal = 1,
  status = 'Active',
  description = 'Liquid volume for thinners, liquid additives, and solvents';

-- 14. Gallon (Volume)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Gallon', 'gal', 'Volume', 0, 'Active', 'Standard 4-Liter container for house paint, primers, and sealers')
ON DUPLICATE KEY UPDATE
  unit_type = 'Volume',
  allow_decimal = 0,
  status = 'Active',
  description = 'Standard 4-Liter container for house paint, primers, and sealers';

-- 15. Pail (Volume)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Pail', 'pail', 'Volume', 0, 'Active', 'Commercial 16L/20L bulk paint or waterproofing container')
ON DUPLICATE KEY UPDATE
  unit_type = 'Volume',
  allow_decimal = 0,
  status = 'Active',
  description = 'Commercial 16L/20L bulk paint or waterproofing container';

-- 16. Tube (Packaging)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Tube', 'tube', 'Packaging', 0, 'Active', 'Cartridge or tube container (e.g. silicone, Vulcaseal, sealant)')
ON DUPLICATE KEY UPDATE
  unit_type = 'Packaging',
  allow_decimal = 0,
  status = 'Active',
  description = 'Cartridge or tube container (e.g. silicone, Vulcaseal, sealant)';

-- 17. Bottle (Packaging)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Bottle', 'btl', 'Packaging', 0, 'Active', 'Bottle container for solvents, super glue, muriatic acid')
ON DUPLICATE KEY UPDATE
  unit_type = 'Packaging',
  allow_decimal = 0,
  status = 'Active',
  description = 'Bottle container for solvents, super glue, muriatic acid';

-- 18. Can (Packaging)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Can', 'can', 'Packaging', 0, 'Active', 'Spray can, small tin, or aerosol container')
ON DUPLICATE KEY UPDATE
  unit_type = 'Packaging',
  allow_decimal = 0,
  status = 'Active',
  description = 'Spray can, small tin, or aerosol container';

-- 19. Box (Packaging)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Box', 'box', 'Packaging', 0, 'Active', 'Complete boxed pack of screws, blind rivets, or wire spools')
ON DUPLICATE KEY UPDATE
  unit_type = 'Packaging',
  allow_decimal = 0,
  status = 'Active',
  description = 'Complete boxed pack of screws, blind rivets, or wire spools';

-- 20. Bundle (Packaging)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Bundle', 'bundle', 'Packaging', 0, 'Active', 'Tied bundle of rebar (10s/20s), tie wire, or conduit pipes')
ON DUPLICATE KEY UPDATE
  unit_type = 'Packaging',
  allow_decimal = 0,
  status = 'Active',
  description = 'Tied bundle of rebar (10s/20s), tie wire, or conduit pipes';

-- 21. Cubic Meter (Volume)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Cubic Meter', 'cu.m', 'Volume', 1, 'Active', 'Bulk volume measurement for aggregate sand, gravel, and soil')
ON DUPLICATE KEY UPDATE
  unit_type = 'Volume',
  allow_decimal = 1,
  status = 'Active',
  description = 'Bulk volume measurement for aggregate sand, gravel, and soil';

-- 22. Truckload (Packaging)
INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, status, description)
VALUES ('Truckload', 'truck', 'Packaging', 0, 'Active', 'Dump truck or elf truck delivery of sand, gravel, and boulders')
ON DUPLICATE KEY UPDATE
  unit_type = 'Packaging',
  allow_decimal = 0,
  status = 'Active',
  description = 'Dump truck or elf truck delivery of sand, gravel, and boulders';
