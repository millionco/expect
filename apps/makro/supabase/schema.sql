create table if not exists countries (
    iso_code text primary key,
    name text not null,
    currency_code text not null
);

create table if not exists sources (
    source_code text primary key,
    source_name text not null,
    source_type text not null,
    base_url text not null,
    is_primary_source boolean not null default false,
    reliability_score numeric(5, 2) not null check (reliability_score >= 0 and reliability_score <= 100),
    notes text not null default ''
);

create table if not exists indicators (
    id bigserial primary key,
    indicator_code text not null unique,
    indicator_name text not null,
    category text not null,
    frequency text not null,
    unit text not null,
    value_type text not null,
    seasonal_adjustment text not null,
    base_year text,
    description_short text not null,
    description_long text not null,
    formula_text text not null,
    interpretation_text text not null,
    learner_note text not null,
    analyst_note text not null,
    expert_note text not null
);

create table if not exists indicator_components (
    id bigserial primary key,
    indicator_id bigint not null references indicators(id) on delete cascade,
    component_code text not null,
    component_name text not null,
    parent_component_id bigint references indicator_components(id) on delete set null,
    description text not null,
    sort_order integer not null default 0,
    unique (indicator_id, component_code)
);

create index if not exists indicators_category_index on indicators (category);
create index if not exists indicators_frequency_index on indicators (frequency);
create index if not exists sources_source_type_index on sources (source_type);
create index if not exists indicator_components_indicator_id_sort_order_index
    on indicator_components (indicator_id, sort_order);
