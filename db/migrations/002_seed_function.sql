-- 002_seed_function.sql — default Tally-style chart of accounts and units,
-- created for every new organization. Runs with the caller's rights inside
-- withOrg(), so RLS still applies (org_id must equal app.org_id).

create or replace function seed_organization(p_org uuid) returns void
language plpgsql as $$
declare
  g record;
begin
  if p_org is distinct from app_org_id() then
    raise exception 'seed_organization: org mismatch' using errcode = '42501';
  end if;

  -- Primary groups: (code, name, nature, affects_gross_profit)
  insert into account_groups (org_id, code, name, nature, affects_gross_profit, is_system)
  select p_org, x.code, x.name, x.nature::group_nature, x.gp, true
  from (values
    ('capital_account',     'Capital Account',     'equity',    false),
    ('loans_liability',     'Loans (Liability)',   'liability', false),
    ('current_liabilities', 'Current Liabilities', 'liability', false),
    ('suspense',            'Suspense A/c',        'liability', false),
    ('fixed_assets',        'Fixed Assets',        'asset',     false),
    ('investments',         'Investments',         'asset',     false),
    ('current_assets',      'Current Assets',      'asset',     false),
    ('sales_accounts',      'Sales Accounts',      'income',    true),
    ('direct_incomes',      'Direct Incomes',      'income',    true),
    ('indirect_incomes',    'Indirect Incomes',    'income',    false),
    ('purchase_accounts',   'Purchase Accounts',   'expense',   true),
    ('direct_expenses',     'Direct Expenses',     'expense',   true),
    ('indirect_expenses',   'Indirect Expenses',   'expense',   false)
  ) as x(code, name, nature, gp);

  -- Sub-groups: (code, name, parent code)
  for g in
    select * from (values
      ('reserves_surplus',  'Reserves & Surplus',       'capital_account'),
      ('secured_loans',     'Secured Loans',            'loans_liability'),
      ('unsecured_loans',   'Unsecured Loans',          'loans_liability'),
      ('bank_od',           'Bank OD A/c',              'loans_liability'),
      ('duties_taxes',      'Duties & Taxes',           'current_liabilities'),
      ('provisions',        'Provisions',               'current_liabilities'),
      ('sundry_creditors',  'Sundry Creditors',         'current_liabilities'),
      ('bank_accounts',     'Bank Accounts',            'current_assets'),
      ('cash_in_hand',      'Cash-in-Hand',             'current_assets'),
      ('deposits',          'Deposits (Asset)',         'current_assets'),
      ('loans_advances',    'Loans & Advances (Asset)', 'current_assets'),
      ('stock_in_hand',     'Stock-in-Hand',            'current_assets'),
      ('sundry_debtors',    'Sundry Debtors',           'current_assets')
    ) as x(code, name, parent)
  loop
    insert into account_groups (org_id, code, name, nature, affects_gross_profit, is_system, parent_id)
    select p_org, g.code, g.name, pg.nature, pg.affects_gross_profit, true, pg.id
      from account_groups pg where pg.org_id = p_org and pg.code = g.parent;
  end loop;

  -- System ledgers: (code, name, group code)
  insert into ledgers (org_id, code, name, group_id, is_system)
  select p_org, x.code, x.name, ag.id, true
  from (values
    ('cash',        'Cash',               'cash_in_hand'),
    ('capital',     'Capital',            'capital_account'),
    ('sales',       'Sales',              'sales_accounts'),
    ('purchase',    'Purchase',           'purchase_accounts'),
    ('output_cgst', 'Output CGST',        'duties_taxes'),
    ('output_sgst', 'Output SGST',        'duties_taxes'),
    ('output_igst', 'Output IGST',        'duties_taxes'),
    ('input_cgst',  'Input CGST',         'duties_taxes'),
    ('input_sgst',  'Input SGST',         'duties_taxes'),
    ('input_igst',  'Input IGST',         'duties_taxes'),
    ('round_off',   'Round Off',          'indirect_expenses'),
    ('discount',    'Discount Allowed',   'indirect_expenses'),
    ('rent',        'Rent',               'indirect_expenses'),
    ('salary',      'Salary',             'indirect_expenses'),
    ('electricity', 'Electricity',        'indirect_expenses')
  ) as x(code, name, grp)
  join account_groups ag on ag.org_id = p_org and ag.code = x.grp;

  insert into units (org_id, symbol, name, decimals) values
    (p_org, 'pcs', 'Pieces', 0),
    (p_org, 'kg',  'Kilogram', 3),
    (p_org, 'g',   'Gram', 0),
    (p_org, 'l',   'Litre', 3),
    (p_org, 'ml',  'Millilitre', 0),
    (p_org, 'box', 'Box', 0),
    (p_org, 'pkt', 'Packet', 0),
    (p_org, 'm',   'Metre', 2),
    (p_org, 'doz', 'Dozen', 0);
end $$;
