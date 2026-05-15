-- lotto_results: stores all lottery draw results
create table if not exists lotto_results (
  id serial primary key,
  round integer unique not null,
  draw_date text not null,
  num1 smallint,
  num2 smallint,
  num3 smallint,
  num4 smallint,
  num5 smallint,
  num6 smallint,
  bonus1 smallint,
  bonus2 smallint,
  first_prize_winners integer,
  first_prize_amount bigint,
  created_at timestamptz default now()
);

-- lotto_conditions: stores condition-based extraction results
create table if not exists lotto_conditions (
  id serial primary key,
  condition_text text,
  num1 smallint,
  num2 smallint,
  num3 smallint,
  num4 smallint,
  num5 smallint,
  num6 smallint,
  created_at timestamptz default now()
);

-- lotto_predicted: stores predicted numbers from Section 3
create table if not exists lotto_predicted (
  id serial primary key,
  num1 smallint,
  num2 smallint,
  num3 smallint,
  num4 smallint,
  num5 smallint,
  num6 smallint,
  created_at timestamptz default now()
);
